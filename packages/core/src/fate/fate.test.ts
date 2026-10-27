import { describe, expect, it } from "vitest";
import { worldFactor, worldMods, withWorldMods, type TendencyDefs, type VowDef } from "./index.js";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import type { EnemyDef } from "../combat/index.js";

/**
 * 運命の傾向（T-45）と誓約（T-46）の単体＋step 統合テスト（docs/06 §3C）。
 * 係数はテスト内で定義し、content（balance.json / vows.json）には依存しない
 */

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing"];
const newGameCfg = { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 };

/** content の形に倣ったテスト用の傾向定義 */
const tendencyDefs: TendencyDefs = {
  calm: {},
  war: { enemyHpFactor: 1.15, enemyPowerFactor: 1.1, combatGainFactor: 1.25, innCostFactor: 0.9 },
  famine: { rewardFactor: 0.75, innCostFactor: 1.3, restPotentialFactor: 0.5 },
};

/** vows.json に倣ったテスト用の誓約定義（1誓約=1効果） */
const vowDefs: VowDef[] = [
  { id: "vow.iron_hide", mods: { enemyHpFactor: 1.25 } },
  { id: "vow.bare_purse", mods: { rewardFactor: 0.8 } },
  { id: "vow.dear_bed", mods: { innCostFactor: 1.5 } },
  { id: "vow.slow_mend", mods: { restPotentialFactor: 0.5 } },
  { id: "vow.windless", mods: { noTailwind: true } },
];

const baseCfg: StepConfig = {
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
  actionLogMax: 5,
  gain: {
    base: { train: 1.0 },
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
    innCost: { cheap: 8, normal: 20, good: 40 },
  },
  tailwind: {
    // 追い風しか出ない定義：noTailwind の誓約で翌日の風が空になることを確実に見る
    defs: [
      { id: "w1", label: "w1", target: { kind: "skill", id: "swordplay" }, direction: "tailwind" },
      { id: "w2", label: "w2", target: { kind: "skill", id: "evasion" }, direction: "tailwind" },
    ],
    tailwindFactor: 1.3,
    headwindFactor: 0.8,
    recentDays: 3,
    headwindBiasK: 1.5,
    tailwindBoostK: 0.5,
    drawMin: 1,
    drawMax: 2,
  },
  body: {
    fatiguePerAction: { wait: 1, train: 6 },
    fatigueDefaultPerAction: 2,
    fatigueRecover: 60,
    statLoadPerAction: { train: { strength: 2, endurance: 2, dexterity: 1 } },
    statGainPerLoad: 0.05,
    overloadThreshold: 15,
    overworkStreakDays: 3,
    overworkConsolidateFactor: 0.5,
    restQuality: 0.9,
    restPotentialRecover: 3,
    potentialMax: 100,
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
  },
  society: { standings: [], professions: [], lifeGoals: [], goalRewardFactor: 1 },
  lore: { atoms: [], connections: [] },
  titles: [],
};

const cfg: StepConfig = { ...baseCfg, tendency: tendencyDefs, vows: vowDefs };

describe("worldMods", () => {
  it("定義が省略される（旧 cfg）とすべて中立", () => {
    const g = newGame("fate-0", "t", { ...newGameCfg, tendency: "war", vows: ["vow.iron_hide"] });
    const m = worldMods(g);
    expect(worldFactor(m, "enemyHpFactor")).toBe(1);
    expect(worldFactor(m, "rewardFactor")).toBe(1);
    expect(m.noTailwind).toBeUndefined();
  });

  it("calm は中立（どの係数も 1）", () => {
    const g = newGame("fate-1", "t", { ...newGameCfg, tendency: "calm" });
    const m = worldMods(g, tendencyDefs, vowDefs);
    expect(worldFactor(m, "enemyHpFactor")).toBe(1);
    expect(worldFactor(m, "innCostFactor")).toBe(1);
    expect(worldFactor(m, "restPotentialFactor")).toBe(1);
    expect(m.noTailwind).toBeUndefined();
  });

  it("war は敵・報酬軸に乗る（敵HP↑・攻撃↑・狩り経験↑・宿は安い）", () => {
    const g = newGame("fate-2", "t", { ...newGameCfg, tendency: "war" });
    const m = worldMods(g, tendencyDefs, vowDefs);
    expect(worldFactor(m, "enemyHpFactor")).toBeCloseTo(1.15);
    expect(worldFactor(m, "enemyPowerFactor")).toBeCloseTo(1.1);
    expect(worldFactor(m, "combatGainFactor")).toBeCloseTo(1.25);
    expect(worldFactor(m, "innCostFactor")).toBeCloseTo(0.9);
    expect(worldFactor(m, "rewardFactor")).toBe(1);
  });

  it("famine は生活軸に乗る（宿代↑・報酬↓・素質回復↓）", () => {
    const g = newGame("fate-3", "t", { ...newGameCfg, tendency: "famine" });
    const m = worldMods(g, tendencyDefs, vowDefs);
    expect(worldFactor(m, "innCostFactor")).toBeCloseTo(1.3);
    expect(worldFactor(m, "rewardFactor")).toBeCloseTo(0.75);
    expect(worldFactor(m, "restPotentialFactor")).toBeCloseTo(0.5);
  });

  it("誓約は積んだ数だけ係数で重なり、取っていない誓約は効かない", () => {
    const g = newGame("fate-4", "t", {
      ...newGameCfg,
      vows: ["vow.iron_hide", "vow.dear_bed"],
    });
    const m = worldMods(g, tendencyDefs, vowDefs);
    expect(worldFactor(m, "enemyHpFactor")).toBeCloseTo(1.25);
    expect(worldFactor(m, "innCostFactor")).toBeCloseTo(1.5);
    // 取っていない誓約は中立
    expect(worldFactor(m, "rewardFactor")).toBe(1);
    expect(m.noTailwind).toBeUndefined();
  });

  it("傾向と誓約は積で重なる（war 1.15 × iron_hide 1.25）", () => {
    const g = newGame("fate-5", "t", {
      ...newGameCfg,
      tendency: "war",
      vows: ["vow.iron_hide"],
    });
    const m = worldMods(g, tendencyDefs, vowDefs);
    expect(worldFactor(m, "enemyHpFactor")).toBeCloseTo(1.15 * 1.25);
  });

  it("noTailwind は OR（1つでも積めば追い風なし）", () => {
    const g = newGame("fate-6", "t", { ...newGameCfg, vows: ["vow.windless"] });
    expect(worldMods(g, tendencyDefs, vowDefs).noTailwind).toBe(true);
  });
});

