import { describe, expect, it } from "vitest";
import type { ArtDef } from "../arts/index.js";
import {
  canEnchant,
  castTicksOf,
  elementAptitude,
  enchantFactor,
  enchantLevel,
  interruptChanceOf,
  interactionOf,
  lifeBuffKey,
  manaMaxOf,
  npcAptitudes,
  playerAptitudes,
  spellPowerOf,
  type MagicConfig,
} from "./index.js";

/* ── M-01：魔法の仕組み（docs/09 §4〜5）── */

const MAGIC: MagicConfig = {
  aptitudeMean: 0.5,
  aptitudeSpread: 0.4,
  aptitudePowerBase: 0.7,
  aptitudePowerScale: 0.6,
  powerBase: 6,
  powerPerSkill: 0.5,
  powerPerSpirit: 0.4,
  castPerSkill: 0.3,
  castMin: 4,
  interruptBase: 0.5,
  interruptPerManaSkill: 0.006,
  interruptMin: 0.05,
  interruptMax: 0.8,
  manaRegenPerTick: 0.05,
  interactions: [
    // 濡れ＋雷（風）＝感電（09 §5）
    {
      id: "shock",
      primer: "wet",
      strike: "wind",
      damage: 1.4,
      status: "shock",
      statusTicks: 8,
      statusPower: 1.5,
      consume: true,
    },
    // 油＋火＝延焼
    {
      id: "enflame",
      primer: "oil",
      strike: "fire",
      damage: 1.45,
      status: "burn",
      statusTicks: 10,
      statusPower: 2,
      consume: true,
    },
    // 凍結＋打撃＝砕く
    { id: "shatter", primer: "frozen", strike: "blunt", damage: 1.7, consume: true },
    // 風＋火＝火勢拡大（燃焼が伸びる）
    { id: "fan", primer: "burn", strike: "wind", damage: 1.3, extend: 8, consume: false },
  ],
  lifeWorkKinds: [
    { hook: "smithBonus", kinds: ["smithing"] },
    { hook: "farmBonus", kinds: ["farming"] },
    { hook: "alchemyBonus", kinds: ["alchemy", "brewing", "medicine"] },
  ],
  enchant: { smithing: 30, fireMagic: 25, mana: 20, maxLevel: 3, atkPerLevel: 0.08 },
};

const fireBolt: ArtDef = {
  id: "sp_fire_bolt",
  name: "火矢",
  skill: "fire_magic",
  learn: { at: 4 },
  kind: "attack",
  power: 1.2,
  ki: 0,
  ct: 1,
  spell: { element: "fire", tier: "novice", mana: 5, cast: 12 },
  desc: "",
};

