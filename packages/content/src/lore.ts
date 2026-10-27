import canonJson from "../lore/canon.json";
// アトムは lore/atoms/*.json に1ファイルずつ置く（07 §5 の生成パイプライン）。
// ここに静的importを1行足すのが登録方法（ブラウザでも動くよう fs は使わない）
import atom1 from "../lore/atoms/item.rusted_hammer.json";
import atom2 from "../lore/atoms/npc.marta_board.json";
import atom3 from "../lore/atoms/place.old_forge.json";
import atom4 from "../lore/atoms/rumor.fire_drunkard.json";
import atom5 from "../lore/atoms/rumor.taboo_codex.json";
import atom6 from "../lore/atoms/rumor.merchant_king.json";
import atom7 from "../lore/atoms/rumor.lord.json";
import atom8 from "../lore/atoms/place.snow_hermit.json";
import atom9 from "../lore/atoms/place.moon_bell.json";
import atom10 from "../lore/atoms/place.night_market.json";
import atom11 from "../lore/atoms/place.rain_well.json";
import { atomSchema, type Atom } from "./atom.schema.js";
import { canonSchema, type Canon } from "./canon.schema.js";

/** 正史（骨格。細部・結末は hidden/ に隔離する） */
export const canon: Canon = (() => {
  const parsed = canonSchema.safeParse(canonJson);
  if (!parsed.success) throw new Error(`canon.json がスキーマ違反: ${parsed.error.message}`);
  return parsed.data;
})();

const atomRaws = [atom1, atom2, atom3, atom4, atom5, atom6, atom7, atom8, atom9, atom10, atom11];

/** アトム全件。id の重複などは lore:check が別途検査する */
export const atoms: Atom[] = atomRaws.map((raw, i) => {
  const parsed = atomSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(`atoms[${i}] がアトムのスキーマ違反: ${parsed.error.message}`);
  return parsed.data;
});

/** 正史が持つ参照可能なID全体（アトムの refs が指せるのはこれだけ） */
export function canonIds(c: Canon): Set<string> {
  return new Set([
    ...c.events.map((e) => e.id),
    ...c.places.map((p) => p.id),
    ...c.figures.map((f) => f.id),
    ...c.facts.map((f) => f.id),
  ]);
}
