import { useTranslation } from 'react-i18next';

import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import type { ProviderRecord } from '../../../shared/providers';

interface Props {
  providers: ProviderRecord[];
  activeId: string | null;
  onEdit: (record: ProviderRecord) => void;
  onDelete: (id: string) => void;
  onSetActive: (id: string) => void;
  onAdd: () => void;
}

export default function ProviderList({
  providers,
  activeId,
  onEdit,
  onDelete,
  onSetActive,
  onAdd,
}: Props) {
  const { t } = useTranslation('settings');
  const activeLabel = providers.find((p) => p.id === activeId)?.label ?? t('providers.noneActive');

  return (
    <Card className="overflow-hidden" data-coach-api-key="">
      <CardBody className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">
            {t('providers.title')}
          </div>
          <div className="mt-1 text-[13px] leading-6 text-fg-muted">
            {providers.length === 0
              ? t('providers.subtitleEmpty')
              : t('providers.subtitleWithCount', { count: providers.length, label: activeLabel })}
          </div>
        </div>

        <Button size="sm" onClick={onAdd} className="shrink-0 rounded-full px-3.5">
          {t('providers.add')}
        </Button>
      </CardBody>

      {providers.length === 0 ? (
        <div className="px-5 py-12 text-sm text-fg-subtle">{t('providers.emptyHint')}</div>
      ) : (
        <ul className="divide-y divide-border">
          {providers.map((provider, index) => (
            <ProviderRow
              key={provider.id}
              index={index}
              provider={provider}
              isActive={provider.id === activeId}
              onEdit={() => onEdit(provider)}
              onDelete={() => onDelete(provider.id)}
              onSetActive={() => onSetActive(provider.id)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ProviderRow({
  index,
  provider,
  isActive,
  onEdit,
  onDelete,
  onSetActive,
}: {
  index: number;
  provider: ProviderRecord;
  isActive: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetActive: () => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={onSetActive}
          className={[
            'mt-0.5 h-4 w-4 shrink-0 rounded-full border transition',
            isActive
              ? 'border-success bg-success'
              : 'border-border-strong bg-transparent hover:border-fg-muted',
          ].join(' ')}
          aria-label={isActive ? t('providers.currentActive') : t('providers.setActive')}
          aria-pressed={isActive}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium tabular-nums text-fg-subtle">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="truncate text-[14px] font-medium text-fg">{provider.label}</span>
            <Badge tone="neutral">{provider.protocol}</Badge>
            {isActive && <Badge tone="emerald">{t('providers.active')}</Badge>}
          </div>

          <div className="ml-8 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
            <span className="font-mono">{provider.model}</span>
            <span className="truncate">{provider.baseURL}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onEdit} className="rounded-full px-3">
            {t('providers.edit')}
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} className="rounded-full px-3">
            {t('providers.delete')}
          </Button>
        </div>
      </div>
    </li>
  );
}
