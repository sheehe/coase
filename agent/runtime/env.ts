import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { runtimeUserDir } from './paths';

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

// 基于 base env（默认 process.env）克隆一份，把研究环境的 bin 目录前插到 PATH。
// 环境尚未安装时直接返回 base clone——agent 仍可启动，只是 Rscript/python 不可用。
//
// 调用点：agent/sdk/client.ts 的 childEnv。SDK 把这份 env 传给 cli.js 子进程，
// cli.js 再继承给 Bash 工具起的每个子进程，于是 agent 写 `Rscript foo.R` 就能直接跑。
export function buildRuntimeEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...base };
  if (!researchEnvExists()) return out;

  const sep = process.platform === 'win32' ? ';' : ':';
  // Windows 的 env key 实际大小写不固定（Path / PATH / PATh 都见过），
  // 找一下现存的 key，没有就落到大写 PATH。
  const pathKey =
    process.platform === 'win32'
      ? Object.keys(out).find((k) => k.toLowerCase() === 'path') ?? 'PATH'
      : 'PATH';
  const addition = researchEnvPathDirs().join(sep);
  const existing = out[pathKey];
  out[pathKey] = existing && existing.length > 0 ? `${addition}${sep}${existing}` : addition;

  // 给下游 R / Python 一个标准定位点（conda 约定）。后续若需要 SSL_CERT_FILE
  // 等由 activate.d 脚本写入的变量，再扩展这里。
  out.CONDA_PREFIX = researchEnvRoot();
  return out;
}
