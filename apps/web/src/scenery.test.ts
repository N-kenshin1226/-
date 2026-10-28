/**
 * 情景の部品（G-05、docs/10 §8）の検証。
 * - 配置は世界シード×場所から引く —— 同じ系列なら同じ情景（決定性）
 * - 生成地方の全型（町9・地域17・深層）にレシピがあり、
 *   legacy（固定マップ）は scenery.legacy の当て方で型のレシピに写る
 * - 時間帯・天候・危機の霞は SceneBackground と同じ語彙で重なる
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRng, WORLD_RECIPE, type GameState } from "@trace/core";
import { places, scenery, world as worldFile, type SceneryEntry } from "@trace/content";
import { genWorld } from "./world.js";
import { sceneryForScreen } from "./scenery.js";
import { layoutEntry, Scenery, type ScenerySpec } from "./ui/scenery.js";

/** 情景の解決は seed・world・life.town しか見ない（生成は seed×recipe で引き直す） */
const genState = (seed: string) =>
  ({
    seed,
    world: { kind: "gen", recipe: WORLD_RECIPE },
    life: { town: "t0" },
  }) as GameState;

const legacyState = (seed = "e2e", town = "ardi") =>
  ({
    seed,
    world: { kind: "legacy", recipe: 0 },
    life: { town },
  }) as GameState;

const render = (spec: ScenerySpec, opts?: Omit<Parameters<typeof Scenery>[0], "spec">) =>
  renderToStaticMarkup(createElement(Scenery, { spec, ...opts }));

/* ── 配置の決定性 ── */

describe("配置項の引き方（layoutEntry）", () => {
  const entry: SceneryEntry = { p: "trees", x: [0, 1280], y: 520, n: [4, 6], s: [0.8, 1.3], j: 14 };

  it("同じ系列なら同じ置き方になる", () => {
    const a = layoutEntry(entry, createRng("w1:scenery:trees"), 3);
    const b = layoutEntry(entry, createRng("w1:scenery:trees"), 3);
    expect(a).toEqual(b);
  });

  it("別の系列なら置き方が変わる（個数・位置・形の揺らぎ）", () => {
    const a = layoutEntry(entry, createRng("w1:scenery:trees"), 3);
    const b = layoutEntry(entry, createRng("w2:scenery:trees"), 3);
    expect(a).not.toEqual(b);
  });

  it("範囲を持たない項は系列を進めない", () => {
    const fixed: SceneryEntry = { p: "ridge", x: 0, y: 455, v: 1 };
    expect(layoutEntry(fixed, createRng("a"), 3)).toEqual([
      { x: 0, y: 455, s: 1, mir: false, v: 1 },
    ]);
  });
});

/* ── レシピの網羅（型 → レシピ） ── */

describe("型とレシピの対応", () => {
  it("生成の町の型すべてにレシピがある", () => {
    for (const t of worldFile.townTypes) {
      expect(scenery.town[t.id], `town.${t.id}`).toBeDefined();
    }
  });

  it("生成の地域の型すべてにレシピがある", () => {
    for (const t of worldFile.areaTypes) {
      expect(scenery.region[t.id], `region.${t.id}`).toBeDefined();
    }
  });

  it("深層（ダンジョン）のレシピがある", () => {
    expect(scenery.dungeon.abyss).toBeDefined();
    expect(scenery.dungeon.abyss!.sky).toBe(false);
  });

  it("有限迷宮の型すべてにレシピがある（G-03、7種）", () => {
    for (const t of worldFile.dungeonTypes ?? []) {
      expect(scenery.dungeon[t.id], `dungeon.${t.id}`).toBeDefined();
    }
  });

  it("legacy の町・地域の当て先がレシピに存在する", () => {
    for (const [town, type] of Object.entries(scenery.legacy.towns)) {
      expect(scenery.town[type], `legacy towns ${town}→${type}`).toBeDefined();
    }
    for (const [place, type] of Object.entries(scenery.legacy.regions)) {
      expect(scenery.region[type], `legacy regions ${place}→${type}`).toBeDefined();
    }
    // 固定マップの地域の場所はすべて当て先がある
    for (const p of places.places.filter((p) => p.kind === "region")) {
      expect(scenery.legacy.regions[p.id], `legacy region ${p.id}`).toBeDefined();
    }
  });
});

/* ── 画面 → 情景の解決 ── */

