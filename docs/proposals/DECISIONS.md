# 仮の決定一覧

夜間の自走中に、仕様になく判断が必要だった点を仮に決めて進めた記録。
**オーナーへの返事の仕方**：変更したい行に「→ 修正：…」と追記して push するだけ。
次の夜間自走がそれを読んで反映する。番号（D-XX）を変えないこと。

状態： `仮` = 自走の暫定判断／ `要確認` = オーナーの判断を特に聞きたい

| ID | 決定 | 理由 | 差し替え方 | 状態 |
|---|---|---|---|---|
| D-01 | 定着上限は「1スキルごと」に適用（全スキル合計の上限ではない） | まとめて動いた日が不当に損をするため。spec は対象を明記していない | `consolidate.ts` の `nightlyCapPerSkill` の適用位置を変える | 仮 |
| D-02 | 追い風の重みは「未着手ほど出やすい」（tailwindBoostK） | 仕様は逆風側の偏りだけ明記。追い風も偏りを崩す方向に寄せると「毎日最適な行動が変わる」目的に合致 | `balance.json` の `tailwind.tailwindBoostK` を 0 にすれば従来どおり一様 | 要確認 |
| D-03 | 休養日は「行動0回で眠る日」。コマンド種別（sleep/rest）ではなく行動数で判定 | 仕様は行動数で定義。sleep で0行動でも休養日になる | `step.ts` の `restDay` 判定式を変える | 要確認 |
| D-04 | `rest` は家で休む（宿・夕食を選ばない、質は `body.restQuality`=0.9 で固定） | 宿の選択と独立した「休む」概念が欲しいため。宿屋で休養日を取ることはできない | `balance.json` の値か、`rest` に inn/dinner を許可する形に変える | 要確認 |
| D-05 | 基礎能力の負荷プールは翌日に持ち越さない（スキル pending の持ち越しと非対称） | 身体は「その日動いた分」だけ回復する、という保守的解釈 | `body.ts` の `consolidateBody` で load のクリア方法を変える | 要確認 |
| D-06 | 条件 `within` は「直近N日に kind(×target) の行動が atLeast 回」に限定 | 汎用の「過去にcondが真」は履歴がない。actionLog ベースの具体形にした | `conditions/index.ts` の `within` 評価部を拡張する | 仮 |
| D-07 | 称号・認定職の `effect` を gain の M 項・与ダメージ・仕事報酬に接続済み（T-35）。語彙は `effects.schema.ts`（gainVs/damageVs/priceVs/note）で、効果の積は `effects/index.ts` | M1 接続時の約束どおり zod で具体化して接続 | `packages/core/src/effects/` と `step.ts` の M 項計算 | 仮 |
| D-08 | 条件の矛盾検査は「and 内の数値範囲の交差」のみ | 完全な到達可能性は T-09 のボットで担保する。not の内部は追わない | `conditions/check.ts` を拡張する | 仮 |
| D-09 | 素質の回復上限は `potentialMax`=100（balance 管理） | 出自による 80〜130 の幅は M2 で実装予定。今は一律100 | `balance.json` の `body.potentialMax` | 仮 |
| D-10 | 怪我リスクの上昇（オーバーワーク中）は未実装 | 怪我システム自体が仕様未策定 | 怪我の仕様が決まったら `body.ts` に追加 | 要確認 |
| D-11 | `GameState` の複製は JSON 往復（structuredClone 不使用） | core を DOM/node 型依存にしない。GameState はシリアライズ前提 | `step.ts` 先頭。性能問題になったら差し替え | 仮 |
| D-12 | 夜間は各タスクをローカル ff-merge で main に入れ、PR は事後に作らない | 深夜にCI待ちで止まるより、ローカル `pnpm check` 全緑をゲートにして進めるため | フローを変えるならタスクごとに PR + auto-merge に戻す | 要確認 |
| D-13 | 定着上限は「1スキルごと」＋「全スキル合計」の二段階（D-01 を改訂）。合計上限 `nightlyCapTotal` を追加 | T-09 のシムで「6スキル分散」が集中の1.7〜2.8倍に開き、spec の「方針間の差 1.3倍以内」を満たせなかった。1晩に吸収できる総量に上限を設けるのが素直な解決 | `balance.json` `sleep.nightlyCapTotal` を十分大きくすれば D-01 の単段階に戻る | 仮 |
| D-14 | T-09 の「単一ルーチン型」ボットは「主スキルに絞って最適難度の訓練を繰り返す」実装 | 逐次 gain 最大化の貪欲ボットは素質減衰で自然に全スキルを回り、「単一ルーチン」にならなかった。spec の「固定ルーチン」の意図は一点集中型 | `packages/sim/src/bots.ts` の `singleBot` | 仮 |
| D-15 | 新規性帯の評価は「行動を変える方針」のボットに限定（simple を除外） | 同じ行動を繰り返す縮退方針で初体験が出ないのは設計どおりの応答であり、供給側の欠陥ではない | `thresholds.json` の `bands[].bots` と `notes` | 仮 |
| D-16 | バランス調整：B(訓練)=3.6、良宿=1.5（qualityMax 1.8）、定着上限 3.0/合計1.7、素質減衰 0.005、逓減 base 170、訓練負荷 {str2,end2,dex2}・閾値25 | 主スキル 3h=36（帯25〜40）、方針差 1.19倍、簡易判定の経験効率 32% となる実測値に合わせた初回調整 | `balance.json` | 仮 |
| D-17 | `sim:growth` / `sim:retention` は `pnpm check` の test と build の間に挟む | シミュレーションはコンテンツ検証の後・ビルド前が依存として自然 | `package.json` の `check` | 仮 |
| D-18 | CLIの所持金は固定値50Gを表示するだけ（GameState に money はまだない） | チケットが「今は固定値」と明記。経済は M1 の作品台帳で実装 | `cli.json` の `display.fixedMoney` → GameState.player.money へ | 仮 |
| D-19 | `rest` も起床ログを表示する（場所は「自宅」、質は restQuality 固定） | rest は内部的に睡眠処理を通るため。宿名を出すと誤解を招くので homeName で分岐 | `render.ts` の `wakeBlock(atHome)` | 仮 |
| D-20 | セーブは眠ったときだけ `~/.trace/save.json` へ自動保存。中断(q)は日中の進行を保存しない | チケットの「寝るたびに自動保存」に忠実。日の途中の進行は捨てる（起床ログの手触り確認が目的の版） | `game.ts` の `save()` 呼び出し位置を変える | 仮 |
| D-21 | 難度の推奨値は「現在値+10」（C項の最大点）。空入力で推奨を採用 | challengePoints の頂点が Δ=+10。プレイヤーが毎回計算しなくてよいガイド | `game.ts` の `recommended` 式 | 仮 |
| D-22 | 行動を使い切った日は「寝る/休む/中断」だけのメニューに切替 | 残り0で訓練を選ばれても step が進まないため | `menuSleepOnly` の分岐 | 仮 |

