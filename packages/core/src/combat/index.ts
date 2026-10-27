import { ctxRng, type MiniGameCtx } from "../minigame/types.js";
import type { Rng } from "../rng/index.js";

/**
 * 予兆を読むCT制戦闘（docs/03_world_systems.md §4）。
 *
 * - 時間は tick。プレイヤーの行動は CT（敏捷で変化）だけ時間を進め、
 *   その間に敵の行動予定が来れば敵が動く（速い敵は1行動に2回動く）
 * - 敵の行動は固定ルールのパターン（enemies.json）。大技の前に「予兆」が出る
 * - 予兆の精度は《観察》で上がる：低いと「狼が唸っている」、高いと技名＋残りtick
 * - 「見切り」は1行動を使う代わりに予兆の精度を底上げし、その間は回避に大きな
 *   ボーナスが乗る（F-04。読み切れれば大技を無傷で躱し、大きな隙が生まれる）
 * - 「防御」は次の自分の行動まで受けるダメージを軽減する。大技を防御で受け止めると
 *   敵の体勢が崩れ（隙＋次行動の遅れ）、次の一撃が確実な反撃になる
 *
 * F-04 の駆け引き：
 * - 攻撃には命中判定（外れることがある）・ダメージの揺らぎ・会心がある
 * - 敵の攻撃にも揺らぎと痛恨（会心）がある。通常被弾は《回避》でごく僅かに躱せる
 * - 大技は防御（確実に軽減＋反撃の隙）か見切り（賭けの完全回避＋大きな隙）で
 *   対応する。対応しないと大きな傷を負う —— 格上では連打だけでは沈む
 *
 * 乱数はすべて ctx のシードから fork して引く（turn 番号＋用途ラベル）。
 * 同じシード・同じ行動列なら必ず同じ結果になる（決定性）。
 *
 * 戦闘はここに閉じ、結果は step の combat コマンドで GameState に反映する。
 * K-02（武技・気力・状態異常）への拡張口：
 *   - CombatAction に { type:"art"; id } 形の行動を足す場合、turn 冒頭の
 *     switch に解決枝を追加する。導出値は CombatState の playerXxx に乗せる
 *   - CombatEvent.type / フラグに技の結果種別を足せば UI・SE が拾える
 *   - 敵の耐性・弱点は EnemyMove/EnemyDef にフィールドを足す（zod 側も）
 *   - 「隙」（openingUntil/openingFactor）は武器技の追撃・崩し大技の土台になる
 */

export interface EnemyMove {
  id: string;
  name: string;
  power: number;
}

export interface EnemyPatternStep {
  /** attack=通常攻撃 / telegraph=大技の予兆（ticks 後に move が発動） */
  type: "attack" | "telegraph";
  move?: string;
  ticks?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  /** 行動間隔（tick）。小さいほど速い */
  intervalTicks: number;
  /** gain の挑戦差に使う相手の強さ */
  challenge: number;
  /** 逃走の抵抗・命中回避の差分に使う敏捷相当値 */
  agility: number;
  attack: EnemyMove;
  moves: Record<string, EnemyMove>;
  pattern: EnemyPatternStep[];
}

export interface CombatConfig {
  /** プレイヤー耐久 = base + endurance × perEndurance */
  baseHp: number;
  hpPerEndurance: number;
  /** 攻撃力 = base + swordplay × perSwordplay + strength × perStrength */
  attackBase: number;
  attackPerSwordplay: number;
  attackPerStrength: number;
  /** 行動1回の消費tick = max(ctMin, ctBase − agility × ctPerAgility) */
  ctBase: number;
  ctPerAgility: number;
  ctMin: number;
  /** 防御中に受ける通常ダメージの倍率 */
  defendFactor: number;
  /** 逃走成功率 = base + (敏捷 − 敵敏捷) × perAgility（0〜1 にクランプ） */
  fleeBase: number;
  fleePerAgility: number;
  /** 「見切り」行動で予兆精度に乗るボーナス */
  observeBonus: number;
  /** 予兆が精密になる観察の閾値（これ未満は曖昧表示） */
  preciseObserve: number;
  /** 死亡時に失う未定着経験の割合（03 §4「50%」） */
  deathPendingFactor: number;

