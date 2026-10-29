import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";
import { deserialize, SAVE_VERSION, serialize } from "../save/index.js";
import type { CrisisState, GameState } from "../state/types.js";
import { emptyCrisisFields, type CrisisConfig } from "../crisis/index.js";
import {
  bondOf,
  errandsToday,
  itemCount,
  itemPrice,
  journeyCost,
  journeyDaysFor,
  journeyWaysOf,
  mapKnown,
  mapKnownSet,
  mapVisited,
  mealToday,
  repOf,
  revealPick,
  roadEncounterDayKey,
  townOf,
} from "./index.js";
import type { LifeConfig } from "./index.js";

/**
 * 日々の営み（P-02「行動の種類を増やす」）のロジック検証。
 * 乱数はすべてシード固定 —— 同じ日・同じ回目には同じ結果が来る
 */

const SKILL_IDS = ["gathering", "cooking", "gambling", "prayer", "etiquette", "observation"];

const newGameCfg = { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 };

const lifeCfg: LifeConfig = {
  towns: { ardi: { name: "アルディ" }, bergen: { name: "ベルン" } },
  journeys: [{ from: "ardi", to: "bergen", days: 2 }],
  stroll: {
    town: [
      { weight: 1, text: "――貨幣を拾った。", money: 5 },
      { weight: 1, text: "――薬草を見つけた。", items: { herb: 1 } },
      { weight: 1, text: "――立ち話に付き合った。", npc: "npc.marta", bond: 5 },
    ],
    road: [{ weight: 1, text: "――何事もなく日が暮れた。" }],
  },
  gather: {
    forest: {
      skill: "gathering",
      difficulty: 15,
      entries: [
        { item: "herb", weight: 1, n: [1, 2] },
        { item: "nut", weight: 1, n: [1, 1] },
      ],
    },
  },
  recipes: [
    {
      id: "meal.stew",
      name: "シチュー",
      inputs: { herb: 1, nut: 1 },
      out: "meal.stew",
      skill: "cooking",
      difficulty: 30,
    },
  ],
  market: {
    stock: [{ id: "mat.salt" }, { id: "meal.bread" }, { id: "herb", towns: ["bergen"] }],
    sellFactor: 0.5,
    buyFactor: 1.2,
    townFactor: { ardi: { "*": 1 }, bergen: { "*": 1.2, herb: 0.5 } },
  },
  gamble: { stakes: [5, 15], winFactor: 2 },
  social: {
    talk: { bond: 5 },
    drink: { cost: 8, bond: 10 },
    gift: { bondPerPrice: 0.5, cap: 15 },
  },
  errands: [
    {
      id: "err.herb",
      name: "薬草の納品",
      text: "教会へ薬草を届けてほしい",
      need: { herb: 2 },
      reward: {
        money: 20,
        bond: { npc: "npc.edel", amount: 8 },
        gain: { skill: "gathering", amount: 3 },
        items: { nut: 1 },
      },
    },
    {
      id: "err.berry",
      name: "ベルンの菓子の素",
      text: "山葡萄を集めてほしい",
      town: "bergen",
      need: { berry: 1 },
      reward: { money: 10 },
    },
  ],
  mealSleepFactor: 0.004,
  praySleepBonus: 0.08,
  campQuality: 0.55,
  gatherDraws: 3,
  errandPerDay: 2,
  marketJitter: 0.1,
  bondRespectMin: 40,
  bondMax: 100,
  prayDifficulty: 20,
  gambleWinChance: 0.45,
  gambleDifficulty: 25,
  cookQualityBase: 45,
};

const itemDefs = {
  herb: { id: "herb", name: "薬草", kind: "gather" as const, price: 6 },
  nut: { id: "nut", name: "木の実", kind: "gather" as const, price: 3, food: 8 },
  berry: { id: "berry", name: "山葡萄", kind: "gather" as const, price: 4, food: 12 },
  "mat.salt": { id: "mat.salt", name: "塩", kind: "material" as const, price: 4 },
  "meal.bread": { id: "meal.bread", name: "パン", kind: "meal" as const, price: 6, food: 26 },
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
    base: { train: 1.0, gather: 2.0, cook: 2.4, pray: 1.2, gamble: 1.0 },
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
  },
  body: {
    fatiguePerAction: {
      wait: 1,
      train: 6,
      stroll: 4,
      gather: 10,
      cook: 6,
      gamble: 4,
      social: 3,
      pray: 3,
      errand: 5,
      journey: 4,
    },
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
};

function game(seed = "life-1"): GameState {
  return newGame(seed, "テスト", newGameCfg);
}

describe("newGame の life 初期状態（v18）", () => {
  it("基点の町にいて空荷で始まる", () => {
    const g = game();
    expect(g.life).toEqual({
      town: "ardi",
      items: {},
      bonds: {},
      companion: null,
      rep: {},
      mealDay: -1,
      mealQuality: 0,
      prayedDay: -1,
      journey: null,
      // G-02（v22〜）：いる町だけは訪れた刻印が立っている
      map: { visited: ["ardi"], heard: ["ardi"] },
    });
  });
});

describe("散策", () => {
  it("1行動を消費し、表から決定的に出来事を引く", () => {
    const r1 = step(game(), { type: "stroll" }, cfg);
    const r2 = step(game(), { type: "stroll" }, cfg);
    expect(r1.state.time.action).toBe(1);
    const ev = r1.events.find((e) => e.type === "strollOutcome");
    expect(ev).toBeDefined();
    // 同じシード・同じ回目には同じ結末（決定論）
    expect(JSON.stringify(r1.events)).toBe(JSON.stringify(r2.events));
  });

  it("効果が state に反映される（金・品物・仲・疲労のどれかが動く）", () => {
    // 何回か歩けば品物か金か仲のどれかが動く日がある
    let g = game("life-stroll");
    let changed = false;
    for (let i = 0; i < 4; i++) {
      const before = JSON.stringify({
        m: g.player.money,
        i: g.life.items,
        b: g.life.bonds,
        f: g.player.fatigue,
      });
      g = step(g, { type: "stroll" }, cfg).state;
      const after = JSON.stringify({
        m: g.player.money,
        i: g.life.items,
        b: g.life.bonds,
        f: g.player.fatigue,
      });
      if (before !== after) changed = true;
    }
    expect(changed).toBe(true);
  });

  it("旅の途中の散策は road の表を引く", () => {
    let g = game("life-road");
    g = step(g, { type: "journey", to: "bergen" }, cfg).state;
    const r = step(g, { type: "stroll" }, cfg);
    const ev = r.events.find((e) => e.type === "strollOutcome");
    expect(ev?.type === "strollOutcome" && ev.text === "――何事もなく日が暮れた。").toBe(true);
  });
});

