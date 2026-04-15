import type { ResolvedProvider } from '../providers/resolve';
import type { RuntimeErrorLogEntry } from './runtime-error-log';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function sanitizeUnknown(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (isRecord(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      next[key] = sanitizeUnknown(inner);
    }
    return next;
  }

  return String(value);
}

function pickExtraFields(error: unknown): Record<string, unknown> | undefined {
  if (!isRecord(error)) return undefined;

  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(error)) {
    if (key === 'name' || key === 'message' || key === 'stack' || key === 'cause') {
      continue;
    }
    details[key] = sanitizeUnknown(value);
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

export function describeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
    };
  }

  return {
    name: typeof error === 'string' ? 'Error' : 'UnknownError',
    message: typeof error === 'string' ? error : String(error),
  };
}

export function buildRuntimeErrorLogEntry(args: {
  phase: RuntimeErrorLogEntry['phase'];
  sessionId: string;
  sdkSessionId?: string;
  workspaceRoot?: string;
  firstPrompt: string;
  provider?: ResolvedProvider;
  error: unknown;
  stderr?: string;
}): RuntimeErrorLogEntry {
  const { phase, sessionId, sdkSessionId, workspaceRoot, firstPrompt, provider, error, stderr } =
    args;
  const described = describeError(error);

  return {
    timestamp: new Date().toISOString(),
    phase,
    sessionId,
    sdkSessionId,
    workspaceRoot,
    firstPrompt,
    provider: provider
      ? {
          source: provider.source,
          providerId: provider.providerId,
          providerLabel: provider.providerLabel,
          model: provider.model,
          baseURL: provider.baseURL,
        }
      : undefined,
    error: {
      name: described.name,
      message: described.message,
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? sanitizeUnknown(error.cause) : undefined,
      details: pickExtraFields(error),
    },
    stderr: stderr?.trim() || undefined,
  };
}
