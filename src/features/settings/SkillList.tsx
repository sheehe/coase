import { useCallback, useEffect, useState } from 'react';

import type { SkillInfo } from '../../../shared/skills';

/**
 * 只读的 skill 列表面板，Settings 页里展示当前可用 skill。
 */
export default function SkillList() {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const builtin = skills?.filter((s) => s.source === 'coase-builtin') ?? [];
  const user = skills?.filter((s) => s.source === 'coase-user') ?? [];

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-fg">Skills</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
            由 coase-builtin 与 coase-user 两个 plugin 提供。SDK 自带的 skills 不在这里列出。
          </p>
        </div>
        <button
          onClick={() => void reload()}
          className="rounded-xl border border-border px-3 py-1.5 text-[11px] text-fg-muted transition hover:border-border-strong hover:text-fg"
        >
          刷新
        </button>
      </div>

      {error && (
        <div className="border-b border-danger/20 bg-danger/5 px-5 py-3 text-sm text-danger">
          加载失败：{error}
        </div>
      )}

      {!skills && !error && <div className="px-5 py-4 text-xs text-fg-subtle">loading…</div>}

      {skills && (
        <div className="divide-y divide-border">
          <SkillGroup title="内置 (coase-builtin)" entries={builtin} emptyHint="没有内置 skill" />
          <SkillGroup
            title="用户 (coase-user)"
            entries={user}
            emptyHint="用户目录还没有 skill。Step 2 的编辑器会支持在这里新建。"
          />
        </div>
      )}
    </section>
  );
}

function SkillGroup({
  title,
  entries,
  emptyHint,
}: {
  title: string;
  entries: SkillInfo[];
  emptyHint: string;
}) {
  return (
    <div className="px-5 py-4">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-fg-subtle">
        {title} · {entries.length}
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-fg-subtle">{emptyHint}</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((skill) => (
            <li
              key={`${skill.source}:${skill.name}`}
              className="rounded-2xl border border-border bg-app px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fg">{skill.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-fg-subtle">
                  {skill.source === 'coase-builtin' ? 'builtin' : 'user'}
                </span>
              </div>
              <div className="mt-1 text-xs leading-relaxed text-fg-muted">{skill.description}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
