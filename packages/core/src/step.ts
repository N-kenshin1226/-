import {
  artExpGain,
  checkArtsLearn,
  consolidateArts,
  kiMaxOf,
  manaMaxOf,
  normalizeBuild,
  recordArtUse,
  type ArtsConfig,
} from "./arts/index.js";
import { activeBookEffects, buyBook, readBook, type BooksConfig } from "./books/index.js";
import { evaluate, type Cond, type CondEnv } from "./conditions/index.js";
import { checkDiscoveries, type DiscoveryDef } from "./discoveries/index.js";
import {
  checkEvolution,
  checkRivalClaims,
  checkSynthesis,
  checkUniques,
  type EvolutionConfig,
  type SynthesisRecipe,
  type UniquesConfig,
} from "./evolve/index.js";
import {
  addHeroContribution,
  crisisFinaleAttempt,
  crisisFinaleLead,
  crisisFinaleOffers,
  crisisInvolvement,
  crisisPriceFactor,
  crisisSeasonTurn,
  crisisTouchpointForCombat,
  crisisTouchpointForWork,
  type CrisisConfig,
} from "./crisis/index.js";
import { activeEffects, gainModifier, priceFactor, type Effect } from "./effects/index.js";
import { worldFactor, worldMods, type TendencyDefs, type VowDef } from "./fate/index.js";
import { subscribers, type ActionEvent } from "./events/index.js";
import { ageBand, agingOnWake, type AgingConfig } from "./growth/aging.js";
import {
  applyActionLoad,
  consolidateBody,
  updateOverwork,
  type BodyConfig,
} from "./growth/body.js";
import {
  consolidateSleep,
  sleepQuality,
  type InnRank,
  type SleepConfig,
} from "./growth/consolidate.js";
import { computeGain, recentRepeats, type GainConfig } from "./growth/gain.js";
import { rollTailwind, windFor, type TailwindConfig } from "./growth/tailwind.js";
import {
  incidentChoosable,
  incidentOutcome,
  incidentPending,
  incidentSpeaker,
  type IncidentsConfig,
} from "./incidents/index.js";
import { recordWork, type LedgerConfig } from "./ledger/index.js";
import {
  canEnchant,
  canLifeSpell,
  consumeLifeBuff,
  enchantLevel,
  lifeBuffKey,
  lifeBuffOf,
  type MagicConfig,
} from "./magic/index.js";
import { passiveFxOf, type CombatConfig, type WeaponDef } from "./combat/index.js";
import {
  bondOf,
  canErrand,
  cookQuality,
  drawGamble,
  drawGather,
  drawSpot,
  drawStroll,
  errandsFor,
  gambleWinChance,
  itemCount,
  itemPrice,
  journeyBetween,
  marketStock,
  mealToday,
  prayedToday,
  repOf,
  strollTableOf,
  townOf,
  townName,
  withItem,
  withRep,
  type ItemDef,
  type LifeConfig,
} from "./life/index.js";
import { linkFlat, linkFlatCap, linkSum, type SkillLinks } from "./links/index.js";
import { consumeS, emitKehai, resetDailyNotify } from "./notify/index.js";
import { npcLifeEvents, type NpcLifeConfig } from "./npclife/index.js";
import { checkPinnacles, type PinnacleRouteDef } from "./pinnacle/index.js";
import { acceptOffer, goalAchieved, newOffers, type SocietyDefs } from "./society/index.js";
import { readAtom, type LoreConfig } from "./lore/index.js";
import {
  apprentice,
  currentMentor,
  leaveMentor,
  mentorSession,
  type MentorsConfig,
} from "./mentors/index.js";
import {
  OCCASION_RENOWN_KEY,
  occasionOffers,
  occasionPending,
  type OccasionsConfig,
} from "./occasions/index.js";
import { unlockSkills } from "./skills/index.js";
import { createRng, restoreRng } from "./rng/index.js";
import {
  gainVarianceFactor,
  insightOf,
  marketFactor,
  materialFactor,
  npcAway,
  customerMoodFactor,
  rollCondition,
  workTwist,
  type VarianceConfig,
} from "./variance/index.js";
import { weatherOf, weatherPriceFactor, type WeatherConfig } from "./weather/index.js";
import type { CrisisFieldId, GameState, SkillId } from "./state/types.js";
import {
  advance as advanceTime,
  canAct,
  describe as describeTime,
  sleep as sleepTime,
  type TimeConfig,
} from "./time/index.js";

/**
 * step(state, command, cfg) → { state, events }
 * 純粋関数：入力の state を変更しない。docs/04_tech_and_devin.md §2 原則2。
 * cfg は balance.json 由来（数値をコードに直書きしない）。
 */

export interface StepConfig {
  time: TimeConfig;
  /** actionLog の保持上限（balance.json state.actionLogMax） */
  actionLogMax: number;
  gain: GainConfig;
  sleep: SleepConfig;
  tailwind: TailwindConfig;
  body: BodyConfig;
  /** 作品台帳（T-16。03 §3） */
  ledger: LedgerConfig;
  /** 戦闘（03 §4。死亡時の経験損失に使う） */
  combat: CombatConfig;
  /** 立場・職業・人生目標の定義（03 §1。content/society.json）＋達成報酬の係数 */
  society: SocietyDefs & { goalRewardFactor: number };
  /** 見聞録（07 §3。content/lore のアトムとつながり定義） */
  lore: LoreConfig;
  /** 称号の定義（content/titles.json。core が必要とする最小形） */
  titles: readonly { id: string; rank: "S" | "A" | "B"; condition: Cond; effect?: Effect }[];
  /** 派生スキルの解放条件（skills.json の unlock を持つもの。02：派生） */
  skillUnlocks?: readonly { id: string; condition: Cond }[];
  /** 書物（02 §8、T-26。content/books.json と素質上限） */
  books?: BooksConfig;
  /** 師匠（02 §8、T-27。content/mentors.json と素質上限） */
  mentors?: MentorsConfig;
  /** 起床ログなどに出すスキル表示名（省略時はID） */
  skillNames?: Record<string, string>;
  /** 寿命・加齢（06 §1、T-36。balance.aging ＋ cli.json 由来の文）。省略時は加齢なし */
  aging?: AgingConfig;
  /** 継承（06 §2、T-39。balance.legacy）。遺物の gainVs 係数を渡す */
  legacy?: { artifactGainFactor: number };
  /** 街への寄付（X-9 領主ルート。balance.town.donationAmount）。省略時は寄付できない */
  donation?: { amount: number };
  /** 頂点ルート（06 §3A、T-41。content/pinnacles.json）。省略時は条件鎖を評価しない */
  pinnacles?: readonly PinnacleRouteDef[];
  /** 運命の傾向の定義（06 §3C、T-45。balance.tendency）。省略時はすべて中立 */
  tendency?: TendencyDefs;
  /** 誓約の定義（06 §3C、T-46。content/vows.json）。省略時は誓約の効果なし */
  vows?: readonly VowDef[];
  /**
   * 世界の危機（docs/08、W-01。balance.crisis ＋ crises/*.json）。
   * 指定すると睡眠・休養で季節が変わったときに危機が進行する。
   * 未抽選の世界（v15 以前のセーブ）は次の季節の変わり目に抽選される
   */
  crisis?: CrisisConfig;
  /**
   * 勝負所の行事（X-10、docs/03 §2。balance.occasions ＋ occasions.json）。
   * 指定すると、その日の行事が条件と日付＋シードの抽選で打診として届く
   */
  occasions?: OccasionsConfig;
  /**
   * 日々の出来事（F-05、docs/devin_tasks/F-05_daily_events.md。
   * balance.incidents ＋ incidents.json ＋ npc/ライバル/師匠の顔ぶれ）。
   * 指定すると、行動の合間に小さな出来事が会話の窓に届く（1日0〜perDay 件。
   * 日付＋世界シードの独立した抽選 —— state.rng は消費しない）。
   * 届いた出来事に応えるも応えないも自由 —— 応えなくても翌日には流れる
   */
  incidents?: IncidentsConfig;
  /**
   * 隠し要素（X-11、docs/03 §5。content/discoveries.json）。
   * 指定すると、毎ステップの行動後の状態で発見条件を評価し、
   * 満たした発見は flags["found.<id>"]（＋setFlags）を立てて
   * discovery イベント（通知Bランク相当）を発行する。
   * 発見フラグは頂点・称号の条件判定より先に立つので同じステップで効く
   */
  discoveries?: readonly DiscoveryDef[];
  /**
   * NPCの歳月（X-12、docs/07 §3。npc_lifecycle.json ＋ 師匠の人物紐付け）。
   * 指定すると、行動後の状態で各人物の出来事条件（at）を評価し、満たした
   * 出来事を発火させる：引退・結婚・死去・栄転・旅立ち。
   * 発火は counters["npc.done.<npcId>.<i>"]・flags["npc.<kind>.<npcId>" 等]・
   * 世界の記録（crisis.log の npc.<kind> 行）に刻まれ、npcEvent イベント
   * （通知Bランク相当）を発行する。退場した人物は師匠・街の声・ランキングから
   * 外れ、刻印は世代をまたぐ世界の記録として残る
   */
  npcLife?: NpcLifeConfig;
  /**
   * 天候（X-13、docs/03 §2「日替わりの要因は2つまで」の1枠＋§5の語彙）。
   * weather.json の種類表＋balance.weather の注文係数。
   * 天候は seed+day から導出する値（state.rng は消費しない、GameState に欄は足さない）：
   * 指定すると (a) 条件DSLの {weather} 語彙が効き、(b) 仕事の報酬に
   * 天候の係数が乗り、(c) 起床レポートに今日の空の風景の行が載る
   */
  weather?: WeatherConfig;
  /**
   * 揺らぎ（R-01、docs/devin_tasks/R-01_randomness.md。balance.variance）。
   * 指定すると経験・仕事・市場・人・体調に決定的な揺らぎが掛かる。
   * 分布は誰に対しても同じ（期待値1のノイズ）で、技量が高いほど安定する。
   * すべて seed×日付×用途の独立した乱数列から引く —— state.rng は消費しない
   */
  variance?: VarianceConfig;
  /**
   * 移動（P-01、docs/03 §2。balance.travel）。街の中の移動は行動を
   * 消費しないが、門から街の外へ出る・街の外どうしの移動は行動を消費する
   */
  travel?: { outsideCost: number };
  /**
   * 技能リンク（K-01、balance.links）。技能がどこに効くかの結線表：
   * 戦闘・仕事・睡眠・移動・読書・危機・師匠の各フックをここから引く
   */
  links?: SkillLinks;
  /**
   * 武器の定義表（K-01、weapons.json）。buyWeapon/equipWeapon の
   * 購入・持ち替えと、戦闘経験が入る武器技能の解決に使う
   */
  weapons?: Record<string, WeaponDef>;
  /**
   * 旧セーブに無い技能へ経験が入るときに作る技能レコードの素質
   * （K-01、balance.player.initialPotential を渡す。後から加わった
   * 技能も途中の世界から育てられる）。省略時は無い技能への経験は捨てる
   */
  initialSkillPotential?: number;
  /**
   * 日々の営み（P-02「行動の種類を増やす」。life.json＋balance.life）。
   * 散策・採集・料理・賭け事・人との時間・市場・掲示板・祈り・旅の
   * 定義と係数。省略時はこれらのコマンドは何も起こさない
   */
  life?: LifeConfig;
  /** 品物の定義表（items.json の id → 定義。値段・食事の質・贈り物の価値に使う） */
  items?: Record<string, ItemDef>;
  /**
   * 武技・資源・構成（K-02、balance.arts ＋ arts.json の defs）。
   * 指定すると：戦闘の使用記録が artTags/skillTags に畳まれ、使った技に
   * 経験が入り（眠りで定着）、技能値×傾きで新しい技を閃き、気力・魔力が
   * 眠りで満たされ、setBuild コマンドで構成を組み替えられる。
   * 未指定の世界では武技関連はすべて働かない
   */
  arts?: ArtsConfig;
  /**
   * 魔法（M-01、balance.magic ＋ spells.json の spell 節）。
   * 指定すると：戦闘の魔力書き戻し・見取り稽古の見知り（spell.seen.*）、
   * 生活魔法（lifeSpell コマンド）とその生活行動への効果、
   * 付与（enchant コマンド）が効く。未指定の世界では魔法関連は働かない
   */
  magic?: MagicConfig;
  /**
   * 技の進化（K-03、09 §7.1。balance.evolution ＋ hidden/k03 の隠し分岐表）。
   * 指定すると：眠りの定着で Lv10 に達した技が、使い方の記録（artTags）と
   * 最も合う分岐へ進化する。未指定の世界では技は Lv10 のまま止まる
   */
  evolution?: EvolutionConfig;
  /**
   * 技の合成（K-03、09 §7「2つの技能・技の組み合わせで新しい技」。
   * hidden/k03 のレシピ表）。指定すると：習得判定と同じ場面で、条件を
   * 満たす未獲得のレシピが生まれる（通知Bランク相当）
   */
  synthesis?: { recipes: readonly SynthesisRecipe[] };
  /**
   * ユニークスキル（K-03、09 §7「その世界で一人だけ持てる技」。
   * hidden/k03 の定義＋ライバルの人数）。指定すると：厳しい条件を満たすと
   * 主人公が取り（通知Sランク相当）、取られずに残った技は眠りのあいだに
   * ライバルが先取りしうる（記録は state.uniques。世界の記録に残る）
   */
  uniques?: UniquesConfig;
}

