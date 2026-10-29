import { describe, expect, it } from "vitest";
import {
  combatIntent,
  combatResult,
  playerCombatStats,
  startCombat,
  telegraphLines,
  turn,
  type CombatConfig,
  type CombatState,
  type EnemyDef,
} from "./index.js";
import { newGame } from "../state/newGame.js";
import { step, type StepConfig } from "../step.js";

const cfg: CombatConfig = {
  baseHp: 30,
  hpPerEndurance: 2,
  attackBase: 5,
  attackPerWeaponSkill: 0.15,
  attackPerStrength: 0.2,
  ctBase: 12,
  ctPerAgility: 0.15,
  ctMin: 6,
  defendFactor: 0.5,
  fleeBase: 0.7,
  fleePerAgility: 0.02,
  observeBonus: 20,
  preciseObserve: 40,
  deathPendingFactor: 0.5,
  hitBase: 0.86,
  hitPerWeaponSkill: 0.002,
  hitPerAgilityDiff: 0.012,
  hitMin: 0.45,
  hitMax: 0.98,
  varianceMin: 0.8,
  varianceMax: 1.25,
  critBase: 0.08,
  critPerWeaponSkill: 0.002,
  critFactor: 1.8,
  enemyCritBase: 0.05,
  enemyCritFactor: 1.6,
  evadeBase: 0.06,
  evadePerEvasion: 0.004,
  evadePerAgilityDiff: 0.008,
  evadeMax: 0.7,
  readEvadeBonus: 0.5,
  guardTelegraphFactor: 0.15,
  counterFactor: 2.4,
  counterFactorRead: 2.8,
  openingTicks: 16,
  staggerTicks: 11,
};

const wolf: EnemyDef = {
  id: "wolf",
  name: "狼",
  hp: 18,
  intervalTicks: 10,
  challenge: 15,
  agility: 5,
  attack: { id: "bite", name: "咬みつき", power: 4 },
  moves: { pounce: { id: "pounce", name: "飛びかかり", power: 9 } },
  pattern: [
    { type: "attack" },
    { type: "attack" },
    { type: "telegraph", move: "pounce", ticks: 8 },
  ],
};

const mkPlayer = (obs: number, agility = 0, sword = 10) => ({
  stats: {
    strength: 10,
    endurance: 10,
    agility,
    dexterity: 0,
    perception: 0,
    spirit: 0,
  },
  skills: {
    observation: { value: obs },
    swordplay: { value: sword },
    evasion: { value: 5 },
  },
});

const CTX = { skill: 0, seed: "combat-test" };

