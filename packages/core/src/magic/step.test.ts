import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";
import type { ArtDef } from "../arts/index.js";
import { enchantFactor, enchantLevel, lifeBuffKey, lifeBuffOf, type MagicConfig } from "./index.js";
import type { LifeConfig } from "../life/index.js";

/* ── M-01：世界に刻まれる魔法（lifeSpell・enchant・戦闘書き戻し、09 §4） ── */

const SKILL_IDS = [
  "mana",
  "fire_magic",
  "water_magic",
  "life_magic",
  "cure",
  "smithing",
  "cooking",
  "gathering",
];

const newGameCfg = { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 };

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
  lifeWorkKinds: [
    { hook: "smithBonus", kinds: ["smithing"] },
    { hook: "farmBonus", kinds: ["farming"] },
    { hook: "alchemyBonus", kinds: ["alchemy", "brewing", "medicine"] },
  ],
  enchant: { smithing: 30, fireMagic: 25, mana: 20, maxLevel: 3, atkPerLevel: 0.08 },
};

const lifeSpell = (
  id: string,
  name: string,
  hook: string,
  value: number,
  transform?: { from: string; to: string; n: number },
  learn?: ArtDef["learn"],
): ArtDef => ({
  id,
  name,
  skill: "life_magic",
  learn: learn ?? { at: 0 },
  kind: "life",
  ki: 0,
  ct: 1,
  spell: {
    element: "life",
    tier: "novice",
    mana: 6,
    cast: 1,
    life: { hook: hook as never, value, ...(transform !== undefined ? { transform } : {}) },
  },
  desc: "",
});

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
  sp_simmer: lifeSpell("sp_simmer", "火加減", "cookBonus", 15),
  sp_forge: lifeSpell("sp_forge", "炉の手伝い", "smithBonus", 12),
  sp_well: lifeSpell("sp_well", "水脈探し", "gatherBonus", 2),
  sp_lamp: lifeSpell("sp_lamp", "野営の灯", "campBonus", 0.2),
  sp_soothe: lifeSpell("sp_soothe", "癒しの手", "heal", 15),
  sp_dry: lifeSpell("sp_dry", "乾燥", "preserve", 0, { from: "herb", to: "dry.herb", n: 2 }),
  // 生活魔法を使い続けると覚える派生（learn.counter = spell.cast.life）
  sp_grand: lifeSpell("sp_grand", "恵み", "cookBonus", 30, undefined, {
    at: 0,
    counter: { key: "spell.cast.life", gte: 3 },
  }),
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

const lifeCfg: LifeConfig = {
  towns: { ardi: { name: "アルディ" } },
  journeys: [],
  stroll: { town: [], road: [] },
  gather: {
    forest: {
      skill: "gathering",
      difficulty: 15,
      entries: [{ item: "herb", weight: 1, n: [1, 1] }],
    },
  },
  recipes: [
    {
      id: "meal.stew",
      name: "シチュー",
      inputs: { herb: 1 },
      out: "meal.stew",
      skill: "cooking",
      difficulty: 30,
    },
  ],
  market: { stock: [], sellFactor: 0.5, buyFactor: 1.2, townFactor: {} },
  gamble: { stakes: [5], winFactor: 2 },
  social: { talk: { bond: 5 }, drink: { cost: 8, bond: 10 }, gift: { bondPerPrice: 0.5, cap: 15 } },
  errands: [],
  mealSleepFactor: 0.004,
  praySleepBonus: 0.08,
  campQuality: 0.55,
  gatherDraws: 1,
  errandPerDay: 0,
  marketJitter: 0,
  bondRespectMin: 40,
  bondMax: 100,
  prayDifficulty: 20,
  gambleWinChance: 0.45,
  gambleDifficulty: 25,
  cookQualityBase: 45,
};

const itemDefs = {
  herb: { id: "herb", name: "薬草", kind: "gather" as const, price: 6 },
  "dry.herb": { id: "dry.herb", name: "乾いた薬草", kind: "material" as const, price: 10 },
  "meal.stew": { id: "meal.stew", name: "シチュー", kind: "meal" as const, price: 14, food: 30 },
};

