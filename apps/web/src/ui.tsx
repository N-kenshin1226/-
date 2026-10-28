/**
 * 画面共通のUI部品と共通型（X-2 で App.tsx から分離）。
 * UI-01：1280×720固定ステージ＋窓・紙・コマンド等の共有部品をここから輸出する
 */
import type { ActionEvent, Command, GameState, WakeReport } from "@trace/core";
import type { EnemyJson } from "@trace/content";
import type { MinigameKind, Order } from "./game.js";

export type Screen =
  | { name: "menu" }
  /**
   * 場所の画面（P-01、docs/03 §2）：見取り図から選んだ場所の情景・住人・行動。
   * place は places.json の場所 id（街の中の場所・街の外の地域のどちらも）
   */
  | { name: "place"; place: string }
  /** 導入の会話窓（F-06。初めての生の冒頭にだけ出る短い案内） */
  | { name: "intro" }
  /** 起床の窓（UI-01：Wake見本）。寝た直後の step で wakeReport が出た時だけ開く */
  | { name: "wake"; report: WakeReport; events: ActionEvent[]; atHome: boolean }
  /** 朝刊（UI-01：News見本）。起床画面から、または街の記録から開く */
  | { name: "news"; events: ActionEvent[] }
  | { name: "train" }
  | { name: "sleep" }
  /** 場所に届いた注文の一覧（P-01。place は届いた場所の id —— 戻る先と景色の根拠） */
  | { name: "work"; place?: string }
  | { name: "workMode"; order: Order; place?: string }
  /** 決着の場面の勝負所なら finale に場面の id が入る（結果は危機の備えへ。W-03）。
      勝負所の行事なら occasion に行事の id が入る（結果は行事の勝敗へ。X-10） */
  | {
      name: "minigame";
      kind: MinigameKind;
      order: Order;
      finale?: string;
      occasion?: string;
      place?: string;
    }
  /** 獲物選び（P-01。place は狩りの場＝地域の id。敵のエリアと帰る場所に使う） */
  | { name: "hunt"; place?: string }
  /** 危機の接点の相手なら touchpoint に接点の id が入る（勝ったときだけ寄与。W-02）。
      place は戦いの起きた場所（P-01。決着後に戻る先） */
  | {
      name: "combat";
      enemy: EnemyJson;
      touchpoint?: string;
      finale?: string;
      occasion?: string;
      place?: string;
    }
  /** 決着の場面（W-03、docs/08 §6）：打診への応え・勝負所・自分で起こす */
  | { name: "crisis" }
  /** 勝負所の行事（X-10、docs/03 §2）：人物から届いた打診への応えと勝負所 */
  | { name: "occasion" }
  /**
   * 日々の出来事（F-05）：行動の合間に届く会話の挿話。応えは行動を消費しない。
   * メニュー滞在中に届いた分があれば自動で開き、「あとにする」で先送りにできる
   * （応えなくても不利益はなく、翌日には流れる）
   */
  | { name: "incident" }
  /**
   * 終幕の画面（W-04、docs/08 §7）：危機の決着・滅びを紙の層の語り＋
   * その世界の年代記の一頁で見せる。通知の「一頁を開く」から開き、
   * 閉じればそのまま世界で遊び続けられる（終幕は終了画面ではない）
   */
  | { name: "ending" }
  /** 深層ダンジョン（T-43）：層を下る連戦。進行は AbyssRun が持つ */
  | { name: "abyss" }
  /**
   * 有限迷宮（G-03、docs/10 §6）：部屋を抜く探索。place は迷宮の場所 id
   * （生成世界の dg<連番>）。進行は画面の一時状態＋counters（dg.rooms 等）
   */
  | { name: "dungeon"; place: string }
  | { name: "lore"; atomId?: string }
  /** 武器屋（K-01）：武器の棚。購入と持ち替えは行動を消費しない */
  | { name: "arms" }
  /** 武技の構え（K-02、09 §6）：戦闘技・パッシブ・持ち替え武器の構成。行動は消費しない */
  | { name: "build" }
  | { name: "book" }
  | { name: "records" }
  | { name: "society" }
  /** 師匠の訪問（P-01。place は師匠の居る場所 —— その場所の師だけが並ぶ） */
  | { name: "mentor"; place?: string }
  /**
   * 日々の営みの窓（P-02「行動の種類を増やす」）。view で窓の中身を選ぶ：
   * 市場・料理・賭け・人との時間・掲示板・祈り・食事・持ち物棚。
   * place は開いた場所（戻る先と住人の根拠）
   */
  | { name: "life"; view: LifeView; place?: string }
  /**
   * 旅の途中（P-02。町と町の間の街道。state.life.journey が立つ間だけ
   * 開かれる窓 —— 野営で日が進み、残り日数が尽きると隣町に着く）
   */
  | { name: "journey" }
  | { name: "status" }
  /** 演出・効果音の設定（F-02）：音量・演出の長さ。localStorage に保存する */
  | { name: "settings" }
  /** 引退の確認（T-40） */
  | { name: "retire" }
  /** セーブ削除の最終確認（UI-01。記録を消す操作は必ず確認を挟む） */
  | { name: "reset" }
  /** 生の継ぎ方の選択（T-48）：転生（新しい世界）か次代（同じ世界）か */
  | { name: "succession"; prev: GameState; cause: "retire" | "oldAge" }
  /** 一生の終わり画面（T-40）：伝記＋継承の選択＋新しい生の出自 */
  | { name: "rebirth"; prev: GameState; cause: "retire" | "oldAge" }
  /** 次代を継ぐ画面（T-48）：同じ世界 seed で新キャラ。弱い引継ぎ・年代記には刻まない */
  | { name: "heir"; prev: GameState; cause: "retire" | "oldAge" };

/** 日々の営みの窓の種類（P-02。Screen "life" の view） */
export type LifeView =
  | "market"
  | "cook"
  | "gamble"
  | "social"
  | "board"
  | "pray"
  | "eat"
  | "shelf"
  /** 魔法（M-01）：生活魔法の使用と武器への付与 */
  | "spells";

/** step を1回実行する共通コールバック（App が持ち、各画面に props で渡す） */
export type Act = (
  c: Command,
  opts?: { atHome?: boolean; format?: (ev: ActionEvent[]) => string[] },
) => void;

/** ログへの追記（App が持ち、各画面に props で渡す） */
export type Push = (l: string | string[]) => void;

// ---- 共有部品（ui/ 以下。UI-01の窓・紙・コマンド・背景） ----
export { Stage, STAGE_H, STAGE_W, pos } from "./ui/stage.js";
export { WorldFrame, BlessingWindow, Paper, Plate, Kicker, Divider } from "./ui/frames.js";
export {
  CommandMenu,
  KeyHints,
  Keycap,
  useHotkeys,
  type CmdItem,
  type MenuEntry,
} from "./ui/keys.js";
export { Candles, CellGauge, SegGauge, SkillBar, WindChip, StChip, RankCrest } from "./ui/hud.js";
export { SceneBackground, type SceneKind } from "./ui/scenes.js";
export { DialogueBox, LogWindow, ConfirmWindow, HintBar } from "./ui/dialogue.js";
export { skillBandOf, SKILL_BANDS, NEWSPAPER, PLACE, KICKER } from "./ui/vocab.js";