describe("CT戦闘（03 §4）", () => {
  it("同じシードと行動列で同じ結果", () => {
    const run = (actions: ("attack" | "defend" | "observe" | "flee")[]) => {
      let s = startCombat(wolf, cfg, mkPlayer(0));
      for (const a of actions) s = turn(s, a, wolf, cfg, CTX);
      return s;
    };
    const acts = ["attack", "attack", "defend", "attack"] as const;
    expect(run([...acts])).toEqual(run([...acts]));
  });

  it("攻撃だけで狼を倒せる（勝利）", () => {
    let s = startCombat(wolf, cfg, mkPlayer(0));
    while (!s.done) s = turn(s, "attack", wolf, cfg, CTX);
    const r = combatResult(s);
    expect(r.won).toBe(true);
    expect(r.ticks).toBeGreaterThan(0);
  });

  it("観察が低いと曖昧な予兆、高いと技名＋残りtickが出る", () => {
    // パターン3番目（2回の敵行動後）に予兆が出るよう進める
    let s = startCombat(wolf, cfg, mkPlayer(0));
    s = turn(s, "attack", wolf, cfg, CTX); // tick 12 経過：敵行動2回（t=5,15は…実際は攻撃2回目まで）
    while (!s.telegraph && !s.done) s = turn(s, "attack", wolf, cfg, CTX);
    if (!s.done) {
      const low = telegraphLines(s, wolf, cfg).join("\n");
      expect(low).toContain("唸っている");
      expect(low).not.toContain("飛びかかり");
      // 観察が高いプレイヤー
      let s2 = startCombat(wolf, cfg, mkPlayer(80));
      while (!s2.telegraph && !s2.done) s2 = turn(s2, "attack", wolf, cfg, CTX);
      const high = telegraphLines(s2, wolf, cfg).join("\n");
      expect(high).toContain("飛びかかり");
      expect(high).toContain("tick");
    }
  });

  it("観察行動で予兆の精度が1段上がる（30+20≥40）", () => {
    let s = startCombat(wolf, cfg, mkPlayer(30));
    // 攻撃で待って予兆を出させる（この時点では未観察）
    while (!s.telegraph && !s.done) s = turn(s, "attack", wolf, cfg, CTX);
    if (!s.done && s.telegraph) {
      // 観察30 だけでは曖昧（<40）。観察行動ボーナス(+20)で精密になる
      expect(telegraphLines(s, wolf, cfg).join("\n")).toContain("唸っている");
      const s2 = { ...s, observed: true };
      expect(telegraphLines(s2, wolf, cfg).join("\n")).toContain("飛びかかり");
    }
  });

  it("防御は予兆の大技ダメージを軽減する", () => {
    // 予兆が出る直前で防御 → 飛びかかりが軽減される
    let s = startCombat(wolf, cfg, mkPlayer(0));
    while (!s.telegraph && !s.done) s = turn(s, "attack", wolf, cfg, CTX);
    if (!s.done) {
      const dmg = (a: "attack" | "defend") => {
        let x = { ...s, log: [] as typeof s.log };
        const before = x.damageTaken;
        while (x.telegraph && !x.done) x = turn(x, a, wolf, cfg, CTX);
        return x.damageTaken - before;
      };
      const blocked = dmg("defend");
      const open = dmg("attack");
      expect(blocked).toBeLessThan(open);
    }
  });
});

/* ── F-04：戦闘の駆け引き ── */

/** 挑戦差15以上の格上（街道の追い剥ぎ相当） */
const bandit: EnemyDef = {
  id: "bandit",
  name: "追い剥ぎ",
  hp: 72,
  intervalTicks: 9,
  challenge: 30,
  agility: 7,
  attack: { id: "shank", name: "短刀の一突き", power: 7 },
  moves: { ambush: { id: "ambush", name: "不意の連撃", power: 28 } },
  pattern: [
    { type: "attack" },
    { type: "attack" },
    { type: "telegraph", move: "ambush", ticks: 8 },
  ],
};

type Policy = (s: CombatState) => "attack" | "defend" | "observe" | "flee";
const fight = (
  enemy: EnemyDef,
  player: ReturnType<typeof mkPlayer>,
  policy: Policy,
  seed: string,
  maxTurns = 60,
) => {
  let s = startCombat(enemy, cfg, player);
  while (!s.done && s.turn < maxTurns) s = turn(s, policy(s), enemy, cfg, { skill: 0, seed });
  return s;
};

