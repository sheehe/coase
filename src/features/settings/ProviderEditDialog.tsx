import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

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

// validate 返回的是直接渲染到 <Field error> 的本地化字符串。t 由组件传入，
// 切语言时错误提示也跟着切。
function validate(
  record: ProviderRecord,
  t: TFunction<'settings'>,
): Partial<Record<keyof ProviderRecord, string>> {
  const errors: Partial<Record<keyof ProviderRecord, string>> = {};

  if (!record.id.trim()) errors.id = t('providers.dialog.id.errorEmpty');
  else if (!/^[a-z0-9][a-z0-9-_]*$/i.test(record.id)) {
    errors.id = t('providers.dialog.id.errorFormat');
  }

  if (!record.label.trim()) errors.label = t('providers.dialog.labelField.errorEmpty');

  if (!record.baseURL.trim()) errors.baseURL = t('providers.dialog.baseURL.errorEmpty');
  else if (!/^https?:\/\//.test(record.baseURL)) {
    errors.baseURL = t('providers.dialog.baseURL.errorFormat');
  }

  if (!record.model.trim()) errors.model = t('providers.dialog.model.errorEmpty');
  if (!record.credential.trim()) errors.credential = t('providers.dialog.credential.errorEmpty');

  if (record.autoCompactWindow !== undefined) {
    if (
      !Number.isFinite(record.autoCompactWindow) ||
      record.autoCompactWindow < AUTO_COMPACT_MIN ||
      record.autoCompactWindow > AUTO_COMPACT_MAX
    ) {
      errors.autoCompactWindow = t('providers.dialog.autoCompact.errorRange', {
        min: AUTO_COMPACT_MIN.toLocaleString(),
        max: AUTO_COMPACT_MAX.toLocaleString(),
      });
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
  const { t } = useTranslation('settings');
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
      // preset 显式声明的 thinking 行为覆盖之前的设置；preset 没声明（undefined）
      // 时回到 SDK 默认（adaptive），把字段清掉以免历史值粘连。
      disableThinking: preset.disableThinking === true ? true : undefined,
    }));
  }

  async function handleSave() {
    const nextErrors = validate(form, t);
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
    const nextErrors = validate(form, t);
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
        message: t('providers.dialog.test.callError', {
          message: err instanceof Error ? err.message : String(err),
        }),
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        mode === 'new'
          ? t('providers.dialog.newTitle')
          : t('providers.dialog.editTitle', { label: form.label || form.id })
      }
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => void handleTest()}
            disabled={saving || testing}
            className="mr-auto"
          >
            {testing
              ? t('providers.dialog.testing')
              : t('providers.dialog.testConnection')}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving || testing}>
            {t('providers.dialog.cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || testing}>
            {saving ? t('providers.dialog.saving') : t('providers.dialog.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mode === 'new' && (
          <Field
            label={t('providers.dialog.preset.label')}
            hint={t('providers.dialog.preset.hint')}
          >
            <Select value={selectedPresetId} onChange={(e) => applyPreset(e.target.value)}>
              <option value="">{t('providers.dialog.preset.none')}</option>
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

        <Field
          label={t('providers.dialog.id.label')}
          hint={t('providers.dialog.id.hint')}
          error={errors.id}
        >
          <Input
            value={form.id}
            onChange={(e) => updateField('id', e.target.value)}
            disabled={mode === 'edit'}
            placeholder="minimax-anthropic"
          />
        </Field>

        <Field label={t('providers.dialog.labelField.label')} error={errors.label}>
          <Input
            value={form.label}
            onChange={(e) => updateField('label', e.target.value)}
            placeholder="MiniMax"
          />
        </Field>

        <Field label={t('providers.dialog.protocol.label')}>
          <Select
            value={form.protocol}
            onChange={(e) => updateField('protocol', e.target.value as ProviderProtocol)}
          >
            <option value="anthropic">{t('providers.dialog.protocol.anthropic')}</option>
            <option value="openai" disabled>
              {t('providers.dialog.protocol.openai')}
            </option>
          </Select>
        </Field>

        <Field label={t('providers.dialog.baseURL.label')} error={errors.baseURL}>
          <Input
            value={form.baseURL}
            onChange={(e) => updateField('baseURL', e.target.value)}
            placeholder="https://api.minimax.io/anthropic"
          />
        </Field>

        <Field label={t('providers.dialog.model.label')} error={errors.model}>
          <Input
            value={form.model}
            onChange={(e) => updateField('model', e.target.value)}
            placeholder="MiniMax-M2.7"
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-[13px] hover:border-border-strong">
          <input
            type="checkbox"
            checked={form.disableThinking === true}
            onChange={(e) =>
              updateField('disableThinking', e.target.checked ? true : undefined)
            }
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-fg">
              {t('providers.dialog.disableThinking.label')}
            </span>
            <span className="text-[11.5px] leading-5 text-fg-subtle">
              {t('providers.dialog.disableThinking.hint')}
            </span>
          </span>
        </label>

        <Field
          label={t('providers.dialog.auth.label')}
          hint={t('providers.dialog.auth.hint')}
        >
          <Select
            value={form.authMode}
            onChange={(e) => updateField('authMode', e.target.value as AuthMode)}
          >
            <option value="auth_token">{t('providers.dialog.auth.authToken')}</option>
            <option value="api_key">{t('providers.dialog.auth.apiKey')}</option>
          </Select>
        </Field>

        <Field label={t('providers.dialog.credential.label')} error={errors.credential}>
          <Input
            type="password"
            value={form.credential}
            onChange={(e) => updateField('credential', e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
          />
        </Field>

        <Field
          label={t('providers.dialog.autoCompact.label')}
          hint={t('providers.dialog.autoCompact.hint', {
            min: AUTO_COMPACT_MIN.toLocaleString(),
            max: AUTO_COMPACT_MAX.toLocaleString(),
          })}
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
            placeholder={t('providers.dialog.autoCompact.placeholder')}
          />
        </Field>

        {testResult && <TestResultBanner result={testResult} />}
      </div>
    </Dialog>
  );
}

function TestResultBanner({ result }: { result: TestConnectionResult }) {
  const { t } = useTranslation('settings');
  const tone = result.ok
    ? 'border-border bg-app text-fg'
    : 'border-danger/30 bg-danger/5 text-danger';

  return (
    <div className={`rounded-xl border px-3 py-3 text-xs ${tone}`}>
      <div className="flex items-center gap-2 font-mono">
        <span>{result.ok ? t('providers.dialog.test.ok') : t('providers.dialog.test.fail')}</span>
        <span className="break-all">{result.message}</span>
      </div>

      {result.requestText && (
        <div className="mt-3 flex justify-end">
          <div className="max-w-[85%] rounded-[18px] rounded-br-md bg-fg px-3 py-2 text-[12px] text-app">
            <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-app/70">
              {t('providers.dialog.test.sentLabel')}
            </div>
            <div className="leading-6">{result.requestText}</div>
          </div>
        </div>
      )}

      {result.responseText && (
        <div className="mt-2 flex justify-start">
          <div className="max-w-[85%] rounded-[18px] rounded-bl-md border border-border/80 bg-surface px-3 py-2 text-[12px] text-fg">
            <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-fg-subtle">
              {t('providers.dialog.test.replyLabel')}
            </div>
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
