import { z } from "zod";
import hiddenRaw from "../hidden/landmarks.json";
import { landmarkSchema } from "./world.schema.js";

/**
 * 名所の母集団（X-25、docs/10 §3「手作りの特別な場所」）。
 * 中身は hidden/landmarks.json —— ここではスキーマ適合だけを扱い、
 * 検証メッセージにも中身を出さない
 */
const hiddenSchema = z
  .object({ version: z.number().int(), landmarks: z.array(landmarkSchema).min(1) })
  .strict();
const parsed = hiddenSchema.safeParse(hiddenRaw);
if (!parsed.success) {
  throw new Error("hidden/landmarks.json が名所のスキーマに合いません");
}
export const bundledLandmarks = parsed.data.landmarks;
