import { evaluate, type Cond, type CondEnv } from "../conditions/index.js";
import type { ActionEvent } from "../events/index.js";
import { npcGoneReason } from "../npclife/index.js";
import { reachedPinnacles, routeProgress, type PinnacleRouteDef } from "../pinnacle/index.js";
import { createRng, type Rng } from "../rng/index.js";
import { drawRivalCast, playerScore, type RivalsConfig } from "../rivals/index.js";
import {
  CRISIS_FIELD_IDS,
  type CrisisFieldId,
  type CrisisState,
  type GameState,
  type Work,
} from "../state/types.js";
import { describe as describeTime, type GameTime, type TimeConfig } from "../time/index.js";

/**
 * 世界の危機（docs/08_world_crisis.md §3〜4、W-01）。
 *
 * 方針：世界を主人公に背負わせない。危機の型と変数は世界シードから決定論的に
 * 決まり、季節の変わり目ごとに段階と勢力の備えが進み、決着の場面の成否は
 * その時点の備え（世界の分＋主人公の寄与）で決まる。危機は主人公のクエスト
 * ではなく、世界が自分で動かす筋書きである
 */

// ---- 危機の型の定義（crises/*.json。core が必要とする最小形） ----

/** 物価への影響：仕事の報酬への倍率（kind 省略時は全種別に乗る） */
export interface CrisisPriceEffect {
  kind?: string;
  factor: number;
}

/** 敵の強さへの影響：id か area で対象を絞る（両方省略で全敵） */
export interface CrisisEnemyEffect {
  id?: string;
  area?: string;
  hpFactor?: number;
  powerFactor?: number;
  challengeBonus?: number;
}

/** NPCの離散・死亡（この段階に入った時点で記録され、元に戻らない） */
export interface CrisisNpcEffect {
  id: string;
  kind: "leave" | "die";
}

/** 段階ごとの世界への影響（その段階の間だけ効く。NPCの離散・死亡は元に戻らない） */
export interface CrisisStageEffects {
  closeAreas?: readonly string[];
  /**
   * 通行止めになる道（G-02、docs/10 §7「危機の影響を地図に出す」）。
   * 道の id（journeyIdOf —— 町id同士を . で繋いだもの）か道の種別
   * （"highway"/"mountain"/"sea"）を書く。この段階の間はその道を旅できない
   */
  closeRoads?: readonly string[];
  price?: readonly CrisisPriceEffect[];
  enemy?: readonly CrisisEnemyEffect[];
  npc?: readonly CrisisNpcEffect[];
  features?: readonly string[];
}

export interface CrisisStageDef {
  id: string;
  name: string;
  /** この段階に滞在する季節数。最終段は決着が来るまで続く */
  seasons: number;
  effects?: CrisisStageEffects;
}

export interface CrisisFinaleDef {
  id: string;
  name: string;
  /** 危機開始から数えた季節の変わり目の番号（1〜）に判定する */
  atBoundary: number;
  /** 判定に使う備えの分野（1〜2） */
  fields: readonly CrisisFieldId[];
  /** 成功に必要な備えの合計（世界の備え＋主人公の寄与） */
  required: number;
  /** 閾値を required ×(1±margin) の範囲で揺らす乱数幅（控えめ。省略時 0） */
  margin?: number;
  /** 時期のずれ幅（季節。シードで ±jitter ずれる。省略時 0） */
  jitter?: number;
  /**
   * この場面の前線の相手（enemies.json の id。W-03：関与が「担った」に届いた者が
   * 打診に応えたとき、武の役目の勝負所として戦う敵。省略時は表示側が適当な相手を選ぶ）
   */
  ref?: string;
}

export interface CrisisFactionDef {
  id: string;
  name: string;
  /** 1季節あたりの備え速度（シードで min〜max の一様乱数） */
  speed: { min: number; max: number };
  /** 得意分野の個数（省略時は CrisisConfig.strongFields） */
  strongFields?: number;
  /** 得意分野の抽選の重み（省略時は一様） */
  aptitude?: Partial<Record<CrisisFieldId, number>>;
}

/** 「実際にしてきたこと」への親和（接点の加重。条件DSL を満たすほど出やすくなる） */
export interface TouchpointAffinity {
  /** 行動履歴・スキル値・カウンタ・人間関係・持ち物などを読む条件 */
  cond: Cond;
  /** 条件を満たすとき提示の重みに加わる値 */
  weight: number;
}

/** 仕事の注文に乗る接点の品（crises/*.json の offer と対応） */
export interface CrisisTouchpointOfferDef {
  name: string;
  /** 対応スキルID（注文の系統。work コマンドの kind） */
  kind: string;
  targetQuality: number;
  rewardMoney: number;
}

/**
 * 接点（docs/08 §5、W-02）：危機は日常に混ざる。
 * 「生き方の種類」を選ぶのではなく、実際にしてきたこと（行動履歴・スキル・実績）への
 * 親和で選ばれ、既存の遊びに乗せて出る。受けても受けなくてもよい。
 * 乗せ先は実体で決まる：offer（仕事の注文）か ref（狩りに出る敵）のどちらかを持つ
 */
export interface CrisisTouchpointDef {
  id: string;
  /** 接点の語り分類（08 §5 の表に対応するタグ：order/supply/defense/escort/arbitration/study） */
  kind: string;
  /** 達成したとき寄与する備えの分野 */
  field: CrisisFieldId;
  /** 出始める段階（0 始まり。省略時は最初から） */
  fromStage?: number;
  /** 出なくなる段階（省略時は終幕まで出続ける） */
  toStage?: number;
  /** 戦いの接点の相手（enemies.json の id。defense/escort の接点が持つ） */
  ref?: string;
  /** 提示条件（関係・持ち物・暦などの条件DSL。省略時は無条件） */
  require?: Cond;
  /** 「実際にしてきたこと」への親和（条件ごとの加重。合算して提示の重みになる） */
  affinity?: readonly TouchpointAffinity[];
  /** 仕事の注文に乗る品（order/supply/arbitration/study の接点が持つ） */
  offer?: CrisisTouchpointOfferDef;
}

export interface CrisisTypeDef {
  id: string;
  name: string;
  /** 出現率の重み */
  weight: number;
  /** 重い危機：決着の場面をすべて落とすと世界が滅びる */
  heavy?: boolean;
  factions: readonly CrisisFactionDef[];
  stages: readonly CrisisStageDef[];
  /** 決着の場面（1〜3。atBoundary の昇順） */
  finales: readonly CrisisFinaleDef[];
  /** シードで決める変数 */
  variables?: readonly { key: string; options: readonly string[] }[];
  touchpoints?: readonly CrisisTouchpointDef[];
  narration?: {
    stage?: Record<string, string>;
    finale?: { resolved?: string; ruin?: string };
  };
}

/** 接点の提示まわりの係数（balance.json crisis.touchpoints。W-02） */
export interface CrisisTouchpointsConfig {
  /**
   * 「実際にしてきたこと」への親和が全部外れても残る基底の重み。
   * どの生き方にも接点があるための床
   */
  weightBase: number;
  /**
   * 1日に日常へ混ぜる接点の数（段階 index → 件数）。段階が進むほど多く出す。
   * 段階が多い場合は末尾の値を使う。0 はその段階では出さない
   */
  offersPerStage: readonly number[];
  /** 接点1回の達成で備えに足す量（乗せ先ごと。普通に暮らす範囲では世界全体の一部にとどまる量） */
  contribution: { work: number; combat: number };
}

/**
 * 関与（docs/08 §6、W-03）：危機に関わる行動の積み重ね＋名声・立場・関連スキル・
 * 頂点ルートから読む派生値。GameState には持たない（行動・実績はすべて
 * counters・flags・crisis.hero・台帳・称号に既に刻まれている。セーブの形は変えない）
 */

/** 関与の段階：1 見届けた / 2 支えた / 3 担った / 4 率いた（英雄） */
export type CrisisInvolvementStage = 1 | 2 | 3 | 4;

/** 決着の場面での役割（実際のスキルから決まる）：前線の要／会議の場／装備と支度／まとめ役 */
export type CrisisFinaleRole = "vanguard" | "negotiator" | "artisan" | "coordinator";

