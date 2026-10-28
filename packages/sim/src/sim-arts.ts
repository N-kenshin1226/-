import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { artDefs, balance, enemies, weapons } from "@trace/content";
import {
  combatIntent,
  combatResult,
  combatTurn,
  enhancedEnemy,
  startCombat,
  usableArts,
  type CombatAction,
  type CombatConfig,
  type CombatPlayer,
  type CombatState,
  type EnemyDef,
  type MiniGameCtx,
} from "@trace/core";
import { k03Data } from "./config.js";
import { thresholds } from "./thresholds.js";

/**
 * pnpm sim:arts — 武技・資源・構成（K-02）のバランスCIゲート
 * （docs/devin_tasks/K-02_arts.md 受け入れ基準、docs/09 §3・§5〜6）。
 *
 * 実際の戦闘エンジン（startCombat / turn / combatResult）をシードを変えて
 * 何度も回し、次を採点する：
 *   1. 格上の敵に対し、複数の構成がそれぞれ勝ち筋を持つ（1つの構成に偏らない）
 *   2. 使われない武技がない（構成に組み込んだ技はどこかの戦況で撃たれる）
 *   3. 連打では格上に勝てない（attack だけの手は勝率が低い）
 */

/* ── 戦闘の設定（game.ts/sim の stepConfig と同じ注入） ── */
const COMBAT: CombatConfig = {
  ...balance.combat,
  weapons: Object.fromEntries(weapons.weapons.map((w) => [w.id, w])),
  links: balance.links,
  /**
   * 武技（K-02＋K-03）：定義表は解決済みの全技（進化形・合成産物・ユニーク含む）。
   * 構成の方針とカバレッジ採点は公開の素の技（artDefs）だけを対象にする ——
   * 派生・特別な技は習得経路のバランスではなく本編の出来事なので混ぜない
   */
  arts: { defs: k03Data().defs, ...balance.arts },
};
const ARTS = balance.arts;
const WEAPON_DEFS = COMBAT.weapons ?? {};

function toEnemyDef(id: string): EnemyDef {
  const e = enemies.enemies.find((x) => x.id === id);
  if (e === undefined) throw new Error(`敵 ${id} が enemies.json にない`);
  return {
    id: e.id,
    name: e.name,
    hp: e.hp,
    intervalTicks: e.intervalTicks,
    challenge: e.challenge,
    agility: e.agility,
    ...(e.beast === true ? { beast: true as const } : {}),
    attack: e.attack,
    moves: e.moves,
    pattern: e.pattern,
    ...(e.resist !== undefined ? { resist: e.resist } : {}),
    ...(e.statusResist !== undefined ? { statusResist: e.statusResist } : {}),
    ...(e.parts !== undefined ? { parts: [...e.parts] } : {}),
  };
}

/* ── シムのプレイヤー（修行中の腕利き。武器技能は一律、格上の判定が揃うよう） ── */
const WEAPON_SKILL = 25;
const PLAYER_STATS: Record<string, number> = {
  strength: 12,
  agility: 12,
  endurance: 14,
  spirit: 10,
};
const PLAYER_SKILLS: Record<string, { value: number }> = Object.fromEntries(
  [
    ...weapons.weapons.map((w) => [w.skill, WEAPON_SKILL] as const),
    ["evasion", 15] as const,
    ["observation", 25] as const,
    ["footwork", 12] as const,
    ["mana", 10] as const,
  ].map(([k, v]) => [k, { value: v }]),
);
/** 習得済み技（シムは戦闘バランスを見るもの。全部 Lv3 で覚えている想定） */
const LEARNED: Record<string, { lv: number }> = Object.fromEntries(
  Object.keys(artDefs).map((id) => [id, { lv: 3 }]),
);

interface Build {
  id: string;
  label: string;
  /** 構えの本命（build.weapons[0]） */
  weapon: string;
  slots: (string | null)[];
  passives: (string | null)[];
  weapons: (string | null)[];
}

