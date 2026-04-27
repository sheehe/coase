import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from '../locales/en/common.json';
import enSettings from '../locales/en/settings.json';
import zhCommon from '../locales/zh/common.json';
import zhSettings from '../locales/zh/settings.json';

// 资源用 import 静态打包，不走 i18next-http-backend——Electron 渲染端跑
// file://，没有 HTTP 服务器响应 /locales/zh/common.json，硬要走后端式加载
// 会在用户机器上 404。资源量级（2 个语种 × 几个 namespace × 数十条目）
// 也完全装得下打包体积，没必要做按需。
const resources = {
  zh: {
    common: zhCommon,
    settings: zhSettings,
  },
  en: {
    common: enCommon,
    settings: enSettings,
  },
} as const;

let initPromise: Promise<void> | null = null;

/**
 * 用 main 端解出来的实际语言（'zh' | 'en'，已收敛 'auto'）做初始化。
 * 必须在 React 渲染前 await 完成，否则首屏会先用 fallbackLng 闪一下再切回来。
 *
 * 重复调用安全：第二次调用直接返回首次 promise。
 */
export function initI18n(language: 'zh' | 'en'): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: language,
      fallbackLng: 'zh',
      ns: ['common', 'settings'],
      defaultNS: 'common',
      interpolation: {
        escapeValue: false, // React 自带 XSS 防护
      },
      // i18next 26 默认开 returnNull=false，缺 key 直接返回 key 字符串，
      // 不会塞 null 进 React children 引发渲染崩溃。
      returnNull: false,
    })
    .then(() => undefined);
  return initPromise;
}

/**
 * 运行时切换语言。Settings 里语言开关改动后调用，i18next 会广播给所有
 * 用了 useTranslation 的组件，自动触发重渲。不影响已经在跑的 agent session
 * （那边的语言在 session 启动时锁定）。
 */
export async function changeLanguage(language: 'zh' | 'en'): Promise<void> {
  await i18n.changeLanguage(language);
}

export default i18n;
