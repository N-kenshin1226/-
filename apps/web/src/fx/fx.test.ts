/**
 * F-02 演出層のユニットテスト。
 * tagsOf（イベント→B通知の札）・applySessionCap（Sの帯は1日1回）・
 * parseFxSettings（設定の読み直し）は純粋関数 ―― DOM も乱数も要らない
 */
import { describe, expect, it } from "vitest";
import type { ActionEvent } from "@trace/core";
import { applySessionCap, tagsOf, type Notice } from "../game.js";
import { FX_DEFAULTS, parseFxSettings } from "./settings.js";

/* ── tagsOf：Bランクの出来事 → 右上の札 ── */

describe("tagsOf", () => {
  it("Bランクの称号は金の札になる（文は称号の定型文）", () => {
    const ev: ActionEvent[] = [{ type: "titleGained", id: "title.first_work", rank: "B" }];
    const tags = tagsOf(ev);
    expect(tags).toHaveLength(1);
    expect(tags[0]!.tone).toBe("title");
    expect(tags[0]!.text).toContain("初仕事");
  });

  it("S/Aランクの称号は札にしない（Sは帯・Aは窓が担う）", () => {
    const ev: ActionEvent[] = [
      { type: "titleGained", id: "title.master_smith", rank: "S" },
      { type: "titleGained", id: "title.wolf_hunter", rank: "A" },
    ];
    expect(tagsOf(ev)).toHaveLength(0);
  });

  it("刻印予算を超えた称号（suppressed）は囁きの札になる", () => {
    const ev: ActionEvent[] = [
      { type: "titleGained", id: "title.master_smith", rank: "S", suppressed: true },
    ];
    const tags = tagsOf(ev);
    expect(tags).toHaveLength(1);
    expect(tags[0]!.tone).toBe("whisper");
  });

  it("報酬の支払いは銅貨の札になる", () => {
    const tags = tagsOf([{ type: "moneyPaid", amount: 120 }]);
    expect(tags).toHaveLength(1);
    expect(tags[0]!.tone).toBe("coin");
    expect(tags[0]!.text).toContain("120");
  });

  it("気配（kehai）は銀青の囁きとして滲ませる", () => {
    const tags = tagsOf([{ type: "kehai" }]);
    expect(tags).toHaveLength(1);
    expect(tags[0]!.tone).toBe("whisper");
  });

  it("頂点の中間段（B）は札で届き、A/Sの段は窓に任せる", () => {
    const b = tagsOf([
      { type: "pinnacleStageReached", route: "sword_saint", stage: "tempered", rank: "B" },
    ]);
    expect(b).toHaveLength(1);
    expect(b[0]!.tone).toBe("title");
    const a = tagsOf([
      { type: "pinnacleStageReached", route: "sword_saint", stage: "renzan", rank: "A" },
    ]);
    expect(a).toHaveLength(0);
  });

  it("勝負所の行事：負けは札、勝ちはAの窓に任せる", () => {
    const lost = tagsOf([
      { type: "occasionAttempted", id: "fair", kind: "k", score: 40, won: false },
    ]);
    expect(lost).toHaveLength(1);
    const won = tagsOf([
      { type: "occasionAttempted", id: "fair", kind: "k", score: 90, won: true },
    ]);
    expect(won).toHaveLength(0);
  });

  it("通知にならない出来事は札にもならない", () => {
    expect(tagsOf([{ type: "died" }])).toHaveLength(0);
    expect(tagsOf([{ type: "actionPerformed", kind: "train", day: 1 }])).toHaveLength(0);
  });
});

/* ── applySessionCap：Sの帯は1日（＝1遊び相当）1回まで ── */

const sNotice = (title: string): Notice => ({
  rank: "S",
  title,
  sub: "",
  rewards: [],
});
const aNotice = (title: string): Notice => ({
  rank: "A",
  title,
  sub: "",
  rewards: [],
});

