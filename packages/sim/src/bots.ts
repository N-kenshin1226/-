import {
  activeEffects,
  computeGain,
  gainModifier,
  isSkillUnlocked,
  recentRepeats,
  windFor,
  type Command,
  type Cond,
  type GameState,
  type Rng,
  type StepConfig,
} from "@trace/core";

/**
 * ボットの行動方針（docs/02 §10）。方針が違う4種＋称号到達用の seeker。
 * act は「次の1行動」、endDay は眠り方。act が sleep/rest を返してもよい
 * （その時点で1日が終わる）。
 */
export interface BotCtx {
  cfg: StepConfig;
  rng: Rng;
  /** 行動に使えるスキルID一覧（content の skills.json 由来） */
  skillIds: readonly string[];
}

export interface Bot {
  id: string;
  act(g: GameState, ctx: BotCtx): Command;
  endDay(g: GameState, ctx: BotCtx): Command;
}

/** step() と同じ計算で train の予想 gain を見る（最適化型ボットが使う） */
export function expectedTrainGain(
  g: GameState,
  skill: string,
  difficulty: number,
  cfg: StepConfig,
): number {
  const s = g.player.skills[skill];
  if (!s) return 0;
  const repeats = recentRepeats(
    g.actionLog,
    "train",
    skill,
    cfg.gain.noveltyWindow,
    String(difficulty),
  );
  return computeGain(
    {
      kind: "train",
      skill: s.value,
      delta: difficulty - s.value,
      repeats,
      potential: s.potential,
      fatigue: g.player.fatigue,
      wind: windFor(g, "train", skill),
      modifiers: gainModifier(
        activeEffects(g, cfg.titles, cfg.society.professions, cfg.mentors?.mentors),
        "train",
        skill,
      ),
      isTraining: true,
    },
    cfg.gain,
  ).amount;
}

/** 挑戦係数が最大になる難度（Δ=+10） */
function bestDifficulty(g: GameState, skill: string): number {
  return Math.round(g.player.skills[skill]!.value + 10);
}

/**
 * 解放済みスキルだけに絞る。派生スキル（iaijutsu 等）は flags が立つまで
 * step 側で訓練が拒否されるため、ボットも候補から外す
 */
function unlockedSkills(g: GameState, ctx: BotCtx): string[] {
  const locked = new Set(
    (ctx.cfg.skillUnlocks ?? []).filter((u) => !isSkillUnlocked(g, u)).map((u) => u.id),
  );
  const ok = ctx.skillIds.filter((id) => !locked.has(id));
  return ok.length > 0 ? ok : [...ctx.skillIds];
}

/** 今日すでに行動した回数 */
function actionsToday(g: GameState): number {
  return g.actionLog.filter((e) => e.day === g.time.day).length;
}

/** 過負荷になりそうか（残り行動を全部訓練に使うと閾値を超える場合は true） */
function willOverload(g: GameState, ctx: BotCtx, extraTrains: number): boolean {
  const perTrain = Object.values(ctx.cfg.body.statLoadPerAction["train"] ?? {}).reduce(
    (a, b) => a + (b ?? 0),
    0,
  );
  return g.today.loads + perTrain * extraTrains > ctx.cfg.body.overloadThreshold;
}

/**
 * 単一ルーチン型：主スキルを1本に絞り、最適難度（Δ=+10）の訓練を繰り返す。
 * 「その時点で gain 最大の行動」= 自分の主スキルの最適難度訓練、という
 * プレイヤーの固定ルーチンを再現する。追い風が主スキルを指すときだけ
 * 追い風を利用し、それ以外のスキルには散らない。
 */
export const singleBot: Bot = {
  id: "single",
  act(g, ctx) {
    if (g.player.overwork.active || g.player.overwork.streakDays >= 2) {
      return { type: "rest" };
    }
    // 1日の残りを全部訓練に使うと過負荷になるなら、今日は早めに寝る
    if (actionsToday(g) >= 4 && willOverload(g, ctx, 1)) {
      return { type: "sleep", inn: "good", dinner: true };
    }
    // 主スキル = いま一番高い解放済みスキル（序盤は先頭）。難度は Δ=+10
    const skill = unlockedSkills(g, ctx).reduce((a, b) =>
      g.player.skills[a]!.value >= g.player.skills[b]!.value ? a : b,
    );
    return { type: "train", skill, difficulty: bestDifficulty(g, skill) };
  },
  endDay: () => ({ type: "sleep", inn: "good", dinner: true }),
};

