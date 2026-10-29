import { describe, expect, it } from "vitest";
import { generateWorld } from "@trace/core";
import type { GeneratedWorld } from "@trace/core";
import { world } from "./world.js";
import { balance } from "./balance.js";
import { enemies } from "./enemies.js";
import { items } from "./items.js";
import { skills } from "./skills.js";
import { worldFileSchema } from "./world.schema.js";

/**
 * world.json（実物の型定義表）を balance.world の係数で生成する検証。
 * core のテストは最小 fixture だが、こちらは出荷するコンテンツそのもので
 * 「実際の世界が組めるか・参照が揃っているか」を見る
 */

const genCfg = balance.world;
const challenge = Object.fromEntries(enemies.enemies.map((e) => [e.id, e.challenge]));
const itemIds = new Set(items.items.map((i) => i.id));
const enemyIds = new Set(enemies.enemies.map((e) => e.id));
const skillIds = new Set(skills.skills.map((s) => s.id));

const reachableAll = (w: GeneratedWorld): boolean => {
  const adj = new Map<string, string[]>();
  for (const r of w.roads) {
    adj.set(r.from, [...(adj.get(r.from) ?? []), r.to]);
    adj.set(r.to, [...(adj.get(r.to) ?? []), r.from]);
  }
  const seen = new Set([w.startTown]);
  const queue = [w.startTown];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nx of adj.get(cur) ?? []) {
      if (!seen.has(nx)) {
        seen.add(nx);
        queue.push(nx);
      }
    }
  }
  return w.towns.every((t) => seen.has(t.id));
};

describe("world.json", () => {
  it("スキーマを満たし、町9種・地域16種（14+畑/深淵）ある", () => {
    expect(worldFileSchema.safeParse(world).success).toBe(true);
    expect(world.townTypes).toHaveLength(9);
    const specials = world.areaTypes.filter((a) => a.special !== undefined);
    expect(world.areaTypes.length - specials.length).toBe(14);
    expect(specials.map((s) => s.special).sort()).toEqual(["abyss", "farm"]);
  });
});

