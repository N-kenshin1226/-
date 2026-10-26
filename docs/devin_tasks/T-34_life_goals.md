# T-34 人生目標カタログの拡充 — done

仕様: `docs/03_world_systems.md` §1（人生目標）。

## 実装
- `society.json` の `lifeGoals` を 4 → **15件**に拡充
  - 技能系：`goal.smith_30`（鍛冶30）／`goal.forge_best3`（鍛冶作品ティア3）／`goal.body_endurance`（持久20、stat条件）
  - 社会系：`goal.citizen`／`goal.smith_cert`／`goal.adventurer`（`society.offer.<id>` カウンタで受諾を検出）
  - 探索系：`goal.forest_clear`（森3種・and）／`goal.highway_threat`（追い剥ぎ or 脱走兵・or）
  - 収集系：`goal.ledger_10`（台帳10件・work count）／`goal.read_3`（アトム3篇・action.read）
  - 見聞系：`goal.old_forge`（flag `found.old_forge`。place.old_forge アトムの unlock で立つ）
- `events/index.ts`：`offerAccepted` で `society.offer.<id>` カウンタをインクリメント。
  条件DSLは `state.society` を読めないため、立場到達・職業認定の目標に必要な最小変更（GameState 不変・セーブ据置）
- `society/index.ts`：`suggestGoals` の近さ採点を stat/flag/work/within/time に拡張
  （旧は counter/skill のみで、新目標の半数が永遠に提案されなかったため）
- `simReachable`（titles と同じ規約）を lifeGoal に追加。`sim:growth` に
  「人生目標の到達可能性」ゲートを追加（各ボット最終状態で条件評価 → 3/3 到達）
- 目標変更ペナルティ：仕様は「ペナルティは軽い」のみ → **未実装**。仮案を DECISIONS.md D-26 に記録
  （「取り下げた日は再宣言不可」案。実装時は counters 利用でセーブ据置可能）

## 受け入れ基準
- [x] 各目標が条件DSLで検証される・達成報酬が出る（content/src/society.test.ts：全目標の偽→真評価＋矛盾検査）
- [x] sim で到達可能な目標が増える（sim:growth にゲート追加。訓練系 3/3、対象外12件は simReachable:false で明示）

## 残課題・確認事項
- 新聞に「目標達成」の言及プールは無い（goalAchieved はシステムメッセージのみ。打診・称号は新聞行あり）
- 達成通知はランク制（S/A/B）の外：宣言目標の達成はイベント行として表示（offerReceived と同じ扱い）
- 既セーブで立場が citizen 以上の周は `society.offer.*` 系目標が取れない（カウンタは受諾時のみ進む）