/** 関与スコアの各項の重み（balance.json crisis.involvement.weights） */
export interface CrisisInvolvementWeights {
  /** 危機の接点の達成数（counters["crisis.tp.done"]）1件あたり */
  tpDone: number;
  /** 世界の備えへの寄与の合計（crisis.hero の各分野の和）1あたり */
  heroPrep: number;
  /** 名声（ライバル・ランキングと同じ自実績点）1あたり */
  renown: number;
  /** 立場の段（standings 配列の順。最下位=0）1あたり */
  standing: number;
  /** 最高スキル値1あたり（関連スキル：その人の実際の得意） */
  skill: number;
  /** 頂点ルートの達成段数（全ルート合計）1あたり（近道。必須ではない） */
  pinnacleStage: number;
  /** 完走した頂点ルート1本あたり */
  pinnacleTop: number;
}

/**
 * ライバルの関与（W-03、docs/08 §6「ライバルも関与を持ち、英雄になりうる」）。
 * 名・二つ名・適性は rivals.json、数値は balance.json。顔ぶれはランキングと同じ
 * （drawRivalCast で同じ抽選列を引く。個人の関与の伸びだけ別の世界シード由来の列）
 */
export interface CrisisRivalConfig {
  /** 生成名の母集団（rivals.json names） */
  names: readonly string[];
  /** 二つ名の母集団（rivals.json epithets。ランキングと同じ引き順で揃う） */
  epithets: readonly string[];
  /** 英雄の適性がある二つ名（rivals.json crisis.heroEpithets。適性者は関与が速く伸びる） */
  heroEpithets: readonly string[];
  /** 世界に存在するライバルの数（balance.rivals.size と同じ顔ぶれにする） */
  size: number;
  /** ライバルの1季節あたりの関与の伸び（シードで min〜max） */
  growthPerBoundary: { min: number; max: number };
  /** 英雄適性のあるライバルの伸び（min〜max） */
  heroGrowthPerBoundary: { min: number; max: number };
  /** 段階4のライバルが決着の判定に足す備え（1人あたり） */
  contribution: number;
  /** 段階4のライバルが最も早い未決着を早めて「起こせる」幅（季節の変わり目数） */
  hastenWindow: number;
}

/**
 * 関与まわりの係数＋注入コンテンツ（balance.json crisis.involvement。
 * pinnacles・standings・rivals の顔ぶれは content 由来、係数は balance 由来）
 */
export interface CrisisInvolvementConfig {
  /** 段階2・3・4 の閾値（昇順3つ。段階1は最小の閾値未満） */
  stageThresholds: readonly number[];
  /** 各項の重み */
  weights: CrisisInvolvementWeights;
  /**
   * 段階2（支えた）から接点の日ごとの提示に足す件数（「注文や依頼が増える」。
   * 増えた提示を受けるかは自由 —— 受けなくても不利益はない）
   */
  supporterExtraOffers: number;
  /** 打診の勝負所で最高の働き（score=1）をしたとき備えに足す量（場面の分野に按分） */
  attemptBonus: number;
  /** 自分で起こす決着：最高スキル値が主人公側の備えに乗る重み */
  leadSkillWeight: number;
  /** 自分で起こす決着：名声が主人公側の備えに乗る重み */
  leadRenownWeight: number;
  /** 一点に絞った起こし方のとき required に乗る係数（1未満＝やり方を選ぶと届きやすい） */
  leadFocusFactor: number;
  /** 上位3技能の差がこの値以内なら「まとめ役」（何でも少しずつな生き方の役割） */
  coordinatorSpread: number;
  /** 役割 → 属するスキルID の表。最高スキルの所属で役割を決める */
  roleSkills: {
    vanguard: readonly string[];
    negotiator: readonly string[];
    artisan: readonly string[];
  };
  /** 名声（自実績点）の算出に使う係数（balance.rivals。省略時は名声項を 0 とする） */
  renown?: RivalsConfig;
  /** 頂点ルートの定義（条件鎖の進行を読む用。省略時は頂点項を 0 とする） */
  pinnacles?: readonly PinnacleRouteDef[];
  /** 立場の順序（society.standings の id の並び。省略時は立場項を 0 とする） */
  standings?: readonly string[];
  /** ライバルの関与（省略時はライバルは関与を持たない） */
  rivals?: CrisisRivalConfig;
}

/** balance.json の crisis 節＋危機の型の一覧（content/crises 経由で組み立てる） */
export interface CrisisConfig {
  /** この世界に現れうる危機の型（hidden があればそれ、なければ公開サンプル） */
  types: readonly CrisisTypeDef[];
  /** 勢力ごとの得意分野の既定数（勢力側の指定が優先） */
  strongFields: number;
  /** 得意分野でない分野への備え係数（0〜1） */
  weakFieldFactor: number;
  /** 接点の提示・寄与の係数（W-02。省略時は接点を出さない） */
  touchpoints?: CrisisTouchpointsConfig;
  /**
   * 関与（W-03、docs/08 §6）：段階の閾値・役割・打診・起こし・ライバルの係数。
   * 省略時は関与の仕組み自体を出さない（打診もライバルの活躍も起きない）
   */
  involvement?: CrisisInvolvementConfig;
}

/** 分野ごとの備えの初期値（全部 0） */
export function emptyCrisisFields(): Record<CrisisFieldId, number> {
  return Object.fromEntries(CRISIS_FIELD_IDS.map((f) => [f, 0])) as Record<CrisisFieldId, number>;
}

/**
 * 世界の危機を抽選する（docs/08 §3「危機を1つ抽選（型 × 変数）」）。
 * 型・勢力の得意分野と速さ・決着の場面の時期・語り用変数を世界シードから
 * 決定論的に決める。型の一覧が空なら null（危機なしの世界）
 */
export function drawCrisis(seed: string, cfg: CrisisConfig): CrisisState | null {
  if (cfg.types.length === 0) return null;
  const rng = createRng(seed).fork("crisis");
  const type = rng.weighted(cfg.types.map((t) => ({ item: t, weight: t.weight })));

  // 勢力の得意分野と速さ（シードごとの変数。aptitude は抽選の重み）
  const factions = type.factions.map((f) => {
    const frng = rng.fork(`faction:${f.id}`);
    const count = Math.min(f.strongFields ?? cfg.strongFields, CRISIS_FIELD_IDS.length);
    const pool = CRISIS_FIELD_IDS.map((id) => ({ id, weight: f.aptitude?.[id] ?? 1 }));
    const strongFields: CrisisFieldId[] = [];
    while (strongFields.length < count && pool.length > 0) {
      const picked = frng.weighted(pool.map((p) => ({ item: p.id, weight: p.weight })));
      strongFields.push(picked);
      pool.splice(
        pool.findIndex((p) => p.id === picked),
        1,
      );
    }
    const speed = f.speed.min + (f.speed.max - f.speed.min) * frng.next();
    return { id: f.id, strongFields, speed, prep: emptyCrisisFields() };
  });

  // 決着の場面の時期（±jitter の揺れをシードで決める）
  const finales = type.finales.map((f) => {
    const jitter = f.jitter ?? 0;
    const frng = rng.fork(`finale:${f.id}`);
    return {
      id: f.id,
      atBoundary: Math.max(1, f.atBoundary + (jitter > 0 ? frng.int(-jitter, jitter) : 0)),
      resolved: false,
    };
  });

  // 語り用の変数（原因の所在・場所・人物など。シードで1つずつ選ぶ）
  const variables = Object.fromEntries(
    (type.variables ?? []).map((v) => {
      const vrng = rng.fork(`var:${v.key}`);
      return [v.key, vrng.pick(v.options)];
    }),
  );

  return {
    typeId: type.id,
    stageIndex: 0,
    seasonsInStage: 0,
    boundaries: 0,
    factions,
    hero: emptyCrisisFields(),
    finales,
    variables,
    npcGone: [],
    log: [{ day: 0, kind: "draw", ref: type.id }],
    outcome: "ongoing",
  };
}

/**
 * 季節の変わり目の危機の進行（docs/08 §3〜4）。step の sleep/rest 処理から呼ぶ：
 * from（眠った日）と state.time（新しい朝）の季節が変わったときだけ動く。
 *
 * - 未抽選の世界（v15 以前のセーブなど）はこの変わり目に危機を抽選する（移行の口）
 * - 勢力の備えが季節ぶん積まれる（得意分野は等速、それ以外は弱い係数）
 * - 段階が進み、段階の影響が切り替わる（NPCの離散・死亡だけは記録として残る）
 * - その変わり目に予定された決着の場面を判定する（全部終われば終幕）
 */
