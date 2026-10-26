## タスク: [T-22] 称号カタログを20個に（M1到達点）

### 目的
M1の到達点「称号20個」を満たす。既存8個に12個を追加し、B（習慣・初体験）〜A（継続の深み）〜S（頂点）の階段を作る。

### 読むもの
`docs/03_world_systems.md` §6〜§7、`docs/02_growth_system.md` §9（未達の条件は見せない）

### 作るもの
- `packages/content/titles.json` に12件追加（id/name/rank/hidden/condition/effect.note/message/simReachable）
- 条件は条件DSL（T-10）のみ。新しい条件種は追加しない
- 訓練ボットで到達できない条件（kill/work/read）は `simReachable: false`
- Sランクは1〜2件まで（Sは1日1件の通知予算）

### 受け入れ基準
- [ ] titles.json が20件
- [ ] `pnpm check` 緑（sim:growth の称号到達可能性を含む）
