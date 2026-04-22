import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ChevronLeft } from '../components/Icons';
import ModelsAndSkillsSection from '../features/settings/ModelsAndSkillsSection';
import ResearchPrefsSection from '../features/settings/ResearchPrefsSection';
import UpdateCard from '../features/settings/UpdateCard';

type SettingsTab = 'research' | 'models' | 'updates';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'research', label: '研究偏好' },
  { id: 'models', label: '模型与技能' },
  { id: 'updates', label: '应用更新' },
];

const DEFAULT_TAB: SettingsTab = 'research';

function normalizeTab(value: string | null): SettingsTab {
  if (value === 'research' || value === 'models' || value === 'updates') return value;
  return DEFAULT_TAB;
}

export default function SettingsPage() {
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
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-fg">设置</h1>
          <p className="mt-2 max-w-[760px] text-[14px] leading-6 text-fg-muted">
            在这里集中管理研究偏好、模型提供方、本地技能和应用更新。
          </p>
        </div>

        <Link
          to="/chat"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-fg-muted transition hover:border-border-strong hover:bg-black/[0.03] hover:text-fg dark:hover:bg-white/[0.04]"
        >
          <ChevronLeft size={13} />
          <span>返回对话</span>
        </Link>
      </section>

      <nav className="flex items-center gap-1 border-b border-border">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              className={[
                '-mb-px border-b-2 px-4 py-2.5 text-[13px] font-medium transition',
                active
                  ? 'border-fg text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === 'research' && <ResearchPrefsSection />}
      {activeTab === 'models' && <ModelsAndSkillsSection />}
      {activeTab === 'updates' && <UpdateCard />}
    </div>
  );
}
