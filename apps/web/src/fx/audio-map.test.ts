/**
 * S-01 音の割り当てのユニットテスト。
 * resolveTrack / resolveAmbient は audio.json の assign 表を引く純粋関数
 * ―― DOM も AudioContext も乱数も要らない
 */
import { describe, expect, it } from "vitest";
import { audio, places } from "@trace/content";
import { resolveAmbient, resolveTrack } from "./audio-map.js";

const placeIds = new Set(places.places.map((p) => p.id));
const trackIds = new Set(audio.tracks.map((t) => t.id));
const ambientIds = new Set(audio.ambient.map((a) => a.id));

/* ── resolveTrack：画面 > 場所 > 街の時間帯 > 既定 ── */

describe("resolveTrack", () => {
  it("画面名が最優先（場所に居ても画面の曲になる）", () => {
    expect(resolveTrack("combat", "forest", "noon")).toBe("combat");
    expect(resolveTrack("wake", "home", "morning")).toBe("wake");
    expect(resolveTrack("ending", undefined, "night")).toBe("finale");
    expect(resolveTrack("status", "forge", "noon")).toBe("status");
  });

  it("個別の曲を持つ場所はその曲（酒場・鍛冶場・地域）", () => {
    expect(resolveTrack("place", "tavern", "noon")).toBe("tavern");
    expect(resolveTrack("place", "forge", "night")).toBe("forge");
    expect(resolveTrack("place", "forest", "morning")).toBe("forest");
    expect(resolveTrack("place", "highway", "evening")).toBe("highway");
    expect(resolveTrack("place", "lake", "noon")).toBe("lake");
    expect(resolveTrack("place", "abyss", "night")).toBe("abyss");
  });

  it("個別指定の無い街の場所・見取り図は時間帯の曲", () => {
    expect(resolveTrack("place", "market", "morning")).toBe("town_morning");
    expect(resolveTrack("place", "market", "noon")).toBe("town_noon");
    expect(resolveTrack("place", "church", "evening")).toBe("town_evening");
    expect(resolveTrack("place", "gate", "night")).toBe("town_night");
    expect(resolveTrack("menu", undefined, "morning")).toBe("town_morning");
    expect(resolveTrack("menu", undefined, "night")).toBe("town_night");
  });

  it("場所に縛られた画面はその場所の曲を引き継ぐ", () => {
    expect(resolveTrack("work", "forge", "noon")).toBe("forge");
    expect(resolveTrack("hunt", "forest", "noon")).toBe("forest");
    expect(resolveTrack("mentor", "church", "noon")).toBe("town_noon");
  });

  it("未知の場所・画面は既定の曲に倒れる", () => {
    const d = audio.assign.bgm.default;
    expect(resolveTrack("work", "nowhere", "noon")).toBe("town_noon");
    expect(resolveTrack("mystery", "nowhere", "night")).toBe("town_night");
    expect(resolveTrack("", undefined, "noon")).toBe("town_noon");
    expect(d).toBeDefined();
  });
});

/* ── resolveAmbient：場所 > 情景 > 既定。夜替わり・天候上書き ── */

describe("resolveAmbient", () => {
  it("場所の環境音が最優先", () => {
    expect(resolveAmbient("forge", "forge", "noon", "clear")).toBe("forge");
    expect(resolveAmbient("tavern", "tavern", "noon", "clear")).toBe("tavern");
    expect(resolveAmbient("home", "home", "morning", "clear")).toBe("hearth");
    expect(resolveAmbient("church", "church", "noon", "clear")).toBe("quiet");
  });

  it("夜は夜の音に替わる場所（{day,night} の指定）", () => {
    expect(resolveAmbient("forest", "forest", "night", "clear")).toBe("forest_night");
    expect(resolveAmbient("forest", "forest", "morning", "clear")).toBe("forest");
    expect(resolveAmbient("gate", "gate", "night", "clear")).toBe("town_night");
    expect(resolveAmbient("lake", "lake", "night", "clear")).toBe("forest_night");
  });

  it("場所に縛られない画面は情景で引く（机・夜の窓など）", () => {
    expect(resolveAmbient(undefined, "desk", "noon", "clear")).toBe("quiet");
    expect(resolveAmbient(undefined, "night", "night", "clear")).toBe("town_night");
    expect(resolveAmbient(undefined, "unknown_scene", "noon", "clear")).toBe(
      audio.assign.ambient.default,
    );
  });

  it("屋外の場所では天候が環境音を上書きする（雨・雪）", () => {
    expect(resolveAmbient("forest", "forest", "noon", "rain")).toBe("rain");
    expect(resolveAmbient("highway", "highway", "night", "rain")).toBe("rain");
    expect(resolveAmbient("gate", "gate", "noon", "snow")).toBe("snow");
    expect(resolveAmbient("market", "market", "noon", "rain")).toBe("rain");
  });

  it("屋内の場所には降り込まない（鍛冶場・自宅は天候で替わらない）", () => {
    expect(resolveAmbient("forge", "forge", "noon", "rain")).toBe("forge");
    expect(resolveAmbient("home", "home", "night", "rain")).toBe("hearth");
    expect(resolveAmbient("tavern", "tavern", "noon", "snow")).toBe("tavern");
  });

  it("晴れ・曇りはその場所の環境音のまま", () => {
    expect(resolveAmbient("forest", "forest", "noon", "clear")).toBe("forest");
    expect(resolveAmbient("forest", "forest", "noon", "cloud")).toBe("forest");
  });
});

/* ── 割り当ての網羅：全部の場所・時間帯で何かが鳴る ── */

describe("audio.json の割り当てが全場所を覆う", () => {
  it("全ての場所で曲が引ける", () => {
    for (const id of placeIds) {
      for (const tod of ["morning", "noon", "evening", "night"] as const) {
        const t = resolveTrack("place", id, tod);
        expect(trackIds.has(t), `place=${id} tod=${tod} → ${t}`).toBe(true);
      }
    }
  });

  it("全ての場所で環境音が引ける（昼夜・全天候）", () => {
    for (const id of placeIds) {
      for (const tod of ["morning", "night"] as const) {
        for (const w of ["clear", "rain", "snow", "cloud"]) {
          const a = resolveAmbient(id, "town", tod, w);
          expect(ambientIds.has(a), `place=${id} tod=${tod} w=${w} → ${a}`).toBe(true);
        }
      }
    }
  });
});
