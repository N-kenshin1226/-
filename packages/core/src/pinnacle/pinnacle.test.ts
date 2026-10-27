import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import type { GameState } from "../state/types.js";
import { step, type StepConfig } from "../step.js";
import type { TimeConfig } from "../time/index.js";
import {
  checkPinnacles,
  isRouteVisible,
  nextStage,
  pinnacleFlag,
  pinnacleReached,
  reachedPinnacles,
  routeProgress,
  visiblePinnacles,
  type PinnacleRouteDef,
} from "./index.js";

const time: TimeConfig = {
  actionsPerDay: 5,
  timeOfDay: ["morning", "morning", "noon", "evening", "night"],
  daysPerWeek: 7,
  daysPerSeason: 28,
  seasonsPerYear: 4,
  moonCycleDays: 28,
  moonPhaseWindowDays: 1,
  startAge: 15,
};

const route: PinnacleRouteDef = {
  id: "test_route",
  name: "試しの頂",
  desc: "テスト用の条件鎖",
  title: "title.test_apex",
  stages: [
    {
      id: "first",
      name: "一段目",
      rank: "B",
      notice: "――頂点への段《一段目》に至りました。",
      condition: { counter: "kill.species.wolf", gte: 2 },
    },
    {
      id: "second",
      name: "二段目",
      rank: "A",
      notice: "――頂点への段《二段目》に至りました。",
      condition: { skill: "swordplay", gte: 50 },
    },
    {
      id: "apex",
      name: "頂点",
      rank: "S",
      notice: "――頂点《試しの頂》に至りました。",
      condition: { counter: "kill.species.wolf", gte: 10 },
    },
  ],
};

const mk = (): GameState =>
  newGame("seed", "名無し", {
    skillIds: ["swordplay", "smithing"],
    initialPotential: 100,
    initialStatValue: 10,
  });

describe("頂点ルートの進行（checkPinnacles / nextStage）", () => {
  it("次の段だけを評価し、達成するとフラグを刻む", () => {
    let s = mk();
    s = { ...s, counters: { "kill.species.wolf": 3 } };
    const r = checkPinnacles(s, [route], time);
    expect(r.reached.map((x) => x.stage.id)).toEqual(["first"]);
    expect(r.state.flags[pinnacleFlag("test_route", "first")]).toBe(true);
    // 1ステップに各ルート最大1段。second はまだ未評価
    expect(r.state.flags[pinnacleFlag("test_route", "second")]).toBeUndefined();
    expect(nextStage(r.state, route)?.id).toBe("second");
    expect(pinnacleReached(r.state, route)).toBe(false);
  });

  it("前段を越えるまで後段は見ない（順序性）", () => {
    // 2段目・最終段の条件を先に満たしていても、1段目が未達なら first しか進まない
    let s = mk();
    s = {
      ...s,
      counters: { "kill.species.wolf": 99 },
      player: {
        ...s.player,
        skills: {
          ...s.player.skills,
          swordplay: { ...s.player.skills.swordplay!, value: 60 },
        },
      },
    };
    const r1 = checkPinnacles(s, [route], time);
    expect(r1.reached.map((x) => x.stage.id)).toEqual(["first"]);
    const r2 = checkPinnacles(r1.state, [route], time);
    expect(r2.reached.map((x) => x.stage.id)).toEqual(["second"]);
    const r3 = checkPinnacles(r2.state, [route], time);
    expect(r3.reached.map((x) => x.stage.id)).toEqual(["apex"]);
    expect(pinnacleReached(r3.state, route)).toBe(true);
    expect(reachedPinnacles(r3.state, [route])).toEqual(["test_route"]);
    expect(routeProgress(r3.state, route)).toEqual({ done: 3, total: 3, complete: true });
  });

  it("条件が足りなければ進まず、state は変わらない", () => {
    const s = mk();
    const r = checkPinnacles(s, [route], time);
    expect(r.reached).toEqual([]);
    expect(r.state).toBe(s); // 参照もそのまま
    expect(nextStage(s, route)?.id).toBe("first");
    expect(routeProgress(s, route)).toEqual({ done: 0, total: 3, complete: false });
  });

  it("S段に8割近づくと気配を立てる（条件は明かさない・1日1回まで）", () => {
    // 前2段は達成済みにして apex（S）を次段にする
    let s = mk();
    s = {
      ...s,
      flags: {
        [pinnacleFlag("test_route", "first")]: true,
        [pinnacleFlag("test_route", "second")]: true,
      },
      counters: { "kill.species.wolf": 8 }, // 10 の 8 割
    };
    const r = checkPinnacles(s, [route], time);
    expect(r.kehai).toEqual([pinnacleFlag("test_route", "apex")]);
    expect(r.state.notify.kehai).toContain(pinnacleFlag("test_route", "apex"));
    // 同日2回目は出ない
    expect(checkPinnacles(r.state, [route], time).kehai).toEqual([]);
  });
});

