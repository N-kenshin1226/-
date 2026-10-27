import { describe, expect, it } from "vitest";
import type { WakeReport } from "@trace/core";
import { cliText } from "@trace/content";
import { tpl, wakeBlock } from "./render.js";

/**
 * 起床ブロックの描画（render.ts）のテスト。
 * 天候（X-13）：report.weather がある起床では cli.json の
 * wake.weatherLine テンプレートに差し込んだ1行が載る
 */

const baseReport = (): WakeReport => ({
  quality: 0.9,
  inn: "normal",
  dinner: false,
  lines: [],
  tailwinds: [],
  surprises: [],
  fatigue: { from: 10, to: 0 },
  overwork: { active: false, became: false },
  restDay: false,
});

const names = new Map<string, string>();

describe("起床ブロックの描画", () => {
  it("report.weather がある起床では天候の行がテンプレート経由で載る（X-13）", () => {
    const report = {
      ...baseReport(),
      weather: { id: "rain", name: "雨", line: "雨が石畳を濡らしている。" },
    };
    const lines = wakeBlock(report, [], cliText, names);
    const want = tpl(cliText.text.wake.weatherLine, {
      weather: "雨",
      line: "雨が石畳を濡らしている。",
    });
    expect(lines).toContain(want);
    // 追い風の行より前・休養日の行の後ろ（起床ブロックの決まった構成）
    const at = lines.indexOf(want);
    expect(lines[at + 1]).toBe(cliText.text.wake.windsNone);
    // 天候表の無い世界（weather 未設定）では行は出ない
    const dry = wakeBlock(baseReport(), [], cliText, names);
    expect(dry.some((l) => l.includes("雨が石畳"))).toBe(false);
    expect(dry).toContain(cliText.text.wake.windsNone);
  });
});
