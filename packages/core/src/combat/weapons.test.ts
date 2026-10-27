import { describe, expect, it } from "vitest";
import {
  playerCombatStats,
  startCombat,
  turn,
  weaponDefOf,
  type CombatConfig,
  type EnemyDef,
  type WeaponDef,
} from "./index.js";
import { linkFlat, linkFlatCap, linkSum, type SkillLinks } from "../links/index.js";
import { newGame } from "../state/newGame.js";
import { deserialize, serialize, SAVE_VERSION } from "../save/index.js";
import { step, type StepConfig } from "../step.js";

/* ── K-01：武器の定義と技能リンク ── */

const weapons: Record<string, WeaponDef> = {
  fist: {
    id: "fist",
    name: "素手",
    skill: "brawl",
    power: 0,
    ctFactor: 0.85,
    critBonus: 0,
    hitBonus: 0,
  },
  sword: {
    id: "sword",
    name: "剣",
    skill: "swordplay",
    power: 6,
    ctFactor: 1.0,
    critBonus: 0.02,
    hitBonus: 0,
  },
  knife: {
    id: "knife",
    name: "短刀",
    skill: "dagger",
    power: 3,
    ctFactor: 0.8,
    critBonus: 0.05,
    hitBonus: 0.05,
  },
  spear: {
    id: "spear",
    name: "槍",
    skill: "spear",
    power: 8,
    ctFactor: 1.15,
    critBonus: -0.03,
    hitBonus: -0.02,
  },
  buckler: {
    id: "buckler",
    name: "小盾",
    skill: "shield",
    power: 1,
    ctFactor: 1.0,
    critBonus: -0.05,
    hitBonus: 0,
    defendBonus: 0.25,
  },
};

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
  varianceMin: 1.0, // 武器差の比較を見やすくするため揺らぎは潰す
  varianceMax: 1.0,
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
  weapons,
};

const wolf: EnemyDef = {
  id: "wolf",
  name: "狼",
  hp: 60,
  intervalTicks: 10,
  challenge: 15,
  agility: 5,
  attack: { id: "bite", name: "咬みつき", power: 4 },
  moves: {},
  pattern: [{ type: "attack" }],
};

const CTX = { skill: 0, seed: "weapon-test" };

const mkPlayer = (
  skills: Record<string, number>,
  opts?: { weapon?: string; weapons?: readonly string[]; strength?: number },
) => ({
  stats: {
    strength: opts?.strength ?? 10,
    endurance: 10,
    agility: 0,
    dexterity: 0,
    perception: 0,
    spirit: 0,
  },
  skills: Object.fromEntries(Object.entries(skills).map(([id, v]) => [id, { value: v }])),
  ...(opts?.weapon !== undefined ? { weapon: opts.weapon } : {}),
  ...(opts?.weapons !== undefined ? { weapons: opts.weapons } : {}),
});

describe("武器定義の解決（K-01）", () => {
  it("未知・未指定の武器は表の先頭に倒す", () => {
    expect(weaponDefOf(cfg, "sword").id).toBe("sword");
    expect(weaponDefOf(cfg, "knife").id).toBe("knife");
    expect(weaponDefOf(cfg, "no_such").id).toBe("fist"); // 先頭
    expect(weaponDefOf(cfg, undefined).id).toBe("fist");
  });

  it("武器ごとの技能が攻撃力の係数に乗る（剣術ではなく短剣）", () => {
    const daggerOnly = mkPlayer({ dagger: 40, swordplay: 0 }, { weapon: "knife" });
    const swordOnly = mkPlayer({ dagger: 0, swordplay: 40 }, { weapon: "knife" });
    const a = playerCombatStats(daggerOnly, cfg);
    const b = playerCombatStats(swordOnly, cfg);
    // 短刀の技能が高いほうが攻撃力が高い —— 剣術は短刀には効かない
    expect(a.attack).toBeGreaterThan(b.attack);
    expect(a.weaponSkill).toBe(40);
    expect(b.weaponSkill).toBe(0);
  });

  it("武器の威力・間隔・補正が反映される", () => {
    const spear = playerCombatStats(mkPlayer({ spear: 10 }, { weapon: "spear" }), cfg);
    const knife = playerCombatStats(mkPlayer({ dagger: 10 }, { weapon: "knife" }), cfg);
    // 槍は重い（ctFactor 1.15）短刀は速い（0.8）
    expect(spear.ct).toBeGreaterThan(knife.ct);
    // 槍のほうが威力は上（power 8 vs 3）
    expect(spear.attack).toBeGreaterThan(knife.attack);
    // 盾は防御補正を持つ
    const shield = playerCombatStats(mkPlayer({ shield: 10 }, { weapon: "buckler" }), cfg);
    expect(shield.weapon.defendBonus).toBeCloseTo(0.25);
  });
});