describe("画面から情景を引く（生成地方）", () => {
  const state = genState("g05-test");
  const w = genWorld(state)!;

  it("見取り図は始まりの町の型の情景", () => {
    const spec = sceneryForScreen(state, { name: "menu" }, null);
    expect(spec?.id).toBe(`town.${w.towns[0]!.typeId}`);
    expect(spec?.variant).toBe("g05-test:scenery:t0");
  });

  it("町の場所は型のレシピ＋場所の差分", () => {
    const spec = sceneryForScreen(state, { name: "place", place: "t0.gate" }, null);
    expect(spec?.id).toMatch(/^town\..+#gate$/);
  });

  it("地域は地域の型のレシピ", () => {
    for (const area of w.areas) {
      const spec = sceneryForScreen(state, { name: "place", place: area.id }, null);
      expect(spec?.id, area.id).toBe(`region.${area.typeId}`);
      expect(spec?.variant).toBe(`${state.seed}:scenery:${area.id}`);
    }
  });

  it("深層の画面はダンジョンの型、旅は街道の情景", () => {
    expect(sceneryForScreen(state, { name: "abyss" }, null)?.id).toBe("dungeon.abyss");
    expect(sceneryForScreen(state, { name: "journey" }, null)?.id).toBe("region.road");
  });

  it("有限迷宮：場所と潜りの画面はその迷宮の型のレシピ（G-03）", () => {
    for (const d of w.dungeons) {
      // 迷宮の場所（life.places の型は "dg.<型>"）はダンジョンのレシピ
      const at = sceneryForScreen(state, { name: "place", place: d.id }, null);
      expect(at?.id, `place ${d.id}`).toBe(`dungeon.${d.type}`);
      expect(at?.variant).toBe(`${state.seed}:scenery:${d.id}`);
      // 潜りの画面も同じ型のレシピ
      const dive = sceneryForScreen(state, { name: "dungeon", place: d.id }, null);
      expect(dive?.id, `dive ${d.id}`).toBe(`dungeon.${d.type}`);
    }
    // 全7型が同じ系列のどこかの迷宮に見える（ダンジョンのレシピ網羅）
    const seen = new Set(w.dungeons.map((d) => d.type));
    for (const t of worldFile.dungeonTypes ?? []) {
      if (!seen.has(t.id)) continue; // このシードに無い型はレシピ網羅テストが担う
      expect(scenery.dungeon[t.id]).toBeDefined();
    }
  });

  it("読みもの用の画面は情景を引かない（従来の固定背景へ）", () => {
    for (const name of ["status", "settings", "wake", "news", "lore", "book", "records"] as const) {
      // wake 等の payload は解決に関係ないので name だけ渡す
      expect(sceneryForScreen(state, { name } as never, null), name).toBeNull();
    }
  });

  it("同じ seed なら同じ情景・別 seed なら系列が変わる", () => {
    const a = sceneryForScreen(genState("same"), { name: "menu" }, null);
    const b = sceneryForScreen(genState("same"), { name: "menu" }, null);
    expect(a).toEqual(b);
    const c = sceneryForScreen(genState("other"), { name: "menu" }, null);
    expect(c?.variant).not.toBe(a?.variant);
  });
});

describe("画面から情景を引く（legacy 固定マップ）", () => {
  const state = legacyState();

  it("アルディは宿場街の型で描く", () => {
    expect(sceneryForScreen(state, { name: "menu" }, null)?.id).toBe("town.shukuba");
    expect(sceneryForScreen(state, { name: "place", place: "gate" }, null)?.id).toBe(
      "town.shukuba#gate",
    );
    expect(sceneryForScreen(state, { name: "place", place: "market" }, null)?.id).toBe(
      "town.shukuba#market",
    );
  });

  it("ベルンは港町の型で描く", () => {
    const bern = legacyState("e2e", "bergen");
    expect(sceneryForScreen(bern, { name: "place", place: "bern.gate" }, null)?.id).toBe(
      "town.port#gate",
    );
  });

  it("屋内の場所は部屋の情景へ残す（情景は引かない）", () => {
    for (const id of ["forge", "tavern", "inn", "guild", "church", "home"]) {
      expect(sceneryForScreen(state, { name: "place", place: id }, null), id).toBeNull();
    }
  });

  it("固定マップの地域は当て方の型のレシピ", () => {
    expect(sceneryForScreen(state, { name: "place", place: "forest" }, null)?.id).toBe(
      "region.forest",
    );
    expect(sceneryForScreen(state, { name: "place", place: "highway" }, null)?.id).toBe(
      "region.road",
    );
    expect(sceneryForScreen(state, { name: "place", place: "abyss" }, null)?.id).toBe(
      "region.abyss",
    );
  });
});

/* ── 描画（時間帯・天候・危機・シード差分） ── */

describe("情景の描画", () => {
  const spec: ScenerySpec = {
    id: "town.shukuba",
    recipe: scenery.town.shukuba!,
    variant: "w1:scenery:t0",
  };

  it("識別・時間帯・天候が svg の属性に出る", () => {
    const html = render(spec, { tod: "evening", weather: "rain" });
    expect(html).toContain('data-scenery="town.shukuba"');
    expect(html).toContain('data-tod="evening"');
    expect(html).toContain('data-weather="rain"');
  });

  it("夜は星が出て、昼は出ない", () => {
    expect(render(spec, { tod: "night" })).toContain('fill="#f5ead0"');
    expect(render(spec, { tod: "noon" })).not.toContain('fill="#f5ead0"');
    expect(render(spec, { tod: "night" })).toContain('fill="#e8ddb8"'); // 月
  });

  it("天候の動きが重なる（雨・雪・雲）", () => {
    expect(render(spec, { weather: "rain" })).toContain('data-testid="wx-rain"');
    expect(render(spec, { weather: "snow" })).toContain('data-testid="wx-snow"');
    expect(render(spec, { weather: "cloud" })).toContain('data-testid="wx-cloud"');
    expect(render(spec, { weather: "clear" })).not.toContain("wx-");
  });

  it("危機の霞が重なる", () => {
    expect(render(spec, { haze: 0.6 })).toContain('fill="#aebdc2"');
    expect(render(spec, { haze: 0 })).not.toContain('fill="#aebdc2"');
  });

  it("深層（sky:false）は空・星・天候を描かない", () => {
    const html = render(
      { id: "dungeon.abyss", recipe: scenery.dungeon.abyss!, variant: "w1:scenery:abyss" },
      { tod: "night", weather: "rain" },
    );
    expect(html).not.toContain('fill="#f5ead0"');
    expect(html).not.toContain("wx-rain");
  });

  it("同じ系列なら描画が一致し、別系列なら配置が変わる", () => {
    const a = render(spec, { tod: "morning" });
    const b = render({ ...spec }, { tod: "morning" });
    expect(a).toBe(b);
    const c = render({ ...spec, variant: "w2:scenery:t0" }, { tod: "morning" });
    expect(c).not.toBe(a);
  });
});
