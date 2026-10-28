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
import type { MagicConfig } from "../magic/index.js";

/* ── M-01：戦闘の呪文（docs/09 §4〜6。詠唱・中断・相性・見取り稽古） ── */

const MAGIC: MagicConfig = {
  aptitudeMean: 0.5,
  aptitudeSpread: 0.4,
  aptitudePowerBase: 0.7,
  aptitudePowerScale: 0.6,
  powerBase: 6,
  powerPerSkill: 0.5,
  powerPerSpirit: 0.4,
  castPerSkill: 0.3,
  castMin: 4,
  interruptBase: 0.5,
  interruptPerManaSkill: 0.006,
  interruptMin: 0.05,
  interruptMax: 0.8,
  manaRegenPerTick: 0.05,
  interactions: [
    { id: "shock", primer: "wet", strike: "wind", damage: 1.4, status: "shock", consume: true },
    {
      id: "enflame",
      primer: "oil",
      strike: "fire",
      damage: 1.45,
      status: "burn",
      consume: true,
    },
    { id: "shatter", primer: "frozen", strike: "blunt", damage: 1.7, consume: true },
    { id: "fan", primer: "burn", strike: "wind", damage: 1.3, extend: 8, consume: false },
  ],
  lifeWorkKinds: [],
  enchant: { smithing: 30, fireMagic: 25, mana: 20, maxLevel: 3, atkPerLevel: 0.08 },
};

const artDefs: Record<string, ArtDef> = {
  sp_bolt: {
    id: "sp_bolt",
    name: "火矢",
    skill: "fire_magic",
    learn: { at: 4 },
    kind: "attack",
    power: 1.4,
    ki: 0,
    ct: 1,
    spell: { element: "fire", tier: "novice", mana: 5, cast: 10 },
    desc: "",
  },
  sp_soak: {
    id: "sp_soak",
    name: "濡らし",
    skill: "water_magic",
    learn: { at: 4 },
    kind: "support",
    status: { id: "wet", chance: 1, ticks: 30, power: 1 },
    ki: 0,
    ct: 1,
    spell: { element: "water", tier: "novice", mana: 4, cast: 8 },
    desc: "",
  },
  sp_gale: {
    id: "sp_gale",
    name: "疾風",
    skill: "wind_magic",
    learn: { at: 8 },
    kind: "attack",
    power: 1.0,
    ki: 0,
    ct: 1,
    spell: { element: "wind", tier: "novice", mana: 6, cast: 10 },
    desc: "",
  },
  sp_frost: {
    id: "sp_frost",
    name: "凍結",
    skill: "water_magic",
    learn: { at: 12 },
    kind: "support",
    status: { id: "frozen", chance: 1, ticks: 30, power: 1 },
    ki: 0,
    ct: 1,
    spell: { element: "water", tier: "adept", mana: 9, cast: 12 },
    desc: "",
  },
  sp_heal: {
    id: "sp_heal",
    name: "癒し",
    skill: "cure",
    learn: { at: 4 },
    kind: "heal",
    ki: 0,
    ct: 1,
    spell: { element: "cure", tier: "novice", mana: 6, cast: 8, heal: 1 },
    desc: "",
  },
  s_slash: {
    id: "s_slash",
    name: "薙ぎ払い",
    skill: "swordplay",
    learn: { at: 4 },
    kind: "attack",
    power: 1.2,
    dtype: "slash",
    ki: 3,
    ct: 1,
    desc: "",
  },
  s_crush: {
    id: "s_crush",
    name: "砕き",
    skill: "swordplay",
    learn: { at: 4 },
    kind: "attack",
    power: 1.2,
    dtype: "blunt",
    ki: 3,
    ct: 1,
    desc: "",
  },
  pa_instant: {
    id: "pa_instant",
    name: "無詠唱",
    skill: "mana",
    learn: { at: 40 },
    kind: "passive",
    ki: 0,
    ct: 0,
    effect: { hook: "instantCast", value: 1 },
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
  hitBase: 0.95,
  hitPerWeaponSkill: 0.002,
  hitPerAgilityDiff: 0.012,
  hitMin: 0.45,
  hitMax: 0.98,
  varianceMin: 0.95,
  varianceMax: 1.05,
  critBase: 0,
  critPerWeaponSkill: 0,
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
  },
  arts: ARTS,
  magic: MAGIC,
};

/** 間合いの長いおとなしい敵（詠唱の完了を見届けられる） */
const wolf: EnemyDef = {
  id: "wolf",
  name: "狼",
  hp: 500,
  intervalTicks: 40,
  challenge: 15,
  agility: 5,
  attack: { id: "bite", name: "咬みつき", power: 1 },
  moves: {},
  pattern: [{ type: "attack" }],
  resist: { magic: 1 },
};