describe("戦闘中の武器持ち替え（K-01）", () => {
  it("持ち替えると武器・技能・間隔・攻撃力が切り替わり、ログに playerSwitch が出る", () => {
    const p = mkPlayer(
      { swordplay: 30, dagger: 0 },
      { weapon: "sword", weapons: ["fist", "sword", "knife"] },
    );
    let s = startCombat(wolf, cfg, p);
    expect(s.playerWeapon).toBe("sword");
    expect(s.playerWeaponSkill).toBe(30);
    const ctSword = s.playerCt;
    s = turn(s, { type: "switch", weapon: "knife" }, wolf, cfg, CTX);
    expect(s.playerWeapon).toBe("knife");
    expect(s.playerWeaponSkill).toBe(0); // 短剣技能は持っていない
    expect(s.playerCt).toBeLessThan(ctSword); // 短刀は剣より速い
    expect(s.log.some((e) => e.type === "playerSwitch" && e.text.includes("短刀"))).toBe(true);
  });

  it("持っていない武器への持ち替えは失敗する", () => {
    const p = mkPlayer({ swordplay: 30 }, { weapon: "sword", weapons: ["sword"] });
    let s = startCombat(wolf, cfg, p);
    s = turn(s, { type: "switch", weapon: "spear" }, wolf, cfg, CTX);
    expect(s.playerWeapon).toBe("sword");
    expect(s.log.some((e) => e.type === "playerSwitch" && e.text.includes("成らなかった"))).toBe(
      true,
    );
  });

  it("所持欄を渡さなければ装備中の武器しか持ち替えられない", () => {
    const p = mkPlayer({ brawl: 10, swordplay: 30 }, { weapon: "sword" });
    const s = startCombat(wolf, cfg, p);
    expect(s.ownedWeapons).toEqual(["sword"]);
  });
});

describe("技能リンク（K-01、balance.links）", () => {
  const links: SkillLinks = {
    "combat.attack": { cap: 0.5, skills: { fire_magic: 0.01 } },
    "combat.evade": { cap: 0.15, skills: { acrobatics: 0.005 } },
    "beast.attack": { cap: 0.3, skills: { hunting: 0.01 } },
    "travel.gain": { cap: 5, skills: { footwork: 1.5 } },
  };
  const cfgLinks: CombatConfig = { ...cfg, links };

  it("linkSum は技能値×係数の合計を cap で頭打ちする", () => {
    const skills = { fire_magic: { value: 30 } };
    expect(linkSum(links, "combat.attack", skills)).toBeCloseTo(0.3);
    expect(linkSum(links, "combat.attack", { fire_magic: { value: 999 } })).toBeCloseTo(0.5);
    expect(linkSum(links, "no_such_hook", skills)).toBe(0);
    expect(linkSum(undefined, "combat.attack", skills)).toBe(0);
  });

  it("linkFlat/linkFlatCap は定数系フックの表と上限を返す", () => {
    expect(linkFlat(links, "travel.gain")).toEqual({ footwork: 1.5 });
    expect(linkFlatCap(links, "travel.gain")).toBe(5);
    expect(linkFlat(links, "none")).toEqual({});
  });

  it("combat.attack リンクが攻撃力に乗る", () => {
    const plain = mkPlayer({ swordplay: 20 }, { weapon: "sword" });
    const fiery = mkPlayer({ swordplay: 20, fire_magic: 30 }, { weapon: "sword" });
    const a = playerCombatStats(plain, cfgLinks);
    const b = playerCombatStats(fiery, cfgLinks);
    expect(b.links.attack).toBeCloseTo(0.3);
    expect(b.attack).toBeGreaterThan(a.attack);
  });

  it("beast.attack は獣の敵にだけ乗る", () => {
    const hunter = mkPlayer({ swordplay: 10, hunting: 20 }, { weapon: "sword" });
    const beastWolf: EnemyDef = { ...wolf, beast: true };
    const hit = (enemy: EnemyDef) => {
      let s = startCombat(enemy, cfgLinks, hunter);
      s = turn(s, "attack", enemy, cfgLinks, CTX);
      return s.log.find((e) => e.type === "playerAttack")?.damage ?? 0;
    };
    // 揺らぎを潰しているので差は beast.attack 分だけ
    const vsBeast = hit(beastWolf);
    const vsMan = hit(wolf);
    expect(vsBeast).toBeGreaterThan(vsMan);
    expect(vsBeast).toBeCloseTo(vsMan * 1.2, 1); // hunting 20 × 0.01 = +0.2
  });
});

/* ── step との接続（購入・持ち替え・武器技能への経験） ── */

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
  society: { standings: [], professions: [], lifeGoals: [], goalRewardFactor: 1 },
  lore: { atoms: [], connections: [] },
  titles: [],
  weapons,
  initialSkillPotential: 100,
});

const SKILL_IDS = ["swordplay", "evasion", "observation", "dagger", "brawl", "hunting"];

