import raw from "../balance.json";
import { balanceSchema, type Balance } from "./balance.schema.js";

const parsed = balanceSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`balance.json がスキーマ違反: ${parsed.error.message}`);
}
export const balance: Balance = parsed.data;
