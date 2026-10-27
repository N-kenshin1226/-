import { defineConfig } from "@playwright/test";
import { basename, resolve } from "node:path";

// worktree 並走で preview が同じポートを取り合うと、別ブランチのビルドを
// 配っているサーバーを reuseExistingServer で拾って誤判定する。
// チェックアウト名（TRACE / TRACE-f04 …）でポートをずらして共存させる。
const rootName = basename(resolve(import.meta.dirname, "../.."));
const PORT =
  4173 +
  (rootName === "TRACE" ? 0 : 1 + ([...rootName].reduce((a, c) => a + c.charCodeAt(0), 0) % 30));

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `pnpm run preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
