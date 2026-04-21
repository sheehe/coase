// research-prefs.json 读写层。结构和 providers/config-store.ts 一致：
// 文件缺失 / 字段残缺时回退到默认值，不抛错；写盘时会自动建目录。
// 只跑在 main process；renderer 通过 IPC 访问。

import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DEFAULT_RESEARCH_PREFS,
  type MethodDiscipline,
  type OutputLanguage,
  type ResearchPrefs,
  type ResearchPrefsFile,
  type ResearchPurpose,
  type SignificanceLevel,
} from '../../shared/research-prefs';

function getConfigDir(): string {
  return join(app.getPath('userData'), 'config');
}

function getPrefsPath(): string {
  return join(getConfigDir(), 'research-prefs.json');
}

const RESEARCH_PURPOSES: readonly ResearchPurpose[] = ['causal', 'associational'];
const METHOD_DISCIPLINES: readonly MethodDiscipline[] = ['strict', 'exploratory'];
const SIGNIFICANCE_LEVELS: readonly SignificanceLevel[] = ['0.01', '0.05', '0.10'];
const OUTPUT_LANGUAGES: readonly OutputLanguage[] = ['zh-CN', 'en'];

function coercePrefs(input: unknown): ResearchPrefs {
  if (!input || typeof input !== 'object') return { ...DEFAULT_RESEARCH_PREFS };
  const raw = input as Record<string, unknown>;
  return {
    researchPurpose: RESEARCH_PURPOSES.includes(raw.researchPurpose as ResearchPurpose)
      ? (raw.researchPurpose as ResearchPurpose)
      : DEFAULT_RESEARCH_PREFS.researchPurpose,
    methodDiscipline: METHOD_DISCIPLINES.includes(raw.methodDiscipline as MethodDiscipline)
      ? (raw.methodDiscipline as MethodDiscipline)
      : DEFAULT_RESEARCH_PREFS.methodDiscipline,
    significanceLevel: SIGNIFICANCE_LEVELS.includes(raw.significanceLevel as SignificanceLevel)
      ? (raw.significanceLevel as SignificanceLevel)
      : DEFAULT_RESEARCH_PREFS.significanceLevel,
    outputLanguage: OUTPUT_LANGUAGES.includes(raw.outputLanguage as OutputLanguage)
      ? (raw.outputLanguage as OutputLanguage)
      : DEFAULT_RESEARCH_PREFS.outputLanguage,
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
 * 返回空字符串表示不追加（当前默认值齐全，总是返回非空字符串）。
 */
export function renderResearchPrefsForPrompt(prefs: ResearchPrefs): string {
  const purposeLine =
    prefs.researchPurpose === 'causal'
      ? '- 研究目的：**因果识别**。Planner 必须采用明确的识别策略（DID / IV / RDD / 合成控制 / PSM 等），结论按因果效应撰写；如只能提供关联性证据，必须显式降级并在 verdict 中标注 "associational"。'
      : '- 研究目的：**关联性探索**。不强制因果识别；可用 OLS / Logit / Probit + 固定效应或聚类控制。结论严禁使用因果语言（因果、导致、使……，effect of X on Y 等），统一表述为"相关 / 关联 / 在控制…之后仍显著"。';

  const disciplineLine =
    prefs.methodDiscipline === 'strict'
      ? '- 方法切换纪律：**严格模式**。识别通过 + 系数不显著 = 合法 null result，直接进入 robustness 并如实汇报，禁止因为不显著而换方法、调样本、加控制变量。仅当识别诊断失败（平行趋势被拒 / 弱工具 / 带宽崩 / 测量失效等）才按 planner 预注册的 fallback 队列切识别策略。每次切换必须在 verdict/spec_log.md 里写明诊断理由。'
      : '- 方法切换纪律：**探索模式**。允许在不显著 / 系数异常时尝试其他方法或样本切片，但所有这类产物必须在标题与 verdict 里打上 "EXPLORATORY" 标签，不得冒充 confirmatory 研究。每次切换仍需记入 verdict/spec_log.md。';

  const sigLine = `- 默认显著性水平：α = ${prefs.significanceLevel}。verdict、诊断判决、星标记号以该阈值为默认标准；除非任务明确要求其它 α，否则不要擅自更改。`;

  const langLine =
    prefs.outputLanguage === 'zh-CN'
      ? '- 产物语言：表格标题、图题、verdict 报告、用户可见的总结默认使用**简体中文**；方法术语、变量名、模型名、代码注释保留英文惯例。'
      : '- 产物语言：表格标题、图题、verdict 报告、用户可见的总结默认使用**英文**；代码注释保留英文，解释性对话默认也用英文。';

  return [
    '【用户研究偏好（由"研究设置"面板设定，最高优先级）】',
    purposeLine,
    disciplineLine,
    sigLine,
    langLine,
  ].join('\n');
}
