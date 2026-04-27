// 下载并安装指定版本的 pixi 二进制到 resources/runtime-manager/bin/<platform>-<arch>/。
// 通过 GitHub 官方 dist-manifest.json 拿 SHA256，校验后再解压，保证供应链完整性。
//
// 用法：
//   node scripts/fetch-pixi.mjs                       只下载当前平台（开发者日常）
//   node scripts/fetch-pixi.mjs --all                 下载所有支持平台
//   node scripts/fetch-pixi.mjs darwin-x64 darwin-arm64  只下载指定平台（CI 按 OS 拆分）
//   node scripts/fetch-pixi.mjs --force               忽略缓存重下
//
// CI 不再用 --all：macOS 任务一次性拉 Windows 二进制时，GitHub releases 偶发 502
// 会让整轮 build 跪。按 OS 只拉自己要的产物，副作用面更小。
//
// 产物：
//   resources/runtime-manager/bin/<platform>-<arch>/pixi[.exe]
//   resources/runtime-manager/bin/version.json       记录版本和每个产物的 SHA256
//
// 依赖：系统 tar（Win 10 1803+ 自带，Mac/Linux 默认有）。不引入 npm 依赖。

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, rm, writeFile, chmod, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const PIXI_VERSION = '0.67.0';

// Electron (platform-arch) → pixi rust target triple + 归档类型
// 注意：Windows 版本的 pixi-<triple>.tar.gz 没有官方发布，只有 .zip，所以走 zip 分支。
const TARGETS = {
  'darwin-x64': { triple: 'x86_64-apple-darwin', ext: 'tar.gz', exe: 'pixi' },
  'darwin-arm64': { triple: 'aarch64-apple-darwin', ext: 'tar.gz', exe: 'pixi' },
  'win32-x64': { triple: 'x86_64-pc-windows-msvc', ext: 'zip', exe: 'pixi.exe' },
  'linux-x64': { triple: 'x86_64-unknown-linux-musl', ext: 'tar.gz', exe: 'pixi' },
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const BIN_DIR = join(REPO_ROOT, 'resources/runtime-manager/bin');
const TMP_DIR = join(REPO_ROOT, 'tmp/pixi-download');
const MANIFEST_URL = `https://github.com/prefix-dev/pixi/releases/download/v${PIXI_VERSION}/dist-manifest.json`;

function log(msg) {
  console.log(`[fetch-pixi] ${msg}`);
}

// GitHub releases 的 CDN 偶发 502/503/504。给所有 fetch 加 3 次指数退避重试，
// 否则一次抖动就让整个 CI build 跪——alpha.44–.47 连续四个版本都是这样炸的。
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

async function fetchWithRetry(url, init) {
  const attempts = 3;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (!RETRYABLE_STATUS.has(res.status) || i === attempts - 1) {
        throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
      }
      lastErr = new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) throw err;
    }
    const waitMs = 1000 * Math.pow(3, i); // 1s -> 3s -> 9s
    log(`重试中（${i + 1}/${attempts - 1}）${waitMs}ms 后再试: ${lastErr.message}`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw lastErr;
}

async function fetchJson(url) {
  const res = await fetchWithRetry(url);
  return res.json();
}

async function downloadToFile(url, destPath) {
  const res = await fetchWithRetry(url);
  if (!res.body) throw new Error(`GET ${url} -> empty body`);
  await mkdir(dirname(destPath), { recursive: true });
  await pipeline(res.body, createWriteStream(destPath));
}

