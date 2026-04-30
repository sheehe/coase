import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle } from '../../components/Icons';
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

const AUTO_SAVE_DEBOUNCE_MS = 250;
const FLASH_VISIBLE_MS = 1500;

export default function ResearchPrefsSection() {
  const { t } = useTranslation('settings');
  const [prefs, setPrefs] = useState<ResearchPrefs>(DEFAULT_RESEARCH_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashVisible, setFlashVisible] = useState(false);

  // 用 ref 存"是否完成首次加载"，让自动保存的 useEffect 不会在挂载时立刻把
  // 默认值写盘（防止覆盖用户磁盘上的真实配置）。reload 完成后再翻 true。
  const initialized = useRef(false);
  // 防抖计时器；卸载或下一次变更前要清掉。
  const debounceTimer = useRef<number | null>(null);
  // 闪现"已保存"提示的计时器，单独管，避免和防抖混在一起。
  const flashTimer = useRef<number | null>(null);

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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      // 等到本地 state 已经从磁盘填好后再放开自动保存——否则 prefs 的 setState
      // 会触发一次"用默认值覆盖磁盘"的写入，等于 reset。
      initialized.current = true;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const showFlash = useCallback(() => {
    setFlashVisible(true);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      setFlashVisible(false);
      flashTimer.current = null;
    }, FLASH_VISIBLE_MS);
  }, []);

  // prefs 变化即触发自动保存（防抖 250ms）。把异步操作放在 effect 里、不放在
  // onChange 里，是为了让"快速连点"只产生一次写盘。
  useEffect(() => {
    if (!initialized.current) return;
    if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      debounceTimer.current = null;
      setSaving(true);
      void window.coase.researchPrefs
        .set(prefs)
        .then((saved) => {
          // 服务端可能 normalize 字段（迁移老 schema 等），用返回值同步本地。
          // 但只在和当前 state 不同时再 setState，避免再次触发本 effect 形成回路。
          setPrefs((current) =>
            current.researchPurpose === saved.researchPurpose &&
            current.webSearchEnabled === saved.webSearchEnabled
              ? current
              : saved,
          );
          setError(null);
          showFlash();
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          setSaving(false);
        });
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current !== null) {
        window.clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [prefs, showFlash]);

  // 卸载时把 flash 计时器也清掉，防止 setState on unmounted。
  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) {
        window.clearTimeout(flashTimer.current);
        flashTimer.current = null;
      }
    };
  }, []);

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

          <div className="flex shrink-0 items-center text-[12px] leading-5">
            {saving ? (
              <span className="text-fg-subtle">{t('research.saving')}</span>
            ) : flashVisible ? (
              <span className="text-success">{t('research.savedFlash')}</span>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {error && (
        <section className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {t('research.loadError', { message: error })}
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
          />
          <div data-coach-web-search="">
            <PrefSection
              title={t('research.webSearch.title')}
              caption={t('research.webSearch.caption')}
              hint={t('research.webSearch.hint')}
              options={webSearchOptions}
              value={prefs.webSearchEnabled ? 'on' : 'off'}
              onChange={(value) => setPrefs({ ...prefs, webSearchEnabled: value === 'on' })}
            />
          </div>
        </>
      )}
    </div>
  );
}

interface PrefSectionProps<T extends string> {
  title: string;
  caption: string;
  hint?: string;
  options: OptionDef<T>[];
  value: T;
  onChange: (value: T) => void;
}

function PrefSection<T extends string>({
  title,
  caption,
  hint,
  options,
  value,
  onChange,
}: PrefSectionProps<T>) {
  return (
    <Card className="overflow-hidden">
      <CardBody className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">{title}</div>
          {hint && (
            <span
              className="inline-flex h-4 w-4 cursor-help items-center justify-center text-fg-subtle hover:text-fg-muted"
              title={hint}
              aria-label={hint}
            >
              <AlertCircle size={13} />
            </span>
          )}
        </div>
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
              className={[
                'flex flex-col items-start gap-1.5 rounded-xl border px-4 py-3.5 text-left transition',
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