  /* ── F-04：命中・会心・揺らぎ・対応行動 ── */
  /** 攻撃の命中率 = base + 剣術 × perSwordplay + (敏捷 − 敵敏捷) × perAgilityDiff */
  hitBase: number;
  hitPerSwordplay: number;
  hitPerAgilityDiff: number;
  /** 命中率の上下限（hitMin〜hitMax にクランプ） */
  hitMin: number;
  hitMax: number;
  /** ダメージの揺らぎ（最終威力に掛ける一様乱数の範囲。敵・味方共通） */
  varianceMin: number;
  varianceMax: number;
  /** 会心率 = base + 剣術 × perSwordplay。会心の倍率は critFactor */
  critBase: number;
  critPerSwordplay: number;
  critFactor: number;
  /** 敵の痛恨率・倍率（被弾側の揺らぎと緊張） */
  enemyCritBase: number;
  enemyCritFactor: number;
  /**
   * 通常被弾の回避率 = base + 回避 × perEvasion + (敏捷 − 敵敏捷) × perAgilityDiff
   * （0〜evadeMax にクランプ。防御中は回避判定をしない —— 受け止める構え）
   */
  evadeBase: number;
  evadePerEvasion: number;
  evadePerAgilityDiff: number;
  evadeMax: number;
  /** 見切り中の回避への上乗せ（大技も躱せる賭けの一手） */
  readEvadeBonus: number;
  /** 防御中に予兆の大技を受け止めたときの被ダメージ倍率（defendFactor より強い） */
  guardTelegraphFactor: number;
  /** 大技を防御で受け止めたあとの反撃倍率（次の攻撃が確定命中＋この倍率） */
  counterFactor: number;
  /** 大技を見切りで躱したあとの反撃倍率（防御より大きい隙） */
  counterFactorRead: number;
  /** 隙の持続（tick）。反撃は次の攻撃1回だけ有効 */
  openingTicks: number;
  /** 大技をいなした敵の次行動の遅れ（tick。体勢崩しの間、敵は間を置く） */
  staggerTicks: number;

  /** 強化版ユニーク（T-44）。省略時は強個体なし */
  unique?: UniqueConfig;
  /** 個体差（R-01）。省略時は個体差なし */
  individual?: IndividualConfig;
}

export type CombatAction = "attack" | "defend" | "observe" | "flee";

export interface Telegraph {
  move: string;
  name: string;
  /** 発動する tick */
  dueTick: number;
}

export interface CombatEvent {
  tick: number;
  type:
    | "playerAttack"
    | "playerMiss"
    | "playerDefend"
    | "playerObserve"
    | "playerFlee"
    | "enemyHit"
    | "enemyMiss"
    | "telegraph"
    | "counter"
    | "fled"
    | "won"
    | "lost";
  text: string;
  damage?: number;
  /** 会心（playerAttack / enemyHit） */
  crit?: boolean;
  /** 予兆の大技による被弾・回避（enemyHit / enemyMiss） */
  big?: boolean;
  /** 防御で受け止めた被弾（enemyHit） */
  guarded?: boolean;
  /** 隙への反撃としての一撃（playerAttack） */
  counter?: boolean;
}

export interface CombatState {
  tick: number;
  /** プレイヤーの行動数（乱数 fork のラベルに使う。同じ行動列は同じ乱数列） */
  turn: number;
  playerHp: number;
  playerHpMax: number;
  enemyHp: number;
  /** 敵の体力上限（開始時点。ゲージの max に使う） */
  enemyHpMax: number;
  enemyIdx: number;
  /** 次に敵のパターンが進む tick（体勢崩しで後ろへずれる） */
  enemyNextAt: number;
  telegraph: Telegraph | null;
  /** 防御姿勢が有効な上限 tick（この tick までに受けるダメージを軽減） */
  defendUntil: number;
  /** 見切りが有効な上限 tick（この tick まで回避に大きなボーナス） */
  readUntil: number;
  /**
   * 敵の隙（大技をいなした報酬）。この tick までの攻撃が確定命中・
   * openingFactor 倍の反撃になる。0/0 なら隙なし
   */
  openingUntil: number;
  openingFactor: number;
  /** 見切り行動を使ったか（予兆の精度を底上げ） */
  observed: boolean;
  fleeAttempts: number;
  done: boolean;
  won: boolean;
  fled: boolean;
  died: boolean;
  damageTaken: number;
  hitsTaken: number;
  /** 敵の攻撃を躱した回数（F-04） */
  dodges: number;
  /** 大技を対応行動でいなした回数（受け止め＋見切り。F-04） */
  parries: number;
  /** プレイヤーの導出値（startCombat で確定） */
  playerAttack: number;
  playerCt: number;
  playerObserve: number;
  playerAgility: number;
  playerSwordplay: number;
  playerEvasion: number;
  log: CombatEvent[];
}

