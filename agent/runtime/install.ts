import { EventEmitter } from 'node:events';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';

import { app } from 'electron';

import type { RuntimeInstallState, RuntimeSnapshot } from '../../shared/ipc';

import { researchEnvExists, researchEnvRoot } from './env';
import { pixiBinaryPath, runtimeManagerResourcesDir, runtimeUserDir } from './paths';
import { runPixi } from './pixi';
import { verifyResearchEnv } from './verify';

// 状态机定义挪到 shared/ipc.ts 作为 single source of truth，这里只用别名。
// 状态说明：
//   unknown       尚未检测（冷启一瞬）
//   not_installed fs 检测不到 conda-meta，等用户点"安装"
//   installing    pixi install 进行中
//   ready         研究环境可用
//   error         上一次安装失败 / pixi 二进制缺失

// 最近 N 行 pixi 输出。pixi 下载时吐几千行很正常；50 行够 UI 展示滚动窗口，
// 又不会把 IPC 通道淹掉。
const LOG_TAIL_SIZE = 50;
// 广播节流：安装中日志刷太快时，别每行都推一次 IPC，合并成 100ms 一批。
const BROADCAST_THROTTLE_MS = 100;

class RuntimeInstallManager extends EventEmitter {
  private state: RuntimeInstallState = 'unknown';
  private message: string | undefined;
  private errorDetail: string | undefined;
  private logs: string[] = [];
  /** 节流：pending 的 broadcast 计时器。 */
  private pendingBroadcast: NodeJS.Timeout | null = null;
  /** 有没有尚未推出去的 snapshot 改动。 */
  private dirty = false;
  /**
   * install() 幂等：多次触发只有第一次真的 spawn pixi，其他调用复用同一个 Promise。
   * 防用户连点两下"安装"按钮导致两个 pixi 进程打架。
   */
  private currentRun: Promise<RuntimeSnapshot> | null = null;

  snapshot(): RuntimeSnapshot {
    return {
      state: this.state,
      rootDir: researchEnvRoot(),
      message: this.message,
      logsTail: [...this.logs],
      errorDetail: this.errorDetail,
    };
  }

  onChange(listener: (snapshot: RuntimeSnapshot) => void): () => void {
    this.on('change', listener);
    return () => this.off('change', listener);
  }

  /** 只做 fs 检测。不跑 pixi --version（那是 P1 启动自检的事）。 */
  detect(): RuntimeSnapshot {
    this.state = researchEnvExists() ? 'ready' : 'not_installed';
    this.message = undefined;
    this.errorDetail = undefined;
    this.broadcast(true);
    return this.snapshot();
  }

  /**
   * 启动时一次性体检：pixi 二进制在不在 + 环境目录存不存在。
   * 二进制都没有是硬错——说明打包漏了 extraResources，再怎么重试也不会好。
   */
  probeOnBoot(): RuntimeSnapshot {
    if (!existsSync(pixiBinaryPath())) {
      this.state = 'error';
      this.message = `找不到 pixi 二进制：${pixiBinaryPath()}`;
      this.errorDetail =
        '打包缺少 resources/runtime-manager/bin/<platform>/pixi，或 extraResources 配置漏了。';
      this.broadcast(true);
      return this.snapshot();
    }
    return this.detect();
  }

  async install(): Promise<RuntimeSnapshot> {
    if (this.currentRun) return this.currentRun;

    // dev 态下 researchEnvRoot 指向 template/.pixi/envs/default，是仓库内产物，
    // 不该被 UI 流程去重装。如果已经存在直接返回 ready；不存在就真的装一次。
    if (!app.isPackaged && researchEnvExists()) {
      this.state = 'ready';
      this.message = '开发态：已复用 template/.pixi 下的现成环境。';
      this.broadcast(true);
      return this.snapshot();
    }

    this.currentRun = this.runInstall().finally(() => {
      this.currentRun = null;
    });
    return this.currentRun;
  }

