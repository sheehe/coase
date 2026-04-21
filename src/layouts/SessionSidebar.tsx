// 会话侧边栏：类 VSCode Explorer 的两段式布局。
//   上段"工作区"：常驻展示当前会话绑定的工作区文件树，像 VSCode 的 Explorer。
//   下段"会话历史"：折叠列表，只显示标题/时间/删除，不再内嵌文件树。
// 这样无论是否展开历史会话，用户都能始终看到当前产出文件；切换历史会话会
// 把上段内容也跟着切过去。
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
import { sessionsStore } from '../features/chat/sessions-store';

type SessionGroup = {
  title: string;
  entries: SessionLogEntry[];
};

export default function SessionSidebar() {
  const [sessions, setSessions] = useState<SessionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [currentTree, setCurrentTree] = useState<WorkspaceTreeNode[]>([]);
  const [currentTreeRoot, setCurrentTreeRoot] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [previewFile, setPreviewFile] = useState<WorkspaceFilePreview | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
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

  const loadCurrentWorkspaceTree = useCallback(async () => {
    if (!sessionId) {
      setCurrentTree([]);
      setCurrentTreeRoot(null);
      return;
    }
    setLoadingTree(true);
    try {
      const [tree, root] = await Promise.all([
        window.coase.workspaces.listTree(sessionId),
        window.coase.workspaces.getRoot(sessionId),
      ]);
      setCurrentTree(tree);
      setCurrentTreeRoot(root);
    } catch (error) {
      console.warn('load workspace tree failed', { sessionId, error });
      setCurrentTree([]);
      setCurrentTreeRoot(null);
    } finally {
      setLoadingTree(false);
    }
  }, [sessionId]);

  // 会话切换 / 流程结束时重新拉工作区；summaryRefreshKey 变化也触发（这说明有
  // 新的 turn_result / 产物落地），这样新生成的文件能即时出现在树里。
  useEffect(() => {
    void loadCurrentWorkspaceTree();
  }, [loadCurrentWorkspaceTree, summaryRefreshKey]);

  const groups = useMemo(() => groupSessions(sessions), [sessions]);

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
      const confirmed = window.confirm(`确定删除会话“${entry.firstPrompt.slice(0, 28)}”吗？`);
      if (!confirmed) return;

      setDeletingSessionId(entry.sessionId);
      try {
        await window.coase.sessions.delete(entry.sessionId);
        sessionsStore.disposeRuntime(entry.sessionId);
        setSessions((prev) => prev.filter((item) => item.sessionId !== entry.sessionId));
      } catch (error) {
        console.error('delete session failed', error);
        const message = error instanceof Error ? error.message : String(error);
        window.alert(
          message.includes('active session')
            ? '该会话正在运行中，无法删除。请先停止或切换到其他会话。'
            : `删除失败：${message}`,
        );
      } finally {
        setDeletingSessionId(null);
      }
    },
    [sessionId],
  );

  const canChangeWorkspace = chatState !== 'running';

  const effectiveRoot = currentTreeRoot ?? workspaceRoot;
  const workspaceTitle = effectiveRoot ? getWorkspaceRootName(effectiveRoot) : '工作区';

  return (
    <>
      <aside className="flex h-full w-full shrink-0 flex-col bg-sidebar">
        {/* 头部：新会话 + 工作区目录 badge ----------------------------------- */}
        <div className="space-y-3 px-4 pb-3 pt-4">
          <button
            type="button"
            onClick={() => {
              void onNewSession();
              navigate('/chat');
            }}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border/70 bg-surface px-3 text-[13px] font-medium text-fg transition hover:bg-app"
          >
            <Plus size={13} />
            <span>新会话</span>
          </button>

          <div className="rounded-lg border border-border/70 bg-surface px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
                工作区目录
              </div>
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
              <div
                className="mt-2 truncate text-[12px] leading-5 text-fg-muted"
                title={workspaceRoot}
              >
                {middleEllipsis(workspaceRoot, 40)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 上段：常驻工作区文件树 ---------------------------------------- */}
          <div className="px-2 pb-3 pt-1">
            <div className="flex items-center px-2 pb-1.5">
              <span
                className="truncate text-[11px] uppercase tracking-[0.16em] text-fg-subtle"
                title={effectiveRoot ?? undefined}
              >
                {workspaceTitle}
              </span>
              <div className="ml-auto flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => void loadCurrentWorkspaceTree()}
                  className="rounded-md p-1 text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
                  aria-label="刷新工作区文件"
                  title="刷新"
                >
                  <RefreshCw size={12} />
                </button>
                {effectiveRoot && (
                  <button
                    type="button"
                    onClick={() => void window.coase.artifacts.openPath(effectiveRoot)}
                    className="rounded-md p-1 text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
                    aria-label="在资源管理器中打开"
                    title="在资源管理器中打开"
                  >
                    <Folder size={12} />
                  </button>
                )}
              </div>
            </div>

            {!sessionId ? (
              <div className="px-3 py-3 text-[12px] leading-5 text-fg-subtle">
                还没开启会话。在右侧输入研究主题开始，工作区文件会自动出现在这里。
              </div>
            ) : loadingTree ? (
              <div className="px-3 py-3 text-[12px] text-fg-subtle">加载文件树…</div>
            ) : currentTree.length === 0 ? (
              <div className="px-3 py-3 text-[12px] leading-5 text-fg-subtle">
                当前会话还没有工作区文件。Coase 生成结果后会在这里出现。
              </div>
            ) : (
              <div className="space-y-0.5">
                {currentTree.map((node) => (
                  <WorkspaceTreeItem
                    key={node.path}
                    node={node}
                    expandedFolders={expandedFolders}
                    onToggleFolder={toggleFolder}
                    onSelectFile={handleSelectFile}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 下段：会话历史（折叠式） --------------------------------------- */}
          <div className="border-t border-border/60 px-1 pb-6 pt-3">
            <button
              type="button"
              onClick={() => setHistoryCollapsed((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 pb-1.5 text-left transition hover:text-fg"
              aria-expanded={!historyCollapsed}
            >
              {historyCollapsed ? (
                <ChevronRight size={10} className="text-fg-subtle" />
              ) : (
                <ChevronDown size={10} className="text-fg-subtle" />
              )}
              <span className="text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
                会话历史
              </span>
              <span className="ml-auto text-[10.5px] text-fg-subtle">{sessions.length}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void loadSessions();
                }}
                className="rounded-md p-1 text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
                aria-label="刷新会话历史"
              >
                <RefreshCw size={12} />
              </button>
            </button>

            {!historyCollapsed &&
              (loading ? (
                <div className="px-4 py-6 text-center text-sm text-fg-subtle">加载中…</div>
              ) : groups.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-fg-subtle">
                  还没有会话，从右侧开始。
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {groups.map((group) => (
                    <section key={group.title}>
                      <div className="px-4 pb-1 text-[10.5px] uppercase tracking-[0.16em] text-fg-subtle">
                        {group.title}
                      </div>
                      <div className="space-y-0.5 px-1">
                        {group.entries.map((entry) => {
                          const isCurrent = entry.sessionId === sessionId;
                          const deleteDisabled = deletingSessionId === entry.sessionId || isCurrent;
                          const deleteTitle = isCurrent ? '当前会话不可删除' : '删除会话';

                          return (
                            <div key={entry.sessionId} className="mx-1">
                              <div
                                className={[
                                  'group flex items-center gap-1 rounded-lg px-2 py-1 transition',
                                  isCurrent
                                    ? 'bg-accent/[0.08] dark:bg-accent/[0.12]'
                                    : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]',
                                ].join(' ')}
                              >
                                <button
                                  type="button"
                                  onClick={() => void openHistoricalSession(entry)}
                                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                                  aria-label={`切换到会话 ${entry.firstPrompt.slice(0, 24)}`}
                                  title={entry.firstPrompt}
                                >
                                  <span className="shrink-0 text-[12px] text-fg-muted">
                                    {formatClock(entry.startedAt)}
                                  </span>
                                  <span className="line-clamp-1 min-w-0 flex-1 text-[12px] leading-5 text-fg">
                                    {entry.firstPrompt.slice(0, 48)}
                                  </span>
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
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ))}
          </div>
        </div>

        {/* 底部菜单 ---------------------------------------------------------- */}
        <div className="border-t border-border/80 px-2 pb-4 pt-3">
          <SidebarMenuLink
            to="/usage"
            icon={<BarChart2 size={14} />}
            label="用量"
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
  const paddingLeft = `${depth * 12 + 6}px`;

  if (node.kind === 'directory') {
    // 顶层目录默认展开，深层默认收起——跟 VSCode Explorer 的直觉一致。
    const isExpanded = expandedFolders[node.path] ?? depth === 0;
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggleFolder(node.path)}
          className="flex w-full items-center gap-1 rounded-md py-0.5 pr-2 text-left text-[12px] text-fg transition hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <ChevronDown size={10} className="shrink-0 text-fg-subtle" />
          ) : (
            <ChevronRight size={10} className="shrink-0 text-fg-subtle" />
          )}
          <Folder size={11} className="shrink-0 text-fg-subtle" />
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
      className="flex w-full items-center gap-1 rounded-md py-0.5 pr-2 text-left text-[12px] text-fg-muted transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
      style={{ paddingLeft }}
      title={node.filePath ?? node.path}
    >
      <span className="inline-block w-2.5 shrink-0" />
      <FileText size={11} className="shrink-0 text-fg-subtle" />
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

function getWorkspaceRootName(workspaceRoot: string): string {
  const trimmed = workspaceRoot.trim();
  if (!trimmed) return '工作区';
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