const cfg: StepConfig = {
  time: {
    actionsPerDay: 5,
    timeOfDay: ["morning", "morning", "noon", "evening", "night"],
    daysPerWeek: 7,
    daysPerSeason: 28,
    seasonsPerYear: 4,
    moonCycleDays: 28,
    moonPhaseWindowDays: 1,
    startAge: 15,
  },
  actionLogMax: 50,
  gain: {
    base: { work: 1.0, combat: 1.5, lifeSpell: 1.0, cook: 2.4, gather: 2.0 },
    challengePoints: [
      [-20, 0.05],
      [0, 1.0],
      [10, 1.6],
      [30, 0],
    ],
    challengeTrainCap: 0.6,
    noveltyK: 1.0,
    noveltyWindow: 10,
    failMultiplier: 0.6,
    modifierCap: 2.5,
    diminishBase: 110,
    diminishExponent: 1.5,
    fatigueScale: 0.8,
  },
  sleep: {
    nightlyCapPerSkill: 8.0,
    nightlyCapTotal: 999,
    innFactors: { cheap: 0.8, normal: 1.0, good: 1.15 },
    dinnerFactors: { withDinner: 1.1, noDinner: 0.85 },
    qualityMin: 0.6,
    qualityMax: 1.2,
    potentialDecayPerPoint: 0.01,
  },
  tailwind: {
    defs: [],
    tailwindFactor: 1.3,
    headwindFactor: 0.8,
    recentDays: 3,
    headwindBiasK: 1.5,
    tailwindBoostK: 0.5,
    drawMin: 1,
    drawMax: 2,
  },
  ledger: {
    basePricePerQuality: 2,
    marketWindowDays: 7,
    marketDecayPerWork: 0.9,
    tierUpBonusPending: 8,
  },
  combat: {
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
    hitBase: 0.86,
    hitPerWeaponSkill: 0.002,
    hitPerAgilityDiff: 0.012,
    hitMin: 0.45,
    hitMax: 0.98,
    varianceMin: 0.8,
    varianceMax: 1.25,
    critBase: 0.08,
    critPerWeaponSkill: 0.002,
    critFactor: 1.8,
    enemyCritBase: 0.05,
    enemyCritFactor: 1.6,
    evadeBase: 0.06,
    evadePerEvasion: 0.004,
    evadePerAgilityDiff: 0.008,
    evadeMax: 0.7,
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
  },
  body: {
    fatiguePerAction: { work: 8, lifeSpell: 3, enchant: 5, cook: 6, gather: 10, combat: 12 },
    fatigueDefaultPerAction: 2,
    fatigueRecover: 60,
    statLoadPerAction: {},
    statGainPerLoad: 0.05,
    overloadThreshold: 15,
    overworkStreakDays: 3,
    overworkConsolidateFactor: 0.5,
    restQuality: 0.9,
    restPotentialRecover: 3,
    potentialMax: 100,
  },
  society: { standings: [], professions: [], lifeGoals: [], goalRewardFactor: 1 },
  lore: { atoms: [], connections: [] },
  titles: [],
  life: lifeCfg,
  items: itemDefs,
  arts: ARTS,
  magic: MAGIC,
};

/** 生活魔法を覚えた状態の旅立ち */
function game(seed = "magic-1", arts: Record<string, { lv: number }> = {}): GameState {
  const g = newGame(seed, "テスト", { ...newGameCfg, arts: ARTS });
  g.player.arts = {
    sp_bolt: { lv: 2, exp: 0, pending: 0 },
    sp_simmer: { lv: 1, exp: 0, pending: 0 },
    sp_forge: { lv: 1, exp: 0, pending: 0 },
    sp_well: { lv: 1, exp: 0, pending: 0 },
    sp_lamp: { lv: 1, exp: 0, pending: 0 },
    sp_soothe: { lv: 1, exp: 0, pending: 0 },
    sp_dry: { lv: 1, exp: 0, pending: 0 },
    ...arts,
  };
  g.player.mana = 39; // manaMaxOf(spirit 10) = 15+12=27 → 上限に揃える
  return g;
}

const learned = (id: string) => (s: GameState) => s.player.arts[id]?.lv ?? 0;