/** 呪文を唱える敵（見取り稽古の相手） */
const mage: EnemyDef = {
  id: "hedge_mage",
  name: "辻魔道士",
  hp: 300,
  intervalTicks: 30,
  challenge: 32,
  agility: 10,
  attack: { id: "staff", name: "杖打ち", power: 1 },
  moves: {
    dark_bolt: { id: "dark_bolt", name: "闇の矢", power: 5, spell: "sp_shadow_bolt" },
  },
  pattern: [{ type: "attack" }, { type: "telegraph", move: "dark_bolt", ticks: 12 }],
  resist: { magic: 0.7 },
};

const CTX = { skill: 0, seed: "magic-test" };

const mkPlayer = (
  build?: Partial<CombatPlayer["build"]>,
  extra?: Partial<CombatPlayer>,
): CombatPlayer => ({
  stats: { strength: 10, endurance: 10, agility: 8, dexterity: 0, perception: 0, spirit: 20 },
  skills: {
    swordplay: { value: 20 },
    fire_magic: { value: 20 },
    water_magic: { value: 20 },
    wind_magic: { value: 20 },
    cure: { value: 10 },
    mana: { value: 10 },
    evasion: { value: 0 },
    observation: { value: 0 },
  },
  weapon: "sword",
  weapons: ["sword"],
  ki: 35,
  mana: 39, // manaMaxOf(spirit 20) = 15+24
  arts: Object.fromEntries(Object.keys(artDefs).map((id) => [id, { lv: 3 }])),
  aptitude: { fire: 0.7, water: 0.6, wind: 0.6, cure: 0.5 },
  build: {
    slots: ["sp_bolt", "sp_soak", "sp_gale", "sp_frost", "sp_heal", "s_slash", "s_crush", null],
    passives: [null, null, null, null],
    weapons: ["sword"],
    ...build,
  },
  ...extra,
});

describe("M-01 呪文の詠唱と発動", () => {
  it("呪文は魔力を消費し、詠唱の終わる拍に playerSpell で発動する", () => {
    let s = startCombat(wolf, cfg, mkPlayer());
    const mana0 = s.playerMana;
    const hp0 = s.enemyHp;
    s = turn(s, { type: "art", id: "sp_bolt" }, wolf, cfg, CTX);
    const cast = s.log.find((e) => e.type === "playerCast");
    const spell = s.log.find((e) => e.type === "playerSpell");
    expect(cast).toBeDefined();
    expect(spell).toBeDefined();
    expect(spell!.damage).toBeGreaterThan(0);
    expect(s.enemyHp).toBeLessThan(hp0);
    // 消費した魔力が残る（回復分を差し引いても mana0 未満）
    expect(s.playerMana).toBeLessThan(mana0);
    // 使用記録に呪文タグ（spell/el.fire/tier.novice）が残る
    const u = s.uses[s.uses.length - 1]!;
    expect(u.id).toBe("sp_bolt");
    expect(u.tags).toContain("spell");
    expect(u.tags).toContain("el.fire");
  });

  it("魔力が足りない呪文は playerArtFail で空費する", () => {
    let s = startCombat(wolf, cfg, mkPlayer(undefined, { mana: 2 }));
    s = turn(s, { type: "art", id: "sp_bolt" }, wolf, cfg, CTX);
    expect(s.log.some((e) => e.type === "playerArtFail")).toBe(true);
    expect(s.log.some((e) => e.type === "playerSpell")).toBe(false);
  });

  it("呪文は武器の構えに関係なく唱えられる（剣士のまま放つ）", () => {
    const s = startCombat(wolf, cfg, mkPlayer());
    const usable = usableArts(s, cfg).map((a) => a.def.id);
    // 剣の技と呪文が同じスロットに並ぶ（usableArts は呪文を武器技能で絞らない）
    expect(usable).toContain("sp_bolt");
    expect(usable).toContain("s_slash");
  });

  it("instantCast パッシブなら唱え始めと同じ拍に発動する", () => {
    let s = startCombat(wolf, cfg, mkPlayer({ passives: ["pa_instant", null, null, null] }));
    s = turn(s, { type: "art", id: "sp_bolt" }, wolf, cfg, CTX);
    const cast = s.log.find((e) => e.type === "playerCast");
    const spell = s.log.find((e) => e.type === "playerSpell");
    expect(cast).toBeDefined();
    expect(spell).toBeDefined();
    // 無詠唱：詠唱中の被弾で中断される窓が無い（castBroken は出ない）
    expect(s.log.some((e) => e.type === "castBroken")).toBe(false);
  });

  it("詠唱中の被弾は中断されうる（高い中断率なら途切れる）", () => {
    // 素早い敵で詠唱の途中に必ず攻撃を受け、中断率を 1 に固定する
    const quick: EnemyDef = { ...wolf, intervalTicks: 4, attack: { ...wolf.attack, power: 1 } };
    const always: MagicConfig = { ...MAGIC, interruptBase: 1, interruptMax: 1 };
    let s = startCombat(quick, { ...cfg, magic: always }, mkPlayer());
    s = turn(s, { type: "art", id: "sp_bolt" }, quick, { ...cfg, magic: always }, CTX);
    expect(s.log.some((e) => e.type === "castBroken")).toBe(true);
    expect(s.log.some((e) => e.type === "playerSpell" && e.art === "sp_bolt")).toBe(false);
    // 途切れても唱え始めに払った魔力は戻らない
    expect(s.playerMana).toBeLessThan(39);
  });

  it("回復呪文（kind:heal）は体力を塞ぐ", () => {
    let s = startCombat(wolf, cfg, mkPlayer());
    s = { ...s, playerHp: s.playerHp - 20 };
    s = turn(s, { type: "art", id: "sp_heal" }, wolf, cfg, CTX);
    const spell = s.log.find((e) => e.type === "playerSpell" && e.art === "sp_heal");
    expect(spell).toBeDefined();
    expect(spell!.heal).toBeGreaterThan(0);
  });
});

