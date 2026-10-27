/**
 * pnpm check:content — packages/content 配下のJSONを zod スキーマで検証する。
 * 新しいコンテンツJSONを追加したら、ここに検証対象を登録する。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { balanceSchema } from "./balance.schema.js";
import { skillsFileSchema } from "./skills.schema.js";
import { tailwindsFileSchema } from "./tailwinds.schema.js";
import { titlesFileSchema } from "./titles.schema.js";
import { cliTextSchema } from "./cli-text.schema.js";
import { ordersFileSchema } from "./orders.schema.js";
import { enemiesFileSchema } from "./enemies.schema.js";
import { societyFileSchema } from "./society.schema.js";
import { narrationSchema } from "./narration.schema.js";
import { voicesFileSchema } from "./voices.schema.js";
import { originsFileSchema } from "./origins.schema.js";
import { booksFileSchema } from "./books.schema.js";
import { mentorsFileSchema } from "./mentors.schema.js";
import { pinnaclesFileSchema } from "./pinnacles.schema.js";
import { vowsFileSchema } from "./vows.schema.js";
import { rivalsFileSchema } from "./rivals.schema.js";
import { occasionsFileSchema } from "./occasions.schema.js";
import { discoveriesFileSchema } from "./discoveries.schema.js";
import { npcLifecycleFileSchema } from "./npc_lifecycle.schema.js";
import { incidentsFileSchema } from "./incidents.schema.js";
import { weatherFileSchema } from "./weather.schema.js";
import { placesFileSchema } from "./places.schema.js";
import { crisesFileSchema } from "../crises/schema.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let failed = false;

function check(
  name: string,
  schema: { safeParse: (v: unknown) => { success: boolean; error?: { message: string } } },
) {
  const path = join(root, name);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`✗ ${name}: JSONのパースに失敗 (${String(e)})`);
    failed = true;
    return;
  }
  const result = schema.safeParse(json);
  if (result.success) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`✗ ${name}: ${result.error?.message}`);
    failed = true;
  }
}

check("balance.json", balanceSchema);
check("skills.json", skillsFileSchema);
check("tailwinds.json", tailwindsFileSchema);
check("titles.json", titlesFileSchema);
check("orders.json", ordersFileSchema);
check("enemies.json", enemiesFileSchema);
check("society.json", societyFileSchema);
check("text/cli.json", cliTextSchema);
check("text/narration.json", narrationSchema);
check("voices.json", voicesFileSchema);
check("origins.json", originsFileSchema);
check("books.json", booksFileSchema);
check("mentors.json", mentorsFileSchema);
check("pinnacles.json", pinnaclesFileSchema);
check("vows.json", vowsFileSchema);
check("rivals.json", rivalsFileSchema);
check("occasions.json", occasionsFileSchema);
check("discoveries.json", discoveriesFileSchema);
check("npc_lifecycle.json", npcLifecycleFileSchema);
check("incidents.json", incidentsFileSchema);
check("weather.json", weatherFileSchema);
check("places.json", placesFileSchema);
check("crises/sample.json", crisesFileSchema);

// 立場キーの突き合わせ：voices.json / narration.json の byStanding は
// society.json の standings id に存在するものだけ
try {
  const societyRaw = JSON.parse(readFileSync(join(root, "society.json"), "utf8")) as {
    standings?: { id?: string }[];
  };
  const standingIds = new Set((societyRaw.standings ?? []).map((s) => s.id));
  const voicesRaw = JSON.parse(readFileSync(join(root, "voices.json"), "utf8")) as {
    npcs?: { id?: string; lines?: { byStanding?: Record<string, unknown> } }[];
  };
  const narrationRaw = JSON.parse(readFileSync(join(root, "text/narration.json"), "utf8")) as {
    npcWord?: { byStanding?: Record<string, unknown> };
  };
  const bad: string[] = [];
  for (const npc of voicesRaw.npcs ?? []) {
    for (const key of Object.keys(npc.lines?.byStanding ?? {})) {
      if (!standingIds.has(key)) bad.push(`voices.json ${npc.id ?? "?"}: 立場 ${key}`);
    }
  }
  for (const key of Object.keys(narrationRaw.npcWord?.byStanding ?? {})) {
    if (!standingIds.has(key)) bad.push(`narration.json npcWord: 立場 ${key}`);
  }
  if (bad.length > 0) {
    console.error(`✗ 立場キーが society.json に無い: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 立場キー（voices/narration ↔ society）");
  }
} catch (e) {
  console.error(`✗ 立場キーの突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// スキルキーの突き合わせ：origins.json の affinity / initialSkills（F-01）は
// skills.json の id に存在するものだけ
try {
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const originsRaw = JSON.parse(readFileSync(join(root, "origins.json"), "utf8")) as {
    origins?: {
      id?: string;
      affinity?: Record<string, unknown>;
      initialSkills?: Record<string, unknown>;
    }[];
  };
  const bad: string[] = [];
  for (const o of originsRaw.origins ?? []) {
    for (const key of Object.keys(o.affinity ?? {})) {
      if (!skillIds.has(key)) bad.push(`origins.json ${o.id ?? "?"}: スキル ${key}`);
    }
    for (const key of Object.keys(o.initialSkills ?? {})) {
      if (!skillIds.has(key)) bad.push(`origins.json ${o.id ?? "?"}: initialSkills ${key}`);
    }
  }
  if (bad.length > 0) {
    console.error(`✗ affinity/initialSkills キーが skills.json に無い: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ affinity/initialSkills キー（origins ↔ skills）");
  }
} catch (e) {
  console.error(`✗ affinity キーの突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 書物のキー突き合わせ：potentialRecover/priceVs はスキルID、damageVs は敵ID、
// gainVs はスキルID・敵ID・行動 kind（train/work/combat）のどれかに限る
try {
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const enemiesRaw = JSON.parse(readFileSync(join(root, "enemies.json"), "utf8")) as {
    enemies?: { id?: string }[];
  };
  const booksRaw = JSON.parse(readFileSync(join(root, "books.json"), "utf8")) as {
    books?: {
      id?: string;
      potentialRecover?: Record<string, unknown>;
      condition?: { flag?: string };
      effect?: {
        gainVs?: Record<string, unknown>;
        damageVs?: Record<string, unknown>;
        priceVs?: Record<string, unknown>;
      };
    }[];
  };
  const lostBooksCfg = (
    JSON.parse(readFileSync(join(root, "balance.json"), "utf8")) as {
      lostBooks?: { flagPrefix?: string };
    }
  ).lostBooks;
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const enemyIds = new Set((enemiesRaw.enemies ?? []).map((e) => e.id));
  const kindIds = new Set(["train", "work", "combat"]);
  const bad: string[] = [];
  for (const b of booksRaw.books ?? []) {
    const label = `books.json ${b.id ?? "?"}`;
    for (const key of Object.keys(b.potentialRecover ?? {})) {
      if (!skillIds.has(key)) bad.push(`${label}: 素質回復のスキル ${key}`);
    }
    for (const key of Object.keys(b.effect?.gainVs ?? {})) {
      if (!skillIds.has(key) && !enemyIds.has(key) && !kindIds.has(key)) {
        bad.push(`${label}: gainVs の対象 ${key}`);
      }
    }
    for (const key of Object.keys(b.effect?.damageVs ?? {})) {
      if (!enemyIds.has(key)) bad.push(`${label}: damageVs の敵 ${key}`);
    }
    for (const key of Object.keys(b.effect?.priceVs ?? {})) {
      if (!skillIds.has(key)) bad.push(`${label}: priceVs の仕事 ${key}`);
    }
    // 失われた書物（X-5）：棚条件の lostbook.<skillId> は skills.json の id に限る
    const flag = b.condition?.flag;
    const prefix = lostBooksCfg?.flagPrefix;
    if (flag !== undefined && prefix !== undefined && flag.startsWith(prefix)) {
      if (!skillIds.has(flag.slice(prefix.length))) {
        bad.push(`${label}: 棚条件フラグ ${flag} の技能が未定義`);
      }
    }
  }
  if (bad.length > 0) {
    console.error(`✗ 書物のキーが未定義: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 書物のキー（books ↔ skills/enemies）");
  }
} catch (e) {
  console.error(`✗ 書物のキー突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 師匠のキー突き合わせ：skill は skills.json、npc は canon.json figures と
// voices.json npcs の両方に存在すること（口調差分を出せること）。
// effect のキー規則は書物と同じ（gainVs=スキル/敵/行動kind、damageVs=敵、priceVs=スキル）
try {
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const enemiesRaw = JSON.parse(readFileSync(join(root, "enemies.json"), "utf8")) as {
    enemies?: { id?: string }[];
  };
  const canonRaw = JSON.parse(readFileSync(join(root, "lore/canon.json"), "utf8")) as {
    figures?: { id?: string }[];
  };
  const voicesRaw = JSON.parse(readFileSync(join(root, "voices.json"), "utf8")) as {
    npcs?: { id?: string }[];
  };
  const mentorsRaw = JSON.parse(readFileSync(join(root, "mentors.json"), "utf8")) as {
    mentors?: {
      id?: string;
      skill?: string;
      npc?: string;
      effect?: {
        gainVs?: Record<string, unknown>;
        damageVs?: Record<string, unknown>;
        priceVs?: Record<string, unknown>;
      };
    }[];
  };
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const enemyIds = new Set((enemiesRaw.enemies ?? []).map((e) => e.id));
  const figureIds = new Set((canonRaw.figures ?? []).map((f) => f.id));
  const voiceIds = new Set((voicesRaw.npcs ?? []).map((n) => n.id));
  const kindIds = new Set(["train", "work", "combat"]);
  const bad: string[] = [];
  for (const m of mentorsRaw.mentors ?? []) {
    const label = `mentors.json ${m.id ?? "?"}`;
    if (m.skill !== undefined && !skillIds.has(m.skill)) {
      bad.push(`${label}: 担当スキル ${m.skill}`);
    }
    if (m.npc !== undefined) {
      if (!figureIds.has(m.npc)) bad.push(`${label}: NPC ${m.npc} が canon.figures に無い`);
      if (!voiceIds.has(m.npc)) bad.push(`${label}: NPC ${m.npc} が voices.npcs に無い`);
    }
    for (const key of Object.keys(m.effect?.gainVs ?? {})) {
      if (!skillIds.has(key) && !enemyIds.has(key) && !kindIds.has(key)) {
        bad.push(`${label}: gainVs の対象 ${key}`);
      }
    }
    for (const key of Object.keys(m.effect?.damageVs ?? {})) {
      if (!enemyIds.has(key)) bad.push(`${label}: damageVs の敵 ${key}`);
    }
    for (const key of Object.keys(m.effect?.priceVs ?? {})) {
      if (!skillIds.has(key)) bad.push(`${label}: priceVs の仕事 ${key}`);
    }
  }
  if (bad.length > 0) {
    console.error(`✗ 師匠のキーが未定義: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 師匠のキー（mentors ↔ skills/canon/voices/enemies）");
  }
} catch (e) {
  console.error(`✗ 師匠のキー突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 頂点ルートの突き合わせ：route.title は titles.json に存在し、その称号の
// condition は「最終段のフラグ」（{flag: "pinnacle.<route>.<最終段id>"}）と一致すること。
// 条件鎖は pinnacles.json にだけ書き、称号側は旗を見るだけ —— 二重管理を避けるための構造
try {
  const titlesRaw = JSON.parse(readFileSync(join(root, "titles.json"), "utf8")) as {
    titles?: { id?: string; condition?: { flag?: string } }[];
  };
  const pinnaclesRaw = JSON.parse(readFileSync(join(root, "pinnacles.json"), "utf8")) as {
    pinnacles?: { id?: string; title?: string; stages?: { id?: string }[] }[];
  };
  const titleMap = new Map((titlesRaw.titles ?? []).map((t) => [t.id, t]));
  const bad: string[] = [];
  for (const r of pinnaclesRaw.pinnacles ?? []) {
    const label = `pinnacles.json ${r.id ?? "?"}`;
    const def = titleMap.get(r.title);
    if (def === undefined) {
      bad.push(`${label}: 頂点称号 ${r.title} が titles.json に無い`);
      continue;
    }
    const lastId = r.stages?.[r.stages.length - 1]?.id;
    const want = `pinnacle.${r.id}.${lastId}`;
    if (def.condition?.flag !== want) {
      bad.push(`${label}: ${r.title} の condition は {flag: "${want}"} にすること`);
    }
  }
  if (bad.length > 0) {
    console.error(`✗ 頂点ルートの称号が不正: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 頂点ルートの称号（pinnacles ↔ titles）");
  }
} catch (e) {
  console.error(`✗ 頂点ルートの突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 誓約の突き合わせ：vow.title は titles.json に存在し、その称号の条件は
// 「その誓約を積んだフラグ」（{flag: "vow.taken.<vow id>"}）を含むこと（T-46。
// 条件は flags/counters から読める形にする —— GameState.vows は条件DSLからは見えない）
try {
  const titlesRaw = JSON.parse(readFileSync(join(root, "titles.json"), "utf8")) as {
    titles?: { id?: string; condition?: unknown }[];
  };
  const vowsRaw = JSON.parse(readFileSync(join(root, "vows.json"), "utf8")) as {
    vows?: { id?: string; title?: string }[];
  };
  const titleMap = new Map((titlesRaw.titles ?? []).map((t) => [t.id, t]));
  const condHasFlag = (cond: unknown, flag: string): boolean => {
    if (typeof cond !== "object" || cond === null) return false;
    const c = cond as Record<string, unknown>;
    if (c.flag === flag) return true;
    for (const key of ["and", "or"] as const) {
      const children = c[key];
      if (Array.isArray(children) && children.some((x) => condHasFlag(x, flag))) return true;
    }
    // not の内側は「誓約を積んでいない」側の条件なので辿らない
    return false;
  };
  const bad: string[] = [];
  for (const v of vowsRaw.vows ?? []) {
    const label = `vows.json ${v.id ?? "?"}`;
    const def = titleMap.get(v.title);
    if (def === undefined) {
      bad.push(`${label}: 誓約称号 ${v.title} が titles.json に無い`);
      continue;
    }
    const want = `vow.taken.${v.id}`;
    if (!condHasFlag(def.condition, want)) {
      bad.push(`${label}: ${v.title} の condition はフラグ ${want} を含むこと`);
    }
  }
  if (bad.length > 0) {
    console.error(`✗ 誓約の称号が不正: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 誓約の称号（vows ↔ titles）");
  }
} catch (e) {
  console.error(`✗ 誓約の突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// ライバルの母集団の突き合わせ：ランキングに並ぶ人数（balance.rivals.size）を
// rivals.json の名の表が賄えること（重複なし抽選なので size 以上必要。T-47）
try {
  const balanceRaw = JSON.parse(readFileSync(join(root, "balance.json"), "utf8")) as {
    rivals?: { size?: number };
  };
  const rivalsRaw = JSON.parse(readFileSync(join(root, "rivals.json"), "utf8")) as {
    names?: string[];
  };
  const size = balanceRaw.rivals?.size ?? 0;
  const names = new Set(rivalsRaw.names ?? []);
  if (names.size < size) {
    console.error(
      `✗ rivals.json の名の表（${names.size}件）が balance.rivals.size（${size}）に足りない`,
    );
    failed = true;
  } else {
    console.log("✓ ライバル名の母集団（rivals ↔ balance）");
  }
} catch (e) {
  console.error(`✗ ライバルの突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 危機の参照の突き合わせ（W-01）：crises/sample.json のエリア・敵・NPC・
// 仕事の系統が実在すること（hidden/crises は内容を読まないので対象外。
// 別経路でロード時にスキーマ検証される）
try {
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const enemiesRaw = JSON.parse(readFileSync(join(root, "enemies.json"), "utf8")) as {
    enemies?: { id?: string; area?: string }[];
  };
  const canonRaw = JSON.parse(readFileSync(join(root, "lore/canon.json"), "utf8")) as {
    figures?: { id?: string }[];
  };
  const voicesRaw = JSON.parse(readFileSync(join(root, "voices.json"), "utf8")) as {
    npcs?: { id?: string }[];
  };
  const crisesRaw = JSON.parse(readFileSync(join(root, "crises/sample.json"), "utf8")) as {
    crises?: {
      id?: string;
      stages?: {
        id?: string;
        effects?: {
          closeAreas?: string[];
          price?: { kind?: string }[];
          enemy?: { id?: string; area?: string }[];
          npc?: { id?: string }[];
        };
      }[];
      touchpoints?: {
        id?: string;
        kind?: string;
        ref?: string;
        offer?: { kind?: string };
      }[];
    }[];
  };
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const enemyIds = new Set((enemiesRaw.enemies ?? []).map((e) => e.id));
  const areas = new Set((enemiesRaw.enemies ?? []).map((e) => e.area));
  const npcIds = new Set([
    ...(canonRaw.figures ?? []).map((f) => f.id),
    ...(voicesRaw.npcs ?? []).map((n) => n.id),
  ]);
  const bad: string[] = [];
  for (const c of crisesRaw.crises ?? []) {
    for (const s of c.stages ?? []) {
      const label = `crises ${c.id ?? "?"} 段階 ${s.id ?? "?"}`;
      for (const a of s.effects?.closeAreas ?? []) {
        if (!areas.has(a)) bad.push(`${label}: 閉鎖エリア ${a}`);
      }
      for (const p of s.effects?.price ?? []) {
        if (p.kind !== undefined && !skillIds.has(p.kind)) {
          bad.push(`${label}: 物価の系統 ${p.kind}`);
        }
      }
      for (const e of s.effects?.enemy ?? []) {
        if (e.id !== undefined && !enemyIds.has(e.id)) bad.push(`${label}: 敵 ${e.id}`);
        if (e.area !== undefined && !areas.has(e.area)) bad.push(`${label}: 敵エリア ${e.area}`);
      }
      for (const n of s.effects?.npc ?? []) {
        if (n.id !== undefined && !npcIds.has(n.id)) bad.push(`${label}: NPC ${n.id}`);
      }
    }
    // 接点（W-02）：戦いの接点 ref は実在の敵、注文の品 offer.kind は実在のスキル
    for (const tp of c.touchpoints ?? []) {
      const label = `crises ${c.id ?? "?"} 接点 ${tp.id ?? "?"}`;
      if (tp.ref !== undefined && !enemyIds.has(tp.ref)) bad.push(`${label}: 敵 ${tp.ref}`);
      if (tp.offer?.kind !== undefined && !skillIds.has(tp.offer.kind)) {
        bad.push(`${label}: 注文の系統 ${tp.offer.kind}`);
      }
    }
  }
  if (bad.length > 0) {
    console.error(`✗ 危機の参照が未定義: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 危機の参照（crises ↔ skills/enemies/canon/voices）");
  }
} catch (e) {
  console.error(`✗ 危機の参照突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 勝負所の行事の参照突き合わせ（X-10）：話し手は voices.json の住人か
// rivals.json の名前表の範囲内、器は既存のミニゲームの皮になる技能か
// enemies.json の敵に限る
try {
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const enemiesRaw = JSON.parse(readFileSync(join(root, "enemies.json"), "utf8")) as {
    enemies?: { id?: string }[];
  };
  const voicesRaw = JSON.parse(readFileSync(join(root, "voices.json"), "utf8")) as {
    npcs?: { id?: string }[];
  };
  const rivalsRaw = JSON.parse(readFileSync(join(root, "rivals.json"), "utf8")) as {
    names?: string[];
  };
  const occasionsRaw = JSON.parse(readFileSync(join(root, "occasions.json"), "utf8")) as {
    occasions?: {
      id?: string;
      speaker?: { kind?: string; id?: string; index?: number };
      vessel?: { kind?: string; skill?: string; ref?: string };
    }[];
  };
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const enemyIds = new Set((enemiesRaw.enemies ?? []).map((e) => e.id));
  const npcIds = new Set((voicesRaw.npcs ?? []).map((n) => n.id));
  const rivalNames = rivalsRaw.names?.length ?? 0;
  const bad: string[] = [];
  for (const o of occasionsRaw.occasions ?? []) {
    const label = `occasions.json ${o.id ?? "?"}`;
    if (o.speaker?.kind === "npc" && !npcIds.has(o.speaker.id ?? "")) {
      bad.push(`${label}: 話し手NPC ${o.speaker.id}`);
    }
    if (
      o.speaker?.kind === "rival" &&
      (o.speaker.index === undefined || o.speaker.index >= rivalNames)
    ) {
      bad.push(`${label}: ライバル話し手 index ${o.speaker.index}`);
    }
    if (o.vessel?.kind === "minigame" && !skillIds.has(o.vessel.skill ?? "")) {
      bad.push(`${label}: 勝負の技能 ${o.vessel.skill}`);
    }
    if (o.vessel?.kind === "combat" && !enemyIds.has(o.vessel.ref ?? "")) {
      bad.push(`${label}: 決闘の相手 ${o.vessel.ref}`);
    }
  }
  if (bad.length > 0) {
    console.error(`✗ 行事の参照が未定義: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 行事の参照（occasions ↔ voices/rivals/skills/enemies）");
  }
} catch (e) {
  console.error(`✗ 行事の参照突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 日々の出来事の参照突き合わせ（F-05）：話し手は voices.json の住人か
// rivals.json の名前表の範囲内（師匠は mentor 話し手として mentors.json と
// 別途突き合わせ済み）、結果が動かす経験は skills.json、手がかりのアトムは
// lore/atoms に存在するものに限る
try {
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const voicesRaw = JSON.parse(readFileSync(join(root, "voices.json"), "utf8")) as {
    npcs?: { id?: string }[];
  };
  const rivalsRaw = JSON.parse(readFileSync(join(root, "rivals.json"), "utf8")) as {
    names?: string[];
  };
  const incidentsRaw = JSON.parse(readFileSync(join(root, "incidents.json"), "utf8")) as {
    incidents?: {
      id?: string;
      speaker?: { kind?: string; id?: string; index?: number };
      choices?: { outcomes?: { gain?: { skill?: string }; atom?: string }[] }[];
    }[];
  };
  const atomIds = new Set(
    (readdirSync(join(root, "lore/atoms")) as string[])
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length)),
  );
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const npcIds = new Set((voicesRaw.npcs ?? []).map((n) => n.id));
  const rivalNames = rivalsRaw.names?.length ?? 0;
  const bad: string[] = [];
  for (const d of incidentsRaw.incidents ?? []) {
    const label = `incidents.json ${d.id ?? "?"}`;
    if (d.speaker?.kind === "npc" && !npcIds.has(d.speaker.id ?? "")) {
      bad.push(`${label}: 話し手NPC ${d.speaker.id}`);
    }
    if (
      d.speaker?.kind === "rival" &&
      (d.speaker.index === undefined || d.speaker.index >= rivalNames)
    ) {
      bad.push(`${label}: ライバル話し手 index ${d.speaker.index}`);
    }
    for (const c of d.choices ?? []) {
      for (const o of c.outcomes ?? []) {
        if (o.gain?.skill !== undefined && !skillIds.has(o.gain.skill)) {
          bad.push(`${label}: 経験のスキル ${o.gain.skill}`);
        }
        if (o.atom !== undefined && !atomIds.has(o.atom)) {
          bad.push(`${label}: 手がかりのアトム ${o.atom}`);
        }
      }
    }
  }
  if (bad.length > 0) {
    console.error(`✗ 出来事の参照が未定義: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 出来事の参照（incidents ↔ voices/rivals/skills/atoms）");
  }
} catch (e) {
  console.error(`✗ 出来事の参照突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// NPCの歳月の参照突き合わせ（X-12）：対象は voices.json / canon.json の人物か、
// ランキングのライバルの抽選順（rival.<index>、balance.rivals.size の範囲内）に限る。
// 師匠のNPCが対象になると、発火時にその師匠は街を去り使えなくなる
try {
  const canonRaw = JSON.parse(readFileSync(join(root, "lore/canon.json"), "utf8")) as {
    figures?: { id?: string }[];
  };
  const voicesRaw = JSON.parse(readFileSync(join(root, "voices.json"), "utf8")) as {
    npcs?: { id?: string }[];
  };
  const balanceRaw = JSON.parse(readFileSync(join(root, "balance.json"), "utf8")) as {
    rivals?: { size?: number };
  };
  const lifeRaw = JSON.parse(readFileSync(join(root, "npc_lifecycle.json"), "utf8")) as {
    npcs?: { npcId?: string }[];
  };
  const npcIds = new Set([
    ...(canonRaw.figures ?? []).map((f) => f.id),
    ...(voicesRaw.npcs ?? []).map((n) => n.id),
  ]);
  const rivalSize = balanceRaw.rivals?.size ?? 0;
  const bad: string[] = [];
  for (const n of lifeRaw.npcs ?? []) {
    const id = n.npcId ?? "";
    if (id.startsWith("rival.")) {
      const idx = Number.parseInt(id.slice("rival.".length), 10);
      if (!Number.isFinite(idx) || idx < 0 || idx >= rivalSize) {
        bad.push(`${id}: ライバルの抽選順がキャスト（${rivalSize}人）の範囲外`);
      }
      continue;
    }
    if (!npcIds.has(id)) bad.push(`${id}: voices/canon に無い人物`);
  }
  if (bad.length > 0) {
    console.error(`✗ NPCの歳月の参照が未定義: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ NPCの歳月の参照（npc_lifecycle ↔ voices/canon/rivals）");
  }
} catch (e) {
  console.error(`✗ NPCの歳月の参照突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 天候の突き合わせ（X-13）：seasonWeights の列数は balance.time.seasonsPerYear と
// 一致し、各季節に出る天候が1つ以上あること。balance.weather.orderPrice の
// キーは weather.json の天候id、内側のキーは skills.json の技能idか "*" のみ。
// 条件DSLの {weather} が指す天候idも weather.json に存在すること
try {
  const weatherRaw = JSON.parse(readFileSync(join(root, "weather.json"), "utf8")) as {
    kinds?: { id?: string; seasonWeights?: number[] }[];
  };
  const balanceRaw = JSON.parse(readFileSync(join(root, "balance.json"), "utf8")) as {
    time?: { seasonsPerYear?: number };
    weather?: { orderPrice?: Record<string, Record<string, unknown>> };
  };
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const kindIds = new Set((weatherRaw.kinds ?? []).map((k) => k.id));
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const seasons = balanceRaw.time?.seasonsPerYear ?? 0;
  const bad: string[] = [];
  for (const k of weatherRaw.kinds ?? []) {
    const w = k.seasonWeights ?? [];
    if (w.length !== seasons) {
      bad.push(
        `weather.json ${k.id ?? "?"}: seasonWeights の長さ ${w.length} ≠ seasonsPerYear ${seasons}`,
      );
    }
  }
  // 各季節（列）に重みのある天候が1つ以上無いとその季節に空が決められない
  for (let s = 0; s < seasons; s++) {
    const any = (weatherRaw.kinds ?? []).some((k) => (k.seasonWeights?.[s] ?? 0) > 0);
    if (!any) bad.push(`季節 ${s}: 出る天候がない`);
  }
  for (const [wid, kinds] of Object.entries(balanceRaw.weather?.orderPrice ?? {})) {
    if (!kindIds.has(wid)) bad.push(`balance.weather.orderPrice: 未定義の天候 ${wid}`);
    for (const key of Object.keys(kinds)) {
      if (key !== "*" && !skillIds.has(key)) {
        bad.push(`balance.weather.orderPrice ${wid}: 未定義の系統 ${key}`);
      }
    }
  }
  // 条件DSLの {weather} が指す天候idを、条件を持つJSON全部から集めて検査する
  // （{weather: id|string[]} というキーは条件オブジェクトにしか現れない）
  const collectWeather = (v: unknown, out: Set<string>): void => {
    if (Array.isArray(v)) {
      for (const x of v) collectWeather(x, out);
      return;
    }
    if (typeof v !== "object" || v === null) return;
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      if (key === "weather" && (typeof val === "string" || Array.isArray(val))) {
        const ids = Array.isArray(val) ? val : [val];
        for (const id of ids) if (typeof id === "string") out.add(id);
        continue;
      }
      collectWeather(val, out);
    }
  };
  const condFiles = [
    "discoveries.json",
    "occasions.json",
    "titles.json",
    "society.json",
    "books.json",
    "mentors.json",
    "pinnacles.json",
    "npc_lifecycle.json",
    "incidents.json",
    "vows.json",
    "crises/sample.json",
  ];
  const usedWeather = new Set<string>();
  for (const name of condFiles) {
    try {
      collectWeather(JSON.parse(readFileSync(join(root, name), "utf8")), usedWeather);
    } catch {
      // 読めないファイルは個別の check() が失敗を報告しているのでここでは飛ばす
    }
  }
  for (const id of usedWeather) {
    if (!kindIds.has(id)) bad.push(`条件DSLの天候 ${id} が weather.json に無い`);
  }
  if (bad.length > 0) {
    console.error(`✗ 天候の参照が不正: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 天候の参照（weather ↔ balance/skills/条件DSL）");
  }
} catch (e) {
  console.error(`✗ 天候の突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 場所の突き合わせ（P-01、docs/03 §2）：場所に居る人は voices.json の npc、
// work の技能は skills.json の id。注文は全てどこかの場所に届くこと
// （kinds に入っているか、default の受け皿があること）、師匠は全員どこかの
// 場所に居ること、狩りをする地域には enemies.json に敵がいること
try {
  const placesRaw = JSON.parse(readFileSync(join(root, "places.json"), "utf8")) as {
    places?: {
      id?: string;
      npcs?: string[];
      actions?: { type?: string; kinds?: string[]; default?: boolean }[];
    }[];
  };
  const voicesRaw = JSON.parse(readFileSync(join(root, "voices.json"), "utf8")) as {
    npcs?: { id?: string }[];
  };
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const ordersRaw = JSON.parse(readFileSync(join(root, "orders.json"), "utf8")) as {
    orders?: { kind?: string }[];
  };
  const mentorsRaw = JSON.parse(readFileSync(join(root, "mentors.json"), "utf8")) as {
    mentors?: { id?: string; npc?: string }[];
  };
  const enemiesRaw = JSON.parse(readFileSync(join(root, "enemies.json"), "utf8")) as {
    enemies?: { area?: string }[];
  };
  const npcIds = new Set((voicesRaw.npcs ?? []).map((n) => n.id));
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const enemyAreas = new Set((enemiesRaw.enemies ?? []).map((e) => e.area));
  const bad: string[] = [];
  const coveredKinds = new Set<string>();
  let hasDefault = false;
  const residentNpcs = new Set<string>();
  for (const p of placesRaw.places ?? []) {
    for (const n of p.npcs ?? []) {
      if (!npcIds.has(n)) bad.push(`places.json ${p.id ?? "?"}: 未定義のNPC ${n}`);
      residentNpcs.add(n);
    }
    for (const a of p.actions ?? []) {
      if (a.type === "work") {
        if (a.default === true) hasDefault = true;
        for (const k of a.kinds ?? []) {
          if (!skillIds.has(k)) bad.push(`places.json ${p.id ?? "?"}: 未定義の技能 ${k}`);
          coveredKinds.add(k);
        }
      }
      if (a.type === "hunt" && !enemyAreas.has(p.id)) {
        bad.push(`places.json ${p.id ?? "?"}: 狩りの地域だが enemies.json に敵がいない`);
      }
    }
  }
  if (!hasDefault) {
    for (const o of ordersRaw.orders ?? []) {
      if (o.kind !== undefined && !coveredKinds.has(o.kind)) {
        bad.push(`orders.json: 技能 ${o.kind} の注文が届く場所がない`);
      }
    }
  }
  for (const m of mentorsRaw.mentors ?? []) {
    if (m.npc !== undefined && !residentNpcs.has(m.npc)) {
      bad.push(`mentors.json ${m.id ?? "?"}: 師匠 ${m.npc} の居場所がない`);
    }
  }
  if (bad.length > 0) {
    console.error(`✗ 場所の参照が不正: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 場所の参照（places ↔ voices/skills/orders/mentors/enemies）");
  }
} catch (e) {
  console.error(`✗ 場所の突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 隠し要素ディレクトリは中身を検証しない（ネタバレ防止。docs/07_story.md §5）
// hidden/ が空でなければ警告だけ出す
try {
  const hidden = readdirSync(join(root, "hidden")).filter(
    (f) => f !== "README.md" && !f.startsWith("."),
  );
  if (hidden.length > 0) {
    console.log(`- hidden/ に ${hidden.length} 件の隠し要素（スキーマ検証は別途）`);
  }
} catch {
  // hidden/ が無ければ無視
}

if (failed) {
  process.exit(1);
}
console.log("コンテンツのスキーマ検証: すべて合格");
