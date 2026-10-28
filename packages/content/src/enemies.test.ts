import { describe, expect, it } from "vitest";
import { enemies, enemiesByArea } from "./enemies.js";
import { enemiesFileSchema } from "./enemies.schema.js";

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
    const bands = [...enemiesByArea()].map(
      ([area, group]) => [area, Math.max(...group.map((e) => e.challenge))] as const,
    );
    bands.sort((a, b) => a[1] - b[1]);
    const weakestMax = bands[0]![1];
    for (const [area, group] of enemiesByArea()) {
      if (group.some((e) => e.challenge > weakestMax)) {
        // 強いエリアは最弱エリアの上限より全部強い
        expect(Math.min(...group.map((e) => e.challenge)), area).toBeGreaterThan(weakestMax);
      }
    }
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
    expect(grouped.map(([a]) => a)).toEqual(["forest", "highway", "abyss"]);
    for (const [, group] of grouped) {
      const areas = new Set(group.map((e) => e.area));
      expect(areas.size).toBe(1);
    }
    expect(grouped.flatMap(([, g]) => g.map((e) => e.id))).toEqual(
      enemies.enemies.map((e) => e.id),
    );
  });
});
