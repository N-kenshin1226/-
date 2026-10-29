import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  generateWorld,
  isBossRoom,
  newGame,
  roomAt,
  serialize,
  WORLD_RECIPE,
  type GameState,
} from "@trace/core";
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

/**
 * 潜りの情景は部屋ごとに変わる（X-24）：抜いた部屋の通し番号で構図を変え、
 * 灯りの減りで霞を深くする。罠か宝の部屋（=1手で抜ける）が先頭のシードを
 * 探して、1部屋抜く前後で背景の svg が変わることを確かめる
 */
test("潜りの情景は部屋ごとに変わる", async ({ page }) => {
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
  let seed = "";
  for (let i = 0; i < 40 && seed === ""; i++) {
    const s = i === 0 ? "e2e-dgn" : `dg-seed-${i}`;
    const w = generateWorld(
      s,
      worldJson,
      { ...balanceJson.world, dungeons: balanceJson.dungeons },
      challenge,
    );
    const d0 = w.dungeons.find((d) => d.id === "dg0");
    const r = d0 !== undefined ? roomAt(d0, 0) : null;
    if (
      d0 !== undefined &&
      r !== null &&
      !isBossRoom(d0, 0) &&
      (r.room.kind === "trap" || r.room.kind === "treasure")
    )
      seed = s;
  }
  expect(seed).not.toBe("");

  await toDungeonPlace(page, seed);
  await page.getByTestId("place-dungeon").click();
  await expect(page.getByTestId("screen-dungeon")).toBeVisible();

  const sceneHtml = () => scene(page).evaluate((el) => el.innerHTML);
  const before = await sceneHtml();
  // 1部屋抜く（罠・宝は即座に解決する）—— 情景は次の部屋の構図へ変わる
  await page.getByTestId("dungeon-advance").click();
  await expect(page.getByTestId("screen-dungeon")).toBeVisible();
  const after = await sceneHtml();
  expect(after).not.toBe(before);
  await page.screenshot({ path: "e2e/artifacts/dungeon-room-scene.png", fullPage: true });
});

test("出来事の部屋：抜くと型の表の結末が届き、畳むと世界に刻まれる（X-30）", async ({ page }) => {
  // 出来事の部屋（event）を持つ dg0 のシードを決定的に探し、その部屋の
  // 直前まで進めたセーブを注入する —— 最初の「先へ進む」が出来事の部屋になる
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
  let seed = "";
  let evIndex = -1;
  let evText = "";
  for (let i = 0; i < 60 && seed === ""; i++) {
    const s = `dg-ev-${i}`;
    const w = generateWorld(s, worldJson, genCfg, challenge);
    const d0 = w.dungeons.find((d) => d.id === "dg0");
    if (d0 === undefined) continue;
    for (let k = 0; k < 8; k++) {
      const r = roomAt(d0, k);
      if (r === null || r.room.kind !== "event" || r.room.eventIdx === undefined) continue;
      const o = worldJson.dungeonTypes?.find((t) => t.id === d0.type)?.events?.[r.room.eventIdx];
      if (o === undefined) continue;
      seed = s;
      evIndex = k;
      evText = o.text;
      break;
    }
  }
  expect(seed).not.toBe("");

  const w = generateWorld(seed, worldJson, genCfg, challenge);
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
  const patched: GameState = {
    ...g,
    counters: { ...g.counters, "dg.rooms.dg0": evIndex },
  };
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), serialize(patched));
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  await gotoPlace(page, "t0.gate");
  await page.getByTestId("place-go-dg0").click();
  await waitVeil(page);
  await page.getByTestId("place-dungeon").click();
  await expect(page.getByTestId("screen-dungeon")).toBeVisible();

  // 最初の部屋は出来事の部屋 —— 見出しと結末の一文が潜りの記録（log）に出る
  await page.getByTestId("dungeon-advance").click();
  await expect(page.getByTestId("log")).toContainText("何かがここに遺されている");
  await expect(page.getByTestId("log")).toContainText(evText);
  await page.screenshot({ path: "e2e/artifacts/dungeon-event-room.png", fullPage: true });

  // 引き上げて畳む：結末の一文が世界側の記録にも届く（strollOutcome の行）
  await page.getByTestId("dungeon-retreat").click();
  await page.getByTestId("dungeon-commit").click();
  await waitVeil(page);
  await expect(page.getByTestId("log")).toContainText(evText);
});

test("連続した出来事：先の部屋の出来事が、後の部屋の結末を続きに変える（X-34）", async ({
  page,
}) => {
  // dg0 洞窟で 絵の部屋 → 戦闘 → 清水の部屋 が並ぶシード（生成は決定的。
  // 並びが変わったら下の断言が先に落ちる —— 種の変更で静かに壊れない）
  const seed = "x34c-29";
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
  const w = generateWorld(
    seed,
    worldJson,
    { ...balanceJson.world, dungeons: balanceJson.dungeons },
    challenge,
  );
  const d0 = w.dungeons.find((d) => d.id === "dg0");
  expect(d0?.type).toBe("cave");
  const r1 = roomAt(d0!, 1);
  const r3 = roomAt(d0!, 3);
  expect(r1?.room.kind).toBe("event");
  expect(r1?.room.eventIdx).toBe(2); // 煤の絵（旗を立てる項）
  expect(r3?.room.kind).toBe("event");
  expect(r3?.room.eventIdx).toBe(0); // 清水（旗が立てば続きになる項）

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
  const patched: GameState = {
    ...g,
    counters: { ...g.counters, "dg.rooms.dg0": 1 },
  };
  await page.addInitScript((s) => localStorage.setItem("trace.save.v1", s), serialize(patched));
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await dismissFx(page);

  await gotoPlace(page, "t0.gate");
  await page.getByTestId("place-go-dg0").click();
  await waitVeil(page);
  await page.getByTestId("place-dungeon").click();
  await expect(page.getByTestId("screen-dungeon")).toBeVisible();

  // 1部屋目：煤の絵 —— 旗が立つ（基の結末が届く）
  await page.getByTestId("dungeon-advance").click();
  await expect(page.getByTestId("log")).toContainText("煤で描かれた古い絵");

  // 2部屋目は戦闘 —— 勝って抜く
  await page.getByTestId("dungeon-advance").click();
  for (let i = 0; i < 40; i++) {
    if (
      await page
        .getByTestId("dungeon-advance")
        .isVisible()
        .catch(() => false)
    )
      break;
    if (
      await page
        .getByTestId("combat-attack")
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByTestId("combat-attack").click();
      continue;
    }
    await page.waitForTimeout(200);
  }
  await expect(page.getByTestId("dungeon-advance")).toBeVisible();

  // 3部屋目：清水 —— 先の部屋で立った旗が畳み込み待ちでも読まれ、続きが届く
  await page.getByTestId("dungeon-advance").click();
  await expect(page.getByTestId("log")).toContainText("煤の絵に描かれていた通りに進むと");

  // 畳むと続きの一文も世界側の記録に届く
  await page.getByTestId("dungeon-retreat").click();
  await page.getByTestId("dungeon-commit").click();
  await waitVeil(page);
  await expect(page.getByTestId("log")).toContainText("煤の絵に描かれていた通りに進むと");
  await page.screenshot({ path: "e2e/artifacts/dungeon-event-chain.png", fullPage: true });
});
