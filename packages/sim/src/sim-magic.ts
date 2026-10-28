import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "path";
import { fileURLToPath } from "node:url";
import { artDefs, balance, enemies, spellDefs, weapons } from "@trace/content";
import {
  combatIntent,
  combatResult,
  combatTurn,
  elementAptitude,
  startCombat,
  usableArts,
  type CombatAction,
  type CombatConfig,
  type CombatPlayer,
  type CombatState,
  type EnemyDef,
  type MagicConfig,
  type MiniGameCtx,
} from "@trace/core";
import { k03Data } from "./config.js";
import { thresholds } from "./thresholds.js";

/**
 * pnpm sim:magic — 魔法（M-01、docs/09 §4〜5）のバランスCIゲート
 * （docs/devin_tasks/M-01_magic.md 受け入れ基準）。
 *
 * 実際の戦闘エンジンをシードを変えて回し、次を採点する：
 *   1. 魔法だけ・武技だけ・混成の3系統が、それぞれ通常の敵に勝てる
 *      （魔法が「もう1つの戦い方」として成立すること）
 *   2. 戦闘呪文が広く使われる（詠唱・消費・相性が仕事をしていること）
 *   3. 属性適性は主人公・NPCともに同じ分布から引かれる（平凡の主人公）
 */

/* ── 戦闘の設定（game.ts/sim の stepConfig と同じ注入） ── */
/** 公開の素の武技・呪文（構成の方針とカバレッジ採点の対象。K-03 の派生・特別な技は混ぜない） */
const ALL_DEFS = { ...artDefs, ...spellDefs };
const COMBAT: CombatConfig = {
  ...balance.combat,
  weapons: Object.fromEntries(weapons.weapons.map((w) => [w.id, w])),
  links: balance.links,
  /** 定義表は解決済みの全技（K-03 の進化形・合成産物・ユニーク含む） */
  arts: { defs: k03Data().defs, ...balance.arts },
  magic: balance.magic,
};
const MAGIC: MagicConfig = balance.magic;
const ARTS = balance.arts;

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

/* ── シムのプレイヤー ──
 * 腕利きの魔術師：魔法技能は一人前（25）、素の戦士と同じ強さの器。
 * 適性は出自シードからの決定的な引き（平凡の主人公 —— NPCと同じ分布） */
const MAGIC_SKILL = 25;
const WEAPON_SKILL = 25;
const SEED = "sim-magic";

const PLAYER_STATS: Record<string, number> = {
  strength: 12,
  agility: 12,
  endurance: 14,
  spirit: 14,
};
const PLAYER_SKILLS: Record<string, { value: number }> = Object.fromEntries(
  [
    ...weapons.weapons.map((w) => [w.skill, WEAPON_SKILL] as const),
    ["fire_magic", MAGIC_SKILL] as const,
    ["water_magic", MAGIC_SKILL] as const,
    ["wind_magic", MAGIC_SKILL] as const,
    ["earth_magic", MAGIC_SKILL] as const,
    ["light_magic", MAGIC_SKILL] as const,
    ["dark_magic", MAGIC_SKILL] as const,
    ["void_magic", MAGIC_SKILL] as const,
    ["life_magic", MAGIC_SKILL] as const,
    ["cure", MAGIC_SKILL] as const,
    ["mana", 20] as const,
    ["evasion", 15] as const,
    ["observation", 25] as const,
    ["footwork", 12] as const,
  ].map(([k, v]) => [k, { value: v }]),
);
const LEARNED: Record<string, { lv: number }> = Object.fromEntries(
  Object.keys(ALL_DEFS).map((id) => [id, { lv: 3 }]),
);
/** この世界での主人公の適性（出自 smith_child の引き。特別ではない） */
const APTITUDE = Object.fromEntries(
  ["fire", "water", "wind", "earth", "light", "dark", "void", "life", "cure"].map(
    (el) => [el, elementAptitude(SEED, "origin:sim_mage", el as never, MAGIC)] as const,
  ),
) as CombatPlayer["aptitude"];

interface Build {
  id: string;
  label: string;
  weapon: string;
  slots: (string | null)[];
  passives: (string | null)[];
  weapons: (string | null)[];
}

function makeBuild(id: string, label: string, weapon: string, ids: string[]): Build {
  const slots: (string | null)[] = [
    ...ids.slice(0, ARTS.slots),
    ...Array<null>(Math.max(0, ARTS.slots - ids.length)).fill(null),
  ];
  return {
    id,
    label,
    weapon,
    slots,
    passives: [null, null, null, null],
    weapons: [weapon, null],
  };
}

