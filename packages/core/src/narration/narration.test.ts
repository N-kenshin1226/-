import { describe, expect, it } from "vitest";
import { createRng } from "../rng/index.js";
import { TemplateProvider, type NarrationProvider, type NarrationTemplates } from "./index.js";

const text: NarrationTemplates = {
  newspaper: {
    header: "── 街の新聞 ──",
    lines: {
      quiet: ["静かな一日だった。"],
      worked: ["工房の音が響いた。"],
      hunted: ["狩人が獲物を担いで戻った。"],
      trained: ["稽古場の音が止まなかった。"],
      read: ["記録を繙く者がいた。"],
      title: ["《{name}》と呼ばれる者がいるらしい。"],
      offer: ["{name} への打診が貼られた。"],
    },
  },
  npcWord: {
    greet: ["「{name}、か」"],
    respect: ["「{deed}――悪くない働きだ」"],
  },
  loreDigest: { header: "── 見聞録 ──", line: "{facts}件の事実、{connected}つの繋がり。" },
  biography: {
    header: "── 記録 ──",
    line: "{name} は {days}日生きた。{deeds}件の行動。{titles}",
  },
};

const provider: NarrationProvider = new TemplateProvider(text);
const rng = () => createRng("narration-test");

describe("TemplateProvider（07 §6）", () => {
  it("新聞：新しい称号があればそれを語る", () => {
    const lines = provider.narrate(
      { scene: "newspaper", deeds: ["work"], newTitle: "駆け出しの狩人" },
      rng(),
    );
    expect(lines[0]).toBe("── 街の新聞 ──");
    expect(lines[1]).toContain("駆け出しの狩人");
  });

  it("新聞：行動から記事を選ぶ（仕事 > 静かな日）", () => {
    const worked = provider.narrate({ scene: "newspaper", deeds: ["work"] }, rng());
    expect(worked[1]).toBe("工房の音が響いた。");
    const quiet = provider.narrate({ scene: "newspaper", deeds: [] }, rng());
    expect(quiet[1]).toBe("静かな一日だった。");
  });

  it("同じ入力＋同じシードで同じ出力（決定論）", () => {
    const req = { scene: "newspaper", deeds: ["combat"] } as const;
    const a = provider.narrate(req, createRng("s1"));
    const b = provider.narrate(req, createRng("s1"));
    expect(a).toEqual(b);
  });

  it("NPCの一言・見聞録まとめ・伝記が出る", () => {
    expect(provider.narrate({ scene: "npcWord", name: "マルタ" }, rng())[0]).toContain("マルタ");
    expect(
      provider.narrate({ scene: "npcWord", name: "ガロ", deed: "狼退治" }, rng())[0],
    ).toContain("狼退治");
    expect(provider.narrate({ scene: "loreDigest", facts: 3, connected: 1 }, rng())[1]).toContain(
      "3件",
    );
    const bio = provider.narrate(
      { scene: "biography", name: "旅人", days: 40, deeds: 120, titles: "《狩人》" },
      rng(),
    );
    expect(bio[1]).toContain("旅人");
    expect(bio[1]).toContain("40日");
  });

  it("プロバイダーは差し替えられる（DI口）", () => {
    const stub: NarrationProvider = { narrate: () => ["差し替えた"] };
    expect(stub.narrate({ scene: "npcWord", name: "x" }, rng())).toEqual(["差し替えた"]);
  });
});