### D-13: 通知予算の「1セッション」は1ゲーム日とする（T-18）
- 仕様：「1セッションにSは1回以下」。セッションの厳密な定義がないため「1日」とした
- 実装：GameState.notify{day,sToday,kehai[]}。sleepで日替わり時にリセット。セーブv6
- S予算超過の称号は suppressed フラグで格下げ表示（事実は記録される）
- 気配：S称号の数値条件の8割以上に近づくと「――何かが、噛み合いかけている。」（同じ称号は1日1回）
- タイトルの simReachable:false で訓練シム対象外を明示（戦闘・台帳条件など）

### D-23: 錆は「表示値」でなく値そのものに適用する（T-24）
- 仕様は「使っていないスキルは表示値が下がる」と書くが、表示だけ下げて内部値を残すと gain・条件DSL・戦闘補正が値ごとに食い違い、バグの温床になる
- 値そのものを下げ、床（peak×0.7）と再習得3倍で「取り戻す快感」を作る設計にした
- peak/lastUsedDay は既存フィールドのためセーブバージョン据え置き（v9 のまま）

### D-24: 新聞の死亡言及は「死亡歴>0」の通算カウンタで判断（T-32）
- GameState を変えず「昨日死んだか」は判定できないため、通算 death.count>0 の日に death 行をプールへ混入する代替。死亡直後だけ強く出したい場合は counters に `death.lastDay` 等が必要

### D-25: 出自による初期素質は base±15 の個人差＋affinity で 80〜130 にクランプ（T-25）
- 仕様の「80〜130%の幅」を「出自の基準値＋個人差±15＋得意分野affinity」の合成にした
- 回復上限は一律100ではなく「そのスキルの初期値」（potentialCap）。高素質スタートほど伸びしろが大きい
- 旧セーブは origin=origin.wanderer・potentialCap=100 に移行（当時の一律初期値を踏襲）

