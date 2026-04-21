import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ChevronLeft } from '../components/Icons';
import Button from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import {
  DEFAULT_RESEARCH_PREFS,
  type MethodDiscipline,
  type OutputLanguage,
  type ResearchPrefs,
  type ResearchPurpose,
  type SignificanceLevel,
} from '../../shared/research-prefs';

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
    value: 'associational',
    label: '关联性探索',
    description:
      '变量间的相关关系；可用 OLS / Logit / Probit 等回归模型 + 固定效应或聚类控制，结果明确声明为关联性。',
  },
];

const DISCIPLINE_OPTIONS: OptionDef<MethodDiscipline>[] = [
  {
    value: 'strict',
    label: '严格模式',
    description:
      '识别通过 + 系数不显著 = 合法 null result，按计划继续 robustness；禁止因为不显著而换方法、改样本。',
  },
  {
    value: 'exploratory',
    label: '探索模式',
    description:
      '允许在不显著时尝试其它方法或切样本，但所有这类产物会被打上 EXPLORATORY 标签，不冒充 confirmatory。',
  },
];

const SIG_OPTIONS: OptionDef<SignificanceLevel>[] = [
  { value: '0.01', label: 'α = 0.01', description: '严苛阈值（常用于大样本或高风险决策）。' },
  { value: '0.05', label: 'α = 0.05', description: '经济学与社科最常见的默认阈值。' },
  { value: '0.10', label: 'α = 0.10', description: '探索性或小样本研究的宽松阈值。' },
];

const LANG_OPTIONS: OptionDef<OutputLanguage>[] = [
  {
    value: 'zh-CN',
    label: '简体中文',
    description: '表格标题、图题、verdict 报告默认中文；方法术语和代码注释保留英文。',
  },
  {
    value: 'en',
    label: 'English',
    description: 'Tables / figures / verdicts default to English; comments and code stay in English.',
  },
];

export default function ResearchSettingsPage() {
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

  const isDirty = useMemo(() => {
    return (
      prefs.researchPurpose !== savedPrefs.researchPurpose ||
      prefs.methodDiscipline !== savedPrefs.methodDiscipline ||
      prefs.significanceLevel !== savedPrefs.significanceLevel ||
      prefs.outputLanguage !== savedPrefs.outputLanguage
    );
  }, [prefs, savedPrefs]);

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
    <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col gap-5 px-8 py-8">
      <section className="flex items-start justify-between gap-6 border-b border-border pb-5">
        <div className="min-w-0">
          <div className="text-[12px] uppercase tracking-[0.2em] text-fg-subtle">Workspace</div>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-fg">研究设置</h1>
          <p className="mt-2 max-w-[760px] text-[14px] leading-6 text-fg-muted">
            这里的偏好会被注入系统提示词，从下一个新会话起生效；运行中的会话不会被动切换口径。
            改动只影响 agent 的默认行为，你依然可以在单次会话里临时覆盖。
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
          <Link
            to="/chat"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-fg-muted transition hover:border-border-strong hover:bg-black/[0.03] hover:text-fg dark:hover:bg-white/[0.04]"
          >
            <ChevronLeft size={13} />
            <span>返回对话</span>
          </Link>
        </div>
      </section>

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
            onChange={(value) => setPrefs((prev) => ({ ...prev, researchPurpose: value }))}
            disabled={busy}
          />

          <PrefSection
            title="方法切换纪律"
            caption="系数不显著不是失败；只有识别诊断失败才允许换识别策略。严格模式会强制这条纪律；探索模式允许放宽但产物会被标注 EXPLORATORY。"
            options={DISCIPLINE_OPTIONS}
            value={prefs.methodDiscipline}
            onChange={(value) => setPrefs((prev) => ({ ...prev, methodDiscipline: value }))}
            disabled={busy}
          />

          <PrefSection
            title="默认显著性水平"
            caption="verdict、诊断判决、星标记号的默认阈值。单次会话可在任务中显式指定其它 α 覆盖。"
            options={SIG_OPTIONS}
            value={prefs.significanceLevel}
            onChange={(value) => setPrefs((prev) => ({ ...prev, significanceLevel: value }))}
            disabled={busy}
          />

          <PrefSection
            title="产物语言"
            caption="表格标题、图注、verdict 报告等用户可见产物的默认语言；不影响代码与变量命名。"
            options={LANG_OPTIONS}
            value={prefs.outputLanguage}
            onChange={(value) => setPrefs((prev) => ({ ...prev, outputLanguage: value }))}
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
