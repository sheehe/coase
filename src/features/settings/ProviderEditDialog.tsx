import { useEffect, useState } from 'react';

import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import Field from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import type {
  AuthMode,
  ProviderPreset,
  ProviderProtocol,
  ProviderRecord,
  TestConnectionResult,
} from '../../../shared/providers';

export type DialogMode = 'new' | 'edit';

interface Props {
  open: boolean;
  mode: DialogMode;
  initial: ProviderRecord | null;
  presets: ProviderPreset[];
  onClose: () => void;
  onSave: (record: ProviderRecord) => Promise<void>;
}

const AUTO_COMPACT_MIN = 100_000;
const AUTO_COMPACT_MAX = 1_000_000;

function emptyRecord(): ProviderRecord {
  return {
    id: '',
    label: '',
    protocol: 'anthropic',
    baseURL: '',
    model: '',
    authMode: 'auth_token',
    credential: '',
  };
}

function validate(record: ProviderRecord): Partial<Record<keyof ProviderRecord, string>> {
  const errors: Partial<Record<keyof ProviderRecord, string>> = {};

  if (!record.id.trim()) errors.id = 'ID 不能为空';
  else if (!/^[a-z0-9][a-z0-9-_]*$/i.test(record.id)) {
    errors.id = 'ID 只能包含字母、数字、- 和 _';
  }

  if (!record.label.trim()) errors.label = '名称不能为空';

  if (!record.baseURL.trim()) errors.baseURL = '接口地址不能为空';
  else if (!/^https?:\/\//.test(record.baseURL)) {
    errors.baseURL = '接口地址必须以 http(s):// 开头';
  }

  if (!record.model.trim()) errors.model = '模型不能为空';
  if (!record.credential.trim()) errors.credential = 'API Key / Token 不能为空';

  if (record.autoCompactWindow !== undefined) {
    if (
      !Number.isFinite(record.autoCompactWindow) ||
      record.autoCompactWindow < AUTO_COMPACT_MIN ||
      record.autoCompactWindow > AUTO_COMPACT_MAX
    ) {
      errors.autoCompactWindow = `自动压缩阈值需在 ${AUTO_COMPACT_MIN.toLocaleString()} - ${AUTO_COMPACT_MAX.toLocaleString()} 之间`;
    }
  }

  return errors;
}