describe("採集", () => {
  it("採集表から品を引き、その場所の技能に経験が入る", () => {
    const r = step(game(), { type: "gather", place: "forest" }, cfg);
    expect(r.state.time.action).toBe(1);
    const got = r.events.filter((e) => e.type === "itemGot");
    expect(got.length).toBeGreaterThan(0);
    for (const g of got) {
      expect(g.type === "itemGot" && ["herb", "nut"].includes(g.id)).toBe(true);
    }
    expect(r.events.some((e) => e.type === "gainApplied" && e.skill === "gathering")).toBe(true);
    expect(r.state.player.skills.gathering!.pending).toBeGreaterThan(0);
  });

  it("表のない場所では何も起きない", () => {
    const r = step(game(), { type: "gather", place: "market" }, cfg);
    expect(r.state.time.action).toBe(0);
    expect(r.events.filter((e) => e.type === "itemGot")).toEqual([]);
  });
});

describe("市場", () => {
  it("値段は基準値×町係数×売買係数に日替わりの揺らぎが乗る（決定的）", () => {
    const p1 = itemPrice("s", 0, "mat.salt", "ardi", "buy", lifeCfg, itemDefs["mat.salt"]);
    const p2 = itemPrice("s", 0, "mat.salt", "ardi", "buy", lifeCfg, itemDefs["mat.salt"]);
    expect(p1).toBe(p2);
    expect(p1).toBeGreaterThanOrEqual(1);
    // ベルンは町係数 1.2 で高い
    const pb = itemPrice("s", 0, "mat.salt", "bergen", "buy", lifeCfg, itemDefs["mat.salt"]);
    expect(pb).not.toBe(p1);
  });

  it("買うと持ち物が増え所持金が減る。行動は消費しない", () => {
    const g = { ...game(), player: { ...game().player, money: 100 } };
    const r = step(g, { type: "buyItem", id: "mat.salt" }, cfg);
    expect(r.state.time.action).toBe(0);
    expect(itemCount(r.state, "mat.salt")).toBe(1);
    expect(r.state.player.money).toBeLessThan(100);
    expect(r.events.some((e) => e.type === "itemBought")).toBe(true);
  });

  it("店に並ばない品は買えない", () => {
    const g = { ...game(), player: { ...game().player, money: 100 } };
    const r = step(g, { type: "buyItem", id: "nut" }, cfg);
    expect(itemCount(r.state, "nut")).toBe(0);
    expect(r.state.player.money).toBe(100);
  });

  it("売ると持ち物が減り所持金が増える", () => {
    let g = { ...game(), player: { ...game().player, money: 10 } };
    g = { ...g, life: { ...g.life, items: { herb: 2 } } };
    const r = step(g, { type: "sellItem", id: "herb" }, cfg);
    expect(itemCount(r.state, "herb")).toBe(1);
    expect(r.state.player.money).toBeGreaterThan(10);
    expect(r.events.some((e) => e.type === "itemSold")).toBe(true);
  });
});

describe("料理と食事", () => {
  const withInputs = (g: GameState): GameState => ({
    ...g,
    life: { ...g.life, items: { herb: 2, nut: 2 } },
  });

  it("材料を消費して仕上がりの品を作り、出来が meal.q に刻まれる", () => {
    const r = step(withInputs(game()), { type: "cook", recipe: "meal.stew", quality: 80 }, cfg);
    expect(r.state.time.action).toBe(1);
    expect(itemCount(r.state, "meal.stew")).toBe(1);
    expect(itemCount(r.state, "herb")).toBe(1);
    expect(r.state.counters["meal.q.meal.stew"]).toBe(80);
    expect(r.events.some((e) => e.type === "cooked" && e.quality === 80)).toBe(true);
  });

  it("材料が足りなければ作れない", () => {
    const r = step(game(), { type: "cook", recipe: "meal.stew" }, cfg);
    expect(r.state.time.action).toBe(0);
    expect(itemCount(r.state, "meal.stew")).toBe(0);
  });

  it("食べるとその日の食事の質が刻まれ、眠りの質を上げる", () => {
    let g = game("life-eat");
    g = { ...g, life: { ...g.life, items: { "meal.bread": 1 } } };
    const eaten = step(g, { type: "eat", id: "meal.bread" }, cfg);
    expect(eaten.state.time.action).toBe(0); // 食事は行動を消費しない
    expect(mealToday(eaten.state)).toBeGreaterThan(0);
    expect(itemCount(eaten.state, "meal.bread")).toBe(0);
    // 眠りの質に食事の効きが乗る（食べた日と食べない日で起床の質が違う）
    const slept = step(eaten.state, { type: "rest" }, cfg);
    const report = slept.events.find((e) => e.type === "wakeReport");
    expect(report?.type).toBe("wakeReport");
  });
});

describe("賭け事", () => {
  it("掛け金を払い、決定的な勝敗で戻る", () => {
    const g = { ...game("life-gamble"), player: { ...game("life-gamble").player, money: 50 } };
    const r1 = step(g, { type: "gamble", stake: 5 }, cfg);
    const r2 = step(g, { type: "gamble", stake: 5 }, cfg);
    expect(r1.state.time.action).toBe(1);
    const ev = r1.events.find((e) => e.type === "gambled");
    expect(ev?.type).toBe("gambled");
    // 決定的：同じ日・同じ回目には同じ勝敗
    expect(JSON.stringify(r1.events)).toBe(JSON.stringify(r2.events));
    // 負けなら掛け金分減り、勝てば戻る
    if (ev?.type === "gambled" && !ev.won) {
      expect(r1.state.player.money).toBe(45);
    } else if (ev?.type === "gambled") {
      expect(r1.state.player.money).toBe(55);
    }
    expect(r1.state.counters["gamble.total"]).toBe(1);
  });

  it("表に無い掛け金・所持金不足では張れない", () => {
    const g = { ...game(), player: { ...game().player, money: 100 } };
    const r1 = step(g, { type: "gamble", stake: 7 }, cfg);
    expect(r1.state.time.action).toBe(0);
    const poor = { ...game(), player: { ...game().player, money: 2 } };
    const r2 = step(poor, { type: "gamble", stake: 5 }, cfg);
    expect(r2.state.time.action).toBe(0);
  });
});

