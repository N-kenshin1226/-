import { createRng } from "../rng/index.js";
import { STAT_IDS, type GameState, type PlayerState, type SkillState } from "./types.js";
import { SAVE_VERSION } from "../save/index.js";

/** balance.json から必要な初期値だけを受け取る */
export interface NewGameConfig {
  /** content/skills.json のスキルID一覧 */
  skillIds: readonly string[];
  /** スキルの初期素質（M2 で出自による幅 80〜130 を実装するまでは一律） */
  initialPotential: number;
  /** 基礎能力の初期値 */
  initialStatValue: number;
}

export function newGame(seed: string, name: string, cfg: NewGameConfig): GameState {
  const skills: PlayerState["skills"] = {};
  for (const id of cfg.skillIds) {
    const s: SkillState = {
      value: 0,
      peak: 0,
      pending: 0,
      potential: cfg.initialPotential,
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
      skills,
      stats,
      load,
      fatigue: 0,
      overwork: { streakDays: 0, active: false },
    },
    counters: {},
    flags: {},
    actionLog: [],
    today: { winds: [], loads: 0 },
    titles: [],
    ledger: [],
    notify: { day: 0, sToday: false, kehai: [] },
  };
}
