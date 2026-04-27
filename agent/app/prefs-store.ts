// app-prefs.json 读写层。结构沿用 research/prefs-store 的写法：
// 文件缺失 / 字段残缺时回退默认值；写盘自动建目录。只跑在 main process。

import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DEFAULT_APP_PREFS,
  type AppLanguage,
  type AppPrefs,
  type AppPrefsFile,
  type ResolvedLanguage,
} from '../../shared/app-prefs';

function getConfigDir(): string {
  return join(app.getPath('userData'), 'config');
}

function getPrefsPath(): string {
  return join(getConfigDir(), 'app-prefs.json');
}

const LANGUAGES: readonly AppLanguage[] = ['auto', 'zh', 'en'];

function coercePrefs(input: unknown): AppPrefs {
  if (!input || typeof input !== 'object') return { ...DEFAULT_APP_PREFS };
  const raw = input as Record<string, unknown>;
  return {
    language: LANGUAGES.includes(raw.language as AppLanguage)
      ? (raw.language as AppLanguage)
      : DEFAULT_APP_PREFS.language,
  };
}

export async function loadAppPrefs(): Promise<AppPrefs> {
  let raw: string;
  try {
    raw = await readFile(getPrefsPath(), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...DEFAULT_APP_PREFS };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_APP_PREFS };
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    (parsed as AppPrefsFile).version === 1 &&
    (parsed as AppPrefsFile).prefs
  ) {
    return coercePrefs((parsed as AppPrefsFile).prefs);
  }
  // 旧版裸对象兼容
  return coercePrefs(parsed);
}

export async function saveAppPrefs(prefs: AppPrefs): Promise<AppPrefs> {
  const normalized = coercePrefs(prefs);
  const file: AppPrefsFile = { version: 1, prefs: normalized };
  await mkdir(getConfigDir(), { recursive: true });
  await writeFile(getPrefsPath(), JSON.stringify(file, null, 2), 'utf-8');
  return normalized;
}

/**
 * 把 'auto' 语言收敛成 'zh' / 'en'。'zh' 家族（zh, zh-CN, zh-TW, zh-HK, zh-Hans, zh-Hant）
 * → 'zh'；其余一律 → 'en'。
 *
 * 注意：app.getLocale() 在 app ready 之前可能返回空串，调用方需要在 ready 之后用。
 */
export function resolveAppLanguage(prefs: AppPrefs): ResolvedLanguage {
  if (prefs.language === 'zh' || prefs.language === 'en') return prefs.language;
  const sys = app.getLocale().toLowerCase();
  return sys.startsWith('zh') ? 'zh' : 'en';
}