export interface CombatResult {
  won: boolean;
  fled: boolean;
  died: boolean;
  damageTaken: number;
  hitsTaken: number;
  ticks: number;
}

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * プレイヤー側の戦闘数値（stats + スキルから導出）。
 * attackFactor は称号などの与ダメージ倍率（effects の damageVs。既定1）
 */
export function playerCombatStats(
  player: { stats: Record<string, number>; skills: Record<string, { value: number }> },
  cfg: CombatConfig,
  attackFactor = 1,
): {
  hp: number;
  attack: number;
  ct: number;
  agility: number;
  observe: number;
  swordplay: number;
  evasion: number;
} {
  const agility = player.stats["agility"] ?? 0;
  return {
    hp: Math.round(cfg.baseHp + (player.stats["endurance"] ?? 0) * cfg.hpPerEndurance),
    attack:
      Math.round(
        (cfg.attackBase +
          (player.skills["swordplay"]?.value ?? 0) * cfg.attackPerSwordplay +
          (player.stats["strength"] ?? 0) * cfg.attackPerStrength) *
          attackFactor *
          10,
      ) / 10,
    ct: Math.max(cfg.ctMin, cfg.ctBase - agility * cfg.ctPerAgility),
    agility,
    observe: player.skills["observation"]?.value ?? 0,
    swordplay: player.skills["swordplay"]?.value ?? 0,
    evasion: player.skills["evasion"]?.value ?? 0,
  };
}

export function startCombat(
  enemy: EnemyDef,
  cfg: CombatConfig,
  player: { stats: Record<string, number>; skills: Record<string, { value: number }> },
  /** 称号などの与ダメージ倍率（effects の damageFactor(enemyId)。既定1） */
  attackFactor = 1,
): CombatState {
  const p = playerCombatStats(player, cfg, attackFactor);
  return {
    tick: 0,
    turn: 0,
    playerHp: p.hp,
    playerHpMax: p.hp,
    enemyHp: enemy.hp,
    enemyHpMax: enemy.hp,
    enemyIdx: 0,
    enemyNextAt: Math.max(1, Math.round(enemy.intervalTicks / 2)),
    telegraph: null,
    defendUntil: -1,
    readUntil: -1,
    openingUntil: 0,
    openingFactor: 0,
    observed: false,
    fleeAttempts: 0,
    done: false,
    won: false,
    fled: false,
    died: false,
    damageTaken: 0,
    hitsTaken: 0,
    dodges: 0,
    parries: 0,
    playerAttack: p.attack,
    playerCt: p.ct,
    playerObserve: p.observe,
    playerAgility: p.agility,
    playerSwordplay: p.swordplay,
    playerEvasion: p.evasion,
    log: [],
  };
}

/** 攻撃の命中率（敵の敏捷との差と剣術で変わる。隙への反撃は必中） */
export function hitChance(state: CombatState, enemy: EnemyDef, cfg: CombatConfig): number {
  return clamp(
    cfg.hitMin,
    cfg.hitMax,
    cfg.hitBase +
      state.playerSwordplay * cfg.hitPerSwordplay +
      (state.playerAgility - enemy.agility) * cfg.hitPerAgilityDiff,
  );
}

/** 会心率（隙への反撃は必ず会心扱い） */
export function critChance(state: CombatState, cfg: CombatConfig): number {
  return clamp(0, 1, cfg.critBase + state.playerSwordplay * cfg.critPerSwordplay);
}

/** 被弾の回避率。見切り中は readEvadeBonus が乗る。防御中は 0（受け止める構え） */
export function evadeChance(state: CombatState, enemy: EnemyDef, cfg: CombatConfig): number {
  if (state.tick <= state.defendUntil) return 0;
  const base =
    cfg.evadeBase +
    state.playerEvasion * cfg.evadePerEvasion +
    (state.playerAgility - enemy.agility) * cfg.evadePerAgilityDiff;
  const reading = state.tick <= state.readUntil;
  return clamp(0, cfg.evadeMax, base + (reading ? cfg.readEvadeBonus : 0));
}

