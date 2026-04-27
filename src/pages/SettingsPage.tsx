import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { ChevronLeft } from '../components/Icons';
import GeneralSection from '../features/settings/GeneralSection';
import ModelsAndSkillsSection from '../features/settings/ModelsAndSkillsSection';
import ResearchPrefsSection from '../features/settings/ResearchPrefsSection';
import UpdateCard from '../features/settings/UpdateCard';

type SettingsTab = 'general' | 'research' | 'models' | 'updates';

const TAB_IDS: SettingsTab[] = ['general', 'research', 'models', 'updates'];

const DEFAULT_TAB: SettingsTab = 'general';

function normalizeTab(value: string | null): SettingsTab {
  if ((TAB_IDS as string[]).includes(value ?? '')) return value as SettingsTab;
  return DEFAULT_TAB;
}

export default function SettingsPage() {
  const { t } = useTranslation('settings');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo(() => normalizeTab(searchParams.get('tab')), [searchParams]);

  const selectTab = (tab: SettingsTab) => {
    // replace: true 是为了不把每次 tab 切换都压进 history 栈，否则用户点"后退"会
    // 在几个 tab 之间蹦跶而不是退出设置页。
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col gap-5 px-8 py-8">
      <section className="flex items-start justify-between gap-6 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-fg">{t('title')}</h1>
          <p className="mt-2 max-w-[760px] text-[14px] leading-6 text-fg-muted">
            {t('subtitle')}
          </p>
        </div>

        <Link
          to="/chat"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-fg-muted transition hover:border-border-strong hover:bg-black/[0.03] hover:text-fg dark:hover:bg-white/[0.04]"
        >
          <ChevronLeft size={13} />
          <span>{t('backToChat')}</span>
        </Link>
      </section>

      <nav className="flex items-center gap-1 border-b border-border">
        {TAB_IDS.map((id) => {
          const active = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              className={[
                '-mb-px border-b-2 px-4 py-2.5 text-[13px] font-medium transition',
                active
                  ? 'border-fg text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
            >
              {t(`tabs.${id}`)}
            </button>
          );
        })}
      </nav>

      {activeTab === 'general' && <GeneralSection />}
      {activeTab === 'research' && <ResearchPrefsSection />}
      {activeTab === 'models' && <ModelsAndSkillsSection />}
      {activeTab === 'updates' && <UpdateCard />}
    </div>
  );
}
