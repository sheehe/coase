// Skill 列表项的共享类型。renderer 在 Settings 页显示，main 在 scanner 里产出。

export type SkillSource = 'coase-builtin' | 'coase-user';

export interface SkillInfo {
  /** 用户可见的 skill 名，来自 frontmatter `name`。 */
  name: string;
  /** Frontmatter 里的 description，UI 显示 + Claude 渐进式披露都用它。 */
  description: string;
  /** 所属 plugin。Phase 3 只有 coase-builtin + coase-user 两个。 */
  source: SkillSource;
  /** SKILL.md 的绝对路径，Step 2 的 skill 编辑器要用来读写这个文件。 */
  filePath: string;
  /** Frontmatter 原文（去掉 --- 分隔符）以及 body，两部分分开，便于编辑器加载时不重新解析。 */
  frontmatterRaw: string;
  body: string;
}
