// 桌面顶部栏：提供单层标题栏与可点击菜单。
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useNavigate } from 'react-router-dom';

import Dialog from '../components/ui/Dialog';
import { CoaseMark } from '../components/Icons';
import { useChat } from '../features/chat/ChatContext';

type MenuId = 'file' | 'edit' | 'view' | 'window' | 'help';

type MenuItem = {
  label: string;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
};

const MENU_ITEMS: Array<{ id: MenuId; label: string }> = [
  { id: 'file', label: '文件' },
  { id: 'edit', label: '编辑' },
  { id: 'view', label: '视图' },
  { id: 'window', label: '窗口' },
  { id: 'help', label: '帮助' },
];

export default function DesktopChromeBar({
  sidebarVisible,
  onToggleSidebar,
}: {
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
}) {
  const navigate = useNavigate();
  const { onNewSession, chooseWorkspaceRoot, workspaceRoot } = useChat();
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        setAboutOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const menus = useMemo<Record<MenuId, MenuItem[]>>(
    () => ({
      file: [
        {
          label: '新建会话',
          onClick: async () => {
            await onNewSession();
            navigate('/chat');
          },
        },
        {
          label: '选择工作区目录',
          onClick: async () => {
            await chooseWorkspaceRoot();
          },
        },
        {
          label: '打开当前工作区',
          disabled: !workspaceRoot,
          onClick: async () => {
            if (!workspaceRoot) return;
            await window.coase.artifacts.openPath(workspaceRoot);
          },
        },
        { separator: true, label: '' },
        {
          label: '退出',
          danger: true,
          onClick: async () => {
            await window.coase.window.close();
          },
        },
      ],
      edit: [
        { label: '撤销', onClick: () => void document.execCommand('undo') },
        { label: '重做', onClick: () => void document.execCommand('redo') },
        { separator: true, label: '' },
        { label: '剪切', onClick: () => void document.execCommand('cut') },
        { label: '复制', onClick: () => void document.execCommand('copy') },
        { label: '粘贴', onClick: () => void document.execCommand('paste') },
        { separator: true, label: '' },
        { label: '全选', onClick: () => void document.execCommand('selectAll') },
      ],
      view: [
        {
          label: sidebarVisible ? '隐藏侧边栏' : '显示侧边栏',
          onClick: onToggleSidebar,
        },
        {
          label: '重新加载',
          onClick: () => window.location.reload(),
        },
        {
          label: '开发者工具',
          onClick: async () => {
            await window.coase.window.toggleDevTools();
          },
        },
      ],
      window: [
        {
          label: '最小化',
          onClick: async () => {
            await window.coase.window.minimize();
          },
        },
        {
          label: '最大化或还原',
          onClick: async () => {
            await window.coase.window.toggleMaximize();
          },
        },
        {
          label: '关闭窗口',
          onClick: async () => {
            await window.coase.window.close();
          },
        },
      ],
      help: [
        {
          label: '访问官网',
          onClick: () => {
            window.open('https://sheehe.github.io/coase/', '_blank', 'noopener');
          },
        },
        { separator: true, label: '' },
        {
          label: '关于 Coase',
          onClick: () => setAboutOpen(true),
        },
      ],
    }),
    [chooseWorkspaceRoot, navigate, onNewSession, onToggleSidebar, sidebarVisible, workspaceRoot],
  );

  const handleMenuAction = async (item: MenuItem) => {
    setOpenMenu(null);
    await item.onClick?.();
  };

  return (
    <>
      <header
        className="w-full shrink-0 border-b border-border bg-app"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      >
        <div ref={rootRef} className="flex h-10 w-full items-center pl-3 pr-[140px]">
          <div className="flex shrink-0 items-center gap-2">
            <span
              className="flex h-5.5 w-5.5 items-center justify-center rounded-full border border-border-strong bg-surface text-fg"
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              <CoaseMark size={13} />
            </span>
            <span
              className="text-[13px] font-medium tracking-tight text-fg"
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              Coase
            </span>
          </div>

          <nav
            className="ml-5 flex items-center gap-0.5"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          >
            {MENU_ITEMS.map((item) => (
              <div key={item.id} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu((current) => (current === item.id ? null : item.id))}
                  className={[
                    'rounded-md px-2.5 py-1 text-[13px] transition',
                    openMenu === item.id
                      ? 'bg-black/[0.06] text-fg'
                      : 'text-fg-muted hover:bg-black/[0.04] hover:text-fg',
                  ].join(' ')}
                >
                  {item.label}
                </button>
                {openMenu === item.id && (
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-sm">
                    {menus[item.id].map((menuItem, index) =>
                      menuItem.separator ? (
                        <div key={`${item.id}-separator-${index}`} className="my-1 border-t border-border" />
                      ) : (
                        <button
                          key={`${item.id}-${menuItem.label}`}
                          type="button"
                          disabled={menuItem.disabled}
                          onClick={() => void handleMenuAction(menuItem)}
                          className={[
                            'flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] transition',
                            menuItem.disabled
                              ? 'cursor-not-allowed text-fg-subtle'
                              : menuItem.danger
                                ? 'text-danger hover:bg-danger/5'
                                : 'text-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.04]',
                          ].join(' ')}
                        >
                          {menuItem.label}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="min-w-0 flex-1" />
        </div>
      </header>

      <Dialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="关于 Coase"
        footer={
          <button
            type="button"
            onClick={() => setAboutOpen(false)}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-fg"
          >
            关闭
          </button>
        }
      >
        <div className="space-y-3 text-sm text-fg-muted">
          <p className="text-fg">Coase 是面向实证研究与论文生产的桌面研究工作台。</p>
          <p>当前版本聚焦 Claude Agent SDK 原生会话、工作区目录、文件树与研究工作流界面。</p>
        </div>
      </Dialog>
    </>
  );
}

