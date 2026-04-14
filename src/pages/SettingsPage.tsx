import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ChevronLeft } from '../components/Icons';
import ProviderEditDialog, { type DialogMode } from '../features/settings/ProviderEditDialog';
import ProviderList from '../features/settings/ProviderList';
import SkillList from '../features/settings/SkillList';
import type { ProviderPreset, ProviderRecord, ProvidersFile } from '../../shared/providers';

/**
 * Settings 页面：展示 provider 管理和 skill 列表。
 */
export default function SettingsPage() {
  const [file, setFile] = useState<ProvidersFile | null>(null);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<{
    mode: DialogMode;
    record: ProviderRecord | null;
  } | null>(null);

  const reload = useCallback(async () => {
    try {
      const [f, p] = await Promise.all([
        window.coase.providers.list(),
        window.coase.providers.presets(),
      ]);
      setFile(f);
      setPresets(p);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAdd = useCallback(() => {
    setEditing({ mode: 'new', record: null });
  }, []);

  const handleEdit = useCallback((record: ProviderRecord) => {
    setEditing({ mode: 'edit', record });
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      const target = file?.providers.find((p) => p.id === id);
      if (!target) return;
      const ok = window.confirm(`确定要删除 provider "${target.label}" 吗？`);
      if (!ok) return;
      await window.coase.providers.delete(id);
      await reload();
    },
    [file, reload],
  );

  const handleSetActive = useCallback(
    async (id: string) => {
      await window.coase.providers.setActive(id);
      await reload();
    },
    [reload],
  );

  const handleSave = useCallback(
    async (record: ProviderRecord) => {
      await window.coase.providers.upsert(record);
      await reload();
    },
    [reload],
  );

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1120px] flex-col gap-6 overflow-y-auto px-8 py-8">
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-fg">设置</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Provider、API key 与 skills 在这里集中管理。env 变量仍可作为 fallback。
            </p>
          </div>
          <Link
            to="/chat"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-fg-muted transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
          >
            <ChevronLeft size={14} />
            <span>返回对话</span>
          </Link>
        </div>
      </section>

      {loadError && (
        <section className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          加载失败：{loadError}
        </section>
      )}

      {file && (
        <ProviderList
          providers={file.providers}
          activeId={file.activeProviderId}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={(id) => void handleDelete(id)}
          onSetActive={(id) => void handleSetActive(id)}
        />
      )}

      <SkillList />

      <ProviderEditDialog
        open={editing !== null}
        mode={editing?.mode ?? 'new'}
        initial={editing?.record ?? null}
        presets={presets}
        onClose={() => setEditing(null)}
        onSave={handleSave}
      />
    </div>
  );
}
