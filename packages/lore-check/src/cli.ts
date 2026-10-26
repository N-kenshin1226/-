import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { atomSchema, canonSchema, type Atom } from "@trace/content";
import { checkLore, type Issue } from "./index.js";

/**
 * pnpm lore:check — 物語アトムの検証CLI（docs/07_story.md §5）。
 * canon.json と lore/atoms/*.json を読み、zod検証・参照整合・
 * fact/rumor・文体lint・似文検出を行う。error があれば終了コード1
 */

const dir = join(dirname(fileURLToPath(import.meta.url)), "../../content/lore");
const issues: Issue[] = [];

// canon.json
const canonRaw = JSON.parse(readFileSync(join(dir, "canon.json"), "utf8"));
const canonParsed = canonSchema.safeParse(canonRaw);
if (!canonParsed.success) {
  console.error(`canon.json がスキーマ違反:\n${canonParsed.error.message}`);
  process.exit(1);
}
const canon = canonParsed.data;

// atoms/*.json（zod違反はそのファイルの error として記録し、他の検査は続ける）
const atoms: { file: string; atom: Atom }[] = [];
for (const file of readdirSync(join(dir, "atoms"))
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(join(dir, "atoms", file), "utf8"));
  } catch (e) {
    issues.push({ file, level: "error", message: `JSONパース失敗: ${(e as Error).message}` });
    continue;
  }
  const parsed = atomSchema.safeParse(json);
  if (!parsed.success) {
    issues.push({
      file,
      level: "error",
      message: `スキーマ違反: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / ")}`,
    });
    continue;
  }
  atoms.push({ file, atom: parsed.data });
}

issues.push(...checkLore({ canon, atoms }));

for (const i of issues) {
  const mark = i.level === "error" ? "✗" : "△";
  console.log(`${mark} [${i.file}] ${i.message}`);
}
const errors = issues.filter((i) => i.level === "error").length;
const warns = issues.filter((i) => i.level === "warn").length;
console.log(
  errors === 0
    ? `\n✓ lore:check 合格（アトム ${atoms.length}件、警告 ${warns}件）`
    : `\n✗ lore:check 不合格（error ${errors}件、警告 ${warns}件）`,
);
process.exit(errors === 0 ? 0 : 1);
