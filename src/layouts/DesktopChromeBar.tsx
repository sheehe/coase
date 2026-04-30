// 桌面顶部栏：提供单层标题栏与可点击菜单。
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import Dialog from '../components/ui/Dialog';
import { CoaseMark } from '../components/Icons';
import { useChat } from '../features/chat/ChatContext';

// macOS 在 titleBarStyle:'hidden' 下交通灯按钮固定占据左上 ~78px，logo 必须让位
// 否则会跟红绿灯重叠。Windows / Linux 的窗口控件在右上角，左侧不需要 padding。
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

type MenuId = 'file' | 'edit' | 'view' | 'window' | 'help';

type MenuItem = {
  label: string;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
};

export default function DesktopChromeBar({
  sidebarVisible,
  onToggleSidebar,
}: {
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
}) {
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
  const { onNewSession, chooseWorkspaceRoot, workspaceRoot } = useChat();
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const MENU_ITEMS = useMemo<Array<{ id: MenuId; label: string }>>(
    () => [
      { id: 'file', label: t('chrome.menus.file') },
      { id: 'edit', label: t('chrome.menus.edit') },
      { id: 'view', label: t('chrome.menus.view') },
      { id: 'window', label: t('chrome.menus.window') },
      { id: 'help', label: t('chrome.menus.help') },
    ],
    [t],
  );

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
          label: t('chrome.file.newSession'),
          onClick: async () => {
            await onNewSession();
            navigate('/chat');
          },
        },
        {
          label: t('chrome.file.chooseWorkspace'),
          onClick: async () => {
            await chooseWorkspaceRoot();
          },
        },
        {
          label: t('chrome.file.openWorkspace'),
          disabled: !workspaceRoot,
          onClick: async () => {
            if (!workspaceRoot) return;
            await window.coase.artifacts.openPath(workspaceRoot);
          },
        },
        { separator: true, label: '' },
        {
          label: t('chrome.file.exit'),
          danger: true,
          onClick: async () => {
            await window.coase.window.close();
          },
        },
      ],
      edit: [
        { label: t('chrome.edit.undo'), onClick: () => void document.execCommand('undo') },
        { label: t('chrome.edit.redo'), onClick: () => void document.execCommand('redo') },
        { separator: true, label: '' },
        { label: t('chrome.edit.cut'), onClick: () => void document.execCommand('cut') },
        { label: t('chrome.edit.copy'), onClick: () => void document.execCommand('copy') },
        { label: t('chrome.edit.paste'), onClick: () => void document.execCommand('paste') },
        { separator: true, label: '' },
        { label: t('chrome.edit.selectAll'), onClick: () => void document.execCommand('selectAll') },
      ],
      view: [
        {
          label: sidebarVisible ? t('chrome.view.hideSidebar') : t('chrome.view.showSidebar'),
          onClick: onToggleSidebar,
        },
        {
          label: t('chrome.view.reload'),
          onClick: () => window.location.reload(),
        },
        {
          label: t('chrome.view.devtools'),
          onClick: async () => {
            await window.coase.window.toggleDevTools();
          },
        },
      ],
      window: [
        {
          label: t('chrome.window.minimize'),
          onClick: async () => {
            await window.coase.window.minimize();
          },
        },
        {
          label: t('chrome.window.toggleMaximize'),
          onClick: async () => {
            await window.coase.window.toggleMaximize();
          },
        },
        {
          label: t('chrome.window.close'),
          onClick: async () => {
            await window.coase.window.close();
          },
        },
      ],
      help: [
        {
          label: t('chrome.help.website'),
          onClick: () => {
            window.open('https://sheehe.github.io/coase/', '_blank', 'noopener');
          },
        },
        { separator: true, label: '' },
        {
          label: t('chrome.help.about'),
          onClick: () => setAboutOpen(true),
        },
      ],
    }),
    [chooseWorkspaceRoot, navigate, onNewSession, onToggleSidebar, sidebarVisible, t, workspaceRoot],
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
        <div
          ref={rootRef}
          className={[
            'flex h-10 w-full items-center pr-[140px]',
            IS_MAC ? 'pl-[78px]' : 'pl-3',
          ].join(' ')}
        >
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
        title={t('chrome.about.title')}
        footer={
          <button
            type="button"
            onClick={() => setAboutOpen(false)}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-fg"
          >
            {t('chrome.about.close')}
          </button>
        }
      >
        <div className="space-y-3 text-sm text-fg-muted">
          <p className="text-fg">{t('chrome.about.p1')}</p>
          <p>{t('chrome.about.p2')}</p>
        </div>
      </Dialog>
    </>
  );
}
