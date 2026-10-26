/**
 * @trace/sim の CLI エントリ。
 *   sim:growth    … 成長のバランスCIゲート（T-09）
 *   sim:retention … 初体験・作業化のCIゲート（T-09）
 *   play:cli      … 人間用 CLI（T-11。未実装）
 */
import { runGrowth } from "./sim-growth.js";
import { runRetention } from "./sim-retention.js";

const command = process.argv[2] ?? "";

switch (command) {
  case "sim:growth":
    process.exit(runGrowth());
    break;
  case "sim:retention":
    process.exit(runRetention());
    break;
  default:
    console.log(`[sim] ${command || "(コマンド未指定)"} は未実装です`);
    process.exit(command === "" ? 1 : 0);
}
