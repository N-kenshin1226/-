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

// スキルキーの突き合わせ：origins.json の affinity は skills.json の id に存在するものだけ
try {
  const skillsRaw = JSON.parse(readFileSync(join(root, "skills.json"), "utf8")) as {
    skills?: { id?: string }[];
  };
  const skillIds = new Set((skillsRaw.skills ?? []).map((s) => s.id));
  const originsRaw = JSON.parse(readFileSync(join(root, "origins.json"), "utf8")) as {
    origins?: { id?: string; affinity?: Record<string, unknown> }[];
  };
  const bad: string[] = [];
  for (const o of originsRaw.origins ?? []) {
    for (const key of Object.keys(o.affinity ?? {})) {
      if (!skillIds.has(key)) bad.push(`origins.json ${o.id ?? "?"}: スキル ${key}`);
    }
  }
  if (bad.length > 0) {
    console.error(`✗ affinity キーが skills.json に無い: ${bad.join(", ")}`);
    failed = true;
  } else {
    console.log("✓ affinity キー（origins ↔ skills）");
  }
} catch (e) {
  console.error(`✗ affinity キーの突き合わせに失敗 (${String(e)})`);
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
