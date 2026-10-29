import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { generateWorld, newGame, serialize, WORLD_RECIPE, type GameState } from "@trace/core";
import { dismissFx, gotoPlace, waitVeil } from "./helpers.js";

const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

/** 生成地方（worldgen.spec.ts と同じ組み立て。名所も畳む） */
function genWorldFor(seed: string) {
  const worldJson = jsonAt("world.json") as Parameters<typeof generateWorld>[1];
  const balanceJson = jsonAt("balance.json") as {
    world: Parameters<typeof generateWorld>[2];
    dungeons: Parameters<typeof generateWorld>[2]["dungeons"];
  };
  // hidden/landmarks.json は生成に畳まれる（worldgen.spec.ts と同じ組み立て）
  const worldFile = {
    ...worldJson,
    landmarks: (jsonAt("hidden/landmarks.json") as { landmarks: unknown[] }).landmarks,
  } as Parameters<typeof generateWorld>[1];
  const challenge = Object.fromEntries(
    (jsonAt("enemies.json") as { enemies: { id: string; challenge: number }[] }).enemies.map(
      (e) => [e.id, e.challenge],
    ),
  );
  return generateWorld(
    seed,
    worldFile,
    { ...balanceJson.world, dungeons: balanceJson.dungeons },
    challenge,
  );
}

/** 生成地方のセーブ（worldgen.spec.ts の genSave と同じ組み立て＋怪我・カウンタの上書き可） */
function genSave(
  seed: string,
  town: string,
  heard: string[],
  injuries: GameState["injuries"] = [],
  counters: Record<string, number> = {},
): string {
  const w = genWorldFor(seed);
  const g = newGame(seed, "旅人", {
    skillIds: (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id),
    initialPotential: 100,
    initialStatValue: 30,
    initialTown: w.startTown,
    world: { kind: "gen", recipe: WORLD_RECIPE },
  });
  return serialize({
    ...g,
    injuries,
    counters: { ...g.counters, ...counters },
    life: {
      ...g.life,
      town,
      map: {
        visited: [...g.life.map.visited, town],
        heard: [...g.life.map.heard, town, ...heard],
      },
    },
  });
}

/**
 * X-32：怪我（docs/03 §4「部位へのダメージは怪我として数日残る」）。
 * inj-3 の山（t1 の外）には熊が居る —— 攻撃連打の素人には大技《熊の撃墜》
 * の一撃が届き、部位の傷が数日残る。傷は行動ログと状態画面に出て、
 * 癒え日を越えれば朝に取れる
 */
test("重い一撃は怪我として残り、状態に出て、癒え日に取れる（X-32）", async ({ page }) => {
  // 戦闘＋癒え日までの眠りの反復で30秒を超えるため、遅い印を付ける（3倍枠）
  test.slow();
  const save = genSave("inj-3", "t1", ["mountain"]);
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), save);
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  // t1 の門 → 地図 → 山へ（聞き覚え済み）。行動1を消費して地域の場所へ
  await gotoPlace(page, "t1.gate");
  await page.getByTestId("place-map").click();
  await page.getByTestId("map-travel-mountain").click();
  await waitVeil(page);
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "mountain");

  // 山で熊と戦う（大技の一撃が届く相手。攻撃連打で挑む）
  await page.getByTestId("place-hunt").click();
  await page.getByTestId("enemy-bear").click();
  await waitVeil(page);
  for (let i = 0; i < 40; i++) {
    if (
      await page
        .getByTestId("combat-finish")
        .isVisible()
        .catch(() => false)
    )
      break;
    await page.getByTestId("combat-attack").click();
  }
  await page.getByTestId("combat-finish").click();
  // 勝利の1行のあと、傷の刻印が行動ログに残る（《部位》を痛めた）
  const log = page.getByTestId("log");
  await expect(log).toContainText("を痛めた");
  await dismissFx(page);
  await page.screenshot({ path: "e2e/artifacts/trace-injured.png", fullPage: true });

  // 地域から t1 の門へ戻り、自室の状態画面で怪我が出る（部位＋残り日数）
  await page.getByTestId("place-go-t1.gate").click();
  await waitVeil(page);
  await gotoPlace(page, "t1.home");
  await page.getByTestId("place-status").click();
  const inj = page.getByTestId("status-injuries");
  await expect(inj).toBeVisible();
  await expect(inj).toContainText("怪我：");
  await expect(inj).toContainText("残");
  await page.screenshot({ path: "e2e/artifacts/trace-status-injury.png", fullPage: true });
  await page.keyboard.press("Escape");

  // 傷が残るのは数日だけ —— 癒え日（balance.combat.injuries.days 後）を
  // 越えた行動で取れる。眠り続けると朝の報せに《部位》の怪我が癒えた と出る
  let healed = false;
  for (let i = 0; i < 7 && !healed; i++) {
    await gotoPlace(page, "t1.home");
    await page.getByTestId("place-rest").click();
    await expect(page.getByTestId("screen-wake")).toBeVisible();
    await waitVeil(page);
    healed =
      (await page.getByTestId("screen-wake").textContent())?.includes("の怪我が癒えた") === true;
    await page.keyboard.press("Enter");
  }
  expect(healed, "癒えの行が朝の報せに出ない").toBe(true);
  // 癒えたあとの状態画面には怪我の行が無い
  await gotoPlace(page, "t1.home");
  await page.getByTestId("place-status").click();
  await expect(page.getByTestId("status-injuries")).toHaveCount(0);
});

/**
 * X-35：怪我の語り（docs/03 §4 の続き —— 傷は癒えて消えるが、生涯で
 * 負った傷の記録は伝記が語る）。戦いで刻まれた injury.* カウンタは
 * 「これまでの記録」（伝記の途中経過）に傷の行として届く
 */
test("負った傷の通算は記録の伝記に語られる（X-35）", async ({ page }) => {
  // 戦いを重ねて腕に2度・脚に1度の傷を負った生（injury.* カウンタ）
  const save = genSave("inj-3", "t1", ["mountain"], [], {
    "injury.total": 3,
    "injury.arms": 2,
    "injury.legs": 1,
  });
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), save);
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  // 記録画面の伝記（これまでの記録）に傷の行が届く
  await gotoPlace(page, "t1.guild");
  await page.getByTestId("place-records").click();
  await expect(page.getByTestId("screen-records")).toBeVisible();
  const bio = page.getByTestId("records-bio");
  await expect(bio).toContainText("傷");
  await expect(bio).toContainText("腕");
  await page.screenshot({ path: "e2e/artifacts/trace-bio-injury.png", fullPage: true });

  // 傷を負っていない生には傷の行が出ない
  const clean = genSave("inj-3", "t1", ["mountain"]);
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), clean);
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);
  await gotoPlace(page, "t1.guild");
  await page.getByTestId("place-records").click();
  await expect(page.getByTestId("records-bio")).toContainText("これまでの記録");
  await expect(page.getByTestId("records-bio")).not.toContainText("傷");
});