### D-26: 目標の差し替えペナルティは「取り下げた日は再宣言不可（翌日冷却）」を仮案として保留（T-34）
- 仕様は「途中で変えてもよい（ペナルティは軽い）」（03 §1）とだけあり、軽さの中身は未定義
- 仮案：abandonGoal した日は新しい目標を宣言できない。宣言に行動を消費しない設計のまま、変更に「一日待つ」最小の摩擦だけを乗せる
- 実装は見送り（仕様未策定のため）。実装するなら `counters["goal.lastAbandonDay"]` に冷却開始日を置く方式が GameState 不変で済む（セーブバージョン据置）。`society.goalAbandonedDay` を持たせる方式は要マイグレーション
- 代替案：ペナルティなし（現状維持）／宣言した目標の「気配」表示だけリセットする演出のみ

### D-27: 書物の入手経路は「書店での購入」とし、所持(owned)と読了(read)を分ける（T-26）
- 仕様は「購入（money）または lore アトムとの連携」とだけあり、具体的な導線は未定義
- 購入は行動を消費しない（認定の受諾と同じ扱い）。読むのは1行動（readAtom と同じ負荷種別 "read"）
- 効果は2層：`effect`（T-35語彙）は読了当日を含め `durationDays` 日だけ M項/与ダメージに効く期間効果、`potentialRecover` と `flag` は読了時に即時適用
- 期間効果の起算は `books.read[].day`（読んだ日）から派生し、別枠の効果リストは持たない（activeBookEffects で都度計算。GameState を小さく保つ）
- 読了は初回のみ（再読は何も起きない）。所持は一度買えば永続
- セーブ v10→v11 で `books{owned,read}` を追加（旧セーブは空の書物状態で移行）

### D-28: 師匠は同時1人・弟子入りは専用コマンド・効果は2層（T-27）
- 師匠は同時に**1人だけ**。乗り換えるには `leaveMentor` で門を出てから改めて弟子入りする（複数師匠の積み上げは M項上限 ×2.5 を容易に食い尽くすため、制約にした）
- 弟子入りは社会システムの打診（pendingOffers）とは**別枠組み**の `apprentice` コマンド。打診は「条件を満たすと向こうから来る受動的通知」、師匠は「条件を満たすNPCに自分から頼む能動的行動」なので、一覧表示＋ `canApprentice` 評価で十分と判断
- 効果は書物（D-27）と同じ2層構え：`effect`（T-35語彙）は弟子期間中ずっと有効（`activeEffects` の第4引数で接続）、稽古の `potentialRecover` は稽古ごとに即時適用（上限は potentialCap/potentialMax、書物・休養日と同じ規則）
- 素質回復は「週/定期」と「稽古ごと」のうち**稽古ごと**を選択：02 の「お金と日数がかかる」に合わせ、1行動＋礼金の `trainWithMentor` コマンドで回復する。稽古の gain は train と同じ式（挑戦係数の上限 0.6＝安全な練習）で、M項には弟子期間効果が乗る。actionLog の kind は "train"（新規性・追い風・`action.train` カウンタを共有しつつ、稽古回数は `mentor.session.<id>` で別途数える）
- `flag`（秘伝）は初回の稽古で永続的に立つ。ミニゲームのヒント解放の受け皿とし、エンジンへの配線は今後（条件DSLの flag で先に読める）
- `GameState.mentor: {id, sinceDay} | null` を追加（弟子期間の表示用に sinceDay だけ持つ）。セーブ v11→v12 で追加（旧セーブは師匠なし）
- 師匠NPCは canon figures の既存人物に割当（ガロ/フェン/ノラ/クム/エデル）＋ voices.json に口調差分を追加。`mentor.npc` ↔ canon.figures / voices.npcs の両方を validate で突合する