describe("祈る", () => {
  it("祈ると刻印が立ち、施しの累計が積まれる", () => {
    const g = { ...game(), player: { ...game().player, money: 30 } };
    const r = step(g, { type: "pray", alms: 10 }, cfg);
    expect(r.state.time.action).toBe(1);
    expect(r.state.life.prayedDay).toBe(0);
    expect(r.state.player.money).toBe(20);
    expect(r.state.counters["life.alms"]).toBe(10);
    expect(r.state.counters["life.prayed"]).toBe(1);
    expect(r.state.player.skills.prayer!.pending).toBeGreaterThan(0);
  });
});

describe("人と過ごす", () => {
  it("話すと仲が深まる", () => {
    const r = step(game(), { type: "social", npc: "npc.marta", way: "talk" }, cfg);
    expect(r.state.time.action).toBe(1);
    expect(bondOf(r.state, "npc.marta", lifeCfg)).toBe(5);
    expect(r.state.counters["bond.npc.marta"]).toBe(5);
  });

  it("贈るは品物を消費して価値に応じて仲が深まる", () => {
    let g = game();
    g = { ...g, life: { ...g.life, items: { "meal.bread": 1 } } };
    const r = step(g, { type: "social", npc: "npc.marta", way: "gift", item: "meal.bread" }, cfg);
    expect(itemCount(r.state, "meal.bread")).toBe(0);
    // price 6 × bondPerPrice 0.5 = 3
    expect(bondOf(r.state, "npc.marta", lifeCfg)).toBe(3);
  });

  it("仲の値は上限で頭打ちになる", () => {
    let g = game();
    g = { ...g, life: { ...g.life, bonds: { "npc.marta": 98 } } };
    const r = step(g, { type: "social", npc: "npc.marta", way: "talk" }, cfg);
    expect(bondOf(r.state, "npc.marta", lifeCfg)).toBe(100);
  });
});

describe("同行者（X-37）", () => {
  const warm = (g: GameState): GameState => ({
    ...g,
    life: { ...g.life, bonds: { "npc.marta": 50 } },
  });

  it("仲が深まった相手を旅に誘うと同行者になる", () => {
    const r = step(warm(game()), { type: "social", npc: "npc.marta", way: "invite" }, cfg);
    expect(r.state.time.action).toBe(1);
    expect(r.state.life.companion).toEqual({ npc: "npc.marta", sinceDay: r.state.time.day });
    expect(r.events.some((e) => e.type === "companionJoined" && e.npc === "npc.marta")).toBe(true);
    expect(r.state.counters["companion.joined"]).toBe(1);
    expect(r.state.counters["companion.joined.npc.marta"]).toBe(1);
  });

  it("仲が浅い相手は誘えない", () => {
    const r = step(game(), { type: "social", npc: "npc.marta", way: "invite" }, cfg);
    expect(r.state.life.companion).toBeNull();
    expect(r.events.some((e) => e.type === "companionJoined")).toBe(false);
  });

  it("街を去った人は誘えない", () => {
    let g = warm(game());
    g = { ...g, flags: { ...g.flags, "npc.gone.npc.marta": true } };
    const r = step(g, { type: "social", npc: "npc.marta", way: "invite" }, cfg);
    expect(r.state.life.companion).toBeNull();
    expect(r.events.some((e) => e.type === "companionJoined")).toBe(false);
  });

  it("同行者がいる間は別の人は誘えない", () => {
    const g = step(warm(game()), { type: "social", npc: "npc.marta", way: "invite" }, cfg).state;
    const r = step(
      { ...g, life: { ...g.life, bonds: { "npc.edel": 60 } } },
      { type: "social", npc: "npc.edel", way: "invite" },
      cfg,
    );
    expect(r.state.life.companion?.npc).toBe("npc.marta");
    expect(r.events.some((e) => e.type === "companionJoined")).toBe(false);
  });

  it("別れを告げると同行が解かれる", () => {
    const g = step(warm(game()), { type: "social", npc: "npc.marta", way: "invite" }, cfg).state;
    const r = step(g, { type: "social", npc: "npc.marta", way: "part" }, cfg);
    expect(r.state.life.companion).toBeNull();
    expect(r.events.some((e) => e.type === "companionParted" && e.npc === "npc.marta")).toBe(true);
    expect(r.state.counters["companion.parted"]).toBe(1);
  });

  it("同行していない相手には別れは届かない", () => {
    const g = step(warm(game()), { type: "social", npc: "npc.marta", way: "invite" }, cfg).state;
    const r = step(g, { type: "social", npc: "npc.edel", way: "part" }, cfg);
    expect(r.state.life.companion?.npc).toBe("npc.marta");
    expect(r.events.some((e) => e.type === "companionParted")).toBe(false);
  });

  it("同行している日は眠りで同行の日数が刻まれる", () => {
    let g = step(warm(game()), { type: "social", npc: "npc.marta", way: "invite" }, cfg).state;
    g = step(g, { type: "sleep" }, cfg).state;
    expect(g.counters["companion.days"]).toBe(1);
    g = step(g, { type: "sleep" }, cfg).state;
    expect(g.counters["companion.days"]).toBe(2);
  });
});

describe("掲示板の依頼", () => {
  const stocked = (g: GameState): GameState => ({
    ...g,
    player: { ...g.player, money: 0 },
    life: { ...g.life, items: { herb: 3, berry: 2 } },
  });

  it("品を納めて報酬（金・仲・経験・品）を得る", () => {
    const r = step(stocked(game()), { type: "errand", id: "err.herb" }, cfg);
    expect(r.state.time.action).toBe(1);
    expect(itemCount(r.state, "herb")).toBe(1);
    expect(r.state.player.money).toBe(20);
    expect(bondOf(r.state, "npc.edel", lifeCfg)).toBe(8);
    expect(itemCount(r.state, "nut")).toBe(1);
    expect(r.state.player.skills.gathering!.pending).toBeGreaterThan(0);
    expect(r.events.some((e) => e.type === "errandDone" && e.id === "err.herb")).toBe(true);
  });

  it("同じ依頼は1日1回まで", () => {
    const g1 = step(stocked(game()), { type: "errand", id: "err.herb" }, cfg).state;
    const r = step(g1, { type: "errand", id: "err.herb" }, cfg);
    expect(itemCount(r.state, "herb")).toBe(1); // 変わらない
    expect(r.events.some((e) => e.type === "errandDone")).toBe(false);
  });

  it("他の町の依頼は出ない", () => {
    const r = step(stocked(game()), { type: "errand", id: "err.berry" }, cfg);
    expect(r.events.some((e) => e.type === "errandDone")).toBe(false);
    expect(errandsToday(r.state)).toBe(0);
  });
});

