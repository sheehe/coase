// Append-only JSONL 会话历史。
//
// 存在 {userData}/sessions.jsonl。每行一个 SessionLogEntry，JSON.stringify 之后加 '\n'。
// 一条记录对应一次多轮 chat 会话（start → cancel/finish），不是单个 agent turn。
// Phase 3 从这里读 RunSummaryBar 的数据。
//
// 这个模块只能在 main process 调（依赖 electron.app）。

import { app } from 'electron';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { SessionLogEntry } from '../../shared/runs';

function getLogPath(): string {
  return join(app.getPath('userData'), 'sessions.jsonl');
}

export async function appendSessionLog(entry: SessionLogEntry): Promise<void> {
  const path = getLogPath();
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(entry) + '\n', 'utf-8');
}

/**
 * 读最近的 N 条会话历史，按 startedAt 倒序（最新在前）。
 * 文件不存在返回空数组。损坏的行会被跳过并写 console.warn。
 */
export async function readRecentSessions(limit = 100): Promise<SessionLogEntry[]> {
  let raw: string;
  try {
    raw = await readFile(getLogPath(), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const entries: SessionLogEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as SessionLogEntry);
    } catch (err) {
      console.warn('[session-log] skip malformed line:', err);
    }
  }
  entries.sort((a, b) => b.startedAt - a.startedAt);
  return entries.slice(0, limit);
}