describe("F-04 駆け引き", () => {
  it("乱数は全て ctx 由来 —— シードが違えばダメージ列が違う", () => {
    const run = (seed: string) => {
      let s = startCombat(wolf, cfg, mkPlayer(0));
      const out: number[] = [];
      while (!s.done && s.turn < 6) {
        s = turn(s, "attack", wolf, cfg, { skill: 0, seed });
        out.push(s.enemyHp);
      }
      return out;
    };
    expect(run("seed-a")).not.toEqual(run("seed-b"));
    expect(run("seed-a")).toEqual(run("seed-a"));
  });

  it("敏捷差が開くと攻撃は外れ、複数シードで会心が出る", () => {
    // HP を持たせて、命中判定が十分な回数積まれるようにする
    const quick: EnemyDef = { ...wolf, agility: 30, hp: 200 };
    let s = startCombat(quick, cfg, mkPlayer(0));
    while (!s.done && s.turn < 8) s = turn(s, "attack", quick, cfg, CTX);
    const misses = s.log.filter((e) => e.type === "playerMiss").length;
    const hits = s.log.filter((e) => e.type === "playerAttack").length;
    expect(misses).toBeGreaterThan(0);
    expect(hits).toBeGreaterThan(0);
    // 会心：十分なHPの敵相手に複数シードで少なくとも1回は出る
    const dummy: EnemyDef = { ...wolf, hp: 500 };
    let crits = 0;
    for (let i = 0; i < 12; i++) {
      const f = fight(dummy, mkPlayer(0), () => "attack", `crit-${i}`, 12);
      crits += f.log.filter((e) => e.type === "playerAttack" && e.crit).length;
    }
    expect(crits).toBeGreaterThan(0);
  });

  it("予兆は必ず次の判断まで残る（見えたのに防げない事故がない）", () => {
    let s = startCombat(bandit, cfg, mkPlayer(0, 5, 15));
    let n = 0;
    while (!s.done && n++ < 60) {
      s = turn(s, "attack", bandit, cfg, { skill: 0, seed: "tell" });
      // 判断時点で見えている予兆の発動は必ず未来（＝次の間合いで応じられる）
      if (s.telegraph) expect(s.telegraph.dueTick).toBeGreaterThan(s.tick);
    }
  });

  it("大技を防御で受け止めると隙が生まれ、次の攻撃が反撃になる", () => {
    let s = startCombat(bandit, cfg, mkPlayer(0, 5, 15));
    while (!s.telegraph && !s.done) s = turn(s, "attack", bandit, cfg, CTX);
    expect(s.done).toBe(false);
    s = turn(s, "defend", bandit, cfg, CTX);
    const guarded = s.log.filter((e) => e.type === "enemyHit" && e.big && e.guarded);
    expect(guarded.length).toBe(1);
    expect(s.parries).toBe(1);
    expect(s.openingFactor).toBeCloseTo(cfg.counterFactor);
    // 反撃：必中・大きな一撃
    const before = s.enemyHp;
    s = turn(s, "attack", bandit, cfg, CTX);
    const counter = s.log.find((e) => e.type === "playerAttack" && e.counter);
    expect(counter).toBeDefined();
    expect(before - s.enemyHp).toBeGreaterThan(s.playerAttack); // 反撃倍率分だけ通常より大きい
  });

  it("見切りで大技を躱せば無傷で大きな隙が生まれる", () => {
    // 複数シードのどれかで見切り回避が起き、被弾0のまま隙が開く
    let saw = false;
    for (let i = 0; i < 8 && !saw; i++) {
      let s = startCombat(bandit, cfg, mkPlayer(0, 5, 15));
      while (!s.telegraph && !s.done)
        s = turn(s, "attack", bandit, cfg, { skill: 0, seed: `read-${i}` });
      if (s.done) continue;
      s = turn(s, "observe", bandit, cfg, { skill: 0, seed: `read-${i}` });
      const dodged = s.log.find((e) => e.type === "enemyMiss" && e.big);
      if (dodged) {
        saw = true;
        expect(s.parries).toBe(1);
        expect(s.openingFactor).toBeCloseTo(cfg.counterFactorRead);
      }
    }
    expect(saw).toBe(true);
  });

  it("挑戦差15以上：攻撃連打は沈み、予兆への対応は生き残る", () => {
    const underleveled = mkPlayer(0, 5, 15); // 剣術15 vs 挑戦30 = Δ15
    const mash: Policy = () => "attack";
    const guardOnTell: Policy = (s) => (s.telegraph ? "defend" : "attack");
    for (let i = 0; i < 6; i++) {
      const m = fight(bandit, underleveled, mash, `t-${i}`);
      expect(combatResult(m).won).toBe(false);
      expect(m.died).toBe(true);
      const g = fight(bandit, underleveled, guardOnTell, `t-${i}`);
      expect(combatResult(g).won).toBe(true);
      expect(g.parries).toBeGreaterThan(0);
    }
  });

  it("敵の意図（combatIntent）：予兆の有無・構え・隙を返す", () => {
    let s = startCombat(bandit, cfg, mkPlayer(0, 5, 15));
    expect(combatIntent(s, bandit, cfg).telegraph).toBeNull();
    while (!s.telegraph && !s.done) s = turn(s, "attack", bandit, cfg, CTX);
    const intent = combatIntent(s, bandit, cfg);
    expect(intent.telegraph).not.toBeNull();
    expect(intent.telegraph?.precise).toBe(false); // 観察0 → 技名は読めない
    expect(intent.guarding).toBe(false);
    s = turn(s, "defend", bandit, cfg, CTX);
    const i2 = combatIntent(s, bandit, cfg);
    expect(i2.telegraph).toBeNull(); // 発動済み
    expect(i2.openingIn).toBeGreaterThan(0); // 受け止めたので隙
  });
});

