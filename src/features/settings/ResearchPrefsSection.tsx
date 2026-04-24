import { useCallback, useEffect, useState } from 'react';

import Button from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import {
  DEFAULT_RESEARCH_PREFS,
  type ResearchPrefs,
  type ResearchPurpose,
} from '../../../shared/research-prefs';

type OptionDef<T extends string> = {
  value: T;
  label: string;
  description: string;
};

const PURPOSE_OPTIONS: OptionDef<ResearchPurpose>[] = [
  {
    value: 'causal',
    label: '因果识别',
    description: '明确的 X → Y 因果效应；要求 DID / IV / RDD / PSM 等识别策略。',
  },
  {
    value: 'associative',
    label: '关联性探索',
    description:
      '变量间的相关关系；可用 OLS / Logit / Probit 等回归模型 + 固定效应或聚类控制，结果明确声明为关联性。',
  },
];

const WEB_SEARCH_OPTIONS: OptionDef<'on' | 'off'>[] = [
  {
    value: 'on',
    label: '开启（推荐）',
    description: 'Agent 可按需调用 WebSearch 联网检索参考文献、数据来源与网页资料。',
  },
  {
    value: 'off',
    label: '关闭',
    description: '禁用 WebSearch 工具。参考文献仅依赖已下载文献与本地资源，适合离线环境或需严格限定外部来源的研究。',
  },
];

export default function ResearchPrefsSection() {
  const [prefs, setPrefs] = useState<ResearchPrefs>(DEFAULT_RESEARCH_PREFS);
  const [savedPrefs, setSavedPrefs] = useState<ResearchPrefs>(DEFAULT_RESEARCH_PREFS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const loaded = await window.coase.researchPrefs.get();
      setPrefs(loaded);
      setSavedPrefs(loaded);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isDirty =
    prefs.researchPurpose !== savedPrefs.researchPurpose ||
    prefs.webSearchEnabled !== savedPrefs.webSearchEnabled;

  const handleSave = useCallback(async () => {
    setBusy(true);
    setFlash(null);
    try {
      const saved = await window.coase.researchPrefs.set(prefs);
      setSavedPrefs(saved);
      setPrefs(saved);
      setError(null);
      setFlash('已保存。下次新建会话时会自动带入这些偏好。');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [prefs]);

  const handleReset = useCallback(() => {
    setPrefs(savedPrefs);
    setFlash(null);
  }, [savedPrefs]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <CardBody className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">研究偏好</div>
            <div className="mt-1 text-[13px] leading-6 text-fg-muted">
              这里的偏好会被注入系统提示词，从下一个新会话起生效；运行中的会话不会被动切换口径。
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            {isDirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={busy}
                className="rounded-full px-3.5"
              >
                撤销
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={busy || !isDirty}
              className="rounded-full px-3.5"
            >
              {busy ? '保存中…' : '保存'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {error && (
        <section className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          读取或保存偏好失败：{error}
        </section>
      )}

      {flash && !error && (
        <section className="rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-fg-muted">
          {flash}
        </section>
      )}

      {loading ? (
        <section className="rounded-2xl border border-border bg-surface px-5 py-12 text-center text-sm text-fg-subtle">
          加载偏好…
        </section>
      ) : (
        <>
          <PrefSection
            title="研究目的"
            caption="决定 Planner 是否必须采用因果识别策略，以及 Reviewer 的评分标准。"
            options={PURPOSE_OPTIONS}
            value={prefs.researchPurpose}
            onChange={(value) => setPrefs({ ...prefs, researchPurpose: value })}
            disabled={busy}
          />
          <PrefSection
            title="联网搜索文献"
            caption="控制 agent 是否可以使用 WebSearch 工具联网检索参考文献。关闭后该工具会从 SDK 工具清单中移除。"
            options={WEB_SEARCH_OPTIONS}
            value={prefs.webSearchEnabled ? 'on' : 'off'}
            onChange={(value) => setPrefs({ ...prefs, webSearchEnabled: value === 'on' })}
            disabled={busy}
          />
        </>
      )}
    </div>
  );
}

interface PrefSectionProps<T extends string> {
  title: string;
  caption: string;
  options: OptionDef<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

function PrefSection<T extends string>({
  title,
  caption,
  options,
  value,
  onChange,
  disabled,
}: PrefSectionProps<T>) {
  return (
    <Card className="overflow-hidden">
      <CardBody className="border-b border-border px-5 py-4">
        <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">{title}</div>
        <div className="mt-1 max-w-[780px] text-[13px] leading-6 text-fg-muted">{caption}</div>
      </CardBody>

      <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              disabled={disabled}
              className={[
                'flex flex-col items-start gap-1.5 rounded-xl border px-4 py-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                active
                  ? 'border-transparent bg-fg text-app shadow-[0_0_0_1px_rgba(0,0,0,0.04)]'
                  : 'border-border bg-surface text-fg hover:border-border-strong hover:bg-black/[0.02] dark:hover:bg-white/[0.03]',
              ].join(' ')}
            >
              <div
                className={[
                  'text-[14px] font-semibold tracking-[-0.01em]',
                  active ? 'text-app' : 'text-fg',
                ].join(' ')}
              >
                {option.label}
              </div>
              <div
                className={[
                  'text-[12.5px] leading-5',
                  active ? 'text-app/75' : 'text-fg-muted',
                ].join(' ')}
              >
                {option.description}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
