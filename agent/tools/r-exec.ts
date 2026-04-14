// r_exec 工具：在本地子进程中执行一段 R 代码并收集 stdout/stderr。
//
// 与 v1（Docker 隔离 + 熔断器 + 探针校验）相比，Phase 1 POC 刻意做最小实现：
//   - 直接 spawn 系统 Rscript（依赖用户本地已安装 R）
//   - 超时 kill
//   - OOM 关键词检测
//   - R 启动噪声过滤（"Attaching package" 等）
//
// Phase 2/3 会考虑加回沙箱、资源限制、脚本目录持久化等。

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const OOM_PATTERNS: RegExp[] = [
  /cannot allocate vector of size/i,
  /cannot allocate memory/i,
  /std::bad_alloc/i,
  /out of memory/i,
  /memory not mapped/i,
  /killed\s*$/im,
];

const NOISE_PATTERNS: RegExp[] = [
  /^\s*Loading required package:/,
  /^\s*Attaching package:/,
  /^\s*The following objects? (are|is) masked/,
  /^\s*following object is masked/,
  /^\s*Registered S3 method/,
];

function filterNoise(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !NOISE_PATTERNS.some((p) => p.test(line)))
    .join('\n');
}

function detectOom(...streams: string[]): boolean {
  const combined = streams.join('\n');
  return OOM_PATTERNS.some((p) => p.test(combined));
}

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  spawnError?: string;
}

function runRscript(scriptPath: string, timeoutSeconds: number, cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const rCmd = process.platform === 'win32' ? 'Rscript.exe' : 'Rscript';
    const child = spawn(rCmd, ['--vanilla', scriptPath], {
      cwd,
      env: { ...process.env, LANG: 'en_US.UTF-8', R_LIBS_USER: process.env.R_LIBS_USER ?? '' },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let spawnError: string | undefined;
    let settled = false;

    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutSeconds * 1000);

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf-8');
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf-8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      spawnError = err.message;
      resolve({ stdout, stderr, exitCode: null, signal: null, timedOut, spawnError });
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve({ stdout, stderr, exitCode: code, signal, timedOut });
    });
  });
}

export const rExecTool = tool(
  'r_exec',
  '在本地执行一段 R 代码并返回 stdout / stderr。用途：数据探索、描述性统计、回归模型估计。需要用户本地已安装 R（Rscript 可在 PATH 中被找到）。不允许访问网络。',
  {
    code: z.string().min(1).describe('要执行的 R 代码，可多行'),
    timeout_seconds: z
      .number()
      .int()
      .min(1)
      .max(600)
      .default(120)
      .describe('执行超时（秒），默认 120，最大 600'),
  },
  async ({ code, timeout_seconds }) => {
    const dir = await mkdtemp(join(tmpdir(), 'coase-r-'));
    const scriptPath = join(dir, 'script.R');
    await writeFile(scriptPath, code, 'utf-8');

    try {
      const result = await runRscript(scriptPath, timeout_seconds, dir);
      const cleanStdout = filterNoise(result.stdout).trimEnd();
      const cleanStderr = filterNoise(result.stderr).trimEnd();
      const oom = detectOom(result.stdout, result.stderr);

      const header: string[] = [];
      header.push(`exit_code: ${result.exitCode ?? 'null'}`);
      if (result.signal) header.push(`signal: ${result.signal}`);
      if (result.timedOut) header.push(`timed_out: true (> ${timeout_seconds}s)`);
      if (oom) header.push('oom_detected: true');
      if (result.spawnError) header.push(`spawn_error: ${result.spawnError}`);

      const parts: string[] = [header.join('\n')];
      if (cleanStdout) parts.push('--- stdout ---', cleanStdout);
      if (cleanStderr) parts.push('--- stderr ---', cleanStderr);
      if (!cleanStdout && !cleanStderr) parts.push('(没有输出)');

      const isError =
        result.spawnError !== undefined ||
        result.timedOut ||
        oom ||
        (result.exitCode !== null && result.exitCode !== 0);

      return {
        content: [{ type: 'text' as const, text: parts.join('\n') }],
        isError,
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {
        /* 忽略清理错误 */
      });
    }
  },
);