### D-29: 寿命は「startAge + lifespanYears」に達した朝の老衰死（一生に1回）・兆候は2段階＋末期の定期繰り返し（T-36）
- 仕様は「年齢上限または年齢で増える死亡確率」の2案を示す（06 §1、T-36 チケット）。仮実装は**年齢上限**を採用：`time.startAge + aging.lifespanYears` 歳に達した朝（sleep/rest 後）に老衰死。balance 初期値は lifespanYears=40（55歳＝day 4480）
- 兆候は**起床サプライズ**（WakeReport.surprises）に出す選択（新聞 rumor 行より先に、決定論で実装しやすい方）。寿命経過（経過年/lifespanYears）が signWarnAt(0.7) を超えた朝に弱い兆候1回、signSevereAt(0.9) を超えた朝から強い兆候を signEveryDays(28日＝1季節) ごとに繰り返す
- 発火の記録は GameState を変えず counters（`aging.signStage`＝最後に出した段階、`aging.signDay`＝最後に兆候を出した日、`death.oldAge`＝老衰死した日）に載せるため**セーブバージョン据置（v12）**
- 老衰死は T-40 接続まで「died と同じ処理」（death.count 加算・pending 半減・died 発行）としつつ、死因を区別する `deathByAge` イベントを別発行（指示どおり `oldAgeSign`/`deathByAge` を分離）。寿命到達後は `death.oldAge` で一度だけに抑制（T-40 で生そのものが終わるまでの暫定措置。再発を許すと毎朝死ぬ）
- 成長係数は「**終わる日**の年齢帯」で定着時に乗る：基礎能力は `consolidateBody` の statGainPerLoad 側に statFactor、スキルは `consolidateSleep` の定着量に skillFactor（pending の消費量・素質減衰・1晩上限は変えず、value の伸びだけが変わる）
- **若い帯の skillFactor は 1.0**（未満にしない）：訓練シム（sim:growth/retention は最大365日＝15〜18歳で常に第1帯）の基準値を変えずに済む。「歳を取るとスキルが伸びやすい」は高齢帯の上振り（1.15/1.25）で表現。若い帯の statFactor は 1.25（シムは stats を測らないため無影響）
- 通知ランク：老いの兆候は **A相当**（一生に数回＋末期は季節ごと。日次の通知予算には載せず、段階・間隔で自前に抑制）。老衰死は `died` と同格の構造イベント
- `aging` は StepConfig の**任意**節（books/mentors と同じ扱い）：未指定なら係数1・兆候なし・老衰なしで従来どおり。テスト用の最小 cfg に aging を必須化しないため

### D-30: 継承は「素質補正・記憶称号・遺物」の3項目だけ（T-39）
- 仕様どおり3項目に限定。素質補正は前世の各スキル `peak × potentialFactor(0.1)` を次周の素質%に加算（上限15%、`balance.legacy`）。potential と potentialCap の両方を底上げし、休養回復の上限も前世分だけ高い（「頂きは残る」感）
- 記憶称号は `state.titles` に直接入れる（称号効果 T-35 がそのまま効く＝「前世の記憶」としての実益）。`flags["memory.title.<id>"]` で「記憶由来」の表示区別用フラグを立てる。上限 rememberedMax=3、自動選択は上位ランク（S>A>B）→同ランクは後に獲得した方
- 遺物は台帳から1個。`state.legacy.artifact` に摘要（name/kind/quality/tier）を持ち、`activeEffects` 第5引数で同系統 `gainVs +5%`（`artifactGainFactor`）の小さい効果。フレーバー＋実益の中間の仮値
- `GameState.legacy` 追加でセーブ v12→v13（旧セーブは legacy=null で従来どおり）

### D-31: 老衰死は「教会蘇生しない」し引退は state を変えないイベント＋別枠の転生フロー（T-40）
- 06 §1「老衰だけは強制的な死」：戦闘死は教会蘇生（died で続行）だが、老衰死（deathByAge）は呼び出し側が**蘇生させず転生フローへ分岐**する。core の `agingOnWake` は内部処理を died と共有したまま `deathByAge` を別発行し、CLI（sleep/rest 分岐）と Web（act の分岐）がこれを見て年代記→継承→転生に進む。蘇生後に遊び続けられる道は残さない（Web は死んだセーブを再開しても転生画面から始まる再開ガードを持つ）
- 引退は `{type:"retire"}` コマンド＋ `retired` イベントだけ：行動・時間を消費せず state も不変（「いつでも選べる」）。伝記・年代記・継承・転生は呼び出し側の仕事 —— 転生は `newGame` で別の GameState に切り替わるため、step() に状態遷移を持ち込まない（原則2の純粋性維持）
- 次周のシードは `nextWorldSeed(state) = "<seed>:next:<生きた日数>"`：環境変数・実時間乱数ではなく終わった人生から決定論的に派生。同じ終わり方からは同じ世界が生まれ、別の日に終われば別の世界に分かれる
- 年代記への刻印は冪等：`hasLifeRecord`（世界・終わり方・生きた日数・名の一致）で重複記録を防ぎ、フローの中断→再開で同じ終わりを再生しても頁が二重に立たない
- 死因の語彙は `LifeCause` の既存値を使う：老衰は `"oldAge"`（`"death"` に倒さない）。伝記の閉じ行だけは語彙が2値（retire/death）なので death に倒す
- セーブバージョン据置（v13）：`GameState` の形は変えていない（`legacy` フィールドは T-39 ですでに追加済み）

