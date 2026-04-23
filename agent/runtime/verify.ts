// 研究环境 self-check：pixi install 返回 0 只代表 conda-meta 写入成功，不代表
// 磁盘上所有 DLL/so 都在、PATH 激活后 R 能真的启动。历史踩过的坑：
//   - macOS 路径含空格导致 R shell wrapper 第 4 行解析失败
//   - Windows 下 mingw 的 libgcc_s_seh-1.dll 被杀毒软件隔离，安装状态显示成功
//     但 agent 跑 Rscript 立即报 "stats.dll 加载失败"
// 有了 self-check，安装流程会在"拿到真实 Rscript 输出"这一步才置 ready，
// 让 agent 永远看不到"看似装好但跑不起来"的假 ready 状态。

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { buildRuntimeEnv, researchEnvRoot } from './env';

export interface VerifyResult {
  ok: boolean;
  /** 失败时：R 的 stderr / 启动失败原因；成功时 undefined。 */
  errorDetail?: string;
  /** 诊断信息：R 版本、R_HOME。成功/失败都会填一行。 */
  diagnostics?: string;
}

// 只验证 base 包：stats / utils / methods / grDevices。这几个加载失败
// 基本覆盖了 "R.dll 本体加载不了"、"mingw 运行时 DLL 缺失"、"Fortran/BLAS
// 依赖坏了"、"路径含空格" 四类典型故障，再多验证也只是累赘。
const VERIFY_SCRIPT = [
  'cat("R:", R.version.string, "\\n", sep="")',
  'cat("R_HOME:", R.home(), "\\n", sep="")',
  'tryCatch({',
  '  invisible(library(stats))',
  '  invisible(library(utils))',
  '  invisible(library(methods))',
  '  invisible(library(grDevices))',
  '  cat("VERIFY_OK\\n")',
  '}, error = function(e) {',
  '  cat("VERIFY_FAIL:", conditionMessage(e), "\\n", file=stderr())',
  '  quit(status=1)',
  '})',
].join('; ');

function rscriptPath(): string {
  const root = researchEnvRoot();
  return process.platform === 'win32'
    ? join(root, 'Scripts', 'Rscript.exe')
    : join(root, 'bin', 'Rscript');
}

export async function verifyResearchEnv(timeoutMs = 30_000): Promise<VerifyResult> {
  const bin = rscriptPath();
  if (!existsSync(bin)) {
    return {
      ok: false,
      errorDetail: `[verify] 找不到 Rscript：${bin}`,
    };
  }

  return new Promise<VerifyResult>((resolve) => {
    const child = spawn(bin, ['-e', VERIFY_SCRIPT], {
      env: buildRuntimeEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      resolve({
        ok: false,
        errorDetail: `[verify] Rscript 执行超时 (${timeoutMs}ms)，可能被杀毒软件挂起。`,
      });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        errorDetail: `[verify] spawn Rscript 失败：${err.message}`,
      });
    });

    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const diagnostics = extractDiagnostics(stdout);
      const ok = code === 0 && stdout.includes('VERIFY_OK');
      if (ok) {
        resolve({ ok: true, diagnostics });
        return;
      }

      // 失败路径：先看 stderr，没有再 fallback 到 stdout / 退出码。
      // 典型 Windows DLL 缺失输出："由于找不到 xxx.dll，无法继续执行代码"
      //   → 系统错误弹窗的文案会走 stderr，stderr 含 .dll 关键字我们直接透传。
      const detail = [
        `[verify] Rscript 退出码 ${code} (signal=${signal ?? 'none'})`,
        stderr.trim() || stdout.trim() || '<no output>',
      ].join('\n');
      resolve({ ok: false, errorDetail: detail.slice(-2000), diagnostics });
    });
  });
}

function extractDiagnostics(stdout: string): string | undefined {
  const lines = stdout.split(/\r?\n/).filter((l) => l.startsWith('R:') || l.startsWith('R_HOME:'));
  return lines.length > 0 ? lines.join(' · ') : undefined;
}