// step との接続（勝敗の記録・gain・死亡蘇生）
const baseCfg = (): StepConfig => ({
  time: {
    actionsPerDay: 5,
    timeOfDay: ["morning", "morning", "noon", "evening", "night"],
    daysPerWeek: 7,
    daysPerSeason: 28,
    seasonsPerYear: 4,
    moonCycleDays: 28,
    moonPhaseWindowDays: 1,
    startAge: 15,
  },
  actionLogMax: 100,
  gain: {
    base: { train: 3.6, work: 2.5, combat: 4 },
    challengePoints: [
      [-20, 0.4],
      [0, 1],
      [10, 1.3],
      [30, 1.5],
    ],
    challengeTrainCap: 0.6,
    noveltyK: 0.15,
    noveltyWindow: 20,
    failMultiplier: 0.6,
    modifierCap: 2.5,
    diminishBase: 110,
    diminishExponent: 1.5,
    fatigueScale: 0.5,
  },
  sleep: {
    nightlyCapPerSkill: 8.0,
    nightlyCapTotal: 999,
    innFactors: { cheap: 0.8, normal: 1.0, good: 1.15 },
    dinnerFactors: { withDinner: 1.1, noDinner: 0.85 },
    qualityMin: 0.6,
    qualityMax: 1.2,
    potentialDecayPerPoint: 0.01,
  },
  tailwind: {
    defs: [],
    tailwindFactor: 1.3,
    headwindFactor: 0.8,
    recentDays: 3,
    headwindBiasK: 1.5,
    tailwindBoostK: 0.5,
    drawMin: 1,
    drawMax: 2,
  },
  body: {
    fatiguePerAction: { wait: 1, train: 12, work: 10, combat: 20 },
    fatigueDefaultPerAction: 2,
    fatigueRecover: 60,
    statLoadPerAction: {
      train: { strength: 2, endurance: 2, dexterity: 2 },
      work: { dexterity: 2, spirit: 1 },
      combat: { strength: 2, endurance: 3, agility: 2 },
    },
    statGainPerLoad: 0.05,
    overloadThreshold: 25,
    overworkStreakDays: 3,
    overworkConsolidateFactor: 0.5,
    restQuality: 0.9,
    restPotentialRecover: 3,
    potentialMax: 100,
  },
  ledger: {
    basePricePerQuality: 1,
    marketWindowDays: 7,
    marketDecayPerWork: 0.9,
    tierUpBonusPending: 2,
  },
  combat: cfg,
  society: {
    standings: [],
    professions: [],
    lifeGoals: [],
    goalRewardFactor: 1,
  },
  lore: { atoms: [], connections: [] },
  titles: [
    {
      id: "title.wolf_test",
      rank: "B",
      condition: { counter: "kill.species.wolf", gte: 1 },
    },
  ],
});

const SKILL_IDS = ["swordplay", "evasion", "observation", "smithing", "mining", "eloquence"];