describe("M-01 属性の相性", () => {
  it("濡れ＋風（雷）＝感電：相性が発火し威力が伸びる", () => {
    // 濡らし→疾風の順で唱える。布石が立った次の一撃に reaction が載る
    let s = startCombat(wolf, cfg, mkPlayer());
    s = turn(s, { type: "art", id: "sp_soak" }, wolf, cfg, CTX);
    expect(s.enemyStatus.wet).toBeDefined();
    const hpBefore = s.enemyHp;
    s = turn(s, { type: "art", id: "sp_gale" }, wolf, cfg, CTX);
    const reaction = s.log.find((e) => e.type === "reaction" && e.reaction === "shock");
    expect(reaction).toBeDefined();
    // 感電が掛かり、濡れは消費される
    expect(s.enemyStatus.wet).toBeUndefined();
    expect(s.enemyStatus.shock).toBeDefined();
    expect(s.enemyHp).toBeLessThan(hpBefore);
  });

  it("凍結＋打撃＝砕く：武技の打撃でも相性が発火する", () => {
    let s = startCombat(wolf, cfg, mkPlayer());
    s = turn(s, { type: "art", id: "sp_frost" }, wolf, cfg, CTX);
    expect(s.enemyStatus.frozen).toBeDefined();
    s = turn(s, { type: "art", id: "s_crush" }, wolf, cfg, CTX);
    expect(s.log.some((e) => e.type === "reaction" && e.reaction === "shatter")).toBe(true);
    expect(s.enemyStatus.frozen).toBeUndefined();
  });

  it("風＋火＝火勢拡大：燃えている敵への風は燃焼を延ばす", () => {
    // 燃焼を直接掛けてから風を当てる（fan は consume:false で延長する）
    let s = startCombat(wolf, cfg, mkPlayer());
    s = {
      ...s,
      enemyStatus: { ...s.enemyStatus, burn: { until: s.tick + 40, power: 2 } },
    };
    const until0 = s.enemyStatus.burn!.until;
    s = turn(s, { type: "art", id: "sp_gale" }, wolf, cfg, CTX);
    expect(s.log.some((e) => e.type === "reaction" && e.reaction === "fan")).toBe(true);
    // 燃焼は消費されず延びる
    expect(s.enemyStatus.burn).toBeDefined();
    expect(s.enemyStatus.burn!.until).toBeGreaterThan(until0);
  });
});

describe("M-01 敵の呪文と見取り稽古", () => {
  it("敵の呪文は「詠唱」の予兆として出て、観察で spell.seen を得る", () => {
    let s = startCombat(mage, cfg, mkPlayer());
    // 観察して待つ：敵の間合いで詠唱が見え、発動を見届けると seenSpells に刻まれる
    for (let i = 0; i < 10 && !s.seenSpells.includes("sp_shadow_bolt"); i++) {
      s = turn(s, "observe", mage, cfg, CTX);
    }
    const tele = s.log.find((e) => e.type === "telegraph" && e.spell !== undefined);
    expect(tele).toBeDefined();
    expect(tele!.spell).toBe("sp_shadow_bolt");
    expect(s.seenSpells).toContain("sp_shadow_bolt");
    const r = combatResult(s);
    expect(r.seenSpells).toContain("sp_shadow_bolt");
    expect(r.manaLeft).toBeCloseTo(s.playerMana, 5);
  });

  it("観察していなければ敵の呪文は覚えられない", () => {
    let s = startCombat(mage, cfg, mkPlayer());
    s = turn(s, "attack", mage, cfg, CTX);
    s = turn(s, "attack", mage, cfg, CTX);
    s = turn(s, "attack", mage, cfg, CTX);
    // 詠唱は見えても、見届け（観察中の発動）なければ刻まれない
    expect(s.seenSpells).toHaveLength(0);
  });
});
