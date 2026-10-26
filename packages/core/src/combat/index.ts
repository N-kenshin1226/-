import { ctxRng, type MiniGameCtx } from "../minigame/types.js";

/**
 * 予兆を読むCT制戦闘（docs/03_world_systems.md §4）。
 *
 * - 時間は tick。プレイヤーの行動は CT（敏捷で変化）だけ時間を進め、
 *   その間に敵の行動予定が来れば敵が動く（速い敵は1行動に2回動く）
 * - 敵の行動は固定ルールのパターン（enemies.json）。大技の前に「予兆」が出る
 * - 予兆の精度は《観察》で上がる：低いと「狼が唸っている」、高いと技名＋残りtick
 * - 「観察」行動は1ターン使う代わりに予兆の精度を底上げする
 * - 「防御」は次の自分の行動まで受けるダメージを軽減する（予兆読みへの対応）
 *
 * 戦闘はここに閉じ、結果は step の combat コマンドで GameState に反映する。
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
  /** 逃走の抵抗に使う敏捷相当値 */
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
  /** 防御中に受けるダメージの倍率 */
  defendFactor: number;
  /** 逃走成功率 = base + (敏捷 − 敵敏捷) × perAgility（0〜1 にクランプ） */
  fleeBase: number;
  fleePerAgility: number;
  /** 「観察」行動で予兆精度に乗るボーナス */
  observeBonus: number;
  /** 予兆が精密になる観察の閾値（これ未満は曖昧表示） */
  preciseObserve: number;
  /** 死亡時に失う未定着経験の割合（03 §4「50%」） */
  deathPendingFactor: number;
  /** 強化版ユニーク（T-44）。省略時は強個体なし */
  unique?: UniqueConfig;
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
    | "playerDefend"
    | "playerObserve"
    | "playerFlee"
    | "enemyHit"
    | "telegraph"
    | "fled"
    | "won"
    | "lost";
  text: string;
  damage?: number;
}

export interface CombatState {
  tick: number;
  playerHp: number;
  playerHpMax: number;
  enemyHp: number;
  enemyIdx: number;
  /** 次に敵のパターンが進む tick */
  enemyNextAt: number;
  telegraph: Telegraph | null;
  /** 防御姿勢が有効な上限 tick（この tick までに受けるダメージを軽減） */
  defendUntil: number;
  /** 観察行動を使ったか（予兆の精度を底上げ） */
  observed: boolean;
  fleeAttempts: number;
  done: boolean;
  won: boolean;
  fled: boolean;
  died: boolean;
  damageTaken: number;
  hitsTaken: number;
  /** プレイヤーの導出値（startCombat で確定） */
  playerAttack: number;
  playerCt: number;
  playerObserve: number;
  playerAgility: number;
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

/**
 * プレイヤー側の戦闘数値（stats + スキルから導出）。
 * attackFactor は称号などの与ダメージ倍率（effects の damageVs。既定1）
 */
export function playerCombatStats(
  player: { stats: Record<string, number>; skills: Record<string, { value: number }> },
  cfg: CombatConfig,
  attackFactor = 1,
): { hp: number; attack: number; ct: number; agility: number; observe: number } {
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
    playerHp: p.hp,
    playerHpMax: p.hp,
    enemyHp: enemy.hp,
    enemyIdx: 0,
    enemyNextAt: Math.max(1, Math.round(enemy.intervalTicks / 2)),
    telegraph: null,
    defendUntil: -1,
    observed: false,
    fleeAttempts: 0,
    done: false,
    won: false,
    fled: false,
    died: false,
    damageTaken: 0,
    hitsTaken: 0,
    playerAttack: p.attack,
    playerCt: p.ct,
    playerObserve: p.observe,
    playerAgility: p.agility,
    log: [],
  };
}

/** 予兆の3行表示（精度は観察＋観察行動ボーナスで決まる） */
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
      "\u3000\u3000防御でやり過ごせる",
    ];
  }
  return [`――${enemy.name}が唸っている。`, "\u3000\u3000何かを仕掛けてくる気配がする", ""];
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
  const s: CombatState = { ...state, log: [...state.log] };
  const push = (e: Omit<CombatEvent, "tick">, tick = s.tick) => s.log.push({ ...e, tick });

  // 1. プレイヤー行動
  const endTick = s.tick + s.playerCt;
  switch (action) {
    case "attack": {
      s.enemyHp -= s.playerAttack;
      push({
        type: "playerAttack",
        text: `攻撃――${enemy.name}に ${s.playerAttack} の一撃。`,
        damage: s.playerAttack,
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
      push({ type: "playerObserve", text: "敵の動きを観察した。" });
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
  const absorb = (tick: number, move: EnemyMove) => {
    const dmg =
      tick <= s.defendUntil ? Math.max(1, Math.round(move.power * cfg.defendFactor)) : move.power;
    s.playerHp -= dmg;
    s.damageTaken += dmg;
    s.hitsTaken++;
    push(
      { type: "enemyHit", text: `${enemy.name}の《${move.name}》――${dmg} の傷。`, damage: dmg },
      tick,
    );
  };

  let t = s.tick;
  while (t < endTick && s.enemyHp > 0) {
    // 予兆の発動
    if (s.telegraph && s.telegraph.dueTick <= t) {
      const mv = enemy.moves[s.telegraph.move];
      s.telegraph = null;
      if (mv) absorb(t, mv);
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
          dueTick: t + (step.ticks ?? enemy.intervalTicks),
        };
        push({ type: "telegraph", text: `${enemy.name}に予兆が見える。` }, t);
      } else {
        absorb(t, enemy.attack);
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
