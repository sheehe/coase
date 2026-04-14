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

import { app } from 'electron';
import { join } from 'node:path';
import { mkdir, writeFile, access } from 'node:fs/promises';

const BUILTIN_PLUGIN_NAME = 'coase-builtin';
const USER_PLUGIN_NAME = 'coase-user';

export interface CoasePluginPaths {
  builtin: string;
  user: string;
}

/**
 * 得到两个 plugin 的绝对路径。调用方直接把它们喂给 SDK 的 `plugins` 选项即可。
 * 如果用户 plugin 骨架还不存在，会先自动补齐（空 skills 目录 + 最小 plugin.json）。
 */
export async function resolveCoasePluginPaths(): Promise<CoasePluginPaths> {
  const builtin = builtinPluginPath();
  const user = userPluginPath();
  await ensureUserPluginSkeleton(user);
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
