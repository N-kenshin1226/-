import { describe, expect, it } from "vitest";
import {
  advance,
  canAct,
  describe as describeTime,
  sleep,
  type GameTime,
  type TimeConfig,
} from "./index.js";

// balance.json の time 節と同じ値（スキーマ検証は content 側で実施）
const cfg: TimeConfig = {
  actionsPerDay: 5,
  timeOfDay: ["morning", "morning", "noon", "evening", "night"],
  daysPerWeek: 7,
  daysPerSeason: 28,
  seasonsPerYear: 4,
  moonCycleDays: 28,
  moonPhaseWindowDays: 1,
  startAge: 15,
};

const DAYS_PER_YEAR = 28 * 4; // 112

describe("advance / sleep / canAct", () => {
  it("行動回数の上限に達すると advance は進まず、sleep でだけ翌日になる", () => {
    let t: GameTime = { day: 0, action: 0 };
    for (let i = 0; i < 10; i++) t = advance(t, cfg);
    expect(t).toEqual({ day: 0, action: 5 });
    expect(canAct(t, cfg)).toBe(false);
    expect(advance(t, cfg)).toEqual({ day: 0, action: 5 });

    const next = sleep(t);
    expect(next).toEqual({ day: 1, action: 0 });
    expect(canAct(next, cfg)).toBe(true);
  });

  it("advance は上限でクランプし、日をまたがない", () => {
    let t: GameTime = { day: 0, action: 4 };
    t = advance(t, cfg);
    expect(t.action).toBe(5);
    t = advance(t, cfg);
    expect(t.action).toBe(5);
    expect(t.day).toBe(0);
  });
});

describe("describe: 時刻帯と曜日", () => {
  it("行動インデックスが時刻帯に対応する", () => {
    expect(describeTime({ day: 0, action: 0 }, cfg).timeOfDay).toBe("morning");
    expect(describeTime({ day: 0, action: 2 }, cfg).timeOfDay).toBe("noon");
    expect(describeTime({ day: 0, action: 4 }, cfg).timeOfDay).toBe("night");
  });

  it("行動消化後（action=actionsPerDay）は末尾の時刻帯で丸める", () => {
    expect(describeTime({ day: 0, action: 5 }, cfg).timeOfDay).toBe("night");
    expect(describeTime({ day: 0, action: 99 }, cfg).timeOfDay).toBe("night");
  });

  it("曜日は daysPerWeek で周期する", () => {
    expect(describeTime({ day: 0, action: 0 }, cfg).weekday).toBe(0);
    expect(describeTime({ day: 6, action: 0 }, cfg).weekday).toBe(6);
    expect(describeTime({ day: 7, action: 0 }, cfg).weekday).toBe(0);
    expect(describeTime({ day: 13, action: 0 }, cfg).weekday).toBe(6);
  });
});

describe("describe: 季節・年・年齢の境界値", () => {
  it("季節の変わり目（day 27→28）", () => {
    expect(describeTime({ day: 27, action: 0 }, cfg).season).toBe(0);
    expect(describeTime({ day: 28, action: 0 }, cfg).season).toBe(1);
    expect(describeTime({ day: 28, action: 0 }, cfg).dayOfSeason).toBe(0);
    expect(describeTime({ day: 55, action: 0 }, cfg).season).toBe(1);
    expect(describeTime({ day: 56, action: 0 }, cfg).season).toBe(2);
  });

  it("年の変わり目（day 111→112）", () => {
    expect(describeTime({ day: DAYS_PER_YEAR - 1, action: 0 }, cfg).year).toBe(0);
    expect(describeTime({ day: DAYS_PER_YEAR, action: 0 }, cfg).year).toBe(1);
    expect(describeTime({ day: DAYS_PER_YEAR, action: 0 }, cfg).dayOfYear).toBe(0);
    expect(describeTime({ day: DAYS_PER_YEAR, action: 0 }, cfg).season).toBe(0);
  });

  it("年齢は startAge + 経過年", () => {
    expect(describeTime({ day: 0, action: 0 }, cfg).age).toBe(15);
    expect(describeTime({ day: DAYS_PER_YEAR - 1, action: 0 }, cfg).age).toBe(15);
    expect(describeTime({ day: DAYS_PER_YEAR, action: 0 }, cfg).age).toBe(16);
    expect(describeTime({ day: DAYS_PER_YEAR * 5, action: 0 }, cfg).age).toBe(20);
  });
});

describe("describe: 月齢", () => {
  const moonAt = (day: number) => describeTime({ day, action: 0 }, cfg).moon;

  it("新月（day 0 前後 ±1日）", () => {
    expect(moonAt(0)).toBe("new");
    expect(moonAt(1)).toBe("new");
    expect(moonAt(27)).toBe("new");
    expect(moonAt(28)).toBe("new"); // 周期の折り返しでも新月
  });

  it("満月（周期の中点 ±1日）", () => {
    expect(moonAt(13)).toBe("full");
    expect(moonAt(14)).toBe("full");
    expect(moonAt(15)).toBe("full");
    expect(moonAt(42)).toBe("full"); // 28 + 14
  });

  it("上弦・下弦", () => {
    expect(moonAt(2)).toBe("waxing");
    expect(moonAt(12)).toBe("waxing");
    expect(moonAt(16)).toBe("waning");
    expect(moonAt(26)).toBe("waning");
  });
});
