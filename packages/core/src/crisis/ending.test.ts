import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createRng } from "../rng/index.js";
import { newGame } from "../state/newGame.js";
import type { GameState } from "../state/types.js";
import type { GameTime, TimeConfig } from "../time/index.js";
import {
  crisisEnding,
  crisisEpilogue,
  crisisOfferSpeaker,
  crisisSceneHaze,
  crisisSeasonTurn,
  crisisStageLine,
  type CrisisConfig,
  type CrisisEndingText,
  type CrisisTypeDef,
} from "./index.js";

/**
 * 終幕の見せ方（W-04、docs/08 §3・§7）のテスト。
 * 公開サンプルの危機の型（packages/content/crises/sample.json）と実際の語り
 * （text/narration.json）だけを使う ―― packages/content/hidden/ は絶対に読まない。
 * すべて世界シード由来の決定的な進行で、同じseedからは同じ結末が出る
 */

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
const readJson = (rel: string) =>
  JSON.parse(readFileSync(join(CONTENT, rel), "utf8")) as Record<string, unknown>;

const sample = readJson("crises/sample.json") as { crises: CrisisTypeDef[] };
const balance = readJson("balance.json") as {
  crisis: {
    strongFields: number;
    weakFieldFactor: number;
    touchpoints?: unknown;
    involvement?: Record<string, unknown> & { rivals?: Record<string, unknown> };
  };
  rivals: { size: number };
};
const rivals = readJson("rivals.json") as {
  names: string[];
  epithets: string[];
  crisis?: { heroEpithets?: string[] };
};
const TEXT = (readJson("text/narration.json") as { crisis: CrisisEndingText }).crisis;

/** 公開サンプルの危機設定（balance.crisis＋rivals.json の実値で組み立てる） */
const crisisCfg = (types: readonly CrisisTypeDef[]): CrisisConfig => ({
  types,
  strongFields: balance.crisis.strongFields,
  weakFieldFactor: balance.crisis.weakFieldFactor,
  ...(balance.crisis.touchpoints !== undefined
    ? { touchpoints: balance.crisis.touchpoints as CrisisConfig["touchpoints"] }
    : {}),
  involvement:
    balance.crisis.involvement === undefined
      ? undefined
      : ({
          ...balance.crisis.involvement,
          rivals: {
            ...balance.crisis.involvement.rivals,
            names: rivals.names,
            epithets: rivals.epithets,
            heroEpithets: rivals.crisis?.heroEpithets ?? [],
            size: balance.rivals.size,
          },
        } as unknown as CrisisConfig["involvement"]),
});

// 公開サンプルは複数の型を持つが、ここでは語り行を検証したい型（sample_mist）に絞る。
// 型の抽選は重み付きなので、プールを1型にすることで結末・語り・場面idが決定的になる
const MIST = sample.crises.find((c) => c.id === "crisis.sample_mist")!;
const CFG = crisisCfg([MIST]);

const TIME: TimeConfig = {
  actionsPerDay: 5,
  timeOfDay: ["morning", "morning", "noon", "evening", "night"],
  daysPerWeek: 7,
  daysPerSeason: 4, // 季節を短くして変わり目を速く試す
  seasonsPerYear: 4,
  moonCycleDays: 28,
  moonPhaseWindowDays: 1,
  startAge: 15,
};

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "eloquence"];

const freshWorld = (seed: string, c: CrisisConfig = CFG): GameState =>
  newGame(seed, "試し", {
    skillIds: SKILL_IDS,
    initialPotential: 100,
    initialStatValue: 10,
    crisis: c,
  });

/** 季節の変わり目を step なしで回す（crisisEpilogue と同じ先読みの形） */
const turn = (s: GameState, from: GameTime, c = CFG): GameState => {
  const to: GameTime = { day: from.day + TIME.daysPerSeason, action: 0 };
  return crisisSeasonTurn({ ...s, time: to }, c, TIME, from).state;
};

/** 世界を決着まで進める（一切の主人公の行動なし。決定的） */
const endWorld = (seed: string, c = CFG): GameState => {
  let s = freshWorld(seed, c);
  let from = s.time;
  for (let i = 0; i < 24 && s.crisis?.outcome === "ongoing"; i++) {
    s = turn(s, from, c);
    from = { day: from.day + TIME.daysPerSeason, action: 0 };
  }
  return s;
};