describe("M-01 生活魔法（lifeSpell）", () => {
  it("覚えた生活魔法は魔力を払って唱え、次の行動に効く窓が畳まれる", () => {
    const g = game();
    const mana0 = g.player.mana;
    const r = step(g, { type: "lifeSpell", id: "sp_simmer" }, cfg);
    expect(r.state.player.mana).toBeLessThan(mana0);
    expect(r.state.counters[lifeBuffKey("cookBonus")]).toBe(15);
    // 使用の刻印（派生が覚える条件が読む）
    expect(r.state.counters["spell.cast.sp_simmer"]).toBe(1);
    expect(r.state.counters["spell.cast.life"]).toBe(1);
    expect(r.state.counters["spell.cast.el.life"]).toBe(1);
    expect(r.events.some((e) => e.type === "magicCast" && e.id === "sp_simmer")).toBe(true);
    // 行動を消費する
    expect(r.events.some((e) => e.type === "actionPerformed" && e.kind === "lifeSpell")).toBe(true);
  });

  it("覚えていない呪文・魔力の足りない呪文は唱えられない", () => {
    const g = game();
    const none = step(g, { type: "lifeSpell", id: "sp_grand" }, cfg);
    expect(none.events.some((e) => e.type === "magicCast")).toBe(false);
    const poor = { ...g, player: { ...g.player, mana: 1 } };
    const dry = step(poor, { type: "lifeSpell", id: "sp_simmer" }, cfg);
    expect(dry.events.some((e) => e.type === "magicCast")).toBe(false);
  });

  it("火加減（cookBonus）が掛かった料理の出来が上がり、効果は消費される", () => {
    let g = game();
    g.life.items = { herb: 2 };
    g = step(g, { type: "lifeSpell", id: "sp_simmer" }, cfg).state;
    const r = step(g, { type: "cook", recipe: "meal.stew", quality: 50 }, cfg);
    const cooked = r.events.find((e) => e.type === "cooked");
    expect(cooked).toBeDefined();
    expect((cooked as { quality: number }).quality).toBe(65); // 50 + 15
    // 効果は一度きり —— 次の料理には乗らない
    expect(r.state.counters[lifeBuffKey("cookBonus")]).toBeUndefined();
  });

  it("炉の手伝い（smithBonus）は鍛冶の仕事の品質に乗る", () => {
    let g = game();
    g = step(g, { type: "lifeSpell", id: "sp_forge" }, cfg).state;
    const r = step(g, { type: "work", kind: "smithing", quality: 40 }, cfg);
    const rec = r.events.find((e) => e.type === "workRecorded");
    expect(rec).toBeDefined();
    const work = (rec as { work: { quality: number; flags?: string[] } }).work;
    expect(work.quality).toBe(52); // 40 + 12
    expect(work.flags).toContain("魔法仕上");
  });

  it("水脈探し（gatherBonus）は採集の引きを増やす", () => {
    let g = game();
    g = step(g, { type: "lifeSpell", id: "sp_well" }, cfg).state;
    const r = step(g, { type: "gather", place: "forest" }, cfg);
    // gatherDraws=1 の世界で 2以上引けている（効果+2 まで追加）
    const herbs = r.state.life.items["herb"] ?? 0;
    expect(herbs).toBeGreaterThan(1);
    expect(r.state.counters[lifeBuffKey("gatherBonus")]).toBeUndefined();
  });

  it("野営の灯（campBonus）は眠りに消費される", () => {
    let g = game();
    g = step(g, { type: "lifeSpell", id: "sp_lamp" }, cfg).state;
    expect(lifeBuffOf(g, "campBonus")).toBeCloseTo(0.2, 5);
    const r = step(g, { type: "rest" }, cfg);
    expect(r.state.counters[lifeBuffKey("campBonus")]).toBeUndefined();
  });

  it("癒しの手（heal）は即時に疲労を洗う", () => {
    let g = game();
    g = { ...g, player: { ...g.player, fatigue: 30 } };
    const r = step(g, { type: "lifeSpell", id: "sp_soothe" }, cfg);
    // 30 − 15（癒し）+ 行動の疲労（lifeSpell=3）= 18
    expect(r.state.player.fatigue).toBe(18);
  });

  it("乾燥（preserve）は持ち物を保存食に変える", () => {
    const g = game();
    g.life.items = { herb: 3 };
    const r = step(g, { type: "lifeSpell", id: "sp_dry" }, cfg);
    // 備考：fixture の sp_dry は herb ×2 → dry.herb ×2（transform の上限は所持数）
    expect(r.state.life.items["herb"]).toBe(1); // 3 − 2
    expect(r.state.life.items["dry.herb"]).toBe(2);
    expect(r.state.counters["spell.preserve.dry.herb"]).toBe(2);
  });

  it("生活魔法を使い続けると派生が覚える（learn.counter）", () => {
    let g = game();
    expect(learned("sp_grand")(g)).toBe(0);
    for (let i = 0; i < 3; i++) {
      const r = step(g, { type: "lifeSpell", id: "sp_simmer" }, cfg);
      g = r.state;
      if (i === 2) {
        expect(r.events.some((e) => e.type === "artLearned" && e.id === "sp_grand")).toBe(true);
      }
    }
    expect(learned("sp_grand")(g)).toBeGreaterThan(0);
  });
});