export type Command =
  | { type: "wait" }
  /**
   * 街の外への移動（P-01、docs/03 §2）。行動を cfg.travel.outsideCost 回
   * 消費する（行動残が足りなければ何も起きない）。街の中の移動は
   * コマンドを踏まない —— 場所の切り替えは画面側の遷移で、時間は進まない。
   * to は行き先の場所 id（行動ログの目印。朝刊の記録欄に残る）
   */
  | { type: "travel"; to?: string }
  /** 宿で寝る。inn/dinner は睡眠の質（2要因のみ） */
  | { type: "sleep"; inn?: InnRank; dinner?: boolean }
  /** 休養：家で休んで眠る。行動0回なら休養日（素質回復・オーバーワーク解除） */
  | { type: "rest" }
  /** 訓練：安全だが挑戦係数に上限がある（02 §8）。difficulty は行動の難度 */
  | { type: "train"; skill: SkillId; difficulty: number; failed?: boolean }
  /**
   * 仕事で作品を作る（03 §3 作品台帳）。quality は結果、difficulty は注文の難しさ
   * （省略時は quality − 現在値を挑戦差とみなす＝自己ベスト級の挑戦）
   */
  | {
      type: "work";
      kind: string;
      quality: number;
      difficulty?: number;
      order?: string;
      flags?: string[];
      /** 簡易判定なら経験係数（03 §2「50%」）。手動は省略/1 */
      expFactor?: number;
      /** 注文の報酬（G）。省略時は台帳の市場価値がそのまま入る */
      rewardMoney?: number;
      /**
       * 仕事をした場所の id（G-01）。生成世界では場所の属する町の評判に
       * 積む（省略時は今いる町 —— 町の中の仕事は従来どおりその町への評判）
       */
      place?: string;
    }
  /**
   * 戦闘の結果を世界に反映する（03 §4）。戦闘の進行自体は combat/ で行い、
   * ここでは勝敗を記録し経験を入れる。敵の強さは difficulty（challenge）で渡す
   */
  | {
      type: "combat";
      enemyId: string;
      /** 敵の challenge（gain の挑戦差） */
      difficulty: number;
      won: boolean;
      fled?: boolean;
      died?: boolean;
      /** 強化版ユニークとの戦闘（T-44）。討伐時に kill.unique.<id>/total を数える */
      unique?: boolean;
      /**
       * 危機の接点の相手としての戦闘（W-02、docs/08 §5。接点の id）。
       * 今日の提示にある接点の相手と一致し、かつ勝ったときだけ世界の備えに寄与する。
       * 負け・逃げ・提示外では何も起きない
       */
      touchpoint?: string;
      /**
       * 使った武器のID（K-01。戦闘中に持ち替えたなら最後に構えていた武器。
       * 省略時は装備中の武器 —— この武器の技能に経験が入る）
       */
      weapon?: string;
      /** 相手が獣か（K-01。beast.exp の技能リンクが経験を入れるかの判定に使う） */
      beast?: boolean;
      /**
       * 戦闘の使用記録（K-02、combatResult.uses）。行動ごとの使用タグを
       * artTags/skillTags に畳み、使った技（id のあるもの）に経験が入る
       */
      uses?: readonly { id?: string; skill: string; tags: string[] }[];
      /** 戦闘終了時点の気力（K-02、combatResult.kiLeft。player.ki へ書き戻す） */
      kiLeft?: number;
      /** 戦闘終了時点の魔力（M-01、combatResult.manaLeft。player.mana へ書き戻す） */
      manaLeft?: number;
      /**
       * 観察中に見届けた敵の呪文（M-01、combatResult.seenSpells）。
       * それぞれ flags["spell.seen.<id>"] に畳まれる（見取り稽古で覚える道）
       */
      seenSpells?: readonly string[];
    }
  /**
   * 深層ダンジョンのランの結果を世界に反映する（06 §3B、T-43）。
   * ランの進行自体は abyss/ で行い、ここでは層ごとの撃破・到達深度・終わり方を記録する。
   * 潜行1回につき1行動を消費する（層数によらない）
   */
  | {
      type: "abyss";
      /** ランの終わり方：逃走／灯り切れ／途中離脱／死亡 */
      end: "fled" | "light" | "retreat" | "died";
      /** クリアした層の敵（倒した順）。difficulty は強化後の挑戦差 */
      kills?: readonly { enemyId: string; difficulty: number }[];
      /** 未決着で終わった層の敵（逃走・死亡・灯り切れ）。失敗経験を入れる */
      loss?: { enemyId: string; difficulty: number };
      /**
       * ラン中に最後に使った武器のID（K-01。戦闘中の持ち替えを反映する。
       * 省略時は装備中の武器 —— この武器の技能に経験が入る）
       */
      weapon?: string;
      /** ラン中の使用記録（K-02。combat と同じく artTags/skillTags・技の経験に畳む） */
      uses?: readonly { id?: string; skill: string; tags: string[] }[];
      /** ラン終了時点の気力（K-02） */
      kiLeft?: number;
      /** ラン終了時点の魔力（M-01） */
      manaLeft?: number;
      /** ラン中に見届けた敵の呪文（M-01。flags["spell.seen.<id>"] に畳む） */
      seenSpells?: readonly string[];
    }
  /** 打診を受けて立場・職業の認定を受ける（03 §1）。行動は消費しない */
  | { type: "acceptOffer"; id: string }
  /** 人生目標を宣言する（03 §1）。行動は消費しない */
  | { type: "declareGoal"; id: string }
  /** 人生目標を取り下げる（差し替え用） */
  | { type: "abandonGoal" }
  /**
   * 街へ寄付する（X-9 領主ルート。1行動を消費し cfg.donation.amount を納める）。
   * 累計は counters["town.donated"] に刻まれる。設定・行動残・所持金が無ければ何も起きない
   */
  | { type: "donate" }
  /** アトムを読む（見聞録。行動を1回消費する） */
  | { type: "readAtom"; id: string }
  /** 書物を買う（02 §8、T-26。行動は消費しない） */
  | { type: "buyBook"; id: string }
  /** 武器を買う（K-01。行動は消費しない —— 書店への立ち寄りと同じ扱い） */
  | { type: "buyWeapon"; id: string }
  /** 武器を持ち替える（K-01。行動は消費しない —— 腰の物を替える一瞬） */
  | { type: "equipWeapon"; id: string }
  /**
   * 武技の構成を組み替える（K-02、09 §6。行動は消費しない —— 街での仕度）。
   * 8枠の戦闘技スロット・4枠のパッシブ・持ち替える2本の武器を指定する。
   * 習得していない技・種別の違う技・持っていない武器・重複は削られ、
   * 残りが正規化されて入る（normalizeBuild）。武器枠の先頭は装備中の武器になる
   */
  | {
      type: "setBuild";
      slots?: (string | null)[];
      passives?: (string | null)[];
      weapons?: (string | null)[];
    }
  /** 所持する書物を読む（行動を1回消費。素質回復・期間効果・知識フラグ） */
  | { type: "readBook"; id: string }
  /** 師匠に弟子入りする（02 §8、T-27。条件達成で認められる。行動は消費しない） */
  | { type: "apprentice"; id: string }
  /** 師匠の門を出る（行動は消費しない） */
  | { type: "leaveMentor" }
  /**
   * 師匠の稽古を受ける（行動を1回消費＋礼金）。担当スキルの経験は train と同じ式で、
   * M項には弟子期間の師匠効果が乗る。稽古ごとに担当スキルの素質が回復し、
   * 初回は秘伝フラグが立つ
   */
  | { type: "trainWithMentor"; difficulty: number }
  /**
   * 決着の場面への参加の打診に応える（W-03、docs/08 §6。行動は消費しない —
   * 打診は世界から届き、応えるのは会話の一瞬）。
   * 届いた打診（crisis.offer.<id>）があって最も早い未決着の場面だけ請けられる
   */
  | { type: "crisisFinaleJoin"; id: string }
  /**
   * 請けた場面の勝負所に臨む（W-03。1行動を消費）。score は実際に遊んだ結果の
   * 出来 0〜1（戦闘の勝敗・ミニゲームの品質・交渉の結果を呼び出し側が換算）。
   * 出来に応じて世界の備えに足す量が決まり、場面の成否に効く。1場面につき1回。
   * died=true なら武の勝負所で倒れた扱い（教会蘇生：未定着経験の半分を失う。03 §4 と同じ）
   */
  | { type: "crisisFinaleAttempt"; id: string; score: number; died?: boolean }
  /**
   * 決着の場面を自分で起こす（W-03、段階4「率いた」＝英雄。1行動を消費）。
   * 予定の時期を早めて今ここで判定する。field を指定するとやり方をその分野に
   * 絞れる（required に leadFocusFactor が掛かるが、主人公側の備えもその分野
   * だけで判定する）。成否は主に主人公側の備え（自分の寄与＋実力＋名声）で決まる
   */
  | { type: "crisisLead"; id: string; field?: CrisisFieldId }
  /**
   * 勝負所の行事の打診に応える（X-10。行動は消費しない —— 打診は人物から届き、
   * 応えるのは会話の一瞬。crisisFinaleJoin と同じ扱い）。
   * 当日届いた（occasion.offer.day.<id> === 今日）打診だけ請けられる
   */
  | { type: "occasionAccept"; id: string }
  /**
   * 応えた行事の勝負所に臨む（X-10。1行動を消費）。score は実際に遊んだ結果の
   * 出来 0〜1（ミニゲームの品質・戦闘の勝敗を呼び出し側が換算）。
   * 勝敗は器ごとの閾値で決まり、賞金・評判・旗印が刻まれる。同じ日に同じ行事は1回。
   * died=true なら決闘で倒れた扱い（教会蘇生：未定着経験の半分を失う。03 §4 と同じ）
   */
  | { type: "occasionAttempt"; id: string; score: number; died?: boolean }
  /**
   * 届いた日々の出来事に応える（F-05。行動は消費しない —— 出来事は行動の
   * 合間に差し込まれ、応えるのは会話の一瞬。occasionAccept と同じ扱い）。
   * 当日届いた（incident.offer.day.<id> === 今日）未応答の出来事だけ選べ、
   * 結末は世界シード×日付×出来事×選択肢の独立した抽選で1件に決まる
   */
  | { type: "incidentChoose"; id: string; choice: string }
  /**
   * 引退する（06 §1、T-40）。いつでも選べて行動は消費しない。
   * state は変えず `retired` イベントだけを返す —— 伝記・年代記・継承・転生は
   * 呼び出し側が行う（転生は newGame で別の GameState に切り替わるため）
   */
  | { type: "retire" }
  // ---- 日々の営み（P-02「行動の種類を増やす」） ----
  /**
   * 散策（1行動）。scope は表のキー（"town"=街の中 / "region"=街の外。
   * 省略時は旅の途中なら "road"、町にいれば "town"）。place は歩いている
   * 場所の id —— G-01 の生成世界では場所の型に応じて型別の表を引く。
   * 歩いて起きる小さな出来事を表から決定的に1件引く
   */
  | { type: "stroll"; scope?: "town" | "region"; place?: string }
  /**
   * 地域の中の小さな地点へ立ち寄る（G-01、docs/10 §5。1行動）。
   * spot は生成された地点の id（泉・炭焼き小屋・見張り塔跡…）。
   * 地点の型の出来事表から1件引き、散策と同じ小さな効果を受ける
   */
  | { type: "spot"; spot: string }
  /**
   * 採集（1行動）。place は life.json gather の表のある場所 id。
   * 場所ごとの採集表から季節・天候を見て品を引き、その場所の技能に経験が入る
   */
  | { type: "gather"; place: string }
  /** 市場で買う（行動は消費しない。stock に並ぶ品をその町の相場で） */
  | { type: "buyItem"; id: string; n?: number }
  /** 市場で売る（行動は消費しない。持ち物をその町の相場で） */
  | { type: "sellItem"; id: string; n?: number }
  /**
   * 料理（1行動）。recipe は life.json のレシピ id。材料を消費して
   * 仕上がりの品を得る。quality はミニゲームの出来（省略時はまかせ ——
   * 日付×回目の決定的な素の出来）
   */
  | { type: "cook"; recipe: string; quality?: number }
  /**
   * 食べる（行動は消費しない）。持ち物の食べられる品を1つ食べ、
   * その質を今夜の眠りに刻む（日付が変わると効き目は消える）
   */
  | { type: "eat"; id: string }
  /**
   * 賭ける（1行動）。stake は life.json gamble.stakes の掛け金。
   * 勝率は基礎値＋賭けの技能（gamble.win リンク）。勝てば掛け金×winFactor が戻る
   */
  | { type: "gamble"; stake: number }
  /**
   * 祈る（1行動）。alms を渡すと併せて施しを納める（生活の中の世界の備え —
   * 施しの累計は counters["life.alms"]）。祈った日の眠りが少し深くなる
   */
  | { type: "pray"; alms?: number }
  /**
   * 人と過ごす（1行動）。way は 話す=talk / 飲む=drink（代金）/ 贈る=gift
   * （item=贈る品物の id）。仲の値が育ち、社交の技能（social.gain リンク）に
   * 少し経験が入る。相手が今日街にいない日は会えない（行動も消費しない）
   */
  | { type: "social"; npc: string; way: "talk" | "drink" | "gift"; item?: string }
  /**
   * 掲示板の依頼を果たす（1行動）。id は life.json errands の id。
   * 納める品が揃い、日限・日の上限の内なら品を納めて報酬を得る
   */
  | { type: "errand"; id: string }
  /**
   * 生活魔法を唱える（M-01、09 §4。1行動を消費＋魔力）。
   * 習得済みの kind:"life" の呪文だけ使える。効果は hook に応じて
   * 次の料理・仕事・採集・眠り・持ち物・疲労に掛かる
   */
  | { type: "lifeSpell"; id: string }
  /**
   * 付与（エンチャント。M-01、09 §4「鍛冶＋火魔法」）。1行動を消費＋魔力。
   * 鍛冶と火魔法の技能が必要で、武器1本に1段ずつ付与が刻まれる
   * （counters["enchant.<weapon>"]。戦闘では attackFactor に畳まれる）
   */
  | { type: "enchant"; weapon: string }
  /**
   * 旅に出る（1行動）。to は行き先の町 id（life.json journeys の道がある
   * 町に限る）。以後は野営の眠りで日が進み、日数ぶんの野営で着く
   */
  | { type: "journey"; to: string };

export interface StepResult {
  state: GameState;
  events: ActionEvent[];
}

/** actionPerformed イベントを行動ログに追記し、上限で丸める */
function recordAction(state: GameState, event: ActionEvent, max: number): GameState {
  if (event.type !== "actionPerformed") return state;
  const entry = {
    day: event.day,
    kind: event.kind,
    ...(event.target ? { target: event.target } : {}),
    ...(event.variant ? { variant: event.variant } : {}),
  };
  const actionLog = [...state.actionLog, entry].slice(-max);
  return { ...state, actionLog };
}

