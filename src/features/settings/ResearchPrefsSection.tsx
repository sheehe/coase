import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

export default function ResearchPrefsSection() {
  const { t } = useTranslation('settings');
  const [prefs, setPrefs] = useState<ResearchPrefs>(DEFAULT_RESEARCH_PREFS);
  const [savedPrefs, setSavedPrefs] = useState<ResearchPrefs>(DEFAULT_RESEARCH_PREFS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // 选项必须在组件内 t() 完之后才能拿到当前语种文案；切语言时随 t 引用变化。
  const purposeOptions = useMemo<OptionDef<ResearchPurpose>[]>(
    () => [
      {
        value: 'causal',
        label: t('research.purpose.options.causal.label'),
        description: t('research.purpose.options.causal.description'),
      },
      {
        value: 'associative',
        label: t('research.purpose.options.associative.label'),
        description: t('research.purpose.options.associative.description'),
      },
    ],
    [t],
  );

  const webSearchOptions = useMemo<OptionDef<'on' | 'off'>[]>(
    () => [
      {
        value: 'on',
        label: t('research.webSearch.options.on.label'),
        description: t('research.webSearch.options.on.description'),
      },
      {
        value: 'off',
        label: t('research.webSearch.options.off.label'),
        description: t('research.webSearch.options.off.description'),
      },
    ],
    [t],
  );

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
      setFlash(t('research.savedFlash'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [prefs, t]);

  const handleReset = useCallback(() => {
    setPrefs(savedPrefs);
    setFlash(null);
  }, [savedPrefs]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <CardBody className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">
              {t('research.title')}
            </div>
            <div className="mt-1 text-[13px] leading-6 text-fg-muted">
              {t('research.description')}
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
                {t('research.undo')}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={busy || !isDirty}
              className="rounded-full px-3.5"
            >
              {busy ? t('research.saving') : t('research.save')}
            </Button>
          </div>
        </CardBody>
      </Card>

      {error && (
        <section className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {t('research.loadError', { message: error })}
        </section>
      )}

      {flash && !error && (
        <section className="rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-fg-muted">
          {flash}
        </section>
      )}

      {loading ? (
        <section className="rounded-2xl border border-border bg-surface px-5 py-12 text-center text-sm text-fg-subtle">
          {t('research.loading')}
        </section>
      ) : (
        <>
          <PrefSection
            title={t('research.purpose.title')}
            caption={t('research.purpose.caption')}
            options={purposeOptions}
            value={prefs.researchPurpose}
            onChange={(value) => setPrefs({ ...prefs, researchPurpose: value })}
            disabled={busy}
          />
          <PrefSection
            title={t('research.webSearch.title')}
            caption={t('research.webSearch.caption')}
            options={webSearchOptions}
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
