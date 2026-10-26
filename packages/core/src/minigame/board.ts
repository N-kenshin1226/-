import { ctxRng, type MiniGame, type MiniGameCtx } from "./types.js";

/**
 * 盤面推理エンジン（03 §2「マスを開ける・並べる」）。
 * 隠れた鉱脈・岩・空地の盤面を1マスずつ開く。
 * 空地は「半径 r 以内の鉱脈数」のヒントを返す。岩を開くと盤面は崩れて終了。
 * スキルはヒントの半径を広げる（勝率ではなく情報量）。
 */

export interface BoardConfig {
  width: number;
  height: number;
  oreCount: number;
  rockCount: number;
  /** 1鉱石あたりの品質 */
  oreQuality: number;
  /** ヒント半径 = base + floor(skill × perSkill) */
  hintRadiusBase: number;
  hintRadiusPerSkill: number;
}

export type CellKind = "ore" | "rock" | "empty";
export interface Cell {
  kind: CellKind;
  revealed: boolean;
}

export interface BoardState {
  width: number;
  height: number;
  cells: Cell[];
  hintRadius: number;
  /** 最後に開けた空地のヒント（その場で計算して持つ） */
  lastHint: number | null;
  ores: number;
  oresTotal: number;
  rocksHit: number;
  done: boolean;
}

export interface BoardInput {
  x: number;
  y: number;
}

export interface BoardResult {
  /** 集めた鉱石数 */
  ores: number;
  oresTotal: number;
  /** 品質（鉱石数 × oreQuality、岩で半減） */
  quality: number;
  rocksHit: number;
  cleared: boolean;
}

export function boardEngine(cfg: BoardConfig): MiniGame<BoardInput, BoardState, BoardResult> {
  const at = (s: BoardState, x: number, y: number) => s.cells[y * s.width + x];

  function init(ctx: MiniGameCtx): BoardState {
    const rng = ctxRng(ctx, "board");
    const cells: Cell[] = Array.from({ length: cfg.width * cfg.height }, () => ({
      kind: "empty" as CellKind,
      revealed: false,
    }));
    const place = (kind: CellKind, n: number) => {
      let placed = 0;
      while (placed < n) {
        const i = rng.int(0, cells.length - 1);
        if (cells[i]!.kind === "empty") {
          cells[i] = { kind, revealed: false };
          placed++;
        }
      }
    };
    place("ore", cfg.oreCount);
    place("rock", cfg.rockCount);
    return {
      width: cfg.width,
      height: cfg.height,
      cells,
      hintRadius: cfg.hintRadiusBase + Math.floor(ctx.skill * cfg.hintRadiusPerSkill),
      lastHint: null,
      ores: 0,
      oresTotal: cfg.oreCount,
      rocksHit: 0,
      done: false,
    };
  }

  function hintCount(s: BoardState, x: number, y: number): number {
    let n = 0;
    const r = s.hintRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx === 0 && dy === 0) continue;
        const c = at(s, x + dx, y + dy);
        if (c?.kind === "ore") n++;
      }
    }
    return n;
  }

  return {
    init,
    tick(state, input) {
      if (state.done) return state;
      const cell = at(state, input.x, input.y);
      if (!cell || cell.revealed) return state;
      const cells = [...state.cells];
      cells[input.y * state.width + input.x] = { ...cell, revealed: true };
      const next: BoardState = { ...state, cells, lastHint: null };
      if (cell.kind === "rock") {
        next.rocksHit++;
        next.done = true;
      } else if (cell.kind === "ore") {
        next.ores++;
        next.done = next.ores >= next.oresTotal;
      } else {
        next.lastHint = hintCount(state, input.x, input.y);
        // 空地・鉱石をすべて開いたら終了
        next.done = cells.every((c) => c.kind === "rock" || c.revealed);
      }
      return next;
    },
    result(state) {
      const base = state.ores * cfg.oreQuality;
      return {
        ores: state.ores,
        oresTotal: state.oresTotal,
        quality: state.rocksHit > 0 ? Math.floor(base / 2) : base,
        rocksHit: state.rocksHit,
        cleared: state.ores >= state.oresTotal && state.rocksHit === 0,
      };
    },
    autoplay(ctx) {
      // 「上手い人」の入力列：同じシードなら盤面が再現できるので、
      // 鉱脈の座標をすべて掘る列を生成する（簡易判定の係数は呼び出し側）
      const s = init(ctx);
      const inputs: BoardInput[] = [];
      for (let y = 0; y < s.height; y++) {
        for (let x = 0; x < s.width; x++) {
          if (at(s, x, y)!.kind === "ore") inputs.push({ x, y });
        }
      }
      return inputs;
    },
  };
}
