import { describe, expect, it } from "vitest";
import {
  combatResult,
  startCombat,
  turn,
  usableArts,
  type CombatConfig,
  type CombatPlayer,
  type EnemyDef,
} from "./index.js";
import { type ArtDef } from "../arts/index.js";

/* ── K-02：戦闘の武技・資源・状態異常・部位破壊（docs/09 §2〜3・§5〜6） ── */

const artDefs: Record<string, ArtDef> = {
  s_slash: {
    id: "s_slash",
    name: "薙ぎ払い",
    skill: "swordplay",
    learn: { at: 4 },
    kind: "attack",
    power: 1.2,
    dtype: "slash",
    part: "body",
    ki: 3,
    ct: 1.0,
    desc: "",
  },
  s_bleed: {
    id: "s_bleed",
    name: "裂傷",
    skill: "swordplay",
    learn: { at: 8 },
    kind: "attack",
    power: 0.8,
    dtype: "slash",
    part: "arms",
    ki: 4,
    ct: 1.0,
    // 確定で掛かる出血（テストを決定的にするため chance=1）
    status: { id: "bleed", chance: 1, ticks: 20, power: 2 },
    desc: "",
  },
  s_inter: {
    id: "s_inter",
    name: "断ち",
    skill: "swordplay",
    learn: { at: 10 },
    kind: "response",
    response: "interrupt",
    power: 0.6,
    dtype: "slash",
    ki: 4,
    ct: 0.8,
    desc: "",
  },
  s_parry: {
    id: "s_parry",
    name: "受け流し",
    skill: "swordplay",
    learn: { at: 12 },
    kind: "response",
    response: "parry",
    ki: 3,
    ct: 0.6,
    desc: "",
  },
  s_head: {
    id: "s_head",
    name: "兜割り",
    skill: "swordplay",
    learn: { at: 15 },
    kind: "attack",
    power: 1.5,
    dtype: "slash",
    part: "head",
    ki: 6,
    ct: 1.4,
    desc: "",
  },
  d_poison: {
    id: "d_poison",
    name: "毒塗り",
    skill: "dagger",
    learn: { at: 10 },
    kind: "attack",
    power: 0.5,
    dtype: "pierce",
    ki: 3,
    ct: 0.8,
    desc: "",
  },
  pa_ki: {
    id: "pa_ki",
    name: "気力増し",
    skill: "swordplay",
    learn: { at: 1 },
    kind: "passive",
    ki: 0,
    ct: 0,
    effect: { hook: "kiMax", value: 10 },
    desc: "",
  },
};

const ARTS = {
  defs: artDefs,
  slots: 8,
  passiveSlots: 4,
  weaponSlots: 2,
  kiBase: 20,
  kiPerEndurance: 1.5,
  kiRegenPerTick: 0.45,
  manaBase: 15,
  manaPerSpirit: 1.2,
  levelStep: 8,
  maxLevel: 10,
  levelPowerFactor: 0.04,
  levelStatusFactor: 0.08,
  expBase: 1,
  expChallengeFactor: 0.02,
  partBreakShare: 0.35,
  breakDamageFactor: 1.15,
  breakAgilityFactor: 0.5,
  breakMoveFactor: 0.5,
  breakStatusFactor: 1.5,
  staggerFactor: 1.15,
  parryFactor: 0.15,
  parryCounterFactor: 2.6,
  evadeArtBonus: 0.55,
  guardArtFactor: 0.25,
  styleShareMin: 0.15,
};

