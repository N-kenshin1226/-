import { evaluate, type Cond, type CondEnv } from "../conditions/index.js";
import type { GameState } from "../state/types.js";
import type { TimeConfig } from "../time/index.js";

/**
 * NPCの歳月（docs/07 §3 終盤「NPCも年を取る」、X-12）。
 *
 * 一生のあいだに NPC の物語は進んだり終わったりする（引退・結婚・死・栄転・旅立ち）。
 * 危機（docs/08）とは別系の、平時の人物の物語：
 * - 危機の離散は「世界が襲われた結果」、歳月の出来事は「その人の人生の節目」
 * - 発火時期は乱数ではなく条件DSLで書く（その世界の暦・刻印から決定的に決まる。
 *   同じ世界シードなら同じ日に同じ出来事が起きる）
 *
 * 状態の持ち方（GameState の形は変えない —— セーブ v16 据置）：
 * - `counters["npc.done.<npcId>.<index>"]` = 発火した日（この生での発火済み刻印）
 * - `flags["npc.<kind>.<npcId>"]` = その人の人生の印（結婚した・栄転した・引退した…。
 *   条件DSLの flag から読める。退場系の印でもある）
 * - `flags["npc.gone.<npcId>"]` = 街から去った・亡くなった（retire/die/depart の印）
 * - `event.setFlags` = 出来事と同時に立つ任意の刻印（条件DSLの材料）
 * - `state.crisis.log`（世界の出来事の記録）に `{ day, kind: "npc.<kind>", ref: npcId }`
 *   を追記する —— 年代記（街の記録）がそのまま拾う素材で、crisisState は
 *   世代をまたいで carryover されるので、前世で起きた出来事も世界の記録に残る
 *   （その生の flags/counters は新しい生でリセットされるが、世界の記録は残る。
 *   引退した師匠は次の代でも戻らない）
 *
 * 効果：
 * - retire/die/depart（退場）：その人は以後使えない。師匠なら入門・稽古ができなくなり
 *   （弟子入り中なら師弟は解消される）、voices の街の声・ランキングから退場する
 * - marry/promote（続く物語）：その人は街に残るが、出来事は新聞・噂・街の声に載る
 */

/** 出来事の種類。退場系はその人が使えなくなる印 */
export type NpcLifeEventKind = "retire" | "marry" | "depart" | "die" | "promote";

/** その人が街からいなくなる種類（引退・旅立ち・死去） */
export const NPC_LIFE_GONE_KINDS: readonly NpcLifeEventKind[] = ["retire", "depart", "die"];

/** 世界の記録（crisis.log）でこのモジュールが刻む kind の接頭辞（npc.retire など） */
export const NPC_LIFE_LOG_PREFIX = "npc.";

/** core が必要とする歳月定義の最小形（content の NpcLifeEventJson と同じ形） */
export interface NpcLifeEventDef {
  /** 発火条件（条件DSL。その世界の暦・flags/counters で決定的） */
  at: Cond;
  kind: NpcLifeEventKind;
  /** 出来事の記事文（{name} に人物の名が入る） */
  text: string;
  /** 発火と同時に立つ任意の旗印（条件DSLの flag で読める刻印） */
  setFlags?: readonly string[];
}

export interface NpcLifeNpcDef {
  /** 対象の人物（voices/canon の npc.* か、ライバルの抽選順 rival.<index>） */
  npcId: string;
  /** 表示名（rival.* は世界シードから解決するので name コールバックで渡す） */
  name?: string;
  events: readonly NpcLifeEventDef[];
}

/** StepConfig に差し込む歳月の設定（npc_lifecycle.json 由来） */
export interface NpcLifeConfig {
  npcs: readonly NpcLifeNpcDef[];
  /**
   * 師匠定義（mentors.json の最小形）との紐付け。師匠が対象NPCで退場系の
   * 出来事が起きたら、その人物を師とする弟子入りは解消される（state.mentor を清算）
   */
  mentors?: readonly { id: string; npc?: string }[];
  /**
   * 人物ID → 表示名の解決（rival.<index> は世界シードの抽選から、
   * npc.* は voices/canon から。注入しない場合は定義の name か ID を使う）
   */
  name?: (state: GameState, npcId: string) => string | undefined;
  /**
   * その人物がこの世界に居るか（X-20。生成地方では canon の人物は居ない
   * ので、居ない人の歳月の出来事は発火も記録もしない。省略時は定義の
   * 全員が居るものとして従来どおり発火する＝後方互換）
   */
  npcExists?: (state: GameState, npcId: string) => boolean;
}

/** この生で発火した出来事の刻印キー（counters） */
export const npcLifeDoneKey = (npcId: string, index: number): string =>
  `npc.done.${npcId}.${index}`;

/** その人の人生の印の旗キー（flags。npc.marry.npc.sado など。条件DSLから読める） */
export const npcLifeMarkFlag = (npcId: string, kind: NpcLifeEventKind): string =>
  `npc.${kind}.${npcId}`;

