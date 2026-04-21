// 研究偏好配置。用户在"研究设置"页面维护，落盘到
// {userData}/config/research-prefs.json，agent 启动时读出来拼进 system prompt。
//
// 同时被 agent/ (main) 和 src/ (renderer) import，所以这里只放纯类型。

export type ResearchPurpose = 'causal' | 'associational';
export type MethodDiscipline = 'strict' | 'exploratory';
export type SignificanceLevel = '0.01' | '0.05' | '0.10';
export type OutputLanguage = 'zh-CN' | 'en';

export interface ResearchPrefs {
  /**
   * 研究目的。决定 Planner 是否必须采用因果识别策略、Reviewer 的评分维度：
   * - causal：明确的 X → Y 因果效应；要求 DID / IV / RDD / PSM 等识别策略。
   * - associational：变量间的相关关系；可用 OLS / Logit / Probit 等回归
   *   + 固定效应或聚类控制，结果明确声明为关联性。
   */
  researchPurpose: ResearchPurpose;
  /**
   * 方法切换纪律：
   * - strict：严禁"系数不显著就换方法"。只有识别诊断失败才能按 fallback 队列切识别策略。
   * - exploratory：允许在记录 EXPLORATORY 标签的前提下探索式地切换方法。
   */
  methodDiscipline: MethodDiscipline;
  /** 判决与 verdict 的默认显著性水平。 */
  significanceLevel: SignificanceLevel;
  /** 表格、图注、verdict 报告的产物语言偏好（不强制代码注释语言）。 */
  outputLanguage: OutputLanguage;
}

export const DEFAULT_RESEARCH_PREFS: ResearchPrefs = {
  researchPurpose: 'causal',
  methodDiscipline: 'strict',
  significanceLevel: '0.05',
  outputLanguage: 'zh-CN',
};

/** 磁盘持久化结构，带 version 便于以后演进。 */
export interface ResearchPrefsFile {
  version: 1;
  prefs: ResearchPrefs;
}