export function crisisSeasonTurn(
  state: GameState,
  cfg: CrisisConfig,
  time: TimeConfig,
  from: GameTime,
): { state: GameState; events: ActionEvent[] } {
  const events: ActionEvent[] = [];
  const seasonIndex = (t: GameTime): number => {
    const d = describeTime(t, time);
    return d.year * time.seasonsPerYear + d.season;
  };
  if (seasonIndex(state.time) === seasonIndex(from)) return { state, events };

  // 未抽選の世界：この変わり目に危機を抽選する（v15 以前のセーブの移行口。
  // 抽選した季節は「兆し」の始まりなので、この回ではまだ進行しない）
  if (state.crisis === null) {
    const drawn = drawCrisis(state.seed, cfg);
    if (drawn === null) return { state, events };
    const crisis: CrisisState = {
      ...drawn,
      log: [{ day: state.time.day, kind: "draw", ref: drawn.typeId }],
    };
    events.push({ type: "crisisDrawn" });
    return { state: { ...state, crisis }, events };
  }

  const prev = state.crisis;
  if (prev.outcome !== "ongoing") return { state, events };
  const type = cfg.types.find((t) => t.id === prev.typeId);
  if (type === undefined) return { state, events }; // 型が差し替えられた世界では進行を止める

  let next: CrisisState = { ...prev, boundaries: prev.boundaries + 1 };
  const day = state.time.day;

  // 勢力の備え：得意分野は等速で、それ以外の分野は弱い係数で積む（docs/08 §4）
  const factions = next.factions.map((f) => {
    const prep = { ...f.prep };
    for (const field of CRISIS_FIELD_IDS) {
      prep[field] += f.speed * (f.strongFields.includes(field) ? 1 : cfg.weakFieldFactor);
    }
    return { ...f, prep };
  });
  next = { ...next, factions };

  // 段階の進行：滞在季節を消費して次へ。最終段は決着が来るまで続く
  const stage = type.stages[next.stageIndex];
  const seasonsInStage = next.seasonsInStage + 1;
  if (
    stage !== undefined &&
    seasonsInStage >= stage.seasons &&
    next.stageIndex + 1 < type.stages.length
  ) {
    next = { ...next, stageIndex: next.stageIndex + 1, seasonsInStage: 0 };
    const newStage = type.stages[next.stageIndex]!;
    next = { ...next, log: [...next.log, { day, kind: "stage", ref: newStage.id }] };
    events.push({ type: "crisisStageChanged", stage: newStage.id });
    // NPC の離散・死亡はこの段階に入った時点で記録され、元に戻らない
    for (const n of newStage.effects?.npc ?? []) {
      if (!next.npcGone.some((x) => x.id === n.id)) {
        next = {
          ...next,
          npcGone: [...next.npcGone, { id: n.id, kind: n.kind, day }],
          log: [...next.log, { day, kind: `npc.${n.kind}`, ref: n.id }],
        };
      }
    }
  } else {
    next = { ...next, seasonsInStage };
  }

  // 決着の場面：この変わり目に予定されたものを順に判定する。
  // 備え（世界の勢力＋主人公の寄与＋名乗りを上げたライバル）が
  // required ×(1±margin) に届けば成功（乱数は控えめ）
  const finales0 = next.finales.map((f) => ({ ...f }));

  // ライバルの関与（W-03、docs/08 §6「世界は主人公を待たない」）：
  // 段階4に届いたライバルは英雄の器 —— 決着の場面に名乗りを上げて備えを足し、
  // 最も早い未決着を hastenWindow 季節ぶん早めて「起こす」こともある。
  // 成否はあくまで世界の備えの判定 —— 主人公がどれだけ関わっていてもいなくても同じ
  const rc = cfg.involvement?.rivals;
  const champions =
    rc !== undefined
      ? crisisRivals({ ...state, crisis: next }, cfg).filter((r) => r.stage === 4 && !r.gone)
      : [];
  const firstUnresolved = finales0.find((f) => !f.resolved);
  for (const f of finales0) {
    if (f.resolved) continue;
    const due = f.atBoundary <= next.boundaries;
    const early =
      !due &&
      champions.length > 0 &&
      f === firstUnresolved &&
      f.atBoundary - next.boundaries <= (rc?.hastenWindow ?? 0);
    if (!due && !early) continue;
    const def = type.finales.find((x) => x.id === f.id);
    f.resolved = true;
    if (def === undefined) {
      f.success = true;
      continue;
    }
    // 世界の備え（勢力＋主人公の寄与）に、名乗りを上げたライバルの備えが加わる
    const total =
      def.fields.reduce(
        (a, field) => a + next.hero[field] + next.factions.reduce((s, fa) => s + fa.prep[field], 0),
        0,
      ) +
      champions.length * (rc?.contribution ?? 0);
    f.total = total;
    const margin = def.margin ?? 0;
    const j =
      margin > 0
        ? (createRng(state.seed).fork(`crisis:finale:${f.id}:${f.atBoundary}`).next() * 2 - 1) *
          margin
        : 0;
    f.success = total >= def.required * (1 + j);
    next = {
      ...next,
      log: [...next.log, { day, kind: f.success ? "finale.win" : "finale.loss", ref: f.id }],
    };
    events.push({ type: "crisisFinale", id: f.id, success: f.success, total });
    // 勝ち取った場面では、先陣を切ったライバルが英雄として世界の記録に残る
    const champion = f.success ? champions[0] : undefined;
    if (champion !== undefined) {
      next = {
        ...next,
        log: [...next.log, { day, kind: "rival.hero", ref: crisisRivalRef(champion.index) }],
      };
      events.push({ type: "crisisRivalHero", index: champion.index, finale: f.id });
    }
    if (f.success) break; // 決着がついた（残りの場面は起きない）
  }
  next = { ...next, finales: finales0 };

  // 終幕：いずれかの場面が決着すれば解決。すべて落とした場合は、
  // 重い危機だけ滅び、通常の危機は苦戦の末に決着する（docs/08 §4）
  const anyWin = finales0.some((f) => f.success === true);
  const allDone = finales0.every((f) => f.resolved);
  if (anyWin || allDone) {
    const outcome = anyWin ? "resolved" : type.heavy === true ? "ruin" : "resolved";
    next = { ...next, outcome, log: [...next.log, { day, kind: `end.${outcome}` }] };
    events.push({ type: "crisisEnded", outcome });
  }

  return { state: { ...state, crisis: next }, events };
}

// ---- 読み出しヘルパー（段階の影響の参照・NPCの所在・備えの参照） ----

/** 現在の危機の型（state.crisis.typeId から引く） */
export function crisisTypeOf(state: GameState, cfg: CrisisConfig): CrisisTypeDef | undefined {
  const crisis = state.crisis;
  if (crisis === null) return undefined;
  return cfg.types.find((t) => t.id === crisis.typeId);
}

/** 現在の段階の影響（正規化済み。解決した危機の影響は解け、滅びた世界の影響は残る） */
export interface ActiveCrisisEffects {
  closeAreas: string[];
  closeRoads: string[];
  price: CrisisPriceEffect[];
  enemy: CrisisEnemyEffect[];
  npc: CrisisNpcEffect[];
  features: string[];
}

export function crisisEffects(state: GameState, cfg: CrisisConfig): ActiveCrisisEffects {
  const empty: ActiveCrisisEffects = {
    closeAreas: [],
    closeRoads: [],
    price: [],
    enemy: [],
    npc: [],
    features: [],
  };
  const crisis = state.crisis;
  if (crisis === null || crisis.outcome === "resolved") return empty;
  const stage = crisisTypeOf(state, cfg)?.stages[crisis.stageIndex];
  const e = stage?.effects;
  if (e === undefined) return empty;
  return {
    closeAreas: [...(e.closeAreas ?? [])],
    closeRoads: [...(e.closeRoads ?? [])],
    price: [...(e.price ?? [])],
    enemy: [...(e.enemy ?? [])],
    npc: [...(e.npc ?? [])],
    features: [...(e.features ?? [])],
  };
}

/** エリアが危機で閉鎖されているか（段階が変われば解放される） */
export function crisisAreaClosed(
  state: GameState,
  cfg: CrisisConfig | undefined,
  area: string,
): boolean {
  if (cfg === undefined) return false;
  return crisisEffects(state, cfg).closeAreas.includes(area);
}

