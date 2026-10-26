import { ctxRng, type MiniGame, type MiniGameCtx } from "./types.js";

/**
 * 駆け引きエンジン（03 §2「カード・選択」）。
 * 論点カードを1枚ずつ出し合うラウンド制。話題には三すくみの相性がある。
 * スキルは「手札の上限」と「相手の次の論点の予告数」を増やす（03 §2 表）。
 */

export interface DealTopic {
  id: string;
  /** この話題が強い相手の話題ID */
  beats: string;
}

export interface DealCard {
  topic: string;
  power: number;
}

export interface DealConfig {
  topics: DealTopic[];
  /** 自分の手札枚数 = base + floor(skill × perSkill) */
  handSizeBase: number;
  handSizePerSkill: number;
  /** 相手の次の手の予告数 = base + floor(skill × perSkill) */
  previewBase: number;
  previewPerSkill: number;
  /** 相性が取れたときの威力倍率 */
  counterFactor: number;
  /** 双方の耐久値 */
  hp: number;
  /** 山札の枚数（互いに） */
  deckSize: number;
}

export interface DealInput {
  /** 手札の index */
  hand: number;
}

export interface DealState {
  hand: DealCard[];
  /** 相手の山札（末尾からめくる）。予告は先頭側から見せる */
  opponentDeck: DealCard[];
  /** 予告として見えている相手の次の手 */
  preview: DealCard[];
  playerHp: number;
  opponentHp: number;
  round: number;
  done: boolean;
  won: boolean | null;
}

export interface DealResult {
  won: boolean;
  rounds: number;
  playerHp: number;
  opponentHp: number;
}

function drawDeck(ctx: MiniGameCtx, cfg: DealConfig, label: string): DealCard[] {
  const rng = ctxRng(ctx, label);
  return Array.from({ length: cfg.deckSize }, () => ({
    topic: rng.pick(cfg.topics).id,
    power: rng.int(1, 3),
  }));
}

function effective(card: DealCard, against: DealCard, cfg: DealConfig): number {
  const topic = cfg.topics.find((t) => t.id === card.topic);
  return Math.round(card.power * (topic?.beats === against.topic ? cfg.counterFactor : 1));
}

export function dealEngine(cfg: DealConfig): MiniGame<DealInput, DealState, DealResult> {
  const previewOf = (deck: DealCard[], ctx: MiniGameCtx) =>
    deck.slice(0, cfg.previewBase + Math.floor(ctx.skill * cfg.previewPerSkill));

  return {
    init(ctx) {
      const rng = ctxRng(ctx, "deal");
      const deck = drawDeck(ctx, cfg, "deal-player");
      const handSize = cfg.handSizeBase + Math.floor(ctx.skill * cfg.handSizePerSkill);
      const hand = deck.slice(0, handSize);
      const opponentDeck = drawDeck(ctx, cfg, "deal-opponent");
      void rng;
      return {
        hand,
        opponentDeck,
        preview: previewOf(opponentDeck, ctx),
        playerHp: cfg.hp,
        opponentHp: cfg.hp,
        round: 0,
        done: false,
        won: null,
      };
    },
    tick(state, input) {
      if (state.done) return state;
      const card = state.hand[input.hand];
      const opponent = state.opponentDeck[0];
      if (!card) return state;
      const hand = state.hand.filter((_, i) => i !== input.hand);
      const opponentDeck = state.opponentDeck.slice(1);
      let playerHp = state.playerHp;
      let opponentHp = state.opponentHp;
      if (opponent) {
        opponentHp -= effective(card, opponent, cfg);
        playerHp -= effective(opponent, card, cfg);
      } else {
        // 相手の手が尽きた：一方的に出せる
        opponentHp -= card.power;
      }
      const done =
        opponentHp <= 0 || playerHp <= 0 || (hand.length === 0 && opponentDeck.length === 0);
      return {
        ...state,
        hand,
        opponentDeck,
        preview: opponentDeck.slice(0, state.preview.length),
        playerHp,
        opponentHp,
        round: state.round + 1,
        done,
        won: done ? opponentHp <= 0 || playerHp > opponentHp : null,
      };
    },
    result(state) {
      return {
        won: state.won === true,
        rounds: state.round,
        playerHp: state.playerHp,
        opponentHp: state.opponentHp,
      };
    },
    autoplay(ctx) {
      // 貪欲：予告されている相手の次の手に、相性の取れる最大威力の札を選ぶ
      const s = this.init(ctx);
      const inputs: DealInput[] = [];
      let cur = s;
      while (!cur.done) {
        const next = cur.opponentDeck[0];
        let best = 0;
        let bestPow = -1;
        cur.hand.forEach((c, i) => {
          const p = next ? effective(c, next, cfg) : c.power;
          if (p > bestPow) {
            bestPow = p;
            best = i;
          }
        });
        inputs.push({ hand: best });
        cur = this.tick(cur, { hand: best });
      }
      return inputs;
    },
  };
}