  private async runInstall(): Promise<RuntimeSnapshot> {
    this.state = 'installing';
    this.message = '准备安装目录…';
    this.errorDetail = undefined;
    this.logs = [];
    this.broadcast(true);

    try {
      const workDir = ensureRuntimeFiles();
      this.message = `pixi install --locked @ ${workDir}`;
      this.broadcast(true);

      // --locked：要求 pixi.lock 与 pixi.toml 一致，防 pixi 静默重解到别的版本。
      // NO_COLOR/TERM=dumb/CLICOLOR=0：关 ANSI，让进度条退化成普通日志行。
      const result = await runPixi(['install', '--locked'], {
        cwd: workDir,
        env: {
          ...process.env,
          NO_COLOR: '1',
          TERM: 'dumb',
          CLICOLOR: '0',
        },
        onStdoutLine: (line) => this.appendLog(line),
        onStderrLine: (line) => this.appendLog(line),
      });

      if (result.code === 0 && researchEnvExists()) {
        const patchNote = patchRShellWrapper();
        if (patchNote) this.appendLog(patchNote);

        const mingwNote = patchWindowsMingwDlls();
        if (mingwNote) this.appendLog(mingwNote);

        // conda-meta 就位不等于 R 真能跑起来——mingw DLL 被杀毒吞、路径含空格、
        // 磁盘写入中途坏、BLAS/LAPACK 结构不一致，都会在这一步才暴露。
        this.message = '校验研究环境（Rscript library(stats) 自检）…';
        this.broadcast(true);
        const verify = await verifyResearchEnv();
        if (verify.diagnostics) this.appendLog(`[verify] ${verify.diagnostics}`);
        if (!verify.ok) {
          this.state = 'error';
          this.message = '环境安装完成但 R 自检失败，详见错误信息。';
          this.errorDetail = [
            verify.errorDetail ?? '<no detail>',
            '',
            '常见原因：',
            '1) 杀毒软件（360/火绒/Defender）把 libgcc_s_seh-1.dll / libgfortran-5.dll',
            '   等 mingw 运行时 DLL 隔离了——加白名单后重装运行时即可。',
            '2) macOS 用户目录含空格导致 R shell wrapper 解析失败——如果你是 macOS，',
            '   请反馈我们，这是已知路径处理逻辑没覆盖到的情况。',
            '3) pixi install 过程中网络/磁盘中断——完全卸载后重装。',
          ].join('\n');
          this.broadcast(true);
          return this.snapshot();
        }

        this.state = 'ready';
        this.message = '研究环境安装完成。';
        this.broadcast(true);
        return this.snapshot();
      }

      this.state = 'error';
      this.message = '安装失败，请检查日志后重试。';
      this.errorDetail = [
        `pixi install 退出码 ${result.code} (signal=${result.signal ?? 'none'})`,
        (result.stderr.trim() || result.stdout.trim() || '<no output>').slice(-4000),
      ].join('\n');
      this.broadcast(true);
      return this.snapshot();
    } catch (err) {
      this.state = 'error';
      this.message = '安装异常终止。';
      this.errorDetail = err instanceof Error ? (err.stack ?? err.message) : String(err);
      this.broadcast(true);
      return this.snapshot();
    }
  }

  private appendLog(line: string): void {
    // 空行忽略，避免 UI 里滚一堆空白。
    if (!line.trim()) return;
    this.logs.push(line);
    while (this.logs.length > LOG_TAIL_SIZE) this.logs.shift();
    this.broadcast(false);
  }

  /**
   * 节流广播：状态切换（immediate=true）立即推；日志追加攒到 100ms 一批。
   * 避免 pixi 下载时每秒几百行日志把 IPC 打爆。
   */
  private broadcast(immediate: boolean): void {
    if (immediate) {
      if (this.pendingBroadcast) {
        clearTimeout(this.pendingBroadcast);
        this.pendingBroadcast = null;
      }
      this.dirty = false;
      this.emit('change', this.snapshot());
      return;
    }
    this.dirty = true;
    if (this.pendingBroadcast) return;
    this.pendingBroadcast = setTimeout(() => {
      this.pendingBroadcast = null;
      if (!this.dirty) return;
      this.dirty = false;
      this.emit('change', this.snapshot());
    }, BROADCAST_THROTTLE_MS);
  }
}

export const runtimeInstallManager = new RuntimeInstallManager();

/**
 * 把 template/pixi.toml + pixi.lock 复制到 <userData>/runtime/（若未存在）。
 * 不复制 .pixi/——环境是 pixi install 解出来的，不是拷贝出来的。
 * 返回最终的 workDir（dev 态即 template/，打包态即 userData/runtime/）。
 */
export function ensureRuntimeFiles(): string {
  const dest = runtimeUserDir();
  if (!app.isPackaged) {
    // dev 态 runtimeUserDir 就是 template/，源文件已在位，啥都不干。
    return dest;
  }

  mkdirSync(dest, { recursive: true });
  const srcDir = join(runtimeManagerResourcesDir(), 'template');
  for (const name of ['pixi.toml', 'pixi.lock']) {
    const src = join(srcDir, name);
    const dst = join(dest, name);
    if (!existsSync(src)) {
      throw new Error(
        `[runtime] 缺少 ${src}——extraResources 没把 template/ 打进来，检查 electron-builder 配置。`,
      );
    }
    if (!existsSync(dst)) {
      copyFileSync(src, dst);
    }
    // 已存在：不覆盖。P7 的 reset 流程才会 rm -rf 整个 runtimeUserDir 后重走。
  }
  return dest;
}

