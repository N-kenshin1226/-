import type { GameState } from "../state/types.js";

/**
 * セーブのシリアライズとバージョン移行（docs/04 §2 原則5）。
 * GameState の形を変えたら SAVE_VERSION を上げ、migrations に変換関数を足す
 * （AGENTS.md 絶対ルール）。年代記は別領域・別バージョン（chronicle/、M3）。
 */

export const SAVE_VERSION = 20;

/** migrations[n] はバージョン n のデータを n+1 へ変換する */
export const migrations: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> =
  {
    /** 0 → 1: 初期スキーマ導入前のダミー。欠けているフィールドを既定値で埋める */
    0: (old) => ({
      version: 1,
      seed: typeof old.seed === "string" ? old.seed : "trace",
      rng: old.rng,
      time: { day: 0, action: 0 },
      player: old.player,
      counters: {},
      flags: {},
      actionLog: [],
    }),
    /** 1 → 2: today（追い風の保持）を追加 */
    1: (old) => ({ ...old, version: 2, today: { winds: [] } }),
    /** 2 → 3: 基礎能力の負荷プール・オーバーワーク・今日の負荷合計を追加 */
    2: (old) => {
      const p = (old.player ?? {}) as Record<string, unknown>;
      const today = (old.today ?? {}) as Record<string, unknown>;
      return {
        ...old,
        version: 3,
        player: {
          ...p,
          load: {
            strength: 0,
            endurance: 0,
            agility: 0,
            dexterity: 0,
            perception: 0,
            spirit: 0,
          },
          overwork: { streakDays: 0, active: false },
        },
        today: { ...today, loads: 0 },
      };
    },
    /** 3 → 4: 獲得済み称号の一覧を追加 */
    3: (old) => ({ ...old, version: 4, titles: [] }),
    /** 4 → 5: 作品台帳を追加 */
    4: (old) => ({ ...old, version: 5, ledger: [] }),
    /** 5 → 6: 通知予算（03 §6）を追加 */
    5: (old) => ({ ...old, version: 6, notify: { day: 0, sToday: false, kehai: [] } }),
    /** 6 → 7: 立場×職業と人生目標（03 §1）を追加 */
    6: (old) => ({
      ...old,
      version: 7,
      society: {
        standing: "drifter",
        profession: null,
        pendingOffers: [],
        goal: null,
        achievedGoals: [],
      },
    }),
    /** 7 → 8: 見聞録（07 §3）を追加 */
    7: (old) => ({ ...old, version: 8, lore: { read: [], facts: [], connections: [] } }),
    /** 8 → 9: 所持金を追加（仕事の報酬・宿代） */
    8: (old) => {
      const p = (old.player ?? {}) as Record<string, unknown>;
      return { ...old, version: 9, player: { ...p, money: 0 } };
    },
    /**
     * 9 → 10: 出自（origin）と素質上限（potentialCap）を追加（T-25）。
     * 旧セーブの出自は流浪人相当の "origin.wanderer"（content のIDと一致させる）、
     * 素質上限は当時一律100の初期値を踏襲する
     */
    9: (old) => {
      const p = (old.player ?? {}) as Record<string, unknown>;
      const skills = (p.skills ?? {}) as Record<string, Record<string, unknown>>;
      return {
        ...old,
        version: 10,
        player: {
          ...p,
          origin: "origin.wanderer",
          skills: Object.fromEntries(
            Object.entries(skills).map(([id, s]) => [id, { ...s, potentialCap: 100 }]),
          ),
        },
      };
    },
    /** 10 → 11: 書物（T-26）の所持・読了状態を追加 */
    10: (old) => ({ ...old, version: 11, books: { owned: [], read: [] } }),
    /** 11 → 12: 師匠（T-27）。弟子入り中の師匠を追加（旧セーブは師匠なし） */
    11: (old) => ({ ...old, version: 12, mentor: null }),
    /** 12 → 13: 前世からの継承（T-39）。転生していない周は null */
    12: (old) => ({ ...old, version: 13, legacy: null }),
    /** 13 → 14: 運命の傾向（T-45）。旧セーブは中立の "calm" */
    13: (old) => ({ ...old, version: 14, tendency: "calm" }),
    /** 14 → 15: 誓約（T-46）。旧セーブは誓約なし */
    14: (old) => ({ ...old, version: 15, vows: [] }),
    /**
     * 15 → 16: 世界の危機（docs/08、W-01）を追加。
     * 旧セーブは crisis: null（未抽選）。次の季節の変わり目に step の危機進行が
     * 世界シードから抽選する（新しい世界と同じ危機になる。途中からでも決定論的）
     */
    15: (old) => ({ ...old, version: 16, crisis: null }),
    /**
     * 16 → 17: 武器（K-01「技能の種類を増やす」）。旧セーブは素手と剣を
     * 携えて剣を構えているものとする（従来の戦闘と同じ装備）。
     * 旧版に無い技能レコードは deserialize の opts.skillIds で補う
     * （コンテンツの技能一覧は core からは見えないため呼び出し側が渡す）
     */
    16: (old) => {
      const p = (old.player ?? {}) as Record<string, unknown>;
      return {
        ...old,
        version: 17,
        player: { ...p, weapons: ["fist", "sword"], weapon: "sword" },
      };
    },
    /**
     * 17 → 18: 日々の営み（P-02「行動の種類を増やす」）。持ち物・仲・食事・
     * 祈り・旅の欄を追加。旧セーブは基点の町 "ardi" にいて空荷の状態
     */
    17: (old) => ({
      ...old,
      version: 18,
      life: {
        town: "ardi",
        items: {},
        bonds: {},
        mealDay: -1,
        mealQuality: 0,
        prayedDay: -1,
        journey: null,
      },
    }),
    /**
     * 18 → 19: 武技・資源・構成（K-02）。気力・魔力・習得技・使用記録・
     * 構成スロットを追加する。気力・魔力は空から始めて次の眠りで満たす
     * （上限は stats から導出するのでここには数値の素は持たない）。
     * 構成は装備中の武器を本命に据え、武器枠はもう1本を所持から選ぶ
     */
    18: (old) => {
      const p = (old.player ?? {}) as Record<string, unknown>;
      const owned = Array.isArray(p.weapons) ? (p.weapons as string[]) : [];
      const equipped = typeof p.weapon === "string" ? p.weapon : "sword";
      const alt = owned.find((w) => w !== equipped) ?? null;
      return {
        ...old,
        version: 19,
        player: {
          ...p,
          ki: 0,
          mana: 0,
          arts: {},
          artTags: {},
          skillTags: {},
          build: {
            slots: [null, null, null, null, null, null, null, null],
            passives: [null, null, null, null],
            weapons: [equipped, alt],
          },
        },
      };
    },
    /**
     * 19 → 20: 地方生成（G-01、docs/10）。world（地図の出所）と町ごとの
     * 評判（life.rep）を追加。旧セーブは「今の地図を持つ世界」として
     * legacy 扱い —— places.json のアルディ・ベルンをそのまま使い、
     * 生成は新しい周（種）から始まる
     */
    19: (old) => {
      const life = (old.life ?? {}) as Record<string, unknown>;
      return {
        ...old,
        version: 20,
        life: { ...life, rep: {} },
        world: { kind: "legacy", recipe: 0 },
      };
    },
  };

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(
  raw: string,
  /** K-01：コンテンツの技能一覧（＋新規レコードの素質）を渡すと、旧セーブに
   *  無い技能を空レコード（value 0・未発見）として補う */
  opts?: { skillIds?: readonly string[]; initialPotential?: number },
): GameState {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("deserialize: オブジェクトではないデータ");
  }
  const rawVersion = parsed.version;
  if (typeof rawVersion !== "number") {
    throw new Error("deserialize: version がありません");
  }
  let version = rawVersion;
  if (version > SAVE_VERSION) {
    throw new Error(`deserialize: 未知のバージョン ${version}（対応は ${SAVE_VERSION} まで）`);
  }
  let data = parsed;
  while (version < SAVE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) throw new Error(`deserialize: バージョン ${version} の移行関数がありません`);
    data = migrate(data);
    version = data.version as number;
  }
  assertShape(data);
  const state = data as unknown as GameState;
  // K-01：旧版のセーブに無い技能（後から加わった技能）を空の技能として補う。
  // 素質は呼び出し側が渡す初期値（balance.player.initialPotential）に揃え、
  // 値は 0 のまま —— 未発見の技能として ?? ではなく普通に育てられる。
  // 解放条件のある技能は解放まで ?? 表示のまま（newGame と同じ形）
  if (opts?.skillIds !== undefined && opts.initialPotential !== undefined) {
    const skills = { ...state.player.skills };
    for (const id of opts.skillIds) {
      if (skills[id] === undefined) {
        skills[id] = {
          value: 0,
          peak: 0,
          pending: 0,
          potential: opts.initialPotential,
          potentialCap: opts.initialPotential,
          lastUsedDay: 0,
        };
      }
    }
    state.player = { ...state.player, skills };
  }
  return state;
}

/** 最低限の形チェック（厳密な内容検証は行わない） */
function assertShape(data: Record<string, unknown>): void {
  const required = [
    "seed",
    "rng",
    "time",
    "player",
    "counters",
    "flags",
    "actionLog",
    "today",
    "titles",
    "ledger",
    "notify",
    "society",
    "lore",
    "books",
    "mentor",
    "legacy",
    "tendency",
    "vows",
    "crisis",
    "life",
    "world",
  ];
  for (const key of required) {
    if (!(key in data)) throw new Error(`deserialize: ${key} がありません`);
  }
}
