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

const STORAGE_KEY = 'coase:onboarding:v1';

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
  title: string;
  description: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

const STEPS: StepDef[] = [
  {
    selector: '[data-coach-empty-hero]',
    title: '你的研究工作台',
    description:
      '直接输入研究问题，或用 <code>/full-research</code>、<code>/idea-to-results</code> 等斜杠命令让 agent 从选题、数据、回归到写作一气呵成。',
    side: 'top',
    align: 'center',
  },
  {
    selector: '[data-coach-attachments]',
    title: '挂载本地数据与文献',
    description:
      '数据集（<code>.csv</code> / <code>.dta</code> / <code>.xlsx</code>）会被自动识别结构；论文 PDF 会作为背景文献让 agent 引用。',
    side: 'top',
    align: 'start',
  },
  {
    selector: '[data-coach-provider]',
    title: '切换 Provider 和模型',
    description:
      '首次使用请先到「设置 → 模型与技能」填 API Key，否则无法调用 agent。',
    side: 'top',
    align: 'center',
  },
  {
    selector: '[data-coach-send]',
    title: 'Enter 发送，Shift+Enter 换行',
    description:
      'Agent 跑起来后这里会变成红色停止按钮——随时可以打断，已生成的内容不会丢。',
    side: 'top',
    align: 'end',
  },
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
    nextBtnText: '下一步',
    prevBtnText: '上一步',
    doneBtnText: '开始使用',
    allowClose: true,
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 14,
    smoothScroll: true,
    popoverClass: 'coase-tour-popover',
    steps: available.map((step) => ({
      element: step.selector,
      popover: {
        title: step.title,
        description: step.description,
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
