import {
  crisisFinaleOffers,
  crisisInvolvement,
  crisisTouchpointOffers,
  playerScore,
  type Command,
  type CrisisTouchpointOffer,
  type GameState,
} from "@trace/core";
import { enemies } from "@trace/content";
import type { Bot, BotCtx } from "./bots.js";

/**
 * 危機シムのボット（docs/08 §8、W-05）。
 * 既存 bots.ts と同じ Bot インターフェース。接点への応え方・決着への関わり方が
 * ボットごとに違う —— 「何もしない」「生き方別（接点は受けない）」「危機に集中」
 * 「片手間」「混ざった生き方」「頂点に向かわない」。
 *
 * 各ボットには計測用のメタ情報（生活の系統）を付け、
 * 「接点がその生き方の分野に届いたか」を runner が判定する
 */

/** 最高スキル値 */
function bestSkill(g: GameState): number {
  return Math.max(0, ...Object.values(g.player.skills).map((s) => s.value));
}

/** 今日提示されている接点（runner が日付ごとに数えるものと同じ一覧） */
function offersToday(g: GameState, ctx: BotCtx): CrisisTouchpointOffer[] {
  return crisisTouchpointOffers(g, ctx.cfg.crisis, ctx.cfg.time);
}

/** 接点を果たすコマンド（注文なら work、狩りなら combat） */
export function touchpointCommand(offer: CrisisTouchpointOffer): Command | null {
  if (offer.vessel === "work" && offer.order !== undefined) {
    return {
      type: "work",
      kind: offer.order.kind,
      quality: offer.order.targetQuality,
      difficulty: offer.order.targetQuality,
      order: offer.order.id,
      rewardMoney: offer.order.rewardMoney,
    };
  }
  if (offer.vessel === "combat" && offer.enemyId !== undefined) {
    const enemy = enemies.enemies.find((e) => e.id === offer.enemyId);
    return {
      type: "combat",
      enemyId: offer.enemyId,
      difficulty: enemy?.challenge ?? 20,
      won: true,
      touchpoint: offer.def.id,
    };
  }
  return null;
}

/**
 * 決着の場面への関わり（打診→参加→勝負所→起こし）。
 * 返すのは「いま出せるコマンド」。join は行動を消費しないので先に返し、
 * 勝負所・起こしは1行動なので接点・日課の前に済ませる。
 * 起こしは勝ち見込みがあるときだけ（自分の備えが required に届く見込み）。
 */
export function finaleCommand(g: GameState, ctx: BotCtx): Command | null {
  const cfg = ctx.cfg.crisis;
  if (cfg?.involvement === undefined) return null;
  const offers = crisisFinaleOffers(g, cfg);
  const stage = crisisInvolvement(g, cfg).stage;

  // 打診に応える（行動を消費しない。最も早い未決着だけ）
  const joinable = offers.find((o) => o.joinable);
  if (joinable !== undefined) return { type: "crisisFinaleJoin", id: joinable.def.id };

  // 請けた場面の勝負所（1行動）。出来は実力に比例させる（0.3〜0.9）
  const attempted = offers.find((o) => o.joined && !o.attempted);
  if (attempted !== undefined) {
    const score = Math.max(0.3, Math.min(0.9, bestSkill(g) / 100));
    return { type: "crisisFinaleAttempt", id: attempted.def.id, score };
  }

  // 自分で起こす（段階4＝英雄）：勝ち見込みのある場面を一点に絞って起こす
  if (stage === 4) {
    const inv = cfg.involvement;
    const hero = g.crisis?.hero;
    if (hero !== undefined) {
      const renown = inv.renown !== undefined ? playerScore(g, inv.renown) : 0;
      for (const o of offers.filter((x) => x.leadable)) {
        // 分野ごとの見込み：その分野に絞ったとき required × leadFocusFactor
        const best = o.def.fields
          .map((f) => {
            const total =
              hero[f] + bestSkill(g) * inv.leadSkillWeight + renown * inv.leadRenownWeight;
            return { field: f, win: total >= o.def.required * inv.leadFocusFactor };
          })
          .find((x) => x.win);
        if (best !== undefined) {
          return { type: "crisisLead", id: o.def.id, field: best.field };
        }
      }
    }
  }
  return null;
}

/** 立場・職業の打診を全部受ける（多くのボットで共通の振る舞い） */
function acceptOffers(g: GameState): Command | null {
  return g.society.pendingOffers.length > 0
    ? { type: "acceptOffer", id: g.society.pendingOffers[0]! }
    : null;
}

/** 仕事の見込み品質（手動プレイの近似：スキルに比例） */
function workQuality(g: GameState, kind: string): number {
  const skill = g.player.skills[kind]?.value ?? 0;
  return Math.min(100, Math.round((20 + skill * 0.9) * 10) / 10);
}

// ---- ボットの振る舞いの部品 ----

/** 危機の終わった世界では、あとは淡々と休む（世界の決着は見届けた） */
function settled(_g: GameState, _ctx: BotCtx): Command {
  return { type: "rest" };
}

