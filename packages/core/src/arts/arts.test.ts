import { describe, expect, it } from "vitest";
import {
  artExpGain,
  artExpToNext,
  artLevelFor,
  checkArtsLearn,
  consolidateArts,
  defaultBuild,
  kiMaxOf,
  manaMaxOf,
  normalizeBuild,
  recordArtUse,
  styleShare,
  type ArtDef,
  type ArtsConfig,
} from "./index.js";
import { newGame } from "../state/newGame.js";
import type { GameState } from "../state/types.js";

/* ── K-02：武技・資源・構成（docs/09 §1〜3・§5〜7） ── */

const defs: Record<string, ArtDef> = {
  s_slash: {
    id: "s_slash",
    name: "薙ぎ払い",
    skill: "swordplay",
    learn: { at: 4 },
    kind: "attack",
    power: 1.1,
    dtype: "slash",
    part: "body",
    ki: 3,
    ct: 1.0,
    desc: "剣術の基本技。",
  },
  s_riposte: {
    id: "s_riposte",
    name: "受け流し斬り",
    skill: "swordplay",
    // 使い方の傾き条件つき（防御中心の使い方で覚える技。09 §7.1）
    learn: { at: 12, tag: "after.guard", share: 0.2 },
    kind: "response",
    response: "parry",
    ki: 4,
    ct: 0.6,
    desc: "受け流しの構え。",
  },
  pa_grit: {
    id: "pa_grit",
    name: "不退転",
    skill: "evasion",
    learn: { at: 10 },
    kind: "passive",
    ki: 0,
    ct: 0,
    effect: { hook: "kiMax", value: 5 },
    desc: "気力の底が深くなる。",
  },
};

const ARTS: ArtsConfig = {
  defs,
  slots: 8,
  passiveSlots: 4,
  weaponSlots: 2,
  kiBase: 20,
  kiPerEndurance: 1.5,
  kiRegenPerTick: 0.45,
  manaBase: 15,
  manaPerSpirit: 1.2,
  levelStep: 8,
  maxLevel: 10,
  levelPowerFactor: 0.04,
  levelStatusFactor: 0.08,
  expBase: 1,
  expChallengeFactor: 0.02,
  partBreakShare: 0.35,
  breakDamageFactor: 1.15,
  breakAgilityFactor: 0.5,
  breakMoveFactor: 0.5,
  breakStatusFactor: 1.5,
  staggerFactor: 1.15,
  parryFactor: 0.15,
  parryCounterFactor: 2.6,
  evadeArtBonus: 0.55,
  guardArtFactor: 0.25,
  styleShareMin: 0.15,
};

const SKILL_IDS = ["swordplay", "dagger", "evasion", "observation"];

const mkState = (): GameState =>
  newGame("seed", "名無し", {
    skillIds: SKILL_IDS,
    initialPotential: 100,
    initialStatValue: 10,
    arts: ARTS,
  });

/** 技能値を直接いじった state（習得判定の材料） */
const withSkill = (g: GameState, id: string, value: number): GameState => ({
  ...g,
  player: {
    ...g.player,
    skills: { ...g.player.skills, [id]: { ...g.player.skills[id]!, value, peak: value } },
  },
});

describe("気力・魔力（09 §2）", () => {
  it("上限は基礎値＋能力比例＋パッシブ", () => {
    expect(kiMaxOf({ endurance: 14 }, ARTS)).toBeCloseTo(20 + 14 * 1.5);
    expect(kiMaxOf({ endurance: 14 }, ARTS, 5)).toBeCloseTo(46);
    expect(manaMaxOf({ spirit: 10 }, ARTS)).toBeCloseTo(15 + 10 * 1.2);
  });

  it("新規の旅立ちは気力・魔力が上限いっぱい", () => {
    const g = mkState();
    expect(g.player.ki).toBe(kiMaxOf(g.player.stats, ARTS));
    expect(g.player.mana).toBe(manaMaxOf(g.player.stats, ARTS));
  });
});

describe("技の Lv（09 §1）", () => {
  it("exp の累計で Lv が決まる（step×n の総和）", () => {
    expect(artLevelFor(0, ARTS)).toBe(1);
    expect(artLevelFor(8, ARTS)).toBe(2); // 8×1
    expect(artLevelFor(23, ARTS)).toBe(2); // 8×1+8×2=24 未満
    expect(artLevelFor(24, ARTS)).toBe(3);
    expect(artLevelFor(47, ARTS)).toBe(3); // 8+16+24=48 未満
    expect(artLevelFor(48, ARTS)).toBe(4);
    expect(artLevelFor(99999, ARTS)).toBe(10); // maxLevel で頭打ち
  });

  it("次の Lv までの必要経験（maxLevel は null）", () => {
    expect(artExpToNext({ lv: 1, exp: 0, pending: 0 }, ARTS)).toBe(8);
    expect(artExpToNext({ lv: 10, exp: 0, pending: 0 }, ARTS)).toBeNull();
  });

  it("使用経験は相手の格で伸びる", () => {
    expect(artExpGain(15, 25, ARTS)).toBe(1); // 格下は基礎値だけ
    expect(artExpGain(40, 25, ARTS)).toBeCloseTo(1 * (1 + 15 * 0.02));
  });
});

