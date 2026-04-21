// research-prefs.json 读写层。结构和 providers/config-store.ts 一致：
// 文件缺失 / 字段残缺时回退到默认值，不抛错；写盘时会自动建目录。
// 只跑在 main process；renderer 通过 IPC 访问。

import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DEFAULT_RESEARCH_PREFS,
  type ResearchPrefs,
  type ResearchPrefsFile,
  type ResearchPurpose,
} from '../../shared/research-prefs';

function getConfigDir(): string {
  return join(app.getPath('userData'), 'config');
}

function getPrefsPath(): string {
  return join(getConfigDir(), 'research-prefs.json');
}

const RESEARCH_PURPOSES: readonly ResearchPurpose[] = ['causal', 'associational'];

function coercePrefs(input: unknown): ResearchPrefs {
  if (!input || typeof input !== 'object') return { ...DEFAULT_RESEARCH_PREFS };
  const raw = input as Record<string, unknown>;
  return {
    researchPurpose: RESEARCH_PURPOSES.includes(raw.researchPurpose as ResearchPurpose)
      ? (raw.researchPurpose as ResearchPurpose)
      : DEFAULT_RESEARCH_PREFS.researchPurpose,
  };
}

export async function loadResearchPrefs(): Promise<ResearchPrefs> {
  let raw: string;
  try {
    raw = await readFile(getPrefsPath(), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...DEFAULT_RESEARCH_PREFS };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 文件损坏时退回默认，不让整个 app 起不来。
    return { ...DEFAULT_RESEARCH_PREFS };
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    (parsed as ResearchPrefsFile).version === 1 &&
    (parsed as ResearchPrefsFile).prefs
  ) {
    return coercePrefs((parsed as ResearchPrefsFile).prefs);
  }
  // 旧版裸对象兼容：直接把整个对象当 prefs 读。
  return coercePrefs(parsed);
}

export async function saveResearchPrefs(prefs: ResearchPrefs): Promise<ResearchPrefs> {
  const normalized = coercePrefs(prefs);
  const file: ResearchPrefsFile = { version: 1, prefs: normalized };
  await mkdir(getConfigDir(), { recursive: true });
  await writeFile(getPrefsPath(), JSON.stringify(file, null, 2), 'utf-8');
  return normalized;
}

/**
 * 把研究偏好渲染成给 agent 系统提示词用的中文段落。
 */
export function renderResearchPrefsForPrompt(prefs: ResearchPrefs): string {
  const purposeLine =
    prefs.researchPurpose === 'causal'
      ? '- 研究目的：**因果识别**。Planner 必须采用明确的识别策略（DID / IV / RDD / 合成控制 / PSM 等），结论按因果效应撰写；如只能提供关联性证据，必须显式降级并在 verdict 中标注 "associational"。'
      : '- 研究目的：**关联性探索**。不强制因果识别；可用 OLS / Logit / Probit + 固定效应或聚类控制。结论严禁使用因果语言（因果、导致、使……，effect of X on Y 等），统一表述为"相关 / 关联 / 在控制…之后仍显著"。';

  return ['【用户研究偏好（由"研究设置"面板设定，最高优先级）】', purposeLine].join('\n');
}
