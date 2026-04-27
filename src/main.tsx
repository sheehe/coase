import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initI18n } from './lib/i18n';
import './styles/globals.css';

// 先把 i18n 初始化好（语言由 main 端读 app-prefs 后告诉我们），再渲染 React。
// 不这么做的话首屏会先用 fallbackLng 闪一下再切语言，体验有抖动。
async function bootstrap(): Promise<void> {
  let language: 'zh' | 'en' = 'zh';
  try {
    language = await window.coase.appPrefs.resolvedLanguage();
  } catch (err) {
    // IPC 异常（比如 preload 还没就绪）退到默认中文，比让整个应用挂掉强。
    console.warn('[i18n] resolveLanguage failed, fallback to zh', err);
  }

  await initI18n(language);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
