// 解析 Coase 注入给 Claude Agent SDK 的 plugin 目录绝对路径。
//
// Coase 有两个 plugin：
//   1. coase-builtin — 随应用发行的内置 skill，只读
//   2. coase-user    — 用户自己的 skill，位于 {userData}/plugins/coase-user，可增删改
//
// 这两个目录在运行时都会作为 `plugins: [{type:'local', path}]` 传给 SDK，
// SDK 会自动发现里面的 skills/<name>/SKILL.md 并做渐进式披露。
//
// 打包后的路径解析规则（Phase 4 再正式验证，这里先预留分支）：
//   - 开发态：app.getAppPath() 返回仓库根，resources/ 在根下
//   - packaged：electron-builder 的 extraResources 会把 resources/plugins/
//                拷到 process.resourcesPath/plugins/，从那里读
//
// 双语 SKILL.md 机制（i18n）：
// - 源目录（resources/）下，需要双语的 skill 同时存在 SKILL.md（中文，默认）
//   和 SKILL.en.md（英文）。其它 skill 只有 SKILL.md（已是英文，全语种共用）。
// - SDK 只认 SKILL.md。所以 createChatQuery 启动前，先调用
//   stageBuiltinPluginForLanguage(language)，把 builtin 整树镜像到
//   userData/plugins-active/coase-builtin/，再用 SKILL.{lang}.md 覆盖 SKILL.md
//   并清理掉所有 SKILL.zh.md / SKILL.en.md（避免 SDK 误读）。
// - settings UI / skill-manager 仍读源目录（resolveCoasePluginPaths），不受影响。

import { app } from 'electron';
import { join } from 'node:path';
import { mkdir, writeFile, access, cp, rm, readdir, readFile } from 'node:fs/promises';

import type { ResolvedLanguage } from '../../shared/app-prefs';

const BUILTIN_PLUGIN_NAME = 'coase-builtin';
const USER_PLUGIN_NAME = 'coase-user';
const ACTIVE_PLUGINS_DIR = 'plugins-active';

export interface CoasePluginPaths {
  builtin: string;
  user: string;
}

/**
 * 得到两个 plugin 的源目录路径。给 settings UI、skill-manager 用——它们要读写
 * 用户原始 skill 文件，需要的是真实源路径。
 *
 * SDK 应该用 resolveCoaseSdkPluginPaths(language)，那个函数会做语言 staging。
 */
export async function resolveCoasePluginPaths(): Promise<CoasePluginPaths> {
  const builtin = builtinPluginPath();
  const user = userPluginPath();
  await ensureUserPluginSkeleton(user);
  return { builtin, user };
}

/**
 * 给 SDK 用的 plugin 路径解析。builtin 走 staging（按 language 选好 SKILL.md），
 * user 直接用源路径（用户自己的 skill 不参与双语化）。
 */
export async function resolveCoaseSdkPluginPaths(
  language: ResolvedLanguage,
): Promise<CoasePluginPaths> {
  const user = userPluginPath();
  await ensureUserPluginSkeleton(user);
  const builtin = await stageBuiltinPluginForLanguage(language);
  return { builtin, user };
}

function builtinPluginPath(): string {
  if (app.isPackaged) {
    // TODO(Phase 4): 打包时在 electron-builder 里加 extraResources
    //   { from: 'resources/plugins', to: 'plugins' }
    // 确保这里能读到。
    return join(process.resourcesPath, 'plugins', BUILTIN_PLUGIN_NAME);
  }
  return join(app.getAppPath(), 'resources', 'plugins', BUILTIN_PLUGIN_NAME);
}

function userPluginPath(): string {
  return join(app.getPath('userData'), 'plugins', USER_PLUGIN_NAME);
}

function activeBuiltinStagingPath(): string {
  return join(app.getPath('userData'), ACTIVE_PLUGINS_DIR, BUILTIN_PLUGIN_NAME);
}

/**
 * 把 builtin plugin 整树镜像到 userData 下的 staging 目录，并按当前语言挑选
 * SKILL.md 内容。每次启动全量重建（477 KB 量级，IO 开销可忽略）。
 *
 * 处理规则：
 *   - 整树 cp → staging
 *   - 对每个 skills/<name>/，若存在 SKILL.<language>.md，把内容写入 SKILL.md
 *   - 不论是否替换，最后都把 staging 里所有 SKILL.zh.md / SKILL.en.md 删掉，
 *     避免 SDK 把它们当成另一个 skill 的入口去读
 */
export async function stageBuiltinPluginForLanguage(
  language: ResolvedLanguage,
): Promise<string> {
  const source = builtinPluginPath();
  const staging = activeBuiltinStagingPath();

  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await cp(source, staging, { recursive: true });

  const skillsRoot = join(staging, 'skills');
  let skillEntries: Array<{ name: string; isDir: boolean }>;
  try {
    const dirents = await readdir(skillsRoot, { withFileTypes: true });
    skillEntries = dirents.map((d) => ({ name: d.name, isDir: d.isDirectory() }));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return staging;
    throw err;
  }

  for (const entry of skillEntries) {
    if (!entry.isDir) continue;
    const skillDir = join(skillsRoot, entry.name);
    const langSpecific = join(skillDir, `SKILL.${language}.md`);
    const skillMd = join(skillDir, 'SKILL.md');

    if (await pathExists(langSpecific)) {
      const content = await readFile(langSpecific, 'utf-8');
      await writeFile(skillMd, content, 'utf-8');
    }

    // 清理所有语言后缀文件，避免 SDK 误读
    const files = await readdir(skillDir);
    await Promise.all(
      files
        .filter((f) => /^SKILL\.(zh|en)\.md$/i.test(f))
        .map((f) => rm(join(skillDir, f), { force: true })),
    );
  }

  return staging;
}

async function ensureUserPluginSkeleton(pluginDir: string): Promise<void> {
  const manifestDir = join(pluginDir, '.claude-plugin');
  const manifestPath = join(manifestDir, 'plugin.json');
  const skillsDir = join(pluginDir, 'skills');

  // plugin.json 存在就认为骨架已就绪，避免每次启动都写盘。
  if (await pathExists(manifestPath)) return;

  await mkdir(manifestDir, { recursive: true });
  await mkdir(skillsDir, { recursive: true });

  const manifest = {
    name: USER_PLUGIN_NAME,
    description:
      'User-authored Coase skills. Files here are editable from the Coase Settings page and hot-reloaded at runtime. Delete this directory to reset to a blank user plugin.',
    author: { name: 'Coase user' },
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
