import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ChevronLeft } from '../components/Icons';
import CriticPanelCard from '../features/settings/CriticPanelCard';
import ProviderEditDialog, { type DialogMode } from '../features/settings/ProviderEditDialog';
import ProviderList from '../features/settings/ProviderList';
import SkillList from '../features/settings/SkillList';
import UpdateCard from '../features/settings/UpdateCard';
import type { ProviderPreset, ProviderRecord, ProvidersFile } from '../../shared/providers';

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
      const ok = window.confirm(`确定要删除模型提供方“${target.label}”吗？`);
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
    <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col gap-5 px-8 py-8">
      <section className="flex items-start justify-between gap-6 border-b border-border pb-5">
        <div className="min-w-0">
          <div className="text-[12px] uppercase tracking-[0.2em] text-fg-subtle">Workspace</div>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-fg">技能与模型</h1>
          <p className="mt-2 max-w-[760px] text-[14px] leading-6 text-fg-muted">
            在这里集中管理模型提供方、API 配置和本地技能。环境变量仍可作为回退，内置 SDK
            skill 不在这里列出。
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

      {loadError && (
        <section className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          读取设置失败：{loadError}
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

      {file && <CriticPanelCard providers={file.providers} />}

      <SkillList />

      <UpdateCard />

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
