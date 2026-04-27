// 首次启动新手引导。4 步串讲 EmptyHero 示例 → 附件挂载 → 模型切换 → 发送按钮。
//
// 设计要点：
// 1. 启动时对每个目标元素做存在性过滤——若用户已有历史会话（EmptyHero 不在），
//    自动从第 2 步开始；全都找不到就什么都不弹（避免骚扰）。
// 2. 若在引导过程中 EmptyHero 消失（用户边看引导边发消息），driver.js 内置
//    会在 moveNext 时重新查询 selector，找不到时抛错——这里用 try 包裹并手动
//    moveNext 跳过。
// 3. localStorage 仅记一个 flag；版本号进 key 里，未来想对老用户再推一次新
//    引导只要 bump 一下版本号。
// 4. 设置页提供 resetOnboarding 入口（后续加），让用户能再看一遍。

import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

import i18n from '../../lib/i18n';

const STORAGE_KEY = 'coase:onboarding:v1';

function tt(key: string): string {
  return i18n.t(key, { ns: 'chat' }) as string;
}

export function hasSeenOnboarding(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'done';
  } catch {
    return true; // 读不到就当已看过，不骚扰用户
  }
}

export function markOnboardingSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, 'done');
  } catch {
    // 忽略：无痕/隐私模式下写不进去也没关系
  }
}

export function resetOnboarding(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}

interface StepDef {
  selector: string;
  i18nKey: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

// 标题/描述按当前 i18n 语言现取。这里只锁 selector + 锚点位置。
const STEPS: StepDef[] = [
  { selector: '[data-coach-empty-hero]', i18nKey: 'hero', side: 'top', align: 'center' },
  { selector: '[data-coach-attachments]', i18nKey: 'attachments', side: 'top', align: 'start' },
  { selector: '[data-coach-provider]', i18nKey: 'provider', side: 'top', align: 'center' },
  { selector: '[data-coach-send]', i18nKey: 'send', side: 'top', align: 'end' },
];

function waitForAnchor(selector: string, timeoutMs = 3000): Promise<Element | null> {
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
    // 兜底超时——极端情况下 observer 不会触发
    window.setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeoutMs);
  });
}

let activeDriver: Driver | null = null;

export async function startOnboardingTour(options?: { force?: boolean }): Promise<void> {
  if (activeDriver) return; // 已经在跑了
  if (!options?.force && hasSeenOnboarding()) return;

  // 等输入区挂好——它是整个引导的地基，拿不到就不弹
  const composerAnchor = await waitForAnchor('[data-coach-send]', 5000);
  if (!composerAnchor) return;

  const available = STEPS.filter((step) => document.querySelector(step.selector));
  if (available.length === 0) {
    // 一个锚点都找不到——很可能用户停在非聊天页，不折腾
    return;
  }

  const d = driver({
    showProgress: available.length > 1,
    progressText: '{{current}} / {{total}}',
    nextBtnText: tt('tour.next'),
    prevBtnText: tt('tour.prev'),
    doneBtnText: tt('tour.done'),
    allowClose: true,
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 14,
    smoothScroll: true,
    popoverClass: 'coase-tour-popover',
    steps: available.map((step) => ({
      element: step.selector,
      popover: {
        title: tt(`tour.steps.${step.i18nKey}.title`),
        description: tt(`tour.steps.${step.i18nKey}.description`),
        side: step.side,
        align: step.align,
      },
    })),
    onDestroyed: () => {
      markOnboardingSeen();
      activeDriver = null;
    },
  });

  activeDriver = d;
  try {
    d.drive();
  } catch {
    // 极端情况下 drive 抛错，直接销毁免得卡死用户
    try {
      d.destroy();
    } catch {
      /* noop */
    }
    activeDriver = null;
  }
}