describe("武器の購入と持ち替え（K-01）", () => {
  it("buyWeapon で武器を買い、equipWeapon で構えを替える", () => {
    const knifeForSale = { ...weapons.knife!, price: 30 };
    const c = { ...baseCfg(), weapons: { ...weapons, knife: knifeForSale } };
    let s = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
      initialMoney: 100,
    });
    expect(s.player.weapons).toEqual(["fist", "sword"]);
    // 買う
    const bought = step(s, { type: "buyWeapon", id: "knife" }, c);
    s = bought.state;
    expect(s.player.weapons).toContain("knife");
    expect(s.player.money).toBe(70);
    expect(bought.events.some((e) => e.type === "weaponBought" && e.id === "knife")).toBe(true);
    // 持ち替える
    const eq = step(s, { type: "equipWeapon", id: "knife" }, c);
    s = eq.state;
    expect(s.player.weapon).toBe("knife");
    expect(eq.events.some((e) => e.type === "weaponEquipped" && e.id === "knife")).toBe(true);
    // 未所持・金不足・未知の武器は拒否される
    expect(step(s, { type: "equipWeapon", id: "spear" }, c).state.player.weapon).toBe("knife");
    expect(step(s, { type: "buyWeapon", id: "knife" }, c).state.player.money).toBe(70);
    expect(step(s, { type: "buyWeapon", id: "no_such" }, c).state.player.money).toBe(70);
  });

  it("戦闘で使った武器の技能に経験が入る（剣術ではなく短剣）", () => {
    const s0 = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const { state, events } = step(
      s0,
      { type: "combat", enemyId: "wolf", difficulty: 15, won: true, weapon: "knife" },
      baseCfg(),
    );
    expect(state.player.skills["dagger"]!.pending).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "gainApplied" && e.skill === "dagger")).toBe(true);
    expect(events.some((e) => e.type === "gainApplied" && e.skill === "swordplay")).toBe(false);
  });

  it("獣との戦いは beast.exp のリンク技能にも経験が入る", () => {
    const c: StepConfig = {
      ...baseCfg(),
      links: { "beast.exp": { cap: 5, skills: { hunting: 3 } } },
    };
    const s0 = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const { state } = step(
      s0,
      { type: "combat", enemyId: "wolf", difficulty: 15, won: true, beast: true },
      c,
    );
    expect(state.player.skills["hunting"]!.pending).toBeGreaterThan(0);
  });
});

/* ── セーブ移行（v16 → v17） ── */

describe("セーブ v17（K-01）", () => {
  it("v16 のセーブは素手と剣・剣装備として復元される", () => {
    const s = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const v16: Record<string, unknown> = {
      ...(JSON.parse(serialize(s)) as Record<string, unknown>),
      version: 16,
    };
    const p = { ...(v16.player as Record<string, unknown>) };
    delete p.weapons;
    delete p.weapon;
    v16.player = p;
    const restored = deserialize(JSON.stringify(v16));
    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.player.weapons).toEqual(["fist", "sword"]);
    expect(restored.player.weapon).toBe("sword");
  });

  it("deserialize の opts で旧版に無い技能を空レコードで補う", () => {
    const s = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const restored = deserialize(serialize(s), {
      skillIds: [...SKILL_IDS, "alchemy"],
      initialPotential: 100,
    });
    expect(restored.player.skills["alchemy"]).toBeDefined();
    expect(restored.player.skills["alchemy"]!.value).toBe(0);
    expect(restored.player.skills["alchemy"]!.potential).toBe(100);
    // 既存の技能は変わらない
    expect(restored.player.skills["swordplay"]!.potential).toBe(100);
  });

  it("v17 のセーブは気力・魔力・習得技・使用記録・構成を補って v18 へ移行される（K-02）", () => {
    const s = newGame("seed", "名無し", {
      skillIds: SKILL_IDS,
      initialPotential: 100,
      initialStatValue: 10,
    });
    const v17: Record<string, unknown> = {
      ...(JSON.parse(serialize(s)) as Record<string, unknown>),
      version: 17,
    };
    const p = { ...(v17.player as Record<string, unknown>) };
    delete p.ki;
    delete p.mana;
    delete p.arts;
    delete p.artTags;
    delete p.skillTags;
    delete p.build;
    v17.player = p;
    const restored = deserialize(JSON.stringify(v17));
    expect(restored.version).toBe(18);
    expect(restored.player.ki).toBe(0);
    expect(restored.player.mana).toBe(0);
    expect(restored.player.arts).toEqual({});
    expect(restored.player.artTags).toEqual({});
    expect(restored.player.skillTags).toEqual({});
    // 構成：装備中の武器が本命、もう1本が持ち替え（K-01 の初期装備は素手＋剣）
    expect(restored.player.build.slots).toEqual(Array(8).fill(null));
    expect(restored.player.build.passives).toEqual(Array(4).fill(null));
    expect(restored.player.build.weapons[0]).toBe("sword");
    expect(restored.player.build.weapons[1]).toBe("fist");
  });

  it("SAVE_VERSION は 18", () => {
    expect(SAVE_VERSION).toBe(18);
  });
});
