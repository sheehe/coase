// 下载 PortableGit（Git for Windows 官方便携版）并解压到 resources/portable-git/win32-x64/。
// 用途：Coase 的 Claude Agent SDK 在 Windows 上启动期硬依赖 git-bash；通过 bundle
// PortableGit 让最终用户无需自己装 Git for Windows。
//
// 为什么用 PortableGit 而不是 MinGit：MinGit（精简版）没有 bash.exe，SDK 启动检测
// 直接失败；PortableGit 是 git-for-windows 官方维护的便携自包含版，含完整 bash 和
// msys 运行时，约 95MB（自解压 .7z.exe）/ 解压后 ~350MB。这是含完整 bash 的最小可
// 行 git-for-windows 发行版。
//
// 用法：
//   node scripts/fetch-mingit.mjs           按 lockfile 校验下载（缺了就下）
//   node scripts/fetch-mingit.mjs --force   忽略缓存重下
//
// 产物：
//   resources/portable-git/win32-x64/        PortableGit 解压根（含 bin/bash.exe 等）
//   resources/portable-git/version.json      版本 + SHA256 锁文件
//
// 供应链信任模型（TOFU）：
//   首次下载时把实际 SHA256 写入 version.json；后续每次跑都必须匹配 version.json。
//   想升级版本就改下面的 PORTABLE_GIT_VERSION 常量，并删掉 version.json 让脚本重新 lock。

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, rm, writeFile, readFile, chmod } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

// Git for Windows 版本号。release tag 形如 v2.47.1.windows.1；资产命名 PortableGit-2.47.1-64-bit.7z.exe。
// 升级时同步删掉 resources/portable-git/version.json，让脚本重新 TOFU 锁定 SHA。
const PORTABLE_GIT_VERSION = '2.47.1';
const PORTABLE_GIT_TAG = `v${PORTABLE_GIT_VERSION}.windows.1`;
const ARCHIVE_NAME = `PortableGit-${PORTABLE_GIT_VERSION}-64-bit.7z.exe`;
const DOWNLOAD_URL = `https://github.com/git-for-windows/git/releases/download/${PORTABLE_GIT_TAG}/${ARCHIVE_NAME}`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PORTABLE_GIT_DIR = join(REPO_ROOT, 'resources/portable-git');
const TARGET_DIR = join(PORTABLE_GIT_DIR, 'win32-x64');
const LOCK_FILE = join(PORTABLE_GIT_DIR, 'version.json');
const TMP_DIR = join(REPO_ROOT, 'tmp/portable-git-download');

function log(msg) {
  console.log(`[fetch-portable-git] ${msg}`);
}

async function downloadToFile(url, destPath) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  if (!res.body) throw new Error(`GET ${url} -> empty body`);
  await mkdir(dirname(destPath), { recursive: true });
  await pipeline(res.body, createWriteStream(destPath));
}

async function sha256OfFile(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

// PortableGit 是 7z 自解压 SFX (.exe)。标准 SFX 参数：
//   -o<dir>   输出目录（连写，不带空格）
//   -y        全部确认
// 这意味着脚本只能在 Windows 上跑解压步骤。下载和校验跨平台都行（CI 可能在 linux
// 上 build mac/win 不需要解压，因为 win 资源仍由 win runner 准备），但目前 Coase
// 的 build 流程只在 Windows runner 上需要这堆东西，所以 OK。
function runSfxExtract(archivePath, destDir) {
  if (process.platform !== 'win32') {
    throw new Error(
      `PortableGit SFX 解压只能在 Windows 上跑。当前平台：${process.platform}。` +
        `如需跨平台 build，请改用 7zip CLI 解 .7z.exe（自行扩展本脚本）。`,
    );
  }
  const result = spawnSync(archivePath, [`-o${destDir}`, '-y'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `PortableGit SFX 解压失败 (exit ${result.status}): ${result.stderr?.trim() || result.stdout?.trim() || '<no output>'}`,
    );
  }
}

async function readLock() {
  try {
    return JSON.parse(await readFile(LOCK_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function writeLock(version, sha256) {
  await writeFile(
    LOCK_FILE,
    JSON.stringify(
      {
        version,
        archive: ARCHIVE_NAME,
        source: `github.com/git-for-windows/git releases/${PORTABLE_GIT_TAG}`,
        sha256,
        fetchedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const force = args.has('--force');

  log(`PortableGit ${PORTABLE_GIT_VERSION}, target: ${TARGET_DIR}`);

  const lock = await readLock();
  const expectedSha = lock?.version === PORTABLE_GIT_VERSION ? lock.sha256 : null;
  // 解压成功的标志：bin/bash.exe 必须存在。这是 SDK 真正用到的目标文件。
  const sentinel = join(TARGET_DIR, 'bin', 'bash.exe');

  if (!force && expectedSha && existsSync(sentinel)) {
    log(`已就绪（lockfile sha=${expectedSha.slice(0, 12)}…），跳过；用 --force 强制重下`);
    return;
  }

  await mkdir(TMP_DIR, { recursive: true });
  const archivePath = join(TMP_DIR, ARCHIVE_NAME);

  // archive 缓存复用：sha 匹配 lockfile 就不重下
  let needDownload = true;
  if (!force && existsSync(archivePath) && expectedSha) {
    const localSha = await sha256OfFile(archivePath);
    if (localSha === expectedSha) {
      log(`复用本地缓存 ${ARCHIVE_NAME}`);
      needDownload = false;
    }
  }
  if (needDownload) {
    log(`下载 ${DOWNLOAD_URL}`);
    await downloadToFile(DOWNLOAD_URL, archivePath);
  }

  const actualSha = await sha256OfFile(archivePath);
  if (expectedSha) {
    if (actualSha !== expectedSha) {
      await rm(archivePath, { force: true });
      throw new Error(
        `SHA256 不匹配！lockfile 期望 ${expectedSha}，实际 ${actualSha}。\n` +
          `若是有意升级版本，请删除 ${LOCK_FILE} 后重跑；否则可能是供应链异常。`,
      );
    }
    log(`SHA256 校验通过`);
  } else {
    // TOFU：首次下载或换版本，把实际 sha 锁进 version.json
    log(`首次锁定 SHA256 = ${actualSha}`);
  }

  // 解压前清空目标目录，防止旧版本残留
  if (existsSync(TARGET_DIR)) {
    await rm(TARGET_DIR, { recursive: true, force: true });
  }
  await mkdir(TARGET_DIR, { recursive: true });

  // SFX exe 必须可执行（Windows 下载通常已 OK，但多设一道保险）
  await chmod(archivePath, 0o755).catch(() => {});
  runSfxExtract(archivePath, TARGET_DIR);

  if (!existsSync(sentinel)) {
    throw new Error(
      `解压完成但找不到 ${sentinel}，PortableGit 内部布局可能变了。请检查 ${TARGET_DIR}`,
    );
  }

  await writeLock(PORTABLE_GIT_VERSION, actualSha);
  log(`就绪 -> ${TARGET_DIR}`);
  log(`bash.exe -> ${sentinel}`);
}

main().catch((err) => {
  console.error(`[fetch-portable-git] 失败: ${err?.message ?? err}`);
  process.exitCode = 1;
});
