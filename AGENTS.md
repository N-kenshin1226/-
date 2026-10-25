# AGENTS.md — AIエージェント（Devin等）向け作業ルール

## 最初に読むもの
1. `docs/01_concept.md`：4本柱（P1〜P4）。判断に迷ったらこれに従う
2. タスクで指定された docs の節

## 絶対ルール
- `packages/core` は DOM・ブラウザAPI・React に依存しない。`Math.random()` と `Date.now()` は禁止（`rng/` と `time/` を使う）
- ゲームの数値はコードに直書きせず、`packages/content/balance.json` に置く
- ゲームルールは `apps/web` に書かない。UIは `core` を呼ぶだけ
- 新しいコンテンツ（JSON）には zod スキーマを用意し、`pnpm check` で検証する
- `GameState` の形を変えたら、セーブのバージョンを上げて移行関数とテストを書く
- 仕様と実装が食い違う場合は、勝手に決めずにPRで指摘する。仕様の変更は docs を先に更新する

## 完了の定義
- [ ] `pnpm check`（lint、型、テスト、スキーマ、ビルド）が通る
- [ ] 追加したロジックにユニットテストがある（乱数はシードで固定）
- [ ] UIを変更した場合は Playwright のスクリーンショットをPRに添付する
- [ ] バランスに関わる変更では `pnpm sim:growth` の結果の要約をPRに貼る

## 文体（ゲーム内テキスト）
- システムメッセージ：「――」「《》」を使う、淡々とした機械的な口調
  例：`――条件を満たしました。スキル《見切り》を獲得しました。`
- 掲示板：NPCごとの口調テンプレートに従う（`packages/content/board/voices.json`）