/**
 * 道が危機で通行止めになっているか（G-02、docs/10 §7「閉ざされる道」）。
 * 道の id（journeyIdOf）か道の種別（"highway"/"mountain"/"sea"）の
 * どちらかが closeRoads に載れば封じられる。段階が変われば解放される
 */
export function crisisRoadClosed(
  state: GameState,
  cfg: CrisisConfig | undefined,
  road: { id: string; kind?: string },
): boolean {
  if (cfg === undefined) return false;
  const closed = crisisEffects(state, cfg).closeRoads;
  if (closed.includes(road.id)) return true;
  return road.kind !== undefined && closed.includes(road.kind);
}

/** 危機由来の物価（仕事の報酬倍率。kind は系統別に絞る。全種別エントリも乗る） */
export function crisisPriceFactor(
  state: GameState,
  cfg: CrisisConfig | undefined,
  kind?: string,
): number {
  if (cfg === undefined) return 1;
  let factor = 1;
  for (const p of crisisEffects(state, cfg).price) {
    if (p.kind === undefined || p.kind === kind) factor *= p.factor;
  }
  return factor;
}

/** 敵の影響エントリが対象に効くか（id・area の両方の条件を満たすこと。省略は全対象） */
function enemyEffectMatches(e: CrisisEnemyEffect, enemy: { id: string; area?: string }): boolean {
  if (e.id !== undefined && e.id !== enemy.id) return false;
  return e.area === undefined || e.area === enemy.area;
}

/**
 * 危機由来の敵の強化（withWorldMods の WorldMods に畳める形で返す）。
 * 現在の段階の影響のうち対象に効くものを掛け合わせる
 */
export function crisisEnemyMods(
  state: GameState,
  cfg: CrisisConfig | undefined,
  enemy: { id: string; area?: string },
): { enemyHpFactor: number; enemyPowerFactor: number } {
  let enemyHpFactor = 1;
  let enemyPowerFactor = 1;
  if (cfg !== undefined) {
    for (const e of crisisEffects(state, cfg).enemy) {
      if (!enemyEffectMatches(e, enemy)) continue;
      enemyHpFactor *= e.hpFactor ?? 1;
      enemyPowerFactor *= e.powerFactor ?? 1;
    }
  }
  return { enemyHpFactor, enemyPowerFactor };
}

/** 危機由来の挑戦差の加算（gain の delta に乗る。対象に効くエントリの合計） */
export function crisisEnemyChallengeBonus(
  state: GameState,
  cfg: CrisisConfig | undefined,
  enemy: { id: string; area?: string },
): number {
  if (cfg === undefined) return 0;
  let bonus = 0;
  for (const e of crisisEffects(state, cfg).enemy) {
    if (enemyEffectMatches(e, enemy)) bonus += e.challengeBonus ?? 0;
  }
  return bonus;
}

/** 危機で離散・死亡したNPCの状態（段階の影響で記録される。元に戻らない） */
export function crisisNpcAbsent(state: GameState, npcId: string): "leave" | "die" | null {
  return state.crisis?.npcGone.find((n) => n.id === npcId)?.kind ?? null;
}

/** 危機の中でだけ有効になる依頼・素材・場所のタグが有効か（W-02 の接続点） */
export function crisisFeatureActive(
  state: GameState,
  cfg: CrisisConfig | undefined,
  tag: string,
): boolean {
  if (cfg === undefined) return false;
  return crisisEffects(state, cfg).features.includes(tag);
}

/** 世界の備えの合計（分野ごと。主人公の寄与は含まない） */
export function crisisPreparedness(state: GameState): Record<CrisisFieldId, number> {
  const total = emptyCrisisFields();
  for (const f of state.crisis?.factions ?? []) {
    for (const field of CRISIS_FIELD_IDS) total[field] += f.prep[field];
  }
  return total;
}

/**
 * 主人公の寄与を備えに加える（W-02 の接点から呼ぶAPI）。
 * docs/08 §5：「接点で積んだ寄与は、その分野の備えに加わる」。
 * 危機の進行・結末は主人公の行動に依存しない —— これはクエストではなく備えへの足し
 */
export function addHeroContribution(
  state: GameState,
  field: CrisisFieldId,
  amount: number,
): GameState {
  const crisis = state.crisis;
  if (crisis === null || crisis.outcome !== "ongoing" || amount <= 0) return state;
  return {
    ...state,
    crisis: { ...crisis, hero: { ...crisis.hero, [field]: crisis.hero[field] + amount } },
  };
}

// ---- 接点（docs/08 §5、W-02）：危機は日常に混ざる ----
// 提示は世界シード×日付から決定的に引く。接点は既存の遊び（仕事の注文・狩りの敵）に
// 乗せて出るだけで、受けても受けなくてもよい（断る・無視する側には何も起きない）。
// 「生き方の分類」は作らず、実際にしてきたことへの親和だけで重み付けする

/** 接点の乗せ先（既存の遊び）。offer がある接点は仕事の注文、ref だけの接点は狩りに出る */
export type CrisisTouchpointVessel = "work" | "combat";

export function crisisTouchpointVessel(def: CrisisTouchpointDef): CrisisTouchpointVessel | null {
  if (def.offer !== undefined) return "work";
  if (def.ref !== undefined) return "combat";
  return null;
}

/**
 * その日すでに達成した接点か（同日には二度出さない「繰り返さないための予算」）。
 * 達成は行動ログの variant（仕事なら注文ID、狩りなら接点ID）に刻まれるので、
 * GameState の形は変えずに読み取れる
 */
function touchpointDoneToday(state: GameState, def: CrisisTouchpointDef): boolean {
  const day = state.time.day;
  return state.actionLog.some(
    (e) => e.day === day && (e.kind === "work" || e.kind === "combat") && e.variant === def.id,
  );
}

/**
 * 接点が今日の提示候補になるかどうかの重み（0 なら出ない）。
 * 進行中の危機の現在の段階で出るもののうち、require を満たし今日未達成のものに、
 * 「実際にしてきたこと」への親和の合算＋基底の重みを与える
 */
export function crisisTouchpointWeight(
  state: GameState,
  def: CrisisTouchpointDef,
  cfg: CrisisConfig,
  time: TimeConfig,
  env?: CondEnv,
): number {
  const tp = cfg.touchpoints;
  const crisis = state.crisis;
  if (tp === undefined || crisis === null || crisis.outcome !== "ongoing") return 0;
  if (crisisTouchpointVessel(def) === null) return 0;
  const stage = crisis.stageIndex;
  if (def.fromStage !== undefined && stage < def.fromStage) return 0;
  if (def.toStage !== undefined && stage > def.toStage) return 0;
  if (def.require !== undefined && !evaluate(def.require, state, time, env)) return 0;
  if (touchpointDoneToday(state, def)) return 0;
  let w = tp.weightBase;
  for (const a of def.affinity ?? []) {
    if (evaluate(a.cond, state, time, env)) w += a.weight;
  }
  return w;
}

/** 今日、日常に混ざっている接点の提示（work：注文の品、combat：狩りの相手） */
export interface CrisisTouchpointOffer {
  def: CrisisTouchpointDef;
  vessel: CrisisTouchpointVessel;
  /**
   * work：仕事の注文一覧に混ざる品。id は接点の id で、
   * 達成は work コマンドの order にその id を渡す（注文と同じ流れで品質を積む）
   */
  order?: CrisisTouchpointOrder;
  /**
   * combat：狩りに混ざる相手（enemies.json の id = def.ref）。
   * 達成は combat コマンドの touchpoint に接点の id を渡す（勝ったときだけ寄与）
   */
  enemyId?: string;
}

/** 注文の品（id＝接点の id。《異変》の印は表示側が付ける） */
export interface CrisisTouchpointOrder extends CrisisTouchpointOfferDef {
  id: string;
}

/**
 * 今日の接点の一覧（世界シード×日付で決定的。受けなくても何も起きない）。
 * 現在の段階で出る候補から、実際にしてきたことへの親和で重み付きに
 * offersPerStage[段階] 件まで引く
 */