describe("構成の正規化（09 §6）", () => {
  it("未習得・種別違い・重複・未所持を削って正しい形に詰める", () => {
    let g = mkState();
    g = {
      ...g,
      player: {
        ...g.player,
        arts: { s_slash: { lv: 1, exp: 0, pending: 0 }, pa_grit: { lv: 1, exp: 0, pending: 0 } },
      },
    };
    const build = normalizeBuild(
      g,
      {
        // 未習得の s_riposte・パッシブの pa_grit・重複の s_slash が混ざる
        slots: ["s_slash", "s_riposte", "pa_grit", "s_slash"],
        passives: ["s_slash", "pa_grit"],
        weapons: ["sword", "fist", "dagger-x"],
      },
      ARTS,
    );
    expect(build.slots[0]).toBe("s_slash");
    expect(build.slots.filter((x) => x === "s_slash").length).toBe(1);
    expect(build.slots.every((x) => x !== "pa_grit" && x !== "s_riposte")).toBe(true);
    expect(build.slots.length).toBe(8);
    expect(build.passives[0]).toBe("pa_grit");
    expect(build.passives.length).toBe(4);
    // 未所持の武器は削られ、所持2本が入る
    expect(build.weapons).toEqual(["sword", "fist"]);
  });

  it("武器枠を全空にすると装備中の武器が本命に据わる", () => {
    const g = mkState();
    const build = normalizeBuild(g, { weapons: [null, null] }, ARTS);
    expect(build.weapons[0]).toBe("sword");
  });

  it("defaultBuild は習得済みの技を技能→習得順で詰める", () => {
    let g = mkState();
    g = {
      ...g,
      player: {
        ...g.player,
        arts: {
          s_riposte: { lv: 1, exp: 0, pending: 0 },
          s_slash: { lv: 1, exp: 0, pending: 0 },
          pa_grit: { lv: 1, exp: 0, pending: 0 },
        },
      },
    };
    const build = defaultBuild(g, ARTS);
    // 同じ技能内では learn.at 昇順（s_slash=4 < s_riposte=12）
    expect(build.slots.slice(0, 2)).toEqual(["s_slash", "s_riposte"]);
    expect(build.passives[0]).toBe("pa_grit");
    expect(build.weapons).toEqual(["sword", "fist"]);
  });
});

describe("習得（09 §7.1）", () => {
  it("技能値が learn.at に届く技を覚える", () => {
    let g = withSkill(mkState(), "swordplay", 4);
    let r = checkArtsLearn(g, ARTS);
    expect(r.learned).toEqual(["s_slash"]);
    g = withSkill(r.state, "swordplay", 12);
    // s_riposte は傾き条件つき —— 使い方の記録が無ければ覚えない
    r = checkArtsLearn(g, ARTS);
    expect(r.learned).toEqual([]);
  });

  it("傾き条件つきの技は使い方のシェアが閾値を越えてから覚える", () => {
    // after.guard のシェア 0.2：3回中1回では届かず、2回中1回（0.5）で届く
    let g = withSkill(mkState(), "swordplay", 12);
    g = {
      ...g,
      player: {
        ...g.player,
        skillTags: { swordplay: { "use.total": 3, "after.guard": 0 } },
      },
    };
    expect(checkArtsLearn(g, ARTS).learned).toEqual(["s_slash"]);
    g = {
      ...g,
      player: {
        ...g.player,
        skillTags: { swordplay: { "use.total": 2, "after.guard": 1 } },
      },
    };
    const r = checkArtsLearn(g, ARTS);
    expect(r.learned).toContain("s_riposte");
  });

  it("styleShare は use.total を母数にする", () => {
    const tags = { swordplay: { "use.total": 4, "after.guard": 1 } };
    expect(styleShare(tags, "swordplay", "after.guard")).toBeCloseTo(0.25);
    expect(styleShare(tags, "swordplay", "missing")).toBe(0);
    expect(styleShare({}, "swordplay", "after.guard")).toBe(0);
  });
});

describe("使用記録の集計（09 §7.1）", () => {
  it("技ごと・技能ごとにタグの回数だけを積む（生の履歴は残さない）", () => {
    const uses = [
      { id: "s_slash", skill: "swordplay", tags: ["foe.stronger", "aim.body"] },
      { skill: "swordplay", tags: ["foe.stronger", "basic.attack"] },
      { id: "s_slash", skill: "swordplay", tags: ["finisher"] },
    ];
    const r = recordArtUse({}, {}, uses);
    expect(r.artTags["s_slash"]!["use.total"]).toBe(2);
    expect(r.artTags["s_slash"]!["aim.body"]).toBe(1);
    expect(r.artTags["s_slash"]!["finisher"]).toBe(1);
    // 技能側は基本行動も含めた3回
    expect(r.skillTags["swordplay"]!["use.total"]).toBe(3);
    expect(r.skillTags["swordplay"]!["foe.stronger"]).toBe(2);
    // 累計は上書きでなく足し込まれる
    const r2 = recordArtUse(r.artTags, r.skillTags, uses.slice(0, 1));
    expect(r2.skillTags["swordplay"]!["use.total"]).toBe(4);
  });
});

describe("睡眠の定着（09 §1・§2）", () => {
  it("pending が exp に定着し、境目を越えた分だけ levelUps が出る", () => {
    let g = mkState();
    g = {
      ...g,
      player: {
        ...g.player,
        arts: {
          s_slash: { lv: 1, exp: 6, pending: 4 }, // 6+4=10 → Lv2（8超過）
          s_riposte: { lv: 1, exp: 0, pending: 1 }, // 1 → Lv1 のまま
        },
      },
    };
    const r = consolidateArts(g, ARTS);
    expect(r.levelUps).toEqual([{ id: "s_slash", from: 1, to: 2 }]);
    const a = r.state.player.arts["s_slash"]!;
    expect(a.lv).toBe(2);
    expect(a.exp).toBe(10);
    expect(a.pending).toBe(0);
    expect(r.state.player.arts["s_riposte"]!.lv).toBe(1);
  });
});
