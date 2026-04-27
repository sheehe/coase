import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppLanguage } from '../../../shared/app-prefs';
import { changeLanguage } from '../../lib/i18n';

const LANGUAGE_OPTIONS: AppLanguage[] = ['auto', 'zh', 'en'];

/**
 * 通用设置页里的"界面语言"卡片。读取 / 写入 app-prefs.language，
 * 写入后立刻调 i18n.changeLanguage 让当前 UI 切语言。
 *
 * 已经在跑的 agent session 不受影响——语言在 session 启动时锁进 system prompt。
 * 新建 session 会用最新值。
 */
export default function GeneralSection() {
  const { t, i18n } = useTranslation('settings');
  const [language, setLanguage] = useState<AppLanguage>('auto');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prefs = await window.coase.appPrefs.get();
        if (!cancelled) setLanguage(prefs.language);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onChange = async (next: AppLanguage) => {
    setLanguage(next);
    // 先写盘——agent 下次启动 session 时读这条；再调 i18n 切当前 UI。
    await window.coase.appPrefs.set({ language: next });
    const resolved = await window.coase.appPrefs.resolvedLanguage();
    if (resolved !== i18n.language) {
      await changeLanguage(resolved);
    }
  };

  return (
    <section className="flex flex-col gap-6 pt-6">
      <div className="rounded-2xl border border-border bg-bg p-6">
        <h2 className="text-[16px] font-semibold tracking-tight text-fg">
          {t('general.language.title')}
        </h2>
        <p className="mt-1.5 max-w-[640px] text-[13px] leading-5 text-fg-muted">
          {t('general.language.description')}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((opt) => {
            const active = opt === language;
            return (
              <button
                key={opt}
                type="button"
                disabled={loading}
                onClick={() => void onChange(opt)}
                className={[
                  'rounded-full border px-4 py-1.5 text-[13px] font-medium transition',
                  active
                    ? 'border-fg bg-fg text-bg'
                    : 'border-border text-fg hover:border-border-strong hover:bg-black/[0.03] dark:hover:bg-white/[0.04]',
                  loading ? 'opacity-50' : '',
                ].join(' ')}
              >
                {t(`general.language.options.${opt}`)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