/* 武技構成（sword のアクティブ技全部） */
const swordArts = Object.values(artDefs)
  .filter((a) => a.skill === "swordplay" && a.kind !== "passive")
  .sort((a, b) => (a.learn.at ?? Infinity) - (b.learn.at ?? Infinity))
  .map((a) => a.id);

/** 戦闘呪文（attack/heal/support。life・passive はスロットに入らない） */
const combatSpells = Object.values(spellDefs).filter(
  (s) => s.kind === "attack" || s.kind === "heal" || s.kind === "support",
);

/** 属性系の呪文（learn 順）。枠に収まるよう系ごとに分ける */
const spellsOf = (...els: string[]) =>
  combatSpells
    .filter((s) => els.includes(s.spell?.element ?? ""))
    .sort((a, b) => (a.learn.at ?? Infinity) - (b.learn.at ?? Infinity))
    .map((s) => s.id);

const builds: Build[] = [
  makeBuild("martial", "武技だけ", "sword", swordArts),
  // 魔法系は杖（mana 技能の武器）＋属性ごとの呪文セット。
  // 枠は8つなので属性系を分け、回復呪文は各構成に散らして全部に出番を作る
  makeBuild("mage-fire", "魔法だけ（火癒）", "staff", [
    ...spellsOf("fire"),
    "sp_heal",
    "sp_cure_wounds",
  ]),
  makeBuild("mage-water", "魔法だけ（水癒）", "staff", [...spellsOf("water"), "sp_full_heal"]),
  makeBuild("mage-wind", "魔法だけ（風無）", "staff", spellsOf("wind", "void")),
  makeBuild("mage-earth", "魔法だけ（土光）", "staff", spellsOf("earth", "light")),
  makeBuild("mage-dark", "魔法だけ（闇）", "staff", spellsOf("dark")),
  makeBuild("mixed", "混成（剣＋火水）", "sword", [
    ...swordArts.slice(0, 4),
    ...spellsOf("fire", "water").slice(0, 4),
  ]),
];

/* ── 方針（ボット） ── */
type Policy = (s: CombatState, enemy: EnemyDef) => CombatAction;

/**
 * 魔法ボット：布石→打ち手→回復の順に考える決定的な方針。
 * - 回復呪文：体力が半分を割ったら癒す
 * - 補助呪文（濡らし・油・凍結などの布石）はまだ掛かっていなければ先に撃つ
 * - 攻撃呪文はまだ撃っていないものを優先して巡回（全部の呪文に機会を作る）。
 *   魔力が尽きれば通常攻撃に下る
 * - 予兆が立てば防御（詠唱の中断を避けつつ凌ぐ）
 */