/** 接点を全部受ける型の共通処理：今日の提示を順に果たす */
function takeTouchpoints(
  g: GameState,
  ctx: BotCtx,
  filter: (o: CrisisTouchpointOffer) => boolean,
): Command | null {
  for (const o of offersToday(g, ctx)) {
    if (!filter(o)) continue;
    const cmd = touchpointCommand(o);
    if (cmd !== null) return cmd;
  }
  return null;
}

/** 終幕後は rest に倒す。進行中だけ接点・決着のコマンドを返す */
function crisisCommands(
  g: GameState,
  ctx: BotCtx,
  take: (o: CrisisTouchpointOffer) => boolean,
): Command | null {
  if (g.crisis === null || g.crisis.outcome !== "ongoing") return null;
  const fc = finaleCommand(g, ctx);
  if (fc !== null) return fc;
  return takeTouchpoints(g, ctx, take);
}

// ---- 各ボット ----

/** 何もしない型：世界の動きだけを見る（ずっと休む） */
export const crisisIdleBot: Bot = {
  id: "crisis:idle",
  act: () => ({ type: "rest" }),
  endDay: () => ({ type: "rest" }),
};

/**
 * 生き方別のボット（接点は受けない —— 普通に暮らす）。
 * works: 日課にする仕事の系統、combats: 日課にする狩りの敵、
 * reads: 日課にアトムを読むか
 */
function makeLifeBot(id: string, daily: (g: GameState, ctx: BotCtx) => Command | null): Bot {
  return {
    id: `crisis:${id}`,
    act(g, ctx) {
      const offer = acceptOffers(g);
      if (offer !== null) return offer;
      return daily(g, ctx) ?? { type: "wait" };
    },
    endDay: () => ({ type: "sleep", inn: "normal", dinner: true }),
  };
}

/** 仕事型の日課：kinds を日替わりで回して品質は見込み値 */
function dailyWork(...kinds: string[]) {
  let i = 0;
  return (g: GameState, _ctx: BotCtx): Command | null => {
    const kind = kinds[i++ % kinds.length]!;
    const q = workQuality(g, kind);
    return { type: "work", kind, quality: q, difficulty: q };
  };
}

/** 狩り型の日課：enemies を日替わりで狩る（シムでは常勝） */
function dailyCombat(...enemyIds: string[]) {
  let i = 0;
  return (_g: GameState, _ctx: BotCtx): Command | null => {
    const enemyId = enemyIds[i++ % enemyIds.length]!;
    const e = enemies.enemies.find((x) => x.id === enemyId);
    return { type: "combat", enemyId, difficulty: e?.challenge ?? 20, won: true };
  };
}

/** 読む型の日課：未読のアトムを読み、尽きたら仕事 */
function dailyRead(fallback: string) {
  return (g: GameState, ctx: BotCtx): Command | null => {
    const atom = ctx.cfg.lore.atoms.find((a) => !g.lore.read.includes(a.id));
    if (atom !== undefined) return { type: "readAtom", id: atom.id };
    const q = workQuality(g, fallback);
    return { type: "work", kind: fallback, quality: q, difficulty: q };
  };
}

/** 訓練の日課：最適難度（Δ=+10）で主スキルを鍛える */
function dailyTrain(...skills: string[]) {
  let i = 0;
  return (g: GameState, _ctx: BotCtx): Command | null => {
    const skill = skills[i++ % skills.length]!;
    return {
      type: "train",
      skill,
      difficulty: Math.round((g.player.skills[skill]?.value ?? 0) + 10),
    };
  };
}

/** 交互型の日課：2つの日課を1日交代で */
function alternate(a: (g: GameState, ctx: BotCtx) => Command | null, b: typeof a) {
  return (g: GameState, ctx: BotCtx): Command | null => (g.time.day % 2 === 0 ? a : b)(g, ctx);
}

// 生き方別（接点は受けない —— 「接点が届くか」を純粋に計る）
export const smithBot = makeLifeBot("smith", dailyWork("smithing"));
export const tradeBot = makeLifeBot("trade", dailyWork("eloquence"));
export const fightBot = makeLifeBot(
  "fight",
  alternate(dailyCombat("wolf", "stray_dog"), dailyTrain("swordplay")),
);
export const networkBot = makeLifeBot("network", dailyWork("eloquence", "flourish"));
export const scholarBot = makeLifeBot("scholar", dailyRead("appraisal"));

/** 主流でない生き方（釣り＋演奏。接点は受けない） */
export const offbeatBot = makeLifeBot(
  "offbeat",
  alternate(dailyWork("fishing"), dailyWork("performance")),
);

/** 混ざった生き方の日課（鍛冶＋剣） */
const mixedDaily = alternate(dailyWork("smithing"), dailyCombat("stray_dog", "wolf"));

/** 片手間の日課（鍛冶と鑑定を気ままに） */
const dabbleDaily = alternate(dailyWork("smithing"), dailyWork("appraisal"));

/**
 * 危機に集中する型：提示された接点を全部受け、余った行動で主スキルを鍛え、
 * 打診・勝負所・起こしも全部こなす。分野を選ばない —— どの接点も果たせる
 */
