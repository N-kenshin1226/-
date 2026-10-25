/**
 * @trace/sim の CLI エントリ。
 * sim:growth / sim:retention（T-09）と play:cli（T-11）は未実装。
 */
const command = process.argv[2] ?? "";

const implemented = new Set<string>([]);

if (!implemented.has(command)) {
  console.log(`[sim] ${command || "(コマンド未指定)"} は未実装です`);
  process.exit(0);
}