describe("combat コマンド（step への反映）", () => {
  it("勝つと kill.species.<id> が増え gain が入る", () => {
    const s0 = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const { state, events } = step(
      s0,
      { type: "combat", enemyId: "wolf", difficulty: 15, won: true },
      baseCfg(),
    );
    expect(state.counters["kill.species.wolf"]).toBe(1);
    expect(events.some((e) => e.type === "gainApplied" && e.skill === "swordplay")).toBe(true);
    expect(state.player.skills["swordplay"]!.pending).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "combatEnded")).toBe(true);
  });

  it("撃破で kill 条件の称号が取れる", () => {
    const s0 = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const { events } = step(
      s0,
      { type: "combat", enemyId: "wolf", difficulty: 15, won: true },
      baseCfg(),
    );
    expect(events.some((e) => e.type === "titleGained" && e.id === "title.wolf_test")).toBe(true);
  });

  it("死亡すると未定着経験が半減し death.count が増える", () => {
    let s = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    s = step(s, { type: "train", skill: "swordplay", difficulty: 20 }, baseCfg()).state;
    const before = s.player.skills["swordplay"]!.pending;
    expect(before).toBeGreaterThan(0);
    const { state, events } = step(
      s,
      { type: "combat", enemyId: "wolf", difficulty: 15, won: false, died: true },
      baseCfg(),
    );
    // 半減するのは戦闘で入った分を除いた差分を含む。pending が半分程度に減る
    const after = state.player.skills["swordplay"]!.pending;
    expect(after).toBeLessThan(before + 4); // 追加gain後に半減なので元より十分小さい
    expect(state.counters["death.count"]).toBe(1);
    expect(events.some((e) => e.type === "died")).toBe(true);
  });
});

describe("G-04：系統タグ（foe.<family>）", () => {
  const ghoul: EnemyDef = { ...wolf, id: "ghoul", name: "食屍鬼", family: "undead" };
  const knight: EnemyDef = { ...wolf, id: "knight", family: "human" };

  it("獣でも人でもない敵は foe.<family> で刻まれる", () => {
    let s = startCombat(ghoul, cfg, mkPlayer(0, 5, 15));
    s = turn(s, "attack", ghoul, cfg, CTX);
    const u = s.uses[s.uses.length - 1]!;
    expect(u.tags).toContain("foe.undead");
    expect(u.tags).not.toContain("foe.human");
    expect(u.tags).not.toContain("foe.beast");
  });

  it("人は従来どおり foe.human、獣は foe.beast", () => {
    let s = startCombat(knight, cfg, mkPlayer(0, 5, 15));
    s = turn(s, "attack", knight, cfg, CTX);
    expect(s.uses[s.uses.length - 1]!.tags).toContain("foe.human");
    let s2 = startCombat({ ...wolf, beast: true }, cfg, mkPlayer(0, 5, 15));
    s2 = turn(s2, "attack", { ...wolf, beast: true }, cfg, CTX);
    expect(s2.uses[s2.uses.length - 1]!.tags).toContain("foe.beast");
  });
});

