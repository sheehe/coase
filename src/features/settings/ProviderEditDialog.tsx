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
  else if (!/^[a-z0-9][a-z0-9-_]*$/i.test(record.id)) errors.id = 'ID 只能包含字母、数字、- 和 _';
  if (!record.label.trim()) errors.label = '名称不能为空';
  if (!record.baseURL.trim()) errors.baseURL = 'baseURL 不能为空';
  else if (!/^https?:\/\//.test(record.baseURL)) errors.baseURL = 'baseURL 必须以 http(s):// 开头';
  if (!record.model.trim()) errors.model = '模型名不能为空';
  if (!record.credential.trim()) errors.credential = 'API key / token 不能为空';
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
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initial ?? emptyRecord());
      setErrors({});
      setSelectedPresetId('');
      setTestResult(null);
    }
  }, [open, initial]);

  function updateField<K extends keyof ProviderRecord>(key: K, value: ProviderRecord[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(presetId: string) {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const preset = presets.find((p) => p.id === presetId);
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
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
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
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
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
      title={mode === 'new' ? '新增 Provider' : `编辑 Provider · ${form.label || form.id}`}
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
          <Field label="从预设快速填充" hint="选择预设后会覆盖 id、名称、baseURL、模型与鉴权方式。">
            <Select value={selectedPresetId} onChange={(e) => applyPreset(e.target.value)}>
              <option value="">不使用预设，手动填写</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.defaultModel}
                </option>
              ))}
            </Select>
            {selectedPresetId && (
              <PresetHint preset={presets.find((p) => p.id === selectedPresetId)} />
            )}
          </Field>
        )}

        <Field label="ID" hint="保存后的唯一标识，不能重复。" error={errors.id}>
          <Input
            value={form.id}
            onChange={(e) => updateField('id', e.target.value)}
            disabled={mode === 'edit'}
            placeholder="moonshot-kimi"
          />
        </Field>

        <Field label="显示名称" error={errors.label}>
          <Input
            value={form.label}
            onChange={(e) => updateField('label', e.target.value)}
            placeholder="Moonshot (Kimi)"
          />
        </Field>

        <Field label="协议">
          <Select
            value={form.protocol}
            onChange={(e) => updateField('protocol', e.target.value as ProviderProtocol)}
          >
            <option value="anthropic">Anthropic（原生或兼容端点）</option>
            <option value="openai" disabled>
              OpenAI（Phase 2.5 接入）
            </option>
          </Select>
        </Field>

        <Field label="Base URL" error={errors.baseURL}>
          <Input
            value={form.baseURL}
            onChange={(e) => updateField('baseURL', e.target.value)}
            placeholder="https://api.moonshot.cn/anthropic"
          />
        </Field>

        <Field label="模型" error={errors.model}>
          <Input
            value={form.model}
            onChange={(e) => updateField('model', e.target.value)}
            placeholder="kimi-k2-0711-preview"
          />
        </Field>

        <Field
          label="鉴权方式"
          hint="Anthropic 官方通常用 api_key，第三方兼容端点通常使用 auth_token。"
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
    <div className={`rounded-xl border px-3 py-2 text-xs font-mono ${tone}`}>
      <div className="flex items-center gap-2">
        <span>{result.ok ? '✓' : '✕'}</span>
        <span className="break-all">{result.message}</span>
      </div>
    </div>
  );
}

function PresetHint({ preset }: { preset: ProviderPreset | undefined }) {
  if (!preset?.hint) return null;
  return <span className="mt-1 text-[11px] text-fg-subtle">{preset.hint}</span>;
}