/** 武器ごとの構成：その武器技能のアクティブ技を全部仕込む（8枠に収まる） */
function buildFor(weaponId: string): Build {
  const w = WEAPON_DEFS[weaponId];
  if (w === undefined) throw new Error(`武器 ${weaponId} がない`);
  const actives = Object.values(artDefs)
    .filter((a) => a.skill === w.skill && a.kind !== "passive")
    .sort((a, b) => (a.learn.at ?? Infinity) - (b.learn.at ?? Infinity))
    .map((a) => a.id);
  const slots: (string | null)[] = [
    ...actives.slice(0, ARTS.slots),
    ...Array<null>(Math.max(0, ARTS.slots - actives.length)).fill(null),
  ];
  // パッシブ：その技能のパッシブ＋回避・観察・足捌きの守り系を優先して4枠
  const passivePool = Object.values(artDefs)
    .filter((a) => a.kind === "passive")
    .sort((a, b) => {
      const own = (x: (typeof artDefs)[string]) => (x.skill === w.skill ? 0 : 1);
      return own(a) - own(b) || (a.learn.at ?? Infinity) - (b.learn.at ?? Infinity);
    })
    .map((a) => a.id);
  const passives: (string | null)[] = [
    ...passivePool.slice(0, ARTS.passiveSlots),
    ...Array<null>(Math.max(0, ARTS.passiveSlots - passivePool.length)).fill(null),
  ];
  return {
    id: `build:${weaponId}`,
    label: `${w.name}構成`,
    weapon: weaponId,
    slots,
    passives,
    weapons: [weaponId, null],
  };
}

/* ── 方針（ボット） ── */
type Policy = (s: CombatState, enemy: EnemyDef) => CombatAction;

/** 連打：攻撃ボタンだけを押し続ける手（「連打では格上に勝てない」の検証用） */
const spamPolicy: Policy = () => "attack";

/**
 * 武技ボット：予兆への対応→補助→攻撃技の順に考える決定的な方針。
 * - 予兆がこの行動の間合い（CT）の先〜直後に発動するなら対応技を回す
 *   （割り込み・受け流し・回避・鉄壁を持っているものから順に試す = 全部の対応技が撃たれる）
 * - 補助技（煙玉・油壺）は開幕の間合いで1回ずつ
 * - 攻撃技は高威力から順に巡回。気力が尽きれば通常攻撃に下る
 */
function makeArtPolicy(): Policy {
  let supportUsed = new Set<string>();
  return (s, enemy) => {
    // スロット入りの技（気力の可否で絞らない —— 回転させて全部の技に機会を作る）
    const slotted = usableArts(s, COMBAT);
    const intent = combatIntent(s, enemy, COMBAT);
    // 大技の予兆が立っているなら対応技を回す（割り込み＞受け流し＞回避＞鉄壁）。
    // dueIn === -1 は「読めない予兆」（観察不足）：見切って間合いを掴んでから応じる
    if (intent.telegraph !== null) {
      const dueIn = intent.telegraph.dueIn;
      const order = ["interrupt", "parry", "evade", "guard"] as const;
      const responses = order
        .map((r) =>
          slotted.filter(
            (a) => a.def.kind === "response" && a.def.response === r && a.def.ki <= s.playerKi,
          ),
        )
        .flat();
      if (responses.length === 0) return "defend";
      if (dueIn === -1) {
        // 間合いが読めない予兆：割り込みは時限に関わらず大技を潰せるので最優先。
        // 構え系は「行動が完了するまで」しか持たないため、読めなくても
        // 構えておくのが応じ方（発動はたいていこの行動の間合いに来る）
        const interrupt = responses.find((r) => r.def.response === "interrupt");
        if (interrupt !== undefined) return { type: "art", id: interrupt.def.id };
        return { type: "art", id: responses[s.turn % responses.length]!.def.id };
      }
      // 読める予兆：構えの窓（行動が完了する tick まで）が発動を覆うもの＋割り込み
      const covered = responses.filter(
        (r) => r.def.response === "interrupt" || dueIn <= s.playerCt * r.def.ct,
      );
      if (covered.length > 0) {
        return { type: "art", id: covered[s.turn % covered.length]!.def.id };
      }
      // まだ間合いの先：削りに回る（予兆は次の手で対応する）
    }
    const support = slotted.find(
      (a) => a.def.kind === "support" && !supportUsed.has(a.def.id) && a.def.ki <= s.playerKi,
    );
    if (support !== undefined && s.turn <= 2) {
      supportUsed = new Set(supportUsed).add(support.def.id);
      return { type: "art", id: support.def.id };
    }
    const atks = slotted.filter((a) => a.def.kind === "attack");
    if (atks.length === 0) return "attack";
    // まだこの戦闘で撃っていない技を優先（技を試すプレイヤー）。尽きたらスロット順に巡回。
    // 未使用の中では高気力の技から試す：奥義（大消費）は気力のあるうちに
    // 撃たないと試合が終わって出番を逃す（消耗が激しい敵ほど後の番ほど撃てない）
    const used = new Set(s.uses.map((u) => u.id).filter((x): x is string => x !== undefined));
    const fresh = atks
      .filter((a) => !used.has(a.def.id) && a.def.ki <= s.playerKi)
      .sort((a, b) => b.def.ki - a.def.ki)[0];
    if (fresh !== undefined) return { type: "art", id: fresh.def.id };
    const start = s.turn % atks.length;
    for (let i = 0; i < atks.length; i++) {
      const pick = atks[(start + i) % atks.length]!;
      if (pick.def.ki <= s.playerKi) return { type: "art", id: pick.def.id };
    }
    return "attack";
  };
}

