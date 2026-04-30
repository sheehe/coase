// 会话侧边栏：类 VSCode Explorer 的两段式布局。
//   上段"工作区"：常驻展示当前会话绑定的工作区文件树，像 VSCode 的 Explorer。
//   下段"会话历史"：折叠列表，只显示标题/时间/删除，不再内嵌文件树。
// 这样无论是否展开历史会话，用户都能始终看到当前产出文件；切换历史会话会
// 把上段内容也跟着切过去。
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import type { AppUpdateSnapshot, WorkspaceFilePreview, WorkspaceTreeNode } from '../../shared/ipc';
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
  const { t } = useTranslation('chat');
  const [sessions, setSessions] = useState<SessionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [currentTree, setCurrentTree] = useState<WorkspaceTreeNode[]>([]);
  const [currentTreeRoot, setCurrentTreeRoot] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [previewFile, setPreviewFile] = useState<WorkspaceFilePreview | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [updateSnapshot, setUpdateSnapshot] = useState<AppUpdateSnapshot | null>(null);
  const {
    onNewSession,
    chatState,
    sessionId,
    openHistoricalSession,
    summaryRefreshKey,
    workspaceRoot,
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

  // 全局更新状态订阅。SettingsPage 的 UpdateCard 也会订阅同一个 IPC 事件，但
  // 那只在用户切到"更新" tab 才挂载——侧边栏这里再订一份，让红点提示能在
  // 任何路径下出现，避免用户错过更新。两份订阅互不干扰。
  useEffect(() => {
    let mounted = true;
    void window.coase.updates
      .getState()
      .then((next) => {
        if (mounted) setUpdateSnapshot(next);
      })
      .catch(() => {
        /* 拿不到状态就当没有更新，不打扰用户 */
      });
    const unsubscribe = window.coase.updates.onEvent((next) => {
      if (mounted) setUpdateSnapshot(next);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // 用 ref 加一道并发锁：手动刷新按钮、轮询、依赖变化都可能同时触发，
  // 让它们排队等当前那次完成，避免无谓的并发 IPC 和 setState 抖动。
  const treeFetchInFlight = useRef(false);
  const loadCurrentWorkspaceTree = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!sessionId) {
        setCurrentTree([]);
        setCurrentTreeRoot(null);
        return;
      }
      if (treeFetchInFlight.current) return;
      treeFetchInFlight.current = true;
      // silent 用于轮询：避免每 2s 闪一次"加载文件树…"。
      if (!opts?.silent) setLoadingTree(true);
      try {
        const [tree, root] = await Promise.all([
          window.coase.workspaces.listTree(sessionId),
          window.coase.workspaces.getRoot(sessionId),
        ]);
        setCurrentTree(tree);
        setCurrentTreeRoot(root);
      } catch (error) {
        console.warn('load workspace tree failed', { sessionId, error });
        if (!opts?.silent) {
          setCurrentTree([]);
          setCurrentTreeRoot(null);
        }
      } finally {
        treeFetchInFlight.current = false;
        if (!opts?.silent) setLoadingTree(false);
      }
    },
    [sessionId],
  );

  // 会话切换 / 流程结束时重新拉工作区；summaryRefreshKey 变化也触发（这说明有
  // 新的 turn_result / 产物落地），这样新生成的文件能即时出现在树里。
  useEffect(() => {
    void loadCurrentWorkspaceTree();
  }, [loadCurrentWorkspaceTree, summaryRefreshKey]);

  // 会话跑动期间（running / waiting）轻量轮询：summaryRefreshKey 只在
  // session_started / session_finished 时 bump，跑到一半 agent 写出来的文件
  // 看不到。每 2s 静默拉一次，让新产物自己冒出来；闲置或窗口隐藏时停掉。
  useEffect(() => {
    if (!sessionId) return;
    if (chatState !== 'running' && chatState !== 'waiting') return;

    let stopped = false;
    const tick = () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void loadCurrentWorkspaceTree({ silent: true });
    };
    const id = setInterval(tick, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [sessionId, chatState, loadCurrentWorkspaceTree]);

  const groups = useMemo(
    () =>
      groupSessions(sessions, {
        today: t('sidebar.groupToday'),
        yesterday: t('sidebar.groupYesterday'),
        earlier: t('sidebar.groupEarlier'),
      }),
    [sessions, t],
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
      const title = entry.firstPrompt.slice(0, 28);
      const isCurrent = entry.sessionId === sessionId;
      const isRunning = isCurrent && chatState === 'running';
      const confirmed = window.confirm(
        isRunning
          ? t('sidebar.deleteConfirmRunning', { title })
          : t('sidebar.deleteConfirm', { title }),
      );
      if (!confirmed) return;

      setDeletingSessionId(entry.sessionId);
      try {
        await window.coase.sessions.delete(entry.sessionId);
        sessionsStore.disposeRuntime(entry.sessionId);
        setSessions((prev) => prev.filter((item) => item.sessionId !== entry.sessionId));
        if (isCurrent) {
          await onNewSession();
          navigate('/chat');
        }
      } catch (error) {
        console.error('delete session failed', error);
        const message = error instanceof Error ? error.message : String(error);
        window.alert(t('sidebar.deleteFailed', { message }));
      } finally {
        setDeletingSessionId(null);
      }
    },
    [sessionId, chatState, onNewSession, navigate, t],
  );

  const canChangeWorkspace = chatState !== 'running';

  const effectiveRoot = currentTreeRoot ?? workspaceRoot;
  const workspaceTitle = effectiveRoot
    ? getWorkspaceRootName(effectiveRoot, t('sidebar.workspaceFallback'))
    : t('sidebar.workspaceFallback');

  return (
    <>
      <aside className="flex h-full w-full shrink-0 flex-col bg-sidebar">
        {/* 头部：新会话 ------------------------------------------------------ */}
        <div className="px-4 pb-3 pt-4">
          <button
            type="button"
            onClick={() => {
              void onNewSession();
              navigate('/chat');
            }}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border/70 bg-surface px-3 text-[13px] font-medium text-fg transition hover:bg-app"
          >
            <Plus size={13} />
            <span>{t('sidebar.newSession')}</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 上段：常驻工作区文件树 ---------------------------------------- */}
          <div className="px-2 pb-3 pt-1">
            <div className="flex items-center px-2 pb-1.5">
              <span
                className="truncate text-[11px] uppercase tracking-[0.16em] text-fg-subtle"
                title={effectiveRoot ?? undefined}
              >
                {t('sidebar.workspaceLabel', { name: workspaceTitle })}
              </span>
              <div className="ml-auto flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => void loadCurrentWorkspaceTree()}
                  className="rounded-md p-1 text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
                  aria-label={t('sidebar.refreshWorkspace')}
                  title={t('sidebar.refresh')}
                >
                  <RefreshCw size={12} />
                </button>
                {effectiveRoot && (
                  <button
                    type="button"
                    onClick={() => void window.coase.artifacts.openPath(effectiveRoot)}
                    className="rounded-md p-1 text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
                    aria-label={t('sidebar.openInExplorer')}
                    title={t('sidebar.openInExplorer')}
                  >
                    <Folder size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void chooseWorkspaceRoot()}
                  disabled={!canChangeWorkspace}
                  className="rounded-md p-1 text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.04]"
                  aria-label={t('sidebar.chooseWorkspace')}
                  title={t('sidebar.chooseWorkspace')}
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>

            {!sessionId ? (
              <div className="px-3 py-3 text-[12px] leading-5 text-fg-subtle">
                {t('sidebar.noSessionHint')}
              </div>
            ) : loadingTree ? (
              <div className="px-3 py-3 text-[12px] text-fg-subtle">{t('sidebar.loadingTree')}</div>
            ) : currentTree.length === 0 ? (
              <div className="px-3 py-3 text-[12px] leading-5 text-fg-subtle">
                {t('sidebar.emptyTreeHint')}
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
                {t('sidebar.history')}
              </span>
              <span className="ml-auto text-[10.5px] text-fg-subtle">{sessions.length}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void loadSessions();
                }}
                className="rounded-md p-1 text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
                aria-label={t('sidebar.refreshHistory')}
              >
                <RefreshCw size={12} />
              </button>
            </button>

            {!historyCollapsed &&
              (loading ? (
                <div className="px-4 py-6 text-center text-sm text-fg-subtle">
                  {t('sidebar.loading')}
                </div>
              ) : groups.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-fg-subtle">
                  {t('sidebar.noSessions')}
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {groups.map((group) => (
                    <section key={group.title}>
                      <div className="px-4 pb-1 text-[11.5px] uppercase tracking-[0.16em] text-fg-subtle">
                        {group.title}
                      </div>
                      <div className="space-y-0.5 px-1">
                        {group.entries.map((entry) => {
                          const isCurrent = entry.sessionId === sessionId;
                          const deleteDisabled = deletingSessionId === entry.sessionId || isCurrent;
                          const deleteTitle = isCurrent
                            ? t('sidebar.currentNotDeletable')
                            : t('sidebar.deleteSession');

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
                                  onClick={() => {
                                    void openHistoricalSession(entry);
                                    // 如果当前在 /usage 或 /settings 这类非对话页，点会话
                                    // 必须带路由跳回 /chat，否则只切了内部状态、界面没反应。
                                    if (location.pathname !== '/chat') {
                                      navigate('/chat');
                                    }
                                  }}
                                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                                  aria-label={t('sidebar.switchTo', {
                                    title: entry.firstPrompt.slice(0, 24),
                                  })}
                                  title={entry.firstPrompt}
                                >
                                  <span className="shrink-0 text-[13px] text-fg-muted">
                                    {formatClock(entry.startedAt)}
                                  </span>
                                  <span className="line-clamp-1 min-w-0 flex-1 text-[13px] leading-5 text-fg">
                                    {entry.firstPrompt.slice(0, 48)}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => void handleDeleteSession(entry)}
                                  disabled={deleteDisabled}
                                  title={deleteTitle}
                                  aria-label={t('sidebar.deleteSession')}
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
            label={t('sidebar.menuUsage')}
            active={location.pathname === '/usage'}
          />
          <SettingsMenuLinkWithUpdateBadge
            updateSnapshot={updateSnapshot}
            isOnSettingsPage={location.pathname === '/settings'}
          />
        </div>
      </aside>

      <Dialog
        open={!!previewFile}
        onClose={() => setPreviewFile(null)}
        title={previewFile?.name ?? t('sidebar.filePreview')}
        widthClass="max-w-3xl"
        bodyKey={previewFile?.filePath ?? null}
        footer={
          previewFile?.filePath ? (
            <>
              <Button variant="secondary" onClick={() => setPreviewFile(null)}>
                {t('sidebar.previewClose')}
              </Button>
              <Button
                onClick={() => {
                  void window.coase.artifacts.openPath(previewFile.filePath);
                }}
              >
                {t('sidebar.previewOpenOriginal')}
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
  badge = false,
  badgeTitle,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
  badge?: boolean;
  badgeTitle?: string;
}) {
  return (
    <Link
      to={to}
      title={badgeTitle}
      className={[
        'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-fg-muted transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]',
        active ? 'bg-black/[0.04] text-fg dark:bg-white/[0.04]' : '',
      ].join(' ')}
    >
      {icon}
      <span>{label}</span>
      {badge && (
        <span
          aria-label={badgeTitle}
          className="ml-auto h-2 w-2 shrink-0 rounded-full bg-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.18)]"
        />
      )}
    </Link>
  );
}

// 设置入口 + 更新红点。检测到 'available' / 'downloaded' 状态时点亮红点，
// 链接顺势带上 ?tab=updates 把用户直接送到更新页；用户进了设置页就不再闪
// （视为"看到了"），避免持续打扰。
function SettingsMenuLinkWithUpdateBadge({
  updateSnapshot,
  isOnSettingsPage,
}: {
  updateSnapshot: AppUpdateSnapshot | null;
  isOnSettingsPage: boolean;
}) {
  const { t } = useTranslation('chat');
  const status = updateSnapshot?.status;
  const hasUpdate = status === 'available' || status === 'downloaded';
  const showBadge = hasUpdate && !isOnSettingsPage;
  const targetVersion =
    updateSnapshot?.downloadedVersion ?? updateSnapshot?.availableVersion ?? '';
  const badgeTitle = !showBadge
    ? undefined
    : status === 'downloaded'
      ? t('sidebar.updateDownloadedBadge', { version: targetVersion })
      : t('sidebar.updateAvailableBadge', { version: targetVersion });
  const to = hasUpdate ? '/settings?tab=updates' : '/settings';

  return (
    <SidebarMenuLink
      to={to}
      icon={<Settings size={14} />}
      label={t('sidebar.menuSettings')}
      active={isOnSettingsPage}
      badge={showBadge}
      badgeTitle={badgeTitle}
    />
  );
}

function groupSessions(
  entries: SessionLogEntry[],
  titles: { today: string; yesterday: string; earlier: string },
): SessionGroup[] {
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
    { title: titles.today, entries: today },
    { title: titles.yesterday, entries: yesterday },
    { title: titles.earlier, entries: earlier },
  ].filter((group) => group.entries.length > 0);
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getWorkspaceRootName(workspaceRoot: string, fallback: string): string {
  const trimmed = workspaceRoot.trim();
  if (!trimmed) return fallback;
  const normalized = trimmed.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalized;
}

