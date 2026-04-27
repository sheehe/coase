// 应用级偏好（不属于研究领域，比如界面语言、主题等）。落盘到
// {userData}/config/app-prefs.json，由 main 进程写读，renderer 通过 IPC 访问。
//
// 同时被 agent/ (main) 和 src/ (renderer) import，所以这里只放纯类型与默认值。

export type AppLanguage = 'auto' | 'zh' | 'en';

/**
 * 收敛后的实际 UI / agent 语言。'auto' 不会出现在这里——main 端的
 * resolveAppLanguage() 会把它根据 app.getLocale() 收敛到 zh 或 en。
 */
export type ResolvedLanguage = 'zh' | 'en';

export interface AppPrefs {
  /**
   * 界面与 agent 输出语言。
   * - 'auto'：跟随系统语言（含中文家族 → zh，否则 → en）
   * - 'zh' / 'en'：用户显式指定
   *
   * 设置变更后 UI 立即切换，正在跑的 agent 会话保留旧语言（提示词在 session 启动时锁定），
   * 新建会话使用最新值。
   */
  language: AppLanguage;
}

export const DEFAULT_APP_PREFS: AppPrefs = {
  language: 'auto',
};

/** 磁盘持久化结构，带 version 便于以后演进。 */
export interface AppPrefsFile {
  version: 1;
  prefs: AppPrefs;
}