describe("crisisEnding（終幕の素材）", () => {
  it("進行中・危機の無い世界では null（終幕の画面は出さない）", () => {
    expect(crisisEnding(freshWorld("w04-a"), CFG, TEXT)).toBeNull();
    expect(
      crisisEnding(
        newGame("w04-b", "無", {
          skillIds: SKILL_IDS,
          initialPotential: 100,
          initialStatValue: 10,
        }),
        CFG,
        TEXT,
      ),
    ).toBeNull();
  });

  it("公開サンプルが決着すると、型の語り＋年代記の頁＋痕の頁＋痕跡が揃う", () => {
    const s = endWorld("w04-end");
    expect(s.crisis?.outcome).toBe("resolved"); // サンプルは重くない危機：必ず決着する
    const e = crisisEnding(s, CFG, TEXT);
    expect(e).not.toBeNull();
    expect(e!.outcome).toBe("resolved");
    expect(e!.typeId).toBe("crisis.sample_mist");
    // 語りは危機の型の narration ref を本文に解決する。変数はすべて差し込まれる
    expect(e!.narration.length).toBeGreaterThan(0);
    for (const line of e!.narration) {
      expect(line).not.toMatch(/\{\w+\}/);
    }
    expect(e!.narration.join("\n")).toContain("霧");
    // 年代記の一頁＝世界の記録。end.resolved の行を含む
    expect(e!.page).toBe(s.crisis!.log);
    expect(e!.page.some((x) => x.kind === "end.resolved")).toBe(true);
    // 痕跡：関与なし（段階1）でも1行残る。{var} の埋められない行は選ばれない
    expect(e!.trace.length).toBe(1);
    expect(e!.trace[0]).not.toMatch(/\{\w+\}/);
    // 同じ状態からは同じ終幕が出る（シードで決定的）
    expect(crisisEnding(s, CFG, TEXT)).toEqual(e);
  });

  it("重い危機が全敗すると滅びの終幕になる（型は公開サンプル由来の重い派生）", () => {
    const heavy = crisisCfg([
      {
        ...MIST,
        id: "crisis.sample_mist_heavy",
        heavy: true,
        finales: MIST.finales.map((f) => ({ ...f, required: 999999 })),
      },
    ]);
    const s = endWorld("w04-ruin", heavy);
    expect(s.crisis?.outcome).toBe("ruin");
    const e = crisisEnding(s, heavy, TEXT);
    expect(e).not.toBeNull();
    expect(e!.outcome).toBe("ruin");
    expect(e!.narration.join("\n")).toContain("呑み込んだ");
    expect(e!.page.some((x) => x.kind === "end.ruin")).toBe(true);
    expect(e!.trace[0]).not.toMatch(/\{\w+\}/);
  });

  it("語りrefの無い型には汎用の終幕が使われる", () => {
    const bare = crisisCfg([
      {
        ...MIST,
        id: "crisis.sample_mist_bare",
        narration: undefined,
        finales: [{ ...MIST.finales[0]!, atBoundary: 1, required: 0 }],
      },
    ]);
    const s = endWorld("w04-bare", bare);
    expect(s.crisis?.outcome).toBe("resolved");
    const e = crisisEnding(s, bare, TEXT);
    expect(e!.narration.length).toBeGreaterThan(0);
  });
});

describe("crisisStageLine（新聞・噂の危機の記事）", () => {
  it("進行中は段階の噂が出るが、段階の番号・メーターは出ない", () => {
    const s = turn(freshWorld("w04-line"), freshWorld("w04-line").time);
    const line = crisisStageLine(s, CFG, TEXT, createRng("w04-line:x"));
    expect(line).not.toBeNull();
    expect(typeof line).toBe("string");
    // 段階名・index・進行度の数字は出さない（docs/08 §3）
    expect(line).not.toMatch(/段階|stage|拡大|兆し|深刻|\d+\/\d+/i);
  });

  it("同じ乱数列からは同じ噂が出る（決定的）", () => {
    const s = endWorld("w04-det");
    const a = crisisStageLine(s, CFG, TEXT, createRng("k"));
    const b = crisisStageLine(s, CFG, TEXT, createRng("k"));
    expect(a).toBe(b);
  });

  it("解決した世界では噂に残らない（null）。滅びた世は滅びの噂が流れる", () => {
    const s = endWorld("w04-end");
    expect(crisisStageLine(s, CFG, TEXT, createRng("z"))).toBeNull();
    const heavy = crisisCfg([
      {
        ...MIST,
        id: "crisis.sample_mist_heavy2",
        heavy: true,
        finales: MIST.finales.map((f) => ({ ...f, required: 999999 })),
      },
    ]);
    const r = endWorld("w04-ruin2", heavy);
    const line = crisisStageLine(r, heavy, TEXT, createRng("z"));
    expect(line).not.toBeNull();
    expect(line).toContain("滅び");
  });
});