export function crisisTouchpointOffers(
  state: GameState,
  cfg: CrisisConfig | undefined,
  time: TimeConfig,
  env?: CondEnv,
): CrisisTouchpointOffer[] {
  if (cfg === undefined) return [];
  const tp = cfg.touchpoints;
  const crisis = state.crisis;
  if (tp === undefined || crisis === null || crisis.outcome !== "ongoing") return [];
  const type = crisisTypeOf(state, cfg);
  if (type === undefined) return [];
  const pool = (type.touchpoints ?? [])
    .map((def) => ({ def, weight: crisisTouchpointWeight(state, def, cfg, time, env) }))
    .filter((x) => x.weight > 0);
  if (pool.length === 0) return [];
  // 関与が段階2（支えた）に届くと注文や依頼が増える（W-03、docs/08 §6。
  // 提示が増えるだけ —— 受けるかは自由、受けなくても不利益はない）
  const supporterBonus =
    cfg.involvement !== undefined && crisisInvolvement(state, cfg).stage >= 2
      ? cfg.involvement.supporterExtraOffers
      : 0;
  const cap =
    (tp.offersPerStage[Math.min(crisis.stageIndex, tp.offersPerStage.length - 1)] ?? 0) +
    supporterBonus;
  // 引きは世界シード×日付から（state.rng は消費しない。生の乱数も使わない）
  const rng = createRng(`${state.seed}:crisis:tp:${state.time.day}`);
  const picked: CrisisTouchpointDef[] = [];
  while (picked.length < cap && pool.length > 0) {
    const hit = rng.weighted(pool.map((p) => ({ item: p.def, weight: p.weight })));
    picked.push(hit);
    pool.splice(
      pool.findIndex((p) => p.def === hit),
      1,
    );
  }
  return picked.flatMap((def): CrisisTouchpointOffer[] => {
    const vessel = crisisTouchpointVessel(def);
    if (vessel === "work") {
      const offer = def.offer!;
      return [{ def, vessel, order: { ...offer, id: def.id } }];
    }
    if (vessel === "combat") return [{ def, vessel, enemyId: def.ref! }];
    return [];
  });
}

/**
 * 現在の危機の型から接点を id で引く（表示名の解決用。
 * 台帳や伝記に残った古い接点も引けるよう、今日の提示・段階は問わない）
 */
export function crisisTouchpointOf(
  state: GameState,
  cfg: CrisisConfig | undefined,
  id: string,
): CrisisTouchpointDef | null {
  if (cfg === undefined) return null;
  const type = crisisTypeOf(state, cfg);
  return type?.touchpoints?.find((x) => x.id === id) ?? null;
}

/**
 * work コマンドの order が今日の接点の注文か（系統も一致していること）。
 * 達成として有効なら接点の定義を返す（今日の提示外・別系統・同日達成済みは null）
 */
export function crisisTouchpointForWork(
  state: GameState,
  cfg: CrisisConfig | undefined,
  time: TimeConfig,
  orderId: string,
  kind: string,
  env?: CondEnv,
): CrisisTouchpointDef | null {
  const hit = crisisTouchpointOffers(state, cfg, time, env).find((o) => o.order?.id === orderId);
  if (hit === undefined || hit.def.offer === undefined) return null;
  return hit.def.offer.kind === kind ? hit.def : null;
}

/**
 * combat コマンドの touchpoint が今日の接点か（相手も接点のものと一致していること）。
 * 達成として有効なら接点の定義を返す（今日の提示外・別の相手・同日達成済みは null）
 */
export function crisisTouchpointForCombat(
  state: GameState,
  cfg: CrisisConfig | undefined,
  time: TimeConfig,
  tpId: string,
  enemyId: string,
  env?: CondEnv,
): CrisisTouchpointDef | null {
  const hit = crisisTouchpointOffers(state, cfg, time, env).find(
    (o) => o.vessel === "combat" && o.def.id === tpId,
  );
  if (hit === undefined) return null;
  return hit.def.ref === enemyId ? hit.def : null;
}

// ---- 関与と英雄への道（docs/08 §6、W-03） ----
//
// 関与は派生値：行動・実績はすべて既存の state（接点の達成数カウンタ、
// 世界の備えへの寄与、名声＝自実績点、立場、スキル、頂点フラグ）に刻まれているので、
// GameState の形は変えず、その都度読んで段階を決める。
// 関与は分野をまたいで合算する —— hero の各分野の和を読むので、
// 一つの道を極めた人も、いろいろな道で少しずつ関わった人も同じ式で届く。
// 打診・参加・起こしの記録は flags/counters に刻む（crisis.offer.<id> 等）

/** 打診が届いたことの記録フラグ（同じ場面への打診は一度だけ） */
export const crisisOfferFlag = (finaleId: string): string => `crisis.offer.${finaleId}`;
/** 打診に応えて参加を請けたことの記録フラグ */
export const crisisJoinFlag = (finaleId: string): string => `crisis.join.${finaleId}`;
/** 勝負所を果たしたことの記録フラグ（1場面につき1回だけ挑める） */
export const crisisAttemptFlag = (finaleId: string): string => `crisis.attempt.${finaleId}`;
/** 決着を自分で率いて勝ち取ったことの記録フラグ（英雄） */
export const CRISIS_HERO_FLAG = "crisis.hero";
/** 世界の記録（crisis.log）に残るライバルの参照（index はライバルの抽選順） */
export const crisisRivalRef = (index: number): string => `rival.${index}`;

/**
 * 関与スコアの内訳と段階。
 * 各項：危機の接点の達成・世界の備えへの寄与・名声・立場・最高スキル・頂点ルート
 */
export interface CrisisInvolvement {
  score: number;
  stage: CrisisInvolvementStage;
  /** 内訳（各項×重みの値。どの生き方で積んだかが読める。テスト・記録用） */
  parts: {
    tpDone: number;
    heroPrep: number;
    renown: number;
    standing: number;
    skill: number;
    pinnacle: number;
  };
}

/** スコア → 段階（stageThresholds は段階2・3・4 の閾値の昇順） */
export function crisisInvolvementStage(
  score: number,
  inv: CrisisInvolvementConfig,
): CrisisInvolvementStage {
  const t2 = inv.stageThresholds[0] ?? Infinity;
  const t3 = inv.stageThresholds[1] ?? Infinity;
  const t4 = inv.stageThresholds[2] ?? Infinity;
  if (score >= t4) return 4;
  if (score >= t3) return 3;
  if (score >= t2) return 2;
  return 1;
}

/**
 * 関与を計算する（docs/08 §6）。
 * 頂点ルートは近道であって条件ではない：頂点項は大きな足しになるが、
 * 接点・寄与・名声・立場・実力の積み重ねだけでも同じ閾値に届く。
 * 関与の対象は「進行中・終わった危機を問わないこの世界での積み重ね」
 * （危機が無い・終わった世界でも数値は読めるが、打診・起こしは進行中だけ）
 */
export function crisisInvolvement(
  state: GameState,
  cfg: CrisisConfig | undefined,
): CrisisInvolvement {
  const inv = cfg?.involvement;
  const zero: CrisisInvolvement = {
    score: 0,
    stage: 1,
    parts: { tpDone: 0, heroPrep: 0, renown: 0, standing: 0, skill: 0, pinnacle: 0 },
  };
  if (cfg === undefined || inv === undefined) return zero;
  const w = inv.weights;

  // 危機に関わる行動の積み重ね：接点の達成数＋世界の備えへの寄与（分野をまたいだ合算）
  const tpDone = state.counters["crisis.tp.done"] ?? 0;
  const heroPrep = CRISIS_FIELD_IDS.reduce((s, f) => s + (state.crisis?.hero[f] ?? 0), 0);
  // 名声：ライバル・ランキングと同じ自実績点（台帳の最高品質・称号・討伐・深層）
  const renown = inv.renown !== undefined ? playerScore(state, inv.renown) : 0;
  // 立場：社会の中での位置（society.standings の並び順。最下位=0）
  const standing =
    inv.standings !== undefined ? Math.max(0, inv.standings.indexOf(state.society.standing)) : 0;
  // 関連スキル：その人の実際の得意（最高スキル値）
  const bestSkill = Math.max(0, ...Object.values(state.player.skills).map((s) => s.value));
  // 頂点ルート：達成した段の合計＋完走ボーナス（近道）
  const pinnacleStages = (inv.pinnacles ?? []).reduce(
    (s, r) => s + routeProgress(state, r).done,
    0,
  );
  const pinnacleTops = inv.pinnacles !== undefined ? reachedPinnacles(state, inv.pinnacles) : [];

  const parts = {
    tpDone: tpDone * w.tpDone,
    heroPrep: heroPrep * w.heroPrep,
    renown: renown * w.renown,
    standing: standing * w.standing,
    skill: bestSkill * w.skill,
    pinnacle: pinnacleStages * w.pinnacleStage + pinnacleTops.length * w.pinnacleTop,
  };
  const score =
    parts.tpDone + parts.heroPrep + parts.renown + parts.standing + parts.skill + parts.pinnacle;
  return { score, stage: crisisInvolvementStage(score, inv), parts };
}