describe("applySessionCap", () => {
  it("Sを含まない通知はそのまま通す", () => {
    const r = applySessionCap([aNotice("a"), aNotice("b")], false);
    expect(r.notices.map((n) => n.rank)).toEqual(["A", "A"]);
    expect(r.sShown).toBe(false);
  });

  it("その日最初のSは帯のまま通し、通した記録を返す", () => {
    const r = applySessionCap([sNotice("世界初")], false);
    expect(r.notices[0]!.rank).toBe("S");
    expect(r.sShown).toBe(true);
  });

  it("同日2枚目以降のSはAの窓に畳む（刻印・報酬は保持）", () => {
    const r = applySessionCap([sNotice("世界初"), sNotice("頂点")], false);
    expect(r.notices[0]!.rank).toBe("S");
    expect(r.notices[1]!.rank).toBe("A");
    expect(r.sShown).toBe(true);
  });

  it("終幕への接続（openEnding）は予算の外 ―― 畳まず、日予算も消費しない", () => {
    const end: Notice = { ...sNotice("終幕"), openEnding: true };
    const r = applySessionCap([sNotice("世界初"), end, sNotice("頂点")], false);
    expect(r.notices.map((n) => n.rank)).toEqual(["S", "S", "A"]);
    expect(r.notices[1]!.openEnding).toBe(true);
    expect(r.sShown).toBe(true);
  });

  it("既にSを出した日（sShown=true）に届くSはAの窓になる", () => {
    const r = applySessionCap([sNotice("頂点")], true);
    expect(r.notices[0]!.rank).toBe("A");
    expect(r.sShown).toBe(true);
  });
});

/* ── parseFxSettings：壊れた・欠けた保存値は既定に倒す ── */

describe("parseFxSettings", () => {
  it("null は既定値", () => {
    expect(parseFxSettings(null)).toEqual(FX_DEFAULTS);
  });
  it("壊れた JSON は既定値", () => {
    expect(parseFxSettings("{oops")).toEqual(FX_DEFAULTS);
  });
  it("欠けた項目は既定値、音量は 0〜1 に収める", () => {
    expect(parseFxSettings('{"sound":false}')).toEqual({ ...FX_DEFAULTS, sound: false });
    expect(parseFxSettings('{"volume":9}')!.volume).toBe(1);
    expect(parseFxSettings('{"volume":-2}')!.volume).toBe(0);
    expect(parseFxSettings('{"volume":"x"}')!.volume).toBe(FX_DEFAULTS.volume);
  });

  it("S-01：旧形式（F-02の3項目）を読むと新系統は既定に倒れ、sound=false は全ミュート", () => {
    // F-02 時代の保存値：sound/volume/shortFx だけ
    const old = parseFxSettings('{"sound":false,"volume":0.3,"shortFx":true}');
    expect(old.sound).toBe(false); // 全系統のミュート（e2e互換の要）
    expect(old.volume).toBe(0.3);
    expect(old.shortFx).toBe(true);
    // 新しい系統の項目は「鳴らす・既定音量」に倒れる
    expect(old.sfx).toBe(true);
    expect(old.music).toBe(true);
    expect(old.ambient).toBe(true);
    expect(old.musicVolume).toBe(FX_DEFAULTS.musicVolume);
    expect(old.ambientVolume).toBe(FX_DEFAULTS.ambientVolume);
  });

  it("S-01：系統ごとの音量・ミュートも 0〜1 に収めて読む", () => {
    const s = parseFxSettings(
      '{"music":false,"musicVolume":9,"ambientVolume":-1,"sfx":false,"sfxVolume":0.4}',
    );
    expect(s.music).toBe(false);
    expect(s.musicVolume).toBe(1);
    expect(s.ambientVolume).toBe(0);
    expect(s.sfx).toBe(false);
    expect(s.sfxVolume).toBe(0.4);
  });
});
