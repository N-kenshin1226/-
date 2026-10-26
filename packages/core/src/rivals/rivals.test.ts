import { describe, expect, it } from "vitest";
import { newGame } from "../state/newGame.js";
import type { GameState, Work } from "../state/types.js";
import { playerScore, rivalsOf, type RivalNamePool, type RivalsConfig } from "./index.js";

/**
 * ライバル・ランキング（T-47、05 M4・03 §5）。
 * 順位表は派生値：同じ世界シード＋同じ state から同じ表が組み立てられ、
 * 世界を進める乱数列（state.rng）は一切消費しないことを確認する
 */

const cfg: RivalsConfig = {
  size: 5,
  scoreMin: 30,
  scoreMax: 220,
  growthPerDay: 0.4,
  playerQualityWeight: 1.0,
  playerTitleWeight: 12,
  playerKillWeight: 1.5,
  playerAbyssWeight: 6,
};

const pool: RivalNamePool = {
  names: ["アルロ", "セイラ", "ドグ", "リズ", "バーン", "テト", "ミュル", "ハーク"],
  epithets: ["流浪の剣士", "凄腕の狩人", "名うての職人", "腕試しの傭兵", "物静かな弓手"],
};

const state = (seed = "t"): GameState =>
  newGame(seed, "テスト", {
    skillIds: ["smithing", "mining", "swordplay"],
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 0,
    origin: { id: "origin.villager", potentialBase: 100, affinity: {} },
    potentialInitMin: 0,
    potentialInitMax: 0,
  });

const work = (id: string, quality: number): Work => ({
  id,
  kind: "smithing",
  maker: "テスト",
  quality,
  tier: 1,
  flags: [],
  day: 0,
  worldSeed: "t",
  marketValue: 100,
});

describe("rivalsOf（T-47 ライバル・ランキング）", () => {
  it("決定論：同じ世界シード＋同じ state で同じ順位表", () => {
    const a = rivalsOf(state("worldA"), pool, cfg);
    const b = rivalsOf(state("worldA"), pool, cfg);
    expect(a).toEqual(b);
  });

  it("世界シードでライバルの素性が変わる", () => {
    const names = new Set<string>();
    for (const seed of ["w1", "w2", "w3", "w4", "w5", "w6"]) {
      const r = rivalsOf(state(seed), pool, cfg);
      names.add(
        r.entries
          .filter((e) => !e.isPlayer)
          .map((e) => e.name)
          .join("/"),
      );
    }
    // 全シードで同一の顔ぶれにはならない（決定論的生成の確認）
    expect(names.size).toBeGreaterThan(1);
  });

  it("ライバルは母集団から重複なしで選ばれ、順位表は size+1 行", () => {
    const r = rivalsOf(state("t"), pool, cfg);
    const rivals = r.entries.filter((e) => !e.isPlayer);
    expect(rivals).toHaveLength(cfg.size);
    expect(new Set(rivals.map((e) => e.name)).size).toBe(cfg.size);
    expect(rivals.every((e) => pool.names.includes(e.name))).toBe(true);
    expect(r.entries).toHaveLength(cfg.size + 1);
    // 順位は 1 から連番、名声の降順
    r.entries.forEach((e, i) => expect(e.rank).toBe(i + 1));
    for (let i = 1; i < r.entries.length; i++) {
      expect(r.entries[i]!.score).toBeLessThanOrEqual(r.entries[i - 1]!.score);
    }
  });

  it("自分の行が含まれ、順位は実績点に連動する", () => {
    const s = state("t");
    const before = rivalsOf(s, pool, cfg);
    const me = before.entries.find((e) => e.isPlayer)!;
    expect(me.name).toBe("テスト");
    expect(before.playerRank).toBe(me.rank);

    // 実績を積むと順位が上がる（上がらなければ据え置き。逆に落ちることはない）
    s.ledger = [work("w1", 500)];
    s.titles = ["title.a", "title.b", "title.c"];
    s.counters["kill.species.wolf"] = 30;
    s.counters["abyss.best"] = 10;
    const after = rivalsOf(s, pool, cfg);
    expect(after.playerScore).toBeGreaterThan(before.playerScore);
    expect(after.playerRank).toBeLessThanOrEqual(before.playerRank);
    // ライバルの行（名・二つ名・名声）は自分の実績では変わらない
    const namesOf = (r: typeof before) =>
      r.entries.filter((e) => !e.isPlayer).map((e) => `${e.name}:${e.score}`);
    expect(namesOf(after)).toEqual(namesOf(before));
  });

  it("playerScore：台帳の最高品質・称号数・討伐数・深層ベストを重み付きで合算", () => {
    const s = state("t");
    expect(playerScore(s, cfg)).toBe(0);
    s.ledger = [work("a", 40), work("b", 90)];
    expect(playerScore(s, cfg)).toBe(90); // 最高品質だけが効く
    s.titles = ["t1", "t2"];
    s.counters["kill.species.wolf"] = 4;
    s.counters["kill.species.deer"] = 2;
    s.counters["abyss.best"] = 3;
    expect(playerScore(s, cfg)).toBe(Math.round(90 + 2 * 12 + 6 * 1.5 + 3 * 6));
  });

  it("世界を進める乱数列（state.rng）を消費しない", () => {
    const s = state("t");
    s.ledger = [work("w", 50)];
    const before = JSON.parse(JSON.stringify(s.rng));
    rivalsOf(s, pool, cfg);
    playerScore(s, cfg);
    expect(s.rng).toEqual(before);
  });

  it("日が経つとライバルの名声が伸びる（追い越すには実績が要る）", () => {
    const early = rivalsOf(state("t"), pool, cfg);
    const late = state("t");
    late.time.day = 100;
    const later = rivalsOf(late, pool, cfg);
    const sum = (r: typeof early) =>
      r.entries.filter((e) => !e.isPlayer).reduce((s, e) => s + e.score, 0);
    expect(sum(later)).toBeGreaterThan(sum(early));
    // ただし顔ぶれ（名・二つ名の組み合わせ）は変わらない
    const faces = (r: typeof early) =>
      r.entries
        .filter((e) => !e.isPlayer)
        .map((e) => `${e.name}/${e.epithet}`)
        .sort();
    expect(faces(later)).toEqual(faces(early));
  });

  it("同点では自分が上に並ぶ（自慢帳は読み手のためにある）", () => {
    const s = state("t");
    // 全員0点の表（scoreMin=scoreMax・伸びなし）で同点のタイブレークを見る
    const flat: RivalsConfig = { ...cfg, scoreMin: 0, scoreMax: 0, growthPerDay: 0 };
    const tied = rivalsOf(s, pool, flat);
    // 全員 0 点：自分が1位（同点のタイブレーク）
    expect(tied.entries[0]!.isPlayer).toBe(true);
    expect(tied.playerRank).toBe(1);
    // ライバル同士の同点は名順で安定している
    const rivalNames = tied.entries.filter((e) => !e.isPlayer).map((e) => e.name);
    expect([...rivalNames].sort((a, b) => a.localeCompare(b))).toEqual(rivalNames);
    // 別の呼び出しでも同じ並び（決定論）
    expect(rivalsOf(s, pool, flat).entries).toEqual(tied.entries);
  });
});
