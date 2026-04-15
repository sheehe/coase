import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
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
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-fg">模型提供方</h2>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            {providers.length === 0
              ? '还没有模型提供方。点击“新增”或者继续使用环境变量启动。'
              : `${providers.length} 个模型提供方 · 当前启用：${
                  providers.find((p) => p.id === activeId)?.label ?? '未设置'
                }`}
          </p>
        </div>
        <Button size="sm" onClick={onAdd}>
          + 新增模型提供方
        </Button>
      </CardHeader>

      <CardBody className="p-0">
        {providers.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-fg-subtle">
            还没有模型提供方。新增一个，或者继续使用环境变量。
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {providers.map((p) => (
              <ProviderRow
                key={p.id}
                provider={p}
                isActive={p.id === activeId}
                onEdit={() => onEdit(p)}
                onDelete={() => onDelete(p.id)}
                onSetActive={() => onSetActive(p.id)}
              />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function ProviderRow({
  provider,
  isActive,
  onEdit,
  onDelete,
  onSetActive,
}: {
  provider: ProviderRecord;
  isActive: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetActive: () => void;
}) {
  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <button
        type="button"
        onClick={onSetActive}
        className={[
          'h-4 w-4 shrink-0 rounded-full border-2 transition',
          isActive ? 'border-success bg-success' : 'border-border-strong hover:border-fg-muted',
        ].join(' ')}
        aria-label={isActive ? '当前已启用' : '设为已启用'}
        aria-pressed={isActive}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">{provider.label}</span>
          <Badge tone="neutral">{provider.protocol}</Badge>
          {isActive && <Badge tone="emerald">已启用</Badge>}
        </div>
        <div className="mt-1 truncate text-[11px] font-mono text-fg-muted">
          {provider.model} · {provider.baseURL}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onEdit}>
          编辑
        </Button>
        <Button size="sm" variant="destructive" onClick={onDelete}>
          删除
        </Button>
      </div>
    </li>
  );
}
