// research-prefs.json 读写层。结构和 providers/config-store.ts 一致：
// 文件缺失 / 字段残缺时回退到默认值，不抛错；写盘时会自动建目录。
// 只跑在 main process；renderer 通过 IPC 访问。

import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ResolvedLanguage } from '../../shared/app-prefs';
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

const RESEARCH_PURPOSES: readonly ResearchPurpose[] = ['causal', 'associative'];

function coercePrefs(input: unknown): ResearchPrefs {
  if (!input || typeof input !== 'object') return { ...DEFAULT_RESEARCH_PREFS };
  const raw = input as Record<string, unknown>;
  // 旧版本（≤ alpha.24）用的是 'associational'，迁移到新字段名 'associative'，与
  // planner_workflow / paper-reviewer skill 约定的 research_purpose 取值一致。
  const rawPurpose = raw.researchPurpose === 'associational' ? 'associative' : raw.researchPurpose;
  return {
    researchPurpose: RESEARCH_PURPOSES.includes(rawPurpose as ResearchPurpose)
      ? (rawPurpose as ResearchPurpose)
      : DEFAULT_RESEARCH_PREFS.researchPurpose,
    webSearchEnabled:
      typeof raw.webSearchEnabled === 'boolean'
        ? raw.webSearchEnabled
        : DEFAULT_RESEARCH_PREFS.webSearchEnabled,
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
 * 把研究偏好渲染成给 agent 系统提示词用的段落，按 language 走中 / 英文版本。
 *
 * 显式暴露 `research_purpose: causal|associative` 字段名（中英版本都保留，因为
 * planner_workflow / paper-reviewer skill 里写的"上下文会注入 research_purpose 字段"
 * 指的就是这一行）。改字段名时必须同步那两个 skill。
 */
export function renderResearchPrefsForPrompt(
  prefs: ResearchPrefs,
  language: ResolvedLanguage = 'zh',
): string {
  if (language === 'en') {
    const purposeLine =
      prefs.researchPurpose === 'causal'
        ? '- Research purpose: **causal identification**. The planner must adopt an explicit identification strategy (DID / IV / RDD / synthetic control / PSM, etc.) and write conclusions as causal effects; if no data supports any causal strategy, return to Phase 1 to revise the research question — do not silently downgrade to an associational study.'
        : '- Research purpose: **associational exploration**. Causal identification is not required; OLS / Logit / Probit with fixed effects or clustering are acceptable. Conclusions must avoid causal language (cause, lead to, effect of X on Y); use "associated with / correlated with / remains significant after controlling for…" instead.';

    const webSearchLine = prefs.webSearchEnabled
      ? '- Literature web search: **enabled**. You may use WebSearch / WebFetch to retrieve academic literature, reviews, author pages, citation databases and similar reference materials as needed.'
      : '- Literature web search: **disabled**. Do not use WebSearch / WebFetch for academic literature, reviews, author pages, citation databases or any references; references must come only from already-downloaded literature and local resources. For literature-review tasks without local material, tell the user explicitly instead of going online. **This restriction targets literature only** — locating data sources, looking up data dictionaries, browsing policy / news / API documentation and other non-literature uses remain permitted.';

    return [
      '[User research preferences (set in the "Research Preferences" panel — highest priority)]',
      `- research_purpose: ${prefs.researchPurpose}`,
      purposeLine,
      `- web_search_enabled: ${prefs.webSearchEnabled}`,
      webSearchLine,
    ].join('\n');
  }

  const purposeLine =
    prefs.researchPurpose === 'causal'
      ? '- 研究目的：**因果识别**。Planner 必须采用明确的识别策略（DID / IV / RDD / 合成控制 / PSM 等），结论按因果效应撰写；若数据不支持任一因果策略，应回到 Phase 1 调整研究问题，不得降级为关联性研究。'
      : '- 研究目的：**关联性探索**。不强制因果识别；可用 OLS / Logit / Probit + 固定效应或聚类控制。结论严禁使用因果语言（因果、导致、使……，effect of X on Y 等），统一表述为"相关 / 关联 / 在控制…之后仍显著"。';

  const webSearchLine = prefs.webSearchEnabled
    ? '- 联网搜索文献：**开启**。可按需使用 WebSearch / WebFetch 检索学术文献、综述、作者主页、文献数据库等参考资料。'
    : '- 联网搜索文献：**关闭**。不得使用 WebSearch / WebFetch 检索学术文献、综述、作者主页、引文数据库或任何参考文献，参考文献仅能来自已下载文献与本地资源；literature-review 类任务若无本地资料应明确告知用户而非联网补齐。**此限制只针对文献检索**：定位数据源、查询数据字典、查看政策 / 新闻 / API 文档等非文献用途仍允许联网。';

  return [
    '【用户研究偏好（由"研究设置"面板设定，最高优先级）】',
    `- research_purpose: ${prefs.researchPurpose}`,
    purposeLine,
    `- web_search_enabled: ${prefs.webSearchEnabled}`,
    webSearchLine,
  ].join('\n');
}