const cfg: CombatConfig = {
  baseHp: 30,
  hpPerEndurance: 2,
  attackBase: 5,
  attackPerWeaponSkill: 0.15,
  attackPerStrength: 0.2,
  ctBase: 12,
  ctPerAgility: 0.15,
  ctMin: 6,
  defendFactor: 0.5,
  fleeBase: 0.7,
  fleePerAgility: 0.02,
  observeBonus: 20,
  preciseObserve: 40,
  deathPendingFactor: 0.5,
  hitBase: 0.9,
  hitPerWeaponSkill: 0.002,
  hitPerAgilityDiff: 0.012,
  hitMin: 0.45,
  hitMax: 0.98,
  varianceMin: 0.9,
  varianceMax: 1.1,
  critBase: 0.08,
  critPerWeaponSkill: 0.002,
  critFactor: 1.8,
  enemyCritBase: 0,
  enemyCritFactor: 1.6,
  evadeBase: 0,
  evadePerEvasion: 0,
  evadePerAgilityDiff: 0,
  evadeMax: 0,
  readEvadeBonus: 0.5,
  guardTelegraphFactor: 0.15,
  counterFactor: 2.4,
  counterFactorRead: 2.8,
  openingTicks: 16,
  staggerTicks: 11,
  weapons: {
    sword: {
      id: "sword",
      name: "剣",
      skill: "swordplay",
      power: 6,
      ctFactor: 1,
      hitBonus: 0,
      critBonus: 0,
    },
    knife: {
      id: "knife",
      name: "短刀",
      skill: "dagger",
      power: 3,
      ctFactor: 0.8,
      hitBonus: 0,
      critBonus: 0,
    },
  },
  arts: ARTS,
};

const wolf: EnemyDef = {
  id: "wolf",
  name: "狼",
  hp: 60,
  intervalTicks: 10,
  challenge: 15,
  agility: 5,
  attack: { id: "bite", name: "咬みつき", power: 4 },
  moves: { pounce: { id: "pounce", name: "飛びかかり", power: 9 } },
  pattern: [
    { type: "attack" },
    { type: "attack" },
    { type: "telegraph", move: "pounce", ticks: 8 },
  ],
  resist: { slash: 0.5, pierce: 1.5 }, // 斬に強く突に弱い
};

const CTX = { skill: 0, seed: "arts-test" };

const mkPlayer = (build?: CombatPlayer["build"], extra?: Partial<CombatPlayer>): CombatPlayer => ({
  stats: { strength: 10, endurance: 10, agility: 8, dexterity: 0, perception: 0, spirit: 0 },
  skills: {
    swordplay: { value: 20 },
    dagger: { value: 15 },
    evasion: { value: 0 },
    observation: { value: 0 },
  },
  weapon: "sword",
  weapons: ["sword", "knife"],
  ki: 35, // kiMaxOf(endurance 10) = 20+15
  arts: Object.fromEntries(Object.keys(artDefs).map((id) => [id, { lv: 3 }])),
  build: build ?? {
    slots: ["s_slash", "s_bleed", "s_inter", "s_parry", "s_head", "d_poison", null, null],
    passives: ["pa_ki", null, null, null],
    weapons: ["sword", "knife"],
  },
  ...extra,
});