describe("G-04：撃破の戦利品（モンスター素材）", () => {
  const dropsCfg = (): StepConfig => ({
    ...baseCfg(),
    enemyDrops: {
      wolf: [
        { item: "meat", chance: 1, n: [2, 3] },
        { item: "hide", chance: 0.5, n: [1, 1] },
      ],
      bandit: [{ item: "relic", chance: 0.01, n: [1, 1] }],
    },
  });
  const mk = (seed: string) =>
    newGame(seed, "名無し", { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 });

  it("撃破すると戦利品が落ち、同じ抽選は再現できる（決定性）", () => {
    const cmd = { type: "combat", enemyId: "wolf", difficulty: 15, won: true } as const;
    const a = step(mk("seed-drops"), cmd, dropsCfg());
    const meat = a.events.find((e) => e.type === "itemGot" && e.id === "meat");
    expect(meat !== undefined && meat.type === "itemGot" ? meat.n : 0).toBeGreaterThanOrEqual(2);
    expect(meat !== undefined && meat.type === "itemGot" ? meat.n : 0).toBeLessThanOrEqual(3);
    expect(a.state.life.items["meat"]).toBe(
      meat !== undefined && meat.type === "itemGot" ? meat.n : -1,
    );
    // 同じ世界シード・同じ撃破序数 → 同じ戦利品（セーブ／リプレイでも同じ）
    const b = step(mk("seed-drops"), cmd, dropsCfg());
    expect(b.state.life.items).toEqual(a.state.life.items);
    // 別シードは別の抽選になり得る（結果の同一性は要求しない。ここでは生じることだけ）
    const c = step(mk("seed-other"), cmd, dropsCfg());
    expect(c.state.life.items["meat"] ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("敗けた戦闘・表の無い敵では落ちない", () => {
    const lost = step(
      mk("seed-drops"),
      { type: "combat", enemyId: "wolf", difficulty: 15, won: false },
      dropsCfg(),
    );
    expect(lost.events.some((e) => e.type === "itemGot")).toBe(false);
    const other = step(
      mk("seed-drops"),
      { type: "combat", enemyId: "stray_dog", difficulty: 8, won: true },
      dropsCfg(),
    );
    expect(other.events.some((e) => e.type === "itemGot")).toBe(false);
  });

  it("何度目の撃破かで別の抽選になる（撃破序数が鍵）", () => {
    let s = mk("seed-drops");
    const cmd = { type: "combat", enemyId: "wolf", difficulty: 15, won: true } as const;
    s = step(s, cmd, dropsCfg()).state;
    const first = s.life.items["meat"] ?? 0;
    s = step(s, cmd, dropsCfg()).state;
    const total = s.life.items["meat"] ?? 0;
    expect(s.counters["kill.species.wolf"]).toBe(2);
    expect(total - first).toBeGreaterThanOrEqual(2);
    expect(total - first).toBeLessThanOrEqual(3);
  });

  it("深層の撃破にも戦利品が落ちる", () => {
    const r = step(
      mk("seed-drops"),
      { type: "abyss", end: "retreat", kills: [{ enemyId: "wolf", difficulty: 15 }] },
      dropsCfg(),
    );
    expect(r.events.some((e) => e.type === "itemGot" && e.id === "meat")).toBe(true);
  });
});

/* ── X-32：怪我（部位ダメージは怪我として数日残る、docs/03 §4） ── */

const injCfg: CombatConfig = {
  ...cfg,
  injuries: {
    hitShare: 0.25,
    days: 4,
    partWeights: { body: 4, arms: 3, legs: 2, head: 1 },
    armsFactor: 0.75,
    legsFactor: 0.75,
    bodyFactor: 0.75,
    headFactor: 0.5,
  },
};

const injStep = (): StepConfig => ({ ...baseCfg(), combat: injCfg });

describe("X-32：怪我（戦闘エンジン）", () => {
  it("重い一撃が部位の傷を残し、結果に載る（決定的）", () => {
    // 追い剥ぎの大技（power 28・playerHpMax 50 の 25% 超）は無対応なら傷を残す
    const run = (seed: string) => {
      let s = startCombat(bandit, injCfg, mkPlayer(0, 5, 15));
      let n = 0;
      while (!s.done && s.injuries.length === 0 && n++ < 80)
        s = turn(s, "attack", bandit, injCfg, { skill: 0, seed });
      return s;
    };
    const a = run("inj-1");
    expect(a.injuries.length).toBeGreaterThan(0);
    // 傷は戦闘ログにも刻まれる
    expect(a.log.some((e) => e.type === "injured")).toBe(true);
    // 同じシードは同じ傷
    expect(run("inj-1").injuries).toEqual(a.injuries);
    // 結果に載る（step が GameState.injuries に畳む）
    expect(combatResult(a).injuries).toEqual(a.injuries);
  });

  it("怪我の設定が無ければ傷は残らない（従来どおり）", () => {
    let s = startCombat(bandit, cfg, mkPlayer(0, 5, 15));
    while (!s.done && s.turn < 80) s = turn(s, "attack", bandit, cfg, { skill: 0, seed: "inj-1" });
    expect(s.injuries.length).toBe(0);
  });

  it("傷のある部位は対応する性能が落ちる", () => {
    const p = mkPlayer(0, 10, 20);
    const whole = playerCombatStats(p, injCfg);
    // 腕の怪我 → 威力が落ちる（敏捷は変わらない）
    const arms = playerCombatStats({ ...p, injuries: ["arms"] }, injCfg);
    expect(arms.attack).toBeLessThan(whole.attack);
    expect(arms.agility).toBe(whole.agility);
    // 脚の怪我 → 敏捷が落ちる（CT にも響く）
    const legs = playerCombatStats({ ...p, injuries: ["legs"] }, injCfg);
    expect(legs.agility).toBeLessThan(whole.agility);
    expect(legs.ct).toBeGreaterThan(whole.ct);
    // 胴の怪我 → 体力が落ちる
    const body = playerCombatStats({ ...p, injuries: ["body"] }, injCfg);
    expect(body.hp).toBeLessThan(whole.hp);
    // 頭の怪我 → 観察が落ちる
    const smart = { ...p, skills: { ...p.skills, observation: { value: 40 } } };
    const head = playerCombatStats({ ...smart, injuries: ["head"] }, injCfg);
    expect(head.observe).toBeLessThan(40);
  });
});

describe("X-32：怪我（step への畳み込み）", () => {
  const mk = (seed: string) =>
    newGame(seed, "名無し", { skillIds: SKILL_IDS, initialPotential: 100, initialStatValue: 10 });

  it("戦闘の傷が GameState.injuries に刻まれ、癒え日が設定される", () => {
    const { state, events } = step(
      mk("seed-inj"),
      { type: "combat", enemyId: "wolf", difficulty: 15, won: false, injuries: ["arms"] },
      injStep(),
    );
    expect(state.injuries).toEqual([{ part: "arms", untilDay: 0 + 4 }]);
    expect(events.some((e) => e.type === "injured" && e.part === "arms")).toBe(true);
  });

  it("同じ部位を再び痛めると、より遅い癒え日が残る", () => {
    const s0 = {
      ...mk("seed-inj"),
      injuries: [{ part: "arms" as const, untilDay: 2 }],
      time: { day: 1, action: 0 },
    };
    const { state } = step(
      s0,
      { type: "combat", enemyId: "wolf", difficulty: 15, won: false, injuries: ["arms"] },
      injStep(),
    );
    // 1 + 4 = 5 が既存の 2 を押しのける
    expect(state.injuries).toEqual([{ part: "arms", untilDay: 5 }]);
  });

  it("癒え日を越えた傷は行動の前に取れ、癒えの行が届く", () => {
    const s0 = {
      ...mk("seed-inj"),
      injuries: [
        { part: "arms" as const, untilDay: 1 },
        { part: "legs" as const, untilDay: 9 },
      ],
      time: { day: 2, action: 0 },
    };
    const { state, events } = step(s0, { type: "wait" }, injStep());
    expect(state.injuries).toEqual([{ part: "legs", untilDay: 9 }]);
    expect(events.some((e) => e.type === "injuryHealed" && e.part === "arms")).toBe(true);
  });

  it("死んで蘇ると傷は取れる（教会の蘇生は体を立て直す）", () => {
    const s0 = {
      ...mk("seed-inj"),
      injuries: [{ part: "arms" as const, untilDay: 9 }],
    };
    const { state } = step(
      s0,
      { type: "combat", enemyId: "wolf", difficulty: 15, won: false, died: true },
      injStep(),
    );
    expect(state.injuries).toEqual([]);
  });

  it("深層の傷も同じく刻まれる", () => {
    const r = step(
      mk("seed-inj"),
      { type: "abyss", end: "retreat", kills: [], injuries: ["legs"] },
      injStep(),
    );
    expect(r.state.injuries).toEqual([{ part: "legs", untilDay: 4 }]);
    expect(r.events.some((e) => e.type === "injured" && e.part === "legs")).toBe(true);
  });
});
