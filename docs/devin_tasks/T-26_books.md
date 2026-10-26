# T-26 書物 — done

仕様: `docs/02_growth_system.md`（素質回復・M項の書物係数）。

## やったこと
- `packages/content/books.json`（5冊）＋ `books.schema.ts`（zod）＋ loader。validate.ts で gainVs/potentialRecover/priceVs はスキルID、damageVs は敵ID と突き合わせ
- コマンド `buyBook`（行動を消費しない購入）と `readBook`（1行動の読書）。アトム `readAtom` とは別系統
- 効果は T-35 語彙 `effect`（gainVs→M項、damageVs→与ダメージ）を `durationDays` 日だけ有効にする期間効果＋読了時の `potentialRecover`（potentialCap/potentialMax で頭打ち）＋知識 `flag`
- 入手経路は書店《古紙堂》での購入（money）。lore 連携は行わず（D-27）
- `GameState.books{owned,read[{id,day}]}` を追加。セーブ v10→v11 移行＋テスト
- CLI「9) 書店」（行動残なし時は 5)）、Web「書店」画面（購入/読むボタン）

## 受け入れ基準
- [x] 書物を読むと効果が適用される（gainVs/damageVs は期間効果、素質回復・フラグは即時・永続）
- [x] GameState 変更 → セーブ v11＋移行テスト（state.test.ts）

## メモ
- 所持モデルはメモの案とは別に「所持(owned)と読了(read+day)を分ける」形にした。読了は初回のみ有効（再読は不可）
- 期間効果は `books.read` の読了日から派生（別枠の効果リストを持たず、activeBookEffects でその都度計算）
