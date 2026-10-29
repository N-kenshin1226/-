import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { generateWorld, newGame, serialize, WORLD_RECIPE, type GameState } from "@trace/core";
import { dismissFx, gotoPlace, placeAct, skipIntro, waitVeil, wakeUp } from "./helpers.js";

const jsonAt = (rel: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/content/${rel}`, import.meta.url), "utf8"));

/**
 * 有限迷宮（G-03、docs/10_world_generation.md §6）の e2e。
 * - 始まりの町の門から迷宮の場所へ出られる（dg0 は必ず始まりの町に置く）
 * - 迷宮の場所はダンジョンの情景（dungeon.<型>）で描かれる
 * - 「迷宮に潜る」で探索画面へ：部屋を抜き・引き上げて結果を畳む
 * - 野営で迷宮の中で眠り、翌日の潜りは行動を要さない
 */

const scene = (page: Page) => page.locator("svg.scene").first();

/** 生成地方で始めて、始まりの町の迷宮（dg0）の場所へ出る */
async function toDungeonPlace(page: Page, seed = "e2e-dgn") {
  await page.goto(`/?seed=${seed}`);
  await page.getByTestId("origin-wanderer").click();
  await skipIntro(page);
  await dismissFx(page);
  await gotoPlace(page, "t0.gate");
  const to = page.getByTestId("place-go-dg0");
  await expect(to).toBeVisible();
  await to.click();
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "dg0");
  await waitVeil(page);
}

test("門から迷宮へ出て、潜って引き上げられる", async ({ page }) => {
  await toDungeonPlace(page);
  // 迷宮の場所はダンジョンの情景（dungeon.<型>。型はシードで決まる）
  await expect(scene(page)).toHaveAttribute("data-scenery", /^dungeon\./);
  await expect(page.getByTestId("place-dungeon")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/dungeon-place.png", fullPage: true });

  // 潜る：探索画面が開き、灯りと進行が見える
  await page.getByTestId("place-dungeon").click();
  await expect(page.getByTestId("screen-dungeon")).toBeVisible();
  await expect(page.getByTestId("dungeon-advance")).toBeVisible();
  await expect(page.getByTestId("dungeon-camp")).toBeVisible();
  await expect(page.getByTestId("dungeon-retreat")).toBeVisible();

  // 1部屋抜く：戦闘なら逃げるか戦って畳み、罠・宝は即座に解決する。
  // 終端（dungeon-commit）が出るまで進行か離脱を続ける
  for (let i = 0; i < 30; i++) {
    if (
      await page
        .getByTestId("dungeon-commit")
        .isVisible()
        .catch(() => false)
    )
      break;
    if (
      await page
        .getByTestId("combat-flee")
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByTestId("combat-flee").click();
      continue;
    }
    if (
      await page
        .getByTestId("dungeon-advance")
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByTestId("dungeon-advance").click();
      continue;
    }
    await page.waitForTimeout(200);
  }
  await expect(page.getByTestId("dungeon-commit")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/dungeon-dive.png", fullPage: true });
  await page.getByTestId("dungeon-commit").click();
  await waitVeil(page);
  // 場所の画面へ戻る（進行があれば「迷宮に潜る」に金の帯が残る）
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "dg0");
  await expect(page.getByTestId("place-dungeon")).toBeVisible();

  // 街の記録の迷宮の欄：訪れた迷宮は名と進行が載る（まだ知れていない迷宮の名は出ない）
  await placeAct(page, "t0.guild", "records");
  const dgRec = page.getByTestId("records-dungeons");
  await expect(dgRec).toContainText("迷宮");
  await expect(dgRec).toContainText("室");
});

test("迷宮を制覇すると締めは「制覇した」になる（X-11：敗北文は出さない）", async ({ page }) => {
  // 制覇の締め行だけを見る —— 主の間までの長い潜りは sim:growth/dungeon が見る。
  // 強化した旅人＋dg0 を残り1室（主の間直前）まで進めたセーブを注入する
  const seed = "e2e-dgn-clear";
  const worldJson = jsonAt("world.json") as Parameters<typeof generateWorld>[1];
  const balanceJson = jsonAt("balance.json") as {
    world: Parameters<typeof generateWorld>[2];
    dungeons: Parameters<typeof generateWorld>[2]["dungeons"];
  };
  const challenge = Object.fromEntries(
    (jsonAt("enemies.json") as { enemies: { id: string; challenge: number }[] }).enemies.map(
      (e) => [e.id, e.challenge],
    ),
  );
  const genCfg = { ...balanceJson.world, dungeons: balanceJson.dungeons };
  const w = generateWorld(seed, worldJson, genCfg, challenge);
  const dg0 = w.dungeons.find((d) => d.id === "dg0")!;
  const total = dg0.floors.reduce((s, f) => s + f.rooms.length, 0);

  const g = newGame(seed, "旅人", {
    skillIds: (jsonAt("skills.json") as { skills: { id: string }[] }).skills.map((s) => s.id),
    initialPotential: 100,
    initialStatValue: 30,
    initialMoney: 200,
    initialWeapons: ["fist", "war_axe"],
    initialWeapon: "war_axe",
    initialTown: w.startTown,
    world: { kind: "gen", recipe: WORLD_RECIPE },
  });
  const skills = Object.fromEntries(
    Object.keys(g.player.skills).map((id) => [
      id,
      { ...g.player.skills[id]!, value: 60, peak: 60 },
    ]),
  );
  const patched: GameState = {
    ...g,
    player: { ...g.player, skills },
    counters: { ...g.counters, [`dg.rooms.dg0`]: total - 1 },
  };
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), serialize(patched));
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  await gotoPlace(page, "t0.gate");
  await page.getByTestId("place-go-dg0").click();
  await waitVeil(page);
  await page.waitForTimeout(500);
  // 強化セーブでは技能由来のA通知（称号・技開放）が何件も連なって届く ——
  // 通知カードを直接押して全部飛ばす（Enter が窓に届かないことがある）
  const dropNotices = async () => {
    // 連なる通知を「しばらく出ない」まで押し続ける（連鎖する技能開放で
    // 閉じても次がすぐ出る。クリックで確実に done を踏む）
    let quiet = 0;
    for (let k = 0; k < 60 && quiet < 3; k++) {
      let hit = false;
      for (const id of ["notice-a", "notice-s"]) {
        const el = page.getByTestId(id);
        if (await el.isVisible().catch(() => false)) {
          await el.click().catch(() => undefined);
          hit = true;
          await page.waitForTimeout(200);
        }
      }
      quiet = hit ? 0 : quiet + 1;
      if (!hit) await page.waitForTimeout(200);
    }
  };
  await dropNotices();
  await page.getByTestId("place-dungeon").click();
  await expect(page.getByTestId("screen-dungeon")).toBeVisible();

  // 主の間の戦い：決着まで攻め続け、結果ボタンが出るのを待つ
  for (let i = 0; i < 80; i++) {
    if (
      await page
        .getByTestId("dungeon-commit")
        .isVisible()
        .catch(() => false)
    )
      break;
    await dropNotices();
    if (
      await page
        .getByTestId("combat-attack")
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByTestId("combat-attack").click();
      continue;
    }
    if (
      await page
        .getByTestId("dungeon-advance")
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByTestId("dungeon-advance").click();
      continue;
    }
    await page.waitForTimeout(200);
  }
  await expect(page.getByTestId("dungeon-commit")).toBeVisible();
  const dive = page.getByTestId("screen-dungeon");
  await expect(dive).toContainText("制覇した");
  await expect(dive).not.toContainText("力尽きた");
  await page.screenshot({ path: "e2e/artifacts/dungeon-cleared.png", fullPage: true });
});

test("迷宮で野営すると迷宮の中で眠り、翌日の潜りは行動を要さない", async ({ page }) => {
  await toDungeonPlace(page, "e2e-dgn-camp");
  await page.getByTestId("place-dungeon").click();
  await expect(page.getByTestId("screen-dungeon")).toBeVisible();

  // 野営：この潜りを閉じて迷宮の中で眠る
  await page.getByTestId("dungeon-camp").click();
  await page.getByTestId("dungeon-commit").click();
  // 起床の窓 → 起きると見取り図（野営の潜りは畳み済み）
  await wakeUp(page);
  await dismissFx(page);
  await expect(page.getByTestId("menu")).toBeVisible();

  // もう一度迷宮の場所へ（野営明けの潜りは行動を要さない —— その断りで出る）
  await gotoPlace(page, "t0.gate");
  await page.getByTestId("place-go-dg0").click();
  await expect(page.getByTestId("place")).toHaveAttribute("data-place", "dg0");
  await waitVeil(page);
  const dive = page.getByTestId("place-dungeon");
  await expect(dive).toBeVisible();
  await expect(dive).toContainText("野営明け");
  await dive.click();
  await expect(page.getByTestId("screen-dungeon")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/dungeon-camp.png", fullPage: true });
});