// ---- step() への配線：段のイベントと頂点称号 ----

const cfg: StepConfig = {
  time,
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
    hitBase: 0.86,
    hitPerSwordplay: 0.002,
    hitPerAgilityDiff: 0.012,
    hitMin: 0.45,
    hitMax: 0.98,
    varianceMin: 0.8,
    varianceMax: 1.25,
    critBase: 0.08,
    critPerSwordplay: 0.002,
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
  society: { standings: [], professions: [], lifeGoals: [], goalRewardFactor: 1 },
  lore: { atoms: [], connections: [] },
  titles: [
    {
      id: "title.test_apex",
      rank: "S",
      // 頂点称号は「最終段のフラグ」を条件にする（titles.json と同じ構造）
      condition: { flag: "pinnacle.test_route.apex" },
    },
  ],
  pinnacles: [route],
};

// ---- 大賢者型の条件鎖（X-4）：読了数・知識フラグ・仕事を通った段進行 ----

const sageRoute: PinnacleRouteDef = {
  id: "sage_like",
  name: "賢者もどき",
  desc: "読む系の条件を含む条件鎖の確認用",
  title: "title.sage_apex",
  stages: [
    {
      id: "voracity",
      name: "読書の虫",
      rank: "B",
      notice: "――頂点への段《読書の虫》に至りました。",
      condition: {
        and: [
          { counter: "action.read", gte: 2 },
          { skill: "observation", gte: 20 },
        ],
      },
    },
    {
      id: "discerning",
      name: "鑑定の眼",
      rank: "A",
      notice: "――頂点への段《鑑定の眼》に至りました。",
      condition: {
        and: [{ skill: "appraisal", gte: 45 }, { work: { kind: "appraisal", tierGte: 2 } }],
      },
    },
    {
      id: "forbidden",
      name: "禁書の探索",
      rank: "A",
      notice: "――頂点への段《禁書の探索》に至りました。",
      condition: {
        and: [{ flag: "found.taboo_codex" }, { skill: "appraisal", gte: 65 }],
      },
    },
    {
      id: "apex",
      name: "世界の真理",
      rank: "S",
      notice: "――頂点《賢者もどき》に至りました。",
      condition: {
        and: [{ flag: "knows.world_truth" }, { skill: "appraisal", gte: 90 }],
      },
    },
  ],
};

