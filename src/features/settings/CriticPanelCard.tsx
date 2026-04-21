import { useCallback, useEffect, useMemo, useState } from 'react';

import Button from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import type { ProviderRecord } from '../../../shared/providers';

interface Props {
  providers: ProviderRecord[];
}

export default function CriticPanelCard({ providers }: Props) {
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
    if (selected.size === 0) return '尚未选择任何评审模型。至少勾选 1 个独立 provider 作为对抗视角。';
    return null;
  }, [selected]);

  return (
    <Card className="overflow-hidden">
      <CardBody className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">评审模型组</div>
          <div className="mt-1 text-[13px] leading-6 text-fg-muted">
            用于 idea 对抗评分、方案 critique、论文 referee 评审。主模型负责产出，评审模型提供独立第二视角。
            勾选 1 个即生效（单 critic 评语）；勾选 ≥ 2 个时聚合展示共识与分歧。目前仅支持 anthropic 协议 provider。
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
            className="shrink-0 rounded-full px-3.5"
          >
            {busy ? '保存中…' : '保存'}
          </Button>
        </div>
      </CardBody>

      {error && (
        <div className="border-b border-danger/20 bg-danger/5 px-5 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {anthropicProviders.length === 0 ? (
        <div className="px-5 py-12 text-sm text-fg-subtle">
          还没有 anthropic 协议的 provider。先到上方"模型提供方"卡片里添加几个不同 provider
          （例如 Claude 官方 + 第三方兼容端点 + 自有 proxy），再回来配置评审模型组。
        </div>
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
                ? '已启用 1 个评审模型（单 critic 评语模式），运行 /full-research 或 /paper-review 时会被自动调度。再加 1 个 provider 可进入对抗共识模式。'
                : `已启用 ${savedIds.size} 个评审模型（对抗共识模式），运行 /full-research 或 /paper-review 时会并行调度、聚合共识与分歧。`}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
