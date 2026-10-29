import { describe, expect, it } from "vitest";
import { generateWorld, placeTownOf, placeTypeOf } from "./index.js";
import type { WorldGenConfig, WorldTypeFile } from "./index.js";

/**
 * 地方の生成（G-01、docs/10_world_generation.md）の検証。
 * world.json そのものではなく最小の型定義表で回す ——
 * ここで確かめるのは生成ルール（決定性・連結・安全圏・危険度の坂）
 */

const cfg: WorldGenConfig = {
  towns: { min: 6, max: 9 },
  areas: { min: 15, max: 25 },
  typeMaxPerWorld: 2,
  extraEdgeChance: 0.2,
  journeyDays: { min: 1, max: 3 },
  ringDangerFactor: 1,
  ringDangerStep: 2,
  safeDanger: 2,
  dangerJitter: 0.5,
  dangerMin: 0,
  dangerMax: 10,
  areasPerTownMin: 2,
  areasExtraPerRing: 1.5,
  areaEnemies: { min: 2, max: 4 },
  dangerChallengeBase: 2,
  dangerChallengePer: 2,
  spots: { min: 1, max: 2 },
  placeJitter: 3,
  market: { cheapFactor: 0.8, dearFactor: 1.25, townJitter: 0.1 },
  mentor: { feeMin: 40, feeMax: 60, potentialRecover: 20, gainVs: 1, condition: 8 },
  rep: { max: 100, errand: 4, work: 2, donate: 3, pricePer: 0.002 },
  errandBond: 8,
  // 道の振り分け・地図の座標（G-02、recipe 2〜）
  roads: {
    seaPortChance: 0.6,
    mountainRing: 2,
    mountainChance: 0.5,
    dangerBase: 1,
    dangerPerRing: 1.5,
    dangerPerDay: 0.5,
    dangerJitter: 0.5,
    dangerMin: 1,
    dangerMax: 8,
    checkpointChance: 0.3,
    checkpointFee: { min: 8, max: 20 },
    closedSeasons: { mountain: [3], sea: [3] },
    enemies: { min: 1, max: 3 },
  },
  map: {
    center: [50, 50],
    radiusPerRing: 24,
    angleJitter: 0.5,
    radiusJitter: 5,
    margin: 8,
    minTownDist: 12,
  },
};