/** 戦ごとの決定的な起点（シード文字列 → 整数） */
function seedOffset(key: string): number {
  let h = 7;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function makeSpellPolicy(offset: number): Policy {
  return (s, enemy) => {
    const intent = combatIntent(s, enemy, COMBAT);
    if (intent.telegraph !== null && intent.telegraph.dueIn !== -1) {
      if (intent.telegraph.dueIn <= s.playerCt) return "defend";
    }
    const slotted = usableArts(s, COMBAT).filter(
      (a) => a.def.spell !== undefined && a.def.spell.mana <= s.playerMana,
    );
    const used = new Set(s.uses.map((u) => u.id).filter((x): x is string => x !== undefined));
    // 回復：傷が半分を割ったら癒し系を唱える。未使用の回復呪文は
    // 浅い傷（9割未満）でも試す —— どの回復呪文にも唱える機会を作る
    const heals = slotted.filter((a) => a.def.kind === "heal");
    const tryHeal = heals.find((h) => !used.has(h.def.id));
    if (
      heals.length > 0 &&
      (s.playerHp <= s.playerHpMax / 2 ||
        (tryHeal !== undefined && s.playerHp < s.playerHpMax * 0.9))
    ) {
      return { type: "art", id: (tryHeal ?? heals[0]!).def.id };
    }
    // 布石：まだ撃っていない補助呪文を撃つ（相性コンボの起点）
    const support = slotted.find(
      (a) =>
        a.def.kind === "support" &&
        a.def.status !== undefined &&
        !used.has(a.def.id) &&
        s.enemyStatus[a.def.status.id] === undefined,
    );
    if (support !== undefined && s.turn <= 4) return { type: "art", id: support.def.id };
    // 攻撃呪文：撃っていないものを優先。起点は戦ごとに回す
    // （毎回同じ順で選ぶと上位の呪文ばかり撃って下位に出番が来ない）
    const atks = slotted.filter((a) => a.def.kind === "attack");
    if (atks.length === 0) return "attack";
    const fresh = atks
      .filter((a) => !used.has(a.def.id))
      .sort((a, b) => (b.def.power ?? 1) - (a.def.power ?? 1));
    if (fresh.length > 0) return { type: "art", id: fresh[offset % fresh.length]!.def.id };
    const pick = atks[s.turn % atks.length]!;
    return { type: "art", id: pick.def.id };
  };
}

/** 武技ボット（sim-arts と同じく対応→攻撃技の順。対応技を持たない構成は防御） */
function makeMartialPolicy(): Policy {
  return (s, enemy) => {
    const intent = combatIntent(s, enemy, COMBAT);
    if (intent.telegraph !== null) return "defend";
    const atks = usableArts(s, COMBAT).filter(
      (a) => a.def.kind === "attack" && a.def.spell === undefined && a.def.ki <= s.playerKi,
    );
    if (atks.length === 0) return "attack";
    const used = new Set(s.uses.map((u) => u.id).filter((x): x is string => x !== undefined));
    const fresh = atks.find((a) => !used.has(a.def.id));
    return { type: "art", id: (fresh ?? atks[s.turn % atks.length]!).def.id };
  };
}

/** 混成ボット：魔力があるうちは呪文、尽きたら武技（詠唱と剣を往復する） */
function makeMixedPolicy(offset: number): Policy {
  const spell = makeSpellPolicy(offset);
  const martial = makeMartialPolicy();
  return (s, enemy) => {
    const hasSpell = usableArts(s, COMBAT).some(
      (a) => a.def.spell !== undefined && a.def.spell.mana <= s.playerMana,
    );
    return hasSpell ? spell(s, enemy) : martial(s, enemy);
  };
}

/* ── 1戦を回す ── */
interface FightResult {
  won: boolean;
  died: boolean;
  ticks: number;
  manaLeft: number;
  uses: { id?: string; skill: string; tags: string[] }[];
  spellsUsed: number;
  reactions: number;
}

function fight(build: Build, enemy: EnemyDef, seed: string, policy: Policy): FightResult {
  const player: CombatPlayer = {
    stats: PLAYER_STATS,
    skills: PLAYER_SKILLS,
    weapon: build.weapon,
    weapons: build.weapons.filter((w): w is string => w !== null),
    arts: LEARNED,
    aptitude: APTITUDE,
    build: { slots: build.slots, passives: build.passives, weapons: build.weapons },
  };
  let s = startCombat(enemy, COMBAT, player);
  const ctx: MiniGameCtx = { skill: WEAPON_SKILL, seed };
  let guard = 0;
  while (!s.done && guard++ < 300) {
    s = combatTurn(s, policy(s, enemy), enemy, COMBAT, ctx);
  }
  const r = combatResult(s);
  const spellUses = r.uses.filter((u) => u.tags.includes("spell"));
  return {
    won: r.won,
    died: r.died,
    ticks: s.tick,
    manaLeft: r.manaLeft ?? 0,
    uses: [...r.uses],
    spellsUsed: new Set(spellUses.map((u) => u.id)).size,
    reactions: s.log.filter((e) => e.type === "reaction").length,
  };
}

/* ── ゲート本体 ── */
export function runMagic(): number {
  const t = thresholds.magic;
  // 「普通の敵」：狩場・街道の常連（魔導士たちは格上。魔法でも武技でも
  // 普通の獣・賊に勝てなければ「もう1つの戦い方」として成立しない）
  const ordinary = enemies.enemies
    .filter((e) => e.area !== "abyss" && !Object.values(e.moves).some((m) => m.spell !== undefined))
    .map((e) => toEnemyDef(e.id));
  if (ordinary.length === 0) throw new Error("通常の敵が見つからない");

  console.log(`== sim:magic (構成 ${builds.length}種 × 敵${ordinary.length} × ${t.runs}戦) ==`);

  const fails: { metric: string; detail: string }[] = [];
  const usedSpellIds = new Set<string>();
  const policyFor = (id: string, seed: string): Policy => {
    const offset = seedOffset(seed);
    return id === "martial"
      ? makeMartialPolicy()
      : id === "mixed"
        ? makeMixedPolicy(offset)
        : makeSpellPolicy(offset);
  };

  const rows: { id: string; winRate: number; spellsUsed: number; reactions: number }[] = [];
  for (const b of builds) {
    let wins = 0;
    let fights = 0;
    const spells = new Set<string>();
    let reactions = 0;
    for (let i = 0; i < t.runs; i++) {
      for (const enemy of ordinary) {
        const r = fight(
          b,
          enemy,
          `${SEED}:${b.id}:${enemy.id}:${i}`,
          policyFor(b.id, `${b.id}:${enemy.id}:${i}`),
        );
        fights++;
        if (r.won) wins++;
        reactions += r.reactions;
        for (const u of r.uses) {
          if (u.id !== undefined && u.tags.includes("spell")) {
            spells.add(u.id);
            usedSpellIds.add(u.id);
          }
        }
      }
    }
    const winRate = wins / fights;
    rows.push({ id: b.id, winRate, spellsUsed: spells.size, reactions });
    console.log(
      `  ${b.label.padEnd(14)} 勝率 ${(winRate * 100).toFixed(0).padStart(3)}% 呪文使用 ${spells.size}種 相性発火 ${reactions}回`,
    );
  }

  /* 指標1：3系統とも通常の敵に勝てる */
  for (const [id, label] of [
    ["martial", "武技だけ"],
    ["mixed", "混成"],
  ] as const) {
    const row = rows.find((r) => r.id === id)!;
    if (row.winRate < t.minWinRate) {
      fails.push({
        metric: `${label}の戦い方が成立する`,
        detail: `${label}の通常敵への勝率 ${(row.winRate * 100).toFixed(0)}%（基準 ≥${(t.minWinRate * 100).toFixed(0)}%）`,
      });
    }
  }
  // 魔法だけ：3つの属性系のうち「どれかが勝てる」ではなく、どの系でも勝てること
  const mageRows = rows.filter((r) => r.id.startsWith("mage"));
  const mageWorst = Math.min(...mageRows.map((r) => r.winRate));
  if (mageWorst < t.minMageWinRate) {
    fails.push({
      metric: "魔法だけで戦える",
      detail: `魔法系構成の通常敵への最低勝率 ${(mageWorst * 100).toFixed(0)}%（基準 ≥${(t.minMageWinRate * 100).toFixed(0)}%）`,
    });
  }

  /* 指標2：戦闘呪文のカバレッジ */
  const spellIds = combatSpells.map((s) => s.id);
  const coverage = spellIds.filter((id) => usedSpellIds.has(id)).length / spellIds.length;
  const unused = spellIds.filter((id) => !usedSpellIds.has(id));
  console.log(
    `  呪文カバレッジ ${(coverage * 100).toFixed(0)}% （${spellIds.length} 種中 ${usedSpellIds.size} 種使用）`,
  );
  if (coverage < t.minSpellCoverage) {
    fails.push({
      metric: "使われる呪文",
      detail: `戦闘呪文の使用率 ${(coverage * 100).toFixed(0)}%（基準 ≥${(t.minSpellCoverage * 100).toFixed(0)}%） 未使用: ${unused.join(",")}`,
    });
  }

  /* 指標3：属性適性は主人公・NPCともに同じ分布（平凡の主人公） */
  const N = 200;
  const player: number[] = [];
  const npc: number[] = [];
  for (let i = 0; i < N; i++) {
    player.push(elementAptitude(SEED, `origin:o${i}`, "fire", MAGIC));
    npc.push(elementAptitude(SEED, `npc:n${i}`, "fire", MAGIC));
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const gap = Math.abs(mean(player) - mean(npc));
  console.log(
    `  適性の分布 主人公平均 ${mean(player).toFixed(3)} / NPC平均 ${mean(npc).toFixed(3)} （差 ${gap.toFixed(3)}、基準 ≤${t.aptMeanGap}）`,
  );
  if (gap > t.aptMeanGap) {
    fails.push({
      metric: "主人公は適性も平凡",
      detail: `出自とNPCの適性平均の差 ${gap.toFixed(3)}（基準 ≤${t.aptMeanGap}）`,
    });
  }

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "../out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "magic.json"),
    JSON.stringify({ builds: rows, coverage, unused, aptMeanGap: gap }, null, 2),
  );
  console.log(`  詳細: packages/sim/out/magic.json`);

  if (fails.length > 0) {
    console.log(`\n${fails.length} 件の指標が基準を割りました`);
    for (const f of fails) console.log(`  ✗ ${f.metric}: ${f.detail}`);
    return 1;
  }
  console.log("\nすべての指標が合格");
  return 0;
}
