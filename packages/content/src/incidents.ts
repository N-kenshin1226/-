import raw from "../incidents.json";
import { incidentsFileSchema, type IncidentsFile } from "./incidents.schema.js";

const parsed = incidentsFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`incidents.json がスキーマ違反: ${parsed.error.message}`);
}
export const incidents: IncidentsFile = parsed.data;
