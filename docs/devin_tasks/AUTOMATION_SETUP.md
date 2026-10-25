# 夜間自走のセットアップ（オーナー作業）

## 仕組み

```
毎晩 1:00（日本時間）  Devin Automations のスケジュール起動
   ↓ Skill「nightly-run」（.agents/skills/nightly-run/SKILL.md）
QUEUE.md から次のタスク → 実装 → PR → CI（pnpm check ＋ バランスCIゲート）
   ├ 緑：auto-merge → QUEUE を done に → 次のタスク（1晩最大4本）
   └ 赤：最大3回修正 → ダメなら blocked にして依存しないタスクへ
   ↓
朝：docs/reports/YYYY-MM-DD.md に報告
```

- 守りは「CIが緑でなければマージされない」こと。だから **T-09（バランスCIゲート）までは成長の数値の質を機械で守れない** 点に注意（T-01〜T-08 はユニットテストだけが守り）
- 自走は H-01（あなたがCLIで遊ぶ）で止まる

## 手順

### 1. GitHub（初回だけ）
1. `main` ブランチを作る：このブランチ（`claude/vibrant-keller-3yfoi4`）のPRを作ってマージする（または、このブランチから `main` を作る）
2. Settings → General：
   - Default branch を `main` にする
   - **Allow auto-merge** をオン
   - **Automatically delete head branches** をオン
   - リポジトリの説明文を更新する（今は以前のキャンフェスのサイトの説明のまま）
3. Settings → Branches（または Rules → Rulesets）で `main` を保護する：
   - Require a pull request before merging（承認数は **0**：承認を必須にすると夜間に止まる）
   - Require status checks to pass → `check`（**T-01 のCIが一度走った後でないと選択肢に出ない**）
   - Do not allow bypassing（自分も含めて直接pushを禁止）

> GitHub Free では、auto-merge とブランチ保護が使えるのは **公開リポジトリだけ**（非公開にする場合は GitHub Pro が必要）。
> 公開リポジトリなので、**APIキーなどのシークレットは絶対にコミットしない**。Gemini のキーは M2 以降に Cloudflare の環境変数へ入れる。

### 2. T-01 だけは起きている間に回す
T-01 でCIが作られるまで、ブランチ保護に必須チェックを設定できない。
1. Devin に「`nightly-run` スキルに従って、T-01 だけ実行して」と頼む
2. マージされたら、手順1-3 の必須チェック `check` を設定する

### 3. Devin の Automations を作る
- トリガー：Schedule、cron `0 16 * * *`（UTC保存。日本時間の 1:00）
- リポジトリ：`N-kenshin1226/-`
- 1回あたりの使用量の上限を設定する（初回は控えめに。様子を見て上げる）
- プロンプト：

```
nightly-run スキル（.agents/skills/nightly-run/SKILL.md）に従って、今夜の自走を実行してください。
オーナーは寝ているので質問しないでください。判断に迷ったらスキルの §4 に従い、最後に §5 の報告を必ず書いてください。
```

### 4. 朝やること
- `docs/reports/` の最新の報告を読む（「オーナーに確認してほしいこと」だけでよい）
- `blocked` があれば、理由を読んで指示を出すか、`QUEUE.md` を直す

## 未確認の点（Devinの公式ドキュメントで確認できなかったこと）
- Pro/Max プランの1日・1週間の使用量の枠と、上限に達したときの挙動（夜の途中で止まる可能性がある）
- セッションが「ユーザー待ち」で止まるのを確実に防ぐ設定。スキルとプロンプトで「質問しない」と明示して対策している
- 最初の数晩は、朝にセッションの記録を見て、止まっていないか確認するのがおすすめ