/** 予兆の3行表示（精度は観察＋見切りボーナスで決まる） */
export function telegraphLines(
  state: CombatState,
  enemy: EnemyDef,
  cfg: CombatConfig,
): [string, string, string] {
  const t = state.telegraph;
  if (!t) return ["――間合いを計っている。", "", ""];
  const eff = state.playerObserve + (state.observed ? cfg.observeBonus : 0);
  const remaining = Math.max(0, t.dueTick - state.tick);
  if (eff >= cfg.preciseObserve) {
    return [
      `――${enemy.name}が後ろ足に重心を移した`,
      `\u3000\u3000《${t.name}》（あと${remaining}tick）`,
      "\u3000\u3000防御か見切りでやり過ごせる",
    ];
  }
  return [
    `――${enemy.name}が唸っている。`,
    "\u3000\u3000何かを仕掛けてくる気配がする",
    "\u3000\u3000防御か見切りを",
  ];
}

/**
 * 敵の意図（F-04）：次に予定されている敵の行動と、いま有効な構え・隙。
 * 予兆の中身が読めるのは精度が preciseObserve 以上のときだけ（それ未満は
 * 「何か来る」まで分かるが名までは読めない）。UI・CLI の表示用。
 */
export interface CombatIntent {
  /** 発動待ちの予兆。precise=false なら name は不詳（曖昧表示向け） */
  telegraph: { name: string; dueIn: number; precise: boolean } | null;
  /**
   * 敵の次の行動予定（予兆発動とは別の、パターン上の一手）。
   * 精度が足りないときは kind/name を伏せて null 寄りの情報にする
   */
  next: { dueIn: number; kind: "attack" | "telegraph"; name: string | null } | null;
  /** いま有効な構え（防御/見切り。表示チップ用） */
  guarding: boolean;
  reading: boolean;
  /** 攻撃を抉れる隙が残っている tick 数（0 なら隙なし） */
  openingIn: number;
}

export function combatIntent(state: CombatState, enemy: EnemyDef, cfg: CombatConfig): CombatIntent {
  const eff = state.playerObserve + (state.observed ? cfg.observeBonus : 0);
  const precise = eff >= cfg.preciseObserve;
  const t = state.telegraph;
  const telegraph =
    t === null
      ? null
      : {
          name: precise ? t.name : "",
          dueIn: precise ? Math.max(0, t.dueTick - state.tick) : -1,
          precise,
        };
  let next: CombatIntent["next"] = null;
  if (!state.done && state.enemyHp > 0) {
    const step = enemy.pattern[state.enemyIdx % enemy.pattern.length];
    const dueIn = Math.max(0, state.enemyNextAt - state.tick);
    if (step !== undefined) {
      // 観察行動を取っていれば「あと何tickで動くか」は掴める（中身は精度次第）
      const known = state.observed || precise;
      next = known
        ? {
            dueIn,
            kind: step.type,
            name: precise
              ? step.type === "telegraph" && step.move !== undefined
                ? (enemy.moves[step.move]?.name ?? step.move)
                : enemy.attack.name
              : null,
          }
        : { dueIn: -1, kind: "attack", name: null };
    }
  }
  return {
    telegraph,
    next,
    guarding: state.tick <= state.defendUntil,
    reading: state.tick <= state.readUntil,
    openingIn: Math.max(0, state.openingUntil - state.tick),
  };
}

/**
 * プレイヤーの1行動を解決し、行動 CT 分の時間を進める。
 * その間に敵の予定行動が来れば解決する（複数回動きうる）。
 */
