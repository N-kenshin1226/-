import { createInterface } from "node:readline";

/**
 * CLI の入出力を抽象化する。
 * 実機は stdin/stdout、テストは入力列を流し込んで出力を回収する。
 */
export interface CliIo {
  /** 1行出力する（末尾に改行を付ける） */
  write(text: string): void;
  /** 1行入力を返す。EOF/中断なら null */
  read(): Promise<string | null>;
}

/** 標準入出力につなぐ実機用の IO */
export function stdioIo(): CliIo {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const buffered: string[] = [];
  const waiters: ((line: string | null) => void)[] = [];
  let closed = false;
  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else buffered.push(line);
  });
  rl.on("close", () => {
    closed = true;
    for (const w of waiters.splice(0)) w(null);
  });
  return {
    write: (text) => process.stdout.write(text + "\n"),
    read: () =>
      new Promise((resolve) => {
        const line = buffered.shift();
        if (line !== undefined) resolve(line);
        else if (closed) resolve(null);
        else waiters.push(resolve);
      }),
  };
}

/** テスト用：決められた入力行を順に返し、出力を全部記録する */
export function scriptedIo(lines: readonly string[]): { io: CliIo; output: string[] } {
  const queue = [...lines];
  const output: string[] = [];
  return {
    output,
    io: {
      write: (text) => output.push(text),
      read: () => Promise.resolve(queue.shift() ?? null),
    },
  };
}
