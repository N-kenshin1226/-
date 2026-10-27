import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import { step, type Command, type StepConfig } from "../step.js";
import type { GameState } from "../state/types.js";
import {
  activeBookEffects,
  bookDaysLeft,
  buyBook,
  hasReadBook,
  readBook,
  shelfBooks,
  type BooksConfig,
} from "./index.js";

/**
 * T-26 書物（docs/02_growth_system.md §8・§6）。
 * 購入→所持→読了→効果適用・二重読了・期間切れを決定論的に検証する。
 */

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];

const newGameCfg = { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 };

const booksCfg: BooksConfig = {
  books: [
    {
      id: "book.fencing",
      price: 30,
      effect: { gainVs: { swordplay: 1.5 } },
      durationDays: 3,
    },
    {
      id: "book.quiet",
      price: 40,
      potentialRecover: { swordplay: 10, observation: 5 },
      flag: "knows.quiet_mind",
    },
    { id: "book.plain", price: 10 },
  ],
  potentialMax: 100,
};

const TIME = {
  actionsPerDay: 5,
  timeOfDay: ["morning", "morning", "noon", "evening", "night"],
  daysPerWeek: 7,
  daysPerSeason: 28,
  seasonsPerYear: 4,
  moonCycleDays: 28,
  moonPhaseWindowDays: 1,
  startAge: 15,
} as const;

