import { describe, expect, it } from "vitest";
import { ENEMY_FAMILIES } from "@trace/core";
import { enemies, enemiesByArea } from "./enemies.js";
import { enemiesFileSchema } from "./enemies.schema.js";
import { world } from "./world.js";
import { items } from "./items.js";

describe("enemies.json", () => {
  it("area は必須（無い敵はスキーマ違反）", () => {
    const noArea = { ...enemies.enemies[0]! } as Record<string, unknown>;
    delete noArea["area"];
    const r = enemiesFileSchema.safeParse({ enemies: [noArea] });
    expect(r.success).toBe(false);
  });

  it("狩りの行き先が2エリア以上ある（T-23）", () => {
    const areas = new Set(enemies.enemies.map((e) => e.area));
    expect(areas.size).toBeGreaterThanOrEqual(2);
    for (const a of areas) {
      expect(enemies.enemies.filter((e) => e.area === a).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("弱いエリアと強いエリアで challenge の帯が分かれている", () => {
    // G-01：地域型は16種の段階（最深部ほど強い）。全域で帯が分かれるのではなく
    // 最弱の帯と最強の帯のあいだに段があることを見る
    const bands = [...enemiesByArea()].map(
      ([area, group]) =>
        [
          area,
          Math.min(...group.map((e) => e.challenge)),
          Math.max(...group.map((e) => e.challenge)),
        ] as const,
    );
    const weakestMax = Math.min(...bands.map(([, , max]) => max));
    const strongestMin = Math.max(...bands.map(([, min]) => min));
    expect(strongestMin).toBeGreaterThan(weakestMax);
  });

  it("大技持ちがいる（予兆 pattern の move は moves に定義済み）", () => {
    const telegraphed = enemies.enemies.filter((e) =>
      e.pattern.some((s) => s.type === "telegraph"),
    );
    expect(telegraphed.length).toBeGreaterThanOrEqual(2);
    for (const e of enemies.enemies) {
      for (const s of e.pattern) {
        if (s.type === "telegraph" && s.move) {
          expect(Object.keys(e.moves), `${e.id}.${s.move}`).toContain(s.move);
        }
      }
    }
  });
});

describe("enemiesByArea", () => {
  it("エリア出現順にグループ化し、敵はファイル順を保つ", () => {
    const grouped = enemiesByArea();
    // エリアはファイルの出現順（固定マップ3種＋G-01 の地域型13種）
    expect(grouped.map(([a]) => a)).toEqual([
      "forest",
      "highway",
      "abyss",
      "deep_forest",
      "hills",
      "mountain",
      "lake",
      "river",
      "coast",
      "marsh",
      "wasteland",
      "snowfield",
      "volcano",
      "battlefield",
      "dead_village",
      "ruins_field",
    ]);
    for (const [, group] of grouped) {
      const areas = new Set(group.map((e) => e.area));
      expect(areas.size).toBe(1);
    }
    expect(grouped.flatMap(([, g]) => g.map((e) => e.id))).toEqual(
      enemies.enemies.map((e) => e.id),
    );
  });
});

/**
 * G-04（docs/10_world_generation.md §11「bestiary」）：
 * 系統を持つ60〜80の基本種＋バイオーム別亜種。すべての種に耐性・弱点・
 * 予兆があり、すべての種がどこかの地域（地域型の敵表か旧マップの狩場）
 * に居ること —— 世界に出ない敵は図鑑に載せない
 */
describe("G-04 図鑑（系統・亜種・戦利品・行き先）", () => {
  /** 基の種（__ を含む id は variants から展開された亜種） */
  const baseSpecies = enemies.enemies.filter((e) => !e.id.includes("__"));
  const variants = enemies.enemies.filter((e) => e.id.includes("__"));

  it("基本種は60〜80で、系統は6系すべて揃う", () => {
    expect(baseSpecies.length).toBeGreaterThanOrEqual(60);
    expect(baseSpecies.length).toBeLessThanOrEqual(80);
    for (const f of ENEMY_FAMILIES) {
      const count = baseSpecies.filter((e) => e.family === f).length;
      expect(count, `family ${f}`).toBeGreaterThanOrEqual(4);
    }
  });

  it("すべての種（基＋亜種）に系統・耐性・弱点・予兆がある", () => {
    for (const e of enemies.enemies) {
      expect(ENEMY_FAMILIES, `${e.id}`).toContain(e.family);
      // 獣は従来の beast 旗と一致（beast.attack / beast.exp の対象）
      expect(e.beast === true, `${e.id}.beast`).toBe(e.family === "beast");
      // 耐性と弱点：打ち方で利きが違う（09 §3）
      const resist = e.resist ?? {};
      expect(Object.keys(resist).length, `${e.id} の耐性`).toBeGreaterThanOrEqual(2);
      const weak =
        Object.values(resist).some((v) => v > 1) ||
        Object.values(e.statusResist ?? {}).some((v) => v > 1);
      expect(weak, `${e.id} の弱点`).toBe(true);
      // 予兆：必ず1つは構え→大技を持つ（03 §4 の読み合い）
      expect(
        e.pattern.some((s) => s.type === "telegraph"),
        `${e.id} の予兆`,
      ).toBe(true);
    }
  });

  it("亜種は基の種×バイオームで展開される（地方の獣は地方の姿）", () => {
    expect(variants.length).toBeGreaterThanOrEqual(10);
    const baseById = new Map(baseSpecies.map((e) => [e.id, e]));
    const areaTypeIds = new Set(world.areaTypes.map((a) => a.id));
    for (const v of enemies.variants ?? []) {
      const made = variants.find((e) => e.id === `${v.base}__${v.biome}`);
      expect(made, `${v.base}__${v.biome}`).toBeDefined();
      const base = baseById.get(v.base)!;
      // バイオームは実在の地域型で、基の縄張りとは別（亜種＝適応先）
      expect(areaTypeIds.has(v.biome), `${v.biome}`).toBe(true);
      expect(v.biome).not.toBe(base.area);
      // 系統・型は継ぎ、名はバイオームの接頭辞（指定時は上書き）、力は上乗せ
      expect(made!.family).toBe(base.family);
      expect(made!.area).toBe(v.biome);
      expect(made!.challenge).toBeGreaterThan(base.challenge);
      expect(made!.pattern).toEqual(base.pattern);
    }
    // 例：雪原の狼・火山のトカゲ（仕様の例示どおり）
    expect(variants.some((e) => e.id === "dire_wolf__snowfield")).toBe(true);
    expect(variants.some((e) => e.id === "rock_lizard__volcano")).toBe(true);
  });

  it("戦利品は実在の品を落とす（モンスター素材が料理・依頼・市場へ流れる）", () => {
    const itemIds = new Set(items.items.map((i) => i.id));
    const withDrops = enemies.enemies.filter((e) => e.drops !== undefined);
    expect(withDrops.length).toBeGreaterThanOrEqual(30);
    for (const e of withDrops) {
      for (const d of e.drops!) {
        expect(itemIds.has(d.item), `${e.id} の戦利品 ${d.item}`).toBe(true);
        expect(d.chance).toBeGreaterThan(0);
        expect(d.chance).toBeLessThanOrEqual(1);
      }
    }
  });

  it("すべての種がどこかの地域（地域型の敵表 or 旧マップの狩場）に居る", () => {
    const rosters = new Set<string>();
    for (const t of world.areaTypes) for (const e of t.enemies ?? []) rosters.add(e.id);
    // 固定マップの狩場は森と街道（places.json の hunt 行き先）
    const legacyHuntAreas = new Set(["forest", "highway"]);
    const missing = enemies.enemies.filter(
      (e) => !rosters.has(e.id) && !legacyHuntAreas.has(e.area),
    );
    expect(missing.map((e) => e.id)).toEqual([]);
  });
});
