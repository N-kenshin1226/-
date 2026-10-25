/**
 * pnpm check:content — packages/content 配下のJSONを zod スキーマで検証する。
 * 新しいコンテンツJSONを追加したら、ここに検証対象を登録する。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { balanceSchema } from "./balance.schema.js";
import { skillsFileSchema } from "./skills.schema.js";

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