/* ── 1戦を回す ── */
interface FightResult {
  won: boolean;
  fled: boolean;
  died: boolean;
  ticks: number;
  kiLeft: number;
  kiMax: number;
  uses: { id?: string; skill: string; tags: string[] }[];
}

function fight(build: Build, enemy: EnemyDef, seed: string, policy: Policy): FightResult {
  const player: CombatPlayer = {
    stats: PLAYER_STATS,
    skills: PLAYER_SKILLS,
    weapon: build.weapon,
    weapons: build.weapons.filter((w): w is string => w !== null),
    arts: LEARNED,
    build: { slots: build.slots, passives: build.passives, weapons: build.weapons },
  };
  let s = startCombat(enemy, COMBAT, player);
  const ctx: MiniGameCtx = { skill: WEAPON_SKILL, seed };
  let guard = 0;
  while (!s.done && guard++ < 200) {
    s = combatTurn(s, policy(s, enemy), enemy, COMBAT, ctx);
  }
  const r = combatResult(s);
  return { ...r, ticks: s.tick, kiMax: s.playerKiMax };
}

/* ── ゲート本体 ── */
export function runArts(): number {
  const t = thresholds.arts;
  // 格上の目安：enemy.challenge − 武器技能 ≥ 15（combat の foe.stronger と同じ線）。
  // 主力は「強個体」（T-44、balance.combat.unique で強化した最強種）——
  // 素の最強種では連打も半分勝ててしまうので、連打が通じない格上として強化版を使う
  const strongest = enemies.enemies.reduce((a, b) => (a.challenge >= b.challenge ? a : b));
  const primary =
    COMBAT.unique !== undefined
      ? {
          ...enhancedEnemy(toEnemyDef(strongest.id), COMBAT.unique),
          name: `強個体${strongest.name}`,
        }
      : toEnemyDef(strongest.id);
  // もう1体（素の最強種。違う耐性・行動の相手で、補助・対応・連撃の揺れを別の角度で試す）
  const secondary = toEnemyDef(
    enemies.enemies
      .filter((e) => e.id !== primary.id && e.challenge - WEAPON_SKILL >= 0)
      .sort((a, b) => b.challenge - a.challenge)[0]?.id ?? primary.id,
  );

  const builds: Build[] = weapons.weapons
    .map((w) => w.id)
    .filter((id) => id !== "staff") // 杖は魔法技能の武器（M-01 領域。武技構成の対象外）
    .map(buildFor);

  console.log(
    `== sim:arts (構成 ${builds.length}種 × ${t.runs}戦。格上: ${primary.name} / 準格上: ${secondary.name}) ==`,
  );

  const fails: { metric: string; detail: string }[] = [];
  const usedArtIds = new Set<string>();
  const buildRows: {
    id: string;
    winRate: number;
    kiSpent: number;
    artsUsed: number;
  }[] = [];

  /* 指標1・2：構成ごとの勝率と、全技の使用カバレッジ */
  for (const b of builds) {
    let wins = 0;
    let kiSpent = 0;
    const artsUsed = new Set<string>();
    for (let i = 0; i < t.runs; i++) {
      for (const enemy of [primary, secondary] as const) {
        const r = fight(b, enemy, `sim-arts:${b.weapon}:${enemy.id}:${i}`, makeArtPolicy());
        for (const u of r.uses) {
          if (u.id !== undefined) {
            artsUsed.add(u.id);
            usedArtIds.add(u.id);
          }
        }
        kiSpent += r.kiMax - r.kiLeft;
        if (r.won && enemy.id === primary.id) wins++;
      }
    }
    const winRate = wins / t.runs;
    buildRows.push({
      id: b.weapon,
      winRate,
      kiSpent: kiSpent / (t.runs * 2),
      artsUsed: artsUsed.size,
    });
    console.log(
      `  ${b.label.padEnd(6)} 勝率 ${(winRate * 100).toFixed(0).padStart(3)}% （格上${primary.name}） 技使用 ${artsUsed.size}種 気力消費 ${(kiSpent / (t.runs * 2)).toFixed(1)}/戦`,
    );
  }

  const winning = buildRows.filter((r) => r.winRate >= t.minBuildWinRate);
  if (winning.length < t.minWinningBuilds) {
    fails.push({
      metric: "複数構成の勝ち筋",
      detail: `格上に勝率 ${(t.minBuildWinRate * 100).toFixed(0)}% 以上の構成が ${winning.length} 種（基準 ≥${t.minWinningBuilds}）`,
    });
  }

  const actives = Object.values(artDefs).filter((a) => a.kind !== "passive");
  const coverage = actives.filter((a) => usedArtIds.has(a.id)).length / actives.length;
  const unused = actives.filter((a) => !usedArtIds.has(a.id)).map((a) => a.id);
  if (coverage < t.minArtCoverage) {
    fails.push({
      metric: "使われない武技",
      detail: `アクティブ技の使用率 ${(coverage * 100).toFixed(0)}%（基準 ≥${(t.minArtCoverage * 100).toFixed(0)}%） 未使用: ${unused.join(",")}`,
    });
  }
  console.log(
    `  技カバレッジ ${(coverage * 100).toFixed(0)}% （${actives.length} 種中 ${usedArtIds.size} 種使用）`,
  );

  /* 指標3：連打では格上に勝てない */
  let spamWins = 0;
  const spamBuild = builds[0]!;
  for (let i = 0; i < t.runs; i++) {
    const r = fight(spamBuild, primary, `sim-arts:spam:${i}`, spamPolicy);
    if (r.won) spamWins++;
  }
  const spamRate = spamWins / t.runs;
  const spamPass = spamRate <= t.spamMaxWinRate;
  console.log(
    `  ${spamPass ? "✓" : "✗"} 連打の格上勝率 ${(spamRate * 100).toFixed(0)}% （基準 ≤${(t.spamMaxWinRate * 100).toFixed(0)}%）`,
  );
  if (!spamPass) {
    fails.push({
      metric: "連打では格上に勝てない",
      detail: `attack のみの勝率 ${(spamRate * 100).toFixed(0)}%（基準 ≤${(t.spamMaxWinRate * 100).toFixed(0)}%）`,
    });
  }

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "../out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "arts.json"),
    JSON.stringify({ enemy: primary.id, builds: buildRows, coverage, unused }, null, 2),
  );
  console.log(`  詳細: packages/sim/out/arts.json`);

  if (fails.length > 0) {
    console.log(`\n${fails.length} 件の指標が基準を割りました`);
    for (const f of fails) console.log(`  ✗ ${f.metric}: ${f.detail}`);
    return 1;
  }
  console.log("\nすべての指標が合格");
  return 0;
}
