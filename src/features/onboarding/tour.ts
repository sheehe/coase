// 首次启动新手引导。6 步串讲 EmptyHero → API Key → 工作流 → 联网开关 → 附件 → 发送，
// 跨聊天页与设置页两个路由。
//
// 设计要点：
// 1. 每一步独立创建 / 销毁 driver.js 实例。原因：driver.js 内部步骤遍历依赖锚点
//    一直存在；本引导跨路由跳转，目标 DOM 会卸载重建，多步内置遍历会崩。
// 2. 步骤间通过 Promise 串行——onNextClick / onCloseClick 解 promise，再做路由
//    切换 + waitForAnchor + 下一步实例化。
// 3. 锚点等待用 MutationObserver 监听 DOM 变化，路由切完后新组件挂载即可解锁。
// 4. 全局只允许一个 tourPromise 在跑，避免 ChatPage 跨路由 remount 时 useEffect
//    重复触发把引导刷成两份。
// 5. localStorage flag 仍保留版本号，未来想再推一遍只要 bump 版本号即可。

import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

import i18n from '../../lib/i18n';

const STORAGE_KEY = 'coase:onboarding:v1';

type NavigateFn = (to: string) => void;

function tt(key: string, vars?: Record<string, unknown>): string {
  return i18n.t(key, { ns: 'chat', ...vars }) as string;
}

export function hasSeenOnboarding(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'done';
  } catch {
    return true;
  }
}

export function markOnboardingSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, 'done');
  } catch {
    /* 无痕模式写不进去也无所谓 */
  }
}

export function resetOnboarding(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

interface StepDef {
  selector: string;
  i18nKey: string;
  // 路径 + 可选 query。空字符串表示"留在当前路由不动"。
  // 用 hash router 的 pathname 形式（不带 #），navigate(path) 由调用方注入。
  route: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

const STEPS: StepDef[] = [
  {
    selector: '[data-coach-empty-hero]',
    i18nKey: 'hero',
    route: '/chat',
    side: 'top',
    align: 'center',
  },
  {
    selector: '[data-coach-api-key]',
    i18nKey: 'apiKey',
    route: '/settings?tab=models',
    side: 'bottom',
    align: 'start',
  },
  {
    selector: '[data-coach-workflow]',
    i18nKey: 'workflow',
    route: '/chat',
    side: 'top',
    align: 'start',
  },
  {
    selector: '[data-coach-web-search]',
    i18nKey: 'webSearch',
    route: '/settings?tab=research',
    side: 'bottom',
    align: 'start',
  },
  {
    selector: '[data-coach-attachments]',
    i18nKey: 'attachments',
    route: '/chat',
    side: 'top',
    align: 'start',
  },
  {
    selector: '[data-coach-send]',
    i18nKey: 'send',
    route: '/chat',
    side: 'top',
    align: 'end',
  },
];

function waitForAnchor(selector: string, timeoutMs = 5000): Promise<Element | null> {
  const immediate = document.querySelector(selector);
  if (immediate) return Promise.resolve(immediate);
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      } else if (Date.now() > deadline) {
        observer.disconnect();
        resolve(null);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeoutMs);
  });
}

// 当前 hash 路由："/chat" / "/settings?tab=models" 等。HashRouter 模式下读 hash。
function currentRoute(): string {
  const hash = window.location.hash || '';
  // hash 形如 "#/chat" 或 "#/settings?tab=models"
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
  return stripped || '/chat';
}

let activeDriver: Driver | null = null;
let tourPromise: Promise<void> | null = null;

interface RunStepCtx {
  index: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
}

// 单步驱动：走一步 driver.js，返回 true=用户点了下一步，false=用户关闭。
function runStep(step: StepDef, ctx: RunStepCtx): Promise<boolean> {
  return new Promise((resolve) => {
    const titleBase = tt(`tour.steps.${step.i18nKey}.title`);
    const indicator = tt('tour.stepIndicator', {
      current: ctx.index + 1,
      total: ctx.total,
    });
    // 序号靠右淡灰，标题左侧。HTML 内联样式直接走 driver.js 的 popover 标题。
    const title = `${titleBase}<span style="margin-left:8px;font-weight:400;font-size:11px;color:var(--fg-subtle,#9aa0a6);letter-spacing:0">${indicator}</span>`;
    const description = tt(`tour.steps.${step.i18nKey}.description`);

    let settled = false;
    const settle = (proceed: boolean) => {
      if (settled) return;
      settled = true;
      try {
        d.destroy();
      } catch {
        /* noop */
      }
      activeDriver = null;
      resolve(proceed);
    };

    const d = driver({
      showProgress: false,
      showButtons: ['next', 'close'],
      nextBtnText: ctx.isLast ? tt('tour.done') : tt('tour.next'),
      doneBtnText: tt('tour.done'),
      allowClose: true,
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 14,
      smoothScroll: true,
      popoverClass: 'coase-tour-popover',
      onNextClick: () => settle(true),
      onCloseClick: () => settle(false),
      onDestroyStarted: () => {
        // 用户点了 overlay / Esc 关闭——driver.js 会先调这个再 destroy。
        // 已经 settle 过就不再重复（onNext / onClose 已处理）。
        if (!settled) settle(false);
      },
      steps: [
        {
          element: step.selector,
          popover: {
            title,
            description,
            side: step.side,
            align: step.align,
          },
        },
      ],
    });
    activeDriver = d;
    try {
      d.drive();
    } catch {
      settle(false);
    }
  });
}

async function runFullTour(navigate: NavigateFn | undefined): Promise<void> {
  // 第一步等聊天页输入区落定，给 React 初次挂载留时间
  await waitForAnchor('[data-coach-send], [data-coach-empty-hero]', 5000);

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];

    // 如果当前路由和目标不一致，并且我们有 navigate 注入，则跳过去
    if (navigate && step.route && currentRoute() !== step.route) {
      navigate(step.route);
    }

    const anchor = await waitForAnchor(step.selector, 6000);
    if (!anchor) {
      // 这一步锚点找不到（功能没渲染、tab 没切到位等），跳过而不是中断整个引导
      continue;
    }

    const proceed = await runStep(step, {
      index: i,
      total: STEPS.length,
      isFirst: i === 0,
      isLast: i === STEPS.length - 1,
    });
    if (!proceed) break;
  }

  markOnboardingSeen();
}

export async function startOnboardingTour(options?: {
  force?: boolean;
  navigate?: NavigateFn;
}): Promise<void> {
  if (tourPromise) return tourPromise;
  if (!options?.force && hasSeenOnboarding()) return;

  tourPromise = (async () => {
    try {
      await runFullTour(options?.navigate);
    } finally {
      tourPromise = null;
    }
  })();
  return tourPromise;
}
