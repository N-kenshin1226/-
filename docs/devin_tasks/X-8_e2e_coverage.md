# X-8 未カバー画面の e2e 追加 — todo

UI-01 で画面が全面更新されたが、e2e が無い画面・操作が残っている。
一度しか通らない導線（記録削除）と、見るだけの画面（能力・立場・書店・新聞）に
最小のカバレッジを足す。

## やること
1. `apps/web/e2e/screens.spec.ts` を新設し、以下を検証する:
   - **能力画面**: メニュー → `screen-status` が見える（技能行・タブ帯）
   - **立場画面**: `menu-society` → `screen-society` が見える（「目標と認定」）
   - **書店**: `menu-book` → `screen-book` が見える（書物項目 `book-*` が1件以上）
   - **新聞**: 睡眠 → 起床画面から `wake-news`（またはメニューの新聞）で `screen-news` が見える
   - **記録削除**: `menu-reset` → 確認窓（resetConfirm 文面）→ いいえで戻る／はいでセーブ消去＋タイトルへ戻る
   - **家で休む**: `menu-rest` が行動を消費して日が進む（ログまたは日付で確認）
2. **記録削除のバグ修正**: App.tsx の `resetSave` コールバックが React 状態しか
   消しておらず `localStorage`（`trace.save.v1`・`trace.chronicle.v1`）が残る
   → リロードで「消した」セーブが復活する。game.ts の resetSave に加えて
   年代記キーも消す関数を接続する（確認文面は「全ての記録を消します」）
3. 既存 spec を壊さない（共通の seed 手順は既存 spec と同じ形で）

## 受け入れ基準
- [ ] `pnpm run test:e2e` で新規 spec を含めて全緑
- [ ] 各画面の testid（`screen-*`）で実際に画面に出ていることを確認している
- [ ] 記録削除は「いいえで残る」→「はいで消える」の両経路を踏む
      （消去後にリロードしてもタイトルのまま＝localStorage からも消えている）

## 範囲
- 変更してよい: apps/web/e2e/
- QUEUE.md・docs/proposals/DECISIONS.md・docs/reports/ は統合時に親が更新
