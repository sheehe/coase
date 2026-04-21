// 研究偏好配置。用户在"研究设置"页面维护，落盘到
// {userData}/config/research-prefs.json，agent 启动时读出来拼进 system prompt。
//
// 同时被 agent/ (main) 和 src/ (renderer) import，所以这里只放纯类型。

export type ResearchPurpose = 'causal' | 'associational';

export interface ResearchPrefs {
  /**
   * 研究目的。决定 Planner 是否必须采用因果识别策略、Reviewer 的评分维度：
   * - causal：明确的 X → Y 因果效应；要求 DID / IV / RDD / PSM 等识别策略。
   * - associational：变量间的相关关系；可用 OLS / Logit / Probit 等回归
   *   + 固定效应或聚类控制，结果明确声明为关联性。
   */
  researchPurpose: ResearchPurpose;
}

export const DEFAULT_RESEARCH_PREFS: ResearchPrefs = {
  researchPurpose: 'causal',
};

/** 磁盘持久化结构，带 version 便于以后演进。 */
export interface ResearchPrefsFile {
  version: 1;
  prefs: ResearchPrefs;
}
