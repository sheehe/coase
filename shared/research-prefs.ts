// 研究偏好配置。用户在"研究设置"页面维护，落盘到
// {userData}/config/research-prefs.json，agent 启动时读出来拼进 system prompt。
//
// 同时被 agent/ (main) 和 src/ (renderer) import，所以这里只放纯类型。

export type ResearchPurpose = 'causal' | 'associative';

export interface ResearchPrefs {
  /**
   * 研究目的。决定 Planner 是否必须采用因果识别策略、Reviewer 的评分维度。
   * 对应 planner_workflow / paper-reviewer skill 中注入的 `research_purpose` 字段：
   * - causal：明确的 X → Y 因果效应；要求 DID / IV / RDD / PSM 等识别策略。
   * - associative：变量间的相关关系；可用 OLS / Logit / Probit 等回归
   *   + 固定效应或聚类控制，结果明确声明为关联性。
   */
  researchPurpose: ResearchPurpose;
  /**
   * 是否允许 agent 调用 WebSearch 工具联网搜索参考文献 / 网页资料。
   * 关闭后会从 SDK 工具清单中剔除 WebSearch，agent 只能使用已下载文献与本地资源。
   */
  webSearchEnabled: boolean;
}

export const DEFAULT_RESEARCH_PREFS: ResearchPrefs = {
  researchPurpose: 'causal',
  // 默认关闭：联网搜索文献会大幅放大 token 消耗（一次完整 review 可能多几十万 token），
  // 新用户不该被默认开启的高成本选项埋单；用户主动在"研究偏好"里打开才生效。
  webSearchEnabled: false,
};

/** 磁盘持久化结构，带 version 便于以后演进。 */
export interface ResearchPrefsFile {
  version: 1;
  prefs: ResearchPrefs;
}
