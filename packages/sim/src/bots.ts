import {
  activeEffects,
  computeGain,
  crisisRoadClosed,
  describe as describeTime,
  evaluate,
  gainModifier,
  isSkillUnlocked,
  journeyCost,
  journeyIdOf,
  journeying,
  mapVisited,
  nextStage,
  recentRepeats,
  roadKindOf,
  roadSeasonClosed,
  townOf,
  windFor,
  type Command,
  type Cond,
  type GameState,
  type LifeConfig,
  type PinnacleRouteDef,
  type Rng,
  type StatId,
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

/* ── 地方の旅（G-02、docs/10 §7） ──
 * 生き方ごとの方針に「旅欲」を混ぜる包み。旅の途中は街道を1度歩いてから
 * 野営する（道中の出来事・遭遇が起きる）。町では、たまに未踏の隣町へ
 * 旅立つか、まだ行っていないその町の地域へ出る。
 * 閉ざされた道（季節・危機）と関所料金の払えない道は選ばない */
export function withTravel(
  base: Bot,
  opts?: {
    /** 空き行動のうち旅立ちを考える確率（既定 0.3） */
    chance?: number;
    /** この町の外の未踏地域へ出る確率（既定 0.15） */
    regionChance?: number;
    /** 地域の場所 id 一覧（世界の地域。町の外へ出る候補） */
    regions?: readonly string[];
  },
): Bot {
  const chance = opts?.chance ?? 0.3;
  const regionChance = opts?.regionChance ?? 0.15;
  const regions = opts?.regions ?? [];

  /** この町から徒歩で通れる道（季節・危機の閉鎖と払えない関所を外す） */
  const openRoads = (g: GameState, ctx: BotCtx, life: LifeConfig) => {
    const town = townOf(g);
    const season = describeTime(g.time, ctx.cfg.time).season;
    return life.journeys.filter(
      (j) =>
        (j.from === town || j.to === town) &&
        !roadSeasonClosed(j, season) &&
        !crisisRoadClosed(g, ctx.cfg.crisis, { id: journeyIdOf(j), kind: roadKindOf(j) }) &&
        journeyCost(j, "foot", life) <= g.player.money,
    );
  };

  return {
    id: `${base.id}+travel`,
    act(g, ctx) {
      const life = ctx.cfg.life;
      if (life === undefined) return base.act(g, ctx);
      // 旅の途中：街道を1度歩いてから野営（道中の出来事・遭遇が起きる）
      if (journeying(g)) {
        const strolled = g.actionLog.some((e) => e.day === g.time.day && e.kind === "stroll");
        if (!strolled && g.time.action < ctx.cfg.time.actionsPerDay) {
          return { type: "stroll" };
        }
        return { type: "rest" };
      }
      const town = townOf(g);
      // この町の外の未踏地域へ出る（地域の訪れた刻印は地図の濃い印になる）
      const unvisitedRegions = regions.filter(
        (id) => life.places?.[id]?.town === town && !mapVisited(g, id),
      );
      if (
        unvisitedRegions.length > 0 &&
        g.time.action + Math.max(1, Math.round(ctx.cfg.travel?.outsideCost ?? 1)) <=
          ctx.cfg.time.actionsPerDay &&
        ctx.rng.chance(regionChance)
      ) {
        return { type: "travel", to: ctx.rng.pick(unvisitedRegions) };
      }
      // 旅立ち：未踏の隣町を優先に、たまに足を延ばす
      if (ctx.rng.chance(chance)) {
        const others = openRoads(g, ctx, life).map((j) => (j.from === town ? j.to : j.from));
        const unvisited = others.filter((o) => !mapVisited(g, o));
        const pool = unvisited.length > 0 ? unvisited : others;
        if (pool.length > 0) return { type: "journey", to: ctx.rng.pick(pool) };
      }
      return base.act(g, ctx);
    },
    endDay(g, ctx) {
      // 旅の途中は野営で日が進む（町の眠り方は持ち帰らない）
      return journeying(g) ? { type: "rest" } : base.endDay(g, ctx);
    },
  };
}

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

// ---- 頂点ルート（T-41）：条件鎖から「次に必要なもの」を拾うボット ----

/** 条件木から kill.species.<敵> カウンタ条件を拾う（and/or を潜る。or は最初の枝に賭ける） */
function requiredKills(cond: Cond): { id: string; n: number }[] {
  if ("counter" in cond && cond.counter.startsWith("kill.species.")) {
    return [{ id: cond.counter.slice("kill.species.".length), n: cond.gte ?? cond.eq ?? 1 }];
  }
  if ("and" in cond) return cond.and.flatMap(requiredKills);
  if ("or" in cond) return requiredKills(cond.or[0]!);
  return [];
}

/** 条件木から society.offer.<id> カウンタ条件を拾う（認定の受諾が必要な段） */
function requiredOffers(cond: Cond): string[] {
  if ("counter" in cond && cond.counter.startsWith("society.offer.")) {
    return [cond.counter.slice("society.offer.".length)];
  }
  if ("and" in cond) return cond.and.flatMap(requiredOffers);
  if ("or" in cond) return requiredOffers(cond.or[0]!);
  return [];
}

/** 条件木から work 条件を拾う */
function requiredWorks(cond: Cond): Extract<Cond, { work: unknown }>["work"][] {
  if ("work" in cond) return [cond.work];
  if ("and" in cond) return cond.and.flatMap(requiredWorks);
  if ("or" in cond) return requiredWorks(cond.or[0]!);
  return [];
}

/** 条件木から within 条件を拾う */
function requiredWithin(cond: Cond): Extract<Cond, { within: unknown }>["within"][] {
  if ("within" in cond) return [cond.within];
  if ("and" in cond) return cond.and.flatMap(requiredWithin);
  if ("or" in cond) return requiredWithin(cond.or[0]!);
  return [];
}

/** 条件木から town.donated カウンタの必要額を拾う（複数ある場合は最大値。X-9 領主ルート） */
function requiredDonation(cond: Cond): number | null {
  if ("counter" in cond && cond.counter === "town.donated") {
    return cond.gte ?? cond.eq ?? null;
  }
  if ("and" in cond) {
    const ns = cond.and.map(requiredDonation).filter((n): n is number => n !== null);
    return ns.length > 0 ? Math.max(...ns) : null;
  }
  if ("or" in cond) return requiredDonation(cond.or[0]!);
  return null;
}

/** 条件木から所持金条件（money）の必要額を拾う（複数ある場合は最大値。X-9 商王ルート） */
function requiredMoney(cond: Cond): number | null {
  if ("money" in cond) return cond.money.gte ?? cond.money.eq ?? null;
  if ("and" in cond) {
    const ns = cond.and.map(requiredMoney).filter((n): n is number => n !== null);
    return ns.length > 0 ? Math.max(...ns) : null;
  }
  if ("or" in cond) return requiredMoney(cond.or[0]!);
  return null;
}

/** 条件木から money.earned カウンタの必要額を拾う（生涯売上。X-9 商王ルート） */
function requiredEarnings(cond: Cond): number | null {
  if ("counter" in cond && cond.counter === "money.earned") {
    return cond.gte ?? cond.eq ?? null;
  }
  if ("and" in cond) {
    const ns = cond.and.map(requiredEarnings).filter((n): n is number => n !== null);
    return ns.length > 0 ? Math.max(...ns) : null;
  }
  if ("or" in cond) return requiredEarnings(cond.or[0]!);
  return null;
}

/** 条件木から stat 条件を拾う */
function requiredStats(cond: Cond): { id: StatId; min: number }[] {
  if ("stat" in cond) return cond.gte !== undefined ? [{ id: cond.stat, min: cond.gte }] : [];
  if ("and" in cond) return cond.and.flatMap(requiredStats);
  if ("or" in cond) return requiredStats(cond.or[0]!);
  return [];
}

/** 条件木から「立てる側」の flag 条件を拾う（and/or を潜る。eq:false は立てない条件なので除外） */
function requiredFlags(cond: Cond): string[] {
  if ("flag" in cond) return cond.eq === false ? [] : [cond.flag];
  if ("and" in cond) return cond.and.flatMap(requiredFlags);
  if ("or" in cond) return requiredFlags(cond.or[0]!);
  return [];
}

/** 条件木から action.read カウンタの必要回数を拾う（複数ある場合は最大値） */
function requiredReadCount(cond: Cond): number | null {
  if ("counter" in cond && cond.counter === "action.read") {
    return cond.gte ?? cond.eq ?? null;
  }
  if ("and" in cond) {
    const ns = cond.and
      .map(requiredReadCount)
      .filter((n): n is number => n !== null && n !== undefined);
    return ns.length > 0 ? Math.max(...ns) : null;
  }
  if ("or" in cond) return requiredReadCount(cond.or[0]!);
  return null;
}

/**
 * 訓練対象にできるスキル。目標が未解放の派生スキルなら、解放条件の不足分
 * （素スキル）に落とす。stat 条件しか残らない場合は手が出せないので null
 */
function trainableTarget(g: GameState, skillId: string, ctx: BotCtx): string | null {
  const unlock = (ctx.cfg.skillUnlocks ?? []).find((u) => u.id === skillId);
  if (!unlock || isSkillUnlocked(g, unlock)) return skillId;
  const needs = requiredSkills(unlock.condition!).filter(
    (r) => (g.player.skills[r.id]?.value ?? 0) < r.min,
  );
  if (needs.length === 0) return null;
  return needs.reduce((a, b) =>
    g.player.skills[a.id]!.value / a.min <= g.player.skills[b.id]!.value / b.min ? a : b,
  ).id;
}

/** 仕事の見込み品質（手動プレイの近似：スキルに比例。台帳ティアはこれで積む） */
function workQualityEstimate(g: GameState, kind: string): number {
  const skill = g.player.skills[kind]?.value ?? 0;
  return Math.min(100, Math.round((20 + skill * 0.9) * 10) / 10);
}

/**
 * 稼ぐ仕事の種目（X-9）：市場の反復減衰が最も浅い＝見込み報酬が最も高い種目を選ぶ。
 * 同じ種目を詰め込むと相場が逓減して稼げなくなるため、種目を回す。
 * K-01：技能が増えて全技能に散らすと一つも育たない（品質もティアも伸びず
 * 認定職の打診にも届かない）ため、台帳に載せた実績種目が3種以上あれば
 * その中で回す —— 手動プレイの「得意な仕事を軸に回す」動きに近い
 */
function bestWorkKind(g: GameState, ctx: BotCtx): string {
  const est = (kind: string): number => {
    const recent = g.ledger.filter(
      (w) => w.kind === kind && w.day >= g.time.day - ctx.cfg.ledger.marketWindowDays + 1,
    ).length;
    return (
      workQualityEstimate(g, kind) *
      ctx.cfg.ledger.basePricePerQuality *
      Math.pow(ctx.cfg.ledger.marketDecayPerWork, recent)
    );
  };
  const unlocked = unlockedSkills(g, ctx);
  const practiced = [...new Set(g.ledger.map((w) => w.kind))].filter((k) => unlocked.includes(k));
  const pool = practiced.length >= 3 ? practiced : unlocked;
  return pool.reduce((a, b) => (est(a) >= est(b) ? a : b));
}

/** 書物代・寄付金を稼ぐための仕事（相場のいい種目で） */
function earnMoneyForBook(g: GameState, ctx: BotCtx): Command {
  const kind = bestWorkKind(g, ctx);
  return {
    type: "work",
    kind,
    quality: workQualityEstimate(g, kind),
    difficulty: workQualityEstimate(g, kind),
  };
}

/**
 * 読む系の条件（知識フラグ・読了数）を進める次の一手（X-4 大賢者ルート対応）。
 * 解決は安い順：アトム（行動のみ）→ つながり用のアトム → 所持書物 → 購入。
 * 書物代が足りなければ仕事で稼ぐ。出所の分からない旗には手を出さない。
 */
function planReading(g: GameState, ctx: BotCtx, cond: Cond): Command | null {
  const books = ctx.cfg.books?.books ?? [];
  const readBooks = new Set(g.books.read.map((r) => r.id));

  for (const flag of requiredFlags(cond)) {
    if (g.flags[flag] === true) continue;
    // アトムの unlock フラグ（読むだけで立つ）
    const atom = ctx.cfg.lore.atoms.find(
      (a) => a.unlock?.flag === flag && !g.lore.read.includes(a.id),
    );
    if (atom !== undefined) return { type: "readAtom", id: atom.id };
    // つながりの報酬フラグ：不足している事実を明かす未読アトムを順に読む
    const conn = ctx.cfg.lore.connections.find(
      (c) => c.flag === flag && !g.lore.connections.includes(c.eventId),
    );
    if (conn !== undefined) {
      const known = new Set(g.lore.facts);
      const missing = conn.facts.filter((f) => !known.has(f));
      const next = ctx.cfg.lore.atoms.find(
        (a) => !g.lore.read.includes(a.id) && a.reveals.some((f) => missing.includes(f)),
      );
      if (next !== undefined) return { type: "readAtom", id: next.id };
      continue;
    }
    // 書物の知識フラグ：買って読む。金が足りなければ稼ぐ
    const book = books.find((b) => b.flag === flag);
    if (book !== undefined) {
      if (readBooks.has(book.id)) continue; // 読了済みなら旗は立っているはず（立っていなければ進めない）
      if (g.books.owned.includes(book.id)) return { type: "readBook", id: book.id };
      if (g.player.money >= book.price) return { type: "buyBook", id: book.id };
      return earnMoneyForBook(g, ctx);
    }
  }

  // action.read カウンタ：アトム → 所持書物 → 買える書物 の順
  const reads = requiredReadCount(cond);
  if (reads !== null && (g.counters["action.read"] ?? 0) < reads) {
    const atom = ctx.cfg.lore.atoms.find((a) => !g.lore.read.includes(a.id));
    if (atom !== undefined) return { type: "readAtom", id: atom.id };
    const owned = books.find((b) => g.books.owned.includes(b.id) && !readBooks.has(b.id));
    if (owned !== undefined) return { type: "readBook", id: owned.id };
    const unread = books.filter((b) => !readBooks.has(b.id));
    const affordable = unread
      .filter((b) => b.price <= g.player.money)
      .sort((a, b) => a.price - b.price)[0];
    if (affordable !== undefined) return { type: "buyBook", id: affordable.id };
    if (unread.length > 0) return earnMoneyForBook(g, ctx);
  }
  return null;
}

/**
 * 頂点ルート到達シム用のボット（T-41。sim:growth の「到達までの日数」目安）。
 * ルートの次の未達成段を見て、撃破 → 連戦 → 台帳 → 認定受諾 → スキル → 基礎能力
 * の順に必要な行動を返す。戦闘は常勝・仕事は見込み品質で近似した楽観値。
 */
export function makePinnacleBot(
  route: PinnacleRouteDef,
  enemies: readonly { id: string; challenge: number }[],
): Bot {
  const weakest = enemies.reduce(
    (a, b) => (a.challenge <= b.challenge ? a : b),
    enemies[0] ?? { id: "wolf", challenge: 15 },
  );
  return {
    id: `pinnacle:${route.id}`,
    act(g, ctx) {
      if (g.player.overwork.active || g.player.overwork.streakDays >= 2) {
        return { type: "rest" };
      }
      if (actionsToday(g) >= 4 && willOverload(g, ctx, 1)) {
        return { type: "sleep", inn: "good", dinner: true };
      }
      // 認定の打診が溜まっていれば受ける（受諾は行動を消費しない）
      if (g.society.pendingOffers.length > 0) {
        return { type: "acceptOffer", id: g.society.pendingOffers[0]! };
      }

      // 隠しルートの発見（X-9）：発見フラグが立つまで段は評価されない。
      // 旗の出所（噂アトム→つながり→書物の順）の解決は読む系と同じ planReading に委ねる
      if (route.hidden !== undefined && g.flags[route.hidden.flag] !== true) {
        const readCmd = planReading(g, ctx, { flag: route.hidden.flag });
        return readCmd ?? { type: "wait" };
      }

      const stage = nextStage(g, route);
      if (stage === null) return { type: "rest" }; // 完走済み
      const cond = stage.condition;

      // 撃破条件：未達の敵へ出る（シムでは常勝とみなす）
      const kill = requiredKills(cond).find((k) => (g.counters[`kill.species.${k.id}`] ?? 0) < k.n);
      if (kill) {
        const e = enemies.find((x) => x.id === kill.id);
        return { type: "combat", enemyId: kill.id, difficulty: e?.challenge ?? 20, won: true };
      }

      // 連戦（within combat）条件：未達なら最弱の敵へ詰め込む
      const streak = requiredWithin(cond).find(
        (w) => w.kind === "combat" && !evaluate({ within: w }, g, ctx.cfg.time),
      );
      if (streak) {
        return {
          type: "combat",
          enemyId: streak.target ?? weakest.id,
          difficulty: weakest.challenge,
          won: true,
        };
      }

      // 連日の仕事（within work）条件：未達なら相場のいい種目で働く（X-9 商王ルート）
      const workStreak = requiredWithin(cond).find(
        (w) => w.kind === "work" && !evaluate({ within: w }, g, ctx.cfg.time),
      );
      if (workStreak) {
        return earnMoneyForBook(g, ctx);
      }

      // 台帳条件：未達の kind で仕事（品質は見込み値。kind 指定が無ければ相場のいい種目）
      const work = requiredWorks(cond).find((w) => !evaluate({ work: w }, g, ctx.cfg.time));
      if (work) {
        const kind = work.kind ?? bestWorkKind(g, ctx);
        return {
          type: "work",
          kind,
          quality: workQualityEstimate(g, kind),
          difficulty: workQualityEstimate(g, kind),
        };
      }

      // 生涯売上条件（X-9 商王ルート）：足りなければ相場のいい種目で稼ぐ
      const earnings = requiredEarnings(cond);
      if (earnings !== null && (g.counters["money.earned"] ?? 0) < earnings) {
        return earnMoneyForBook(g, ctx);
      }

      // 寄付条件（X-9 領主ルート）：納められるなら寄付、金が足りなければ稼ぐ
      const donation = requiredDonation(cond);
      if (donation !== null && (g.counters["town.donated"] ?? 0) < donation) {
        if (ctx.cfg.donation !== undefined && g.player.money >= ctx.cfg.donation.amount) {
          return { type: "donate" };
        }
        return earnMoneyForBook(g, ctx);
      }

      // 所持金条件（X-9 商王ルート）：足りなければ仕事で稼ぐ
      const money = requiredMoney(cond);
      if (money !== null && g.player.money < money) {
        return earnMoneyForBook(g, ctx);
      }

      // 認定（society.offer）条件：打診待ちでなければ、あとは条件を満たす方向へ進むだけ
      // （打診は次の step で届く。その間は訓練を続ける）
      const offer = requiredOffers(cond).find((o) => (g.counters[`society.offer.${o}`] ?? 0) < 1);
      if (offer !== undefined && g.society.pendingOffers.includes(offer)) {
        return { type: "acceptOffer", id: offer };
      }
      // 未着の職業認定：条件の作業種目へ集中して打診を引き出す（K-01）。
      // 技能が増えて相場ローテーションでは同一種目の tier が上がらなくなったため、
      // 段が要求する認定職の種目を繰り返して tierGte を満たす
      if (offer !== undefined) {
        const prof = ctx.cfg.society.professions.find((p) => p.id === offer);
        const wk =
          prof === undefined
            ? undefined
            : requiredWorks(prof.condition).find((w) => !evaluate({ work: w }, g, ctx.cfg.time));
        if (wk?.kind !== undefined) {
          const kind = wk.kind;
          return {
            type: "work",
            kind,
            quality: workQualityEstimate(g, kind),
            difficulty: workQualityEstimate(g, kind),
          };
        }
      }

      // 読む系の条件（知識フラグ・読了数）：アトムや書物を読み、足りなければ稼ぐ
      const readCmd = planReading(g, ctx, cond);
      if (readCmd !== null) return readCmd;

      // スキル条件：最も足りないものを鍛える（未解放なら解放条件の側へ落とす）
      const skillNeed = requiredSkills(cond)
        .filter((r) => (g.player.skills[r.id]?.value ?? 0) < r.min)
        .reduce<{ id: string; min: number } | null>(
          (a, b) =>
            a === null ||
            g.player.skills[a.id]!.value / a.min > g.player.skills[b.id]!.value / b.min
              ? b
              : a,
          null,
        );
      if (skillNeed) {
        const target = trainableTarget(g, skillNeed.id, ctx) ?? unlockedSkills(g, ctx)[0]!;
        return { type: "train", skill: target, difficulty: bestDifficulty(g, target) };
      }

      // 基礎能力条件：負荷を積むため訓練を続ける（伸びは睡眠の定着任せ）
      const statNeed = requiredStats(cond).find((r) => g.player.stats[r.id] < r.min);
      if (statNeed) {
        const skill = unlockedSkills(g, ctx)[0]!;
        return { type: "train", skill, difficulty: bestDifficulty(g, skill) };
      }

      // 条件が残るが専用の手は無い（time・称号数など）→ 待つより鍛える方が前進になる
      // （名声系カウンタや日数条件は、働き・鍛錬・睡眠の蓄積で勝手に進む）
      const busy = unlockedSkills(g, ctx).reduce((a, b) =>
        g.player.skills[a]!.value >= g.player.skills[b]!.value ? a : b,
      );
      return { type: "train", skill: busy, difficulty: bestDifficulty(g, busy) };
    },
    endDay: () => ({ type: "sleep", inn: "good", dinner: true }),
  };
}
