import { createRng } from "../rng/index.js";
import { STAT_IDS, type GameState, type PlayerState, type SkillState } from "./types.js";
import { SAVE_VERSION } from "../save/index.js";

/** balance.json から必要な初期値だけを受け取る */
export interface NewGameConfig {
  /** content/skills.json のスキルID一覧 */
  skillIds: readonly string[];
  /** スキルの初期素質（出自を省略した場合の一律値） */
  initialPotential: number;
  /** 出自（origins.json）。指定するとスキルごとに potentialBase±ばらつき+affinity で 80〜130 に散らす */
  origin?: {
    id: string;
    potentialBase: number;
    affinity: Record<string, number>;
  };
  /** 出自のばらつき範囲（balance.player.potentialInitMin/Max。origin 指定時に必要） */
  potentialInitMin?: number;
  potentialInitMax?: number;
  /** 基礎能力の初期値 */
  initialStatValue: number;
  /** 初期の立場（省略時は流れ者） */
  initialStanding?: string;
  /** 初期所持金 */
  initialMoney?: number;
}

export function newGame(seed: string, name: string, cfg: NewGameConfig): GameState {
  const skills: PlayerState["skills"] = {};
  const oRng = cfg.origin ? createRng(seed).fork(`origin:${cfg.origin.id}`) : null;
  for (const id of cfg.skillIds) {
    let potential = cfg.initialPotential;
    if (cfg.origin && oRng) {
      const lo = cfg.potentialInitMin ?? 80;
      const hi = cfg.potentialInitMax ?? 130;
      // 出自の基準値に -15〜+15 の個人差を足し、得意分野の affinity を上乗せする
      const scatter = oRng.int(-15, 15);
      potential = Math.min(
        hi,
        Math.max(
          lo,
          Math.round(cfg.origin.potentialBase + scatter + (cfg.origin.affinity[id] ?? 0)),
        ),
      );
    }
    const s: SkillState = {
      value: 0,
      peak: 0,
      pending: 0,
      potential,
      potentialCap: potential,
      lastUsedDay: 0,
    };
    skills[id] = s;
  }
  const stats = Object.fromEntries(
    STAT_IDS.map((id) => [id, cfg.initialStatValue]),
  ) as PlayerState["stats"];
  const load = Object.fromEntries(STAT_IDS.map((id) => [id, 0])) as PlayerState["load"];

  return {
    version: SAVE_VERSION,
    seed,
    rng: createRng(seed).state(),
    time: { day: 0, action: 0 },
    player: {
      name,
      origin: cfg.origin?.id ?? "",
      skills,
      stats,
      load,
      fatigue: 0,
      overwork: { streakDays: 0, active: false },
      money: cfg.initialMoney ?? 0,
    },
    counters: {},
    flags: {},
    actionLog: [],
    today: { winds: [], loads: 0 },
    titles: [],
    ledger: [],
    notify: { day: 0, sToday: false, kehai: [] },
    society: {
      standing: cfg.initialStanding ?? "drifter",
      profession: null,
      pendingOffers: [],
      goal: null,
      achievedGoals: [],
    },
    lore: { read: [], facts: [], connections: [] },
  };
}