describe("K-02 武技の行動", () => {
  it("武技は気力を消費し命中すれば威力倍率の傷を与える", () => {
    let s = startCombat(wolf, cfg, mkPlayer());
    const ki0 = s.playerKi;
    const hp0 = s.enemyHp;
    s = turn(s, { type: "art", id: "s_slash" }, wolf, cfg, CTX);
    const art = s.log.find((e) => e.type === "playerArt");
    expect(art).toBeDefined();
    expect(art!.damage).toBeGreaterThan(0);
    // 消費した分だけ自然回復の伸びを下回る（安い技ほど持続する設計）
    expect(s.playerKi).toBeLessThan(ki0 + s.kiRegenPerTick * s.tick);
    // power 1.2 × slash耐性 0.5 が効いている
    expect(s.enemyHp).toBeLessThan(hp0);
    // 使用記録に id と狙い部位が残る
    const u = s.uses[s.uses.length - 1]!;
    expect(u.id).toBe("s_slash");
    expect(u.tags).toContain("aim.body");
  });

  it("スロットに無い技・他武器技能の技は playerArtFail で空費する", () => {
    let s = startCombat(wolf, cfg, mkPlayer());
    // d_poison は dagger の技 —— 剣装備では出せない
    s = turn(s, { type: "art", id: "d_poison" }, wolf, cfg, CTX);
    expect(s.log.some((e) => e.type === "playerArtFail")).toBe(true);
    // スロット外の技も出せない（s_slash を外した構成）
    const p = mkPlayer({
      slots: [null, null, null, null, null, null, null, null],
      passives: [],
      weapons: ["sword", null],
    });
    let s2 = startCombat(wolf, cfg, p);
    s2 = turn(s2, { type: "art", id: "s_slash" }, wolf, cfg, CTX);
    expect(s2.log.some((e) => e.type === "playerArtFail")).toBe(true);
  });

  it("気力が足りない技は出せない", () => {
    const p = mkPlayer(undefined, { ki: 2 });
    let s = startCombat(wolf, cfg, p);
    s = turn(s, { type: "art", id: "s_slash" }, wolf, cfg, CTX); // ki 3 必要
    expect(s.log.some((e) => e.type === "playerArtFail")).toBe(true);
    // 消費はされず、行動時間分の自然回復だけが乗る
    expect(s.playerKi).toBeLessThan(2 + 10);
    expect(s.playerKi).toBeGreaterThan(2);
  });

  it("経過 tick ごとに気力が戻る", () => {
    const p = mkPlayer(undefined, { ki: 0 });
    let s = startCombat(wolf, cfg, p);
    const ki0 = s.playerKi;
    s = turn(s, "attack", wolf, cfg, CTX);
    // 行動時間（CT 約 10tick）× kiRegenPerTick だけ戻る
    expect(s.playerKi).toBeGreaterThan(ki0);
  });

  it("状態異常：出血が掛かり継続ダメージが入る", () => {
    let s = startCombat(wolf, cfg, mkPlayer());
    s = turn(s, { type: "art", id: "s_bleed" }, wolf, cfg, CTX);
    expect(s.log.some((e) => e.type === "statusApplied" && e.status === "bleed")).toBe(true);
    expect(s.enemyStatus.bleed).toBeDefined();
    // 次の行動の間に出血ダメージが畳まれる
    const hp0 = s.enemyHp;
    s = turn(s, "defend", wolf, cfg, CTX);
    const tick = s.log.find((e) => e.type === "statusTick" && e.status === "bleed");
    expect(tick).toBeDefined();
    expect(tick!.damage).toBeGreaterThan(0);
    expect(s.enemyHp).toBeLessThanOrEqual(hp0 - 1);
  });

  it("部位破壊：狙った部位に蓄積し、しきい値を超えると壊れる", () => {
    let s = startCombat(wolf, cfg, mkPlayer());
    // 頭を狙う技をしきい値（hp60×0.35=21）まで打ち続ける
    let guard = 0;
    while (!s.brokenParts.includes("head") && !s.done && guard++ < 15) {
      s = turn(s, { type: "art", id: "s_head" }, wolf, cfg, CTX);
    }
    expect(s.brokenParts).toContain("head");
    expect(s.log.some((e) => e.type === "partBroken" && e.part === "head")).toBe(true);
  });

  it("耐性と弱点：斬技は耐性で削られ、弱点属性は増す", () => {
    const run = (id: string) => {
      let s = startCombat(wolf, cfg, mkPlayer());
      s = turn(s, { type: "art", id }, wolf, cfg, CTX);
      return s.log.find((e) => e.type === "playerArt")?.damage ?? 0;
    };
    // 同じ剣技でも、敵が弱点なら傷は深い（pierce 技は無いので基本攻撃との比較：
    // s_slash slash → 0.5倍。抵抗無しならもっと入る）
    const resisted = run("s_slash");
    const unresistWolf: EnemyDef = { ...wolf, resist: undefined };
    let s2 = startCombat(unresistWolf, cfg, mkPlayer());
    s2 = turn(s2, { type: "art", id: "s_slash" }, unresistWolf, cfg, CTX);
    const raw = s2.log.find((e) => e.type === "playerArt")?.damage ?? 0;
    expect(resisted).toBeLessThan(raw);
  });

  it("割り込みは予兆の大技を潰し体勢を崩す", () => {
    let s = startCombat(wolf, cfg, mkPlayer());
    while (!s.telegraph && !s.done) s = turn(s, "attack", wolf, cfg, CTX);
    if (!s.done) {
      expect(s.telegraph).not.toBeNull();
      s = turn(s, { type: "art", id: "s_inter" }, wolf, cfg, CTX);
      expect(s.telegraph).toBeNull();
      expect(s.log.some((e) => e.type === "interrupted")).toBe(true);
    }
  });

  it("受け流しは構え中の被弾をほぼ通さず、大技をいなせば隙が生まれる", () => {
    let s = startCombat(wolf, cfg, mkPlayer());
    while (!s.telegraph && !s.done) s = turn(s, "attack", wolf, cfg, CTX);
    if (!s.done) {
      const hp0 = s.playerHp;
      // 発動を行動の窓の中に置く（dueTick≤endTick で構えが確実に受ける）
      s = { ...s, telegraph: { ...s.telegraph!, dueTick: s.tick + 2 } };
      s = turn(s, { type: "art", id: "s_parry" }, wolf, cfg, CTX);
      // 予兆の飛びかかり（9）が受け流しで parryFactor（0.15）に
      const parried = s.log.find((e) => e.type === "parried");
      expect(parried).toBeDefined();
      expect(parried!.damage!).toBeLessThanOrEqual(Math.ceil(9 * 1.1 * 0.15) + 1);
      // 大技をいなした隙（反撃窓）が開く
      expect(s.openingUntil).toBeGreaterThan(0);
      expect(s.playerHp).toBeGreaterThanOrEqual(hp0 - 5);
    }
  });

  it("usableArts は装備中の武器技能の技だけ返す", () => {
    let s = startCombat(wolf, cfg, mkPlayer());
    const ids = usableArts(s, cfg).map((a) => a.def.id);
    expect(ids).toContain("s_slash");
    expect(ids).not.toContain("d_poison"); // dagger の技は剣では出せない
    // 短刀に持ち替えると dagger の技が出せるようになる
    s = turn(s, { type: "switch", weapon: "knife" }, wolf, cfg, CTX);
    const ids2 = usableArts(s, cfg).map((a) => a.def.id);
    expect(ids2).toContain("d_poison");
    expect(ids2).not.toContain("s_slash");
  });

  it("パッシブは常時効く（kiMax 増しで上限が上がる）", () => {
    const withPa = startCombat(wolf, cfg, mkPlayer());
    const without = startCombat(wolf, cfg, mkPlayer({ slots: [], passives: [], weapons: [] }));
    expect(withPa.playerKiMax).toBeGreaterThan(without.playerKiMax);
  });

  it("使用記録に状況タグが残る（格上・先制・連鎖・狙い部位）", () => {
    const strong = { ...wolf, challenge: 40 };
    let s = startCombat(strong, cfg, mkPlayer());
    s = turn(s, { type: "art", id: "s_slash" }, strong, cfg, CTX);
    s = turn(s, { type: "art", id: "s_bleed" }, strong, cfg, CTX);
    const first = s.uses[0]!;
    expect(first.tags).toContain("foe.stronger");
    expect(first.tags).toContain("first.strike");
    const second = s.uses[1]!;
    expect(second.tags).toContain("chain.s_slash");
    expect(second.tags).toContain("aim.arms");
  });

  it("combatResult は残り気力と使用記録を返す", () => {
    let s = startCombat(wolf, cfg, mkPlayer());
    while (!s.done && s.turn < 30) {
      s = turn(s, { type: "art", id: "s_slash" }, wolf, cfg, CTX);
    }
    const r = combatResult(s);
    expect(r.kiLeft).toBeLessThanOrEqual(s.playerKiMax);
    expect(r.uses.length).toBeGreaterThan(0);
    expect(r.uses.every((u) => u.tags.length > 0)).toBe(true);
  });
});