describe("読む系の条件を含む条件鎖（X-4 大賢者型）", () => {
  it("カウンタ action.read・知識フラグ・仕事の条件でも順に段が進む", () => {
    let s = newGame("seed", "読み手", {
      skillIds: ["observation", "appraisal", "eloquence"],
      initialPotential: 100,
      initialStatValue: 10,
    });
    // 1段目：読了2回＋観察20
    s = {
      ...s,
      counters: { "action.read": 2 },
      player: {
        ...s.player,
        skills: { ...s.player.skills, observation: { ...s.player.skills.observation!, value: 20 } },
      },
    };
    const r1 = checkPinnacles(s, [sageRoute], time);
    expect(r1.reached.map((x) => x.stage.id)).toEqual(["voracity"]);
    expect(nextStage(r1.state, sageRoute)?.id).toBe("discerning");

    // 2段目は flag が立つまで進まない（3段目の旗を先に立てても順序は変わらない）
    const withFlag = {
      ...r1.state,
      flags: { ...r1.state.flags, "found.taboo_codex": true, "knows.world_truth": true },
    };
    const r2 = checkPinnacles(withFlag, [sageRoute], time);
    expect(r2.reached).toEqual([]); // 2段目（鑑定＋仕事）が未達なので進まない
    expect(nextStage(r2.state, sageRoute)?.id).toBe("discerning");
  });

  it("最終段（S）は知識フラグと技能の両方が要る", () => {
    let s = newGame("seed", "読み手", {
      skillIds: ["observation", "appraisal", "eloquence"],
      initialPotential: 100,
      initialStatValue: 10,
    });
    s = {
      ...s,
      flags: {
        "pinnacle.sage_like.voracity": true,
        "pinnacle.sage_like.discerning": true,
        "pinnacle.sage_like.forbidden": true,
      },
      player: {
        ...s.player,
        skills: { ...s.player.skills, appraisal: { ...s.player.skills.appraisal!, value: 95 } },
      },
    };
    // 旗が無いと最終段は進まない
    expect(checkPinnacles(s, [sageRoute], time).reached).toEqual([]);
    // 旗が立つと頂点に至る
    const done = checkPinnacles(
      { ...s, flags: { ...s.flags, "knows.world_truth": true } },
      [sageRoute],
      time,
    );
    expect(done.reached.map((x) => x.stage.id)).toEqual(["apex"]);
    expect(pinnacleReached(done.state, sageRoute)).toBe(true);
  });
});

describe("step() の頂点ルート統合（T-41）", () => {
  it("段に達すると pinnacleStageReached イベントが出てランクを持つ", () => {
    let s = mk();
    s = { ...s, counters: { "kill.species.wolf": 3 } };
    const r = step(s, { type: "wait" }, cfg);
    const ev = r.events.find((e) => e.type === "pinnacleStageReached");
    expect(ev).toEqual({
      type: "pinnacleStageReached",
      route: "test_route",
      stage: "first",
      rank: "B",
    });
    expect(r.state.flags["pinnacle.test_route.first"]).toBe(true);
    expect(r.state.titles).toEqual([]);
  });

  it("最終段に達すると頂点称号（S）が授かる", () => {
    let s = mk();
    s = {
      ...s,
      counters: { "kill.species.wolf": 99 },
      flags: {
        "pinnacle.test_route.first": true,
        "pinnacle.test_route.second": true,
      },
      player: {
        ...s.player,
        skills: {
          ...s.player.skills,
          swordplay: { ...s.player.skills.swordplay!, value: 60 },
        },
      },
    };
    const r = step(s, { type: "wait" }, cfg);
    expect(r.events).toContainEqual({
      type: "pinnacleStageReached",
      route: "test_route",
      stage: "apex",
      rank: "S",
    });
    // 頂点称号は既存の称号判定が最終段フラグを拾って授ける
    expect(r.events).toContainEqual({ type: "titleGained", id: "title.test_apex", rank: "S" });
    expect(r.state.titles).toContain("title.test_apex");
    expect(pinnacleReached(r.state, route)).toBe(true);
    expect(reachedPinnacles(r.state, [route])).toEqual(["test_route"]);
  });

  it("pinnacles を渡さなければ条件鎖は評価しない", () => {
    const { pinnacles: _omit, ...noP } = cfg;
    let s = mk();
    s = { ...s, counters: { "kill.species.wolf": 3 } };
    const r = step(s, { type: "wait" }, noP);
    expect(r.events.find((e) => e.type === "pinnacleStageReached")).toBeUndefined();
    expect(r.state.flags["pinnacle.test_route.first"]).toBeUndefined();
  });
});

// ---- 隠しルート（X-9）：発見フラグが立つまで段を評価しない ----

