import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { atomSchema, type Atom } from "./atom.schema.js";
import { canonSchema, type Canon } from "./canon.schema.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../lore");

/** 正史（骨格。細部・結末は hidden/ に隔離する） */
export const canon: Canon = (() => {
  const parsed = canonSchema.safeParse(JSON.parse(readFileSync(join(dir, "canon.json"), "utf8")));
  if (!parsed.success) throw new Error(`canon.json がスキーマ違反: ${parsed.error.message}`);
  return parsed.data;
})();

/** アトム全件（lore/atoms/*.json）。id の重複は検証時に別途検査する */
export const atoms: Atom[] = (() => {
  const out: Atom[] = [];
  for (const f of readdirSync(join(dir, "atoms"))
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const parsed = atomSchema.safeParse(JSON.parse(readFileSync(join(dir, "atoms", f), "utf8")));
    if (!parsed.success) throw new Error(`${f} がアトムのスキーマ違反: ${parsed.error.message}`);
    out.push(parsed.data);
  }
  return out;
})();

/** 正史が持つ参照可能なID全体（アトムの refs が指せるのはこれだけ） */
export function canonIds(c: Canon): Set<string> {
  return new Set([
    ...c.events.map((e) => e.id),
    ...c.places.map((p) => p.id),
    ...c.figures.map((f) => f.id),
    ...c.facts.map((f) => f.id),
  ]);
}