describe("M-01 属性適性（同じ分布。主人公もNPCも平凡）", () => {
  it("同じ seed×主体×属性なら必ず同じ値（決定的）", () => {
    const a = elementAptitude("world-1", "origin:smith_child", "fire", MAGIC);
    const b = elementAptitude("world-1", "origin:smith_child", "fire", MAGIC);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });

  it("主体・属性・世界が違えば別の抽選になる", () => {
    const base = elementAptitude("world-1", "origin:smith_child", "fire", MAGIC);
    const all = [
      elementAptitude("world-1", "origin:smith_child", "water", MAGIC),
      elementAptitude("world-1", "npc:npc.garo", "fire", MAGIC),
      elementAptitude("world-2", "origin:smith_child", "fire", MAGIC),
    ];
    // 別の抽選なので、全部がたまたま同じ値であるはずがない
    expect(new Set([base, ...all]).size).toBeGreaterThan(1);
  });

  it("主人公の分布はNPCの分布と同じ（出自で特別な適性を持たない）", () => {
    // 同じ分布から引いているなら、十分な主体数で平均・分散は揃うはず。
    // 出自の偏り（elementBias）は含めない純粋な分布の比較
    const N = 240;
    const player: number[] = [];
    const npc: number[] = [];
    for (let i = 0; i < N; i++) {
      player.push(elementAptitude("w", `origin:o${i}`, "fire", MAGIC));
      npc.push(elementAptitude("w", `npc:n${i}`, "fire", MAGIC));
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = (xs: number[]) => {
      const m = mean(xs);
      return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
    };
    // 三角分布の期待値は mean、分散は spread²/6。両母集団とも近いはず
    expect(Math.abs(mean(player) - MAGIC.aptitudeMean)).toBeLessThan(0.04);
    expect(Math.abs(mean(npc) - MAGIC.aptitudeMean)).toBeLessThan(0.04);
    expect(Math.abs(mean(player) - mean(npc))).toBeLessThan(0.04);
    expect(Math.abs(variance(player) - variance(npc))).toBeLessThan(0.02);
    // 分布の形も同じ：順位で分けたとき各半分に偏りが無いはず（主人公が上位に寄らない）
    const sorted = [
      ...player.map((v) => ({ v, p: true })),
      ...npc.map((v) => ({ v, p: false })),
    ].sort((a, b) => a.v - b.v);
    const playerTopHalf = sorted.slice(N).filter((x) => x.p).length;
    expect(Math.abs(playerTopHalf / player.length - 0.5)).toBeLessThan(0.1);
  });

  it("分布は三角（中央に寄る）：極端な適性は稀", () => {
    let extreme = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const v = elementAptitude("w", `npc:t${i}`, "fire", MAGIC);
      if (v < MAGIC.aptitudeMean - MAGIC.aptitudeSpread * 0.75) extreme++;
      if (v > MAGIC.aptitudeMean + MAGIC.aptitudeSpread * 0.75) extreme++;
    }
    // 一様分布なら ~37.5%、三角分布なら ~12.5% 程度のはず
    expect(extreme / (N * 1)).toBeLessThan(0.25);
  });

  it("出自の偏り（elementBias）は加算されるが分布の形は変えない", () => {
    // playerAptitudes は origin:<id> 主体の引きに偏りを足す（NPC と同じ引きから）
    const mk = (origin: string) =>
      ({ seed: "w", player: { origin } }) as Parameters<typeof playerAptitudes>[0];
    const plain = playerAptitudes(mk("smith_child"), MAGIC);
    const biased = playerAptitudes(mk("smith_child"), MAGIC, { fire: 0.1 });
    expect(biased.fire).toBeCloseTo(plain.fire + 0.1, 5);
    // 偏りを足しても 0..1 の範囲に収まる
    const clamped = playerAptitudes(mk("x"), MAGIC, { fire: 10 });
    expect(clamped.fire).toBeLessThanOrEqual(1);
  });

  it("npcAptitudes は npc:<id> 主体と同じ引きを返す", () => {
    const a = npcAptitudes("w", "npc.garo", MAGIC);
    expect(a.fire).toBe(elementAptitude("w", "npc:npc.garo", "fire", MAGIC));
    expect(a.water).toBe(elementAptitude("w", "npc:npc.garo", "water", MAGIC));
  });
});

describe("M-01 詠唱・中断・威力", () => {
  it("詠唱は技能で短くなり、下限 castMin を切らない", () => {
    const noSkill = castTicksOf(fireBolt, 0, {}, MAGIC);
    const skilled = castTicksOf(fireBolt, 40, {}, MAGIC);
    expect(noSkill).toBe(fireBolt.spell!.cast);
    expect(skilled).toBeLessThan(noSkill);
    expect(skilled).toBe(Math.max(MAGIC.castMin, 12 - 40 * 0.3));
    // 技能が上がっても castMin を割らない
    expect(castTicksOf(fireBolt, 200, {}, MAGIC)).toBe(MAGIC.castMin);
  });

  it("パッシブの castSpeed で短くなり、instantCast なら 0 になる", () => {
    const base = castTicksOf(fireBolt, 10, {}, MAGIC);
    const fast = castTicksOf(fireBolt, 10, { castSpeed: 0.5 }, MAGIC);
    expect(fast).toBeLessThan(base);
    expect(castTicksOf(fireBolt, 10, { instantCast: 1 }, MAGIC)).toBe(0);
  });

  it("中断の確率は魔力操作で下がり、上下限で止まる", () => {
    const low = interruptChanceOf(0, MAGIC);
    const high = interruptChanceOf(50, MAGIC);
    expect(low).toBeGreaterThan(high);
    expect(interruptChanceOf(0, MAGIC)).toBeLessThanOrEqual(MAGIC.interruptMax);
    expect(interruptChanceOf(1000, MAGIC)).toBeGreaterThanOrEqual(MAGIC.interruptMin);
  });

  it("呪文威力は技能・精神・適性・Lvで伸びる", () => {
    const base = spellPowerOf(fireBolt, 1, 10, 10, 0.5, 0.04, MAGIC);
    expect(spellPowerOf(fireBolt, 1, 30, 10, 0.5, 0.04, MAGIC)).toBeGreaterThan(base);
    expect(spellPowerOf(fireBolt, 1, 10, 30, 0.5, 0.04, MAGIC)).toBeGreaterThan(base);
    expect(spellPowerOf(fireBolt, 1, 10, 10, 0.9, 0.04, MAGIC)).toBeGreaterThan(base);
    expect(spellPowerOf(fireBolt, 5, 10, 10, 0.5, 0.04, MAGIC)).toBeGreaterThan(base);
  });
});