/** 多様型：今日の追い風に合うものを優先しつつ、いちばん久しく使っていないスキル */
export const diverseBot: Bot = {
  id: "diverse",
  act(g, ctx) {
    if (g.player.overwork.active || g.player.overwork.streakDays >= 2) {
      return { type: "rest" };
    }
    if (actionsToday(g) >= 3 && willOverload(g, ctx, 1)) {
      return { type: "sleep", inn: "normal", dinner: true };
    }
    // 追い風の対象を優先し、なければ最も久しいスキル（どちらも解放済みに限る）
    const unlocked = unlockedSkills(g, ctx);
    const windy = g.today.winds
      .filter((w) => w.direction === "tailwind" && w.target.kind === "skill")
      .map((w) => w.target.id)
      .filter((id) => unlocked.includes(id));
    const pool = windy.length > 0 ? windy : unlocked;
    const skill = pool.reduce((a, b) =>
      g.player.skills[a]!.lastUsedDay <= g.player.skills[b]!.lastUsedDay ? a : b,
    );
    return { type: "train", skill, difficulty: bestDifficulty(g, skill) };
  },
  endDay: () => ({ type: "sleep", inn: "normal", dinner: true }),
};

/** ランダム型：スキルと難度を一様に選ぶ。たまに待つ */
export const randomBot: Bot = {
  id: "random",
  act(g, ctx) {
    if (ctx.rng.chance(0.15)) return { type: "wait" };
    const skill = ctx.rng.pick(unlockedSkills(g, ctx));
    const difficulty = ctx.rng.int(1, 50);
    return { type: "train", skill, difficulty };
  },
  endDay: (_g, ctx) => ({
    type: "sleep",
    inn: ctx.rng.pick(["cheap", "normal", "good"] as const),
    dinner: ctx.rng.chance(0.5),
  }),
};

/** 簡易判定のみ型（M0 代用）：ミニゲームが無いので「楽な訓練だけ」を繰り返す */
export const simpleBot: Bot = {
  id: "simple",
  act(g, ctx) {
    const skill = unlockedSkills(g, ctx)[0]!;
    const difficulty = Math.max(1, Math.floor(g.player.skills[skill]!.value));
    return { type: "train", skill, difficulty };
  },
  endDay: () => ({ type: "sleep", inn: "cheap", dinner: false }),
};

export const metricBots: readonly Bot[] = [singleBot, diverseBot, randomBot, simpleBot];

/**
 * 称号到達用の seeker（指標の対象外）：未獲得の称号の条件から
 * 必要なスキルを拾い、最も届いていないスキルを訓練する。
 */
function requiredSkills(cond: Cond): { id: string; min: number }[] {
  if ("skill" in cond) return cond.gte !== undefined ? [{ id: cond.skill, min: cond.gte }] : [];
  if ("and" in cond) return cond.and.flatMap(requiredSkills);
  if ("or" in cond) return requiredSkills(cond.or[0]!); // 最初の枝に賭ける
  if ("not" in cond || "within" in cond) return [];
  if ("counter" in cond || "flag" in cond || "stat" in cond || "time" in cond || "work" in cond)
    return [];
  return [];
}

export function makeSeekerBot(titles: readonly { id: string; condition: Cond }[]): Bot {
  return {
    id: "seeker",
    act(g, ctx) {
      if (g.player.overwork.active || g.player.overwork.streakDays >= 2) {
        return { type: "rest" };
      }
      if (actionsToday(g) >= 4 && willOverload(g, ctx, 1)) {
        return { type: "sleep", inn: "good", dinner: true };
      }
      // 未獲得称号の条件から必要スキルを集め、最も足りないものを伸ばす（解放済みに限る）
      const unlocked = unlockedSkills(g, ctx);
      const needs: { id: string; min: number }[] = [];
      for (const t of titles) {
        if (g.titles.includes(t.id)) continue;
        needs.push(...requiredSkills(t.condition).filter((r) => unlocked.includes(r.id)));
      }
      const target =
        needs.length > 0
          ? needs.reduce((a, b) =>
              g.player.skills[a.id]!.value / a.min <= g.player.skills[b.id]!.value / b.min ? a : b,
            )
          : { id: unlocked[0]!, min: 100 };
      const skill = g.player.skills[target.id] ? target.id : unlocked[0]!;
      return { type: "train", skill, difficulty: bestDifficulty(g, skill) };
    },
    endDay: () => ({ type: "sleep", inn: "good", dinner: true }),
  };
}
