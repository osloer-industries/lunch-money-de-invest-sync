import * as pty from "node-pty";
import { stripAnsi } from "./ansi.js";

export interface PtyRunOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly cols?: number;
  readonly rows?: number;
}

export interface PtyRunResult {
  readonly exitCode: number;
  readonly output: string;
}

export class PtySession {
  private readonly rawChunks: string[] = [];
  private readonly proc: pty.IPty;
  private exitCode: number | null = null;
  private settled = false;

  private constructor(proc: pty.IPty) {
    this.proc = proc;
    proc.onData((data) => {
      this.rawChunks.push(data);
    });
    proc.onExit(({ exitCode }) => {
      this.exitCode = exitCode;
      this.settled = true;
    });
  }

  static start(command: string, args: readonly string[], options: PtyRunOptions): PtySession {
    const proc = pty.spawn(command, [...args], {
      name: "xterm-color",
      cols: options.cols ?? 120,
      rows: options.rows ?? 40,
      cwd: options.cwd,
      env: { ...options.env, TERM: "xterm-color" } as { [key: string]: string },
    });
    return new PtySession(proc);
  }

  get text(): string {
    return stripAnsi(this.rawChunks.join(""));
  }

  write(input: string): void {
    this.proc.write(input);
  }

  sendEnter(): void {
    this.write("\r");
  }

  sendLine(line: string): void {
    this.write(`${line}\r`);
  }

  sendYes(): void {
    this.write("y\r");
  }

  sendNo(): void {
    this.write("n\r");
  }

  async waitFor(pattern: RegExp, timeoutMs: number): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (pattern.test(this.text)) {
        return;
      }
      if (this.settled) {
        break;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for ${pattern.toString()} in PTY output:\n${this.text.slice(-4000)}`,
    );
  }

  async finish(timeoutMs: number): Promise<PtyRunResult> {
    const started = Date.now();
    while (!this.settled && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
    if (!this.settled) {
      this.proc.kill();
    }
    return { exitCode: this.exitCode ?? 1, output: this.text };
  }
}

export function npmCliArgs(script: string, extraArgs: readonly string[] = []): string[] {
  return ["run", script, "--", ...extraArgs];
}