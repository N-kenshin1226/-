import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ordersFileSchema, type OrdersFile } from "./orders.schema.js";

const path = join(dirname(fileURLToPath(import.meta.url)), "../orders.json");
const parsed = ordersFileSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
if (!parsed.success) {
  throw new Error(`orders.json がスキーマ違反: ${parsed.error.message}`);
}
export const orders: OrdersFile = parsed.data;
