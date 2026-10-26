# T-43 無限深層ダンジョン — done

仕様: docs/06_endgame.md §3B（時間制限＋自己ベスト。Diablo3 Greater Rift 参考）。

## やったこと
- `core/abyss/`：`AbyssRun`（層・灯り・撃破列・終わり方）を一時状態として管理。敵列は `abyssRunSeed(world, 回目) = "<seed>:abyss:<n>"` × 層で決定論抽選、強化は係数生成（T-44 と同じ方針：HP・技威力・挑戦差に倍率、敏捷に加算、パターン維持）
- 時間制限は「灯り＝プレイヤー行動の残数」（`balance.abyss.maxTurns`）。層タイマーではなく行動数方式を採用（D-35）
- 記録は counters（`abyss.best`/`abyss.runs`/`abyss.floors`）＋ `abyssEnded` イベント（通知Aランク相当、newBest 付き）。GameState 不変＝セーブ v15 据置
- step の `{type:"abyss"}` コマンドがランをまとめて世界に反映：潜行1回=1行動、層ごとの撃破は kind combat + variant abyss（失敗層は loss で失敗経験）、死は died 扱い
- 入口は街メニュー「12) 深層に潜る」（Web は「深層に潜る」ボタン）。途中離脱は層の合間の「引き返す」と戦闘中の「逃げる」
- 自己ベストは街の記録画面（CLI・Web）に表示

## 受け入れ基準
- [x] 決定論：同じシードで同じ敵列（abyss.test.ts）
- [x] 自己ベストが更新されると記録される（abyssEnded.newBest + counters、記録画面に表示）
- [x] 逃走・死亡でランが終わる（fled/died/light/retreat の4終了形）
- [x] Webで1層進める e2e（smoke.spec.ts）