describe("M-01 付与（enchant）", () => {
  const smith = (g: GameState) => {
    g.player.skills["smithing"] = { ...g.player.skills["smithing"]!, value: 35, peak: 35 };
    g.player.skills["fire_magic"] = { ...g.player.skills["fire_magic"]!, value: 30, peak: 30 };
    return g;
  };

  it("鍛冶＋火魔法と魔力があれば武器に付与を刻める（1行動消費）", () => {
    const g = smith(game());
    const mana0 = g.player.mana;
    const r = step(g, { type: "enchant", weapon: "sword" }, cfg);
    expect(enchantLevel(r.state, "sword")).toBe(1);
    expect(r.state.player.mana).toBe(mana0 - 20);
    expect(r.events.some((e) => e.type === "enchanted" && e.level === 1)).toBe(true);
    // 付与の攻撃係数に畳まれる
    expect(enchantFactor(r.state, "sword", MAGIC)).toBeCloseTo(1.08, 5);
  });

  it("技能が足りなければ刻めない（鍛冶・火魔法の両方が要る）", () => {
    const g = game(); // 両方 0
    const r = step(g, { type: "enchant", weapon: "sword" }, cfg);
    expect(enchantLevel(r.state, "sword")).toBe(0);
    expect(r.events.some((e) => e.type === "enchanted")).toBe(false);
    // 行動も消費しない（失敗は起きない —— 要件を満たさないので何も起きない）
    expect(r.state.time).toEqual(g.time);
  });

  it("段の上限を超えては刻めない", () => {
    const g = smith(game());
    g.counters["enchant.sword"] = 3; // maxLevel
    const r = step(g, { type: "enchant", weapon: "sword" }, cfg);
    expect(enchantLevel(r.state, "sword")).toBe(3);
    expect(r.events.some((e) => e.type === "enchanted")).toBe(false);
  });
});

describe("M-01 戦闘の書き戻し（combat → world）", () => {
  it("残りの魔力・見取りの呪文・呪文の使用が世界に刻まれる", () => {
    const g = game();
    const r = step(
      g,
      {
        type: "combat",
        enemyId: "hedge_mage",
        difficulty: 32,
        won: true,
        manaLeft: 12.5,
        seenSpells: ["sp_shadow_bolt"],
        uses: [{ id: "sp_bolt", skill: "fire_magic", tags: ["spell", "el.fire", "tier.novice"] }],
      },
      cfg,
    );
    // 魔力は残量で書き戻される
    expect(r.state.player.mana).toBe(12.5);
    // 見取りの旗（この呪文を覚える条件が読む）
    expect(r.state.flags["spell.seen.sp_shadow_bolt"]).toBe(true);
    // 呪文の使用の刻印
    expect(r.state.counters["spell.cast.sp_bolt"]).toBe(1);
    expect(r.state.counters["spell.cast.el.fire"]).toBe(1);
    // 使った技に経験が入る
    expect(
      (r.state.player.arts["sp_bolt"]?.pending ?? 0) > 0 || r.state.player.arts["sp_bolt"],
    ).toBe(true);
    // 呪文の技能にも経験が入る
    expect(r.events.some((e) => e.type === "gainApplied" && e.skill === "fire_magic")).toBe(true);
  });

  it("見取りの旗は一度立てば二度目は積み増ししない", () => {
    let g = game();
    g = step(
      g,
      {
        type: "combat",
        enemyId: "hedge_mage",
        difficulty: 32,
        won: true,
        seenSpells: ["sp_shadow_bolt"],
      },
      cfg,
    ).state;
    const flags1 = g.flags;
    g = step(
      g,
      {
        type: "combat",
        enemyId: "hedge_mage",
        difficulty: 32,
        won: true,
        seenSpells: ["sp_shadow_bolt"],
      },
      cfg,
    ).state;
    expect(g.flags["spell.seen.sp_shadow_bolt"]).toBe(true);
    expect(g.flags).toEqual(flags1);
  });
});