describe("M-01 属性の相性（布石×打ち手）", () => {
  it("濡れ＋風（雷）・油＋火・凍結＋打撃・風＋火が発火する", () => {
    const wet = { wet: { until: 50 } };
    const oil = { oil: { until: 50 } };
    const frozen = { frozen: { until: 50 } };
    const burn = { burn: { until: 50 } };
    expect(interactionOf(wet, "wind", 10, MAGIC)?.id).toBe("shock");
    expect(interactionOf(oil, "fire", 10, MAGIC)?.id).toBe("enflame");
    expect(interactionOf(frozen, "blunt", 10, MAGIC)?.id).toBe("shatter");
    expect(interactionOf(burn, "wind", 10, MAGIC)?.id).toBe("fan");
  });

  it("布石が無い・切れている・打ち手が違えば発火しない", () => {
    expect(interactionOf({}, "wind", 10, MAGIC)).toBeUndefined();
    expect(interactionOf({ wet: { until: 5 } }, "wind", 10, MAGIC)).toBeUndefined();
    expect(interactionOf({ wet: { until: 50 } }, "fire", 10, MAGIC)).toBeUndefined();
    // 凍結は打撃（blunt）にだけ反応し、斬撃・突撃・魔法には応じない
    expect(interactionOf({ frozen: { until: 50 } }, "slash", 10, MAGIC)).toBeUndefined();
    expect(interactionOf({ frozen: { until: 50 } }, "fire", 10, MAGIC)).toBeUndefined();
  });
});

describe("M-01 付与（エンチャントの窓）", () => {
  const mkState = (over?: {
    skills?: Record<string, number>;
    mana?: number;
    counters?: Record<string, number>;
    weapons?: string[];
  }) =>
    ({
      player: {
        skills: Object.fromEntries(
          Object.entries(over?.skills ?? {}).map(([k, v]) => [
            k,
            { value: v, peak: v, potential: 100, pending: 0, lastUsedDay: 0 },
          ]),
        ),
        mana: over?.mana ?? 50,
        weapons: over?.weapons ?? ["sword"],
      },
      counters: over?.counters ?? {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  it("鍛冶・火魔法・魔力・所持の全部が揃ったときだけ付与できる", () => {
    const full = mkState({ skills: { smithing: 30, fire_magic: 25 } });
    expect(canEnchant(full, "sword", MAGIC).ok).toBe(true);
    expect(
      canEnchant(mkState({ skills: { smithing: 29, fire_magic: 25 } }), "sword", MAGIC).reason,
    ).toBe("smithing");
    expect(
      canEnchant(mkState({ skills: { smithing: 30, fire_magic: 24 } }), "sword", MAGIC).reason,
    ).toBe("fire");
    expect(
      canEnchant(mkState({ skills: { smithing: 30, fire_magic: 25 }, mana: 10 }), "sword", MAGIC)
        .reason,
    ).toBe("mana");
    expect(
      canEnchant(mkState({ skills: { smithing: 30, fire_magic: 25 }, weapons: [] }), "sword", MAGIC)
        .reason,
    ).toBe("weapon");
    // 上限まで刻んだ剣にはもう掛けられない
    expect(
      canEnchant(
        mkState({ skills: { smithing: 30, fire_magic: 25 }, counters: { "enchant.sword": 3 } }),
        "sword",
        MAGIC,
      ).reason,
    ).toBe("maxed");
  });

  it("付与の段は counters に積み、攻撃係数に畳まれる", () => {
    const s = mkState({ counters: { "enchant.sword": 2 } });
    expect(enchantLevel(s, "sword")).toBe(2);
    expect(enchantFactor(s, "sword", MAGIC)).toBeCloseTo(1 + 2 * 0.08, 5);
  });
});

describe("M-01 魔力の器", () => {
  it("manaMaxOf は精神で伸びる（気力と同じ器の理）", () => {
    const arts = { manaBase: 15, manaPerSpirit: 1.2 } as Parameters<typeof manaMaxOf>[1];
    expect(manaMaxOf({ spirit: 10 }, arts)).toBe(27);
    expect(manaMaxOf({ spirit: 30 }, arts)).toBe(51);
  });

  it("生活魔法の効果はカウンタのキーに畳まれる", () => {
    expect(lifeBuffKey("cookBonus")).toBe("spell.buff.cookBonus");
  });
});