/**
 * 決着の場面での役割（docs/08 §6「役割は実際の得意から決まる」）。
 * 最高スキルの所属で決める：武が立てば前線、弁が立てば会議、工が立てば装備、
 * 何でも少しずつなら（上位3技能が拮抗していれば）全体のまとめ役
 */
export function crisisFinaleRole(
  state: GameState,
  cfg: CrisisConfig | undefined,
): CrisisFinaleRole {
  const inv = cfg?.involvement;
  const ranked = Object.entries(state.player.skills)
    .filter(([, s]) => s.value > 0)
    .sort((a, b) => b[1].value - a[1].value);
  if (inv === undefined || ranked.length === 0) return "coordinator";
  if (ranked.length >= 3 && ranked[0]![1].value - ranked[2]![1].value <= inv.coordinatorSpread) {
    return "coordinator";
  }
  const top = ranked[0]![0];
  if (inv.roleSkills.vanguard.includes(top)) return "vanguard";
  if (inv.roleSkills.negotiator.includes(top)) return "negotiator";
  if (inv.roleSkills.artisan.includes(top)) return "artisan";
  return "coordinator";
}

/** 未決着の場面ごとの、あなたへの打診・参加・起こしの状態（表示・判定の共通語彙） */
export interface CrisisFinaleOffer {
  def: CrisisFinaleDef;
  /** 打診の対象（最も早い未決着の場面で、判定の境界にまだ達していない） */
  pending: boolean;
  /** 打診がすでに届いている（flags["crisis.offer.<id>"]） */
  offered: boolean;
  /** 打診に応えられる（届いていて、まだ請けていない） */
  joinable: boolean;
  /** 参加を請けている（勝負所に臨める） */
  joined: boolean;
  /** 勝負所をすでに果たした（1場面につき1回） */
  attempted: boolean;
  /** 自分で起こせる（関与が段階4＝率いた） */
  leadable: boolean;
  /** あなたの役割（実際のスキルから） */
  role: CrisisFinaleRole;
  /** 判定の境界までの残り季節数（0以下になることはない） */
  remainingBoundaries: number;
}

/**
 * 未決着の場面と、それぞれへの関わり方の一覧（docs/08 §6）。
 * 打診は世界から届く：関与が段階3（担った）に達すると、step が最も早い
 * 未決着への打診を発行し、flags["crisis.offer.<id>"] に記録される。
 * ここではその記録と段階から「いま何ができるか」を返すだけ —— 世界を
 * 主人公向けのクエスト一覧としては見せない（受けなくても世界は進む）
 */
export function crisisFinaleOffers(
  state: GameState,
  cfg: CrisisConfig | undefined,
): CrisisFinaleOffer[] {
  const crisis = state.crisis;
  if (
    cfg === undefined ||
    cfg.involvement === undefined ||
    crisis === null ||
    crisis.outcome !== "ongoing"
  ) {
    return [];
  }
  const type = crisisTypeOf(state, cfg);
  if (type === undefined) return [];
  const { stage } = crisisInvolvement(state, cfg);
  const role = crisisFinaleRole(state, cfg);
  const unresolved = crisis.finales.filter((f) => !f.resolved);
  const earliest = unresolved.reduce<CrisisState["finales"][number] | null>(
    (m, f) => (m === null || f.atBoundary < m.atBoundary ? f : m),
    null,
  );
  const offers: CrisisFinaleOffer[] = [];
  for (const f of unresolved) {
    const def = type.finales.find((d) => d.id === f.id);
    if (def === undefined) continue;
    const pending = f === earliest && crisis.boundaries < f.atBoundary;
    const offered = state.flags[crisisOfferFlag(f.id)] === true;
    const joined = state.flags[crisisJoinFlag(f.id)] === true;
    const attempted = state.flags[crisisAttemptFlag(f.id)] === true;
    offers.push({
      def,
      pending,
      offered,
      joinable: pending && offered && !joined,
      joined,
      attempted,
      leadable: stage === 4,
      role,
      remainingBoundaries: Math.max(0, f.atBoundary - crisis.boundaries),
    });
  }
  return offers;
}

/**
 * 打診に応えたあとの勝負所（docs/08 §6「その場面が勝負所として遊べ、結果が成否に
 * 大きく効く」）。score は実際に遊んだ結果の出来（0〜1。戦闘の勝敗・ミニゲームの
 * 品質・交渉の結果を呼び出し側が換算する）で、attemptBonus 掛けを場面の分野に
 * 按分して世界の備え（crisis.hero）に加算する —— W-01 の判定を変えずに、
 * 主人公の結果が世界の備えへ「加算」される形で効く。1場面につき1回だけ
 */
export function crisisFinaleAttempt(
  state: GameState,
  cfg: CrisisConfig | undefined,
  finaleId: string,
  score: number,
): { state: GameState; ok: boolean; score: number; amount: number } {
  const inv = cfg?.involvement;
  const offer = crisisFinaleOffers(state, cfg).find((o) => o.def.id === finaleId);
  if (inv === undefined || offer === undefined || !offer.joined || offer.attempted) {
    return { state, ok: false, score: 0, amount: 0 };
  }
  const s = Math.max(0, Math.min(1, score));
  const amount = s * inv.attemptBonus;
  let next = state;
  for (const field of offer.def.fields) {
    next = addHeroContribution(next, field, amount / offer.def.fields.length);
  }
  return { state: next, ok: true, score: s, amount };
}

/**
 * 自分で起こす決着（docs/08 §6、段階4＝率いた＝英雄）。
 * 未決着の場面を今ここで判定する —— 予定の時期を早められるし、field を指定して
 * 「やり方を一点に絞る」こともできる（絞ると required に leadFocusFactor が掛かるが、
 * 主人公側の備えもその分野だけで判定する）。
 * 成否は主に主人公側の備えで決まる：自分が積んだ寄与（crisis.hero の対象分野）に
 * 実力（最高スキル値）と名声を重み付きで足したものが required ×(1±margin) に届くか。
 * 世界の勢力の備えはまだ届いていない —— 率いたのはあなただ
 */
export function crisisFinaleLead(
  state: GameState,
  cfg: CrisisConfig | undefined,
  finaleId: string,
  field?: CrisisFieldId,
): { state: GameState; ok: boolean; success?: boolean; total?: number } {
  const inv = cfg?.involvement;
  const crisis = state.crisis;
  if (cfg === undefined || inv === undefined || crisis === null || crisis.outcome !== "ongoing") {
    return { state, ok: false };
  }
  const type = crisisTypeOf(state, cfg);
  if (type === undefined) return { state, ok: false };
  if (crisisInvolvement(state, cfg).stage !== 4) return { state, ok: false };
  const f = crisis.finales.find((x) => x.id === finaleId);
  const def = type.finales.find((x) => x.id === finaleId);
  if (f === undefined || def === undefined || f.resolved) return { state, ok: false };
  if (field !== undefined && !def.fields.includes(field)) return { state, ok: false };

  // 主人公側の備え：対象分野に自分が積んだ寄与＋実力＋名声
  const fields = field !== undefined ? [field] : def.fields;
  const heroPrep = fields.reduce((s, x) => s + crisis.hero[x], 0);
  const bestSkill = Math.max(0, ...Object.values(state.player.skills).map((s) => s.value));
  const renown = inv.renown !== undefined ? playerScore(state, inv.renown) : 0;
  const total = heroPrep + bestSkill * inv.leadSkillWeight + renown * inv.leadRenownWeight;
  const required = def.required * (field !== undefined ? inv.leadFocusFactor : 1);
  const margin = def.margin ?? 0;
  const j =
    margin > 0 ? (createRng(state.seed).fork(`crisis:lead:${f.id}`).next() * 2 - 1) * margin : 0;
  const success = total >= required * (1 + j);

  const day = state.time.day;
  const finales = crisis.finales.map((x) =>
    x.id === f.id ? { ...x, resolved: true, success, total } : { ...x },
  );
  // 率いた決着は世界の記録に hero / heroFail として残る（finale.win/loss と別の語彙）
  let next: CrisisState = {
    ...crisis,
    finales,
    log: [...crisis.log, { day, kind: success ? "finale.hero" : "finale.heroFail", ref: f.id }],
  };
  // 終幕判定は W-01 と同じ語彙：1つでも決着が立てば解決、すべて落ちたら重い危機は滅び
  const anyWin = finales.some((x) => x.success === true);
  const allDone = finales.every((x) => x.resolved);
  if (anyWin || allDone) {
    const outcome = anyWin ? "resolved" : type.heavy === true ? "ruin" : "resolved";
    next = { ...next, outcome, log: [...next.log, { day, kind: `end.${outcome}` }] };
  }
  return { state: { ...state, crisis: next }, ok: true, success, total };
}