export const crisisFocusedBot: Bot = {
  id: "crisis:focused",
  act(g, ctx) {
    const offer = acceptOffers(g);
    if (offer !== null) return offer;
    const cc = crisisCommands(g, ctx, () => true);
    if (cc !== null) return cc;
    if (g.crisis !== null && g.crisis.outcome !== "ongoing") return settled(g, ctx);
    // 余った行動は主スキルの訓練（関与の実力・名声を積む）
    const skill = Object.entries(g.player.skills).reduce((a, b) =>
      a[1].value >= b[1].value ? a : b,
    )[0];
    return { type: "train", skill, difficulty: Math.round(g.player.skills[skill]!.value + 10) };
  },
  endDay: () => ({ type: "sleep", inn: "good", dinner: true }),
};

/**
 * 混ざった生き方の型（鍛冶＋剣）：鍛冶の仕事と狩りを日課にしつつ、
 * 届いた接点は全部受ける。打診・勝負所・起こしもこなす
 */
export const crisisMixedBot: Bot = {
  id: "crisis:mixed",
  act(g, ctx) {
    const offer = acceptOffers(g);
    if (offer !== null) return offer;
    const cc = crisisCommands(g, ctx, () => true);
    if (cc !== null) return cc;
    if (g.crisis !== null && g.crisis.outcome !== "ongoing") return settled(g, ctx);
    return mixedDaily(g, ctx) ?? { type: "wait" };
  },
  endDay: () => ({ type: "sleep", inn: "normal", dinner: true }),
};

/**
 * 頂点に向かわない型：仕事の接点だけを全部受ける（狩りはしない ——
 * 討伐数を積まない）。一つの道を極めないよう、仕事の系統も日替わりで回す。
 * 打診・勝負所・起こしはこなす（頂点なしで段階4に届くかの検証）
 */
export const crisisNoPinnacleBot: Bot = {
  id: "crisis:noPinnacle",
  act(g, ctx) {
    const offer = acceptOffers(g);
    if (offer !== null) return offer;
    // 接点は仕事（work）のものだけ受ける —— 戦いに出ない生き方
    const cc = crisisCommands(g, ctx, (o) => o.vessel === "work");
    if (cc !== null) return cc;
    if (g.crisis !== null && g.crisis.outcome !== "ongoing") return settled(g, ctx);
    return { type: "wait" };
  },
  endDay: () => ({ type: "sleep", inn: "normal", dinner: true }),
};

/**
 * 片手間型：普通に暮らしながら、届いた接点をときどき受けるだけ。
 * 打診には応えない（関わりが浅いまま —— 段階4には「ほぼ届かない」側の実測）
 */
export const crisisDabbleBot: Bot = {
  id: "crisis:dabble",
  act(g, ctx) {
    const offer = acceptOffers(g);
    if (offer !== null) return offer;
    if (g.crisis !== null && g.crisis.outcome === "ongoing") {
      // 接点は 20% くらいの気まぐれで受ける（仕事の接点だけ —— 普段の仕事の延長）
      const tp = offersToday(g, ctx).find((o) => o.vessel === "work");
      if (tp !== undefined && ctx.rng.chance(0.2)) {
        const cmd = touchpointCommand(tp);
        if (cmd !== null) return cmd;
      }
    }
    if (g.crisis !== null && g.crisis.outcome !== "ongoing") return settled(g, ctx);
    return dabbleDaily(g, ctx) ?? { type: "wait" };
  },
  endDay: () => ({ type: "sleep", inn: "normal", dinner: true }),
};

// ---- 計測用メタ情報 ----

/** ボットの生活の系統（「接点がその生き方の分野に届いたか」の判定に使う） */
export interface CrisisBotDomain {
  /** 日課の仕事の系統（work 接点の offer.kind と照合する） */
  workKinds: readonly string[];
  /** 日課に狩りを含めるか（combat 接点をその生き方の分野とみなす） */
  fights: boolean;
}

export const crisisBotDomains: Record<string, CrisisBotDomain> = {
  "crisis:smith": { workKinds: ["smithing"], fights: false },
  "crisis:trade": { workKinds: ["eloquence"], fights: false },
  "crisis:fight": { workKinds: ["swordplay"], fights: true },
  "crisis:network": { workKinds: ["eloquence", "flourish"], fights: false },
  "crisis:scholar": { workKinds: ["appraisal"], fights: false },
  "crisis:offbeat": { workKinds: ["fishing", "performance"], fights: false },
  "crisis:mixed": { workKinds: ["smithing"], fights: true },
  "crisis:noPinnacle": { workKinds: [], fights: false },
};

/** 危機シムで回すボット（指標ごとの主担当） */
export const crisisBots = {
  idle: crisisIdleBot,
  /** 生き方別（接点の届きを測る対象。接点は受けない） */
  lifestyles: [smithBot, tradeBot, fightBot, networkBot, scholarBot, offbeatBot] as const,
  focused: crisisFocusedBot,
  mixed: crisisMixedBot,
  noPinnacle: crisisNoPinnacleBot,
  dabble: crisisDabbleBot,
};
