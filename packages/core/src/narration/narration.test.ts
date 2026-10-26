import { describe, expect, it } from "vitest";
import { createRng } from "../rng/index.js";
import { TemplateProvider, type NarrationProvider, type NarrationTemplates } from "./index.js";

const text: NarrationTemplates = {
  newspaper: {
    header: "── 街の新聞 ──",
    lines: {
      quiet: ["静かな一日だった。"],
      worked: ["工房の音が響いた。", "荷車が出ていった。"],
      hunted: ["狩人が獲物を担いで戻った。"],
      trained: ["稽古場の音が止まなかった。"],
      read: ["記録を繙く者がいた。"],
      title: ["《{name}》と呼ばれる者がいるらしい。"],
      offer: ["{name} への打診が貼られた。"],
      work: ["《{name}》（品質{quality}・ティア{tier}）が話題だ。"],
      death: ["{deaths}度目の死の噂がある。"],
      rumor: ["風の噂：実は王族だという。", "風の噂：空を飛ぶ者を見た。"],
    },
  },
  npcWord: {
    greet: ["「{name}、か」"],
    respect: ["「{deed}――悪くない働きだ」"],
    byStanding: {
      drifter: {
        greet: ["「流れ者か。用があるなら短く言え」"],
        respect: ["「{deed}、だと。流れ者にしちゃ筋は通っているな」"],
      },
      adventurer: {
        greet: ["「冒険者殿、ご苦労」"],
      },
    },
  },
  loreDigest: { header: "── 見聞録 ──", line: "{facts}件の事実、{connected}つの繋がり。" },
  biography: {
    header: "── 記録 ──",
    summary: ["{name} は {days}日生きた。{deeds}件の行動。"],
    origin: ["出自：{origin}。"],
    work: ["代表作《{name}》品質{quality}・ティア{tier}。"],
    titles: ["「{titles}」と呼ばれた。"],
    standing: ["立場{standing}。{profession}"],
    goal: ["目標「{goals}」を果たした。"],
    peak: ["頂きは{skill}の{value}。"],
    cause: {
      retire: ["引退によって記録は閉じた。"],
      death: ["死が記録を閉じた。"],
    },
    closing: ["この記録は年代記に残る。"],
  },
};

