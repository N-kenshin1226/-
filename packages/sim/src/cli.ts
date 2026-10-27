/**
 * @trace/sim の CLI エントリ。
 *   sim:growth    … 成長のバランスCIゲート（T-09）
 *   sim:retention … 初体験・作業化のCIゲート（T-09）
 *   sim:crisis    … 世界の危機のバランスCIゲート（W-05、docs/08 §8）
 *   sim:arts      … 武技・資源・構成のバランスCIゲート（K-02、docs/09 §3・§5〜6）
 *   play:cli      … 人間用 CLI（T-11。未実装）
 */
import { runGrowth } from "./sim-growth.js";
import { runRetention } from "./sim-retention.js";
import { runCrisis } from "./sim-crisis.js";
import { runArts } from "./sim-arts.js";
import { playCli } from "./cli/game.js";
import { stdioIo } from "./cli/io.js";

const command = process.argv[2] ?? "";

switch (command) {
  case "sim:growth":
    process.exit(runGrowth());
    break;
  case "sim:retention":
    process.exit(runRetention());
    break;
  case "sim:crisis":
    process.exit(runCrisis());
    break;
  case "sim:arts":
    process.exit(runArts());
    break;
  case "play:cli": {
    const state = await playCli({ io: stdioIo() });
    process.exit(state ? 0 : 1);
    break;
  }
  default:
    console.log(`[sim] ${command || "(コマンド未指定)"} は未実装です`);
    process.exit(command === "" ? 1 : 0);
}