export function turn(
  state: CombatState,
  action: CombatAction,
  enemy: EnemyDef,
  cfg: CombatConfig,
  ctx: MiniGameCtx,
): CombatState {
  if (state.done) return state;
  const s: CombatState = { ...state, log: [...state.log], turn: state.turn + 1 };
  const push = (e: Omit<CombatEvent, "tick">, tick = s.tick) => s.log.push({ ...e, tick });

  // 1. プレイヤー行動
  const endTick = s.tick + s.playerCt;
  switch (action) {
    case "attack": {
      // 隙への反撃：体勢を崩した敵への一撃は必中・会心扱い（F-04）
      const opening = s.openingFactor > 0 && s.tick <= s.openingUntil;
      const r = ctxRng(ctx, `atk-${s.turn}`);
      if (!opening && r.next() >= hitChance(s, enemy, cfg)) {
        push({ type: "playerMiss", text: `攻撃――${enemy.name}に躱された。` });
        break;
      }
      const crit = opening || r.next() < critChance(s, cfg);
      const spread = cfg.varianceMin + r.next() * (cfg.varianceMax - cfg.varianceMin);
      const dmg = round1(
        s.playerAttack * spread * (crit ? cfg.critFactor : 1) * (opening ? s.openingFactor : 1),
      );
      s.enemyHp -= dmg;
      if (opening) {
        s.openingUntil = 0;
        s.openingFactor = 0;
      }
      push({
        type: "playerAttack",
        damage: dmg,
        ...(crit ? { crit: true } : {}),
        ...(opening ? { counter: true } : {}),
        text: opening
          ? `隙を突く――${enemy.name}に ${dmg} の一撃。`
          : crit
            ? `会心――${enemy.name}に ${dmg} の一撃。`
            : `攻撃――${enemy.name}に ${dmg} の傷。`,
      });
      break;
    }
    case "defend": {
      s.defendUntil = endTick;
      push({ type: "playerDefend", text: "防御の構え。" });
      break;
    }
    case "observe": {
      s.observed = true;
      s.readUntil = endTick;
      push({ type: "playerObserve", text: "敵の動きを見切る。" });
      break;
    }
    case "flee": {
      s.fleeAttempts++;
      const rng = ctxRng(ctx, `combat-flee-${s.fleeAttempts}`);
      const chance = Math.min(
        1,
        Math.max(0, cfg.fleeBase + (s.playerAgility - enemy.agility) * cfg.fleePerAgility),
      );
      if (rng.next() < chance) {
        s.fled = true;
        s.done = true;
        push({ type: "fled", text: "――間合いを離した。" });
        return s;
      }
      push({ type: "playerFlee", text: "逃げようとしたが、間合いを詰められた。" });
      break;
    }
  }

  if (s.enemyHp <= 0) {
    s.won = true;
    s.done = true;
    push({ type: "won", text: `――${enemy.name}は力尽きた。` });
    return s;
  }

  // 2. 時間を進めて、その間の敵行動を順に解決する
  //    被弾ごとに独立した乱数列（`evd-ターン-序数`）を fork する —— 決定的
  let absorbIdx = 0;
  /** 大技をいなした報酬：隙（反撃）＋体勢崩し（敵の次行動を遅らせる） */
  const openUp = (tick: number, factor: number) => {
    s.openingUntil = tick + cfg.openingTicks;
    s.openingFactor = factor;
    s.enemyNextAt += cfg.staggerTicks;
    s.parries++;
    push({ type: "counter", text: `――${enemy.name}の体勢が大きく崩れた。` }, tick);
  };
  const absorb = (tick: number, move: EnemyMove, big: boolean) => {
    const r = ctxRng(ctx, `evd-${s.turn}-${absorbIdx++}`);
    // 回避判定（防御中は躱さない —— 受け止める構えの分だけ揺らぎが無い）
    const evade =
      tick <= s.defendUntil
        ? 0
        : clamp(
            0,
            cfg.evadeMax,
            cfg.evadeBase +
              s.playerEvasion * cfg.evadePerEvasion +
              (s.playerAgility - enemy.agility) * cfg.evadePerAgilityDiff +
              (tick <= s.readUntil ? cfg.readEvadeBonus : 0),
          );
    if (r.next() < evade) {
      s.dodges++;
      push(
        {
          type: "enemyMiss",
          ...(big ? { big: true } : {}),
          text:
            tick <= s.readUntil
              ? `${enemy.name}の《${move.name}》――見切って躱した。`
              : `${enemy.name}の《${move.name}》――とっさに躱した。`,
        },
        tick,
      );
      // 見切りで大技を躱せば大きな隙が生まれる
      if (big && tick <= s.readUntil) openUp(tick, cfg.counterFactorRead);
      return;
    }
    const spread = cfg.varianceMin + r.next() * (cfg.varianceMax - cfg.varianceMin);
    // 大技は揺らぎはあっても痛恨にはならない（対応すべき「約束された一撃」として読めるよう）
    const crit = !big && r.next() < cfg.enemyCritBase;
    let dmg = move.power * spread * (crit ? cfg.enemyCritFactor : 1);
    const guarded = tick <= s.defendUntil;
    if (guarded) dmg *= big ? cfg.guardTelegraphFactor : cfg.defendFactor;
    dmg = Math.max(1, Math.round(dmg));
    s.playerHp -= dmg;
    s.damageTaken += dmg;
    s.hitsTaken++;
    push(
      {
        type: "enemyHit",
        damage: dmg,
        ...(crit ? { crit: true } : {}),
        ...(big ? { big: true } : {}),
        ...(guarded ? { guarded: true } : {}),
        text: guarded
          ? `${enemy.name}の《${move.name}》――受け止めた（${dmg}）。`
          : big
            ? `${enemy.name}の《${move.name}》――${dmg} の大傷。`
            : crit
              ? `${enemy.name}の《${move.name}》――痛恨。${dmg} の傷。`
              : `${enemy.name}の《${move.name}》――${dmg} の傷。`,
      },
      tick,
    );
    // 大技を防御で受け止めれば隙が生まれる
    if (big && guarded) openUp(tick, cfg.counterFactor);
  };

  let t = s.tick;
  while (t < endTick && s.enemyHp > 0) {
    // 予兆の発動
    if (s.telegraph && s.telegraph.dueTick <= t) {
      const mv = enemy.moves[s.telegraph.move];
      s.telegraph = null;
      if (mv) absorb(t, mv, true);
    }
    // 敵のパターン行動
    if (s.enemyNextAt <= t) {
      const step = enemy.pattern[s.enemyIdx % enemy.pattern.length]!;
      s.enemyIdx++;
      s.enemyNextAt += enemy.intervalTicks;
      if (step.type === "telegraph" && step.move) {
        const mv = enemy.moves[step.move];
        s.telegraph = {
          move: step.move,
          name: mv?.name ?? step.move,
          // F-04：発動は必ず現在の間合い（この行動の時間枠）の「先」に置く。
          // 予兆が見えてから次の判断まで必ず1手挟まる = 応じる機会が必ずある
          // （この枠の中で完結してしまうと、玩家は見えたのに防げない事故になる）
          dueTick: Math.max(t + (step.ticks ?? enemy.intervalTicks), endTick + 1),
        };
        push({ type: "telegraph", text: `${enemy.name}に予兆が見える。` }, t);
      } else {
        absorb(t, enemy.attack, false);
      }
    }
    t++;
    if (s.playerHp <= 0) break;
  }
  s.tick = endTick;

  if (s.playerHp <= 0) {
    s.done = true;
    s.died = true;
    push({ type: "lost", text: "――意識が遠のく。" });
  }
  return s;
}