const file: WorldTypeFile = {
  townBase: {
    places: [
      {
        key: "gate",
        name: "門",
        scene: "gate",
        pos: [50, 80],
        desc: "{town}の門",
        actions: [{ type: "stroll" }],
      },
      {
        key: "market",
        name: "市場",
        scene: "market",
        pos: [50, 50],
        desc: "{town}の市場",
        actions: [{ type: "market" }, { type: "stroll" }],
      },
      {
        key: "inn",
        name: "宿屋",
        scene: "inn",
        pos: [30, 60],
        desc: "{town}の宿屋",
        actions: [{ type: "rest" }, { type: "errand" }],
      },
      {
        key: "church",
        name: "教会",
        scene: "church",
        pos: [70, 40],
        desc: "{town}の教会",
        actions: [{ type: "pray" }, { type: "donate" }],
      },
      {
        key: "home",
        name: "自宅",
        scene: "home",
        pos: [60, 70],
        desc: "{town}の自宅",
        actions: [{ type: "sleep" }],
      },
    ],
    npcs: [
      { id: "innkeeper", label: "宿屋の主", place: "inn", mentorSkills: ["cooking"] },
      { id: "priest", label: "神父", place: "church" },
    ],
    market: { stock: ["meal.bread", "herb"] },
  },
  townTypes: [
    {
      id: "village",
      name: "農村",
      desc: "畑の村",
      names: ["ミーナ", "コルト"],
      startWeight: 3,
      weight: 3,
      places: [
        {
          key: "field",
          name: "畑",
          scene: "town",
          pos: [80, 80],
          desc: "{town}の畑",
          actions: [{ type: "work", kinds: ["farm"] }, { type: "gather" }],
          gather: {
            skill: "gathering",
            difficulty: 8,
            entries: [{ item: "herb", weight: 1, n: [1, 2] }],
          },
        },
      ],
      npcs: [{ id: "elder", label: "村長", place: "inn" }],
      market: { stock: ["nut"], cheap: ["herb"] },
      errands: [
        {
          id: "herb",
          name: "薬草の納品",
          text: "教会へ薬草を",
          need: { herb: 2 },
          reward: { money: 20, bond: true },
        },
      ],
      stroll: [{ weight: 1, text: "――風が畑を渡る。", money: 1 }],
    },
    {
      id: "castle",
      name: "城下町",
      desc: "城の町",
      names: ["ルーン", "ヴァルト"],
      startWeight: 0,
      weight: 2,
      omit: ["home"],
      places: [
        {
          key: "forge",
          name: "鍛冶場",
          scene: "forge",
          pos: [40, 40],
          desc: "{town}の鍛冶場",
          actions: [{ type: "work", kinds: ["smith"] }],
        },
      ],
      npcs: [{ id: "smith", label: "鍛冶職人", place: "forge", mentorSkills: ["craft"] }],
      market: { dear: ["herb"] },
      stroll: [{ weight: 1, text: "――鎧の音がする。" }],
    },
    {
      id: "port",
      name: "港町",
      desc: "港の町",
      names: ["シーガ"],
      startWeight: 1,
      weight: 2,
      market: { stock: ["fish.sea"] },
    },
    {
      id: "mine",
      name: "鉱山町",
      desc: "鉱山の町",
      names: ["ガラン"],
      startWeight: 1,
      weight: 2,
    },
  ],
  areaTypes: [
    {
      id: "meadow",
      name: "草原",
      names: ["緑の原", "風の野"],
      descs: ["草の匂いがする。"],
      scene: "highway",
      danger: 1,
      gather: {
        skill: "gathering",
        difficulty: 8,
        entries: [{ item: "herb", weight: 1, n: [1, 1] }],
      },
      enemies: [
        { id: "slime", weight: 3 },
        { id: "hare", weight: 2 },
      ],
      spots: [{ kind: "spring", weight: 2 }],
      stroll: [{ weight: 1, text: "――草が鳴る。" }],
    },
    {
      id: "woods",
      name: "森",
      names: ["薄闇の森"],
      descs: ["木々が密だ。"],
      scene: "forest",
      danger: 2,
      hunt: true,
      fish: true,
      enemies: [
        { id: "slime", weight: 1 },
        { id: "wolf", weight: 2 },
        { id: "bear", weight: 1 },
      ],
      spots: [
        { kind: "spring", weight: 1 },
        { kind: "cave", weight: 1 },
      ],
    },
    {
      id: "marsh",
      name: "沼地",
      names: ["沈みの沢"],
      descs: ["足元が濡れる。"],
      scene: "lake",
      danger: 4,
      enemies: [
        { id: "wolf", weight: 1 },
        { id: "wraith", weight: 2 },
      ],
    },
    {
      id: "peak",
      name: "高峰",
      names: ["白き峰"],
      descs: ["空気が薄い。"],
      scene: "forest",
      danger: 7,
      work: { kinds: ["mine"] },
      enemies: [
        { id: "bear", weight: 1 },
        { id: "golem", weight: 2 },
      ],
    },
    {
      id: "farm",
      name: "開墾地",
      names: ["入植地"],
      descs: ["開けた土地。"],
      scene: "highway",
      danger: 0,
      special: "farm",
      work: { kinds: ["farm"] },
      gather: {
        skill: "gathering",
        difficulty: 5,
        entries: [{ item: "nut", weight: 1, n: [1, 1] }],
      },
    },
    {
      id: "abyss",
      name: "深層の穴",
      names: ["底なしの穴"],
      descs: ["底が見えない。"],
      scene: "abyss",
      danger: 9,
      special: "abyss",
      enemies: [{ id: "golem", weight: 1 }],
    },
  ],
  spotKinds: [
    {
      id: "spring",
      names: ["清水", "湧き水"],
      outcomes: [{ weight: 1, text: "――水を汲んだ。", items: { herb: 1 }, pray: true }],
    },
    {
      id: "cave",
      names: ["洞窟の口"],
      outcomes: [{ weight: 1, text: "――誰かの忘れ物だ。", money: 8 }],
    },
  ],
  npcNames: ["マルタ", "エーデル", "ハンス", "リーザ"],
  npcVoice: { greet: ["よう"], respect: ["いつもの方だ"] },
  mentorText: {
    desc: "{town}で{skill}を教えてくれる。",
    note: "{skill} {condition} 以上なら学べそうだ。",
  },
};