### D-32: 頂点ルートは「条件鎖の列＋段フラグ」で、頂点称号は既存の称号判定に委ねる（T-41）
- ルートは `pinnacles.json` の条件DSL列：各段 `{id, name, rank, notice, condition}` を先頭から順に越える。`checkPinnacles` は「次の未達成段」だけを評価し（1ステップに各ルート最大1段）、達成を `flags["pinnacle.<route>.<stage>"]` に刻む —— GameState の形は変わらないのでセーブ v13 据置
- 頂点称号（S）は titles.json に `{flag: "pinnacle.<route>.<最終段id>"}` を条件として定義し、既存の称号判定（S通知・気配予算）に拾わせる。条件鎖は pinnacles.json 側だけに書き、二重管理しない（validate.ts で称号↔最終段フラグを突合）
- 段ごとに `pinnacleStageReached` イベント（rank 付き。rankOf は段の指定ランクをそのまま返す）。中間段は B/A、最終段のみ S（スキーマで強制）。S段への接近は「気配」として出す（notify.kehai に段フラグキーを記録し1日1回）
- 記録への反映：伝記は `biographyMaterial(state, routes)` が `pinnacleIds` を摘み、narration の `biography.pinnacle` 節に `{pinnacle}` を差し込む（表示名への解決は CLI/Web）。年代記は `ChronicleEntry.pinnacles`（任意フィールド）を CHRONICLE_VERSION 1→2 で追加（埋めるものはないので移行はバージョン更新のみ）
- 「到達までの日数」は sim:growth の報告項目：専用ボット（条件木から撃破→連戦→台帳→認定→スキルの順に手を打つ）を titleReachabilityDays で回し、各段の初達日を出す。常勝・見込み品質の楽観近似なのでゲートにはしない
- エンディング画面は作らない：仕様の「人生の頂点エンディング」は T-40 の転生フロー側。今回は頂点達成が通知・称号・伝記・年代記に残るところまで

### D-33: 前世の伝説は新聞の「昔語り」枠に混ざる最小版（T-42）
- 出し方は「街の記録画面の年代記ビュー（T-38 済み）」に加えて、新聞の見出し候補に legend 行を追加（年代記が非空の世界でのみ）。{name}/{epithet} は年代記の最新人生から取り、二つ名IDは称号名に解決
- 「どこかに出る」の実装として新聞を選んだ理由：毎朝目に入る・「世界が語り継ぐ」感触に合う・追加UIを作らず済む

### D-34: 強個体は enemies.json に別定義せず、係数生成＋カウンタ解禁にする（T-44）
- ユニークは `balance.combat.unique`（afterKills/hpFactor/powerFactor/challengeBonus/agilityBonus）1節で決まる係数生成。`enhancedEnemy` が数値だけを強化し、行動パターン・技・間隔は素の敵のまま —— 「プレイヤーが学習した敵の、強い個体」なのでパターンを維持する
- 解禁・記録は GameState を増やさずカウンタで行う：解禁は `kill.species.<id> ≥ afterKills`、記録は `kill.unique.<id>` と `kill.unique.total`。セーブ v13 据置。討伐は `uniqueDefeated` イベントで通知する
- 図鑑は専用状態を持たず、記録画面が kill.* カウンタから都度生成する派生ビュー（CLI・Web 共通テンプレート recordsHunt*）。コンプリート称号は `kill.unique.total`・全種 `kill.species.*` の条件DSLで既存の称号判定に乗せる

