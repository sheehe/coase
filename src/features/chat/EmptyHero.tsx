// 空会话 Hero：品牌标题 + 简短使用说明 + 首次启动引导。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AlertCircle, ChevronRight } from '../../components/Icons';
import StageRail from '../../layouts/StageRail';

export default function EmptyHero() {
  const { t } = useTranslation('chat');
  // null = 还在检测；true = 至少一个 provider 填了凭据；false = 一个都没有。
  // 仅在 false 时显示引导，避免加载中闪一下"未配置"造成误导。
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const file = await window.coase.providers.list();
        const ok = file.providers.some(
          (p) => typeof p.credential === 'string' && p.credential.trim().length > 0,
        );
        if (!cancelled) setKeyConfigured(ok);
      } catch {
        // 拿不到就不展示引导，免得状态异常时反而骚扰。
        if (!cancelled) setKeyConfigured(null);
      }
    };
    void check();
    // 用户可能切到外部改了配置回来，focus 回 app 时再核对一次。
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const needsKey = keyConfigured === false;

  return (
    <div className="flex flex-1 flex-col items-center justify-end px-6 pb-8 pt-10">
      <div className="flex w-full max-w-[780px] flex-col items-center">
        <div className="mb-10 flex w-full justify-center">
          <StageRail variant="hero" />
        </div>

        <div className="max-w-[520px] text-center">
          <div className="text-[38px] font-semibold tracking-tight text-fg">Coase</div>
          <div className="mt-3 text-[15px] text-fg-muted">{t('empty.tagline')}</div>
          <div className="mt-2 text-[12px] text-fg-subtle">{t('empty.subTagline')}</div>
        </div>

        {needsKey && (
          <div className="mt-8 w-full max-w-[560px] space-y-2.5">
            <Link
              to="/settings?tab=models"
              className="group flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3.5 text-left transition hover:border-danger/50 hover:bg-danger/[0.08]"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-fg">{t('empty.noKeyTitle')}</div>
                <div className="mt-0.5 text-[12.5px] leading-5 text-fg-muted">
                  {t('empty.noKeyDesc')}
                </div>
              </div>
              <ChevronRight
                size={14}
                className="mt-1.5 shrink-0 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-fg"
              />
            </Link>
            <div className="px-1 text-[11.5px] leading-5 text-fg-subtle">
              {t('empty.workspaceHintBefore')}{' '}
              <span className="font-mono text-fg-muted">paper_id_xxxx</span>
              {t('empty.workspaceHintAfter')}
            </div>
          </div>
        )}

        <div
          data-coach-empty-hero
          className="mt-10 w-full max-w-[560px] space-y-2 text-[13px] leading-7 text-fg-muted"
        >
          <div>
            {t('empty.intro1Prefix')} <span className="font-mono text-fg">/</span>{' '}
            {t('empty.intro1Suffix')}
            <span className="font-mono text-fg"> /full-research</span> ·
            <span className="font-mono text-fg"> /idea-to-results</span> ·
            <span className="font-mono text-fg"> /run-experiment</span> ·
            <span className="font-mono text-fg"> /review</span>
          </div>
          <div>{t('empty.intro2')}</div>
          <div>
            {t('empty.intro3Prefix')}{' '}
            <span className="font-mono text-fg">{t('empty.intro3Token')}</span>{' '}
            {t('empty.intro3Suffix')}
          </div>
        </div>

        <div className="mt-8 text-center text-[11px] font-mono text-fg-subtle">
          {t('empty.shortcutHint')}
        </div>
      </div>
    </div>
  );
}