describe("旅", () => {
  it("旅に出て野営で日数を経て着く", () => {
    let g = game("life-journey");
    const r = step(g, { type: "journey", to: "bergen" }, cfg);
    // G-02：旅の刻印は出発町・道・通い方を持つ（省略は徒歩）
    expect(r.state.life.journey).toEqual({
      to: "bergen",
      daysLeft: 2,
      from: "ardi",
      way: "foot",
      road: "ardi.bergen",
    });
    expect(r.events.some((e) => e.type === "journeyStarted")).toBe(true);
    // 野営1回目 → 残り1
    g = step(r.state, { type: "rest" }, cfg).state;
    expect(g.life.journey?.daysLeft).toBe(1);
    expect(g.time.day).toBe(1);
    // 野営2回目 → ベルンに着く
    const r2 = step(g, { type: "rest" }, cfg);
    expect(r2.state.life.journey).toBeNull();
    expect(townOf(r2.state)).toBe("bergen");
    expect(r2.events.some((e) => e.type === "journeyArrived" && e.town === "bergen")).toBe(true);
    expect(r2.state.counters["journey.count"]).toBe(1);
  });

  it("道のない町へは旅できない", () => {
    const r = step(game(), { type: "journey", to: "nowhere" }, cfg);
    expect(r.state.life.journey).toBeNull();
    expect(r.state.time.action).toBe(0);
  });
});

describe("町ごとの評判（G-01、docs/10 §4）", () => {
  /** rep 係数つきの設定（実データは balance.world.rep） */
  const repCfg: StepConfig = {
    ...cfg,
    donation: { amount: 10 },
    life: {
      ...lifeCfg,
      rep: { max: 50, errand: 2, work: 1, donate: 1, pricePer: 0.001 },
    },
  };
  /** 納品できる荷を持った状態 */
  const stocked = (g: GameState): GameState => ({
    ...g,
    life: { ...g.life, items: { herb: 3, berry: 2 } },
  });

  it("掲示板の依頼をこなすとその町の評判が積む", () => {
    const r = step(stocked(game()), { type: "errand", id: "err.herb" }, repCfg);
    expect(r.state.life.rep["ardi"]).toBe(2);
    expect(r.events.some((e) => e.type === "repGained" && e.town === "ardi")).toBe(true);
  });

  it("仕事は場所の属する町の評判に積む", () => {
    const r = step(game(), { type: "work", kind: "smith", quality: 50 }, repCfg);
    expect(r.state.life.rep["ardi"]).toBe(1);
  });

  it("寄付でもその町の評判が積む", () => {
    const g: GameState = { ...game(), player: { ...game().player, money: 100 } };
    const r = step(g, { type: "donate" }, repCfg);
    expect(r.state.life.rep["ardi"]).toBe(1);
  });

  it("評判は rep.max で頭打ちになる", () => {
    let g = game();
    for (let i = 0; i < 40; i++) {
      g = step(stocked(g), { type: "errand", id: "err.herb" }, repCfg).state;
      // 依頼は1日の上限（errandPerDay）があるので眠って翌日へ
      g = step(g, { type: "sleep", inn: "normal", dinner: false }, repCfg).state;
    }
    expect(repOf(g, "ardi", repCfg.life!)).toBe(50);
    expect(g.life.rep["ardi"]).toBeLessThanOrEqual(50 + repCfg.life!.rep!.errand);
  });

  it("評判が積むと買い値が下がり・売り値が上がる", () => {
    // 差が日替わりの揺らぎ・丸めをまたいで見えるよう、強めの係数で確かめる
    const priceCfg = {
      ...repCfg.life!,
      rep: { ...repCfg.life!.rep!, pricePer: 0.01 },
    };
    const id = "meal.stew"; // 値段の高い品で確かめる（安い品は丸めで差が消える）
    const item = itemDefs["meal.stew"];
    const plain = itemPrice("s", 0, id, "ardi", "buy", priceCfg, item, 0);
    const cheap = itemPrice("s", 0, id, "ardi", "buy", priceCfg, item, 50);
    expect(cheap).toBeLessThan(plain);
    const plainSell = itemPrice("s", 0, id, "ardi", "sell", priceCfg, item, 0);
    const dearSell = itemPrice("s", 0, id, "ardi", "sell", priceCfg, item, 50);
    expect(dearSell).toBeGreaterThan(plainSell);
    // 係数なしの設定では評判は効かない（従来どおり）
    const noRep = itemPrice("s", 0, "mat.salt", "ardi", "buy", lifeCfg, itemDefs["mat.salt"], 50);
    const base = itemPrice("s", 0, "mat.salt", "ardi", "buy", lifeCfg, itemDefs["mat.salt"], 0);
    expect(noRep).toBe(base);
  });

  it("評判は町ごとに独立（アルディの顔売りはベルンに効かない）", () => {
    const g = step(stocked(game()), { type: "errand", id: "err.herb" }, repCfg).state;
    expect(repOf(g, "ardi", repCfg.life!)).toBe(2);
    expect(repOf(g, "bergen", repCfg.life!)).toBe(0);
  });
});

describe("セーブの移行（v17 → v22）", () => {
  it("life 欄を基点の町・空荷・空の評判で補って移行される", () => {
    const g = game();
    const v17 = JSON.parse(serialize(g)) as Record<string, unknown>;
    v17["version"] = 17;
    delete v17["life"];
    const restored = deserialize(JSON.stringify(v17));
    expect(restored.version).toBe(SAVE_VERSION); // v18（営み）→v19（武技）→v20（ユニーク）→v21（地方）→v22（地図）の5段移行
    expect(restored.life).toEqual({
      town: "ardi",
      items: {},
      bonds: {},
      companion: null,
      rep: {},
      mealDay: -1,
      mealQuality: 0,
      prayedDay: -1,
      journey: null,
      map: { visited: ["ardi"], heard: ["ardi"] },
    });
  });

  it("v21 のセーブは life.map（いる町の訪れた刻印）を補って移行される", () => {
    const g = game();
    const v21 = JSON.parse(serialize(g)) as Record<string, unknown>;
    v21["version"] = 21;
    const life = v21["life"] as Record<string, unknown>;
    delete life["map"];
    const restored = deserialize(JSON.stringify(v21));
    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.life.map).toEqual({ visited: ["ardi"], heard: ["ardi"] });
  });
});

