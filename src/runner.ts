import { spawn } from 'node:child_process';

export interface CommandResult {
  exitCode: number | null;
  timedOut: boolean;
  outputTail: string;
  durationMs: number;
}

/**
 * Trust boundary for shell execution: `command` must come only from the
 * operator-owned config file (the suite commands in config), never from model
 * output. The only model-supplied part is the test-name filter, which callers
 * pass shell-quoted via shellQuote so it stays one argument and cannot inject
 * shell commands. spawn keeps shell:true because suite commands are shell
 * strings from operator-owned config; switching to shell:false is a redesign
 * of how suites are configured, not a one-line hardening.
 *
 * Run a shell command, keep the last ~4 KB of output, and kill it if it runs too long.
 */
export function runCommand(command: string, cwd: string, timeoutSeconds: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, { cwd, shell: true, env: { ...process.env, CI: process.env.CI ?? '1' } });
    let output = '';
    const keep = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutSeconds * 1000);

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, timedOut, outputTail: output, durationMs: Date.now() - started });
    });
  });
}

/** Quote a user-supplied filter so it is passed as one argument and cannot inject shell commands. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