/** 町グラフで startTown から全部の町に届くか */
const allTownsReachable = (w: ReturnType<typeof generateWorld>): boolean => {
  const adj = new Map<string, string[]>();
  for (const r of w.roads) {
    adj.set(r.from, [...(adj.get(r.from) ?? []), r.to]);
    adj.set(r.to, [...(adj.get(r.to) ?? []), r.from]);
  }
  const seen = new Set<string>([w.startTown]);
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

describe("generateWorld（G-01 地方の生成）", () => {
  it("同じシードなら同じ地方が出る（決定性）", () => {
    const a = generateWorld("w-seed", file, cfg);
    const b = generateWorld("w-seed", file, cfg);
    expect(a).toEqual(b);
  });

  it("違うシードなら違う地方が出る", () => {
    const names = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const w = generateWorld(`s${i}`, file, cfg);
      names.add(JSON.stringify(w.towns.map((t) => t.name)));
    }
    expect(names.size).toBeGreaterThan(1);
  });

  it("町6〜9・地域15〜25・特別地域が必ず1つずつ（1000シード）", () => {
    for (let i = 0; i < 1000; i++) {
      const w = generateWorld(`n${i}`, file, cfg);
      expect(w.towns.length).toBeGreaterThanOrEqual(6);
      expect(w.towns.length).toBeLessThanOrEqual(9);
      expect(w.areas.length).toBeGreaterThanOrEqual(15);
      expect(w.areas.length).toBeLessThanOrEqual(25);
      expect(w.areas.filter((a) => a.typeId === "farm")).toHaveLength(1);
      expect(w.areas.filter((a) => a.typeId === "abyss")).toHaveLength(1);
    }
  });

  it("町グラフは連結：始まりの町から全部の町に道が届く（1000シード）", () => {
    for (let i = 0; i < 1000; i++) {
      const w = generateWorld(`c${i}`, file, cfg);
      expect(allTownsReachable(w)).toBe(true);
      // 地域は必ずどこかの町にぶら下がる
      for (const a of w.areas) {
        expect(w.towns.some((t) => t.id === a.town)).toBe(true);
      }
    }
  });

  it("始まりの町の周りは安全で、遠いほど危険になる", () => {
    for (let i = 0; i < 200; i++) {
      const w = generateWorld(`d${i}`, file, cfg);
      const ring0 = w.areas.filter((a) => a.ring === 0 && a.typeId !== "abyss");
      // 輪0に出る型は danger ≤ safeDanger から選ぶ（ゆらぎ込みでも上限近傍）
      for (const a of ring0) {
        expect(a.danger).toBeLessThanOrEqual(cfg.safeDanger + cfg.dangerJitter + 0.001);
      }
      // 深淵は最遠の輪に属する
      const abyss = w.areas.find((a) => a.typeId === "abyss")!;
      expect(abyss.ring).toBe(Math.max(...w.towns.map((t) => t.ring)));
      // 平均の危険度は最遠の輪のほうが高い
      const maxRing = Math.max(...w.areas.map((a) => a.ring));
      if (maxRing >= 1) {
        const mean = (as: typeof w.areas) => as.reduce((s, a) => s + a.danger, 0) / as.length;
        const far = w.areas.filter((a) => a.ring === maxRing);
        expect(mean(far)).toBeGreaterThanOrEqual(mean(ring0) - 1);
      }
    }
  });

  it("町の場所・門の道・地域の結線が揃っている", () => {
    const w = generateWorld("wire", file, cfg);
    for (const town of w.towns) {
      const gate = w.places.find((p) => p.id === `${town.id}.gate`);
      expect(gate, `${town.id}.gate`).toBeDefined();
      const market = w.places.find((p) => p.id === `${town.id}.market`);
      expect(market, `${town.id}.market`).toBeDefined();
      // 門からは隣町への旅と、ぶら下がる地域への移動が出る
      const neighbors = w.roads
        .flatMap((r) => (r.from === town.id ? [r.to] : r.to === town.id ? [r.from] : []))
        .sort();
      const journeys = gate!.actions
        .filter((a) => a.type === "journey")
        .map((a) => a.to)
        .sort();
      expect(journeys).toEqual(neighbors);
      const townAreas = w.areas.filter((a) => a.town === town.id).map((a) => a.id);
      const travels = gate!.actions
        .filter((a) => a.type === "travel")
        .map((a) => a.to)
        .sort();
      expect(travels).toEqual([...townAreas].sort());
    }
    // 全場所が life.places に載り、帰属が取れる
    for (const p of w.places) {
      expect(placeTownOf(w, p.id)).toBe(p.town);
      expect(placeTypeOf(w, p.id)).toBeDefined();
    }
    // 地域の門戻りが付いている
    for (const a of w.areas) {
      const place = w.places.find((p) => p.id === a.id)!;
      expect(place.actions.some((x) => x.type === "travel" && x.to === `${a.town}.gate`)).toBe(
        true,
      );
    }
  });

  it("住人・師匠・依頼・市場・地点の生成が揃っている", () => {
    const w = generateWorld("meta", file, cfg);
    // 住人は全町に基礎住人が居る（innkeeper/priest）
    for (const town of w.towns) {
      expect(w.npcs.some((n) => n.id === `npc.${town.id}.innkeeper`)).toBe(true);
      expect(w.npcs.some((n) => n.id === `npc.${town.id}.priest`)).toBe(true);
      // 住人は場所にぶら下がっている
      const inn = w.places.find((p) => p.id === `${town.id}.inn`)!;
      expect(inn.npcs).toContain(`npc.${town.id}.innkeeper`);
    }
    // 師匠：mentorSkills を持つ住人から生成。id・flag・場所が揃う
    const mentorIds = new Set(w.mentors.map((m) => m.id));
    expect(mentorIds.size).toBe(w.mentors.length);
    for (const m of w.mentors) {
      expect(m.id.startsWith("mentor.")).toBe(true);
      expect(m.flag).toContain("taught.");
      expect(w.places.some((p) => p.id === m.place)).toBe(true);
      expect(m.potentialRecover).toBe(cfg.mentor.potentialRecover);
    }
    // 掲示依頼：err.<町>.<key>、bond:true はその町の宿屋の主に解決
    const errands = w.life.errands.filter((e) => e.id.startsWith("err."));
    for (const e of errands) {
      const town = e.id.split(".")[1]!;
      expect(e.town).toBe(town);
      if (e.reward.bond !== undefined) {
        expect(e.reward.bond.npc).toBe(`npc.${town}.innkeeper`);
        expect(e.reward.bond.amount).toBe(cfg.errandBond);
      }
    }
    // 市場：どの町にも基本の品が並ぶ
    for (const entry of w.life.marketStock) {
      expect((entry.towns ?? []).length).toBeGreaterThan(0);
    }
    // 地点：行動と出来事表が揃う
    for (const a of w.areas) {
      const place = w.places.find((p) => p.id === a.id)!;
      for (const s of a.spots) {
        expect(place.actions.some((x) => x.type === "spot" && x.spot === s.id)).toBe(true);
        expect(w.life.spots[s.id]).toBeDefined();
      }
    }
  });

  it("敵は危険度に見合う強さで選ばれる", () => {
    const challenge = { slime: 1, hare: 1, wolf: 4, bear: 7, wraith: 8, golem: 10 };
    for (let i = 0; i < 100; i++) {
      const w = generateWorld(`e${i}`, file, cfg, challenge);
      for (const a of w.areas) {
        if (a.typeId === "farm") continue;
        const cap = cfg.dangerChallengeBase + a.danger * cfg.dangerChallengePer;
        // 蓋を超える敵は「蓋以下の種類が実際の抽選数に足りない」場合のみ
        // 弱い順に埋める（生成器のパディングと同じ条件）
        const fit = (file.areaTypes.find((t) => t.id === a.typeId)?.enemies ?? []).filter(
          (e) => challenge[e.id as keyof typeof challenge] <= cap,
        );
        if (fit.length >= a.enemies.length) {
          for (const e of a.enemies) {
            expect(
              challenge[e.id as keyof typeof challenge],
              `${a.id}:${e.id}`,
            ).toBeLessThanOrEqual(cap);
          }
        }
      }
      // 安全な輪0の森には golem は出ない
      const safe = w.areas.filter((a) => a.ring === 0);
      for (const a of safe) {
        expect(a.enemies.map((e) => e.id)).not.toContain("golem");
      }
    }
  });

  it("型別の散策表・採集表・市場係数が life 寄与に載る", () => {
    const w = generateWorld("life", file, cfg);
    expect(w.life.stroll["town.village"]).toBeDefined();
    expect(w.life.stroll["town.castle"]).toBeDefined();
    expect(w.life.stroll["region.meadow"]).toBeDefined();
    // 畑のある町の場所に採集表がある
    const field = w.places.find((p) => p.id.endsWith(".field"));
    expect(field).toBeDefined();
    expect(w.life.gather[field!.id]).toBeDefined();
    // 地域の採集表
    expect(w.life.gather["meadow"]).toBeDefined();
    // 市場係数：村の herb は安い
    const villageTown = w.towns.find((t) => t.typeId === "village");
    expect(villageTown).toBeDefined();
    expect(w.life.townFactor[villageTown!.id]!["herb"]).toBeLessThan(1);
    // 旅は双方向
    for (const j of w.life.journeys) {
      expect(w.roads.some((r) => r.from === j.from && r.to === j.to)).toBe(true);
    }
  });

  it("町どうしは地図で名が読める間隔を保つ（500シード）", () => {
    // 黄金角の散らしだけでは近い輪の町が重なることがある —— 生成後の
    // 離散化で minTownDist を下回る対が残っていてはいけない（X-01）
    for (let i = 0; i < 500; i++) {
      const w = generateWorld(`map-sep-${i}`, file, cfg);
      for (let a = 0; a < w.towns.length; a++) {
        for (let b = a + 1; b < w.towns.length; b++) {
          const [ax, ay] = w.towns[a]!.pos;
          const [bx, by] = w.towns[b]!.pos;
          const d = Math.hypot(bx - ax, by - ay);
          expect(
            d,
            `seed=map-sep-${i}: ${w.towns[a]!.id}(${ax},${ay}) ↔ ${w.towns[b]!.id}(${bx},${by})`,
          ).toBeGreaterThanOrEqual(cfg.map.minTownDist - 0.5);
        }
      }
    }
  });
});