/* ── 地方の地図と旅（G-02、docs/10 §7） ──
 * 4町の地方（街道・海路・山道）で、通い方・閉鎖・霧の刻印・道中の遭遇を
 * 確かめる。すべてシード固定の決定論 */

/** G-02 の地方：アルディ＝起点、ベルン＝街道の先、ミナト＝海路の先、オクチ＝山道の先 */
const fogCfg: LifeConfig = {
  ...lifeCfg,
  towns: {
    ardi: { name: "アルディ", pos: [20, 50] },
    bergen: { name: "ベルン", pos: [60, 40] },
    port: { name: "ミナト", pos: [90, 80] },
    deep: { name: "オクチ", pos: [40, 10] },
  },
  journeys: [
    { from: "ardi", to: "bergen", days: 2, kind: "highway", danger: 2, checkpoint: { fee: 5 } },
    {
      from: "bergen",
      to: "port",
      days: 4,
      kind: "sea",
      danger: 3,
      enemies: [{ id: "foe.sea", weight: 1 }],
    },
    { from: "ardi", to: "deep", days: 4, kind: "mountain", closedSeasons: [3] },
  ],
  places: {
    forest: { town: "ardi", name: "近郊の森" },
    deep_woods: { town: "deep", name: "奥の森" },
  },
  journey: {
    encounterPerDanger: 0.5,
    ways: {
      caravan: { feePerDay: 4, encounterFactor: 0.2 },
      horse: { feePerDay: 8, daysFactor: 0.5, encounterFactor: 0.7 },
      ship: { fee: 30, daysFactor: 0.5 },
    },
    newsRevealChance: 0,
  },
};
const fogStepCfg: StepConfig = { ...cfg, life: fogCfg };

/** 所持金を持たせた state（関所・運賃のある旅用） */
const rich = (g: GameState, money = 100): GameState => ({
  ...g,
  player: { ...g.player, money },
});
/** ベルンに居る state（ベルン発の旅の検証用） */
const atBergen = (g: GameState): GameState => ({
  ...g,
  life: {
    ...g.life,
    town: "bergen",
    map: { visited: ["ardi", "bergen"], heard: ["ardi", "bergen"] },
  },
});

describe("通い方と道の条件（G-02）", () => {
  const road = fogCfg.journeys[0]!; // ardi↔bergen（街道・2日・関所5G）

  it("通い方で料金と日数が変わる（関所は通い方によらず掛かる）", () => {
    expect(journeyCost(road, "foot", fogCfg)).toBe(5); // 運賃なし・関所だけ
    expect(journeyCost(road, "caravan", fogCfg)).toBe(5 + 2 * 4); // 日数×日額＋関所
    expect(journeyCost(road, "horse", fogCfg)).toBe(5 + 1 * 8); // 縮んだ日数×日額＋関所
    expect(journeyDaysFor(road, "foot", fogCfg)).toBe(2);
    expect(journeyDaysFor(road, "horse", fogCfg)).toBe(1); // 2日 × 0.5
    expect(journeyWaysOf(road)).toEqual(["foot", "caravan", "horse"]);
    expect(journeyWaysOf(fogCfg.journeys[1]!)).toEqual(["foot", "ship"]); // 海路は船
  });

  it("隊商で旅立つと料金が引かれ、旅の刻印に出発町・道・通い方が残る", () => {
    const r = step(rich(game()), { type: "journey", to: "bergen", way: "caravan" }, fogStepCfg);
    expect(r.state.player.money).toBe(100 - (5 + 8));
    expect(r.state.life.journey).toEqual({
      to: "bergen",
      daysLeft: 2,
      from: "ardi",
      way: "caravan",
      road: "ardi.bergen",
    });
    expect(
      r.events.some((e) => e.type === "journeyStarted" && e.way === "caravan" && e.days === 2),
    ).toBe(true);
    // 出発の時点で行き先の名は聞き覚える（霧が晴れる）が、訪れた刻印はまだ
    expect(r.state.life.map.heard).toContain("bergen");
    expect(mapVisited(r.state, "bergen")).toBe(false);
  });

  it("騎乗は日数が縮む（4日の海路は船で2日）", () => {
    const r = step(
      rich(atBergen(game())),
      { type: "journey", to: "port", way: "ship" },
      fogStepCfg,
    );
    expect(r.state.player.money).toBe(100 - 30);
    expect(r.state.life.journey).toEqual({
      to: "port",
      daysLeft: 2,
      from: "bergen",
      way: "ship",
      road: "bergen.port",
    });
  });

  it("船は海路にだけ出る（陸路へは船で旅立てない）", () => {
    const r = step(rich(game()), { type: "journey", to: "bergen", way: "ship" }, fogStepCfg);
    expect(r.state.life.journey).toBeNull();
    expect(r.state.time.action).toBe(0);
  });

  it("金が足りなければ旅立てない", () => {
    const r = step(game(), { type: "journey", to: "bergen", way: "caravan" }, fogStepCfg);
    expect(r.state.life.journey).toBeNull();
  });

  it("季節で封じられる道には旅立てない（山道の冬）", () => {
    // daysPerSeason 28・seasonsPerYear 4：day 84〜111 は季節3（冬）
    const winter: GameState = { ...game(), time: { day: 84, action: 0 } };
    const r = step(winter, { type: "journey", to: "deep" }, fogStepCfg);
    expect(r.state.life.journey).toBeNull();
    // 春（day 0）は通れる
    const r2 = step(game(), { type: "journey", to: "deep" }, fogStepCfg);
    expect(r2.state.life.journey).not.toBeNull();
  });

  it("危機で閉ざされる道には旅立てない（種別・道idのどちらでも封じる）", () => {
    const crisisWith = (closeRoads: string[]): StepConfig => ({
      ...fogStepCfg,
      crisis: {
        types: [
          {
            id: "crisis.test_roads",
            name: "道断ちの霧",
            weight: 1,
            factions: [],
            stages: [{ id: "spread", name: "拡散", seasons: 2, effects: { closeRoads } }],
            finales: [],
          },
        ],
        strongFields: 1,
        weakFieldFactor: 0.5,
      } satisfies CrisisConfig,
    });
    const crisisState: CrisisState = {
      typeId: "crisis.test_roads",
      stageIndex: 0,
      seasonsInStage: 0,
      boundaries: 0,
      factions: [],
      hero: emptyCrisisFields(),
      finales: [],
      variables: {},
      npcGone: [],
      log: [],
      outcome: "ongoing",
    };
    const g: GameState = { ...rich(game()), crisis: crisisState };
    // 種別 "mountain" が封じられている → 山道の旅は出られないが街道は通れる
    const closed = crisisWith(["mountain"]);
    expect(step(g, { type: "journey", to: "deep" }, closed).state.life.journey).toBeNull();
    expect(step(g, { type: "journey", to: "bergen" }, closed).state.life.journey).not.toBeNull();
    // 道の id（journeyIdOf）で封じる → ardi↔bergen だけが閉ざされる
    const closedId = crisisWith(["ardi.bergen"]);
    expect(step(g, { type: "journey", to: "bergen" }, closedId).state.life.journey).toBeNull();
    expect(step(g, { type: "journey", to: "deep" }, closedId).state.life.journey).not.toBeNull();
  });
});