const cfg = (books: BooksConfig = booksCfg): StepConfig =>
  ({
    time: TIME,
    actionLogMax: 50,
    gain: {
      base: { train: 1 },
      challengePoints: [
        [0, 1],
        [30, 0],
      ],
      challengeTrainCap: 0.6,
      noveltyK: 1,
      noveltyWindow: 10,
      failMultiplier: 0.6,
      modifierCap: 2.5,
      diminishBase: 110,
      diminishExponent: 1.5,
      fatigueScale: 0.8,
    },
    sleep: {
      nightlyCapPerSkill: 8,
      nightlyCapTotal: 999,
      innFactors: { cheap: 0.8, normal: 1.0, good: 1.15 },
      dinnerFactors: { withDinner: 1, noDinner: 1 },
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
      attackPerSwordplay: 0.15,
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
    },
    body: {
      // read の疲労を 0 にして、読書直後と未読の gain 比較を正確にする
      fatiguePerAction: { read: 0 },
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
    books,
  }) as StepConfig;

const freshGame = (seed = "bk", money = 100): GameState =>
  newGame(seed, "t", { ...newGameCfg, initialMoney: money });

const trainGain = (g: GameState, skill: string, c: StepConfig): number => {
  const r = step(g, { type: "train", skill, difficulty: 15 }, c);
  const ev = r.events.find((e) => e.type === "gainApplied");
  return ev?.type === "gainApplied" ? ev.amount : 0;
};

describe("書物の購入", () => {
  it("所持金を払って所持に加わる（行動は消費しない）", () => {
    const g = freshGame("b1", 100);
    const r = buyBook(g, "book.fencing", booksCfg, TIME);
    expect(r.ok).toBe(true);
    expect(r.state.books.owned).toEqual(["book.fencing"]);
    expect(r.state.player.money).toBe(70);
    // step の buyBook でも行動・時間は進まない
    const s = step(g, { type: "buyBook", id: "book.fencing" }, cfg());
    expect(s.state.time).toEqual({ day: 0, action: 0 });
    expect(s.events.some((e) => e.type === "bookBought" && e.id === "book.fencing")).toBe(true);
  });

  it("所持金不足・所持済み・不明ID・定義なしは買えない", () => {
    const g = freshGame("b2", 20);
    expect(buyBook(g, "book.fencing", booksCfg, TIME).ok).toBe(false); // 30G > 20G
    expect(buyBook(g, "book.plain", booksCfg, TIME).ok).toBe(true); // 10G は買える
    const owned = buyBook(g, "book.plain", booksCfg, TIME).state;
    expect(buyBook(owned, "book.plain", booksCfg, TIME).ok).toBe(false); // 二重購入は不可
    expect(buyBook(g, "book.nothing", booksCfg, TIME).ok).toBe(false); // 不明ID
    expect(buyBook(g, "book.plain", undefined, TIME).ok).toBe(false); // cfg なし
  });
});

describe("書物の読了", () => {
  it("所持している初読で効果が適用され、1行動を消費する", () => {
    const g0 = freshGame("r1", 100);
    const g = buyBook(g0, "book.quiet", booksCfg, TIME).state;
    const r = step(g, { type: "readBook", id: "book.quiet" }, cfg());
    expect(r.state.time.action).toBe(1);
    expect(hasReadBook(r.state, "book.quiet")).toBe(true);
    expect(r.state.books.read).toEqual([{ id: "book.quiet", day: 0 }]);
    // 知識フラグが立つ
    expect(r.state.flags["knows.quiet_mind"]).toBe(true);
    // 素質は初期値100で上限なので回復量は 0（イベントには空で出る）
    const ev = r.events.find((e) => e.type === "bookRead");
    expect(ev?.type === "bookRead" && ev.recovered).toEqual([]);
  });

  it("下がった素質が読了で回復する（potentialCap で頭打ち）", () => {
    let g = buyBook(freshGame("r2", 100), "book.quiet", booksCfg, TIME).state;
    // 素質を下げた状態を作る
    g = {
      ...g,
      player: {
        ...g.player,
        skills: {
          ...g.player.skills,
          swordplay: { ...g.player.skills["swordplay"]!, potential: 80 },
          observation: { ...g.player.skills["observation"]!, potential: 96 },
        },
      },
    };
    const r = step(g, { type: "readBook", id: "book.quiet" }, cfg());
    expect(r.state.player.skills["swordplay"]!.potential).toBe(90); // 80 + 10
    expect(r.state.player.skills["observation"]!.potential).toBe(100); // 96 + 5 → 上限100
    // 実際に増えた分だけが recovered に出る（上限で削られた分は含まない）
    const ev = r.events.find((e) => e.type === "bookRead");
    expect(ev?.type === "bookRead" && ev.recovered).toEqual([
      { skill: "swordplay", amount: 10 },
      { skill: "observation", amount: 4 },
    ]);
  });

  it("二重読了・未所持・行動残なしでは何も起きない（時間も進まない）", () => {
    const g = buyBook(freshGame("r3", 100), "book.fencing", booksCfg, TIME).state;
    const read = step(g, { type: "readBook", id: "book.fencing" }, cfg());
    expect(read.state.time.action).toBe(1);
    // 二重読了：効果も時間も変わらない
    const again = step(read.state, { type: "readBook", id: "book.fencing" }, cfg());
    expect(again.state.time.action).toBe(1);
    expect(again.events.some((e) => e.type === "bookRead")).toBe(false);
    expect(again.state.books.read).toHaveLength(1);
    // 未所持は読めない
    const g2 = freshGame("r3b", 100);
    const unowned = step(g2, { type: "readBook", id: "book.fencing" }, cfg());
    expect(unowned.state.time.action).toBe(0);
    expect(unowned.events).toHaveLength(0);
    // 行動を使い切った日は読めない（無料読書の抜け道を塞ぐ）
    let full = g2;
    for (let i = 0; i < 5; i++) full = step(full, { type: "wait" }, cfg()).state;
    full = buyBook(full, "book.fencing", booksCfg, TIME).state;
    const tired = step(full, { type: "readBook", id: "book.fencing" }, cfg());
    expect(tired.state.books.read).toHaveLength(0);
    expect(tired.events.some((e) => e.type === "bookRead")).toBe(false);
  });
});

describe("書物の期間効果（M項）", () => {
  const buyAndRead = (g: GameState): GameState => {
    const cmds: Command[] = [
      { type: "buyBook", id: "book.fencing" },
      { type: "readBook", id: "book.fencing" },
    ];
    return cmds.reduce((acc, c) => step(acc, c, cfg()).state, g);
  };

  it("読了した書物の gainVs が対象スキルの経験にだけ効く", () => {
    const plain = freshGame("e1", 0);
    const reader = buyAndRead(freshGame("e1", 100));
    expect(activeBookEffects(reader, booksCfg)).toHaveLength(1);
    // swordplay は 1.5 倍、他のスキルは変わらない
    expect(trainGain(reader, "swordplay", cfg())).toBeCloseTo(
      trainGain(plain, "swordplay", cfg()) * 1.5,
      10,
    );
    expect(trainGain(reader, "smithing", cfg())).toBeCloseTo(
      trainGain(plain, "smithing", cfg()),
      10,
    );
  });

  it("durationDays を過ぎると効果は消える", () => {
    const sleep = (g: GameState) =>
      step(g, { type: "sleep", inn: "cheap", dinner: false }, cfg()).state;
    // book.fencing は durationDays=3（読んだ当日0を含め day0,1,2 に有効）
    let g = buyAndRead(freshGame("e2", 100));
    expect(bookDaysLeft(g, booksCfg.books[0]!)).toBe(3);
    expect(activeBookEffects(g, booksCfg)).toHaveLength(1);
    g = sleep(g); // day 1
    expect(bookDaysLeft(g, booksCfg.books[0]!)).toBe(2);
    expect(activeBookEffects(g, booksCfg)).toHaveLength(1);
    g = sleep(g); // day 2
    expect(bookDaysLeft(g, booksCfg.books[0]!)).toBe(1);
    expect(activeBookEffects(g, booksCfg)).toHaveLength(1);
    g = sleep(g); // day 3：期限切れ
    expect(bookDaysLeft(g, booksCfg.books[0]!)).toBe(0);
    expect(activeBookEffects(g, booksCfg)).toHaveLength(0);
    const plain = freshGame("e2b", 0);
    expect(trainGain({ ...plain, time: g.time }, "swordplay", cfg())).toBeCloseTo(
      trainGain(g, "swordplay", cfg()),
      10,
    );
  });

  it("購入→読了→効果の一連が決定論的", () => {
    const run = () => {
      const cmds: Command[] = [
        { type: "buyBook", id: "book.fencing" },
        { type: "buyBook", id: "book.quiet" },
        { type: "readBook", id: "book.fencing" },
        { type: "train", skill: "swordplay", difficulty: 15 },
        { type: "sleep", inn: "normal", dinner: true },
      ];
      return cmds.reduce((acc, c) => step(acc, c, cfg()).state, freshGame("det", 100));
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe("棚条件（X-5：失われた書物は転生フラグが立つと棚に並ぶ）", () => {
  /** 条件なし書物＋転生フラグ条件の「先達の手記」を持つ書店 */
  const lostCfg: BooksConfig = {
    books: [
      ...booksCfg.books,
      {
        id: "book.lost_swordplay",
        price: 60,
        effect: { gainVs: { swordplay: 1.25 } },
        durationDays: 7,
        potentialRecover: { swordplay: 15 },
        condition: { flag: "lostbook.swordplay" },
      },
    ],
    potentialMax: 100,
  };
  /** 転生フラグが立った生（前世の剣技が閾値を超えて手記を遺した世界） */
  const reborn = (): GameState => {
    const g = freshGame("lb", 100);
    return { ...g, flags: { ...g.flags, "lostbook.swordplay": true } };
  };

  it("フラグ無しでは棚に並ばず、直接買おうとしても買えない", () => {
    const g = freshGame("lb0", 100);
    const shelf = shelfBooks(g, lostCfg, TIME);
    expect(shelf.map((b) => b.id)).not.toContain("book.lost_swordplay");
    // 条件なしの既存書物は変わらず並ぶ（棚全体が消えない）
    expect(shelf.map((b) => b.id)).toEqual(["book.fencing", "book.quiet", "book.plain"]);
    // 一覧に出さなくても購入側でも拒否する（抜け道を塞ぐ）
    expect(buyBook(g, "book.lost_swordplay", lostCfg, TIME).ok).toBe(false);
    // step の buyBook も同じ判定を通る
    const r = step(g, { type: "buyBook", id: "book.lost_swordplay" }, cfg(lostCfg));
    expect(r.events.some((e) => e.type === "bookBought")).toBe(false);
    expect(r.state.books.owned).toHaveLength(0);
  });

  it("フラグが立てば棚に並び、買って読める（通常の読了効果がそのまま働く）", () => {
    const g = reborn();
    const shelf = shelfBooks(g, lostCfg, TIME);
    expect(shelf.map((b) => b.id)).toContain("book.lost_swordplay");
    // 既存の条件なし書物も並び続ける
    expect(shelf.map((b) => b.id)).toContain("book.plain");

    const bought = buyBook(g, "book.lost_swordplay", lostCfg, TIME);
    expect(bought.ok).toBe(true);
    expect(bought.state.books.owned).toContain("book.lost_swordplay");

    // 素質を下げておくと potentialRecover が読了で効く
    const worn: GameState = {
      ...bought.state,
      player: {
        ...bought.state.player,
        skills: {
          ...bought.state.player.skills,
          swordplay: { ...bought.state.player.skills["swordplay"]!, potential: 80 },
        },
      },
    };
    const read = readBook(worn, "book.lost_swordplay", lostCfg);
    expect(read.ok).toBe(true);
    expect(read.recovered).toEqual([{ skill: "swordplay", amount: 15 }]);
    expect(hasReadBook(read.state, "book.lost_swordplay")).toBe(true);
    // 期間効果（gainVs 1.25）は activeBookEffects に現れる
    expect(activeBookEffects(read.state, lostCfg)).toEqual([{ gainVs: { swordplay: 1.25 } }]);
  });

  it("step 経由でも棚条件付き書物が買えて読める", () => {
    let g = reborn();
    const cmds: Command[] = [
      { type: "buyBook", id: "book.lost_swordplay" },
      { type: "readBook", id: "book.lost_swordplay" },
    ];
    for (const c of cmds) g = step(g, c, cfg(lostCfg)).state;
    expect(hasReadBook(g, "book.lost_swordplay")).toBe(true);
  });
});
