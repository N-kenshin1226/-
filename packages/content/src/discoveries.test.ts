import {
  checkDiscoveries,
  dailyDiscoveryHint,
  describe as describeTime,
  discoveryHintText,
  discoveryParams,
  foundFlagKey,
  newGame,
  unfoundDiscoveries,
  weatherOf,
  type Cond,
  type CondEnv,
  type DiscoveryDef,
  type GameState,
  type WeatherConfig,
} from "@trace/core";
import { describe, expect, it } from "vitest";
import { balance } from "./balance.js";
import { books } from "./books.js";
import { cliText } from "./cli-text.js";
import { discoveries } from "./discoveries.js";
import { atoms, canon, canonIds } from "./lore.js";
import { pinnacles } from "./pinnacles.js";
import { skills } from "./skills.js";
import { society } from "./society.js";
import { titles } from "./titles.js";
import { weather } from "./weather.js";

/**
 * discoveries.json（X-11・X-16、docs/03 §5）のテスト。
 * ・天候条件の発見は、その天候の日（＋時刻・月齢・行動履歴の組合せ）にだけ見つかる
 * ・見つけていない発見のヒントは日替わりの噂ローテーションを全件回り、
 *   {weekday}/{moon} などは世界シードの抽選値に差し替わる
 * ・一度見つけた発見は二度と発火しない（冪等）
 * ・発見の旗は宙に浮かない：読み手（アトム・本・称号）が実在する
 */

const TIME = balance.time;
const WEATHER_CFG: WeatherConfig = {
  kinds: weather.kinds,
  orderPrice: balance.weather.orderPrice,
};
const ENV: CondEnv = { weather: WEATHER_CFG };

const newGameCfg = {
  skillIds: skills.skills.map((s) => s.id),
  initialPotential: 100,
  initialStatValue: 10,
  initialMoney: 50,
};

const def = (id: string): DiscoveryDef => {
  const d = discoveries.discoveries.find((x) => x.id === id);
  if (!d) throw new Error(`discoveries.json に ${id} が無い`);
  return d;
};

/** 指定した日・行動インデックスにいる state（時刻帯・月齢・曜日は day から導出） */
const worldAt = (seed: string, day: number, action: number): GameState => {
  const s = newGame(seed, "名無し", newGameCfg);
  s.time = { day, action };
  return s;
};

/** seed の世界で pred を満たす最初の日（天候表・暦は本番のもの） */
const dayWith = (seed: string, pred: (day: number) => boolean, span = 365): number => {
  for (let d = 0; d < span; d++) if (pred(d)) return d;
  throw new Error("条件に合う日が見つからない");
};

const weatherOn = (seed: string, day: number): string =>
  weatherOf(seed, day, WEATHER_CFG, TIME).kind.id;

const moonOn = (day: number) => describeTime({ day, action: 0 }, TIME).moon;

/** 条件木に {weather} 語彙が1箇所でも含まれるか */
const hasWeather = (c: Cond): boolean => {
  if ("weather" in c) return true;
  if ("and" in c) return c.and.some(hasWeather);
  if ("or" in c) return c.or.some(hasWeather);
  if ("not" in c) return hasWeather(c.not);
  return false;
};

/** 条件木に書かれた旗印を全部集める（setFlags の読み手検査用） */
const flagsInCond = (c: Cond, out: Set<string>): void => {
  if ("flag" in c) out.add(c.flag);
  if ("and" in c) for (const x of c.and) flagsInCond(x, out);
  if ("or" in c) for (const x of c.or) flagsInCond(x, out);
  if ("not" in c) flagsInCond(c.not, out);
};