// ---- ライバルの関与（W-03、docs/08 §6「ライバルも関与を持ち、英雄になりうる」） ----

/**
 * ライバルの関与（1季節ごとに個人の伸びぶん積まれる。世界シードから決定的）。
 * 顔ぶれはランキングと同じ（drawRivalCast の同じ抽選列）。英雄の適性がある
 * 二つ名の者は関与が速く伸び、段階4に届くと決着に名乗りを上げる
 */
export interface CrisisRival {
  /** ライバルの抽選順（log の ref "rival.<index>" と対応） */
  index: number;
  name: string;
  epithet: string;
  /** 英雄の適性がある二つ名を持つか */
  heroCandidate: boolean;
  /** 1季節あたりの関与の伸び（シード由来） */
  growth: number;
  /** 現在の関与スコア（伸び×境界の回数） */
  score: number;
  stage: CrisisInvolvementStage;
  /** 街に居ない（X-12：引退・旅立ち・亡くなったライバルは決着に名乗りを上げない） */
  gone: boolean;
}

export function crisisRivals(state: GameState, cfg: CrisisConfig | undefined): CrisisRival[] {
  const inv = cfg?.involvement;
  const rc = inv?.rivals;
  if (cfg === undefined || inv === undefined || rc === undefined) return [];
  // ランキングと同じ顔ぶれを引く（名声の値は関与に使わないので係数は渡さない ——
  // 引き順さえ同じなら名と二つ名は一致する）
  const casts = drawRivalCast(
    state.seed,
    { names: rc.names, epithets: rc.epithets },
    { size: rc.size, scoreMin: 0, scoreMax: 0, growthPerDay: 0 },
  );
  const rr = createRng(state.seed).fork("crisis:rivals");
  const boundaries = state.crisis?.boundaries ?? 0;
  return casts.map((c, index) => {
    const heroCandidate = rc.heroEpithets.includes(c.epithet);
    const g = heroCandidate ? rc.heroGrowthPerBoundary : rc.growthPerBoundary;
    const growth = g.min + (g.max - g.min) * rr.next();
    const score = growth * boundaries;
    return {
      index,
      name: c.name,
      epithet: c.epithet,
      heroCandidate,
      growth,
      score,
      stage: crisisInvolvementStage(score, inv),
      gone: npcGoneReason(state, crisisRivalRef(index)) !== null,
    };
  });
}

/** ライバルの参照（"rival.<index>"）から素性を引く（記録・新聞の表示名解決用） */
export function crisisRivalOf(
  state: GameState,
  cfg: CrisisConfig | undefined,
  index: number,
): CrisisRival | null {
  return crisisRivals(state, cfg).find((r) => r.index === index) ?? null;
}

/** 記録の ref（"rival.<index>"）→ ライバルの表示名（引けなければ生の ref） */
export function crisisRivalName(
  state: GameState,
  cfg: CrisisConfig | undefined,
  ref: string,
): string {
  const index = Number.parseInt(ref.slice("rival.".length), 10);
  const rival = Number.isFinite(index) ? crisisRivalOf(state, cfg, index) : null;
  return rival === null
    ? ref
    : rival.epithet !== ""
      ? `${rival.name}《${rival.epithet}》`
      : rival.name;
}

// ---- 終幕の見せ方（W-04、docs/08 §3・§7） ----
// 危機の見せ方は新聞・噂・景色・物価・人物の不在で担い、画面に段階を常時出さない。
// 決着した危機の「終幕」（紙の層の語り＋主人公の痕跡＋世界の年代記の一頁）は、
// 「危機の型の語り＋関与の段階＋関わった人物・作品」のテンプレートで組み立てる。
// ここはその素材を GameState から摘む層。画面への提示は UI が担う

/**
 * 終幕の語りに使うテキスト群（content/text/narration.json の crisis 節。
 * core は形だけを知り、本文はコンテンツから注入される）
 */
export interface CrisisEndingText {
  /** 危機の変数の表示語（変数key → 値 → 表示名） */
  vars: Record<string, Record<string, string>>;
  /** 段階の語りref → 噂・記事の行 */
  stage: Record<string, readonly string[]>;
  /** 語りrefを持たない段階・型への汎用の噂 */
  stageFallback: readonly string[];
  /** 滅びた世の噂 */
  ruin: readonly string[];
  /** 終幕の語りref → 紙の層の段落行 */
  finale: Record<string, readonly string[]>;
  /** 語りrefを持たない型への汎用の終幕 */
  finaleFallback: { resolved: readonly string[]; ruin: readonly string[] };
  /**
   * 主人公の痕跡の候補行（関与の段階 → 行。"4b" は率いる立場に
   * ありながら勝者ではなかった場合。{var}が埋められない行は選ばない）
   */
  trace: Record<string, readonly string[]>;
  /** 滅びの終幕用の痕跡の候補行 */
  traceRuin: Record<string, readonly string[]>;
}

/** 語りに差し込む表示名の解決（人名・役割・作品名は呼び出し側の語彙で） */
export interface CrisisEndingNames {
  /** 関与の段階 → 表示名（例: 3 → "担った"） */
  stage?: (stage: CrisisInvolvementStage) => string;
  /** 決着の場面での役割 → 表示名（例: vanguard → "前線の要"） */
  role?: (role: CrisisFinaleRole) => string;
  /** NPCのid → 表示名（離散・死亡した者を名前で語る） */
  npc?: (id: string) => string;
  /** ライバルの参照（"rival.<index>"）→ 表示名 */
  rival?: (ref: string) => string;
  /** 作品（台帳の品）→ 表示名 */
  work?: (work: Work) => string;
}

/** 語りのテンプレートに変数を差し込む（{var}。埋められない変数はそのまま残る） */
const tplEnding = (s: string, vars: Record<string, string>): string =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

/** テンプレート中の {var} がすべて差し込めるか（埋められない行は痕跡の候補から外す） */
const endingFillable = (s: string, vars: Record<string, string>): boolean =>
  ![...s.matchAll(/\{(\w+)\}/g)].some((m) => vars[m[1]!] === undefined);

/**
 * 終幕の素材（docs/08 §7）：危機の型の語り＋関与の段階の痕跡＋世界の年代記の一頁。
 * 進行中・危機の無い世界では null（何も見せない）
 */
export interface CrisisEnding {
  outcome: "resolved" | "ruin";
  /** 危機の型の id と表示名 */
  typeId: string;
  typeName: string;
  /** 関与の段階（表示側で段階名に解決する。段階名そのものは語りに出さない） */
  stage: CrisisInvolvementStage;
  /** 紙の層の語り（危機の型の語り。変数・決着の場面名を織り込んだ段落行） */
  narration: string[];
  /** 主人公の痕跡（関与の段階に応じて織り込まれる1行。関わった人物・作品も差し込む） */
  trace: string[];
  /** その世界の年代記の一頁の素材（世界の記録。表示側が行にする） */
  page: readonly { day: number; kind: string; ref?: string }[];
}