export function combatResult(s: CombatState): CombatResult {
  return {
    won: s.won,
    fled: s.fled,
    died: s.died,
    damageTaken: s.damageTaken,
    hitsTaken: s.hitsTaken,
    ticks: s.tick,
  };
}

/** 強化版ユニーク（T-44、06 §3B）。balance.combat.unique に対応 */
export interface UniqueConfig {
  /** 強個体が解禁される同種の討伐数 */
  afterKills: number;
  /** HP・攻撃力の強化倍率 */
  hpFactor: number;
  powerFactor: number;
  /** 挑戦差（gain）・敏捷の加算値 */
  challengeBonus: number;
  agilityBonus: number;
}

/**
 * 敵の強化版を作る（再戦）。数値だけを強化し、行動パターンはそのまま。
 * 表示名は呼び出し側がテンプレートで付ける（core は表示名を作らない）
 */
export function enhancedEnemy(def: EnemyDef, u: UniqueConfig): EnemyDef {
  const scale = (m: EnemyMove): EnemyMove => ({
    ...m,
    power: Math.round(m.power * u.powerFactor),
  });
  return {
    ...def,
    hp: Math.round(def.hp * u.hpFactor),
    challenge: def.challenge + u.challengeBonus,
    agility: def.agility + u.agilityBonus,
    attack: scale(def.attack),
    moves: Object.fromEntries(Object.entries(def.moves).map(([k, m]) => [k, scale(m)])),
  };
}