describe("crisisEpilogue（転生の年代記の後日談）", () => {
  it("決着を生きて見届けた生は witnessed=true で同じ結末を返す", () => {
    const s = endWorld("w04-end");
    expect(crisisEpilogue(s, CFG, TIME)).toEqual({ outcome: "resolved", witnessed: true });
  });

  it("未決着の生は、主人公なしの世界の結末を同じ決定論で先読みする", () => {
    const ep = crisisEpilogue(freshWorld("w04-ep"), CFG, TIME);
    expect(ep).not.toBeNull();
    expect(ep!.witnessed).toBe(false);
    // サンプルは重くない危機：世界は必ず（苦戦の末でも）決着する
    expect(ep!.outcome).toBe("resolved");
    // 同じ状態からは同じ予見（決定的）
    expect(crisisEpilogue(freshWorld("w04-ep"), CFG, TIME)).toEqual(ep);
  });

  it("危機の無い世界では null（後日談は足さない）", () => {
    const s = newGame("w04-none", "無", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    expect(crisisEpilogue(s, CFG, TIME)).toBeNull();
  });
});

describe("crisisOfferSpeaker / crisisSceneHaze（打診の運び手・景色の差分）", () => {
  it("打診を運ぶ人はその場面に最も備えた勢力で、決定的", () => {
    const s = freshWorld("w04-offer");
    const speaker = crisisOfferSpeaker(s, CFG, "finale.patrol");
    expect(speaker).not.toBeNull();
    expect(MIST.factions.map((f) => f.name)).toContain(speaker);
    expect(crisisOfferSpeaker(s, CFG, "finale.patrol")).toBe(speaker);
    expect(crisisOfferSpeaker(s, CFG, "finale.nonexistent")).toBeNull();
  });

  it("霞は段階に応じて深まり、解決で晴れ、滅びで強く翳る", () => {
    const start = freshWorld("w04-haze");
    expect(crisisSceneHaze(start, CFG)).toBeCloseTo(0.15, 5);
    // 1変わり目で段階が進むがまだ進行中（サンプルの最初の決着は2変わり目）
    const deep = turn(start, start.time);
    expect(deep.crisis?.outcome).toBe("ongoing");
    expect(crisisSceneHaze(deep, CFG)).toBeGreaterThan(crisisSceneHaze(start, CFG));
    expect(crisisSceneHaze(endWorld("w04-end"), CFG)).toBe(0);
    const heavy = crisisCfg([
      {
        ...MIST,
        id: "crisis.sample_mist_heavy3",
        heavy: true,
        finales: MIST.finales.map((f) => ({ ...f, required: 999999 })),
      },
    ]);
    expect(crisisSceneHaze(endWorld("w04-ruin3", heavy), heavy)).toBe(0.8);
    // 危機の無い世界は霞まない
    expect(
      crisisSceneHaze(
        newGame("w04-nh", "無", {
          skillIds: SKILL_IDS,
          initialPotential: 100,
          initialStatValue: 10,
        }),
        CFG,
      ),
    ).toBe(0);
  });
});

describe("npcExists（X-19：居る人物に限る離散・死亡の記録）", () => {
  it("居ない人物は段階が進んでも離散・死亡として記録されない（生成地方対応）", () => {
    // sample の両方の deep 段には npc.sado の離散がある（実コンテンツ）。
    // npcExists が全員「居ない」と返す世界では npcGone・ログに残らない
    const none: CrisisConfig = { ...CFG, npcExists: () => false };
    const s = endWorld("w04-npcx", none);
    expect(s.crisis?.npcGone ?? []).toEqual([]);
    expect(
      (s.crisis?.log ?? []).filter((l) => l.kind === "npc.leave" || l.kind === "npc.die"),
    ).toEqual([]);
  });
  it("npcExists 省略時は従来どおり記録される（固定マップ・後方互換）", () => {
    const s = endWorld("w04-npcy");
    expect((s.crisis?.npcGone ?? []).some((n) => n.id === "npc.sado")).toBe(true);
  });
});