describe("地図の霧（G-02）", () => {
  it("知っている場所は訪れた町・聞き覚え・隣町・訪れた町の地域から導かれる", () => {
    const known = mapKnownSet(game(), fogCfg);
    expect(known.has("ardi")).toBe(true); // いる町（訪れた刻印）
    expect(known.has("bergen")).toBe(true); // アルディの隣町
    expect(known.has("deep")).toBe(true); // アルディの隣町（山道）
    expect(known.has("forest")).toBe(true); // アルディの地域
    expect(known.has("port")).toBe(false); // ベルンの先 —— まだ知らない
    expect(known.has("deep_woods")).toBe(false); // 遠い町の地域
    expect(mapKnown(game(), fogCfg, "port")).toBe(false);
  });

  it("旅に出ると行き先が聞き覚えに、着くと訪れた刻印が立つ", () => {
    let g = rich(game("map-journey"));
    g = step(g, { type: "journey", to: "bergen" }, fogStepCfg).state;
    expect(mapKnown(g, fogCfg, "bergen")).toBe(true);
    expect(mapVisited(g, "bergen")).toBe(false);
    g = step(g, { type: "rest" }, fogStepCfg).state; // 野営1
    const r = step(g, { type: "rest" }, fogStepCfg); // 野営2 → 到着
    expect(r.state.life.journey).toBeNull();
    expect(townOf(r.state)).toBe("bergen");
    expect(mapVisited(r.state, "bergen")).toBe(true);
    expect(r.events.some((e) => e.type === "journeyArrived" && e.town === "bergen")).toBe(true);
  });

  it("噂話（reveal のある散策の出来事）で知らない場所の名が聞き覚える", () => {
    const rumorCfg: StepConfig = {
      ...fogStepCfg,
      life: {
        ...fogCfg,
        stroll: {
          ...fogCfg.stroll,
          town: [{ weight: 1, text: "――旅人の噂を聞いた。", reveal: true }],
        },
      },
    };
    const r = step(game(), { type: "stroll" }, rumorCfg);
    const heard = r.events.find((e) => e.type === "mapHeard");
    expect(heard).toBeDefined();
    // 既知の町から道で繋がる未知の町が優先 —— ここでは「ミナト」だけが候補
    expect(heard?.type === "mapHeard" && heard.place).toBe("port");
    expect(r.state.life.map.heard).toContain("port");
    expect(mapVisited(r.state, "port")).toBe(false);
  });

  it("地方の地図を買うとすべての町と地域の名が聞き覚える（訪れた刻印は立たない）", () => {
    const items = {
      ...itemDefs,
      "mat.map.region": {
        id: "mat.map.region",
        name: "地方の地図",
        kind: "material" as const,
        price: 10,
        reveal: "map" as const,
      },
    };
    const mapCfg: StepConfig = {
      ...fogStepCfg,
      items,
      life: {
        ...fogCfg,
        market: { ...fogCfg.market, stock: [...fogCfg.market.stock, { id: "mat.map.region" }] },
        places: {
          ...fogCfg.places,
          "lm.test": { town: "ardi", name: "試しの名所", landmark: true },
        },
      },
    };
    const r = step(rich(game()), { type: "buyItem", id: "mat.map.region" }, mapCfg);
    expect(r.events.some((e) => e.type === "mapRevealed")).toBe(true);
    for (const id of ["ardi", "bergen", "port", "deep", "forest", "deep_woods"]) {
      expect(r.state.life.map.heard).toContain(id);
    }
    // 名所は買った地図にも載らない（噂・発見でだけ名が知れる —— X-26）
    expect(r.state.life.map.heard).not.toContain("lm.test");
    expect(r.state.life.map.visited).toEqual(["ardi"]);
  });

  it("名所は訪れた町に属しても霧のまま —— 聞き覚えたときだけ名が出る（X-25）", () => {
    const lmCfg: LifeConfig = {
      ...fogCfg,
      places: {
        ...fogCfg.places,
        "lm.test": { town: "ardi", name: "試しの名所", landmark: true },
      },
    };
    const known = mapKnownSet(game(), lmCfg);
    // 同じ町の普通の地域は常識として知れるが、名所は霧の中に留まる
    expect(known.has("forest")).toBe(true);
    expect(known.has("lm.test")).toBe(false);
    // 噂・発見で聞き覚えると名が出る
    const heard: GameState = {
      ...game(),
      life: { ...game().life, map: { visited: ["ardi"], heard: ["ardi", "lm.test"] } },
    };
    expect(mapKnownSet(heard, lmCfg).has("lm.test")).toBe(true);
  });

  it("条件付きの名所は条件の立つ間だけ名が出る（X-27、危機でだけ行ける場所）", () => {
    const lmCfg: LifeConfig = {
      ...fogCfg,
      places: {
        ...fogCfg.places,
        "lm.refuge": {
          town: "ardi",
          name: "避難の古道",
          landmark: true,
          when: { crisis: { minStage: 1 } },
        },
      },
    };
    const crisisAt = (
      stageIndex: number,
      outcome: CrisisState["outcome"] = "ongoing",
    ): CrisisState => ({
      typeId: "crisis.test",
      stageIndex,
      seasonsInStage: 0,
      boundaries: 0,
      factions: [],
      hero: emptyCrisisFields(),
      finales: [],
      variables: {},
      npcGone: [],
      log: [],
      outcome,
    });
    const cond = { time: fogStepCfg.time };
    const g = (c: CrisisState | null): GameState => ({ ...game(), crisis: c });

    // 平時・危機初期（段階0）では霧のまま —— cond を渡しても出ない
    expect(mapKnownSet(g(null), lmCfg, cond).has("lm.refuge")).toBe(false);
    expect(mapKnownSet(g(crisisAt(0)), lmCfg, cond).has("lm.refuge")).toBe(false);
    // 段階が進むと聞き覚えがなくても名が出る
    expect(mapKnownSet(g(crisisAt(1)), lmCfg, cond).has("lm.refuge")).toBe(true);
    // 決着すると再び霧へ —— ただし訪れた場所は知ったまま残る
    const during: GameState = {
      ...g(crisisAt(1)),
      life: {
        ...g(crisisAt(1)).life,
        map: { visited: ["ardi", "lm.refuge"], heard: ["ardi"] },
      },
    };
    expect(
      mapKnownSet({ ...during, crisis: crisisAt(1, "resolved") }, lmCfg, cond).has("lm.refuge"),
    ).toBe(true);
    expect(
      mapKnownSet({ ...g(null), crisis: crisisAt(1, "resolved") }, lmCfg, cond).has("lm.refuge"),
    ).toBe(false);
  });

  it("人が去った町にだけ現れる名所（X-31）—— 宿主町の退場の旗で条件が立つ", () => {
    const lmCfg: LifeConfig = {
      ...fogCfg,
      places: {
        ...fogCfg.places,
        "lm.well": {
          town: "ardi",
          name: "空き家の井戸",
          landmark: true,
          when: { npcGone: { min: 1 } },
        },
      },
    };
    const cond = { time: fogStepCfg.time };
    const g = (flags: Record<string, boolean>): GameState => ({
      ...game(),
      flags: { ...game().flags, ...flags },
    });
    // 誰も去っていない町では霧のまま
    expect(mapKnownSet(g({}), lmCfg, cond).has("lm.well")).toBe(false);
    // 別の町で人が去っても宿主町（ardi）の条件は立たない
    expect(mapKnownSet(g({ "npc.gone.npc.bergen.smith": true }), lmCfg, cond).has("lm.well")).toBe(
      false,
    );
    // 宿主町から1人でも去ると名が出る
    expect(
      mapKnownSet(g({ "npc.gone.npc.ardi.innkeeper": true }), lmCfg, cond).has("lm.well"),
    ).toBe(true);
    // 去った印は累積 —— min:2 なら2人の退場が要る
    const twoCfg: LifeConfig = {
      ...lmCfg,
      places: {
        ...lmCfg.places,
        "lm.well": { ...lmCfg.places!["lm.well"]!, when: { npcGone: { min: 2 } } },
      },
    };
    expect(
      mapKnownSet(g({ "npc.gone.npc.ardi.innkeeper": true }), twoCfg, cond).has("lm.well"),
    ).toBe(false);
    expect(
      mapKnownSet(
        g({ "npc.gone.npc.ardi.innkeeper": true, "npc.gone.npc.ardi.smith": true }),
        twoCfg,
        cond,
      ).has("lm.well"),
    ).toBe(true);
  });

  it("条件付きの名所は噂・朝刊では知れない（revealPick の候補外）", () => {
    const lmCfg: LifeConfig = {
      ...fogCfg,
      places: {
        ...fogCfg.places,
        "lm.refuge": {
          town: "ardi",
          name: "避難の古道",
          landmark: true,
          when: { crisis: { minStage: 1 } },
        },
      },
    };
    // 全町を聞き覚えたあと、地域の候補は forest/deep_woods/lm.refuge の3件。
    // 条件付きの lm.refuge は選ばれない —— 何度引いても出ない
    const known = new Set(["ardi", "bergen", "port", "deep"]);
    for (let seq = 0; seq < 60; seq++) {
      const pick = revealPick(`when-${seq}`, 5, seq, lmCfg, known);
      if (pick !== undefined) expect(pick).not.toBe("lm.refuge");
    }
    // ほかの2件を知らせると、あとは何も出ない（条件付きは母数から外れる）
    const pick = revealPick("when-x", 5, 0, lmCfg, new Set([...known, "forest", "deep_woods"]));
    expect(pick).toBeUndefined();
  });

  it("条件が立った名所は世界が知らせる —— 噂として聞き覚えに刻まれる（X-28）", () => {
    const lmCfg: LifeConfig = {
      ...fogCfg,
      places: {
        ...fogCfg.places,
        "lm.refuge": {
          town: "ardi",
          name: "避難の古道",
          landmark: true,
          when: { crisis: { minStage: 1 } },
        },
      },
    };
    const lmStepCfg: StepConfig = { ...fogStepCfg, life: lmCfg };
    const crisisAt = (
      stageIndex: number,
      outcome: CrisisState["outcome"] = "ongoing",
    ): CrisisState => ({
      typeId: "crisis.test",
      stageIndex,
      seasonsInStage: 0,
      boundaries: 0,
      factions: [],
      hero: emptyCrisisFields(),
      finales: [],
      variables: {},
      npcGone: [],
      log: [],
      outcome,
    });

    // 段階0では届かない
    const r0 = step({ ...game(), crisis: crisisAt(0) }, { type: "stroll" }, lmStepCfg);
    expect(r0.events.some((e) => e.type === "mapHeard" && e.place === "lm.refuge")).toBe(false);
    expect(r0.state.life.map.heard).not.toContain("lm.refuge");

    // 段階1で届く —— 聞き覚えに刻まれ、以後は条件に関わらず既知
    const r1 = step({ ...game(), crisis: crisisAt(1) }, { type: "stroll" }, lmStepCfg);
    expect(r1.events.some((e) => e.type === "mapHeard" && e.place === "lm.refuge")).toBe(true);
    expect(r1.state.life.map.heard).toContain("lm.refuge");

    // 決着しても名は残る。そして二度目は届かない（刻み済み）
    const r2 = step(
      { ...r1.state, crisis: crisisAt(1, "resolved") },
      { type: "stroll" },
      lmStepCfg,
    );
    expect(r2.state.life.map.heard).toContain("lm.refuge");
    expect(r2.events.filter((e) => e.type === "mapHeard" && e.place === "lm.refuge")).toHaveLength(
      0,
    );
  });

  it("名所を踏んだ記録が残る —— 初訪だけ landmarkFound が届く（X-29）", () => {
    const lmCfg: LifeConfig = {
      ...fogCfg,
      places: {
        ...fogCfg.places,
        "lm.test": { town: "ardi", name: "試しの名所", landmark: true },
      },
    };
    const lmStepCfg: StepConfig = { ...fogStepCfg, life: lmCfg };
    const heard: GameState = {
      ...game(),
      life: { ...game().life, map: { visited: ["ardi"], heard: ["ardi", "lm.test"] } },
    };
    // 初訪：landmarkFound の届き＋発見の刻印
    const r1 = step(heard, { type: "travel", to: "lm.test" }, lmStepCfg);
    expect(r1.events.some((e) => e.type === "landmarkFound" && e.place === "lm.test")).toBe(true);
    expect(r1.state.counters["landmark.found"]).toBe(1);
    expect(r1.state.counters["landmark.found.lm.test"]).toBe(1);
    expect(r1.state.life.map.visited).toContain("lm.test");
    // 二度目は届かない（訪問印が既に立っている）
    const r2 = step(r1.state, { type: "travel", to: "lm.test" }, lmStepCfg);
    expect(r2.events.filter((e) => e.type === "landmarkFound")).toHaveLength(0);
    expect(r2.state.counters["landmark.found"]).toBe(1);
    // 名所以外の場所への旅では届かない
    const r3 = step(r1.state, { type: "travel", to: "forest" }, lmStepCfg);
    expect(r3.events.filter((e) => e.type === "landmarkFound")).toHaveLength(0);
  });

  it("名所の頁は landmarkFound が atom を運ぶ —— 頁のない名所は運ばない（X-33）", () => {
    const lmCfg: LifeConfig = {
      ...fogCfg,
      places: {
        ...fogCfg.places,
        "lm.page": {
          town: "ardi",
          name: "頁のある名所",
          landmark: true,
          atom: "place.lm.page",
        },
        "lm.bare": { town: "ardi", name: "頁のない名所", landmark: true },
      },
    };
    const lmStepCfg: StepConfig = { ...fogStepCfg, life: lmCfg };
    const heard: GameState = {
      ...game(),
      life: {
        ...game().life,
        map: { visited: ["ardi"], heard: ["ardi", "lm.page", "lm.bare"] },
      },
    };
    const r1 = step(heard, { type: "travel", to: "lm.page" }, lmStepCfg);
    const found = r1.events.find((e) => e.type === "landmarkFound");
    expect(found).toMatchObject({ type: "landmarkFound", place: "lm.page", atom: "place.lm.page" });
    const r2 = step(r1.state, { type: "travel", to: "lm.bare" }, lmStepCfg);
    const found2 = r2.events.find((e) => e.type === "landmarkFound");
    expect(found2).toMatchObject({ type: "landmarkFound", place: "lm.bare" });
    expect(found2 !== undefined && "atom" in found2 ? found2.atom : undefined).toBeUndefined();
  });

  it("人が去った町の名所は去りのあと世界が知らせる —— 噂として聞き覚えに刻まれる（X-31）", () => {
    const lmCfg: LifeConfig = {
      ...fogCfg,
      places: {
        ...fogCfg.places,
        "lm.well": {
          town: "ardi",
          name: "空き家の井戸",
          landmark: true,
          when: { npcGone: { min: 1 } },
        },
      },
    };
    const lmStepCfg: StepConfig = { ...fogStepCfg, life: lmCfg };

    // 誰も去っていない —— 届かない
    const r0 = step(game(), { type: "stroll" }, lmStepCfg);
    expect(r0.events.filter((e) => e.type === "mapHeard")).toHaveLength(0);
    expect(r0.state.life.map.heard).not.toContain("lm.well");

    // 別の町で人が去っただけでは届かない
    const other: GameState = {
      ...game(),
      flags: { "npc.gone.npc.bergen.smith": true },
    };
    const r1 = step(other, { type: "stroll" }, lmStepCfg);
    expect(r1.events.filter((e) => e.type === "mapHeard" && e.place === "lm.well")).toHaveLength(0);

    // 宿主町から人が去ると届く —— 聞き覚えに刻まれ、以後は既知
    const departed: GameState = {
      ...game(),
      flags: { "npc.gone.npc.ardi.innkeeper": true },
    };
    const r2 = step(departed, { type: "stroll" }, lmStepCfg);
    expect(r2.events.some((e) => e.type === "mapHeard" && e.place === "lm.well")).toBe(true);
    expect(r2.state.life.map.heard).toContain("lm.well");
    // 二度目は届かない
    const r3 = step(r2.state, { type: "stroll" }, lmStepCfg);
    expect(r3.events.filter((e) => e.type === "mapHeard" && e.place === "lm.well")).toHaveLength(0);
  });
});

