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
import { itemsFileSchema } from "./items.schema.js";
import { lifeFileSchema } from "./life.schema.js";
import { audioFileSchema } from "./audio.schema.js";
import { weaponsFileSchema } from "./weapons.schema.js";
import { artsFileSchema } from "./arts.schema.js";
import { spellsFileSchema } from "./spells.schema.js";
import { crisesFileSchema } from "../crises/schema.js";
import { k03FileSchema } from "../k03/schema.js";
import { worldFileSchema } from "./world.schema.js";
import { sceneryFileSchema } from "./scenery.schema.js";

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
check("items.json", itemsFileSchema);
check("life.json", lifeFileSchema);
check("audio.json", audioFileSchema);
check("weapons.json", weaponsFileSchema);
check("arts.json", artsFileSchema);
check("spells.json", spellsFileSchema);
check("crises/sample.json", crisesFileSchema);
check("k03/sample.json", k03FileSchema);

// K-03 の進化形の突き合わせ：派生 id（__e/__h で materialize する）が
// 既存の技・呪文の id と衝突しないこと。また分岐の mod.name が必須であること
// （learn.at のない派生定義が名を持たないと表示できない）
try {
  const artsRaw = JSON.parse(readFileSync(join(root, "arts.json"), "utf8")) as {
    arts?: { id?: string; evolve?: { branches?: unknown[] } }[];
  };
  const spellsRaw = JSON.parse(readFileSync(join(root, "spells.json"), "utf8")) as {
    spells?: { id?: string; evolve?: { branches?: unknown[] } }[];
  };
  const ids = new Set<string>();
  for (const a of [...(artsRaw.arts ?? []), ...(spellsRaw.spells ?? [])]) {
    if (a.id !== undefined) ids.add(a.id);
  }
  const bad: string[] = [];
  for (const a of [...(artsRaw.arts ?? []), ...(spellsRaw.spells ?? [])]) {
    const n = a.evolve?.branches?.length ?? 0;
    for (let i = 0; i < n; i++) {
      const derived = `${a.id}__e${i}`;
      if (ids.has(derived)) bad.push(`${a.id}: 派生id ${derived} が既存の技と衝突`);
    }
  }
  if (bad.length > 0) {
    console.error(`✗ K-03 の派生idが衝突: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ K-03 の派生id（evolve branches ↔ arts/spells）");
  }
} catch (e) {
  console.error(`✗ K-03 の派生id突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// K-03 公開サンプルの参照の突き合わせ：技・技能・元の技が実在すること。
// 条件DSLの {art}・{skill} 参照と hiddenBranches.from・def.skill を見る
// （hidden/k03 は内容を読まないので対象外。スキーマはローダーで検証済み）
try {
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const artsRaw = JSON.parse(readFileSync(join(root, "arts.json"), "utf8")) as {
    arts?: { id?: string }[];
  };
  const spellsRaw = JSON.parse(readFileSync(join(root, "spells.json"), "utf8")) as {
    spells?: { id?: string }[];
  };
  const k03Raw = JSON.parse(readFileSync(join(root, "k03/sample.json"), "utf8")) as {
    uniques?: { def?: { id?: string; skill?: string }; condition?: unknown }[];
    recipes?: { def?: { id?: string; skill?: string }; condition?: unknown }[];
    hiddenBranches?: { from?: string }[];
  };
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const artIds = new Set([...(artsRaw.arts ?? []), ...(spellsRaw.spells ?? [])].map((a) => a.id));
  const bad: string[] = [];
  const walkCond = (cond: unknown, owner: string) => {
    if (typeof cond !== "object" || cond === null) return;
    for (const [k, v] of Object.entries(cond as Record<string, unknown>)) {
      if (k === "art" && typeof v === "string" && !artIds.has(v))
        bad.push(`${owner}: 未定義の技 ${v}`);
      if (k === "skill" && typeof v === "string" && !skillIds.has(v))
        bad.push(`${owner}: 未定義の技能 ${v}`);
      if (typeof v === "object" && v !== null) walkCond(v, owner);
      if (Array.isArray(v)) for (const x of v) walkCond(x, owner);
    }
  };
  for (const u of k03Raw.uniques ?? []) {
    const owner = `uniques ${u.def?.id ?? "?"}`;
    if (u.def?.skill !== undefined && !skillIds.has(u.def.skill))
      bad.push(`${owner}: 未定義の技能 ${u.def.skill}`);
    if (u.def?.id !== undefined && artIds.has(u.def.id))
      bad.push(`${owner}: id ${u.def.id} が既存の技と衝突`);
    walkCond(u.condition, owner);
  }
  for (const r of k03Raw.recipes ?? []) {
    const owner = `recipes ${r.def?.id ?? "?"}`;
    if (r.def?.skill !== undefined && !skillIds.has(r.def.skill))
      bad.push(`${owner}: 未定義の技能 ${r.def.skill}`);
    if (r.def?.id !== undefined && artIds.has(r.def.id))
      bad.push(`${owner}: id ${r.def.id} が既存の技と衝突`);
    walkCond(r.condition, owner);
  }
  for (const b of k03Raw.hiddenBranches ?? []) {
    if (b.from !== undefined && !artIds.has(b.from))
      bad.push(`hiddenBranches: 未定義の元の技 ${b.from}`);
  }
  if (bad.length > 0) {
    console.error(`✗ K-03 サンプルの参照が不正: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ K-03 サンプルの参照（k03 ↔ skills/arts/spells）");
  }
} catch (e) {
  console.error(`✗ K-03 サンプルの突き合わせに失敗 (${String(e)})`);
  failed = true;
}

check("world.json", worldFileSchema);

/* 地方生成の突き合わせ（G-01）：world.json の型が参照する
 * 品物（採集・市場・拾い物・依頼）・敵・技能・散策の旗印・見聞アトムは
 * 既存のJSONに実在するものに限る。住人・場所の id は生成されるので対象外
 */
try {
  const read = (name: string) =>
    JSON.parse(readFileSync(join(root, name), "utf8")) as Record<string, unknown>;
  const worldRaw = read("world.json") as {
    townBase?: { market?: { stock?: string[]; cheap?: string[]; dear?: string[] } };
    townTypes?: {
      id?: string;
      market?: { stock?: string[]; cheap?: string[]; dear?: string[] };
      errands?: {
        need?: Record<string, number>;
        reward?: { items?: Record<string, number>; gain?: { skill?: string } };
      }[];
      places?: {
        actions?: { kinds?: string[] }[];
        gather?: { skill?: string; entries?: { item?: string }[] };
      }[];
      npcs?: { mentorSkills?: string[] }[];
      stroll?: { items?: Record<string, number>; gain?: { skill?: string }; atom?: string }[];
    }[];
    areaTypes?: {
      id?: string;
      enemies?: { id?: string }[];
      work?: { kinds?: string[] };
      gather?: { skill?: string; entries?: { item?: string }[] };
      stroll?: { items?: Record<string, number>; gain?: { skill?: string }; atom?: string }[];
    }[];
    spotKinds?: {
      id?: string;
      outcomes?: { items?: Record<string, number>; gain?: { skill?: string }; atom?: string }[];
    }[];
    dungeonTypes?: {
      id?: string;
      enemies?: { id?: string }[];
      bosses?: { enemy?: string }[];
      treasure?: { item?: string }[];
    }[];
  };
  const itemIds = new Set(
    ((read("items.json") as { items?: { id?: string }[] }).items ?? []).map((i) => i.id),
  );
  // 敵の id は基の種＋亜種（<base>__<biome> で展開される）の両方を数える（G-04）
  const enemiesRawForIds = read("enemies.json") as {
    enemies?: { id?: string }[];
    variants?: { base?: string; biome?: string }[];
  };
  const enemyIds = new Set([
    ...(enemiesRawForIds.enemies ?? []).map((e) => e.id),
    ...(enemiesRawForIds.variants ?? []).map((v) => `${v.base ?? ""}__${v.biome ?? ""}`),
  ]);
  const skillIds = new Set(
    ((read("skills.json") as { skills?: { id?: string }[] }).skills ?? []).map((s) => s.id),
  );
  // 見聞アトムは lore/atoms/*.json の atom id
  const atomIds = new Set<string>();
  const atomsDir = join(root, "lore", "atoms");
  for (const f of readdirSync(atomsDir)) {
    if (!f.endsWith(".json")) continue;
    const atom = JSON.parse(readFileSync(join(atomsDir, f), "utf8")) as { id?: string };
    if (atom.id !== undefined) atomIds.add(atom.id);
  }
  const bad: string[] = [];
  const chkItem = (id: string | undefined, where: string) => {
    if (id !== undefined && !itemIds.has(id)) bad.push(`${where}: 未定義の品 ${id}`);
  };
  const chkSkill = (id: string | undefined, where: string) => {
    if (id !== undefined && !skillIds.has(id)) bad.push(`${where}: 未定義の技能 ${id}`);
  };
  const chkOutcome = (
    o: { items?: Record<string, number>; gain?: { skill?: string }; atom?: string } | undefined,
    where: string,
  ) => {
    if (o === undefined) return;
    for (const id of Object.keys(o.items ?? {})) chkItem(id, where);
    chkSkill(o.gain?.skill, where);
    if (o.atom !== undefined && !atomIds.has(o.atom))
      bad.push(`${where}: 未定義の見聞アトム ${o.atom}`);
  };
  const chkMarket = (
    m: { stock?: string[]; cheap?: string[]; dear?: string[] } | undefined,
    where: string,
  ) => {
    for (const id of [...(m?.stock ?? []), ...(m?.cheap ?? []), ...(m?.dear ?? [])])
      chkItem(id, where);
  };
  chkMarket(worldRaw.townBase?.market, "townBase.market");
  for (const t of worldRaw.townTypes ?? []) {
    const where = `townTypes.${t.id ?? "?"}`;
    chkMarket(t.market, `${where}.market`);
    for (const e of t.errands ?? []) {
      for (const id of Object.keys(e.need ?? {})) chkItem(id, `${where}.errands`);
      for (const id of Object.keys(e.reward?.items ?? {})) chkItem(id, `${where}.errands`);
      chkSkill(e.reward?.gain?.skill, `${where}.errands`);
    }
    for (const p of t.places ?? []) {
      for (const a of p.actions ?? [])
        for (const k of a.kinds ?? []) chkSkill(k, `${where}.places`);
      chkSkill(p.gather?.skill, `${where}.places`);
      for (const e of p.gather?.entries ?? []) chkItem(e.item, `${where}.places`);
    }
    for (const n of t.npcs ?? [])
      for (const s of n.mentorSkills ?? []) chkSkill(s, `${where}.npcs`);
    for (const o of t.stroll ?? []) chkOutcome(o, `${where}.stroll`);
  }
  for (const a of worldRaw.areaTypes ?? []) {
    const where = `areaTypes.${a.id ?? "?"}`;
    for (const e of a.enemies ?? []) {
      if (!enemyIds.has(e.id)) bad.push(`${where}: 未定義の敵 ${e.id}`);
    }
    for (const k of a.work?.kinds ?? []) chkSkill(k, `${where}.work`);
    chkSkill(a.gather?.skill, `${where}.gather`);
    for (const e of a.gather?.entries ?? []) chkItem(e.item, `${where}.gather`);
    for (const o of a.stroll ?? []) chkOutcome(o, `${where}.stroll`);
  }
  for (const s of worldRaw.spotKinds ?? []) {
    for (const o of s.outcomes ?? []) chkOutcome(o, `spotKinds.${s.id ?? "?"}`);
  }
  /* 迷宮の型（G-03）：敵・主・宝物の参照は既存JSONに実在するものに限る。
   * 罠の型参照（trapKinds）は world.schema の superRefine で検証済み */
  for (const d of worldRaw.dungeonTypes ?? []) {
    const where = `dungeonTypes.${d.id ?? "?"}`;
    for (const e of d.enemies ?? []) {
      if (e.id !== undefined && !enemyIds.has(e.id)) bad.push(`${where}: 未定義の敵 ${e.id}`);
    }
    for (const b of d.bosses ?? []) {
      if (b.enemy !== undefined && !enemyIds.has(b.enemy))
        bad.push(`${where}: 未定義の主 ${b.enemy}`);
    }
    for (const t of d.treasure ?? []) chkItem(t.item, `${where}.treasure`);
  }
  if (bad.length > 0) {
    console.error(`✗ world.json の参照が未定義: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ world.json の参照（items/enemies/skills/atoms）");
  }
} catch (e) {
  console.error(`✗ world.json の突き合わせに失敗 (${String(e)})`);
  failed = true;
}

check("scenery.json", sceneryFileSchema);

/* 情景の部品の突き合わせ（G-05、docs/10 §8）：
 * - world.json の全ての町の型・地域の型にレシピがある（型の背景が出る）
 * - town.<型>.places の差分キーは、その型が実際に持つ場所の key（基の場所
 *   − omit ＋ 型の追加場所）に限る
 * - legacy.towns / legacy.regions の当て元は places.json の町・地域の id
 */
try {
  const read = (name: string) =>
    JSON.parse(readFileSync(join(root, name), "utf8")) as Record<string, unknown>;
  const worldRaw = read("world.json") as {
    townBase?: { places?: { key?: string }[] };
    townTypes?: { id?: string; omitPlaces?: string[]; places?: { key?: string }[] }[];
    areaTypes?: { id?: string }[];
    dungeonTypes?: { id?: string }[];
  };
  const sceneryRaw = read("scenery.json") as {
    town?: Record<string, { places?: Record<string, unknown> }>;
    region?: Record<string, unknown>;
    dungeon?: Record<string, unknown>;
    legacy?: { towns?: Record<string, string>; regions?: Record<string, string> };
  };
  const placesRaw = read("places.json") as {
    places?: { id?: string; kind?: string; town?: string }[];
  };
  const bad: string[] = [];
  const townTypes = worldRaw.townTypes ?? [];
  const baseKeys = new Set((worldRaw.townBase?.places ?? []).map((p) => p.key));
  for (const t of townTypes) {
    const tid = t.id ?? "?";
    const recipe = sceneryRaw.town?.[tid];
    if (recipe === undefined) {
      bad.push(`町の型 ${tid} のレシピが無い`);
      continue;
    }
    const keys = new Set(baseKeys);
    for (const k of t.omitPlaces ?? []) keys.delete(k);
    for (const p of t.places ?? []) if (p.key !== undefined) keys.add(p.key);
    for (const k of Object.keys(recipe.places ?? {})) {
      if (!keys.has(k)) bad.push(`town.${tid}.places: 型の持たない場所 ${k}`);
    }
  }
  for (const a of worldRaw.areaTypes ?? []) {
    if (sceneryRaw.region?.[a.id ?? "?"] === undefined)
      bad.push(`地域の型 ${a.id ?? "?"} のレシピが無い`);
  }
  // 迷宮の型（G-03）も型ごとのレシピが要る（dungeon.<型id>）
  for (const d of worldRaw.dungeonTypes ?? []) {
    if (sceneryRaw.dungeon?.[d.id ?? "?"] === undefined)
      bad.push(`迷宮の型 ${d.id ?? "?"} のレシピが無い`);
  }
  const placeIds = new Set((placesRaw.places ?? []).map((p) => p.id));
  const townIds = new Set<string>(["ardi"]);
  for (const p of placesRaw.places ?? []) if (p.town !== undefined) townIds.add(p.town);
  for (const t of Object.keys(sceneryRaw.legacy?.towns ?? {})) {
    if (!townIds.has(t)) bad.push(`legacy.towns: places.json に無い町 ${t}`);
  }
  for (const r of Object.keys(sceneryRaw.legacy?.regions ?? {})) {
    if (!placeIds.has(r)) bad.push(`legacy.regions: places.json に無い場所 ${r}`);
  }
  if (bad.length > 0) {
    console.error(`✗ scenery.json の参照が不正: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ scenery.json の型・差分・legacy の当て方（scenery ↔ world/places）");
  }
} catch (e) {
  console.error(`✗ scenery.json の突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 武器の突き合わせ（K-01）：武器が使う技能は skills.json に存在し、
// 初期所持・初期装備は weapons.json に定義された id に限る
try {
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const weaponsRaw = JSON.parse(readFileSync(join(root, "weapons.json"), "utf8")) as {
    weapons?: { id?: string; skill?: string }[];
    initial?: string[];
    defaultWeapon?: string;
  };
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const weaponIds = new Set((weaponsRaw.weapons ?? []).map((w) => w.id));
  const bad: string[] = [];
  for (const w of weaponsRaw.weapons ?? []) {
    if (w.skill !== undefined && !skillIds.has(w.skill)) {
      bad.push(`weapons.json ${w.id ?? "?"}: 未定義の技能 ${w.skill}`);
    }
  }
  for (const id of weaponsRaw.initial ?? []) {
    if (!weaponIds.has(id)) bad.push(`weapons.json initial: 未定義の武器 ${id}`);
  }
  if (weaponsRaw.defaultWeapon !== undefined && !weaponIds.has(weaponsRaw.defaultWeapon)) {
    bad.push(`weapons.json defaultWeapon: 未定義の武器 ${weaponsRaw.defaultWeapon}`);
  }
  if (bad.length > 0) {
    console.error(`✗ 武器の参照が未定義: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 武器の参照（weapons ↔ skills）");
  }
} catch (e) {
  console.error(`✗ 武器の突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 武技の突き合わせ（K-02）：武技・パッシブの由来技能は skills.json に
// 存在するものに限る（技が実在しない技能に紐づかないようにする）
try {
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const artsRaw = JSON.parse(readFileSync(join(root, "arts.json"), "utf8")) as {
    arts?: { id?: string; skill?: string; kind?: string }[];
  };
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const bad: string[] = [];
  for (const a of artsRaw.arts ?? []) {
    if (a.skill !== undefined && !skillIds.has(a.skill)) {
      bad.push(`arts.json ${a.id ?? "?"}: 未定義の技能 ${a.skill}`);
    }
  }
  if (bad.length > 0) {
    console.error(`✗ 武技の参照が未定義: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 武技の参照（arts ↔ skills）");
  }
} catch (e) {
  console.error(`✗ 武技の突き合わせに失敗 (${String(e)})`);
  failed = true;
}

/* 呪文の突き合わせ（M-01）：
 * - 由来技能は skills.json に存在
 * - learn.flag の供給元があること：
 *   grimoire.* = books.json の flag、taught.* = mentors.json の flag、
 *   spell.seen.<id> = その呪文を唱える敵が enemies.json に居る（見取り稽古）
 * - learn.counter は core が書き込む spell.cast.* 系列に限る
 * - 敵の moves.*.spell は spells.json の id
 * - preserve 系の transform.from/to は items.json の id
 */
try {
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const spellsRaw = JSON.parse(readFileSync(join(root, "spells.json"), "utf8")) as {
    spells?: {
      id?: string;
      skill?: string;
      learn?: { flag?: string; counter?: { key?: string } };
      spell?: { life?: { transform?: { from?: string; to?: string } } };
    }[];
  };
  const enemiesRaw = JSON.parse(readFileSync(join(root, "enemies.json"), "utf8")) as {
    enemies?: {
      id?: string;
      moves?: Record<string, { spell?: string }> | { spell?: string }[];
      drops?: { item?: string }[];
    }[];
  };
  const booksRaw = JSON.parse(readFileSync(join(root, "books.json"), "utf8")) as {
    books?: { flag?: string }[];
  };
  const mentorsRaw = JSON.parse(readFileSync(join(root, "mentors.json"), "utf8")) as {
    mentors?: { flag?: string }[];
  };
  const itemsRaw = JSON.parse(readFileSync(join(root, "items.json"), "utf8")) as {
    items?: { id?: string }[];
  };
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const spellIds = new Set((spellsRaw.spells ?? []).map((s) => s.id));
  const itemIds = new Set((itemsRaw.items ?? []).map((i) => i.id));
  const bookFlags = new Set((booksRaw.books ?? []).map((b) => b.flag).filter(Boolean));
  const mentorFlags = new Set((mentorsRaw.mentors ?? []).map((m) => m.flag).filter(Boolean));
  /* 敵が唱える呪文（見取り稽古で spell.seen.<id> が立つ元） */
  const enemySpells = new Set<string>();
  for (const e of enemiesRaw.enemies ?? []) {
    const moves = e.moves;
    const list = Array.isArray(moves) ? moves : Object.values(moves ?? {});
    for (const m of list) if (m.spell !== undefined) enemySpells.add(m.spell);
  }
  const MAGIC_ELEMENTS = new Set([
    "fire",
    "water",
    "wind",
    "earth",
    "light",
    "dark",
    "void",
    "life",
    "cure",
  ]);
  const bad: string[] = [];
  for (const s of spellsRaw.spells ?? []) {
    const sid = s.id ?? "?";
    if (s.skill !== undefined && !skillIds.has(s.skill))
      bad.push(`spells.json ${sid}: 未定義の技能 ${s.skill}`);
    const flag = s.learn?.flag;
    if (flag !== undefined) {
      if (flag.startsWith("spell.seen.")) {
        const need = flag.slice("spell.seen.".length);
        if (!enemySpells.has(need))
          bad.push(`spells.json ${sid}: ${flag} を立てる敵の呪文が enemies.json に無い`);
      } else if (flag.startsWith("grimoire.")) {
        if (!bookFlags.has(flag))
          bad.push(`spells.json ${sid}: ${flag} を立てる書物が books.json に無い`);
      } else if (flag.startsWith("taught.")) {
        if (!mentorFlags.has(flag))
          bad.push(`spells.json ${sid}: ${flag} を立てる師匠が mentors.json に無い`);
      }
    }
    const key = s.learn?.counter?.key;
    if (key !== undefined) {
      const ok =
        key === "spell.cast.life" ||
        (key.startsWith("spell.cast.el.") &&
          MAGIC_ELEMENTS.has(key.slice("spell.cast.el.".length))) ||
        (key.startsWith("spell.cast.") && spellIds.has(key.slice("spell.cast.".length)));
      if (!ok) bad.push(`spells.json ${sid}: learn.counter のキー ${key} は spell.cast.* ではない`);
    }
    const tr = s.spell?.life?.transform;
    if (tr?.from !== undefined && !itemIds.has(tr.from))
      bad.push(`spells.json ${sid}: transform.from の品 ${tr.from} が items.json に無い`);
    if (tr?.to !== undefined && !itemIds.has(tr.to))
      bad.push(`spells.json ${sid}: transform.to の品 ${tr.to} が items.json に無い`);
  }
  for (const e of enemiesRaw.enemies ?? []) {
    const moves = e.moves;
    const list = Array.isArray(moves) ? moves : Object.values(moves ?? {});
    for (const m of list) {
      if (m.spell !== undefined && !spellIds.has(m.spell))
        bad.push(`enemies.json ${e.id ?? "?"}: 未定義の呪文 ${m.spell}`);
    }
    // G-04：戦利品は items.json の品物 id
    for (const dr of e.drops ?? []) {
      if (dr.item !== undefined && !itemIds.has(dr.item))
        bad.push(`enemies.json ${e.id ?? "?"}: 未定義の戦利品 ${dr.item}`);
    }
  }
  if (bad.length > 0) {
    console.error(`✗ 魔法の参照が未定義: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 魔法の参照（spells ↔ skills/enemies/books/mentors/items）");
  }
} catch (e) {
  console.error(`✗ 魔法の突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 技能と世界の結線（K-01「技能を増やす」）：balance.links のフックと係数の
// 技能は実在するものに限り、全技能に「伸ばす行動」と「効く場面」があること。
// 伸ばす行動：注文・師匠・出来事・武器の技能・定数系リンク（移動/読み/獣経験）。
// 効く場面：注文・武器・係数リンク・条件DSL・効果キー・場所の仕事・危機の役割
//   ※ 汎用の「訓練」は全技能に効くが、世界に根ざした導線を別途1つ要求する
try {
  const read = (name: string) =>
    JSON.parse(readFileSync(join(root, name), "utf8")) as Record<string, unknown>;
  const skillsRaw = read("skills.json") as { skills?: { id?: string; unlock?: unknown }[] };
  const balanceRaw = read("balance.json") as {
    links?: Record<string, { skills?: Record<string, number> }>;
    crisis?: { involvement?: { roleSkills?: Record<string, string[]> } };
    weather?: { orderPrice?: Record<string, Record<string, number>> };
  };
  const ordersRaw = read("orders.json") as { orders?: { kind?: string }[] };
  const mentorsRaw = read("mentors.json") as {
    mentors?: { skill?: string; effect?: Record<string, Record<string, unknown>> }[];
  };
  const booksRaw = read("books.json") as {
    books?: {
      potentialRecover?: Record<string, unknown>;
      effect?: Record<string, Record<string, unknown>>;
    }[];
  };
  const incidentsRaw = read("incidents.json") as {
    incidents?: { choices?: { outcomes?: { gain?: { skill?: string } }[] }[] }[];
  };
  const weaponsRaw = read("weapons.json") as { weapons?: { skill?: string }[] };
  const placesRaw = read("places.json") as {
    places?: { actions?: { type?: string; kinds?: string[] }[] }[];
  };
  const tailwindsRaw = read("tailwinds.json") as { winds?: { target?: string }[] };
  const occasionsRaw = read("occasions.json") as {
    occasions?: { vessel?: { kind?: string; skill?: string } }[];
  };

  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));

  /** 条件DSLを再帰的に辿って {skill} 参照を集める */
  const collectCondSkills = (v: unknown, out: Set<string>): void => {
    if (Array.isArray(v)) {
      for (const x of v) collectCondSkills(x, out);
      return;
    }
    if (typeof v !== "object" || v === null) return;
    const rec = v as Record<string, unknown>;
    for (const [key, val] of Object.entries(rec)) {
      // {skill: id} は条件DSL固有のキー（他の同名キーはない）
      if (key === "skill" && typeof val === "string") {
        out.add(val);
        continue;
      }
      collectCondSkills(val, out);
    }
  };

  const condSkills = new Set<string>();
  for (const name of [
    "skills.json",
    "titles.json",
    "society.json",
    "pinnacles.json",
    "occasions.json",
    "incidents.json",
    "discoveries.json",
    "vows.json",
    "npc_lifecycle.json",
    "books.json",
    "mentors.json",
    "crises/sample.json",
  ]) {
    try {
      collectCondSkills(read(name), condSkills);
    } catch {
      // 読めないファイルは個別の check() が失敗を報告しているのでここでは飛ばす
    }
  }

  const orderKinds = new Set((ordersRaw.orders ?? []).map((o) => o.kind));
  const mentorSkills = new Set((mentorsRaw.mentors ?? []).map((m) => m.skill));
  const incidentGains = new Set(
    (incidentsRaw.incidents ?? []).flatMap((i) =>
      (i.choices ?? []).flatMap((c) => (c.outcomes ?? []).map((o) => o.gain?.skill)),
    ),
  );
  const weaponSkills = new Set((weaponsRaw.weapons ?? []).map((w) => w.skill));
  const placeKinds = new Set(
    (placesRaw.places ?? []).flatMap((p) =>
      (p.actions ?? []).flatMap((a) => (a.type === "work" ? (a.kinds ?? []) : [])),
    ),
  );
  const tailwindSkills = new Set((tailwindsRaw.winds ?? []).map((w) => w.target));
  const vesselSkills = new Set(
    (occasionsRaw.occasions ?? [])
      .filter((o) => o.vessel?.kind === "minigame")
      .map((o) => o.vessel?.skill),
  );
  const effectKeys = new Set<string>();
  for (const b of booksRaw.books ?? []) {
    for (const k of Object.keys(b.potentialRecover ?? {})) effectKeys.add(k);
    for (const k of Object.keys(b.effect?.gainVs ?? {})) effectKeys.add(k);
    for (const k of Object.keys(b.effect?.priceVs ?? {})) effectKeys.add(k);
  }
  for (const m of mentorsRaw.mentors ?? []) {
    for (const k of Object.keys(m.effect?.gainVs ?? {})) effectKeys.add(k);
    for (const k of Object.keys(m.effect?.priceVs ?? {})) effectKeys.add(k);
  }
  const roleSkills = new Set(
    Object.values(balanceRaw.crisis?.involvement?.roleSkills ?? {}).flat(),
  );
  const weatherKinds = new Set(
    Object.values(balanceRaw.weather?.orderPrice ?? {}).flatMap((m) => Object.keys(m)),
  );

  // リンクの検査：フックは core が読む名の一覧に限り、係数の技能は実在のものに限る
  const LINK_HOOKS = new Set([
    "combat.attack",
    "combat.hit",
    "combat.crit",
    "combat.evade",
    "combat.defend",
    "combat.flee",
    "combat.enemyPower",
    "beast.attack",
    "beast.exp",
    "sleep.quality",
    "death.keep",
    "work.price",
    "work.exp",
    "travel.gain",
    "read.gain",
    "read.potential",
    "crisis.contrib",
    "mentor.fee",
    /** P-02：人と過ごす行動の定数経験（口添え・弁舌が育つ） */
    "social.gain",
    /** P-02：賭け事の勝率に賭けの技能が効く係数フック */
    "gamble.win",
  ]);
  const linkCoeffSkills = new Set<string>();
  const linkFlatSkills = new Set<string>();
  const bad: string[] = [];
  for (const [hook, def] of Object.entries(balanceRaw.links ?? {})) {
    if (!LINK_HOOKS.has(hook)) bad.push(`balance.links: 未定義のフック ${hook}`);
    for (const k of Object.keys(def.skills ?? {})) {
      if (!skillIds.has(k)) bad.push(`balance.links ${hook}: 未定義の技能 ${k}`);
      if (hook.endsWith(".gain") || hook === "beast.exp") linkFlatSkills.add(k);
      else linkCoeffSkills.add(k);
    }
  }

  const actionSkills = new Set(
    [...orderKinds, ...mentorSkills, ...incidentGains, ...weaponSkills, ...linkFlatSkills].filter(
      (x): x is string => x !== undefined,
    ),
  );
  const effectSkills = new Set(
    [
      ...orderKinds,
      ...weaponSkills,
      ...linkCoeffSkills,
      ...condSkills,
      ...effectKeys,
      ...placeKinds,
      ...roleSkills,
      ...weatherKinds,
      ...vesselSkills,
      ...tailwindSkills,
    ].filter((x): x is string => x !== undefined),
  );

  for (const s of skillsRaw.skills ?? []) {
    const id = s.id ?? "?";
    if (!actionSkills.has(id))
      bad.push(`技能 ${id}: 伸ばす行動が無い（注文/師匠/出来事/武器/定数リンク）`);
    if (!effectSkills.has(id))
      bad.push(`技能 ${id}: 効く場面が無い（注文/武器/係数リンク/条件/効果キー）`);
  }
  if (bad.length > 0) {
    console.error(`✗ 技能と世界の結線が足りない:\n  ${bad.join("\n  ")}`);
    failed = true;
  } else {
    console.log(`✓ 技能と世界の結線（${skillIds.size}技能に行動+効果）`);
  }
} catch (e) {
  console.error(`✗ 技能と世界の結線の検査に失敗 (${String(e)})`);
  failed = true;
}

// 音の割り当ての突き合わせ（S-01）：audio.json の assign が指す場所 id・
// 情景キー・天候 id が実在すること（曲・環境音 id の存在はスキーマ側で検証済み）
try {
  const placesRaw = JSON.parse(readFileSync(join(root, "places.json"), "utf8")) as {
    places?: { id?: string; scene?: string }[];
  };
  const weatherRaw = JSON.parse(readFileSync(join(root, "weather.json"), "utf8")) as {
    kinds?: { id?: string }[];
  };
  const audioRaw = JSON.parse(readFileSync(join(root, "audio.json"), "utf8")) as {
    assign?: {
      bgm?: { places?: Record<string, unknown> };
      ambient?: {
        places?: Record<string, unknown>;
        scenes?: Record<string, unknown>;
        weather?: Record<string, unknown>;
      };
    };
  };
  const placeIds = new Set((placesRaw.places ?? []).map((p) => p.id));
  // 情景キー = places.json の scene に加え、場所に縛られない固定情景
  // （dawn/night/desk/plain。apps/web の SceneKind と対になる）
  const sceneIds = new Set([
    ...(placesRaw.places ?? []).map((p) => p.scene),
    "town",
    "dawn",
    "night",
    "desk",
    "plain",
  ]);
  const weatherIds = new Set((weatherRaw.kinds ?? []).map((k) => k.id));
  const bad: string[] = [];
  for (const key of Object.keys(audioRaw.assign?.bgm?.places ?? {})) {
    if (!placeIds.has(key)) bad.push(`bgm.places: 場所 ${key}`);
  }
  for (const key of Object.keys(audioRaw.assign?.ambient?.places ?? {})) {
    if (!placeIds.has(key)) bad.push(`ambient.places: 場所 ${key}`);
  }
  for (const key of Object.keys(audioRaw.assign?.ambient?.scenes ?? {})) {
    if (!sceneIds.has(key)) bad.push(`ambient.scenes: 情景 ${key}`);
  }
  for (const key of Object.keys(audioRaw.assign?.ambient?.weather ?? {})) {
    if (!weatherIds.has(key)) bad.push(`ambient.weather: 天候 ${key}`);
  }
  if (bad.length > 0) {
    console.error(`✗ 音の割り当てが未定義のキーを指す: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 音の割り当て（audio ↔ places/weather）");
  }
} catch (e) {
  console.error(`✗ 音の割り当ての突き合わせに失敗 (${String(e)})`);
  failed = true;
}

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

// 日々の営みの参照突き合わせ（P-02）：life.json が指す品物・技能・NPC・
// アトム・町・場所が実在すること。場所の行動（gather 行動には採集表、
// journey 行動には道、town 属性には町）も life.json と揃っていること
try {
  const lifeRaw = JSON.parse(readFileSync(join(root, "life.json"), "utf8")) as {
    towns?: Record<string, { name?: string }>;
    journeys?: { from?: string; to?: string; days?: number }[];
    stroll?: Record<
      string,
      {
        npc?: string;
        atom?: string;
        gain?: { skill?: string };
        items?: Record<string, number>;
        flag?: string;
      }[]
    >;
    gather?: Record<string, { skill?: string; entries?: { item?: string; weather?: string[] }[] }>;
    recipes?: { id?: string; inputs?: Record<string, number>; out?: string; skill?: string }[];
    market?: {
      stock?: { id?: string; towns?: string[] }[];
      townFactor?: Record<string, Record<string, number>>;
    };
    errands?: {
      id?: string;
      town?: string;
      need?: Record<string, number>;
      reward?: {
        bond?: { npc?: string };
        gain?: { skill?: string };
        items?: Record<string, number>;
      };
    }[];
  };
  const itemsRaw = JSON.parse(readFileSync(join(root, "items.json"), "utf8")) as {
    items?: { id?: string; kind?: string }[];
  };
  const placesRaw = JSON.parse(readFileSync(join(root, "places.json"), "utf8")) as {
    places?: { id?: string; town?: string; actions?: { type?: string; to?: string }[] }[];
  };
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const voicesRaw = JSON.parse(readFileSync(join(root, "voices.json"), "utf8")) as {
    npcs?: { id?: string }[];
  };
  const ordersRaw = JSON.parse(readFileSync(join(root, "orders.json"), "utf8")) as {
    orders?: { id?: string; town?: string }[];
  };
  const weatherRaw = JSON.parse(readFileSync(join(root, "weather.json"), "utf8")) as {
    kinds?: { id?: string }[];
  };
  const atomIds = new Set(
    (readdirSync(join(root, "lore/atoms")) as string[])
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length)),
  );
  const townIds = new Set(Object.keys(lifeRaw.towns ?? {}));
  const itemIds = new Set((itemsRaw.items ?? []).map((i) => i.id));
  const mealIds = new Set((itemsRaw.items ?? []).filter((i) => i.kind === "meal").map((i) => i.id));
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const npcIds = new Set((voicesRaw.npcs ?? []).map((n) => n.id));
  const weatherIds = new Set((weatherRaw.kinds ?? []).map((k) => k.id));
  const placeIds = new Set((placesRaw.places ?? []).map((p) => p.id));
  const bad: string[] = [];

  // 散策の表が指す品物・NPC・アトム・技能
  for (const [table, outcomes] of Object.entries(lifeRaw.stroll ?? {})) {
    for (const o of outcomes) {
      const label = `life.json stroll.${table}`;
      if (o.npc !== undefined && !npcIds.has(o.npc)) bad.push(`${label}: 未定義のNPC ${o.npc}`);
      if (o.atom !== undefined && !atomIds.has(o.atom)) {
        bad.push(`${label}: 未定義のアトム ${o.atom}`);
      }
      if (o.gain?.skill !== undefined && !skillIds.has(o.gain.skill)) {
        bad.push(`${label}: 未定義の技能 ${o.gain.skill}`);
      }
      for (const id of Object.keys(o.items ?? {})) {
        if (!itemIds.has(id)) bad.push(`${label}: 未定義の品物 ${id}`);
      }
    }
  }
  // 採集の表：キーは gather 行動のある場所、品物・技能・天候は実在するもの
  const gatherPlaces = new Set(
    (placesRaw.places ?? [])
      .filter((p) => (p.actions ?? []).some((a) => a.type === "gather"))
      .map((p) => p.id),
  );
  for (const [place, table] of Object.entries(lifeRaw.gather ?? {})) {
    const label = `life.json gather.${place}`;
    if (!placeIds.has(place)) bad.push(`${label}: 場所 ${place} が places.json に無い`);
    if (!gatherPlaces.has(place)) {
      bad.push(`${label}: 場所 ${place} に gather 行動がない（採集表が無駄になる）`);
    }
    if (table.skill !== undefined && !skillIds.has(table.skill)) {
      bad.push(`${label}: 未定義の技能 ${table.skill}`);
    }
    for (const e of table.entries ?? []) {
      if (e.item !== undefined && !itemIds.has(e.item)) {
        bad.push(`${label}: 未定義の品物 ${e.item}`);
      }
      for (const w of e.weather ?? []) {
        if (!weatherIds.has(w)) bad.push(`${label}: 未定義の天候 ${w}`);
      }
    }
  }
  for (const p of placesRaw.places ?? []) {
    if ((p.actions ?? []).some((a) => a.type === "gather") && !(p.id! in (lifeRaw.gather ?? {}))) {
      bad.push(`places.json ${p.id}: gather 行動があるのに採集表がない`);
    }
  }
  // レシピ：材料・仕上がりは実在の品物、仕上がりは meal、技能は実在
  for (const r of lifeRaw.recipes ?? []) {
    const label = `life.json recipes.${r.id ?? "?"}`;
    for (const id of Object.keys(r.inputs ?? {})) {
      if (!itemIds.has(id)) bad.push(`${label}: 未定義の材料 ${id}`);
    }
    if (r.out !== undefined && !mealIds.has(r.out)) {
      bad.push(`${label}: 仕上がり ${r.out} が items.json に無い（kind=meal でない）`);
    }
    if (r.skill !== undefined && !skillIds.has(r.skill)) {
      bad.push(`${label}: 未定義の技能 ${r.skill}`);
    }
  }
  // 市場：並ぶ品・町係数のキーは実在の品物・町
  for (const s of lifeRaw.market?.stock ?? []) {
    if (s.id !== undefined && !itemIds.has(s.id)) {
      bad.push(`life.json market.stock: 未定義の品物 ${s.id}`);
    }
    for (const t of s.towns ?? []) {
      if (!townIds.has(t)) bad.push(`life.json market.stock ${s.id}: 未定義の町 ${t}`);
    }
  }
  for (const [town, factors] of Object.entries(lifeRaw.market?.townFactor ?? {})) {
    if (!townIds.has(town)) bad.push(`life.json market.townFactor: 未定義の町 ${town}`);
    for (const id of Object.keys(factors)) {
      if (id !== "*" && !itemIds.has(id)) {
        bad.push(`life.json market.townFactor ${town}: 未定義の品物 ${id}`);
      }
    }
  }
  // 掲示板：町・品物・NPC・技能は実在するもの
  for (const e of lifeRaw.errands ?? []) {
    const label = `life.json errands.${e.id ?? "?"}`;
    if (e.town !== undefined && !townIds.has(e.town)) {
      bad.push(`${label}: 未定義の町 ${e.town}`);
    }
    for (const id of Object.keys(e.need ?? {})) {
      if (!itemIds.has(id)) bad.push(`${label}: 未定義の納品 ${id}`);
    }
    if (e.reward?.bond?.npc !== undefined && !npcIds.has(e.reward.bond.npc)) {
      bad.push(`${label}: 未定義のNPC ${e.reward.bond.npc}`);
    }
    if (e.reward?.gain?.skill !== undefined && !skillIds.has(e.reward.gain.skill)) {
      bad.push(`${label}: 未定義の技能 ${e.reward.gain.skill}`);
    }
    for (const id of Object.keys(e.reward?.items ?? {})) {
      if (!itemIds.has(id)) bad.push(`${label}: 未定義の報酬品 ${id}`);
    }
  }
  // 場所の町属性・旅の行き先は実在の町。journey 行動の行き先には道がある
  for (const p of placesRaw.places ?? []) {
    const label = `places.json ${p.id ?? "?"}`;
    if (p.town !== undefined && !townIds.has(p.town)) {
      bad.push(`${label}: 未定義の町 ${p.town}`);
    }
    for (const a of p.actions ?? []) {
      if (a.type === "journey") {
        if (a.to === undefined || !townIds.has(a.to)) {
          bad.push(`${label}: journey の行き先 ${a.to ?? "?"} が未定義の町`);
          continue;
        }
        const from = p.town ?? "ardi";
        const linked = (lifeRaw.journeys ?? []).some(
          (j) => (j.from === from && j.to === a.to) || (j.from === a.to && j.to === from),
        );
        if (!linked) {
          bad.push(`${label}: 町 ${from} から ${a.to} への道が life.json に無い`);
        }
      }
    }
  }
  // 注文の町属性は実在の町
  for (const o of ordersRaw.orders ?? []) {
    if (o.town !== undefined && !townIds.has(o.town)) {
      bad.push(`orders.json ${o.id ?? "?"}: 未定義の町 ${o.town}`);
    }
  }
  if (bad.length > 0) {
    console.error(`✗ 日々の営みの参照が不正: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ 日々の営みの参照（life/items ↔ places/skills/voices/atoms/weather）");
  }
} catch (e) {
  console.error(`✗ 日々の営みの突き合わせに失敗 (${String(e)})`);
  failed = true;
}

// 隠し要素ディレクトリは中身を検証しない（ネタバレ防止。docs/07_story.md §5）
// hidden/ が空でなければ警告だけ出す。K-03 の隠し要素はスキーマ適合だけ確認し、
// 中身（条件・技の名・件数の内訳）は出力しない
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
try {
  const k03Dir = join(root, "hidden", "k03");
  const names = readdirSync(k03Dir).filter((f) => f.endsWith(".json"));
  let ok = true;
  for (const name of names.sort()) {
    const parsed = k03FileSchema.safeParse(
      JSON.parse(readFileSync(join(k03Dir, name), "utf8")) as unknown,
    );
    if (!parsed.success) {
      console.error(`✗ hidden/k03/${name}: K-03 のスキーマに合いません`);
      ok = false;
      failed = true;
    }
  }
  if (ok && names.length > 0) console.log(`✓ hidden/k03/（${names.length} 件、スキーマ適合）`);
} catch {
  // hidden/k03 が無ければ無視
}

if (failed) {
  process.exit(1);
}
console.log("コンテンツのスキーマ検証: すべて合格");
