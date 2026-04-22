import { useCallback, useEffect, useState } from 'react';

import type { ProviderPreset, ProviderRecord, ProvidersFile } from '../../../shared/providers';
import CriticPanelCard from './CriticPanelCard';
import ProviderEditDialog, { type DialogMode } from './ProviderEditDialog';
import ProviderList from './ProviderList';
import SkillList from './SkillList';

export default function ModelsAndSkillsSection() {
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
    <div className="flex flex-col gap-5">
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