describe("withWorldMods", () => {
  const enemy: EnemyDef = {
    id: "wolf",
    name: "狼",
    hp: 20,
    intervalTicks: 8,
    challenge: 10,
    agility: 5,
    attack: { id: "bite", name: "噛みつき", power: 5 },
    moves: { rush: { id: "rush", name: "突進", power: 9 } },
    pattern: [{ type: "attack" }],
  };

  it("敵HPと技威力を係数で丸める。パターン・間隔はそのまま", () => {
    const e = withWorldMods(enemy, { enemyHpFactor: 1.25, enemyPowerFactor: 1.1 });
    expect(e.hp).toBe(25);
    expect(e.attack.power).toBe(6); // 5*1.1=5.5 → 6
    expect(e.moves.rush?.power).toBe(10); // 9*1.1=9.9 → 10
    expect(e.intervalTicks).toBe(8);
    expect(e.pattern).toEqual(enemy.pattern);
  });

  it("係数 1 なら同じ定義をそのまま返す", () => {
    expect(withWorldMods(enemy, {})).toBe(enemy);
  });
});

describe("step への適用（T-45/T-46）", () => {
  it("war：戦闘経験が combatGainFactor 倍になる", () => {
    const calm = newGame("fate-s1", "t", { ...newGameCfg, tendency: "calm" });
    const war = newGame("fate-s1", "t", { ...newGameCfg, tendency: "war" });
    const cmd = { type: "combat", enemyId: "wolf", difficulty: 20, won: true } as const;
    const rCalm = step(calm, cmd, cfg);
    const rWar = step(war, cmd, cfg);
    const g = (evs: typeof rCalm.events, skill: string) =>
      evs.find((e) => e.type === "gainApplied" && e.skill === skill);
    const calmAmt = g(rCalm.events, "swordplay");
    const warAmt = g(rWar.events, "swordplay");
    expect(calmAmt?.type).toBe("gainApplied");
    expect(warAmt?.type).toBe("gainApplied");
    if (calmAmt?.type === "gainApplied" && warAmt?.type === "gainApplied") {
      expect(warAmt.amount).toBeCloseTo(calmAmt.amount * 1.25, 6);
    }
  });

  it("famine：宿代が innCostFactor 倍になる（宿代 20G → 26G）", () => {
    const mk = (tendency: "calm" | "famine") =>
      newGame("fate-s2", "t", { ...newGameCfg, initialMoney: 100, tendency });
    const calm = step(mk("calm"), { type: "sleep", inn: "normal", dinner: false }, cfg);
    const famine = step(mk("famine"), { type: "sleep", inn: "normal", dinner: false }, cfg);
    expect(calm.state.player.money).toBe(80);
    expect(famine.state.player.money).toBe(74); // 20*1.3=26
  });

  it("famine：仕事の報酬が rewardFactor 倍になる", () => {
    const mk = (tendency: "calm" | "famine") =>
      newGame("fate-s3", "t", { ...newGameCfg, initialMoney: 0, tendency });
    const cmd = { type: "work", kind: "smithing", quality: 50, rewardMoney: 40 } as const;
    expect(step(mk("calm"), cmd, cfg).state.player.money).toBe(40);
    expect(step(mk("famine"), cmd, cfg).state.player.money).toBe(30); // 40*0.75
  });

  it("vow.bare_purse：報酬が 0.8 倍になる", () => {
    const mk = (vows: string[]) =>
      newGame("fate-s4", "t", { ...newGameCfg, initialMoney: 0, vows });
    const cmd = { type: "work", kind: "smithing", quality: 50, rewardMoney: 40 } as const;
    expect(step(mk([]), cmd, cfg).state.player.money).toBe(40);
    expect(step(mk(["vow.bare_purse"]), cmd, cfg).state.player.money).toBe(32);
  });

  it("vow.dear_bed：宿代が 1.5 倍になる（20G → 30G）", () => {
    const mk = (vows: string[]) =>
      newGame("fate-s5", "t", { ...newGameCfg, initialMoney: 100, vows });
    const cmd = { type: "sleep", inn: "normal", dinner: false } as const;
    expect(step(mk([]), cmd, cfg).state.player.money).toBe(80);
    expect(step(mk(["vow.dear_bed"]), cmd, cfg).state.player.money).toBe(70);
  });

  it("vow.slow_mend：休養日の素質回復が半分になる", () => {
    // 素質を上限より下げて回復量を観測する（行動0回で寝る＝休養日）
    const mk = (vows: string[]) => {
      const g = newGame("fate-s6", "t", { ...newGameCfg, vows });
      const skills = {
        ...g.player.skills,
        swordplay: { ...g.player.skills.swordplay!, potential: 50 },
      };
      return { ...g, player: { ...g.player, skills } };
    };
    const calm = step(mk([]), { type: "rest" }, cfg).state;
    const vow = step(mk(["vow.slow_mend"]), { type: "rest" }, cfg).state;
    // restPotentialRecover=3 → calm は +3、誓約ありは +1.5
    expect(calm.player.skills.swordplay?.potential).toBeCloseTo(53);
    expect(vow.player.skills.swordplay?.potential).toBeCloseTo(51.5);
  });

  it("vow.windless：翌日の追い風（tailwind 方向）が出ない", () => {
    const mk = (vows: string[]) => newGame("fate-s7", "t", { ...newGameCfg, vows });
    const normal = step(mk([]), { type: "rest" }, cfg).state;
    const vowed = step(mk(["vow.windless"]), { type: "rest" }, cfg).state;
    // 定義は追い風しかないので、誓約なしは1〜2本、ありは必ず空
    expect(normal.today.winds.length).toBeGreaterThan(0);
    expect(normal.today.winds.every((w) => w.direction === "tailwind")).toBe(true);
    expect(vowed.today.winds).toEqual([]);
  });

  it("vow.iron_hide：敵が withWorldMods で強くなる（HP 1.25 倍）", () => {
    const g = newGame("fate-s8", "t", { ...newGameCfg, vows: ["vow.iron_hide"] });
    const m = worldMods(g, cfg.tendency, cfg.vows);
    const enemy: EnemyDef = {
      id: "wolf",
      name: "狼",
      hp: 20,
      intervalTicks: 8,
      challenge: 10,
      agility: 5,
      attack: { id: "bite", name: "噛みつき", power: 5 },
      moves: {},
      pattern: [{ type: "attack" }],
    };
    expect(withWorldMods(enemy, m).hp).toBe(25);
  });

  it("誓約を積むと旗が立ち、誓約称号の条件（flag＋counter）が最初の step で評価されうる", () => {
    // 誓約称号は「vow.taken.<id> の旗 + 一季節（28日）生きた」で解除。
    // 旗は newGame で立つので、条件DSL側からは読める形になっている
    const g = newGame("fate-s9", "t", { ...newGameCfg, vows: ["vow.windless"] });
    expect(g.flags["vow.taken.vow.windless"]).toBe(true);
  });

  it("誓約称号は一季節（28日）生きると解除される（titles.json と同じ条件形）", () => {
    const vowTitle = {
      id: "title.vow_windless",
      rank: "B" as const,
      condition: {
        and: [{ flag: "vow.taken.vow.windless" }, { counter: "days.slept", gte: 28 }],
      },
    };
    const titleCfg: StepConfig = { ...cfg, titles: [vowTitle] };
    let g = newGame("fate-s10", "t", { ...newGameCfg, vows: ["vow.windless"] });
    let gained = false;
    for (let i = 0; i < 28; i++) {
      const r = step(g, { type: "rest" }, titleCfg);
      g = r.state;
      if (r.events.some((e) => e.type === "titleGained" && e.id === "title.vow_windless")) {
        gained = true;
        // 28日目（days.slept=28）の睡眠で解除される
        expect(g.counters["days.slept"]).toBe(28);
      }
    }
    expect(gained).toBe(true);
    expect(g.titles).toContain("title.vow_windless");

    // 誓約を積んでいない周は（旗が立たないので）いくら寝ても解除されない
    let plain = newGame("fate-s10", "t", newGameCfg);
    for (let i = 0; i < 28; i++) plain = step(plain, { type: "rest" }, titleCfg).state;
    expect(plain.titles).not.toContain("title.vow_windless");
  });
});