const provider: NarrationProvider = new TemplateProvider(text);
const rng = () => createRng("narration-test");
/** deeds 由来の日の見出しは「事実分類＋勘違い候補1件」のプールから出る */
const genericPool = (factual: string[]) => [...factual, ...text.newspaper.lines.rumor];

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
    expect(genericPool(["工房の音が響いた。", "荷車が出ていった。"])).toContain(worked[1]);
    const quiet = provider.narrate({ scene: "newspaper", deeds: [] }, rng());
    expect(genericPool(["静かな一日だった。"])).toContain(quiet[1]);
  });

  it("新聞：台帳の作品があれば記事に言及する（事実分類なので確実に出る）", () => {
    const lines = provider.narrate(
      {
        scene: "newspaper",
        deeds: ["work"],
        works: [{ name: "短剣の注文", quality: 42.5, tier: 2 }],
      },
      rng(),
    );
    expect(lines[1]).toBe("《短剣の注文》（品質42.5・ティア2）が話題だ。");
    // 作品は行動・静かな日の分類より優先される
    const quietDay = provider.narrate(
      { scene: "newspaper", deeds: [], works: [{ name: "釘の束", quality: 10, tier: 1 }] },
      rng(),
    );
    expect(quietDay[1]).toContain("釘の束");
  });

  it("新聞：死亡歴がある日は物騒な見出しが候補に混ざる（シードで固定）", () => {
    const req = { scene: "newspaper", deeds: ["combat"], deaths: 3 } as const;
    // 出る可能性のある行：事実分類＋勘違い候補＋{deaths}展開済みの物騒な見出し
    const all = [
      ...text.newspaper.lines.hunted,
      ...text.newspaper.lines.rumor,
      "3度目の死の噂がある。",
    ];
    let sawDeath = false;
    for (let i = 0; i < 40 && !sawDeath; i++) {
      const line = provider.narrate(req, createRng(`news:${i}`))[1]!;
      expect(all).toContain(line);
      if (line === "3度目の死の噂がある。") sawDeath = true;
    }
    expect(sawDeath).toBe(true);
    // 死亡歴が無ければ物騒な見出しは出ない
    for (let i = 0; i < 10; i++) {
      const line = provider.narrate({ scene: "newspaper", deeds: ["combat"] }, createRng(`n:${i}`));
      expect(line[1]).not.toBe("3度目の死の噂がある。");
    }
  });

  it("新聞：勘違い系の見出しが一定確率で混ざる", () => {
    let sawRumor = false;
    let sawFactual = false;
    for (let i = 0; i < 40; i++) {
      const line = provider.narrate({ scene: "newspaper", deeds: [] }, createRng(`r:${i}`))[1]!;
      if (text.newspaper.lines.rumor.includes(line)) sawRumor = true;
      if (text.newspaper.lines.quiet.includes(line)) sawFactual = true;
    }
    expect(sawRumor).toBe(true);
    expect(sawFactual).toBe(true);
  });

  it("同じ入力＋同じシードで同じ出力（決定論）", () => {
    const req = {
      scene: "newspaper",
      deeds: ["work"],
      works: [
        { name: "甲", quality: 1, tier: 1 },
        { name: "乙", quality: 2, tier: 2 },
      ],
      deaths: 1,
    } as const;
    const a = provider.narrate(req, createRng("s1"));
    const b = provider.narrate(req, createRng("s1"));
    expect(a).toEqual(b);
    const c = provider.narrate({ scene: "newspaper", deeds: ["combat"] }, createRng("s1"));
    expect(c).toEqual(provider.narrate({ scene: "newspaper", deeds: ["combat"] }, createRng("s1")));
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
    expect(bio.join("\n")).toContain("《狩人》");
  });

  it("伝記：素材がある行だけが出る（T-37）", () => {
    const full = provider.narrate(
      {
        scene: "biography",
        name: "名工",
        days: 200,
        deeds: 500,
        origin: "職人の子",
        work: { name: "名刀・朧", quality: 88, tier: 3 },
        titles: "《名工》、《続ける者》",
        standing: "市民",
        profession: "鍛冶師",
        goals: "最初の作品を作る",
        peakSkill: { name: "鍛冶", value: 92.3 },
        cause: "retire",
      },
      rng(),
    );
    const text = full.join("\n");
    expect(full[0]).toBe("── 記録 ──");
    expect(text).toContain("職人の子");
    expect(text).toContain("名刀・朧");
    expect(text).toContain("品質88");
    expect(text).toContain("《名工》");
    expect(text).toContain("市民");
    expect(text).toContain("鍛冶師");
    expect(text).toContain("最初の作品を作る");
    expect(text).toContain("鍛冶");
    expect(text).toContain("92.3");
    expect(text).toContain("引退");
    expect(text).toContain("年代記");

    // 素材なし：summary＋closing だけの短い記録（死因も立場も出ない）
    const bare = provider.narrate({ scene: "biography", name: "名無し", days: 3, deeds: 4 }, rng());
    expect(bare).toHaveLength(3);
    expect(bare[1]).toContain("名無し");
    expect(bare[2]).toBe("この記録は年代記に残る。");

    // 決定論：同じ素材＋同じシードで同じ伝記
    const req = {
      scene: "biography",
      name: "x",
      days: 9,
      deeds: 9,
      cause: "death",
    } as const;
    expect(provider.narrate(req, createRng("b"))).toEqual(provider.narrate(req, createRng("b")));
  });

  it("NPCの一言：立場で口調が変わる", () => {
    const drifter = provider.narrate(
      { scene: "npcWord", name: "サド", standing: "drifter" },
      createRng("v"),
    )[0];
    const adventurer = provider.narrate(
      { scene: "npcWord", name: "サド", standing: "adventurer" },
      createRng("v"),
    )[0];
    expect(drifter).toBe("「流れ者か。用があるなら短く言え」");
    expect(adventurer).toBe("「冒険者殿、ご苦労」");
    // 立場つきでも deed があれば respect 系。未定義の立場は汎用に戻る
    expect(
      provider.narrate(
        { scene: "npcWord", name: "サド", deed: "狼退治", standing: "drifter" },
        createRng("v"),
      )[0],
    ).toContain("狼退治");
    expect(
      provider.narrate({ scene: "npcWord", name: "サド", standing: "citizen" }, createRng("v"))[0],
    ).toBe("「サド、か」");
  });

  it("プロバイダーは差し替えられる（DI口）", () => {
    const stub: NarrationProvider = { narrate: () => ["差し替えた"] };
    expect(stub.narrate({ scene: "npcWord", name: "x" }, rng())).toEqual(["差し替えた"]);
  });
});
