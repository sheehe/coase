// providers.json 读写层。
//
// 文件落在 {userData}/config/providers.json，明文存储。Phase 4 正式版前
// 会用 Electron safeStorage 给 credential 字段加密（roadmap 决策 D）。
//
// 本模块只跑在 main process；renderer 通过 IPC 访问，拿不到明文 key。

import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ProviderRecord, ProvidersFile } from '../../shared/providers';

export type { ProvidersFile };

const EMPTY_FILE: ProvidersFile = {
  version: 1,
  activeProviderId: null,
  criticPanelIds: null,
  providers: [],
};

function getConfigDir(): string {
  return join(app.getPath('userData'), 'config');
}

function getProvidersPath(): string {
  return join(getConfigDir(), 'providers.json');
}

/** 读盘。文件不存在时返回空结构，不报错。 */
export async function loadProvidersFile(): Promise<ProvidersFile> {
  let raw: string;
  try {
    raw = await readFile(getProvidersPath(), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...EMPTY_FILE, providers: [] };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `providers.json 解析失败：${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as ProvidersFile).version !== 1 ||
    !Array.isArray((parsed as ProvidersFile).providers)
  ) {
    throw new Error('providers.json 格式不正确（version != 1 或 providers 不是数组）');
  }

  return parsed as ProvidersFile;
}

/** 写盘。会确保目录存在。 */
export async function saveProvidersFile(file: ProvidersFile): Promise<void> {
  await mkdir(getConfigDir(), { recursive: true });
  await writeFile(getProvidersPath(), JSON.stringify(file, null, 2), 'utf-8');
}

// ---- 高层 CRUD -----------------------------------------------------------

export async function listProviders(): Promise<ProvidersFile> {
  return loadProvidersFile();
}

/** 新增或更新一条记录（按 id 匹配）。 */
export async function upsertProvider(record: ProviderRecord): Promise<void> {
  const file = await loadProvidersFile();
  const idx = file.providers.findIndex((p) => p.id === record.id);
  if (idx >= 0) {
    file.providers[idx] = record;
  } else {
    file.providers.push(record);
  }
  // 如果之前没有 active，自动把刚加的这条设为 active
  if (file.activeProviderId === null) {
    file.activeProviderId = record.id;
  }
  await saveProvidersFile(file);
}

export async function deleteProvider(id: string): Promise<void> {
  const file = await loadProvidersFile();
  file.providers = file.providers.filter((p) => p.id !== id);
  if (file.activeProviderId === id) {
    file.activeProviderId = file.providers[0]?.id ?? null;
  }
  if (Array.isArray(file.criticPanelIds)) {
    file.criticPanelIds = file.criticPanelIds.filter((pid) => pid !== id);
    if (file.criticPanelIds.length === 0) {
      file.criticPanelIds = null;
    }
  }
  await saveProvidersFile(file);
}

export async function setActiveProvider(id: string | null): Promise<void> {
  const file = await loadProvidersFile();
  if (id !== null && !file.providers.some((p) => p.id === id)) {
    throw new Error(`setActiveProvider: id=${id} 不存在`);
  }
  file.activeProviderId = id;
  await saveProvidersFile(file);
}

/** 读取当前的评审模型组（critic panel）provider id 列表。未配置时返回 []。 */
export async function getCriticPanelIds(): Promise<string[]> {
  const file = await loadProvidersFile();
  if (!Array.isArray(file.criticPanelIds)) return [];
  // 过滤掉已经不存在的 provider（防止 providers.json 被手动编辑）
  const validIds = new Set(file.providers.map((p) => p.id));
  return file.criticPanelIds.filter((id) => validIds.has(id));
}

/** 保存评审模型组。传入空数组 / null 时清空。ids 会按存在性过滤 + 去重。 */
export async function setCriticPanelIds(ids: string[] | null): Promise<void> {
  const file = await loadProvidersFile();
  if (ids === null || ids.length === 0) {
    file.criticPanelIds = null;
  } else {
    const validIds = new Set(file.providers.map((p) => p.id));
    const missing = ids.filter((id) => !validIds.has(id));
    if (missing.length > 0) {
      throw new Error(`setCriticPanelIds: 以下 provider id 不存在: ${missing.join(', ')}`);
    }
    // 保持用户传入的顺序但去重
    const seen = new Set<string>();
    file.criticPanelIds = ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  }
  await saveProvidersFile(file);
}