// conda r-base 在 macOS/Linux 下的 R shell wrapper（lib/R/bin/R）前几行长这样：
//   R_HOME_DIR=/Users/x/Library/Application Support/coase/.../lib/R
//   R_SHARE_DIR=...
//   R_INCLUDE_DIR=...
//   R_DOC_DIR=...
// RHS 没加引号，一旦路径含空格（macOS userData 必含 "Application Support"），
// shell 会把空格后半截当命令执行，整个 R 立即启动失败。
// 这里在 pixi install 成功后给这四条赋值补上双引号。Windows 的 R 是 .exe
// 不走 shell，跳过；幂等（已带引号的不动）。
const R_DIR_VARS = ['R_HOME_DIR', 'R_SHARE_DIR', 'R_INCLUDE_DIR', 'R_DOC_DIR'];

function patchRShellWrapper(): string | null {
  if (process.platform === 'win32') return null;
  const rScript = join(researchEnvRoot(), 'lib', 'R', 'bin', 'R');
  if (!existsSync(rScript)) return null;

  let content: string;
  try {
    content = readFileSync(rScript, 'utf8');
  } catch (err) {
    return `[runtime] 读取 R wrapper 失败，跳过空格补丁：${(err as Error).message}`;
  }

  let patched = content;
  const fixed: string[] = [];
  for (const name of R_DIR_VARS) {
    // ^VAR=  (RHS 首字符不是 " 或 ')  (到行尾，不吞 \r\n)
    const re = new RegExp(`^(${name}=)(?!["'])([^\\r\\n]+)$`, 'm');
    patched = patched.replace(re, (_, prefix: string, value: string) => {
      fixed.push(name);
      return `${prefix}"${value}"`;
    });
  }

  if (fixed.length === 0) return null;

  try {
    writeFileSync(rScript, patched, 'utf8');
  } catch (err) {
    return `[runtime] R wrapper 补丁写回失败：${(err as Error).message}`;
  }
  return `[runtime] 已为 R wrapper 加引号修复含空格路径：${fixed.join(', ')}`;
}

// Windows 用户若装了 Git Bash / MSYS2 / MinGW / Strawberry Perl，其 mingw 运行时
// 目录（如 C:\Program Files\Git\mingw64\bin）会在 agent 的 Bash 工具子进程 PATH
// 里靠前——Git Bash 启动时强制把 /mingw64/bin 前置，我们从外部注入的 conda env
// PATH 只能排在后面。此时 Windows loader 先在 /mingw64/bin 命中老版 libgcc /
// libgfortran，再让 R 加载 stats.dll 时就会报 "LoadLibrary failure: 找不到指定
// 的程序"（ERROR_PROC_NOT_FOUND）——DLL 本身存在但缺新版符号。
//
// 修法：把 conda env 的 mingw 运行时 DLL 冗余复制到 R 的 Application Directory
// （Rscript.exe / R.dll 所在目录）。Windows DLL 搜索顺序永远是 Application Dir
// 优先于 PATH，外部 mingw 工具链里的老版 DLL 就被彻底绕过。
//
// 非 Windows 跳过。幂等：目标存在且大小一致就不动。
const MINGW_RUNTIME_DLLS = [
  'libgcc_s_seh-1.dll',
  'libgfortran-5.dll',
  'libwinpthread-1.dll',
  'libquadmath-0.dll',
  'libstdc++-6.dll',
];

function patchWindowsMingwDlls(): string | null {
  if (process.platform !== 'win32') return null;
  const envRoot = researchEnvRoot();
  const srcDir = join(envRoot, 'Library', 'bin');
  if (!existsSync(srcDir)) return null;

  // 两个目标：真·R 运行时（R.dll 同目录）+ Rscript shim 目录。
  // 前者覆盖 shim 启动真·Rscript.exe 后加载 R.dll 的情况；
  // 后者覆盖 shim 自己在某些环境下被 delay-load 间接拉 libgcc 的情况。
  const targets = [
    join(envRoot, 'Lib', 'R', 'bin', 'x64'),
    join(envRoot, 'Scripts'),
  ].filter(existsSync);

  const copied: string[] = [];
  for (const dll of MINGW_RUNTIME_DLLS) {
    const src = join(srcDir, dll);
    if (!existsSync(src)) continue;
    const srcSize = statSync(src).size;
    for (const tgt of targets) {
      const dst = join(tgt, dll);
      try {
        if (existsSync(dst) && statSync(dst).size === srcSize) continue;
        copyFileSync(src, dst);
        copied.push(`${dll}→${relative(envRoot, tgt).replace(/\\/g, '/')}`);
      } catch (err) {
        return `[runtime] 复制 mingw DLL 失败：${(err as Error).message}`;
      }
    }
  }
  return copied.length > 0
    ? `[runtime] 已冗余 mingw 运行时 DLL 到 R Application Dir：${copied.join(', ')}`
    : null;
}