/** 強個体が狩り対象として解禁されているか（同種の討伐数で判定） */
export function canFightUnique(
  state: { counters: Record<string, number> },
  enemyId: string,
  u: UniqueConfig,
): boolean {
  return (state.counters[`kill.species.${enemyId}`] ?? 0) >= u.afterKills;
}

/* ── R-01：個体差 ──────────────────────────────────────────── */

/**
 * 同じ種でも個体で違う（R-01）。「ちょっと強い狼」や「臆病な狼」が
 * 出会いごとに決定的に決まる。ユニーク（afterKills で解禁される固定の
 * 強個体）とは別系統で、こちらは遭遇のたびに揺らぐ。
 */
export interface IndividualConfig {
  /** 強い個体（精悍）の出る確率 */
  strongChance: number;
  /** 臆病な個体の出る確率 */
  timidChance: number;
  /** 強い個体の HP・攻撃威力の倍率と挑戦差・敏捷の加算 */
  strongHpFactor: number;
  strongPowerFactor: number;
  strongChallengeBonus: number;
  strongAgilityBonus: number;
  /** 臆病な個体：威力が下がり行動間隔が伸びる。挑戦差も下がる */
  timidPowerFactor: number;
  timidIntervalFactor: number;
  timidChallengeBonus: number;
  /**
   * 普通の個体にも掛かる小さなジッター（±の半幅）。HP・威力は倍率、
   * 敏捷は加減算の幅。期待値はいずれも元の値
   */
  hpJitter: number;
  powerJitter: number;
  agilityJitter: number;
}

/** 個体の気質（表示用。normal は素の敵） */
export type EnemyTrait = "strong" | "timid" | "normal";

/**
 * 個体差を敵定義に適用する。遭遇のたびに呼び、渡す乱数は
 * 出会い（seed×日×敵種×行動番号）の独立した列にすること。
 * 行動パターンは変えず、数値だけを動かす（enhancedEnemy と同じ方針）
 */
export function rollIndividual(
  def: EnemyDef,
  rng: Rng,
  cfg: IndividualConfig,
): { def: EnemyDef; trait: EnemyTrait } {
  const scaleMoves = (f: number): Record<string, EnemyMove> =>
    Object.fromEntries(
      Object.entries(def.moves).map(([k, m]) => [
        k,
        { ...m, power: Math.max(1, Math.round(m.power * f)) },
      ]),
    );
  const u = rng.next();
  if (u < cfg.strongChance) {
    return {
      trait: "strong",
      def: {
        ...def,
        hp: Math.round(def.hp * cfg.strongHpFactor),
        challenge: def.challenge + cfg.strongChallengeBonus,
        agility: def.agility + cfg.strongAgilityBonus,
        attack: {
          ...def.attack,
          power: Math.max(1, Math.round(def.attack.power * cfg.strongPowerFactor)),
        },
        moves: scaleMoves(cfg.strongPowerFactor),
      },
    };
  }
  if (u > 1 - cfg.timidChance) {
    return {
      trait: "timid",
      def: {
        ...def,
        challenge: def.challenge + cfg.timidChallengeBonus,
        attack: {
          ...def.attack,
          power: Math.max(1, Math.round(def.attack.power * cfg.timidPowerFactor)),
        },
        moves: scaleMoves(cfg.timidPowerFactor),
        intervalTicks: Math.round(def.intervalTicks * cfg.timidIntervalFactor),
      },
    };
  }
  /* 普通の個体にも小さな揺らぎ（対称三角分布で中央寄り、期待値は元の値） */
  const jit = (): number => rng.next() + rng.next() - 1;
  const hpF = 1 + jit() * cfg.hpJitter;
  const pwF = 1 + jit() * cfg.powerJitter;
  const agiD = Math.round(jit() * cfg.agilityJitter);
  return {
    trait: "normal",
    def: {
      ...def,
      hp: Math.max(1, Math.round(def.hp * hpF)),
      agility: Math.max(0, def.agility + agiD),
      attack: { ...def.attack, power: Math.max(1, Math.round(def.attack.power * pwF)) },
      moves: Object.fromEntries(
        Object.entries(def.moves).map(([k, m]) => [
          k,
          { ...m, power: Math.max(1, Math.round(m.power * pwF)) },
        ]),
      ),
    },
  };
}