async function sha256OfFile(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

// 从 pixi 的 dist-manifest 取某个归档的官方 SHA256。结构示例：
//   "pixi-x86_64-apple-darwin.tar.gz": { checksums: { sha256: "..." } }
function manifestSha(manifest, archiveName) {
  const entry = manifest?.artifacts?.[archiveName];
  const sha = entry?.checksums?.sha256;
  if (!sha) {
    throw new Error(`dist-manifest.json 中找不到 ${archiveName} 的 sha256`);
  }
  return sha;
}

// 调系统 tar 解压。tar -xf 能吃 .tar.gz 和 .zip 两种，现代 Win/Mac/Linux 都支持。
// Windows 上必须用 System32 的 bsdtar；否则在 git-bash 里会命中 MSYS 的 GNU tar，
// 它把 "C:\..." 当成 host:path 直接 "Cannot connect to C: resolve failed"。
function tarBinary() {
  if (process.platform !== 'win32') return 'tar';
  const sysRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
  return join(sysRoot, 'System32', 'tar.exe');
}

function extractArchive(archivePath, destDir) {
  const result = spawnSync(tarBinary(), ['-xf', archivePath, '-C', destDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `tar -xf ${archivePath} 失败 (exit ${result.status}): ${result.stderr?.trim() || '<no stderr>'}`,
    );
  }
}

async function fetchOne(platformKey, manifest, opts) {
  const target = TARGETS[platformKey];
  if (!target) throw new Error(`unsupported platform: ${platformKey}`);
  const archiveName = `pixi-${target.triple}.${target.ext}`;
  const archiveUrl = `https://github.com/prefix-dev/pixi/releases/download/v${PIXI_VERSION}/${archiveName}`;
  const expectedSha = manifestSha(manifest, archiveName);

  const outDir = join(BIN_DIR, platformKey);
  const outExe = join(outDir, target.exe);

  // 缓存命中：已有文件 + 能跑（或 Windows 的 .exe 存在即认）就跳过
  if (!opts.force && existsSync(outExe)) {
    log(`[${platformKey}] 已存在 ${outExe}，跳过（用 --force 强制重下）`);
    return { platformKey, archiveName, sha256: expectedSha, skipped: true };
  }

  const archivePath = join(TMP_DIR, archiveName);
  await mkdir(TMP_DIR, { recursive: true });

  // 本地 archive 缓存：如果上次下过且 SHA 对得上，不用再下
  let needDownload = true;
  if (!opts.force && existsSync(archivePath)) {
    const localSha = await sha256OfFile(archivePath);
    if (localSha === expectedSha) {
      log(`[${platformKey}] 复用缓存 ${archiveName}`);
      needDownload = false;
    }
  }
  if (needDownload) {
    log(`[${platformKey}] 下载 ${archiveUrl}`);
    await downloadToFile(archiveUrl, archivePath);
    const actualSha = await sha256OfFile(archivePath);
    if (actualSha !== expectedSha) {
      await rm(archivePath, { force: true });
      throw new Error(
        `[${platformKey}] SHA256 不匹配！期望 ${expectedSha}，实际 ${actualSha}。已删除损坏归档。`,
      );
    }
    log(`[${platformKey}] SHA256 校验通过`);
  }

  await mkdir(outDir, { recursive: true });
  extractArchive(archivePath, outDir);
  if (!existsSync(outExe)) {
    throw new Error(`[${platformKey}] 解压完成但未找到 ${outExe}，归档内容可能变了`);
  }

  // Unix 可执行位
  if (!target.exe.endsWith('.exe')) {
    await chmod(outExe, 0o755);
  }

  log(`[${platformKey}] 就绪 -> ${outExe}`);
  return { platformKey, archiveName, sha256: expectedSha, skipped: false };
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const all = flags.has('--all');
  const force = flags.has('--force');

  const currentKey = `${process.platform}-${process.arch}`;
  let platforms;
  if (all) {
    platforms = Object.keys(TARGETS);
  } else if (positional.length > 0) {
    platforms = positional;
  } else {
    platforms = [currentKey];
  }
  for (const p of platforms) {
    if (!TARGETS[p]) {
      throw new Error(
        `平台 ${p} 不在支持列表 ${Object.keys(TARGETS).join(', ')}。` +
          `如需新增，编辑 scripts/fetch-pixi.mjs 的 TARGETS。`,
      );
    }
  }

  log(`pixi v${PIXI_VERSION}, 目标: ${platforms.join(', ')}`);
  const manifest = await fetchJson(MANIFEST_URL);

  const entries = [];
  for (const p of platforms) {
    const entry = await fetchOne(p, manifest, { force });
    entries.push(entry);
  }

  // version.json 记录到底装了哪些平台、对应 SHA 是多少。运行时可用于自检。
  const versionFile = join(BIN_DIR, 'version.json');
  let existing = {};
  try {
    existing = JSON.parse(await readFile(versionFile, 'utf8'));
  } catch {
    /* 首次跑还没有 */
  }
  const artifacts = { ...(existing.artifacts ?? {}) };
  for (const e of entries) {
    artifacts[e.platformKey] = { archive: e.archiveName, sha256: e.sha256 };
  }
  await writeFile(
    versionFile,
    JSON.stringify(
      { version: PIXI_VERSION, source: 'github.com/prefix-dev/pixi', artifacts, fetchedAt: new Date().toISOString() },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  log(`version.json 已更新: ${versionFile}`);
}

main().catch((err) => {
  console.error(`[fetch-pixi] 失败: ${err?.message ?? err}`);
  process.exitCode = 1;
});