/** 退場の旗キー（flags。npc.gone.npc.garo —— 街に居ないことの印） */
export const npcLifeGoneFlag = (npcId: string): string => `npc.gone.${npcId}`;

/** 発火した出来事（step が npcEvent イベントに載せる素材） */
export interface NpcLifeFired {
  npcId: string;
  /** 定義の events 内の番号（done 刻印と対応） */
  index: number;
  kind: NpcLifeEventKind;
  /** 解決済みの表示名（ライバルは世界シードの抽選から） */
  name: string;
  /** {name} 置換済みの記事文 */
  text: string;
  /** 起きた日 */
  day: number;
}

/** 退場理由の表示用の種別（危機の leave/die も含む。記録画面・師匠一覧の印に使う） */
export type NpcGoneReason = "retire" | "depart" | "leave" | "die";

/**
 * その人物が街に居ないか（退場系の出来事か危機の離散・死亡）、あればその種別。
 * この生の flags と、世代をまたいだ世界の記録（crisis.log / npcGone）の両方を見る：
 * 前世で引退・死去した人物は次の代でも戻らない（世界は続いている）
 */
export function npcGoneReason(state: GameState, npcId: string): NpcGoneReason | null {
  // 危機の離散・死亡（crisis/index.ts の crisisNpcAbsent と同じ場所を読む。
  // 危機で失われた人も街には居ない —— 戻り値の型はそのまま表示語のキーになる）
  const crisisKind = state.crisis?.npcGone.find((n) => n.id === npcId)?.kind;
  if (crisisKind !== undefined) return crisisKind;
  // この生で起きた歳月の退場（flags）
  if (state.flags[npcLifeGoneFlag(npcId)] === true) {
    for (const kind of NPC_LIFE_GONE_KINDS) {
      if (state.flags[npcLifeMarkFlag(npcId, kind)] === true) return kind as NpcGoneReason;
    }
    return "depart";
  }
  // 前世の生で起きた退場（世界の記録。crisisState は carryover で残る）
  const goneKinds = new Set(NPC_LIFE_GONE_KINDS.map((k) => `${NPC_LIFE_LOG_PREFIX}${k}`));
  const entry = state.crisis?.log.find((l) => l.ref === npcId && goneKinds.has(l.kind));
  if (entry !== undefined) return entry.kind.slice(NPC_LIFE_LOG_PREFIX.length) as NpcGoneReason;
  return null;
}

/**
 * その人の人生に起きた印（結婚した・栄転した・引退した…）。
 * この生の flags と前世の世界の記録（crisis.log）の両方を読む。
 * 結婚・栄転の表示（街の声・新聞・記録）や、危機で亡くなった人の印の判定に使う
 */
export function npcLifeMark(state: GameState, npcId: string, kind: NpcLifeEventKind): boolean {
  if (state.flags[npcLifeMarkFlag(npcId, kind)] === true) return true;
  return (
    state.crisis?.log.some((l) => l.ref === npcId && l.kind === `${NPC_LIFE_LOG_PREFIX}${kind}`) ??
    false
  );
}

/**
 * その人物の歳月定義上の表示名を解決する（rival.<index> は name コールバックから。
 * 記事文の {name} 置換と、記録・新聞・街の声の表示に使う）
 */
export function npcLifeName(
  state: GameState,
  cfg: NpcLifeConfig | undefined,
  npcId: string,
): string {
  const via = cfg?.name?.(state, npcId);
  if (via !== undefined) return via;
  return cfg?.npcs.find((n) => n.npcId === npcId)?.name ?? npcId;
}

/**
 * 歳月の出来事の判定と発火（step の行動後フェーズで呼ぶ）。
 * 行動後の状態 —— 日またぎの結果の暦・行動の刻印（counters/flags）—— で
 * 各人物の未発火の出来事の `at` を評価し、満たしたものを発火させる。
 *
 * 発火では：
 * - done 刻印（counters）と人生の印（flags）・退場の印を立てる
 * - 世界の記録（crisis.log、あれば）に1行刻む（二度は発火しない冪等の根拠にもなる）
 * - 退場系なら、その人物を師とする弟子入りを解消する（師弟は街の中の関係なので、
 *   街を去った師に弟子入りし続けることはできない。秘伝フラグなど教わった刻印は残る）
 *
 * 評価は定義順。同じ人物の同じ出来事は二度発火しない（done 刻印＋世界の記録の2層）
 */
