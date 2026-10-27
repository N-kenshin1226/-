## タスク: [X-13] 天候 —— 日替わりの空が、注文と発見と街の風景を変える

### やること（仕様 `docs/03_world_systems.md`）
- §2「日替わりの要因（天候・相場・客の機嫌）は**2つまで**」
- §5「隠し要素は、時刻・天候・月齢・状態・所持品の組み合わせで出る」
- 現状: 天候システムが存在しない。X-11 の隠し発見で「天候」は語彙外として除外済み（DECISIONS D-43）。このチケットで語彙に入れる

### 実装
- `packages/content/weather.json` + zod スキーマ（`check:content` に載せる）:
  - `kinds`: 空の種類 `{ id, name, seasonWeights: number[] }`（例: `clear`/`cloud`/`rain`/`snow` 程度。雪は冬だけ、など季節で重みが変わる）
  - 各種の**風景の行**（起床レポート・新聞・噂で使う1行の語彙。文体は voices.json の系統に揃える）
- `packages/core/src/weather/index.ts`:
  - `weatherOf(seed, day, cfg) → Weather`：**世界シード由来の独立した乱数列**で決定（`createRng(seed)` + `fork("weather:<day>")` 方式。occasions/discoveries と同じ原則 —— `state.rng` は消費しない）
  - 季節ごとの重みで抽選（daysPerSeason 等は TimeConfig から）
- 条件DSL に `{ weather: string | string[] }` を追加（id の集合一致。スキーマ側も）
- ゲーム内への効き方（§2 の「2つまで」の枠内。最小限に保つ）:
  - **注文の日替わり要因として天候を1枠追加**：天候によって注文の単価係数か条件が微変する（例: 雨の日は採掘系の注文が渋い、晴れは渡航系…既存の order 生成経路を調べて「要因として1項」入れる。balance.json に係数）
  - **発見の条件語彙にする**：既存 discoveries に天候条件のものを1件追加するか、語彙として用意する（隠し要素 §5 の成立）
  - **風景として出す**：起床レポートの1行（「――今日の空は{weather}。」等のテンプレート追加。テキストは `cli.json`/`narration.json` 側のテンプレに集約）と、新聞・噂の差分語彙
- 街の風景・新聞への載せ方は W-04 の「間接的な表現」の系統に倣う（常時ステータス表示にしない —— 朝の一行・記事・噂で滲ませる）

### 境界
- `docs/devin_tasks/QUEUE.md` は触らない（親が更新）
- `packages/content/hidden/` は読まない・触らない
- GameState の形は変えない（天候は seed+day から導出するだけ。セーブ移行なし）
- `crisis/**`・`occasions/**`・`discoveries/**`・`npclife/**` の既存ロジックは壊さない
- `balance.json`/`cli.json`/`narration.json`/`voices.json` は追記のみ

### 受け入れ基準
- [ ] ユニットテスト（シード固定）：同じ世界・同じ日は同じ天候。state.rng を消費しない。季節で分布が変わる（雪は冬のみ等）。条件DSL `{weather}` が効く
- [ ] 雨（or 任意の1種）が条件の発見が「その天候の日にだけ」届くことのテスト
- [ ] 注文の日替わり要因に天候が1項乗ること（係数は balance.json）
- [ ] 起床レポートに天候の行が出る（テンプレート経由）
- [ ] `pnpm check` 全緑（sim:growth/retention/crisis 含む —— 経済係数を触るので）

### Commit
- `X-13: 天候 —— 日替わりの空が注文と発見を変える` + Devin-Trailer。push しない。
