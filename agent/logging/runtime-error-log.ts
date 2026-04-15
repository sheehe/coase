import { app } from 'electron';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface RuntimeErrorLogEntry {
  timestamp: string;
  phase: 'create_query' | 'run_loop';
  sessionId: string;
  sdkSessionId?: string;
  workspaceRoot?: string;
  firstPrompt: string;
  provider?: {
    source: 'config' | 'env';
    providerId?: string;
    providerLabel?: string;
    model: string;
    baseURL?: string;
  };
  error: {
    name: string;
    message: string;
    stack?: string;
    cause?: unknown;
    details?: Record<string, unknown>;
  };
}

export function getRuntimeErrorLogPath(): string {
  return join(app.getPath('userData'), 'logs', 'runtime-errors.jsonl');
}

export async function appendRuntimeErrorLog(entry: RuntimeErrorLogEntry): Promise<string> {
  const filePath = getRuntimeErrorLogPath();
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(entry) + '\n', 'utf-8');
  return filePath;
}
