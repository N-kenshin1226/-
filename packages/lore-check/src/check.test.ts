import { describe, expect, it } from "vitest";
import { atomSchema, canon, type Atom } from "@trace/content";
import { checkLore, checkLoreReachability, similarity } from "./index.js";

const atom = (over: Partial<Atom>): Atom =>
  atomSchema.parse({
    id: "item.test",
    kind: "item",
    title: "試しの物",
    text: "古い箱の底に、布に包まれた針が入っていた。",
    refs: ["npc.berna"],
    reveals: ["fact.hammer_made_by_berna"],
    reliability: "fact",
    unlock: null,
    ...over,
  });

const files = (a: Atom) => [{ file: "test.json", atom: a }];

describe("lore:check（docs/07 §5 検証パイプライン）", () => {
  it("正常なアトムは通る", () => {
    expect(checkLore({ canon, atoms: files(atom({})) })).toHaveLength(0);
  });

  it("参照切れの refs は error", () => {
    const issues = checkLore({ canon, atoms: files(atom({ refs: ["npc.ghost"] })) });
    expect(issues.some((i) => i.level === "error" && i.message.includes("npc.ghost"))).toBe(true);
  });

  it("reveals が正史に無い事実を指すと error", () => {
    const issues = checkLore({ canon, atoms: files(atom({ reveals: ["fact.made_up"] })) });
    expect(issues.some((i) => i.level === "error" && i.message.includes("fact.made_up"))).toBe(
      true,
    );
  });

  it("reliability=fact なのに推量表現があると error", () => {
    const issues = checkLore({
      canon,
      atoms: files(atom({ text: "ベルナは火を逃れたらしい。村はずれに住んでいるそうだ。" })),
    });
    expect(issues.some((i) => i.level === "error" && i.message.includes("fact違反"))).toBe(true);
  });

  it("rumor なら推量表現は許される", () => {
    const issues = checkLore({
      canon,
      atoms: files(
        atom({
          reliability: "rumor",
          reveals: [],
          text: "ベルナは火を逃れたらしい。村はずれに住んでいるそうだ。",
        }),
      ),
    });
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
  });

  it("禁止語と長さ違反は error", () => {
    const issues = checkLore({
      canon,
      atoms: files(atom({ text: "これはクエスト用のアイテム。" })),
    });
    expect(issues.filter((i) => i.level === "error").length).toBeGreaterThanOrEqual(2);
  });

  it("似た文は重複として検出する", () => {
    const a = atom({});
    const b = atom({ id: "item.test2", text: "古い箱の底に、布に包まれた針が入っていた。" });
    const issues = checkLore({
      canon,
      atoms: [
        { file: "a.json", atom: a },
        { file: "b.json", atom: b },
      ],
    });
    expect(issues.some((i) => i.message.includes("似文"))).toBe(true);
  });

  it("ID重複は error", () => {
    const a = atom({});
    const issues = checkLore({
      canon,
      atoms: [
        { file: "a.json", atom: a },
        { file: "b.json", atom: a },
      ],
    });
    expect(issues.some((i) => i.message.includes("id重複"))).toBe(true);
  });
});

describe("similarity", () => {
  it("同文は1、無関係な文は低い", () => {
    expect(similarity("柄に刻まれている", "柄に刻まれている")).toBe(1);
    expect(similarity("柄に刻まれている", "星が瞬く夜に橋を渡る")).toBeLessThan(0.3);
  });
});

describe("つながりの到達性（X-40。報酬に要る事実はアトムが明かすこと）", () => {
  it("どのアトムも明かさない事実を報酬に使うと error", () => {
    const issues = checkLoreReachability({ canon, atoms: files(atom({})) });
    // 槌の事実だけを明かすアトム —— 大火・熱・旗・獣の真相は届かない
    expect(issues.some((i) => i.level === "error" && i.message.includes("届かない事実"))).toBe(
      true,
    );
    expect(issues.some((i) => i.message.includes("fact.fire_started_old_forge"))).toBe(true);
  });

  it("報酬に要る事実にすべて源があれば通る", () => {
    const sources = atom({
      reveals: [
        "fact.berna_survived_fire",
        "fact.fire_started_old_forge",
        "fact.horde_repelled_by_levee",
        "fact.horde_banner_burned",
        "fact.fever_well_sealed",
        "fact.fever_stopped_at_bergen",
        "fact.beast_driven_not_slain",
        "fact.beast_claw_marks_differ",
      ],
    });
    expect(checkLoreReachability({ canon, atoms: files(sources) })).toHaveLength(0);
  });
});
