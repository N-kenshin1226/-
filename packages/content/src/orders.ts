import raw from "../orders.json";
import { ordersFileSchema, type OrdersFile } from "./orders.schema.js";

const parsed = ordersFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`orders.json がスキーマ違反: ${parsed.error.message}`);
}
export const orders: OrdersFile = parsed.data;
