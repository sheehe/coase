import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { portableGitDir, runtimeUserDir } from './paths';

// 研究环境（pixi 解出来的 R + Python + 计量包）在磁盘上的根目录。
// dev / 打包态差异由 runtimeUserDir() 统一承担，这里只拼 .pixi/envs/default。
export function researchEnvRoot(): string {
  return join(runtimeUserDir(), '.pixi', 'envs', 'default');
}

// conda 风格激活需要前插到 PATH 的目录。顺序和 `pixi shell-hook --shell bash`
// 实测输出一致——改顺序会让 Rscript.exe / python.exe 的候选路径优先级错位。
//
// Windows：6 段。Unix：<env>/bin 一段。
export function researchEnvPathDirs(): string[] {
  const root = researchEnvRoot();
  if (process.platform === 'win32') {
    return [
      root,
      join(root, 'Library', 'mingw-w64', 'bin'),
      join(root, 'Library', 'usr', 'bin'),
      join(root, 'Library', 'bin'),
      join(root, 'Scripts'),
      join(root, 'bin'),
    ];
  }
  return [join(root, 'bin')];
}

// 环境是否已解出：用 conda-meta/ 存在做判据（pixi install 成功后必写）。
// 不做深度校验（包完整性）——那是 P3 安装向导和 P7 自愈逻辑的事。
export function researchEnvExists(): boolean {
  return existsSync(join(researchEnvRoot(), 'conda-meta'));
}

// Windows 上 Coase 自带的 PortableGit 里 bash.exe 的绝对路径（仅 win32 有意义）。
// 文件不存在（未打包/未跑 fetch-portable-git）时返回 null。
//
// 用途：Claude Agent SDK 的 cli.js 在 Windows 启动期硬依赖 git-bash，会先读
// CLAUDE_CODE_GIT_BASH_PATH 环境变量。我们 bundle 一份 PortableGit 在 resources/
// 下，运行时把这条路径塞进 SDK 子进程的 env，用户机器上没装 Git for Windows 也能跑。
export function bundledGitBashPath(): string | null {
  if (process.platform !== 'win32') return null;
  const candidate = join(portableGitDir(), 'bin', 'bash.exe');
  return existsSync(candidate) ? candidate : null;
}

// PortableGit 自带的 git/sed/grep/awk 等命令所在的目录。把它们前插到 PATH 后，
// agent 的 Bash 工具里直接 `git status` / `sed -i ...` 就能命中自带工具，不依赖
// 用户机器上的 git 或其他 unix 工具。
//
// 顺序参考 git-bash 自己 source /etc/profile 后的实际 PATH：
//   /usr/bin（bash 等核心工具）→ /mingw64/bin（git 真身）→ /cmd（git wrapper）
function bundledGitPathDirs(): string[] {
  if (process.platform !== 'win32') return [];
  const root = portableGitDir();
  const bashCandidate = join(root, 'bin', 'bash.exe');
  if (!existsSync(bashCandidate)) return [];
  return [join(root, 'usr', 'bin'), join(root, 'mingw64', 'bin'), join(root, 'cmd')];
}

// 基于 base env（默认 process.env）克隆一份，把研究环境的 bin 目录前插到 PATH。
// 研究环境未安装时只跳过研究 PATH 部分；自带 git-bash 仍会被注入（这是 SDK 启动
// 期的硬依赖，不能跳）。
//
// 调用点：agent/sdk/client.ts 的 childEnv。SDK 把这份 env 传给 cli.js 子进程，
// cli.js 再继承给 Bash 工具起的每个子进程，于是 agent 写 `Rscript foo.R` 就能直接跑。
export function buildRuntimeEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...base };

  const sep = process.platform === 'win32' ? ';' : ':';
  // Windows 的 env key 实际大小写不固定（Path / PATH / PATh 都见过），
  // 找一下现存的 key，没有就落到大写 PATH。
  const pathKey =
    process.platform === 'win32'
      ? Object.keys(out).find((k) => k.toLowerCase() === 'path') ?? 'PATH'
      : 'PATH';

  // PATH 拼接顺序：研究环境（Rscript/python）> 自带 git（git/bash 工具）> 系统已有 PATH
  // 研究环境优先级最高，避免被自带 git 里的 mingw python 抢走（PortableGit 不带 python，
  // 但 mingw64/bin 里有零散 unix 工具可能与研究环境冲突）。
  const additions: string[] = [];
  if (researchEnvExists()) additions.push(...researchEnvPathDirs());
  additions.push(...bundledGitPathDirs());

  if (additions.length > 0) {
    const addition = additions.join(sep);
    const existing = out[pathKey];
    out[pathKey] = existing && existing.length > 0 ? `${addition}${sep}${existing}` : addition;
  }

  // SDK 在 Windows 启动期硬依赖这条变量（cli.js 找不到 git-bash 就 process.exit(1)）。
  // 用户已经手动设过且文件存在则尊重用户设置；否则用 Coase 自带的 PortableGit 兜底。
  // 用户没设 + 自带也找不到（比如 dev 环境忘了跑 fetch-portable-git）→ 让 SDK 自己
  // 走 fallback 探测 system PATH，仍可能成功（开发机一般有装 git）。
  if (process.platform === 'win32') {
    const userOverride = out.CLAUDE_CODE_GIT_BASH_PATH;
    if (!userOverride || !existsSync(userOverride)) {
      const bundled = bundledGitBashPath();
      if (bundled) out.CLAUDE_CODE_GIT_BASH_PATH = bundled;
      else if (userOverride) delete out.CLAUDE_CODE_GIT_BASH_PATH; // 用户设了但文件没了，清掉避免 SDK 报死
    }
  }

  // 给下游 R / Python 一个标准定位点（conda 约定）。后续若需要 SSL_CERT_FILE
  // 等由 activate.d 脚本写入的变量，再扩展这里。
  if (researchEnvExists()) {
    out.CONDA_PREFIX = researchEnvRoot();
  }
  return out;
}