export function npcLifeEvents(
  state: GameState,
  cfg: NpcLifeConfig | undefined,
  time: TimeConfig,
  env?: CondEnv,
): { state: GameState; fired: NpcLifeFired[] } {
  const fired: NpcLifeFired[] = [];
  if (cfg === undefined) return { state, fired };
  let next = state;
  for (const npc of cfg.npcs) {
    // この世界に居ない人物（生成地方では canon の人物は居ない）は発火しない
    if (cfg.npcExists !== undefined && !cfg.npcExists(next, npc.npcId)) continue;
    if (npcGoneReason(next, npc.npcId) !== null) continue; // もう街に居ない
    for (let index = 0; index < npc.events.length; index++) {
      const ev = npc.events[index]!;
      if (next.counters[npcLifeDoneKey(npc.npcId, index)] !== undefined) continue;
      // 前世の生で起きた出来事（世界の記録に残っている）は再発火しない。
      // 同じ人物の同じ種類の出来事は定義上1件まで（validate で担保）
      const logKind = `${NPC_LIFE_LOG_PREFIX}${ev.kind}`;
      if (next.crisis?.log.some((l) => l.kind === logKind && l.ref === npc.npcId) === true) {
        continue;
      }
      if (!evaluate(ev.at, next, time, env)) continue;

      const day = next.time.day;
      const name = npcLifeName(next, cfg, npc.npcId);
      const text = ev.text.replaceAll("{name}", name);
      const flags: Record<string, boolean> = {
        ...next.flags,
        [npcLifeMarkFlag(npc.npcId, ev.kind)]: true,
      };
      const gone = NPC_LIFE_GONE_KINDS.includes(ev.kind);
      if (gone) flags[npcLifeGoneFlag(npc.npcId)] = true;
      for (const f of ev.setFlags ?? []) flags[f] = true;

      // 世界の記録に1行刻む（年代記・街の記録がそのまま拾う素材。
      // 危機の無い世界（crisis: null）では記録先が無い —— done 刻印と印だけが残る）
      let crisis = next.crisis;
      if (crisis !== null) {
        crisis = {
          ...crisis,
          log: [...crisis.log, { day, kind: logKind, ref: npc.npcId }],
        };
      }

      // 退場系：その人物を師とする弟子入りを解消する（師弟は街の中の関係）
      let mentor = next.mentor;
      if (gone && mentor !== null) {
        const def = cfg.mentors?.find((m) => m.id === mentor!.id);
        if (def?.npc === npc.npcId || (def?.npc === undefined && def?.id === npc.npcId)) {
          mentor = null;
          // 「いま師匠がいる」の印も消す（F-05：出来事の条件がこの旗を読む）
          flags["mentor.now"] = false;
        }
      }

      next = {
        ...next,
        counters: { ...next.counters, [npcLifeDoneKey(npc.npcId, index)]: day },
        flags,
        crisis,
        mentor,
      };
      fired.push({ npcId: npc.npcId, index, kind: ev.kind, name, text, day });
      if (gone) break; // その人はもう街に居ない —— この生での後続の出来事は起きない
    }
  }
  return { state: next, fired };
}

/** 今日起きた歳月の出来事（新聞・街の声・噂の材料。この生で発火したものだけ） */
export function npcLifeToday(state: GameState, cfg: NpcLifeConfig | undefined): NpcLifeFired[] {
  if (cfg === undefined) return [];
  const out: NpcLifeFired[] = [];
  for (const npc of cfg.npcs) {
    for (let index = 0; index < npc.events.length; index++) {
      const ev = npc.events[index]!;
      if (state.counters[npcLifeDoneKey(npc.npcId, index)] !== state.time.day) continue;
      const name = npcLifeName(state, cfg, npc.npcId);
      out.push({
        npcId: npc.npcId,
        index,
        kind: ev.kind,
        name,
        text: ev.text.replaceAll("{name}", name),
        day: state.time.day,
      });
    }
  }
  return out;
}

/**
 * 最近の歳月の出来事（噂が流れる期間内のものを新しい順に。この生で発火したものだけ。
 * days には balance.town.npcRumorDays を渡す）
 */
export function npcLifeRecent(
  state: GameState,
  cfg: NpcLifeConfig | undefined,
  days: number,
): NpcLifeFired[] {
  if (cfg === undefined) return [];
  const from = state.time.day - days;
  const out: NpcLifeFired[] = [];
  for (const npc of cfg.npcs) {
    for (let index = 0; index < npc.events.length; index++) {
      const ev = npc.events[index]!;
      const day = state.counters[npcLifeDoneKey(npc.npcId, index)];
      if (day === undefined || day <= from || day > state.time.day) continue;
      const name = npcLifeName(state, cfg, npc.npcId);
      out.push({
        npcId: npc.npcId,
        index,
        kind: ev.kind,
        name,
        text: ev.text.replaceAll("{name}", name),
        day,
      });
    }
  }
  return out.sort((a, b) => b.day - a.day);
}

/**
 * 歳月の記録（年代記・街の記録が拾う世界の出来事の行）。
 * 危機由来の npc.leave / npc.die も含む —— 「人物の物語の記録」として同じ帳面に載る。
 * ref（npc.* / rival.<index>）→ 表示名の解決は表示側が行う
 */
export function npcLifeLog(state: GameState): { day: number; kind: string; ref?: string }[] {
  return (
    state.crisis?.log.filter(
      (l) => l.kind.startsWith(NPC_LIFE_LOG_PREFIX) && l.ref !== undefined,
    ) ?? []
  );
}
