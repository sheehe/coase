import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';

import { pixiBinaryPath } from './paths';

export interface PixiRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  /** 超时（毫秒）。默认不设；--version 这类轻操作由上层传 5000 足矣。 */
  timeoutMs?: number;
  /** 按行喂 stdout。长跑任务（pixi install）用来实时推日志给 UI。不影响 result.stdout。 */
  onStdoutLine?: (line: string) => void;
  /** 按行喂 stderr。pixi 的下载进度多半走 stderr，所以这个比 stdout 回调更常用。 */
  onStderrLine?: (line: string) => void;
}

export interface PixiRunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/**
 * spawn pixi 二进制。不做业务封装，纯工具函数：拿 stdout/stderr + 退出码回来。
 * 二进制找不到会直接抛——由调用者决定提示用户"pnpm fetch-pixi"还是走安装向导。
 */
export function runPixi(args: readonly string[], options: PixiRunOptions = {}): Promise<PixiRunResult> {
  const bin = pixiBinaryPath();
  if (!existsSync(bin)) {
    return Promise.reject(
      new Error(
        `[pixi] 找不到二进制 ${bin}。` +
          `开发态请先运行 \`pnpm fetch-pixi\`；打包态说明 extraResources 没配对或产物构建缺失。`,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const spawnOpts: SpawnOptions = {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      signal: options.signal,
    };
    const child = spawn(bin, [...args], spawnOpts);

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = options.timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill('SIGTERM');
          reject(new Error(`[pixi] 执行超时 (${options.timeoutMs}ms): pixi ${args.join(' ')}`));
        }, options.timeoutMs)
      : null;

    // 按行切分喂给回调。pixi 一次 data 事件可能拖着半行末尾，留到下次再拼。
    // 不做复杂 ANSI 剔除——调用方（install 流程）已经通过 env NO_COLOR=1 关掉了颜色。
    let stdoutBuf = '';
    let stderrBuf = '';
    const flushLines = (
      buf: string,
      cb: ((line: string) => void) | undefined,
      final = false,
    ): string => {
      if (!cb) return '';
      const parts = buf.split(/\r?\n/);
      const tail = final ? '' : (parts.pop() ?? '');
      for (const line of parts) {
        if (line.length > 0) cb(line);
      }
      return tail;
    };

    child.stdout?.on('data', (chunk) => {
      const s = String(chunk);
      stdout += s;
      if (options.onStdoutLine) {
        stdoutBuf = flushLines(stdoutBuf + s, options.onStdoutLine);
      }
    });
    child.stderr?.on('data', (chunk) => {
      const s = String(chunk);
      stderr += s;
      if (options.onStderrLine) {
        stderrBuf = flushLines(stderrBuf + s, options.onStderrLine);
      }
    });

    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      // 把行 buffer 里残余那半截吐出去，避免最后一行被吞。
      stdoutBuf = flushLines(stdoutBuf, options.onStdoutLine, true);
      stderrBuf = flushLines(stderrBuf, options.onStderrLine, true);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

/**
 * 取 pixi 自身的版本字符串（例如 "pixi 0.67.0"）。
 * 任何失败（找不到二进制、非零退出、超时）都会抛——用于启动时 smoke test 和
 * 后续 RuntimeManager 的自检。
 */
export async function getPixiVersion(): Promise<string> {
  const result = await runPixi(['--version'], { timeoutMs: 5000 });
  if (result.code !== 0) {
    throw new Error(
      `[pixi] --version 退出码 ${result.code} (signal=${result.signal ?? 'none'}): ${
        result.stderr.trim() || result.stdout.trim() || '<no output>'
      }`,
    );
  }
  const line = (result.stdout || result.stderr).trim().split(/\r?\n/)[0]?.trim();
  if (!line) {
    throw new Error('[pixi] --version 输出为空');
  }
  return line;
}