describe("world.json での地方生成（G-01）", () => {
  it("200シードで町6〜9・地域15〜25・連結・特別地域が揃う", () => {
    for (let i = 0; i < 200; i++) {
      const w = generateWorld(`world:${i}`, world, genCfg, challenge);
      expect(w.towns.length).toBeGreaterThanOrEqual(6);
      expect(w.towns.length).toBeLessThanOrEqual(9);
      expect(w.areas.length).toBeGreaterThanOrEqual(15);
      expect(w.areas.length).toBeLessThanOrEqual(25);
      expect(reachableAll(w)).toBe(true);
      expect(
        w.areas.filter((a) => world.areaTypes.find((t) => t.id === a.typeId)?.special === "farm"),
      ).toHaveLength(1);
      expect(
        w.areas.filter((a) => world.areaTypes.find((t) => t.id === a.typeId)?.special === "abyss"),
      ).toHaveLength(1);
      // 全部の町に最低1つの地域がぶら下がる（門からどこかへ出られる）
      for (const t of w.towns) {
        expect(
          w.areas.some((a) => a.town === t.id),
          `町 ${t.id}`,
        ).toBe(true);
      }
    }
  });

  it("始まりの町の周りは安全で、危険度は輪とともに上がる", () => {
    for (let i = 0; i < 100; i++) {
      const w = generateWorld(`safe:${i}`, world, genCfg, challenge);
      const typeById = new Map(world.areaTypes.map((a) => [a.id, a]));
      const ring0 = w.areas.filter((a) => a.ring === 0);
      expect(ring0.length).toBeGreaterThan(0);
      for (const a of ring0) {
        // 輪0に出る型は危険度が穏やか（型の danger が safeDanger 以下）
        expect(typeById.get(a.typeId)!.danger, `${a.id}`).toBeLessThanOrEqual(genCfg.safeDanger);
      }
      // 危険度の平均は輪で単調に近く上がる（最初の輪 < 最後の輪）
      const maxRing = Math.max(...w.areas.map((a) => a.ring));
      const mean = (ring: number) => {
        const as = w.areas.filter((a) => a.ring === ring);
        return as.reduce((s, a) => s + a.danger, 0) / as.length;
      };
      expect(mean(maxRing)).toBeGreaterThan(mean(0));
    }
  });

  it("生成物の参照が揃う（敵・品・技能・住人・場所）", () => {
    for (let i = 0; i < 50; i++) {
      const w = generateWorld(`ref:${i}`, world, genCfg, challenge);
      for (const a of w.areas) {
        for (const e of a.enemies) {
          expect(enemyIds.has(e.id), `${a.id}:${e.id}`).toBe(true);
        }
        for (const s of a.spots) {
          expect(w.life.spots[s.id], s.id).toBeDefined();
          for (const o of w.life.spots[s.id]!) {
            for (const id of Object.keys(o.items ?? {})) {
              expect(itemIds.has(id), `${s.id}:${id}`).toBe(true);
            }
          }
        }
        const g = w.life.gather[a.id];
        if (g !== undefined) {
          for (const e of g.entries) {
            expect(itemIds.has(e.item), `${a.id}:${e.item}`).toBe(true);
          }
        }
      }
      for (const m of w.mentors) {
        expect(skillIds.has(m.skill), m.id).toBe(true);
      }
      for (const p of w.places) {
        for (const n of p.npcs) {
          expect(
            w.npcs.some((x) => x.id === n),
            `${p.id}:${n}`,
          ).toBe(true);
        }
      }
      for (const e of w.life.marketStock) {
        expect(itemIds.has(e.id), e.id).toBe(true);
      }
      for (const e of w.life.errands) {
        for (const id of Object.keys(e.need)) {
          expect(itemIds.has(id), `${e.id}:${id}`).toBe(true);
        }
      }
    }
  });

  it("「人と過ごす」のある場所には必ず住人がいる（200シード）", () => {
    // 生成町は型固有の住人しかいないため、酒場・市場・鍛冶場・教会で
    // 人と過ごすを開くと誰もいない空の窓になった（X-10）。social 行動を
    // 持つ場所は名簿が空であってはいけない（townBase の基礎住人で担保）
    for (let i = 0; i < 200; i++) {
      const w = generateWorld(`npc-dens:${i}`, world, genCfg, challenge);
      for (const p of w.places) {
        if (p.kind !== "town" || !p.actions.some((a) => a.type === "social")) continue;
        expect(
          p.npcs.length,
          `seed=npc-dens:${i}: ${p.id}(${p.name}) に住人がいない`,
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("師匠の居場所には必ず「師匠を訪ねる」行動がある（200シード）", () => {
    // 師匠は居場所の npcs 経由で画面が絞られる —— 場所に mentor 行動が
    // 無ければ登録された師匠にも辿り着けない（X-16。テンプレで宣言済みの
    // 場所は 4 箇所だけで、9/13 の師匠は到達不能だった）
    for (let i = 0; i < 200; i++) {
      const w = generateWorld(`mentor-reach:${i}`, world, genCfg, challenge);
      for (const m of w.mentors) {
        const p = w.places.find((pl) => pl.id === m.place);
        expect(
          p?.actions.some((a) => a.type === "mentor"),
          `seed=mentor-reach:${i}: 師匠 ${m.id} の居場所 ${m.place} に mentor 行動がない`,
        ).toBe(true);
      }
    }
  });

  it("住人の歳月は実在の住人に・窓の内側・役目に沿った種目（200シード）", () => {
    // X-22：生成の住人にも一生の節目が来る。canon の歳月と同じ仕組みに
    // 載せるため、節目は実在の住人に・窓の内側で・役目に沿った種目でなければ
    // ならない（年嵩の役目は退場系のみ。結婚した古老が翌年また結婚はしない）
    const life = world.npcLife!;
    for (let i = 0; i < 200; i++) {
      const w = generateWorld(`life:${i}`, world, genCfg, challenge);
      const npcById = new Map(w.npcs.map((n) => [n.id, n]));
      for (const e of w.npcLife) {
        const n = npcById.get(e.npcId);
        expect(n, `seed=life:${i}: 歳月の対象 ${e.npcId} が住人名簿にない`).toBeDefined();
        expect(e.day).toBeGreaterThanOrEqual(life.window[0]);
        expect(e.day).toBeLessThanOrEqual(life.window[1]);
        const allowed = life.elderRoles.includes(n!.role) ? life.elderKinds : life.defaultKinds;
        expect(
          (allowed as readonly string[]).includes(e.kind),
          `seed=life:${i}: ${n!.role} に ${e.kind}`,
        ).toBe(true);
      }
      expect(w.npcLife.length).toBeGreaterThan(0);
    }
  });

  it("同じシードで再生成した世界は完全一致（save/load と同じ形で復元できる）", () => {
    const w1 = generateWorld("save-seed", world, genCfg, challenge);
    const w2 = generateWorld("save-seed", world, genCfg, challenge);
    expect(w2).toEqual(w1);
  });
});
