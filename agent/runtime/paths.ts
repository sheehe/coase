import { app } from 'electron';
import { join } from 'node:path';

// 支持的 Electron (platform-arch) → pixi 归档命名（fetch-pixi.mjs 里 TARGETS 的子集）。
// 新增平台时两处都要改。
const SUPPORTED_PLATFORMS = new Set(['darwin-x64', 'darwin-arm64', 'win32-x64', 'linux-x64']);

/** Electron 当前运行的平台键，和 resources/runtime-manager/bin/<key>/ 目录对应。 */
export function currentPlatformKey(): string {
  return `${process.platform}-${process.arch}`;
}

/**
 * resources/runtime-manager 目录：
 * - 打包态：electron-builder 的 extraResources 会把它放到 process.resourcesPath 下
 * - 开发态：直接取仓库根目录下的源文件夹
 *
 * 注意不要在模块顶层缓存路径——Electron 在 app ready 之前读 app.getAppPath()
 * 返回的是可执行文件所在目录，不是仓库根，所以必须懒求值。
 */
export function runtimeManagerResourcesDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'runtime-manager');
  }
  return join(app.getAppPath(), 'resources', 'runtime-manager');
}

/**
 * 自带 PortableGit 的根目录（仅 Windows 有意义）。
 *
 * 打包态：electron-builder 的 win.extraResources 把 resources/portable-git/win32-x64
 *   复制到 <resourcesPath>/portable-git/win32-x64/
 * 开发态：仓库根的 resources/portable-git/win32-x64/（由 scripts/fetch-mingit.mjs 解出）
 *
 * 不保证目录真的存在——非 Windows 平台或还没跑过 fetch 脚本时返回的路径不存在。
 * 调用方需要自己用 existsSync 兜底。
 */
export function portableGitDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'portable-git', 'win32-x64');
  }
  return join(app.getAppPath(), 'resources', 'portable-git', 'win32-x64');
}

/** 当前平台对应的 pixi 可执行文件路径。不保证文件真的存在。 */
export function pixiBinaryPath(): string {
  const key = currentPlatformKey();
  if (!SUPPORTED_PLATFORMS.has(key)) {
    throw new Error(
      `[runtime] 不支持的平台 ${key}。支持列表：${[...SUPPORTED_PLATFORMS].join(', ')}`,
    );
  }
  const exe = process.platform === 'win32' ? 'pixi.exe' : 'pixi';
  return join(runtimeManagerResourcesDir(), 'bin', key, exe);
}

/**
 * 研究运行时的"工作目录"——pixi.toml / pixi.lock 的可写副本和 `.pixi/` 环境
 * 都住这里。
 *
 * 打包态：`<userData>/runtime/`，跟着应用卸载清走。
 * 开发态：`<repo>/resources/runtime-manager/template/`，直接复用仓库里的那份，
 *   省得在 userData 再灌一份重复环境。template/.gitignore 已经排除 .pixi/。
 *
 * env.ts 的 researchEnvRoot() 和 install.ts 的 ensureRuntimeFiles() 都以此为准，
 * 保证"环境 detect 到的位置"和"pixi install 装到的位置"是同一处。
 */
export function runtimeUserDir(): string {
  if (!app.isPackaged) {
    return join(app.getAppPath(), 'resources', 'runtime-manager', 'template');
  }
  return join(app.getPath('userData'), 'runtime');
}