### D-35: 深層は「ラン進行はUI層の AbyssRun・結果は abyss コマンドでまとめて反映・記録は counters」（T-43）【仮】
- **ラン状態は GameState に入れない**：`AbyssRun`（層・灯り・撃破列・終わり方）は combat の `CombatState` と同じく一時状態として CLI/Web が持ち、終了時に `{type:"abyss"}` コマンドで step にまとめて渡す。GameState の形は変えないのでセーブバージョン据置（中断したランは消えるが、未完のランをセーブ間で持ち越す必然性は薄いと判断）
- **記録は counters で足りる**：`abyss.best`（自己ベスト）・`abyss.runs`・`abyss.floors` の3キー。`abyssEnded` イベント（depth/best/newBest）を通知Aランク相当として発行し、best 更新を UI が1行で告げる
- **潜行リソースは「灯り＝プレイヤー行動の残数」**：仕様の `maxTurns`/光源の両案に対し、行動数に寄せた（攻撃・防御・観察・逃走を消費＝「時間制限＋緊張」）。敵の攻撃や経過tickは灯りを減らさない。最後の灯りで倒しても層は刻む
- **潜行自体は1行動**（層数によらず）：`advanceTime` は1回だけ。層ごとの撃破は actionLog に `kind:"combat", variant:"abyss"` で残し、新規性（recentRepeats）・新聞の記事分類を通常の狩りと共有する。ラン内の同種連戦も反復として数える（inRun マップで加算）
- **敵の選出は runSeed × floor の決定論抽選**：`abyssRunSeed(world, runs)` = `"<seed>:abyss:<回目>"` をラン識別に使い、`createRng("<runSeed>:f<層>")` でプール抽選。世界RNGは消費しない（潜行しても日替わりイベント等の乱数列は変わらない）
- **プールは挑戦差しきい値**：`challenge ≤ poolBase + poolGrowthPerFloor × (層−1)` の敵から抽選（浅い層に最強格は出ない）。強化は `baseFactor + growthPerFloor × (層−1)` を HP・技威力・挑戦差に、敏捷に `agilityPerFloor × (層−1)` を加算 —— パターンは素のまま（T-44 の enhancedEnemy と同じ「学習した敵の強化版」方針）
- **死亡は戦闘死と同じ扱い**（教会蘇生・pending半減・died 発行→年代記は呼び出し側）。逃走・灯り切れの未決着層は `loss` として失敗経験を入れる
- 負荷は `body` に `abyss` エントリを追加（潜行1回で combat より少し重い固定値）：層数に比例させると balance 表現が増えるため、長いランを割く分の緊張は灯り側に任せる簡素化

### D-36: 傾向・誓約は共有の「世界修飾（WorldMods）」語彙に乗せ、係数は step/戦闘開始点で掛ける（T-45・T-46）
- **傾向と誓約は同じ語彙**：敵HP・敵威力・狩り経験・仕事報酬・宿代・素質回復の6係数＋追い風抑制（`noTailwind`）の WorldMods。傾向は `balance.tendency`（3択、calm=中立の空）、誓約は `vows.json`（1誓約=1効果）に書き、core の `worldMods(state, defs, vows)` が掛け合わせるだけ。activeEffects に混ぜない —— これらは称号・職業の「プレイヤー由来効果」ではなく世界・周単位の修飾で、語彙も一致しないため
- **1軸の傾向**：§3C「変数は1軸だけ」に従い、war は戦争軸（敵HP+15%・敵威力+10%・狩り経験+25%・宿-10%）、famine は生活軸（宿+30%・報酬-25%・素質回復半減・敵威力-10%）。calm は空＝従来どおり。未選択・旧セーブは calm に倒す（セーブ v13→v14）
- **誓約は flags にも刻む**：`state.vows` に加えて `flags["vow.taken.<id>"]=true` を立て、誓約称号（titles.json。Bランク・simReachable:false）は `{flag} ∧ days.slept≥28`（一季節守り抜いた証）の条件DSLで既存の称号判定に乗せる —— GameState.vows は条件DSLから直接読めないため（セーブ v14→v15）
- **係数の掛けどころは既存経路**：宿代・報酬・素質回復（consolidateBody の potentialFactor）・狩り経験（gain の M項）・追い風（抽選後に tailwind 方向だけ落とす。RNG消費は従来どおり）は step 内の係数点に。敵HP・威力は `withWorldMods` で EnemyDef を丸めてから startCombat/各turn に渡す（CLI の fightEnemy・Web の beginCombat/playCombatTurn の2点に注入。深層の敵も同じ経路で強くなる）
- **宿代表示も同じ係数で**：CLI の宿選択肢・Web の innCost は表示用にも worldFactor で丸め、実際の支払い（step 内）と一致させる
