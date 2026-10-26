import type { ActionEvent } from "../events/index.js";
import { createRng } from "../rng/index.js";
import {
  CRISIS_FIELD_IDS,
  type CrisisFieldId,
  type CrisisState,
  type GameState,
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

export interface CrisisTouchpointDef {
  id: string;
  kind: string;
  field: CrisisFieldId;
  fromStage?: number;
  ref?: string;
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

/** balance.json の crisis 節＋危機の型の一覧（content/crises 経由で組み立てる） */
export interface CrisisConfig {
  /** この世界に現れうる危機の型（hidden があればそれ、なければ公開サンプル） */
  types: readonly CrisisTypeDef[];
  /** 勢力ごとの得意分野の既定数（勢力側の指定が優先） */
  strongFields: number;
  /** 得意分野でない分野への備え係数（0〜1） */
  weakFieldFactor: number;
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
  // 備え（世界の勢力＋主人公の寄与）が required ×(1±margin) に届けば成功（乱数は控えめ）
  const finales = next.finales.map((f) => ({ ...f }));
  for (const f of finales) {
    if (f.resolved || f.atBoundary !== next.boundaries) continue;
    const def = type.finales.find((x) => x.id === f.id);
    f.resolved = true;
    if (def === undefined) {
      f.success = true;
      continue;
    }
    const total = def.fields.reduce(
      (a, field) => a + next.hero[field] + next.factions.reduce((s, fa) => s + fa.prep[field], 0),
      0,
    );
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
    if (f.success) break; // 決着がついた（残りの場面は起きない）
  }
  next = { ...next, finales };

  // 終幕：いずれかの場面が決着すれば解決。すべて落とした場合は、
  // 重い危機だけ滅び、通常の危機は苦戦の末に決着する（docs/08 §4）
  const anyWin = finales.some((f) => f.success === true);
  const allDone = finales.every((f) => f.resolved);
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
  price: CrisisPriceEffect[];
  enemy: CrisisEnemyEffect[];
  npc: CrisisNpcEffect[];
  features: string[];
}

export function crisisEffects(state: GameState, cfg: CrisisConfig): ActiveCrisisEffects {
  const empty: ActiveCrisisEffects = {
    closeAreas: [],
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