export default function ProviderEditDialog({
  open,
  mode,
  initial,
  presets,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<ProviderRecord>(() => initial ?? emptyRecord());
  const [errors, setErrors] = useState<Partial<Record<keyof ProviderRecord, string>>>({});
  const [saving, setSaving] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(initial ?? emptyRecord());
    setErrors({});
    setSelectedPresetId('');
    setTestResult(null);
  }, [open, initial]);

  function updateField<K extends keyof ProviderRecord>(key: K, value: ProviderRecord[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(presetId: string) {
    setSelectedPresetId(presetId);
    if (!presetId) return;

    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;

    setForm((prev) => ({
      ...prev,
      id: mode === 'new' ? preset.id : prev.id,
      label: preset.label,
      protocol: preset.protocol,
      baseURL: preset.baseURL,
      model: preset.defaultModel,
      authMode: preset.authMode,
    }));
  }

  async function handleSave() {
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setErrors({ credential: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.coase.providers.testConnection(form);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        latencyMs: 0,
        message: `调用失败：${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'new' ? '新增模型提供方' : `编辑模型提供方 · ${form.label || form.id}`}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => void handleTest()}
            disabled={saving || testing}
            className="mr-auto"
          >
            {testing ? '测试中…' : '测试连接'}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving || testing}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || testing}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mode === 'new' && (
          <Field
            label="从预设快速填充"
            hint="选择预设后会覆盖 ID、名称、接口地址、模型和鉴权方式。"
          >
            <Select value={selectedPresetId} onChange={(e) => applyPreset(e.target.value)}>
              <option value="">不使用预设，手动填写</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} · {preset.defaultModel}
                </option>
              ))}
            </Select>
            {selectedPresetId && (
              <PresetHint preset={presets.find((preset) => preset.id === selectedPresetId)} />
            )}
          </Field>
        )}

        <Field label="ID" hint="保存后的唯一标识，不能重复。" error={errors.id}>
          <Input
            value={form.id}
            onChange={(e) => updateField('id', e.target.value)}
            disabled={mode === 'edit'}
            placeholder="minimax-anthropic"
          />
        </Field>

        <Field label="显示名称" error={errors.label}>
          <Input
            value={form.label}
            onChange={(e) => updateField('label', e.target.value)}
            placeholder="MiniMax"
          />
        </Field>

        <Field label="协议">
          <Select
            value={form.protocol}
            onChange={(e) => updateField('protocol', e.target.value as ProviderProtocol)}
          >
            <option value="anthropic">Anthropic（原生或兼容端点）</option>
            <option value="openai" disabled>
              OpenAI（后续接入）
            </option>
          </Select>
        </Field>

        <Field label="接口地址" error={errors.baseURL}>
          <Input
            value={form.baseURL}
            onChange={(e) => updateField('baseURL', e.target.value)}
            placeholder="https://api.minimax.io/anthropic"
          />
        </Field>

        <Field label="模型" error={errors.model}>
          <Input
            value={form.model}
            onChange={(e) => updateField('model', e.target.value)}
            placeholder="MiniMax-M2.7"
          />
        </Field>

        <Field
          label="鉴权方式"
          hint="Anthropic 官方通常使用 api_key，第三方兼容端点通常使用 auth_token。"
        >
          <Select
            value={form.authMode}
            onChange={(e) => updateField('authMode', e.target.value as AuthMode)}
          >
            <option value="auth_token">auth_token（第三方兼容端点）</option>
            <option value="api_key">api_key（Anthropic 官方）</option>
          </Select>
        </Field>

        <Field label="API Key / Token" error={errors.credential}>
          <Input
            type="password"
            value={form.credential}
            onChange={(e) => updateField('credential', e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
          />
        </Field>

        <Field
          label="自动压缩阈值（可选）"
          hint={`累计 token 达到该值时 SDK 会自动触发 compact。留空走模型自适应默认：1M 窗口约 850k，其它约 160k。允许范围 ${AUTO_COMPACT_MIN.toLocaleString()} - ${AUTO_COMPACT_MAX.toLocaleString()}。`}
          error={errors.autoCompactWindow}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={AUTO_COMPACT_MIN}
            max={AUTO_COMPACT_MAX}
            step={10_000}
            value={form.autoCompactWindow ?? ''}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (!raw) {
                updateField('autoCompactWindow', undefined);
                return;
              }
              const value = Number(raw);
              updateField('autoCompactWindow', Number.isFinite(value) ? value : undefined);
            }}
            placeholder="留空 = 使用模型自适应默认"
          />
        </Field>

        {testResult && <TestResultBanner result={testResult} />}
      </div>
    </Dialog>
  );
}

function TestResultBanner({ result }: { result: TestConnectionResult }) {
  const tone = result.ok
    ? 'border-border bg-app text-fg'
    : 'border-danger/30 bg-danger/5 text-danger';

  return (
    <div className={`rounded-xl border px-3 py-3 text-xs ${tone}`}>
      <div className="flex items-center gap-2 font-mono">
        <span>{result.ok ? '成功' : '失败'}</span>
        <span className="break-all">{result.message}</span>
      </div>

      {result.requestText && (
        <div className="mt-3 flex justify-end">
          <div className="max-w-[85%] rounded-[18px] rounded-br-md bg-fg px-3 py-2 text-[12px] text-app">
            <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-app/70">发送消息</div>
            <div className="leading-6">{result.requestText}</div>
          </div>
        </div>
      )}

      {result.responseText && (
        <div className="mt-2 flex justify-start">
          <div className="max-w-[85%] rounded-[18px] rounded-bl-md border border-border/80 bg-surface px-3 py-2 text-[12px] text-fg">
            <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-fg-subtle">模型回复</div>
            <div className="whitespace-pre-wrap leading-6">{result.responseText}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function PresetHint({ preset }: { preset: ProviderPreset | undefined }) {
  if (!preset?.hint) return null;
  return <span className="mt-1 text-[11px] text-fg-subtle">{preset.hint}</span>;
}