describe("道中の遭遇（G-02）", () => {
  const toSea = (seed: string): GameState =>
    step(rich(atBergen(game(seed))), { type: "journey", to: "port", way: "foot" }, fogStepCfg)
      .state;

  it("危険な道の散策は敵の気配に遭う（遭遇率が1を超える道では必ず遭う）", () => {
    // 海路：danger 3 × encounterPerDanger 0.5 = 1.5 → 必ず遭遇
    const r = step(toSea("enc-1"), { type: "stroll" }, fogStepCfg);
    const enc = r.events.find((e) => e.type === "roadEncounter");
    expect(enc?.type === "roadEncounter" && enc.enemy).toBe("foe.sea");
    expect(r.state.counters[roadEncounterDayKey()]).toBe(r.state.time.day);
    // 遭遇は街道の出来事にならない
    expect(r.events.some((e) => e.type === "strollOutcome")).toBe(false);
  });

  it("遭遇は1日1回まで（2回目の散策は街道の出来事になる）", () => {
    const g = step(toSea("enc-2"), { type: "stroll" }, fogStepCfg).state;
    const r2 = step(g, { type: "stroll" }, fogStepCfg);
    expect(r2.events.some((e) => e.type === "roadEncounter")).toBe(false);
    expect(r2.events.some((e) => e.type === "strollOutcome")).toBe(true);
  });

  it("遭遇の抽選は決定的（同じ日・同じ回目には同じ敵）", () => {
    const e1 = step(toSea("enc-3"), { type: "stroll" }, fogStepCfg).events.find(
      (e) => e.type === "roadEncounter",
    );
    const e2 = step(toSea("enc-3"), { type: "stroll" }, fogStepCfg).events.find(
      (e) => e.type === "roadEncounter",
    );
    expect(e1).toEqual(e2);
  });
});
