import { useCallback, useEffect, useState } from 'react';

import Button from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import type { SkillInfo } from '../../../shared/skills';

export default function SkillList() {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await window.coase.skills.list();
      setSkills(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleImport = useCallback(async () => {
    setBusy(true);
    try {
      const result = await window.coase.skills.import();
      if (result.ok) {
        await reload();
      } else if (result.error && result.error !== 'cancelled') {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const handleDelete = useCallback(
    async (name: string) => {
      setBusy(true);
      try {
        await window.coase.skills.delete(name);
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const handleOpenDir = useCallback(() => {
    void window.coase.skills.openUserDir();
  }, []);

  const user = skills?.filter((skill) => skill.source === 'coase-user') ?? [];

  return (
    <Card className="overflow-hidden">
      <CardBody className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">技能</div>
          <div className="mt-1 text-[13px] leading-6 text-fg-muted">
            这里只显示用户自己安装的技能。导入 `SKILL.md` 文件或技能文件夹即可安装新技能。
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenDir}
            className="rounded-full px-3.5"
            title="在文件管理器中打开用户技能目录"
          >
            打开目录
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleImport()}
            disabled={busy}
            className="rounded-full px-3.5"
          >
            {busy ? '导入中…' : '导入技能'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void reload()}
            className="rounded-full px-3.5"
          >
            刷新
          </Button>
        </div>
      </CardBody>

      {error && (
        <div className="border-b border-danger/20 bg-danger/5 px-5 py-3 text-sm text-danger">
          加载失败：{error}
        </div>
      )}

      {!skills && !error && <div className="px-5 py-10 text-sm text-fg-subtle">正在加载技能…</div>}

      {skills && (
        <SkillGroup
          title="用户"
          sourceLabel="COASE-USER"
          entries={user}
          emptyHint="还没有安装用户技能。点击“导入技能”来安装，或把 `SKILL.md` 放入用户技能目录。"
          onDelete={handleDelete}
          busy={busy}
        />
      )}
    </Card>
  );
}

function SkillGroup({
  title,
  sourceLabel,
  entries,
  emptyHint,
  onDelete,
  busy,
}: {
  title: string;
  sourceLabel: string;
  entries: SkillInfo[];
  emptyHint: string;
  onDelete?: (name: string) => Promise<void>;
  busy?: boolean;
}) {
  return (
    <section className="px-5 py-4">
      <div className="mb-3 flex items-center gap-2 text-[12px] text-fg-subtle">
        <span>{title}</span>
        <span>({sourceLabel})</span>
        <span>·</span>
        <span>{entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <div className="text-[13px] leading-6 text-fg-muted">{emptyHint}</div>
      ) : (
        <ul className="divide-y divide-border rounded-[20px] border border-border">
          {entries.map((skill) => (
            <li key={`${skill.source}:${skill.name}`} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="truncate text-[14px] font-medium text-fg">{skill.name}</span>
                    <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-fg-subtle">
                      user
                    </span>
                  </div>
                  <div className="mt-1 text-[13px] leading-6 text-fg-muted">
                    {skill.description}
                  </div>
                </div>

                {onDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onDelete(skill.name)}
                    className="shrink-0 rounded-full px-3"
                  >
                    删除
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
