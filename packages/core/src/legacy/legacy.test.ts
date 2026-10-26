import { describe, expect, it } from "vitest";
import { legacyOf, type LegacyConfig } from "./index.js";
import { newGame } from "../state/newGame.js";
import { serialize, deserialize, SAVE_VERSION } from "../save/index.js";
import type { GameState, Work } from "../state/types.js";

const CFG: LegacyConfig = {
  potentialFactor: 0.1,
  potentialMax: 15,
  rememberedMax: 2,
  artifactGainFactor: 1.05,
};

const base = (): GameState =>
  newGame("t", "前世", {
    skillIds: ["smithing", "mining"],
    initialPotential: 100,
    initialStatValue: 10,
    initialMoney: 0,
  });

const work = (id: string, quality: number): Work => ({
  id,
  kind: "smithing",
  maker: "前世",
  quality,
  tier: 1,
  flags: [],
  day: 1,
  worldSeed: "t",
  marketValue: 0,
});

describe("legacyOf（T-39 継承の3項目）", () => {
  it("素質補正：前世の peak の一部が次周の素質になる（上限あり）", () => {
    const s = base();
    s.player.skills["smithing"]!.peak = 80; // → +8
    s.player.skills["mining"]!.peak = 500; // → 上限15
    const l = legacyOf(s, CFG);
    expect(l.potentialBonus["smithing"]).toBe(8);
    expect(l.potentialBonus["mining"]).toBe(15);
  });

  it("記憶の称号：ランク上位から rememberedMax 件（同ランクは後に獲得した方）", () => {
    const s = base();
    s.titles = ["title.b1", "title.s1", "title.b2", "title.a1"];
    const l = legacyOf(s, CFG, {
      titleDefs: [
        { id: "title.b1", rank: "B" },
        { id: "title.b2", rank: "B" },
        { id: "title.s1", rank: "S" },
        { id: "title.a1", rank: "A" },
      ],
    });
    expect(l.rememberedTitles).toEqual(["title.s1", "title.a1"]); // S>A で上位2件
  });

  it("遺物：指定がなければ品質最高の作品。指定すればその1個", () => {
    const s = base();
    s.ledger = [work("a", 40), work("b", 90), work("c", 60)];
    expect(legacyOf(s, CFG).artifact?.name).toBe("smithing"); // order 無しは kind 名
    expect(legacyOf(s, CFG).artifact?.quality).toBe(90);
    const picked = legacyOf(s, CFG, { artifactId: "c" });
    expect(picked.artifact?.quality).toBe(60);
  });

  it("newGame に渡すと：素質底上げ・記憶称号・遺物が次周に現れる", () => {
    const prev = base();
    prev.player.skills["smithing"]!.peak = 80;
    prev.titles = ["title.x"];
    prev.ledger = [work("a", 90)];
    const legacy = legacyOf(prev, CFG);

    const next = newGame("t2", "今世", {
      skillIds: ["smithing", "mining"],
      initialPotential: 100,
      initialStatValue: 10,
      initialMoney: 0,
      legacy,
    });
    expect(next.player.skills["smithing"]!.potential).toBe(108); // 100+8
    expect(next.player.skills["smithing"]!.potentialCap).toBe(108);
    expect(next.titles).toEqual(["title.x"]);
    expect(next.flags["memory.title.title.x"]).toBe(true);
    expect(next.legacy?.artifact?.quality).toBe(90);
    // 補正なしの周は従来どおり
    const fresh = base();
    expect(fresh.player.skills["smithing"]!.potential).toBe(100);
    expect(fresh.legacy).toBeNull();
  });

  it("セーブv12の移行で legacy=null が補われ、最新バージョンまで進む", () => {
    const s = base();
    const v12 = { ...JSON.parse(serialize(s)), version: 12 } as Record<string, unknown>;
    delete v12["legacy"];
    const g = deserialize(JSON.stringify(v12));
    expect(g.version).toBe(SAVE_VERSION);
    expect(g.legacy).toBeNull();
  });
});