describe("discoveries.json（X-16 天候発見の拡充）", () => {
  it("新しい3件はいずれも {weather} を条件に含み、天候が異なる（雪・晴れ・雨）", () => {
    const ids = discoveries.discoveries.map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining(["rain_well", "snow_hermit", "star_terrace", "evening_rainbow"]),
    );
    for (const id of ["snow_hermit", "star_terrace", "evening_rainbow"]) {
      expect(hasWeather(def(id).condition), `${id} の条件に {weather} が無い`).toBe(true);
    }
  });

  it("雪隠れの庵：雪の朝にだけ見つかる（雪は冬限定・日が高くなると出ない）", () => {
    const d = def("snow_hermit");
    const seed = "x16-a";
    const snowDay = dayWith(seed, (day) => weatherOn(seed, day) === "snow");
    // 雪は冬にだけ降る（weather.json の重み。季節添字3）
    expect(describeTime({ day: snowDay, action: 0 }, TIME).season).toBe(3);
    const dryDay = dayWith(seed, (day) => weatherOn(seed, day) !== "snow");

    // 雪の朝（1手目＝timeOfDay が morning の内）→ 見つかる
    const res = checkDiscoveries(worldAt(seed, snowDay, 1), [d], TIME, ENV);
    expect(res.found.map((x) => x.id)).toEqual(["snow_hermit"]);
    expect(res.state.flags["found.snow_hermit"]).toBe(true);

    // 同じ雪の日でも夕方には出ない —— 足跡は朝のうちだけ残る
    expect(checkDiscoveries(worldAt(seed, snowDay, 3), [d], TIME, ENV).found).toEqual([]);
    // 雪でない日の朝は出ない
    expect(checkDiscoveries(worldAt(seed, dryDay, 1), [d], TIME, ENV).found).toEqual([]);
  });

  it("星見の丘：快晴の夜＋世界シードで引いた月齢にだけ見つかる", () => {
    const d = def("star_terrace");
    const seed = "x16-b";
    // seeded.moon：この世界ではどの月齢が鍵か、世界シードから決定的に引かれる
    const drawn = discoveryParams(d, seed, TIME).moon;
    expect(drawn).toBeDefined();
    expect(discoveryParams(d, seed, TIME).moon).toBe(drawn); // 同じ世界では同じ値

    // 抽選の月齢・快晴・夜 → 見つかる
    const hitDay = dayWith(
      seed,
      (day) => moonOn(day) === drawn && weatherOn(seed, day) === "clear",
    );
    const res = checkDiscoveries(worldAt(seed, hitDay, 4), [d], TIME, ENV);
    expect(res.found.map((x) => x.id)).toEqual(["star_terrace"]);
    expect(res.state.flags["found.star_terrace"]).toBe(true);
    expect(res.state.flags["seen.star_terrace"]).toBe(true);

    // 快晴でも月齢が違えば出ない
    const wrongMoon = dayWith(
      seed,
      (day) => moonOn(day) !== drawn && weatherOn(seed, day) === "clear",
    );
    expect(checkDiscoveries(worldAt(seed, wrongMoon, 4), [d], TIME, ENV).found).toEqual([]);
    // 同じ月齢でも空が晴れていなければ出ない
    const covered = dayWith(
      seed,
      (day) => moonOn(day) === drawn && weatherOn(seed, day) !== "clear",
    );
    expect(checkDiscoveries(worldAt(seed, covered, 4), [d], TIME, ENV).found).toEqual([]);
    // 快晴で月齢も合っても、夜でなければ出ない
    expect(checkDiscoveries(worldAt(seed, hitDay, 1), [d], TIME, ENV).found).toEqual([]);
  });

  it("夕雨の虹：雨の日に働いた者だけが、夕方に見つかる（行動履歴×時刻×天候）", () => {
    const d = def("evening_rainbow");
    const seed = "x16-c";
    const rainDay = dayWith(seed, (day) => weatherOn(seed, day) === "rain");
    const dryDay = dayWith(seed, (day) => weatherOn(seed, day) !== "rain");

    const worked = (day: number, action: number): GameState => {
      const s = worldAt(seed, day, action);
      s.actionLog.push({ day, kind: "work", target: "smithing" });
      return s;
    };

    // 雨の日に働き、夕方（4手目＝timeOfDay が evening）にいる → 見つかる
    const res = checkDiscoveries(worked(rainDay, 3), [d], TIME, ENV);
    expect(res.found.map((x) => x.id)).toEqual(["evening_rainbow"]);
    expect(res.state.flags["seen.evening_rainbow"]).toBe(true);

    // 雨の夕方でも、働いていなければ出ない
    expect(checkDiscoveries(worldAt(seed, rainDay, 3), [d], TIME, ENV).found).toEqual([]);
    // 働いていても、雨でなければ出ない
    expect(checkDiscoveries(worked(dryDay, 3), [d], TIME, ENV).found).toEqual([]);
    // 雨・仕事・でも朝では出ない（虹は夕暮れにだけ架かる）
    expect(checkDiscoveries(worked(rainDay, 1), [d], TIME, ENV).found).toEqual([]);
  });

  it("ヒントは未発見の発見を日替わりで全件回り、変数は世界シードの表示名に差し替わる", () => {
    const seed = "x16-d";
    const s = worldAt(seed, 0, 0);
    const defs = discoveries.discoveries;
    const pending = unfoundDiscoveries(s, defs);
    expect(pending).toHaveLength(defs.length);

    // 日替わりローテーション：日付をずらすと定義順に全部が回る（新しい3件も輪に入る）
    const ids = pending.map((_, i) => dailyDiscoveryHint(worldAt(seed, i, 0), defs)?.id);
    expect(ids).toEqual(pending.map((p) => p.id));
    expect(ids).toEqual(expect.arrayContaining(["snow_hermit", "star_terrace", "evening_rainbow"]));

    // すべてのヒントが {…} を残さない（seeded で引いた分だけ表示名に差し替わる）
    const names = {
      weekday: (i: number) => `${cliText.display.weekdayNames[i] ?? i}曜日`,
      moon: (p: keyof typeof cliText.display.moonNames) => cliText.display.moonNames[p],
      season: (i: number) => cliText.display.seasonNames[i] ?? String(i),
      dayOfSeason: (i: number) => `${i + 1}日目`,
    };
    for (const d of defs) {
      const text = discoveryHintText(d, seed, TIME, names);
      expect(text, `${d.id} のヒントに未解決の変数`).not.toContain("{");
      expect(text).not.toContain("}");
    }
    // 星見の丘のヒントは、この世界で引いた月齢の名を語る
    const moonName = names.moon(discoveryParams(def("star_terrace"), seed, TIME).moon!);
    expect(discoveryHintText(def("star_terrace"), seed, TIME, names)).toContain(moonName);
  });

  it("冪等：一度見つけた発見は二度と発火せず、ヒントの輪からも外れる", () => {
    const d = def("snow_hermit");
    const seed = "x16-a";
    const snowDay = dayWith(seed, (day) => weatherOn(seed, day) === "snow");

    const first = checkDiscoveries(worldAt(seed, snowDay, 1), [d], TIME, ENV);
    expect(first.found).toHaveLength(1);
    // 同じ条件が揃っても二度目は出ない
    expect(checkDiscoveries(first.state, [d], TIME, ENV).found).toEqual([]);
    // 発見済みは噂ヒントの供給元から外れる
    expect(unfoundDiscoveries(first.state, [d])).toEqual([]);
    expect(dailyDiscoveryHint(first.state, [d])).toBeNull();
  });

  it("発見の旗は宙に浮かない：setFlags は本・称号・アトムのどれかが読み書きする", () => {
    // 条件DSLから旗を読むコンテンツ全部（本の棚・称号・人生目標・頂点ルート）
    const readerFlags = new Set<string>();
    for (const b of books.books) if (b.condition) flagsInCond(b.condition, readerFlags);
    for (const t of titles.titles) flagsInCond(t.condition, readerFlags);
    for (const g of society.lifeGoals) flagsInCond(g.condition, readerFlags);
    for (const r of pinnacles.pinnacles) {
      if (r.hidden) readerFlags.add(r.hidden.flag);
      for (const s of r.stages) flagsInCond(s.condition, readerFlags);
    }
    // X-16 で立てた旗は、必ずどれかの条件に読まれていること
    for (const flag of [...def("star_terrace").setFlags, ...def("evening_rainbow").setFlags]) {
      expect(readerFlags.has(flag), `旗 ${flag} の読み手が無い`).toBe(true);
    }

    // 見聞録アトム → found.snow_hermit（place.old_forge と同じ雛形：
    // 記録を読んだ者もその場所を「見つけた」ことになる）
    const atom = atoms.find((a) => a.id === "place.snow_hermit");
    expect(atom, "place.snow_hermit アトムが無い").toBeDefined();
    expect(atom!.unlock?.flag).toBe(foundFlagKey("snow_hermit"));
    const ids = canonIds(canon);
    for (const r of atom!.refs) expect(ids.has(r), `refs の ${r} が canon に無い`).toBe(true);
    const factIds = new Set(canon.facts.map((f) => f.id));
    for (const r of atom!.reveals)
      expect(factIds.has(r), `reveals の ${r} が canon.facts に無い`).toBe(true);

    // 本 → seen.star_terrace（星の列を見た者の店にだけ写本が並ぶ）
    const book = books.books.find((b) => b.id === "book.star_lore");
    expect(book, "book.star_lore が無い").toBeDefined();
    expect(book!.condition).toEqual({ flag: "seen.star_terrace" });

    // 称号 → seen.evening_rainbow（街の小さな発見はBランク通知）
    const title = titles.titles.find((t) => t.id === "title.evening_rainbow");
    expect(title, "title.evening_rainbow が無い").toBeDefined();
    expect(title!.condition).toEqual({ flag: "seen.evening_rainbow" });
    expect(title!.rank).toBe("B");
  });
});