export function step(state: GameState, command: Command, cfg: StepConfig): StepResult {
  // イミュータブル：入力のクローンだけを触る。
  // GameState はシリアライズ可能なプレーンオブジェクトなので JSON 往復で複製する
  // （structuredClone は DOM/node 型依存を core に持ち込まないため避ける）
  let next = JSON.parse(JSON.stringify(state)) as GameState;
  const events: ActionEvent[] = [];

  // 運命の傾向＋誓約（T-45/T-46）：この周に効いている世界修飾の合算。
  // 傾向・誓約は step 中に変化しないので入力 state から一度だけ計算する
  const fate = worldMods(state, cfg.tendency, cfg.vows);

  // 条件DSLの評価環境（X-13）：{weather} など state から導出する語彙に使う
  // コンテンツ設定。天候表が無い世界では {weather} 条件は成立しない
  const condEnv: CondEnv = cfg.weather !== undefined ? { weather: cfg.weather } : {};

  // K-03：響き合い（合成）とユニークスキルの判定。習得判定（checkArtsLearn）と
  // 同じ場面で呼ぶ —— 技・技能・刻印が揃った瞬間に新しい技が生まれ、
  // 厳しい条件を満たしたユニークはその世界で一人だけの手に渡る。
  // ユニークの獲得はS通知（1日1回の予算。溢れた分は suppressed で記録だけ残る）。
  // 返り値はイベントにする結果 —— 眠りでは起床ログの後にまとめて出すため
  // 呼び出し側が出す順を決める
  const k03Checks = (): {
    synthesized: string[];
    gained: { art: string; suppressed?: boolean }[];
  } => {
    const out: { synthesized: string[]; gained: { art: string; suppressed?: boolean }[] } = {
      synthesized: [],
      gained: [],
    };
    if (cfg.synthesis !== undefined) {
      const syn = checkSynthesis(next, cfg.synthesis.recipes, cfg.time, condEnv);
      next = syn.state;
      out.synthesized.push(...syn.learned);
    }
    if (cfg.uniques !== undefined) {
      const u = checkUniques(next, cfg.uniques, cfg.time, condEnv);
      next = u.state;
      for (const art of u.gained) {
        const r = consumeS(next);
        next = r.state;
        out.gained.push({ art, ...(r.allowed ? {} : { suppressed: true }) });
      }
    }
    return out;
  };

  // R-01 経験の揺らぎ：定着前の経験1回ごとに seed×日×行動序数×回目の独立した
  // 乱数を引く。行動序数（action.total）で日をまたいでも同じ乱数を再引きせず、
  // 回目（seq）で1行動に複数スキルへ入る分（戦闘・深層）もそれぞれ別の抽選になる。
  // 「冴え」の日はその日全部の経験に同じ係数が掛かる
  let gainRollSeq = 0;
  const gainFactor = (skill: number): number => {
    const v = cfg.variance?.gain;
    if (v === undefined) return 1;
    const key = `${next.seed}:gv:${next.time.day}:${next.counters["action.total"] ?? 0}:${gainRollSeq++}`;
    return (
      gainVarianceFactor(createRng(key), skill, v) * insightOf(next.seed, next.time.day, v).factor
    );
  };

  /* ── K-01：技能リンク（balance.links）と後発技能の技能レコード ── */

  /**
   * 技能レコードの取得。旧セーブ等で無い技能は initialSkillPotential で
   * 新しく作る（後から加わった技能も途中の世界から育てられる）
   */
  const ensureSkillRecord = (id: string) => {
    let skill = next.player.skills[id];
    if (skill === undefined && cfg.initialSkillPotential !== undefined) {
      skill = {
        value: 0,
        peak: 0,
        pending: 0,
        potential: cfg.initialSkillPotential,
        potentialCap: cfg.initialSkillPotential,
        lastUsedDay: 0,
      };
      next.player.skills[id] = skill;
    }
    return skill;
  };
  /** リンク由来の定数経験を技能に足し、gainApplied イベントを出す */
  const grantPending = (id: string, amount: number): void => {
    if (amount <= 0) return;
    const skill = ensureSkillRecord(id);
    if (skill === undefined) return;
    skill.pending += amount;
    skill.lastUsedDay = next.time.day;
    events.push({ type: "gainApplied", skill: id, amount });
  };
  /**
   * 定数系フック（travel.gain / beast.exp / read.gain）の経験をまとめて付与。
   * cap はその行動1回あたりの合計上限 —— 超えた分は係数の比で縮める
   */
  const grantLinkGains = (hook: string): void => {
    const flat = linkFlat(cfg.links, hook);
    const cap = linkFlatCap(cfg.links, hook);
    const sum = Object.values(flat).reduce((a, v) => a + v, 0);
    const scale = cap > 0 && sum > cap ? cap / sum : 1;
    for (const [id, amt] of Object.entries(flat)) grantPending(id, amt * scale);
  };
  /** 死亡時に残る未定着経験の割合（death.keep リンクで蘇生が手厚くなる。K-01） */
  const deathKeepFactor = (): number =>
    Math.min(
      1,
      cfg.combat.deathPendingFactor + linkSum(cfg.links, "death.keep", next.player.skills),
    );

  /**
   * 日々の営みの技能経験（P-02：gather/cook/pray/gamble 共通）。
   * train/work/combat と同じ computeGain の式で、kind は gain.base の
   * 行動種別、difficulty は表（採集・レシピ・係数）の難度 —— 挑戦差を作る
   */
  const grantLifeGain = (kind: string, skillId: string, difficulty: number): void => {
    const skill = ensureSkillRecord(skillId);
    if (skill === undefined) return;
    const repeats = recentRepeats(next.actionLog, kind, skillId, cfg.gain.noveltyWindow);
    const { amount } = computeGain(
      {
        kind,
        skill: skill.value,
        delta: difficulty - skill.value,
        repeats,
        potential: skill.potential,
        fatigue: next.player.fatigue,
        wind: windFor(next, kind, skillId),
        modifiers: gainModifier(
          [
            ...activeEffects(
              next,
              cfg.titles,
              cfg.society.professions,
              cfg.mentors?.mentors,
              cfg.legacy?.artifactGainFactor,
            ),
            ...activeBookEffects(next, cfg.books),
          ],
          kind,
          skillId,
        ),
      },
      cfg.gain,
    );
    // R-01：営みの経験にも揺らぎが掛かる
    const applied = amount * gainFactor(skill.value);
    skill.pending += applied;
    skill.lastUsedDay = next.time.day;
    events.push({ type: "gainApplied", skill: skillId, amount: applied });
  };

  /** 品物の増減を state に反映し、対応するイベントを出す（P-02） */
  const giveItem = (id: string, n: number): void => {
    if (n <= 0) return;
    next = { ...next, life: withItem(next, id, n) };
    events.push({ type: "itemGot", id, n });
  };
  const takeItem = (id: string, n: number): void => {
    if (n <= 0) return;
    next = { ...next, life: withItem(next, id, -n) };
    events.push({ type: "itemSpent", id, n });
  };
  /** 仲を深める（bondOf の上限まで。amount<=0 のときは「会えなかった」だけを出す） */
  const deepen = (npc: string, amount: number): void => {
    if (amount <= 0) {
      events.push({ type: "bonded", npc, amount: 0, total: bondOf(next, npc, cfg.life!) });
      return;
    }
    const total = Math.min(cfg.life!.bondMax, bondOf(next, npc, cfg.life!) + amount);
    next = {
      ...next,
      life: { ...next.life, bonds: { ...next.life.bonds, [npc]: total } },
    };
    events.push({ type: "bonded", npc, amount, total });
  };

  /**
   * 散策・地点の出来事1件の小さな効果を state に反映する（P-02/G-01。
   * 金・拾い物・出会い・見聞・経験・疲労・旗印・祈り —— stroll と spot で同じ処理）。
   * 結末の一文は呼び出し側が strollOutcome イベントとして出す
   */
  const applyLifeOutcome = (outcome: import("./life/index.js").LifeOutcome): void => {
    if (outcome.money !== undefined && outcome.money !== 0) {
      const amount = Math.trunc(outcome.money);
      next = {
        ...next,
        player: { ...next.player, money: Math.max(0, next.player.money + amount) },
      };
      if (amount > 0) events.push({ type: "moneyPaid", amount });
    }
    for (const [id, n] of Object.entries(outcome.items ?? {})) {
      giveItem(id, Math.trunc(n));
    }
    if (outcome.npc !== undefined) {
      deepen(outcome.npc, outcome.bond ?? cfg.life!.social.talk.bond * 0.8);
    }
    if (outcome.gain !== undefined && outcome.gain.amount !== 0) {
      grantPending(outcome.gain.skill, outcome.gain.amount);
    }
    if (outcome.fatigue !== undefined && outcome.fatigue !== 0) {
      next = {
        ...next,
        player: {
          ...next.player,
          fatigue: Math.max(0, Math.min(100, next.player.fatigue + outcome.fatigue)),
        },
      };
    }
    if (outcome.flag !== undefined) {
      next = { ...next, flags: { ...next.flags, [outcome.flag]: true } };
    }
    if (outcome.pray === true) {
      // 祈りの刻印（G-01。祠などの地点の出来事）：その日の眠りが少し深くなる
      next = { ...next, life: { ...next.life, prayedDay: next.time.day } };
    }
    if (outcome.atom !== undefined) {
      // 手がかり：アトムを読み終えたことにする（出来事の atom と同じ道。
      // 読み済みなら何も起きない）
      const res = readAtom(next, outcome.atom, cfg.lore);
      if (res.ok) {
        next = res.state;
        events.push({ type: "atomRead", id: outcome.atom });
        for (const f of res.newFacts) events.push({ type: "factLearned", id: f });
        for (const c of res.connections) {
          events.push({ type: "loreConnection", id: c.eventId, flag: c.flag });
        }
      }
    }
  };

  switch (command.type) {
    case "wait": {
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "wait", cfg.body);
      events.push({ type: "actionPerformed", kind: "wait", day: next.time.day });
      break;
    }
    case "travel": {
      // 街の外への移動（P-01）：行動を outsideCost 回消費する。残が足りなければ動けない
      const cost = Math.max(1, Math.round(cfg.travel?.outsideCost ?? 1));
      if (next.time.action + cost > cfg.time.actionsPerDay) break;
      for (let i = 0; i < cost; i++) {
        next.time = advanceTime(next.time, cfg.time);
        next = applyActionLoad(next, "travel", cfg.body);
      }
      events.push({
        type: "actionPerformed",
        kind: "travel",
        day: next.time.day,
        ...(command.to !== undefined ? { target: command.to } : {}),
      });
      // 長い道のり（K-01）：健脚・地理・旅慣れの技能に少し経験が入る（travel.gain）
      grantLinkGains("travel.gain");
      break;
    }
    case "sleep":
    case "rest": {
      const from = next.time;
      // K-02：眠りで閃いた技（起床ログの後にイベントとして出すため先に集める）
      const learnedArts: string[] = [];
      // K-03：眠りで形を変えた技・生まれた技・動いた世界（同じく後で出す）
      const evolvedArts: { from: string; to: string; reason: string; hidden: boolean }[] = [];
      const synthArts: string[] = [];
      const uniqGained: { art: string; suppressed?: boolean }[] = [];
      const uniqClaimed: { art: string; rival: string }[] = [];
      // 行動0回で眠る日は休養日（オーバーワーク解除・素質回復）
      const restDay = !next.actionLog.some((e) => e.day === next.time.day);

      // オーバーワークの連続カウントを更新し、今晩の定着係数を決める
      const { overwork, becameOverwork } = updateOverwork(next, cfg.body, restDay);
      next = { ...next, player: { ...next.player, overwork } };
      const capFactor = overwork.active ? cfg.body.overworkConsolidateFactor : 1;

      // 年齢帯（T-36）：終わる日の年齢で係数が決まる（若いと基礎能力、高齢でスキルが伸びやすい）
      const band = cfg.aging ? ageBand(describeTime(from, cfg.time).age, cfg.aging) : undefined;

      // 今日の行動が終わる前に未定着経験を定着させ、起床ログを作る
      const isRest = command.type === "rest";

      // R-01 体調の揺らぎ：目覚める日の「調子」を日×世界シードで抽選し、
      // 睡眠の質と疲労で良い/悪いの重みを傾ける。結果は今晩の定着の質に係数として効く
      // P-02：旅の途中の眠りは野営（campQuality）。食事と祈りはどの眠りにも効く
      const camping = next.life.journey !== null;
      let baseQuality = camping
        ? (cfg.life?.campQuality ?? cfg.body.restQuality)
        : isRest
          ? cfg.body.restQuality
          : sleepQuality(command.inn ?? "normal", command.dinner ?? false, cfg.sleep);
      if (cfg.life !== undefined) {
        baseQuality += mealToday(next) * cfg.life.mealSleepFactor;
        if (prayedToday(next)) baseQuality += cfg.life.praySleepBonus;
      }
      // M-01：生活魔法「灯り」が掛かっていれば今夜の眠りの質に乗る（野営の灯）
      if (cfg.magic !== undefined) {
        const b = consumeLifeBuff(next.counters, "campBonus");
        if (b.value > 0) {
          next = { ...next, counters: b.counters };
          baseQuality += b.value;
        }
      }
      const condition =
        cfg.variance !== undefined
          ? rollCondition(
              next.seed,
              sleepTime(next.time).day,
              baseQuality,
              next.player.fatigue,
              cfg.variance.condition,
            )
          : { kind: "normal" as const, factor: 1 };

      // K-01：祈祷・治癒・薬膳などの技能が睡眠の質を上げる（sleep.quality リンク）
      const linkQuality = 1 + linkSum(cfg.links, "sleep.quality", next.player.skills);
      const { state: rested, report } = consolidateSleep(
        next,
        isRest ? "normal" : (command.inn ?? "normal"),
        isRest ? false : (command.dinner ?? false),
        cfg.sleep,
        {
          capFactor,
          skillFactor: band?.skillFactor,
          ...(isRest || cfg.variance !== undefined || linkQuality !== 1
            ? { qualityOverride: baseQuality * condition.factor * linkQuality }
            : {}),
          names: cfg.skillNames,
        },
      );
      next = rested;
      // 体調の行は「驚き」の列に載せる（加齢の兆候と同じ扱い）
      if (condition.kind === "good" && cfg.variance?.texts?.conditionGood !== undefined) {
        report.surprises.push(cfg.variance.texts.conditionGood);
      }
      if (condition.kind === "poor" && cfg.variance?.texts?.conditionPoor !== undefined) {
        report.surprises.push(cfg.variance.texts.conditionPoor);
      }

      // 身体側の定着：負荷 → 基礎能力、疲労回復、休養日の素質回復
      const bodyRes = consolidateBody(next, report.quality, cfg.body, {
        restDay,
        capFactor,
        statFactor: band?.statFactor,
        // 傾向・誓約（T-45/T-46）：素質回復への修飾（例：飢饉・癒えにくい身体の誓いで半減）
        potentialFactor: worldFactor(fate, "restPotentialFactor"),
      });
      next = bodyRes.state;
      report.lines.push(...bodyRes.lines);
      report.lines.sort((a, b) => a.delta - b.delta);
      report.fatigue.to = next.player.fatigue;
      report.overwork = { active: overwork.active, became: becameOverwork };
      report.restDay = restDay;

      // K-02：気力・魔力は眠りで満たす（09 §2）。上限は定着後の基礎能力から
      // 引き、装備中のパッシブ（kiMax/manaMax）が乗る。
      // 使って貯めた技の経験は眠りで定着し、定着で技能値が閾値を越えれば
      // 新しい技を閃く（§7.1）—— どちらも起床ログに載る
      if (cfg.arts !== undefined) {
        // パッシブの気力・魔力上限ボーナスは戦闘と同じ解決（combat.arts を通す）
        const fx = cfg.combat.arts !== undefined ? passiveFxOf(next.player, cfg.combat) : {};
        next = {
          ...next,
          player: {
            ...next.player,
            ki: kiMaxOf(next.player.stats, cfg.arts, fx["kiMax"] ?? 0),
            mana: manaMaxOf(next.player.stats, cfg.arts, fx["manaMax"] ?? 0),
          },
        };
        const cons = consolidateArts(next, cfg.arts);
        next = cons.state;
        if (cons.levelUps.length > 0) report.arts = cons.levelUps;
        const learn = checkArtsLearn(next, cfg.arts);
        next = learn.state;
        if (learn.learned.length > 0) {
          report.artsLearned = learn.learned;
          learnedArts.push(...learn.learned);
        }
        // K-03：定着の直後、Lv10 に達した技が使い方の記録（artTags）と
        // 最も合う分岐へ形を変える。隠し分岐は極端な使い方にだけ通じる
        if (cfg.evolution !== undefined) {
          const evo = checkEvolution(next, cfg.arts, cfg.evolution);
          next = evo.state;
          evolvedArts.push(...evo.evolved);
        }
      }

      // 翌日の追い風を抽選して保持し、起床ログに含める
      const rng = restoreRng(next.rng);
      let winds = rollTailwind(next, rng, cfg.tailwind);
      // 誓約「追い風なし」（T-46）：tailwind 方向だけを落とす（逆風は残る）
      if (fate.noTailwind) winds = winds.filter((w) => w.direction !== "tailwind");
      next.rng = rng.state();
      next.today = { ...next.today, winds };
      report.tailwinds = winds.map((w) => ({
        id: w.id,
        label: w.label,
        direction: w.direction,
      }));
      // 宿代を払う（rest・自宅・旅の野営は無料）。傾向・誓約で変動する（T-45/T-46）
      if (!isRest && !camping) {
        const cost = Math.round(
          (cfg.sleep.innCost?.[command.inn ?? "normal"] ?? 0) * worldFactor(fate, "innCostFactor"),
        );
        next = {
          ...next,
          player: { ...next.player, money: Math.max(0, next.player.money - cost) },
        };
      }

      next.time = sleepTime(next.time);
      next = resetDailyNotify(next); // 日付が変わると通知予算はリセット

      // K-03：眠りのあいだに世界が動く（09 §7）。
      // 定着で揃った条件の響き合い・ユニークの獲得判定を先に行い、それでも
      // 誰の手にも渡っていないユニークへライバルの先取りを終わった日
      // （from.day）の世界シード抽選で行う —— 先に満たした者が取る。
      // 獲得のS通知は新しい日の予算を使う（朝刊に載る出来事として届く）
      if (cfg.arts !== undefined) {
        const k = k03Checks();
        synthArts.push(...k.synthesized);
        uniqGained.push(...k.gained);
        if (cfg.uniques !== undefined) {
          const rc = checkRivalClaims(next, cfg.uniques, from.day);
          next = rc.state;
          for (const c of rc.claimed)
            uniqClaimed.push({ art: c.art, rival: `rival.${c.rivalIndex}` });
        }
      }

      // P-02 旅の途中：野営で残り日数を1つ減らし、0 の朝に着く
      if (camping && cfg.life !== undefined && next.life.journey !== null) {
        const j = { ...next.life.journey, daysLeft: next.life.journey.daysLeft - 1 };
        if (j.daysLeft <= 0) {
          next = { ...next, life: { ...next.life, town: j.to, journey: null } };
          events.push({ type: "journeyArrived", town: j.to });
          const arrive =
            cfg.life.texts?.arrive?.replaceAll("{town}", townName(j.to, cfg.life)) ??
            `――${townName(j.to, cfg.life)}に着いた。`;
          report.surprises.push(arrive);
        } else {
          next = { ...next, life: { ...next.life, journey: j } };
        }
      }

      // 天候（X-13）：新しい朝の空を seed+day から導出して起床レポートに載せる。
      // 風景として滲ませるだけ —— 常時ステータス表示にはしない（W-04 の間接表現と同系統）
      if (cfg.weather !== undefined) {
        const w = weatherOf(next.seed, next.time.day, cfg.weather, cfg.time);
        report.weather = { id: w.kind.id, name: w.kind.name, line: w.line };
      }

      // R-01 「冴え」の日：新しい日の冴えを seed+day から導出し、起床レポートに載せる。
      // 効果は gainFactor がその日の経験に掛ける係数として効く
      if (cfg.variance !== undefined && cfg.variance.texts?.insight !== undefined) {
        if (insightOf(next.seed, next.time.day, cfg.variance.gain).active) {
          report.surprises.push(cfg.variance.texts.insight);
        }
      }

      // 加齢（T-36）：新しい朝の年齢で「老いの兆候」と老衰死を判定する（06 §1）
      const agingEvents: ActionEvent[] = [];
      if (cfg.aging) {
        const aged = agingOnWake(next, cfg.aging, cfg.time, cfg.combat.deathPendingFactor);
        next = aged.state;
        if (aged.signLine !== null) report.surprises.push(aged.signLine);
        agingEvents.push(...aged.events);
      }

      // 世界の危機（W-01）：季節が変わった変わり目にだけ進行する。
      // 未抽選の世界（v15 以前のセーブ）はこの変わり目に抽選される（移行の口）。
      // 危機の出来事は世界の記録（crisis.log）とイベントに残る
      const crisisEvents: ActionEvent[] = [];
      if (cfg.crisis) {
        const turned = crisisSeasonTurn(next, cfg.crisis, cfg.time, from);
        next = turned.state;
        crisisEvents.push(...turned.events);
      }

      events.push({ type: "slept", from, to: next.time });
      events.push({ type: "wakeReport", report });
      // ランク帯を越えた定着（F-01）：起床レポートの直後に節目のイベントを出す。
      // 表示側はこれを起床ログの区切り・通知として描く（F-02 の演出材料）
      for (const r of report.rankUps) {
        events.push({
          type: "skillRankUp",
          skill: r.skill,
          fromRank: r.fromRank,
          toRank: r.toRank,
        });
      }
      // 眠りで閃いた技（K-02）：起床ログの節目として出す
      for (const id of learnedArts) events.push({ type: "artLearned", id });
      // K-03：形を変えた技 → 響き合いで生まれた技 → 世界に刻まれた
      // ユニークの順で節目として出す（通知ランクはそれぞれ A・B・S/A）
      for (const e of evolvedArts) events.push({ type: "artEvolved", ...e });
      for (const id of synthArts) events.push({ type: "artSynthesized", id });
      for (const u of uniqGained) events.push({ type: "uniqueGained", ...u });
      for (const c of uniqClaimed) events.push({ type: "uniqueClaimed", ...c });
      events.push(...agingEvents);
      events.push(...crisisEvents);
      break;
    }
    case "train": {
      const skill = next.player.skills[command.skill];
      if (!skill) throw new Error(`train: 未知のスキル ${command.skill}`);
      // 派生スキルは解放済み（flags）でないと鍛えられない（T-28）
      const unlockCond = cfg.skillUnlocks?.find((u) => u.id === command.skill)?.condition;
      if (unlockCond && next.flags[`skill.unlock.${command.skill}`] !== true) {
        throw new Error(`train: 未解放のスキル ${command.skill}`);
      }

      const repeats = recentRepeats(
        next.actionLog,
        "train",
        command.skill,
        cfg.gain.noveltyWindow,
        String(command.difficulty),
      );
      const { amount } = computeGain(
        {
          kind: "train",
          skill: skill.value,
          delta: command.difficulty - skill.value,
          repeats,
          potential: skill.potential,
          fatigue: next.player.fatigue,
          wind: windFor(next, "train", command.skill),
          // M 項：称号・認定職・師匠（T-27）に加えて、読了した書物の期間効果（T-26）も積に入る
          modifiers: gainModifier(
            [
              ...activeEffects(
                next,
                cfg.titles,
                cfg.society.professions,
                cfg.mentors?.mentors,
                cfg.legacy?.artifactGainFactor,
              ),
              ...activeBookEffects(next, cfg.books),
            ],
            "train",
            command.skill,
          ),
          failed: command.failed,
          isTraining: true,
        },
        cfg.gain,
      );
      // R-01：同じ訓練でも経験に揺らぎが掛かる（技量が高いほど安定。冴えの日は底上げ）
      const applied = amount * gainFactor(skill.value);
      skill.pending += applied;
      skill.lastUsedDay = next.time.day;
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "train", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "train",
        day: next.time.day,
        target: command.skill,
        variant: String(command.difficulty),
      });
      events.push({ type: "gainApplied", skill: command.skill, amount: applied });
      break;
    }
    case "work": {
      // 技能を使う仕事。作品が台帳に載り、ティア更新なら大きな経験ボーナス
      const skill = next.player.skills[command.kind];
      const skillValue = skill?.value ?? 0;

      // R-01 仕事の揺らぎ：素材の質（日×種目で決まる）と思わぬ出来栄え
      // （会心作/失敗作。技量が高いほど出にくい）を品質と旗に反映する。
      // 手動プレイなど既に旗の付いた作品には重ねない（会心と失敗が矛盾しないように）
      let quality = command.quality;
      let workFlags = [...(command.flags ?? [])];
      if (cfg.variance !== undefined) {
        const v = cfg.variance.work;
        quality *= materialFactor(next.seed, next.time.day, command.kind, v);
        if (workFlags.length === 0) {
          const twist = workTwist(
            next.seed,
            next.time.day,
            `${next.counters["action.work"] ?? 0}:${command.order ?? command.kind}`,
            skillValue,
            v,
          );
          if (twist.flag !== undefined) {
            quality *= twist.factor;
            workFlags = [twist.flag];
          }
        }
        quality = Math.max(0, Math.min(100, quality));
      }
      // M-01：生活魔法の仕事への効果（鍛冶の温度・地力・調合の助け）。
      // 仕事の kind に対応する hook の効果が掛かっていれば品質に乗って消費される
      if (cfg.magic !== undefined) {
        const hook = cfg.magic.lifeWorkKinds.find((h) => h.kinds.includes(command.kind))?.hook;
        if (hook !== undefined) {
          const b = consumeLifeBuff(next.counters, hook);
          if (b.value > 0) {
            next = { ...next, counters: b.counters };
            quality = Math.max(0, Math.min(100, quality + b.value));
            workFlags = [...new Set([...workFlags, "魔法仕上"])];
          }
        }
      }

      const recorded = recordWork(
        next,
        {
          kind: command.kind,
          quality,
          ...(command.order !== undefined ? { order: command.order } : {}),
          ...(workFlags.length > 0 ? { flags: workFlags } : {}),
        },
        cfg.ledger,
      );
      next = recorded.state;
      const repeats = recentRepeats(next.actionLog, "work", command.kind, cfg.gain.noveltyWindow);
      // 称号・認定職・師匠・読了書物の効果（T-35・T-27・T-26）：M 項の修正と報酬の値段変化
      const effects = [
        ...activeEffects(
          next,
          cfg.titles,
          cfg.society.professions,
          cfg.mentors?.mentors,
          cfg.legacy?.artifactGainFactor,
        ),
        ...activeBookEffects(next, cfg.books),
      ];
      const { amount } = computeGain(
        {
          kind: "work",
          skill: skillValue,
          delta: command.difficulty ?? command.quality - skillValue,
          repeats,
          potential: skill?.potential ?? 0,
          fatigue: next.player.fatigue,
          wind: windFor(next, "work", command.kind),
          // K-01：生活魔法・教授・妙技が仕事の経験に乗る（work.exp リンク）
          modifiers:
            (command.expFactor ?? 1) *
            gainModifier(effects, "work", command.kind) *
            (1 + linkSum(cfg.links, "work.exp", next.player.skills)),
        },
        cfg.gain,
      );
      // R-01：仕事の経験にも揺らぎが掛かる
      const applied = amount * gainFactor(skillValue);
      if (skill) {
        skill.pending += applied + (recorded.tierUp ? cfg.ledger.tierUpBonusPending : 0);
        skill.lastUsedDay = next.time.day;
      }
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "work", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "work",
        day: next.time.day,
        target: command.kind,
        ...(command.order !== undefined ? { variant: command.order } : {}),
      });
      events.push({ type: "gainApplied", skill: command.kind, amount: applied });
      events.push({ type: "workRecorded", work: recorded.work });
      if (recorded.tierUp) {
        events.push({ type: "tierUp", kind: command.kind, tier: recorded.work.tier });
      }
      // 報酬が入る（注文の約定額があればそれ、無ければ市場価値。認定の値段変化と
      // 傾向・誓約の報酬係数（T-45/T-46）、危機の物価変動（W-01）、
      // 天候の日替わり係数（X-13）、そして市場の日次・季節の相場と客の機嫌
      // （R-01）を乗せる）
      const variancePay =
        cfg.variance !== undefined
          ? marketFactor(
              next.seed,
              next.time.day,
              command.kind,
              describeTime(next.time, cfg.time).season,
              cfg.time.seasonsPerYear,
              cfg.variance.market,
            ) *
            customerMoodFactor(
              next.seed,
              next.time.day,
              command.order ?? command.kind,
              cfg.variance.work,
            )
          : 1;
      const pay = Math.max(
        0,
        Math.round(
          (command.rewardMoney ?? recorded.work.marketValue) *
            priceFactor(effects, command.kind) *
            // K-01：値切り・算術・目利き商いなどが売値を上げる（work.price リンク）
            (1 + linkSum(cfg.links, "work.price", next.player.skills)) *
            worldFactor(fate, "rewardFactor") *
            crisisPriceFactor(next, cfg.crisis, command.kind) *
            weatherPriceFactor(next, cfg.weather, cfg.time, command.kind) *
            variancePay,
        ),
      );
      next = {
        ...next,
        player: { ...next.player, money: next.player.money + pay },
      };
      events.push({ type: "moneyPaid", amount: pay });
      // 町ごとの評判（G-01）：仕事をこなすと場所の属する町で顔が売れる
      if (cfg.life?.rep !== undefined) {
        const workTown =
          (command.place !== undefined ? cfg.life.places?.[command.place]?.town : undefined) ??
          townOf(next);
        next = { ...next, life: withRep(next, workTown, cfg.life.rep.work, cfg.life) };
        events.push({
          type: "repGained",
          town: workTown,
          amount: cfg.life.rep.work,
          total: repOf(next, workTown, cfg.life),
        });
      }
      // 接点（W-02、docs/08 §5）：注文が今日の危機の接点なら、世界の備えに寄与する。
      // 通常の注文と同じ流れで積むだけ —— 提示を受けない・無視する側には何も起きない。
      // 確認は入力時点の state（＝画面に出ていた今日の提示）に対して行う：
      // この行動で日をまたいでも、提示を受けた日の接点として達成になる
      if (command.order !== undefined && cfg.crisis !== undefined) {
        const tp = crisisTouchpointForWork(
          state,
          cfg.crisis,
          cfg.time,
          command.order,
          command.kind,
          condEnv,
        );
        if (tp !== null) {
          // K-01：統率・祈祷・歌唱が世界の備えへの寄与を底上げする（crisis.contrib）
          const amount =
            (cfg.crisis.touchpoints?.contribution.work ?? 0) *
            (1 + linkSum(cfg.links, "crisis.contrib", next.player.skills));
          next = addHeroContribution(next, tp.field, amount);
          events.push({ type: "crisisTouchpoint", id: tp.id, field: tp.field, amount });
        }
      }
      break;
    }
    case "combat": {
      // 戦闘も行動：武器技能と回避に経験が入る（kind "combat" の B）
      const repeats = recentRepeats(
        next.actionLog,
        "combat",
        command.enemyId,
        cfg.gain.noveltyWindow,
      );
      const effects = [
        ...activeEffects(
          next,
          cfg.titles,
          cfg.society.professions,
          cfg.mentors?.mentors,
          cfg.legacy?.artifactGainFactor,
        ),
        ...activeBookEffects(next, cfg.books),
      ];
      // K-01：経験が入るのは「使った武器の技能」＋回避。
      // 持ち替えて戦えば、その武器の技能（槍術・弓術・格闘…）が育つ
      const usedWeaponSkill =
        cfg.weapons?.[command.weapon ?? next.player.weapon]?.skill ?? "swordplay";
      for (const skillId of new Set([usedWeaponSkill, "evasion"])) {
        const skill = ensureSkillRecord(skillId);
        if (!skill) continue;
        const { amount } = computeGain(
          {
            kind: "combat",
            skill: skill.value,
            delta: command.difficulty - skill.value,
            repeats,
            potential: skill.potential,
            fatigue: next.player.fatigue,
            wind: windFor(next, "combat", skillId),
            modifiers:
              gainModifier(effects, "combat", skillId, command.enemyId) *
              worldFactor(fate, "combatGainFactor"),
            failed: !command.won,
          },
          cfg.gain,
        );
        const applied = amount * gainFactor(skill.value);
        skill.pending += applied;
        skill.lastUsedDay = next.time.day;
        events.push({ type: "gainApplied", skill: skillId, amount: applied });
      }
      // 獣との戦い（K-01）：狩猟・動物知識などに少し経験が入る（beast.exp）
      if (command.beast === true) grantLinkGains("beast.exp");

      // K-02：戦闘の武技まわりを世界に畳む（09 §1・§7.1）。
      // 気力の持ち越し → 使用記録の集計 → 技の経験（眠りで定着）→ 習得判定
      if (cfg.arts !== undefined) {
        if (command.kiLeft !== undefined) {
          next = {
            ...next,
            player: { ...next.player, ki: Math.max(0, round1(command.kiLeft)) },
          };
        }
        // M-01：魔力の持ち越し（combatResult.manaLeft → player.mana）
        if (command.manaLeft !== undefined) {
          next = {
            ...next,
            player: { ...next.player, mana: Math.max(0, round1(command.manaLeft)) },
          };
        }
        // M-01：見取り稽古 —— 観察中に見届けた敵の呪文は見知りの旗になる
        if (cfg.magic !== undefined && command.seenSpells !== undefined) {
          const flags = { ...next.flags };
          let seenNew = false;
          for (const id of command.seenSpells) {
            const key = `spell.seen.${id}`;
            if (flags[key] !== true) {
              flags[key] = true;
              seenNew = true;
            }
          }
          if (seenNew) next = { ...next, flags };
        }
        const uses = command.uses ?? [];
        if (uses.length > 0) {
          const rec = recordArtUse(next.player.artTags, next.player.skillTags, uses);
          // 使った技に経験が入る（相手の格で上がる。09 §1）
          const arts = { ...next.player.arts };
          const weaponSkillVal = next.player.skills[usedWeaponSkill]?.value ?? 0;
          const gain = artExpGain(command.difficulty, weaponSkillVal, cfg.arts);
          for (const u of uses) {
            if (u.id === undefined) continue;
            const a = arts[u.id];
            if (a !== undefined) arts[u.id] = { ...a, pending: a.pending + gain };
          }
          next = {
            ...next,
            player: {
              ...next.player,
              arts,
              artTags: rec.artTags,
              skillTags: rec.skillTags,
            },
          };
        }
        // M-01：呪文の使用を世界に刻む（使用回数・属性別・生活魔法の合計）
        // —— 生活魔法を使い続けると派生が覚える条件（learn.counter）が読む
        if (cfg.magic !== undefined && uses.length > 0) {
          const counters = { ...next.counters };
          const spellSkills = new Set<string>();
          for (const u of uses) {
            if (u.id === undefined) continue;
            const def = cfg.arts.defs[u.id];
            const sp = def?.spell;
            if (sp === undefined) continue;
            counters[`spell.cast.${u.id}`] = (counters[`spell.cast.${u.id}`] ?? 0) + 1;
            counters[`spell.cast.el.${sp.element}`] =
              (counters[`spell.cast.el.${sp.element}`] ?? 0) + 1;
            if (def!.kind === "life")
              counters["spell.cast.life"] = (counters["spell.cast.life"] ?? 0) + 1;
            spellSkills.add(def!.skill);
          }
          // 呪文の技能にも戦闘の経験が入る（武器技能と同じ式で、技量差で伸びる）
          for (const skillId of spellSkills) {
            const skill = ensureSkillRecord(skillId);
            if (skill === undefined) continue;
            const { amount } = computeGain(
              {
                kind: "combat",
                skill: skill.value,
                delta: command.difficulty - skill.value,
                repeats,
                potential: skill.potential,
                fatigue: next.player.fatigue,
                wind: windFor(next, "combat", skillId),
                modifiers: worldFactor(fate, "combatGainFactor"),
                failed: !command.won,
              },
              cfg.gain,
            );
            const applied = amount * gainFactor(skill.value);
            skill.pending += applied;
            skill.lastUsedDay = next.time.day;
            events.push({ type: "gainApplied", skill: skillId, amount: applied });
          }
          next = { ...next, counters };
        }
        // 習得判定（09 §7.1）：使い方の傾き＋技能値で新しい技を閃く
        const learn = checkArtsLearn(next, cfg.arts);
        next = learn.state;
        for (const id of learn.learned) events.push({ type: "artLearned", id });
        // K-03：揃った技・刻印の響き合いとユニークの獲得もこの瞬間に起きる
        const k = k03Checks();
        for (const id of k.synthesized) events.push({ type: "artSynthesized", id });
        for (const u of k.gained) events.push({ type: "uniqueGained", ...u });
      }

      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "combat", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "combat",
        day: next.time.day,
        target: command.enemyId,
        // 接点の相手なら variant に接点の id を刻む（同日達成済みの再接点を弾く根拠。W-02）
        ...(command.touchpoint !== undefined ? { variant: command.touchpoint } : {}),
      });
      events.push({
        type: "combatEnded",
        enemyId: command.enemyId,
        won: command.won,
        fled: command.fled ?? false,
      });
      // 撃破数と死は年代記に残る（カウンタで条件DSL・称号が読める）
      const counters = { ...next.counters };
      if (command.won) {
        const key = `kill.species.${command.enemyId}`;
        counters[key] = (counters[key] ?? 0) + 1;
        // 強個体の討伐は別系統でも数える（T-44。図鑑・称号の条件用）
        if (command.unique === true) {
          const uKey = `kill.unique.${command.enemyId}`;
          counters[uKey] = (counters[uKey] ?? 0) + 1;
          counters["kill.unique.total"] = (counters["kill.unique.total"] ?? 0) + 1;
          events.push({ type: "uniqueDefeated", enemyId: command.enemyId });
        }
      }
      if (command.died) {
        counters["death.count"] = (counters["death.count"] ?? 0) + 1;
        // 教会蘇生：未定着経験の半分を失う。数値そのものは下がらない（03 §4）。
        // 医術・治癒・施療の技能があれば残る分が増える（death.keep、K-01）
        const skills = { ...next.player.skills };
        const keep = deathKeepFactor();
        for (const id of Object.keys(skills)) {
          const s = skills[id]!;
          skills[id] = { ...s, pending: s.pending * keep };
        }
        next = { ...next, player: { ...next.player, skills } };
        events.push({ type: "died" });
      }
      next = { ...next, counters };
      // 接点（W-02）：接点の相手に勝ったときだけ、世界の備えに寄与する。
      // 負け・逃げ・提示外の相手では何も起きない。
      // 確認は仕事と同じく入力時点の state（＝画面に出ていた今日の提示）に対して行う
      if (command.won && command.touchpoint !== undefined && cfg.crisis !== undefined) {
        const tp = crisisTouchpointForCombat(
          state,
          cfg.crisis,
          cfg.time,
          command.touchpoint,
          command.enemyId,
          condEnv,
        );
        if (tp !== null) {
          // K-01：crisis.contrib リンク（統率・祈祷・歌唱）で寄与が底上げされる
          const amount =
            (cfg.crisis.touchpoints?.contribution.combat ?? 0) *
            (1 + linkSum(cfg.links, "crisis.contrib", next.player.skills));
          next = addHeroContribution(next, tp.field, amount);
          events.push({ type: "crisisTouchpoint", id: tp.id, field: tp.field, amount });
        }
      }
      break;
    }
    case "abyss": {
      // 深層ダンジョン（T-43、06 §3B）：潜行1回＝1行動。層ごとの撃破に戦闘と同じ
      // 経験を入れ、到達深度を counters（abyss.best 等）に記録する。
      // GameState の形は変えないのでセーブバージョン据置
      if (!canAct(next.time, cfg.time)) break;
      const counters = { ...next.counters };
      const effects = [
        ...activeEffects(
          next,
          cfg.titles,
          cfg.society.professions,
          cfg.mentors?.mentors,
          cfg.legacy?.artifactGainFactor,
        ),
        ...activeBookEffects(next, cfg.books),
      ];
      // 層ごとの戦闘を順に反映する。同じラン内での同種連戦も反復として数える
      const inRun = new Map<string, number>();
      const applyFight = (fight: { enemyId: string; difficulty: number }, won: boolean) => {
        const repeats =
          recentRepeats(next.actionLog, "combat", fight.enemyId, cfg.gain.noveltyWindow) +
          (inRun.get(fight.enemyId) ?? 0);
        // K-01：深層でも経験が入るのは使った武器の技能＋回避
        // （ラン中の持ち替えは command.weapon＝最後に構えていた武器に入る）
        const usedWeaponSkill =
          cfg.weapons?.[command.weapon ?? next.player.weapon]?.skill ?? "swordplay";
        for (const skillId of new Set([usedWeaponSkill, "evasion"])) {
          const skill = ensureSkillRecord(skillId);
          if (!skill) continue;
          const { amount } = computeGain(
            {
              kind: "combat",
              skill: skill.value,
              delta: fight.difficulty - skill.value,
              repeats,
              potential: skill.potential,
              fatigue: next.player.fatigue,
              wind: windFor(next, "combat", skillId),
              modifiers:
                gainModifier(effects, "combat", skillId, fight.enemyId) *
                worldFactor(fate, "combatGainFactor"),
              failed: !won,
            },
            cfg.gain,
          );
          const applied = amount * gainFactor(skill.value);
          skill.pending += applied;
          skill.lastUsedDay = next.time.day;
          events.push({ type: "gainApplied", skill: skillId, amount: applied });
        }
        inRun.set(fight.enemyId, (inRun.get(fight.enemyId) ?? 0) + 1);
        // 行動ログの kind は "combat"（新規性・新聞の記事分類を共有）、variant で深層を区別
        events.push({
          type: "actionPerformed",
          kind: "combat",
          day: next.time.day,
          target: fight.enemyId,
          variant: "abyss",
        });
        events.push({
          type: "combatEnded",
          enemyId: fight.enemyId,
          won,
          fled: !won && command.end === "fled",
        });
        if (won) {
          const key = `kill.species.${fight.enemyId}`;
          counters[key] = (counters[key] ?? 0) + 1;
        }
      };
      for (const k of command.kills ?? []) applyFight(k, true);
      // 未決着の層（逃走・死亡・灯り切れで中断した戦闘）も失敗経験を入れる
      if (command.loss !== undefined) applyFight(command.loss, false);

      // K-02：ラン中の武技まわりを畳む（combat と同じ処理。経験は最深の格で入る）
      if (cfg.arts !== undefined) {
        if (command.kiLeft !== undefined) {
          next = {
            ...next,
            player: { ...next.player, ki: Math.max(0, round1(command.kiLeft)) },
          };
        }
        // M-01：ラン中の魔力の持ち越し
        if (command.manaLeft !== undefined) {
          next = {
            ...next,
            player: { ...next.player, mana: Math.max(0, round1(command.manaLeft)) },
          };
        }
        // M-01：ラン中の見取り稽古（combat と同じく見知りの旗に畳む）
        if (cfg.magic !== undefined && command.seenSpells !== undefined) {
          const flags = { ...next.flags };
          let seenNew = false;
          for (const id of command.seenSpells) {
            const key = `spell.seen.${id}`;
            if (flags[key] !== true) {
              flags[key] = true;
              seenNew = true;
            }
          }
          if (seenNew) next = { ...next, flags };
        }
        const uses = command.uses ?? [];
        if (uses.length > 0) {
          const rec = recordArtUse(next.player.artTags, next.player.skillTags, uses);
          const top = Math.max(
            0,
            ...(command.kills ?? []).map((k) => k.difficulty),
            command.loss?.difficulty ?? 0,
          );
          const weaponSkillVal =
            next.player.skills[
              cfg.weapons?.[command.weapon ?? next.player.weapon]?.skill ?? "swordplay"
            ]?.value ?? 0;
          const gain = artExpGain(top, weaponSkillVal, cfg.arts);
          const arts = { ...next.player.arts };
          for (const u of uses) {
            if (u.id === undefined) continue;
            const a = arts[u.id];
            if (a !== undefined) arts[u.id] = { ...a, pending: a.pending + gain };
          }
          next = {
            ...next,
            player: { ...next.player, arts, artTags: rec.artTags, skillTags: rec.skillTags },
          };
        }
        // M-01：ラン中の呪文使用も同じ刻印を刻む（combat と同じ。
        // この case の counters は末尾で next に畳まれるので、その変数に積む）
        if (cfg.magic !== undefined && uses.length > 0) {
          for (const u of uses) {
            if (u.id === undefined) continue;
            const def = cfg.arts.defs[u.id];
            const sp = def?.spell;
            if (sp === undefined) continue;
            counters[`spell.cast.${u.id}`] = (counters[`spell.cast.${u.id}`] ?? 0) + 1;
            counters[`spell.cast.el.${sp.element}`] =
              (counters[`spell.cast.el.${sp.element}`] ?? 0) + 1;
            if (def!.kind === "life")
              counters["spell.cast.life"] = (counters["spell.cast.life"] ?? 0) + 1;
          }
        }
        const learn = checkArtsLearn(next, cfg.arts);
        next = learn.state;
        for (const id of learn.learned) events.push({ type: "artLearned", id });
        // K-03：揃った技・刻印の響き合いとユニークの獲得もこの瞬間に起きる
        const k = k03Checks();
        for (const id of k.synthesized) events.push({ type: "artSynthesized", id });
        for (const u of k.gained) events.push({ type: "uniqueGained", ...u });
      }

      // 潜行自体：時間を1行動分だけ進め、負荷を積む
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "abyss", cfg.body);
      events.push({ type: "actionPerformed", kind: "abyss", day: next.time.day });

      // 到達深度の記録（自己ベストは counters で十分：D-34。年代記・記録画面はここを読む）
      counters["abyss.runs"] = (counters["abyss.runs"] ?? 0) + 1;
      counters["abyss.floors"] = (counters["abyss.floors"] ?? 0) + (command.kills?.length ?? 0);
      const depth = command.kills?.length ?? 0;
      const prevBest = counters["abyss.best"] ?? 0;
      const newBest = depth > prevBest;
      if (newBest) counters["abyss.best"] = depth;
      events.push({
        type: "abyssEnded",
        end: command.end,
        depth,
        best: newBest ? depth : prevBest,
        newBest,
      });

      if (command.end === "died") {
        counters["death.count"] = (counters["death.count"] ?? 0) + 1;
        // 教会蘇生：未定着経験の半分を失う。深層で死んでも扱いは戦闘死と同じ（03 §4）
        // K-01：医術・治癒・施療が蘇生を手厚くする（death.keep リンク）
        const skills = { ...next.player.skills };
        const keep = deathKeepFactor();
        for (const id of Object.keys(skills)) {
          const s = skills[id]!;
          skills[id] = { ...s, pending: s.pending * keep };
        }
        next = { ...next, player: { ...next.player, skills } };
        events.push({ type: "died" });
      }
      next = { ...next, counters };
      break;
    }
    case "acceptOffer": {
      // 打診の受諾：行動は消費しない（認定は会話の一瞬）
      const res = acceptOffer(next, cfg.society, command.id);
      if (!res.ok) break;
      next = res.state;
      events.push({ type: "offerAccepted", id: command.id });
      break;
    }
    case "declareGoal": {
      // 人生目標の宣言：未達成・未宣言のものだけ。行動は消費しない
      const exists = cfg.society.lifeGoals.some(
        (g) => g.id === command.id && !next.society.achievedGoals.includes(g.id),
      );
      if (exists && next.society.goal !== command.id) {
        next = { ...next, society: { ...next.society, goal: command.id } };
        events.push({ type: "goalDeclared", id: command.id });
      }
      break;
    }
    case "abandonGoal": {
      if (next.society.goal !== null) {
        next = { ...next, society: { ...next.society, goal: null } };
      }
      break;
    }
    case "donate": {
      // 寄付：1行動を消費して設定額を街に納める（X-9。認定の受諾ではなく日々の奉仕）
      const amount = cfg.donation?.amount;
      if (amount === undefined || amount <= 0) break;
      if (!canAct(next.time, cfg.time)) break;
      if (next.player.money < amount) break;
      next = { ...next, player: { ...next.player, money: next.player.money - amount } };
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "donate", cfg.body);
      events.push({ type: "actionPerformed", kind: "donate", day: next.time.day });
      events.push({ type: "donated", amount });
      // 町ごとの評判（G-01）：奉仕はその町で顔が売れる
      if (cfg.life?.rep !== undefined) {
        const town = townOf(next);
        next = { ...next, life: withRep(next, town, cfg.life.rep.donate, cfg.life) };
        events.push({
          type: "repGained",
          town,
          amount: cfg.life.rep.donate,
          total: repOf(next, town, cfg.life),
        });
      }
      break;
    }
    case "readAtom": {
      // 読むのも行動（1回消費）。読み済み・不明IDは時間だけ使わない
      const res = readAtom(next, command.id, cfg.lore);
      if (!res.ok) break;
      next = res.state;
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "read", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "read",
        day: next.time.day,
        target: command.id,
      });
      events.push({ type: "atomRead", id: command.id });
      for (const f of res.newFacts) events.push({ type: "factLearned", id: f });
      for (const c of res.connections) {
        events.push({ type: "loreConnection", id: c.eventId, flag: c.flag });
      }
      break;
    }
    case "buyBook": {
      // 購入は行動を消費しない（書店への立ち寄り。認定の受諾と同じ扱い）
      const res = buyBook(next, command.id, cfg.books, cfg.time, condEnv);
      if (!res.ok) break;
      next = res.state;
      events.push({ type: "bookBought", id: command.id });
      break;
    }
    case "buyWeapon": {
      // 武器屋での購入（K-01）：行動は消費しない（書店への立ち寄りと同じ扱い）。
      // 売り物（price のある定義）で、未所持・所持金が足りるものだけ買える
      const def = cfg.weapons?.[command.id];
      if (def === undefined || def.price === undefined) break;
      if (next.player.weapons.includes(def.id)) break;
      if (next.player.money < def.price) break;
      next = {
        ...next,
        player: {
          ...next.player,
          money: next.player.money - def.price,
          weapons: [...next.player.weapons, def.id],
        },
      };
      events.push({ type: "weaponBought", id: def.id });
      break;
    }
    case "equipWeapon": {
      // 持ち替え（K-01）：行動は消費しない。所持している武器にだけ替えられる
      if (!next.player.weapons.includes(command.id)) break;
      if (next.player.weapon === command.id) break;
      next = { ...next, player: { ...next.player, weapon: command.id } };
      events.push({ type: "weaponEquipped", id: command.id });
      break;
    }
    case "setBuild": {
      // 武技の構成（K-02、09 §6）：行動は消費しない（街での仕度）。
      // 指定を正規化して入る —— 未習得・種別違い・重複・未所持の武器は削られる
      if (cfg.arts === undefined) break;
      const build = normalizeBuild(next, command, cfg.arts);
      // 武器枠の先頭を本命として装備に反映する（構成の武器と装備を一致させる）
      const main = build.weapons[0];
      next = {
        ...next,
        player: {
          ...next.player,
          build,
          ...(typeof main === "string" && next.player.weapons.includes(main)
            ? { weapon: main }
            : {}),
        },
      };
      events.push({ type: "buildChanged" });
      break;
    }
    case "readBook": {
      // 読むのは行動（1回消費）。未所持・読了済み・不明IDは時間だけ使わない。
      // 行動残が無いときは読めない（期間効果を無料で得る抜け道を塞ぐ）
      if (!canAct(next.time, cfg.time)) break;
      const res = readBook(next, command.id, cfg.books);
      if (!res.ok) break;
      next = res.state;
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "read", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "read",
        day: next.time.day,
        target: command.id,
      });
      events.push({
        type: "bookRead",
        id: command.id,
        recovered: res.recovered,
        ...(res.flag !== undefined ? { flag: res.flag } : {}),
      });
      // 読書の副産物（K-01）：読み書き・古文書の技能に経験が入り（read.gain）、
      // 読み進めるほど文字に強くなりその技能の素質も戻る（read.potential）
      grantLinkGains("read.gain");
      const readPotCap = linkFlatCap(cfg.links, "read.potential");
      for (const [id, coef] of Object.entries(linkFlat(cfg.links, "read.potential"))) {
        const sk = next.player.skills[id];
        if (sk === undefined) continue;
        const frac = Math.min(readPotCap > 0 ? readPotCap : 1, sk.value * coef);
        if (frac <= 0) continue;
        sk.potential = Math.min(
          sk.potentialCap,
          sk.potential + (sk.potentialCap - sk.potential) * frac,
        );
      }
      break;
    }
    case "apprentice": {
      // 弟子入り：行動は消費しない（会話の一瞬。認定の受諾と同じ扱い）
      // R-01：その師匠が今日街にいない日は弟子入りも叶わない
      const def = cfg.mentors?.mentors.find((m) => m.id === command.id);
      if (
        def !== undefined &&
        cfg.variance !== undefined &&
        npcAway(next.seed, next.time.day, def.npc ?? def.id, cfg.variance.npc)
      ) {
        events.push({ type: "mentorAway", id: command.id });
        break;
      }
      const res = apprentice(next, command.id, cfg.mentors, cfg.time, condEnv);
      if (!res.ok) break;
      next = res.state;
      events.push({ type: "mentorApprenticed", id: command.id });
      break;
    }
    case "leaveMentor": {
      const res = leaveMentor(next);
      if (!res.ok) break;
      next = res.state;
      events.push({ type: "mentorLeft", id: res.id! });
      break;
    }
    case "trainWithMentor": {
      // 師匠の稽古（1行動＋礼金）。師匠がいない・礼金不足・行動残なし・
      // 担当スキル不明は何も起きない（readBook と同じく時間も進めない）
      const mentor = currentMentor(next, cfg.mentors);
      if (mentor === null) break;
      // R-01：師匠にも街にいない日がある。その日の稽古は叶わない（行動も消費しない）
      if (
        cfg.variance !== undefined &&
        npcAway(next.seed, next.time.day, mentor.npc ?? mentor.id, cfg.variance.npc)
      ) {
        events.push({ type: "mentorAway", id: mentor.id });
        break;
      }
      if (!canAct(next.time, cfg.time)) break;
      // K-01：教授の技能があれば師も教え方を汲み、礼金が安くなる（mentor.fee リンク）
      const feeFactor = 1 - linkSum(cfg.links, "mentor.fee", next.player.skills);
      const fee = Math.max(0, Math.round(mentor.fee * feeFactor));
      if (next.player.money < fee) break;
      const skill = next.player.skills[mentor.skill];
      if (!skill) break;

      const repeats = recentRepeats(
        next.actionLog,
        "train",
        mentor.skill,
        cfg.gain.noveltyWindow,
        String(command.difficulty),
      );
      const { amount } = computeGain(
        {
          kind: "train",
          skill: skill.value,
          delta: command.difficulty - skill.value,
          repeats,
          potential: skill.potential,
          fatigue: next.player.fatigue,
          wind: windFor(next, "train", mentor.skill),
          // M 項：称号・認定職・師匠の弟子期間効果・読了書物（T-35・T-27・T-26）
          modifiers: gainModifier(
            [
              ...activeEffects(
                next,
                cfg.titles,
                cfg.society.professions,
                cfg.mentors?.mentors,
                cfg.legacy?.artifactGainFactor,
              ),
              ...activeBookEffects(next, cfg.books),
            ],
            "train",
            mentor.skill,
          ),
          isTraining: true,
        },
        cfg.gain,
      );
      const applied = amount * gainFactor(skill.value);
      skill.pending += applied;
      skill.lastUsedDay = next.time.day;

      // 礼金と素質回復・秘伝フラグ（gain の後に清算する。礼金は技能リンクで割引）
      const ses = mentorSession(next, cfg.mentors, feeFactor);
      next = ses.state;

      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "train", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "train",
        day: next.time.day,
        target: mentor.skill,
        variant: String(command.difficulty),
      });
      events.push({ type: "gainApplied", skill: mentor.skill, amount: applied });
      events.push({
        type: "mentorTrained",
        id: mentor.id,
        fee,
        recovered: ses.recovered,
        ...(ses.flag !== undefined ? { flag: ses.flag } : {}),
      });
      break;
    }
    case "crisisFinaleJoin": {
      // 打診に応える：行動は消費しない（会話の一瞬。認定の受諾と同じ扱い）。
      // 届いた打診のある最も早い未決着だけ請けられる —— 応えなくても世界は進む
      if (cfg.crisis === undefined) break;
      const offer = crisisFinaleOffers(next, cfg.crisis).find((o) => o.def.id === command.id);
      if (offer === undefined || !offer.joinable) break;
      events.push({ type: "crisisFinaleJoined", id: command.id });
      break;
    }
    case "crisisFinaleAttempt": {
      // 勝負所に臨む（1行動）。請けた場面に限り、score に応じて世界の備えに足す。
      // 武の勝負所で倒れても世界は進む —— 死の扱いは戦闘と同じ（03 §4）
      if (cfg.crisis === undefined || !canAct(next.time, cfg.time)) break;
      const attempt = crisisFinaleAttempt(next, cfg.crisis, command.id, command.score);
      if (!attempt.ok) break;
      next = attempt.state;
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "crisis", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "crisis",
        day: next.time.day,
        target: command.id,
        variant: "attempt",
      });
      events.push({
        type: "crisisFinaleAttempt",
        id: command.id,
        score: attempt.score,
        amount: attempt.amount,
      });
      if (command.died === true) {
        const counters = { ...next.counters };
        counters["death.count"] = (counters["death.count"] ?? 0) + 1;
        next = { ...next, counters };
        // K-01：医術・治癒・施療が蘇生を手厚くする（death.keep リンク）
        const skills = { ...next.player.skills };
        const keep = deathKeepFactor();
        for (const id of Object.keys(skills)) {
          const s = skills[id]!;
          skills[id] = { ...s, pending: s.pending * keep };
        }
        next = { ...next, player: { ...next.player, skills } };
        events.push({ type: "died" });
      }
      break;
    }
    case "crisisLead": {
      // 自分で起こす決着（1行動。段階4だけ）。主人公側の備えで場面を今ここで判定し、
      // 決着がつけば終幕まで進む。時期を早められる・やり方を選べる（docs/08 §6）
      if (cfg.crisis === undefined || !canAct(next.time, cfg.time)) break;
      const led = crisisFinaleLead(next, cfg.crisis, command.id, command.field);
      if (!led.ok) break;
      next = led.state;
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "crisis", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "crisis",
        day: next.time.day,
        target: command.id,
        variant: "lead",
      });
      events.push({
        type: "crisisFinaleLed",
        id: command.id,
        success: led.success === true,
        total: led.total ?? 0,
      });
      if (next.crisis !== null && next.crisis.outcome !== "ongoing") {
        events.push({ type: "crisisEnded", outcome: next.crisis.outcome });
      }
      break;
    }
    case "occasionAccept": {
      // 行事の打診に応える：行動は消費しない（会話の一瞬）。
      // 当日届いた打診に限り請けられる —— 応えなくても世界は進む
      if (cfg.occasions === undefined) break;
      const offer = occasionOffers(next, cfg.occasions).find((o) => o.def.id === command.id);
      if (offer === undefined || offer.accepted || offer.attempted) break;
      events.push({ type: "occasionJoined", id: command.id });
      break;
    }
    case "occasionAttempt": {
      // 勝負所に臨む（1行動）。応えた行事に限り当日一度だけ。
      // 出来（0〜1）と器の閾値で勝敗が決まり、勝敗に応じて賞金・評判・旗印が刻まれる
      if (cfg.occasions === undefined || !canAct(next.time, cfg.time)) break;
      const offer = occasionOffers(next, cfg.occasions).find((o) => o.def.id === command.id);
      if (offer === undefined || !offer.accepted || offer.attempted) break;
      const def = offer.def;
      const score = Math.max(0, Math.min(1, command.score));
      const threshold =
        def.vessel.kind === "combat"
          ? cfg.occasions.combatWinScore
          : def.vessel.targetQuality / 100;
      const won = score >= threshold;
      const side = won ? def.win : def.loss;
      // 賞金・掛け金の動き（負けは掛け金の損失として負の値。所持金は 0 未満にならない）
      if (side?.money !== undefined && side.money !== 0) {
        const amount = Math.trunc(side.money);
        next = {
          ...next,
          player: { ...next.player, money: Math.max(0, next.player.money + amount) },
        };
        if (amount > 0) events.push({ type: "moneyPaid", amount });
      }
      // 評判（occasion.renown：ライバル・ランキングの実績点に乗る。敗れて減ることもある）
      if (side?.renown !== undefined && side.renown !== 0) {
        const counters = { ...next.counters };
        counters[OCCASION_RENOWN_KEY] = Math.max(
          0,
          (counters[OCCASION_RENOWN_KEY] ?? 0) + Math.trunc(side.renown),
        );
        next = { ...next, counters };
      }
      // 勝敗で立つ旗印（条件DSLが読める刻印 —— 称号・後の打診の材料になる）
      if (side?.flags !== undefined && side.flags.length > 0) {
        const flags = { ...next.flags };
        for (const f of side.flags) flags[f] = true;
        next = { ...next, flags };
      }
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "occasion", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "occasion",
        day: next.time.day,
        target: def.id,
        variant: won ? "win" : "loss",
      });
      events.push({ type: "occasionAttempted", id: def.id, kind: def.kind, score, won });
      if (command.died === true) {
        // 決闘で倒れた：戦闘と同じ教会蘇生（未定着経験の半分を失う。03 §4）
        const counters = { ...next.counters };
        counters["death.count"] = (counters["death.count"] ?? 0) + 1;
        next = { ...next, counters };
        // K-01：医術・治癒・施療が蘇生を手厚くする（death.keep リンク）
        const skills = { ...next.player.skills };
        const keep = deathKeepFactor();
        for (const id of Object.keys(skills)) {
          const s = skills[id]!;
          skills[id] = { ...s, pending: s.pending * keep };
        }
        next = { ...next, player: { ...next.player, skills } };
        events.push({ type: "died" });
      }
      break;
    }
    case "incidentChoose": {
      // 出来事に応える：行動は消費しない（会話の一瞬）。
      // 今日届いていて未応答のものだけ —— 応えなくても世界は進む
      if (cfg.incidents === undefined) break;
      const offer = incidentChoosable(next, cfg.incidents, command.id);
      if (offer === undefined) break;
      const def = offer.def;
      const choice = def.choices.find((c) => c.id === command.choice);
      if (choice === undefined) break;
      // 結末は選んだ選択肢の表から決定的に引く（同じ日・同じ選択には同じ結末）
      const outcome = incidentOutcome(next, def, choice);
      const sp = incidentSpeaker(next, cfg.incidents, def);
      const text = sp !== undefined ? outcome.text.replaceAll("{name}", sp.name) : outcome.text;
      // 小さな効果（どれも日常の範囲 —— 出来事は勝負所ではない）：
      // 金（所持金は 0 未満にならない）・未定着経験・疲労・旗印・カウンタ・
      // 見聞録のアトム（手がかり）・世界の備えへの寄与（進行中の危機がある世界だけ）
      if (outcome.money !== undefined && outcome.money !== 0) {
        const amount = Math.trunc(outcome.money);
        next = {
          ...next,
          player: { ...next.player, money: Math.max(0, next.player.money + amount) },
        };
        if (amount > 0) events.push({ type: "moneyPaid", amount });
      }
      if (outcome.gain !== undefined && outcome.gain.amount !== 0) {
        // K-01：後発技能（旧セーブにレコードが無い技能）にも経験が入る
        grantPending(outcome.gain.skill, outcome.gain.amount);
      }
      if (outcome.fatigue !== undefined && outcome.fatigue !== 0) {
        next = {
          ...next,
          player: {
            ...next.player,
            fatigue: Math.max(0, Math.min(100, next.player.fatigue + outcome.fatigue)),
          },
        };
      }
      if (outcome.flags !== undefined && outcome.flags.length > 0) {
        const flags = { ...next.flags };
        for (const f of outcome.flags) flags[f] = true;
        next = { ...next, flags };
      }
      if (outcome.counters !== undefined) {
        const counters = { ...next.counters };
        for (const [k, v] of Object.entries(outcome.counters)) {
          counters[k] = (counters[k] ?? 0) + v;
        }
        next = { ...next, counters };
      }
      if (outcome.atom !== undefined) {
        // 手がかり：アトムを読み終えたことにする（事実・つながりの判定は readAtom と同じ道。
        // 読み済みなら何も起きない —— 同じ手がかりは二度入らない）
        const res = readAtom(next, outcome.atom, cfg.lore);
        if (res.ok) {
          next = res.state;
          events.push({ type: "atomRead", id: outcome.atom });
          for (const f of res.newFacts) events.push({ type: "factLearned", id: f });
          for (const c of res.connections) {
            events.push({ type: "loreConnection", id: c.eventId, flag: c.flag });
          }
        }
      }
      if (outcome.contribution !== undefined && outcome.contribution.amount > 0) {
        // K-01：crisis.contrib リンク（統率・祈祷・歌唱）で寄与が底上げされる
        next = addHeroContribution(
          next,
          outcome.contribution.field,
          outcome.contribution.amount *
            (1 + linkSum(cfg.links, "crisis.contrib", next.player.skills)),
        );
      }
      events.push({
        type: "incidentResolved",
        id: def.id,
        kind: def.kind,
        choice: choice.id,
        text,
      });
      break;
    }
    case "retire": {
      // 引退：行動を消費せず状態も変えない。生涯の終わりを告げる出来事だけを発行し、
      // 伝記・年代記への記録・継承・転生は呼び出し側の仕事（T-40。06 §1）
      events.push({ type: "retired" });
      break;
    }
    // ---- 日々の営み（P-02「行動の種類を増やす」） ----
    case "stroll": {
      // 散策：歩いて起きる小さな出来事。表は scope で分かれる
      // （旅の途中は常に "road" —— 街道の出来事しか起きない）。
      // G-01：場所・町の型に応じた型別の表があればそちらを引く
      if (cfg.life === undefined || !canAct(next.time, cfg.time)) break;
      const scope = next.life.journey !== null ? "road" : (command.scope ?? "town");
      const table =
        scope === "road" ? "road" : strollTableOf(cfg.life, scope, command.place, townOf(next));
      const seq = next.counters["action.stroll"] ?? 0;
      const outcome = drawStroll(next.seed, next.time.day, table, seq, cfg.life);
      if (outcome === undefined) break;
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "stroll", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "stroll",
        day: next.time.day,
        variant: scope,
      });
      events.push({ type: "strollOutcome", text: outcome.text });
      applyLifeOutcome(outcome);
      break;
    }
    case "spot": {
      // 地点への立ち寄り（G-01）：地域の中の小さな場所（泉・小屋・塔跡…）で
      // 型の出来事表から1件引く。効果は散策と同じ
      if (cfg.life === undefined || !canAct(next.time, cfg.time)) break;
      const outcome = drawSpot(
        next.seed,
        next.time.day,
        command.spot,
        next.counters["action.spot"] ?? 0,
        cfg.life,
      );
      if (outcome === undefined) break;
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "stroll", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "spot",
        day: next.time.day,
        target: command.spot,
      });
      events.push({ type: "strollOutcome", text: outcome.text });
      applyLifeOutcome(outcome);
      break;
    }
    case "gather": {
      // 採集：場所ごとの採集表から季節・天候を見て品を引き、その場所の技能に経験が入る
      if (cfg.life === undefined || !canAct(next.time, cfg.time)) break;
      const table = cfg.life.gather[command.place];
      if (table === undefined) break;
      const season = describeTime(next.time, cfg.time).season;
      const weather =
        cfg.weather !== undefined
          ? weatherOf(next.seed, next.time.day, cfg.weather, cfg.time).kind.id
          : undefined;
      const got = drawGather(
        next.seed,
        next.time.day,
        command.place,
        next.counters["action.gather"] ?? 0,
        season,
        weather,
        cfg.life,
      );
      // M-01：生活魔法「水脈探し・地力」が掛かっていれば採集の引きが増える
      // （別の乱数列で足す —— 元の引きは変わらない。効果は消費される）
      if (cfg.magic !== undefined) {
        const b = consumeLifeBuff(next.counters, "gatherBonus");
        if (b.value > 0) {
          next = { ...next, counters: b.counters };
          const extra = drawGather(
            next.seed,
            next.time.day,
            command.place,
            (next.counters["action.gather"] ?? 0) + 100000,
            season,
            weather,
            cfg.life,
          );
          for (const g of extra.slice(0, Math.ceil(b.value))) got.push(g);
        }
      }
      grantLifeGain("gather", table.skill, table.difficulty);
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "gather", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "gather",
        day: next.time.day,
        target: command.place,
      });
      for (const g of got) giveItem(g.item, g.n);
      break;
    }
    case "buyItem": {
      // 市場で買う：店に並ぶ品をその町の相場で。行動は消費しない
      if (cfg.life === undefined || cfg.items === undefined) break;
      const def = cfg.items[command.id];
      if (def === undefined) break;
      const n = Math.max(1, Math.trunc(command.n ?? 1));
      const town = townOf(next);
      if (!marketStock(town, cfg.life).includes(command.id)) break;
      const cost =
        itemPrice(
          next.seed,
          next.time.day,
          command.id,
          town,
          "buy",
          cfg.life,
          def,
          repOf(next, town, cfg.life),
        ) * n;
      if (next.player.money < cost) break;
      next = {
        ...next,
        player: { ...next.player, money: next.player.money - cost },
      };
      next = { ...next, life: withItem(next, command.id, n) };
      events.push({ type: "itemBought", id: command.id, n, amount: cost });
      break;
    }
    case "sellItem": {
      // 市場で売る：持ち物をその町の相場で。行動は消費しない
      if (cfg.life === undefined || cfg.items === undefined) break;
      const def = cfg.items[command.id];
      if (def === undefined) break;
      const n = Math.max(1, Math.trunc(command.n ?? 1));
      if (itemCount(next, command.id) < n) break;
      const town = townOf(next);
      const gain =
        itemPrice(
          next.seed,
          next.time.day,
          command.id,
          town,
          "sell",
          cfg.life,
          def,
          repOf(next, town, cfg.life),
        ) * n;
      next = { ...next, life: withItem(next, command.id, -n) };
      next = {
        ...next,
        player: { ...next.player, money: next.player.money + gain },
      };
      events.push({ type: "itemSold", id: command.id, n, amount: gain });
      break;
    }
    case "cook": {
      // 料理：材料を消費して仕上がりの品を作る。出来はミニゲームかまかせの素の出来
      if (cfg.life === undefined || !canAct(next.time, cfg.time)) break;
      const recipe = cfg.life.recipes.find((r) => r.id === command.recipe);
      if (recipe === undefined) break;
      if (!Object.entries(recipe.inputs).every(([id, n]) => itemCount(next, id) >= n)) break;
      // M-01：生活魔法「火加減」が掛かっていればこの料理の出来に乗って消費される
      let cookBonus = 0;
      if (cfg.magic !== undefined) {
        const b = consumeLifeBuff(next.counters, "cookBonus");
        if (b.value > 0) {
          next = { ...next, counters: b.counters };
          cookBonus = b.value;
        }
      }
      const quality = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (command.quality ??
              cookQuality(next.seed, next.time.day, next.counters["cook.total"] ?? 0, cfg.life)) +
              cookBonus,
          ),
        ),
      );
      grantLifeGain("cook", recipe.skill, recipe.difficulty);
      for (const [id, n] of Object.entries(recipe.inputs)) takeItem(id, n);
      next = { ...next, life: withItem(next, recipe.out, 1) };
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "cook", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "cook",
        day: next.time.day,
        target: recipe.out,
        variant: recipe.id,
      });
      events.push({ type: "cooked", recipe: recipe.id, out: recipe.out, quality });
      break;
    }
    case "eat": {
      // 食べる：持ち物の食べられる品を1つ。その質を今夜の眠りに刻む
      // （料理は作ったときの出来で質が動く —— counters["meal.q.<id>"] が覚える）
      if (cfg.life === undefined || cfg.items === undefined) break;
      const def = cfg.items[command.id];
      if (def?.food === undefined) break;
      if (itemCount(next, command.id) < 1) break;
      const cookedQ = next.counters[`meal.q.${command.id}`];
      const quality = Math.round(
        cookedQ !== undefined ? def.food * (0.5 + cookedQ / 200) : def.food,
      );
      takeItem(command.id, 1);
      next = {
        ...next,
        life: { ...next.life, mealDay: next.time.day, mealQuality: quality },
      };
      events.push({ type: "ate", id: command.id, quality });
      break;
    }
    case "gamble": {
      // 賭け事：掛け金の段に限り張れる。勝率は基礎値＋賭けの技能（gamble.win）
      if (cfg.life === undefined || !canAct(next.time, cfg.time)) break;
      const stake = Math.trunc(command.stake);
      if (!cfg.life.gamble.stakes.includes(stake) || next.player.money < stake) break;
      const chance = gambleWinChance(
        next,
        linkSum(cfg.links, "gamble.win", next.player.skills),
        cfg.life,
      );
      const won = drawGamble(next.seed, next.time.day, next.counters["gamble.total"] ?? 0, chance);
      const back = won ? Math.round(stake * cfg.life.gamble.winFactor) : 0;
      grantLifeGain("gamble", "gambling", cfg.life.gambleDifficulty);
      next = {
        ...next,
        player: { ...next.player, money: next.player.money - stake + back },
      };
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "gamble", cfg.body);
      events.push({ type: "actionPerformed", kind: "gamble", day: next.time.day });
      events.push({ type: "gambled", stake, won, amount: back });
      if (won) events.push({ type: "moneyPaid", amount: back });
      break;
    }
    case "pray": {
      // 祈る：その日の眠りを少し深くする刻印。施しを納めると併せて積む
      if (cfg.life === undefined || !canAct(next.time, cfg.time)) break;
      const alms = Math.max(0, Math.trunc(command.alms ?? 0));
      const paid = Math.min(alms, next.player.money);
      grantLifeGain("pray", "prayer", cfg.life.prayDifficulty);
      next = {
        ...next,
        life: { ...next.life, prayedDay: next.time.day },
        player: { ...next.player, money: next.player.money - paid },
      };
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "pray", cfg.body);
      events.push({ type: "actionPerformed", kind: "pray", day: next.time.day });
      events.push({ type: "prayed", ...(paid > 0 ? { alms: paid } : {}) });
      break;
    }
    case "social": {
      // 人と過ごす：話す・飲む・贈る。仲の値が育ち社交の技能に少し経験が入る。
      // 相手が今日街にいない日は会えない（人の揺らぎ、R-01）
      if (cfg.life === undefined || !canAct(next.time, cfg.time)) break;
      if (
        cfg.variance !== undefined &&
        npcAway(next.seed, next.time.day, command.npc, cfg.variance.npc)
      ) {
        events.push({
          type: "bonded",
          npc: command.npc,
          amount: 0,
          total: bondOf(next, command.npc, cfg.life),
        });
        break;
      }
      // 各経路で代入される（抜ける経路は break）
      let amount: number;
      if (command.way === "talk") {
        amount = cfg.life.social.talk.bond;
      } else if (command.way === "drink") {
        const cost = cfg.life.social.drink.cost;
        if (next.player.money < cost) break;
        amount = cfg.life.social.drink.bond;
        next = {
          ...next,
          player: { ...next.player, money: next.player.money - cost },
        };
      } else {
        // 贈る：持ち物の売れる品を1つ。価値の大きい贈り物ほど仲が深まる
        const def = cfg.items?.[command.item ?? ""];
        if (command.item === undefined || def === undefined || def.price <= 0) break;
        if (itemCount(next, command.item) < 1) break;
        takeItem(command.item, 1);
        amount = Math.min(cfg.life.social.gift.cap, def.price * cfg.life.social.gift.bondPerPrice);
      }
      // K-01 社交の技能：口添え・弁舌・目利きに少し経験が入る（social.gain）
      grantLinkGains("social.gain");
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "social", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "social",
        day: next.time.day,
        target: command.npc,
        variant: command.way,
      });
      deepen(command.npc, amount);
      break;
    }
    case "errand": {
      // 掲示板の依頼：納める品が揃えば品を納めて報酬を得る
      if (cfg.life === undefined || !canAct(next.time, cfg.time)) break;
      const def = errandsFor(townOf(next), cfg.life).find((e) => e.id === command.id);
      if (def === undefined || !canErrand(next, def, cfg.life)) break;
      for (const [id, n] of Object.entries(def.need)) takeItem(id, n);
      const money = Math.trunc(def.reward.money ?? 0);
      if (money > 0) {
        next = {
          ...next,
          player: { ...next.player, money: next.player.money + money },
        };
      }
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "errand", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "errand",
        day: next.time.day,
        target: def.id,
      });
      events.push({ type: "errandDone", id: def.id });
      if (money > 0) events.push({ type: "moneyPaid", amount: money });
      for (const [id, n] of Object.entries(def.reward.items ?? {})) giveItem(id, n);
      if (def.reward.bond !== undefined) deepen(def.reward.bond.npc, def.reward.bond.amount);
      if (def.reward.gain !== undefined && def.reward.gain.amount > 0) {
        grantPending(def.reward.gain.skill, def.reward.gain.amount);
      }
      // 町ごとの評判（G-01）：掲示板の依頼をこなすとその町で顔が売れる
      if (cfg.life?.rep !== undefined) {
        const town = townOf(next);
        next = { ...next, life: withRep(next, town, cfg.life.rep.errand, cfg.life) };
        events.push({
          type: "repGained",
          town,
          amount: cfg.life.rep.errand,
          total: repOf(next, town, cfg.life),
        });
      }
      break;
    }
    case "lifeSpell": {
      // 生活魔法（M-01、09 §4）：習得済みの kind:"life" の呪文を1行動＋魔力で唱える。
      // 効果は hook に応じて次の料理・仕事・採集・眠り・持ち物・疲労へ掛かる
      if (cfg.magic === undefined || cfg.arts === undefined || !canAct(next.time, cfg.time)) break;
      const ok = canLifeSpell(next, command.id, cfg.arts.defs);
      if (!ok.ok || ok.def === undefined) break;
      const sp = ok.def.spell!;
      const life = sp.life!;
      next = {
        ...next,
        player: { ...next.player, mana: Math.max(0, round1(next.player.mana - sp.mana)) },
      };
      const counters = { ...next.counters };
      // 使用の刻印：生活魔法を使い続けると派生が覚える条件（learn.counter）が読む
      counters[`spell.cast.${ok.def.id}`] = (counters[`spell.cast.${ok.def.id}`] ?? 0) + 1;
      counters["spell.cast.life"] = (counters["spell.cast.life"] ?? 0) + 1;
      counters[`spell.cast.el.${sp.element}`] = (counters[`spell.cast.el.${sp.element}`] ?? 0) + 1;
      switch (life.hook) {
        case "heal": {
          // 癒しの手：即時に疲労を回復する
          next = {
            ...next,
            player: {
              ...next.player,
              fatigue: Math.max(0, next.player.fatigue - life.value),
            },
          };
          break;
        }
        case "preserve": {
          // 乾燥・冷却：持ち物を保存食に変える（乾いた薬草・干し果実）
          const tr = life.transform;
          if (tr !== undefined) {
            const have = itemCount(next, tr.from);
            const n = Math.min(tr.n, have);
            if (n > 0) {
              takeItem(tr.from, n);
              giveItem(tr.to, n);
              counters[`spell.preserve.${tr.to}`] = (counters[`spell.preserve.${tr.to}`] ?? 0) + n;
            }
          }
          break;
        }
        default: {
          // 次の行動に効く窓（料理・仕事・採集・眠り）— 効果量を畳み、行動側が消費する
          counters[lifeBuffKey(life.hook)] = lifeBuffOf(next, life.hook) + life.value;
          break;
        }
      }
      next = { ...next, counters };
      // 生活魔法の技能にも経験が入る（同じ式で、技量差で伸びる）
      {
        const skill = ensureSkillRecord(ok.def.skill);
        if (skill !== undefined) {
          const { amount } = computeGain(
            {
              kind: "work",
              skill: skill.value,
              delta: 5 - skill.value,
              repeats: recentRepeats(
                next.actionLog,
                "lifeSpell",
                ok.def.id,
                cfg.gain.noveltyWindow,
              ),
              potential: skill.potential,
              fatigue: next.player.fatigue,
              wind: windFor(next, "work", ok.def.skill),
              modifiers: 1,
              failed: false,
            },
            cfg.gain,
          );
          const applied = amount * gainFactor(skill.value);
          skill.pending += applied;
          skill.lastUsedDay = next.time.day;
          events.push({ type: "gainApplied", skill: ok.def.skill, amount: applied });
        }
      }
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "lifeSpell", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "lifeSpell",
        day: next.time.day,
        target: ok.def.id,
      });
      events.push({ type: "magicCast", id: ok.def.id, hook: life.hook });
      // 覚え判定（生活魔法を使い続けると派生が覚える、09 §4）
      if (cfg.arts !== undefined) {
        const learn = checkArtsLearn(next, cfg.arts);
        next = learn.state;
        for (const id of learn.learned) events.push({ type: "artLearned", id });
        // K-03：揃った技・刻印の響き合いとユニークの獲得もこの瞬間に起きる
        const k = k03Checks();
        for (const id of k.synthesized) events.push({ type: "artSynthesized", id });
        for (const u of k.gained) events.push({ type: "uniqueGained", ...u });
      }
      break;
    }
    case "enchant": {
      // 付与（M-01、09 §4「鍛冶＋火魔法」）：1行動＋魔力で武器に付与を刻む。
      // 段は counters["enchant.<weapon>"] に積み、戦闘では attackFactor に畳まれる
      if (cfg.magic === undefined || !canAct(next.time, cfg.time)) break;
      const ench = canEnchant(next, command.weapon, cfg.magic);
      if (!ench.ok) break;
      const enchCfg = cfg.magic.enchant;
      next = {
        ...next,
        player: { ...next.player, mana: Math.max(0, round1(next.player.mana - enchCfg.mana)) },
      };
      const counters = { ...next.counters };
      counters[`enchant.${command.weapon}`] = enchantLevel(next, command.weapon) + 1;
      next = { ...next, counters };
      // 付与は鍛冶と火魔法の両方の腕を使う仕事（経験は両方に入る）
      for (const skillId of ["smithing", "fire_magic"] as const) {
        const skill = ensureSkillRecord(skillId);
        if (skill === undefined) continue;
        const { amount } = computeGain(
          {
            kind: "work",
            skill: skill.value,
            delta: enchCfg.smithing - skill.value,
            repeats: recentRepeats(
              next.actionLog,
              "enchant",
              command.weapon,
              cfg.gain.noveltyWindow,
            ),
            potential: skill.potential,
            fatigue: next.player.fatigue,
            wind: windFor(next, "work", skillId),
            modifiers: 1,
            failed: false,
          },
          cfg.gain,
        );
        const applied = amount * gainFactor(skill.value);
        skill.pending += applied;
        skill.lastUsedDay = next.time.day;
        events.push({ type: "gainApplied", skill: skillId, amount: applied });
      }
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "enchant", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "enchant",
        day: next.time.day,
        target: command.weapon,
      });
      events.push({
        type: "enchanted",
        weapon: command.weapon,
        level: enchantLevel(next, command.weapon),
      });
      // K-03：付与の刻印（enchant.<weapon>）も響き合いの材料になる
      // （鍛冶＋火魔法の組み合わせは 09 §4・§7 の例そのもの）
      if (cfg.arts !== undefined) {
        const k = k03Checks();
        for (const id of k.synthesized) events.push({ type: "artSynthesized", id });
        for (const u of k.gained) events.push({ type: "uniqueGained", ...u });
      }
      break;
    }
    case "journey": {
      // 旅に出る：道のある隣町へ。以後は野営の眠りで日が進み、日数ぶんで着く
      if (cfg.life === undefined || !canAct(next.time, cfg.time)) break;
      if (next.life.journey !== null) break;
      const road = journeyBetween(cfg.life, townOf(next), command.to);
      if (road === undefined) break;
      next = {
        ...next,
        life: { ...next.life, journey: { to: command.to, daysLeft: road.days } },
      };
      next.time = advanceTime(next.time, cfg.time);
      next = applyActionLoad(next, "journey", cfg.body);
      events.push({
        type: "actionPerformed",
        kind: "journey",
        day: next.time.day,
        target: command.to,
      });
      events.push({ type: "journeyStarted", to: command.to, days: road.days });
      break;
    }
  }

  // イベントを購読者に流して派生状態を更新し、行動ログを記録する
  for (const event of events) {
    for (const sub of subscribers) next = sub(next, event);
    next = recordAction(next, event, cfg.actionLogMax);
  }

  // 隠し要素（X-11、docs/03 §5）：行動後の状態で発見条件を評価する。
  // within の条件が行動ログを読むので購読者ループの後、
  // found.<id> を頂点・称号の条件から使えるように称号判定より前に置く
  if (cfg.discoveries !== undefined) {
    const res = checkDiscoveries(next, cfg.discoveries, cfg.time, condEnv);
    next = res.state;
    for (const def of res.found) {
      const event: ActionEvent = { type: "discovery", id: def.id };
      for (const sub of subscribers) next = sub(next, event);
      next = recordAction(next, event, cfg.actionLogMax);
      events.push(event);
    }
  }

  // NPCの歳月（X-12、docs/07 §3）：行動後の状態で人物の出来事を評価する。
  // 日またぎ（睡眠・休養）の結果の暦と、行動の刻印（counters/flags。購読者
  // ループで反映済み）の両方が条件DSLから読める位置 —— 発見の判定の後で、
  // 歳月の出来事が立てる旗印を称号・頂点の条件が拾えるように称号判定より前。
  // 発火した出来事は世界の記録（crisis.log）と counters/flags に刻まれ、
  // 二度は発火しない（その生の done 刻印＋世代をまたぐ記録の2層）
  if (cfg.npcLife !== undefined) {
    const res = npcLifeEvents(next, cfg.npcLife, cfg.time, condEnv);
    next = res.state;
    for (const f of res.fired) {
      const event: ActionEvent = {
        type: "npcEvent",
        npcId: f.npcId,
        kind: f.kind,
        name: f.name,
        text: f.text,
        day: f.day,
      };
      for (const sub of subscribers) next = sub(next, event);
      next = recordAction(next, event, cfg.actionLogMax);
      events.push(event);
    }
  }

  // 称号の判定（購読者がカウンタを更新した後の state で評価。
  // 1ステップに複数取れてよいが、同じ称号は二度取らない）
  const titleEvents: ActionEvent[] = [];

  // 頂点ルートの条件鎖（06 §3A、T-41）：各ルートの次の未達成段だけを見る。
  // 段の達成は flags["pinnacle.<route>.<stage>"] に刻み、最終段（S）の頂点称号は
  // そのフラグを条件に持つ既存の称号判定がこの直後に拾う（二重管理を避ける）
  if (cfg.pinnacles) {
    const prog = checkPinnacles(next, cfg.pinnacles, cfg.time, condEnv);
    next = prog.state;
    for (const r of prog.reached) {
      const event: ActionEvent = {
        type: "pinnacleStageReached",
        route: r.route.id,
        stage: r.stage.id,
        rank: r.stage.rank,
      };
      for (const sub of subscribers) next = sub(next, event);
      next = recordAction(next, event, cfg.actionLogMax);
      events.push(event);
    }
    // 頂点（Sランク段）への接近は「気配」として出す（記録は checkPinnacles 側で済み）
    for (const _ of prog.kehai) titleEvents.push({ type: "kehai" });
  }

  for (const def of cfg.titles) {
    if (next.titles.includes(def.id)) continue;
    if (evaluate(def.condition, next, cfg.time, condEnv)) {
      next = { ...next, titles: [...next.titles, def.id] };
      titleEvents.push({ type: "titleGained", id: def.id, rank: def.rank });
      // 通知予算：Sは1日1回。超過したSは抑制フラグで格下げ表示にする
      if (def.rank === "S") {
        const r = consumeS(next);
        next = r.state;
        if (!r.allowed) {
          titleEvents[titleEvents.length - 1] = {
            type: "titleGained",
            id: def.id,
            rank: def.rank,
            suppressed: true,
          };
        }
      }
    }
  }
  // 派生スキルの解放判定（02：素スキルが育つと派生が開花。解放は flags に記録）
  if (cfg.skillUnlocks) {
    const u = unlockSkills(next, cfg.skillUnlocks, cfg.time, condEnv);
    next = u.state;
    for (const id of u.unlocked) {
      const event: ActionEvent = { type: "skillUnlocked", id };
      for (const sub of subscribers) next = sub(next, event);
      next = recordAction(next, event, cfg.actionLogMax);
      events.push(event);
    }
  }

  // S候補への接近 → 条件を明かさず「気配」の一行（03 §6）
  const kehai = emitKehai(next, cfg.titles);
  next = kehai.state;
  for (const _ of kehai.fired) titleEvents.push({ type: "kehai" });
  for (const event of titleEvents) {
    for (const sub of subscribers) next = sub(next, event);
    next = recordAction(next, event, cfg.actionLogMax);
    events.push(event);
  }

  // 立場・職業の打診（条件を満たしたらオファーが溜まる。通知Aランク相当）
  for (const offer of newOffers(next, cfg.society, cfg.time, condEnv)) {
    next = {
      ...next,
      society: {
        ...next.society,
        pendingOffers: [...next.society.pendingOffers, offer.id],
      },
    };
    events.push({ type: "offerReceived", kind: offer.kind, id: offer.id });
  }
  // 人生目標の達成：宣言していた目標が満たされたら報酬（pending）を付与
  const achieved = goalAchieved(next, cfg.society, cfg.time, condEnv);
  if (achieved) {
    next = {
      ...next,
      society: {
        ...next.society,
        achievedGoals: [...next.society.achievedGoals, achieved.id],
        goal: null,
      },
    };
    for (const [skillId, base] of Object.entries(achieved.reward.pendingBySkill ?? {})) {
      // K-01：目標報酬も後発技能に入る（旧セーブにレコードが無くても作られる）
      const skill = ensureSkillRecord(skillId);
      if (skill === undefined) continue;
      skill.pending += base * cfg.society.goalRewardFactor;
    }
    events.push({ type: "goalAchieved", id: achieved.id });
  }

  // 危機の打診（W-03、docs/08 §6）：関与が段階3（担った）に届くと、世界から
  // 最も早い未決着の場面への参加を打診される（通知Aランク相当 —— 立場・職業の
  // 打診と同じ格）。届いた打診は flags["crisis.offer.<id>"] に記録され、
  // 応えるも応えないも自由 —— 世界は主人公を待たず、予定の時期に決着が来る
  if (cfg.crisis?.involvement !== undefined && crisisInvolvement(next, cfg.crisis).stage >= 3) {
    for (const offer of crisisFinaleOffers(next, cfg.crisis)) {
      if (!offer.pending || offer.offered) continue;
      const event: ActionEvent = { type: "crisisFinaleOffered", id: offer.def.id };
      for (const sub of subscribers) next = sub(next, event);
      next = recordAction(next, event, cfg.actionLogMax);
      events.push(event);
    }
  }

  // 勝負所の行事の打診（X-10、docs/03 §2）：その日届く行事は日付＋世界シードの
  // 独立した抽選で決まる（state.rng は消費しない）。届いた打診には日付が刻まれ、
  // 応えるも応えないも自由 —— 断っても不利益はなく、街の日常は続く
  if (cfg.occasions !== undefined) {
    for (const def of occasionPending(next, cfg.occasions, cfg.time, condEnv)) {
      const event: ActionEvent = { type: "occasionOffered", id: def.id, kind: def.kind };
      for (const sub of subscribers) next = sub(next, event);
      next = recordAction(next, event, cfg.actionLogMax);
      events.push(event);
    }
  }

  // 日々の出来事（F-05）：その日の出来事は日付＋世界シードの独立した抽選で
  // 決まり、届く行動番号（slot）を過ぎた行動の終わりに会話の窓へ差し込まれる
  // （このステップで行動が行われたときだけ —— 睡眠・会話だけの往復では届かない）。
  // 届いた出来事には日付が刻まれ、応えるも応えないも自由 —— 応えなくても
  // 翌日には流れ、断ったことによる不利益はない
  if (cfg.incidents !== undefined && events.some((e) => e.type === "actionPerformed")) {
    for (const def of incidentPending(next, cfg.incidents, cfg.time, condEnv)) {
      const event: ActionEvent = { type: "incidentOffered", id: def.id, kind: def.kind };
      for (const sub of subscribers) next = sub(next, event);
      next = recordAction(next, event, cfg.actionLogMax);
      events.push(event);
    }
  }

  // K-03：響き合い・ユニークの最終判定 —— このstepで出来事・発見・称号・
  // 歳月が立てた旗印も材料になるので、行動の処理の最後にもう一度だけ見る
  // （購読者ループで反映済みの刻印まで条件DSLから読める位置）
  {
    const k = k03Checks();
    for (const id of k.synthesized) {
      const event: ActionEvent = { type: "artSynthesized", id };
      for (const sub of subscribers) next = sub(next, event);
      events.push(event);
    }
    for (const u of k.gained) {
      const event: ActionEvent = { type: "uniqueGained", ...u };
      for (const sub of subscribers) next = sub(next, event);
      events.push(event);
    }
  }

  return { state: next, events };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