const hiddenRoute: PinnacleRouteDef = {
  id: "hidden_route",
  name: "伏せの頂",
  desc: "噂でだけ聞こえる条件鎖",
  title: "title.test_apex",
  hidden: { flag: "found.hidden_route" },
  stages: [
    {
      id: "first",
      name: "一段目",
      rank: "B",
      notice: "――頂点への段《一段目》に至りました。",
      condition: { counter: "kill.species.wolf", gte: 1 },
    },
    {
      id: "apex",
      name: "頂点",
      rank: "S",
      notice: "――頂点《伏せの頂》に至りました。",
      condition: { counter: "kill.species.wolf", gte: 3 },
    },
  ],
};

describe("隠しルート（X-9 伏せられた頂点）", () => {
  it("発見フラグが立つまで一覧にも段評価にも出ない（通知・気配の漏えいなし）", () => {
    let s = mk();
    // 条件は全部満たしているが、未発見なら段は立たない
    s = { ...s, counters: { "kill.species.wolf": 99 } };
    expect(isRouteVisible(hiddenRoute, s.flags)).toBe(false);
    expect(visiblePinnacles([route, hiddenRoute], s.flags).map((r) => r.id)).toEqual([
      "test_route",
    ]);
    const r = checkPinnacles(s, [hiddenRoute], time);
    expect(r.reached).toEqual([]);
    expect(r.kehai).toEqual([]);
    expect(r.state.flags["pinnacle.hidden_route.first"]).toBeUndefined();

    // step() 経由でも同じ：未発見ならイベントは出ない
    const st = step(s, { type: "wait" }, { ...cfg, pinnacles: [hiddenRoute] });
    expect(st.events.find((e) => e.type === "pinnacleStageReached")).toBeUndefined();
  });

  it("発見フラグが立つと一覧に出て、段の評価が始まる", () => {
    let s = mk();
    s = {
      ...s,
      counters: { "kill.species.wolf": 1 },
      flags: { "found.hidden_route": true },
    };
    expect(isRouteVisible(hiddenRoute, s.flags)).toBe(true);
    expect(visiblePinnacles([route, hiddenRoute], s.flags).map((r) => r.id)).toEqual([
      "test_route",
      "hidden_route",
    ]);
    const r = checkPinnacles(s, [hiddenRoute], time);
    expect(r.reached.map((x) => x.stage.id)).toEqual(["first"]);
  });

  it("段フラグが既に立っているルートは発見フラグが無くても見せる（セーブ互換）", () => {
    const s = mk();
    const progressed = {
      ...s,
      flags: { [pinnacleFlag("hidden_route", "first")]: true },
    };
    expect(isRouteVisible(hiddenRoute, progressed.flags)).toBe(true);
  });

  it("hidden の無いルートは常に見せる", () => {
    const s = mk();
    expect(isRouteVisible(route, s.flags)).toBe(true);
  });
});

describe("街への寄付（X-9 領主ルートの基盤）", () => {
  const cfgDonate: StepConfig = { ...cfg, donation: { amount: 50 } };

  it("1行動で設定額を納め、town.donated に累計される", () => {
    let s = mk();
    s = { ...s, player: { ...s.player, money: 200 } };
    const r = step(s, { type: "donate" }, cfgDonate);
    expect(r.events).toContainEqual({ type: "donated", amount: 50 });
    expect(r.state.player.money).toBe(150);
    expect(r.state.counters["town.donated"]).toBe(50);
    expect(r.state.counters["action.donate"]).toBe(1);
    // 累計：2回目は100
    const r2 = step(r.state, { type: "donate" }, cfgDonate);
    expect(r2.state.counters["town.donated"]).toBe(100);
  });

  it("所持金が足りない・設定が無いときは何も起きない（行動も消費しない）", () => {
    const s = mk(); // money 0
    const r = step(s, { type: "donate" }, cfgDonate);
    expect(r.events.find((e) => e.type === "donated")).toBeUndefined();
    expect(r.state.player.money).toBe(0);
    expect(r.state.counters["town.donated"]).toBeUndefined();
    // 設定自体が無いときも同じ
    let s2 = mk();
    s2 = { ...s2, player: { ...s2.player, money: 999 } };
    const r2 = step(s2, { type: "donate" }, cfg);
    expect(r2.events.find((e) => e.type === "donated")).toBeUndefined();
    expect(r2.state.player.money).toBe(999);
  });
});
