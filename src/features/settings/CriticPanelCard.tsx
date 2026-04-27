import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Button from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import type { ProviderRecord } from '../../../shared/providers';

interface Props {
  providers: ProviderRecord[];
}

export default function CriticPanelCard({ providers }: Props) {
  const { t } = useTranslation('settings');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const ids = await window.coase.providers.getCriticPanel();
      const set = new Set(ids);
      setSelected(set);
      setSavedIds(set);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 如果 providers 列表变化（删了某个已选中的），同步 selected
  useEffect(() => {
    const validIds = new Set(providers.map((p) => p.id));
    setSelected((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (validIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [providers]);

  const anthropicProviders = useMemo(
    () => providers.filter((p) => p.protocol === 'anthropic'),
    [providers],
  );

  const isDirty = useMemo(() => {
    if (selected.size !== savedIds.size) return true;
    for (const id of selected) if (!savedIds.has(id)) return true;
    return false;
  }, [selected, savedIds]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setBusy(true);
    try {
      const ids = Array.from(selected);
      await window.coase.providers.setCriticPanel(ids.length > 0 ? ids : null);
      setSavedIds(new Set(ids));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [selected]);

  const handleReset = useCallback(() => {
    setSelected(new Set(savedIds));
  }, [savedIds]);

  const warningText = useMemo(() => {
    if (selected.size === 0) return t('criticPanel.warningNoneSelected');
    return null;
  }, [selected, t]);

  return (
    <Card className="overflow-hidden">
      <CardBody className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">
            {t('criticPanel.title')}
          </div>
          <div className="mt-1 text-[13px] leading-6 text-fg-muted">
            {t('criticPanel.description')}
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
              {t('criticPanel.undo')}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={busy || !isDirty}
            className="shrink-0 rounded-full px-3.5"
          >
            {busy ? t('criticPanel.saving') : t('criticPanel.save')}
          </Button>
        </div>
      </CardBody>

      {error && (
        <div className="border-b border-danger/20 bg-danger/5 px-5 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {anthropicProviders.length === 0 ? (
        <div className="px-5 py-12 text-sm text-fg-subtle">{t('criticPanel.noProviders')}</div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {anthropicProviders.map((provider) => {
              const checked = selected.has(provider.id);
              return (
                <li key={provider.id} className="px-5 py-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(provider.id)}
                      disabled={busy}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-fg">
                          {provider.label}
                        </span>
                        <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-fg-subtle">
                          {provider.model}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[12px] text-fg-muted">
                        {provider.baseURL}
                      </div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>

          {warningText && (
            <div className="border-t border-border bg-black/[0.02] px-5 py-3 text-[12px] text-fg-muted dark:bg-white/[0.02]">
              {warningText}
            </div>
          )}

          {!warningText && savedIds.size >= 1 && (
            <div className="border-t border-border bg-black/[0.02] px-5 py-3 text-[12px] text-fg-muted dark:bg-white/[0.02]">
              {savedIds.size === 1
                ? t('criticPanel.savedSingle')
                : t('criticPanel.savedMulti', { count: savedIds.size })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
