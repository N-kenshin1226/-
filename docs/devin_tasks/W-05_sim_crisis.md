## タスク: [W-05] 危機のバランスCIゲート

### やること
- `pnpm sim:crisis`：`docs/08_world_crisis.md` §8 の6指標を判定し、割ったら非ゼロで終了。`pnpm check` から呼ぶ
- ボット4種（戦闘型・職人型・商人型・人脈型）。既存のボットを拡張してよい
- 指標の閾値は `packages/sim/thresholds.json` に置く。**閾値を緩めて合格させない**（balance.json や危機の型の数値で合わせる）
- hidden の危機の型があるときはそれも対象にする（結果は合否と数値だけ出し、中身は出力しない）

### 受け入れ基準
- [ ] 意図的に壊したデータ（道が1つしかない鍵など）でCIが落ちることを確認した
- [ ] 公開サンプルで全指標が合格

### 共通
- 仕様は **`docs/08_world_crisis.md`** が正。`AGENTS.md` の絶対ルールと完了の定義を守る
- 数値は `balance.json`、データは zod スキーマ付きの JSON
- テストは公開サンプル（`packages/content/crises/sample.json`）で書く。**`packages/content/hidden/` の中身を読んだり、PRの説明・コミットメッセージ・報告に書いたりしない**（読み込む仕組みだけ作る）
- PRの説明に「判断ログ」節

### PR
- タイトル：`W-05: 危機のバランスCIゲート`