export function crisisEnding(
  state: GameState,
  cfg: CrisisConfig | undefined,
  text: CrisisEndingText,
  names: CrisisEndingNames = {},
): CrisisEnding | null {
  const crisis = state.crisis;
  if (crisis === null || cfg === undefined) return null;
  const outcome = crisis.outcome;
  if (outcome === "ongoing") return null;
  const type = crisisTypeOf(state, cfg);

  // 語りに差し込む語：あなたの名・危機の型・シードで決まった変数の表示名
  const vars: Record<string, string> = {
    name: state.player.name,
    type: type?.name ?? crisis.typeId,
  };
  for (const [k, v] of Object.entries(crisis.variables)) {
    vars[k] = text.vars[k]?.[v] ?? v;
  }
  // 決着の場面名：あなたが率いた場面 → 世界が勝ち取った場面 → 最後に判定された場面
  const led = crisis.log.find((l) => l.kind === "finale.hero" || l.kind === "finale.heroFail")?.ref;
  const won = crisis.finales.find((f) => f.success === true)?.id;
  const last = [...crisis.finales].reverse().find((f) => f.resolved)?.id;
  const finaleDef = type?.finales.find((f) => f.id === (led ?? won ?? last));
  if (finaleDef !== undefined) vars["finale"] = finaleDef.name;
  // 関わった人物：英雄として記録されたライバル・この世を去ったNPC
  const heroes = crisis.log.filter((l) => l.kind === "rival.hero" && l.ref !== undefined);
  if (heroes.length > 0 && names.rival !== undefined) {
    vars["person"] = heroes.map((l) => names.rival!(l.ref!)).join("、");
  }
  if (crisis.npcGone.length > 0 && names.npc !== undefined) {
    vars["gone"] = crisis.npcGone.map((n) => names.npc!(n.id)).join("、");
  }
  // 関わった作品：接点の注文として納めた最も良い品（「支えた」は名もなき形で語られる）
  const tpIds = new Set((type?.touchpoints ?? []).map((tp) => tp.id));
  const tpWork = state.ledger
    .filter((w) => w.order !== undefined && tpIds.has(w.order.split("#")[0] ?? ""))
    .sort((a, b) => b.quality - a.quality || b.tier - a.tier || a.day - b.day)[0];
  if (tpWork !== undefined) {
    vars["work"] =
      names.work?.(tpWork) ??
      crisisTouchpointOf(state, cfg, tpWork.order!.split("#")[0]!)?.offer?.name ??
      tpWork.order!;
  }
  const involvement = crisisInvolvement(state, cfg);
  const role = crisisFinaleRole(state, cfg);
  vars["stage"] = names.stage?.(involvement.stage) ?? String(involvement.stage);
  vars["role"] = names.role?.(role) ?? role;

  // 紙の層の語り：危機の型の語りrefを本文に解決する（無い型は汎用の終幕）
  const ref = type?.narration?.finale?.[outcome];
  const paras = (ref !== undefined ? text.finale[ref] : undefined) ?? text.finaleFallback[outcome];
  const narration = paras.map((p) => tplEnding(p, vars));

  // 主人公の痕跡：関与の段階で差し込まれる語り（埋められない変数を持つ行は選ばない）
  const hero = state.flags[CRISIS_HERO_FLAG] === true;
  const key = involvement.stage === 4 && !hero ? "4b" : String(involvement.stage);
  const table = outcome === "ruin" ? text.traceRuin : text.trace;
  const cands = (table[key] ?? table[String(involvement.stage)] ?? []).filter((l) =>
    endingFillable(l, vars),
  );
  const pick =
    cands.length > 0
      ? createRng(state.seed)
          .fork(`crisis:trace:${outcome}:${key}`)
          .pick([...cands])
      : null;
  const trace = pick === null ? [] : [tplEnding(pick, vars)];

  return {
    outcome,
    typeId: crisis.typeId,
    typeName: type?.name ?? crisis.typeId,
    stage: involvement.stage,
    narration,
    trace,
    page: crisis.log,
  };
}

/**
 * 現在の危機の段階の噂・記事の1行（docs/08 §3：新聞・噂で知る）。
 * 危機の無い世界・解決した世界では null（解決後は噂に残らない）。
 * rng は日付など呼び出し側で分けた列を渡す
 */
export function crisisStageLine(
  state: GameState,
  cfg: CrisisConfig | undefined,
  text: Pick<CrisisEndingText, "vars" | "stage" | "stageFallback" | "ruin">,
  rng: Rng,
): string | null {
  const crisis = state.crisis;
  if (crisis === null || cfg === undefined) return null;
  const type = crisisTypeOf(state, cfg);
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(crisis.variables)) {
    vars[k] = text.vars[k]?.[v] ?? v;
  }
  if (crisis.outcome === "ruin") {
    // 滅びた世は、滅びた世として生き続ける。噂もその世のものになる
    return text.ruin.length === 0 ? null : tplEnding(rng.pick([...text.ruin]), vars);
  }
  if (crisis.outcome === "resolved") return null;
  const stage = type?.stages[crisis.stageIndex];
  const ref = stage !== undefined ? type?.narration?.stage?.[stage.id] : undefined;
  const lines = (ref !== undefined ? text.stage[ref] : undefined) ?? text.stageFallback;
  return lines.length === 0 ? null : tplEnding(rng.pick([...lines]), vars);
}

/**
 * 転生の年代記に残る後日談（docs/08 §7「あなたが去った後、この世界は…」）。
 * 決着を生きて見届けた生なら witnessed、未決着で終わった生なら、
 * 主人公なしの世界がこの先どうなるかを同じ決定論で先読みする
 * （世界は主人公を待たない：勢力の備えとライバルの名乗りだけで季節の変わり目を回す）
 */
export interface CrisisEpilogue {
  /** この世界が向かう結末（ongoing = 予見できる範囲ではまだ決着しない） */
  outcome: "resolved" | "ruin" | "ongoing";
  /** この生のうちに決着を見届けたか */
  witnessed: boolean;
}

export function crisisEpilogue(
  state: GameState,
  cfg: CrisisConfig | undefined,
  time: TimeConfig,
): CrisisEpilogue | null {
  const crisis = state.crisis;
  if (crisis === null || cfg === undefined) return null;
  if (crisis.outcome !== "ongoing") return { outcome: crisis.outcome, witnessed: true };
  // 季節の変わり目を決定的に回して結末を先読みする。決着の場面は必ず有限の
  // 境界で判定されるので、上限は安全のための大きな値（想定の判定数より十分大きい）
  let sim: GameState = state;
  let from: GameTime = state.time;
  for (let i = 0; i < 64; i++) {
    const to: GameTime = { day: from.day + time.daysPerSeason, action: 0 };
    sim = { ...sim, time: to };
    sim = crisisSeasonTurn(sim, cfg, time, from).state;
    from = to;
    const out = sim.crisis?.outcome ?? "ongoing";
    if (out !== "ongoing") return { outcome: out, witnessed: false };
  }
  return { outcome: "ongoing", witnessed: false };
}

/**
 * 打診を運ぶ人（W-04、docs/08 §6「会話の窓で人物から持ちかけられる」）。
 * その場面の分野にいちばん備えを積んだ勢力が、あなたに使いを寄こす。
 * 勢力が引けない世界では null（会話の名札は表示側が適当な言葉に倒す）
 */
export function crisisOfferSpeaker(
  state: GameState,
  cfg: CrisisConfig | undefined,
  finaleId: string,
): string | null {
  const crisis = state.crisis;
  if (crisis === null || cfg === undefined) return null;
  const type = crisisTypeOf(state, cfg);
  const def = type?.finales.find((f) => f.id === finaleId);
  if (def === undefined) return null;
  let best: { name: string; prep: number } | null = null;
  for (const f of crisis.factions) {
    const prep = def.fields.reduce((s, x) => s + (f.prep[x] ?? 0), 0);
    if (best === null || prep > best.prep) {
      const name = type?.factions.find((x) => x.id === f.id)?.name ?? f.id;
      best = { name, prep };
    }
  }
  return best?.name ?? null;
}

/**
 * 危機の段階による景色の霞（docs/08 §3「景色の差分」。W-04）。
 * 段階が進むほど背景に白い霞が深まり、滅びた世は強く翳る。解決した世界は晴れる。
 * GameState には持たない派生値で、数値は見た目の量（画面側が背景に重ねる濃さ 0〜1）
 */
export function crisisSceneHaze(state: GameState, cfg: CrisisConfig | undefined): number {
  const crisis = state.crisis;
  if (crisis === null || cfg === undefined) return 0;
  if (crisis.outcome === "resolved") return 0;
  if (crisis.outcome === "ruin") return 0.8;
  const lastStage = Math.max(1, (crisisTypeOf(state, cfg)?.stages.length ?? 1) - 1);
  // 兆し≈0.15 から最終段≈0.5 まで段階に応じて霞が深まる（見た目の量）
  return 0.15 + (crisis.stageIndex / lastStage) * 0.35;
}
