import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { balanceSchema, type Balance } from "./balance.schema.js";

// balance.json はパッケージ直下に置く（docs 指定）。src/ と dist/ のどちらからでも
// ../balance.json で辿り着ける。
// TODO(M1): apps/web から使うときは fs 非依存の読み込み経路を別途用意する。
const here = dirname(fileURLToPath(import.meta.url));
const raw: unknown = JSON.parse(readFileSync(join(here, "../balance.json"), "utf8"));

const parsed = balanceSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`balance.json がスキーマ違反: ${parsed.error.message}`);
}

export const balance: Balance = parsed.data;
