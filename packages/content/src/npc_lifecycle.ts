import raw from "../npc_lifecycle.json";
import { npcLifecycleFileSchema, type NpcLifecycleFile } from "./npc_lifecycle.schema.js";

const parsed = npcLifecycleFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`npc_lifecycle.json がスキーマ違反: ${parsed.error.message}`);
}
export const npcLifecycle: NpcLifecycleFile = parsed.data;
