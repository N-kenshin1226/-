import raw from "../text/narration.json";
import hiddenRaw from "../hidden/narration.json";
import {
  hiddenCrisisNarrationSchema,
  narrationSchema,
  type NarrationText,
} from "./narration.schema.js";

const parsed = narrationSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`text/narration.json がスキーマ違反: ${parsed.error.message}`);
}
const hiddenParsed = hiddenCrisisNarrationSchema.safeParse(hiddenRaw);
if (!hiddenParsed.success) {
  throw new Error("hidden/narration.json が語りのスキーマに合いません");
}

/**
 * 語り（公開分に hidden/narration.json の危機の語りを crisis 節へ深くマージしたもの。
 * ブラウザでも動くよう hidden 側も静的 import —— 中身はここでは読まず、件数も出さない）
 */
export const narration: NarrationText = {
  ...parsed.data,
  crisis: {
    ...parsed.data.crisis,
    vars: { ...parsed.data.crisis.vars, ...hiddenParsed.data.vars },
    stage: { ...parsed.data.crisis.stage, ...hiddenParsed.data.stage },
    finale: { ...parsed.data.crisis.finale, ...hiddenParsed.data.finale },
  },
};
