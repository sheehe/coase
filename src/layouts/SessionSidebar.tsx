// 会话侧边栏：用更像研究 Explorer 的方式同时呈现历史会话与工作区文件树。
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import type { WorkspaceFilePreview, WorkspaceTreeNode } from '../../shared/ipc';
import type { SessionLogEntry } from '../../shared/runs';
import {
  BarChart2,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Plus,
  RefreshCw,
  Settings,
  Trash,
  Wrench,
} from '../components/Icons';
import MarkdownContent from '../components/MarkdownContent';
import Button from '../components/ui/Button';
import Dialog from '../components/ui/Dialog';
import { useChat } from '../features/chat/ChatContext';

type SessionGroup = {
  title: string;
  entries: SessionLogEntry[];
};

export default function SessionSidebar() {
  const [sessions, setSessions] = useState<SessionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [workspaceTrees, setWorkspaceTrees] = useState<Record<string, WorkspaceTreeNode[]>>({});
  const [sessionWorkspaceRoots, setSessionWorkspaceRoots] = useState<Record<string, string | null>>({});
  const [loadingTrees, setLoadingTrees] = useState<Record<string, boolean>>({});
  const [previewFile, setPreviewFile] = useState<WorkspaceFilePreview | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const {
    onNewSession,
    chatState,
    sessionId,
    openHistoricalSession,
    summaryRefreshKey,
    workspaceRoot,
    workspaceMode,
    chooseWorkspaceRoot,
  } = useChat();
  const navigate = useNavigate();
  const location = useLocation();

  const loadSessions = useCallback(async () => {
    try {
      const recent = await window.coase.sessions.recent(100);
      setSessions(recent);
    } catch (error) {
      console.error('load sessions failed', error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions, summaryRefreshKey]);

  const loadWorkspaceTree = useCallback(
    async (sessionId: string) => {
      if (workspaceTrees[sessionId] || loadingTrees[sessionId]) return;
      setLoadingTrees((prev) => ({ ...prev, [sessionId]: true }));
      try {
        const [tree, root] = await Promise.all([
          window.coase.workspaces.listTree(sessionId),
          window.coase.workspaces.getRoot(sessionId),
        ]);
        setWorkspaceTrees((prev) => ({ ...prev, [sessionId]: tree }));
        setSessionWorkspaceRoots((prev) => ({ ...prev, [sessionId]: root }));
      } catch (error) {
        console.warn('load workspace tree failed', { sessionId, error });
        setWorkspaceTrees((prev) => ({ ...prev, [sessionId]: [] }));
        setSessionWorkspaceRoots((prev) => ({ ...prev, [sessionId]: null }));
      } finally {
        setLoadingTrees((prev) => ({ ...prev, [sessionId]: false }));
      }
    },
    [loadingTrees, workspaceTrees],
  );

  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  const toggleSession = useCallback(
    (sessionId: string) => {
      setExpandedSessions((prev) => {
        const nextOpen = !prev[sessionId];
        if (nextOpen) {
          void loadWorkspaceTree(sessionId);
        }
        return { ...prev, [sessionId]: nextOpen };
      });
    },
    [loadWorkspaceTree],
  );

  const toggleFolder = useCallback((nodePath: string) => {
    setExpandedFolders((prev) => ({ ...prev, [nodePath]: !prev[nodePath] }));
  }, []);

  const handleSelectFile = useCallback(async (node: WorkspaceTreeNode) => {
    if (!node.filePath) return;
    const preview = await window.coase.workspaces.previewFile(node.filePath);
    if (preview) {
      setPreviewFile(preview);
      return;
    }
    await window.coase.artifacts.openPath(node.filePath);
  }, []);

  const handleDeleteSession = useCallback(
    async (entry: SessionLogEntry) => {
      if (entry.sessionId === sessionId) return;
      // 运行中的会话（还没写最终 finishReason）不能删：main 进程也会拒绝。
      if (entry.finishReason === undefined) return;
      const confirmed = window.confirm(`确定删除会话“${entry.firstPrompt.slice(0, 28)}”吗？`);
      if (!confirmed) return;

      setDeletingSessionId(entry.sessionId);
      try {
        await window.coase.sessions.delete(entry.sessionId);
        setSessions((prev) => prev.filter((item) => item.sessionId !== entry.sessionId));
        setExpandedSessions((prev) => {
          const next = { ...prev };
          delete next[entry.sessionId];
          return next;
        });
        setWorkspaceTrees((prev) => {
          const next = { ...prev };
          delete next[entry.sessionId];
          return next;
        });
        setSessionWorkspaceRoots((prev) => {
          const next = { ...prev };
          delete next[entry.sessionId];
          return next;
        });
      } catch (error) {
        console.error('delete session failed', error);
      } finally {
        setDeletingSessionId(null);
      }
    },
    [sessionId],
  );

  const canChangeWorkspace = chatState !== 'running';

  return (
    <>
      <aside className="flex h-full w-full shrink-0 flex-col bg-sidebar">
        <div className="space-y-3 px-4 pb-3 pt-4">
          <button
            type="button"
            onClick={() => {
              void onNewSession();
              navigate('/chat');
            }}
            disabled={chatState === 'running'}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border/70 bg-surface px-3 text-[13px] font-medium text-fg transition hover:bg-app disabled:cursor-not-allowed disabled:text-fg-subtle"
          >
            <Plus size={13} />
            <span>新会话</span>
          </button>

          <div className="rounded-lg border border-border/70 bg-surface px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-[0.16em] text-fg-subtle">工作区目录</div>
              <button
                type="button"
                onClick={() => void chooseWorkspaceRoot()}
                disabled={!canChangeWorkspace}
                title="选择工作区目录"
                aria-label="选择工作区目录"
                className="inline-flex h-5 w-5 items-center justify-center rounded-md text-fg transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:text-fg-subtle dark:hover:bg-white/[0.04]"
              >
                <Plus size={13} />
              </button>
            </div>
            {workspaceMode === 'custom' && workspaceRoot ? (
              <div className="mt-2 truncate text-[12px] leading-5 text-fg-muted" title={workspaceRoot}>
                {middleEllipsis(workspaceRoot, 40)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex items-center px-4 pb-2 pt-4">
            <span className="text-[11px] uppercase tracking-[0.16em] text-fg-subtle">会话历史</span>
            <button
              type="button"
              onClick={() => void loadSessions()}
              className="ml-auto rounded-md p-1 text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
              aria-label="刷新会话历史"
            >
              <RefreshCw size={12} />
            </button>
          </div>

          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-fg-subtle">加载中…</div>
          ) : groups.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-fg-subtle">还没有会话，从右侧开始。</div>
          ) : (
            <div className="space-y-4 pb-6">
              {groups.map((group) => (
                <section key={group.title}>
                  <div className="px-4 pb-1.5 text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
                    {group.title}
                  </div>

                  <div className="space-y-0.5">
                    {group.entries.map((entry) => {
                      const isExpanded = !!expandedSessions[entry.sessionId];
                      const tree = workspaceTrees[entry.sessionId] ?? [];
                      const workspaceTreeRoot = buildWorkspaceTreeRoot(
                        entry,
                        sessionWorkspaceRoots[entry.sessionId] ?? null,
                        tree,
                      );
                      const isLoadingTree = !!loadingTrees[entry.sessionId];
                      const isRunning = entry.finishReason === undefined;
                      const isCurrent = entry.sessionId === sessionId;
                      const deleteDisabled =
                        deletingSessionId === entry.sessionId || isCurrent || isRunning;
                      const deleteTitle = isCurrent
                        ? '当前会话不可删除'
                        : isRunning
                          ? '运行中的会话不可删除'
                          : '删除会话';

                      return (
                        <div key={entry.sessionId} className="mx-1">
                          <div
                            className={[
                              'group flex items-center gap-1 rounded-lg px-1 py-1 transition',
                              isCurrent
                                ? 'bg-accent/[0.08] dark:bg-accent/[0.12]'
                                : isExpanded
                                  ? 'bg-black/[0.05] dark:bg-white/[0.05]'
                                  : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]',
                            ].join(' ')}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSession(entry.sessionId)}
                              className="inline-flex h-5 w-4 shrink-0 items-center justify-center text-fg-subtle transition hover:text-fg"
                              aria-label={isExpanded ? '收起工作区文件树' : '展开工作区文件树'}
                            >
                              {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => void openHistoricalSession(entry)}
                              className="flex min-w-0 flex-1 items-center gap-1 text-left"
                              aria-label={`切换到会话 ${entry.firstPrompt.slice(0, 24)}`}
                            >
                              <span className="shrink-0 text-[12px] text-fg-muted">
                                {formatClock(entry.startedAt)}
                              </span>
                              <span className="line-clamp-1 min-w-0 flex-1 text-[12px] leading-5 text-fg">
                                {entry.firstPrompt.slice(0, 48)}
                              </span>
                              {isRunning ? (
                                <span
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-[1px] text-[10px] font-medium text-accent"
                                  title="会话正在运行"
                                >
                                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                                  运行中
                                </span>
                              ) : entry.ok === false ? (
                                <span
                                  className="inline-flex shrink-0 items-center rounded-full border border-danger/30 bg-danger/5 px-1.5 py-[1px] text-[10px] font-medium text-danger"
                                  title={entry.errorMessage ?? '会话以失败结束'}
                                >
                                  失败
                                </span>
                              ) : null}
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleDeleteSession(entry)}
                              disabled={deleteDisabled}
                              title={deleteTitle}
                              aria-label="删除会话"
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-subtle opacity-0 transition hover:bg-black/[0.05] hover:text-fg group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/[0.06]"
                            >
                              <Trash size={11} />
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="pt-1">
                              {isLoadingTree ? (
                                <div className="px-2 py-2 text-[12px] text-fg-subtle">加载文件树…</div>
                              ) : tree.length === 0 ? (
                                <div className="px-2 py-2 text-[12px] text-fg-subtle">
                                  当前会话还没有可展示的工作区文件。
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <WorkspaceTreeItem
                                    key={workspaceTreeRoot.path}
                                    node={workspaceTreeRoot}
                                    expandedFolders={expandedFolders}
                                    onToggleFolder={toggleFolder}
                                    onSelectFile={handleSelectFile}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/80 px-2 pb-4 pt-3">
          <SidebarMenuLink
            to="/usage"
            icon={<BarChart2 size={14} />}
            label="用量与花销"
            active={location.pathname === '/usage'}
          />
          <SidebarMenuLink
            to="/settings"
            icon={<Wrench size={14} />}
            label="技能与模型"
            active={location.pathname === '/settings'}
          />
          <SidebarMenuLink to="/settings" icon={<Settings size={14} />} label="设置" />
        </div>
      </aside>

      <Dialog
        open={!!previewFile}
        onClose={() => setPreviewFile(null)}
        title={previewFile?.name ?? '文件预览'}
        widthClass="max-w-3xl"
        footer={
          previewFile?.filePath ? (
            <>
              <Button variant="secondary" onClick={() => setPreviewFile(null)}>
                关闭
              </Button>
              <Button
                onClick={() => {
                  void window.coase.artifacts.openPath(previewFile.filePath);
                }}
              >
                打开原文件
              </Button>
            </>
          ) : undefined
        }
      >
        {previewFile ? (
          <div className="space-y-3">
            <div className="text-[12px] text-fg-subtle">{previewFile.filePath}</div>
            {previewFile.mediaType === 'text/markdown' ? (
              <MarkdownContent content={previewFile.content} className="text-[13px] leading-7" />
            ) : (
              <pre className="overflow-x-auto rounded-2xl border border-border bg-app p-4 font-mono text-[12px] leading-[1.65] whitespace-pre-wrap text-fg">
                {previewFile.content}
              </pre>
            )}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

function WorkspaceTreeItem({
  node,
  depth = 0,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
}: {
  node: WorkspaceTreeNode;
  depth?: number;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (nodePath: string) => void;
  onSelectFile: (node: WorkspaceTreeNode) => void;
}) {
  const paddingLeft = `${depth * 10}px`;

  if (node.kind === 'directory') {
    const isExpanded = expandedFolders[node.path] ?? true;
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggleFolder(node.path)}
          className="flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[11px] text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
          style={{ paddingLeft }}
        >
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <Folder size={11} />
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded &&
          node.children?.map((child) => (
            <WorkspaceTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelectFile(node)}
      className="flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[11px] text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
      style={{ paddingLeft }}
      title={node.filePath ?? node.path}
    >
      <span className="inline-block w-2.5 shrink-0" />
      <FileText size={11} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

function SidebarMenuLink({
  to,
  icon,
  label,
  active = false,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      className={[
        'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-fg-muted transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]',
        active ? 'bg-black/[0.04] text-fg dark:bg-white/[0.04]' : '',
      ].join(' ')}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function groupSessions(entries: SessionLogEntry[]): SessionGroup[] {
  const today: SessionLogEntry[] = [];
  const yesterday: SessionLogEntry[] = [];
  const earlier: SessionLogEntry[] = [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

  for (const entry of entries) {
    if (entry.startedAt >= todayStart) today.push(entry);
    else if (entry.startedAt >= yesterdayStart) yesterday.push(entry);
    else earlier.push(entry);
  }

  return [
    { title: '今天', entries: today },
    { title: '昨天', entries: yesterday },
    { title: '更早', entries: earlier },
  ].filter((group) => group.entries.length > 0);
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function buildWorkspaceTreeRoot(
  entry: SessionLogEntry,
  workspaceRoot: string | null,
  children: WorkspaceTreeNode[],
): WorkspaceTreeNode {
  const resolvedRoot = workspaceRoot ?? entry.workspaceRoot ?? '';
  return {
    name: getWorkspaceRootName(resolvedRoot),
    path: `workspace-root:${entry.sessionId}`,
    kind: 'directory',
    filePath: resolvedRoot || undefined,
    children,
  };
}

function getWorkspaceRootName(workspaceRoot: string): string {
  const trimmed = workspaceRoot.trim();
  if (!trimmed) return '工作区目录';
  const normalized = trimmed.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalized;
}

function middleEllipsis(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const headLength = Math.ceil((maxLength - 1) / 2);
  const tailLength = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, headLength)}…${value.slice(value.length - tailLength)}`;
}
