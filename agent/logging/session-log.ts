// Append-only JSONL 会话历史。
//
// 存在 {userData}/sessions.jsonl。每行一个 SessionLogEntry，JSON.stringify 之后加 '\n'。
// 一条记录对应一次多轮 chat 会话的一个快照：
//   - 会话启动时先追加一条 `finishReason` 为 undefined 的"占位"快照
//   - 会话结束（finish / cancel / error）时再追加一条"最终"快照
// 读取侧按 sessionId 去重，文件中**后出现的覆盖前者**，这样运行中的会话只看到
// 占位快照、已结束的会话看到最终快照。这个策略不引入新 IPC，也不需要前端 merge
// 逻辑，写入全程是 append-only，一次只写一行，崩溃至多丢一次 append。
//
// 这个模块只能在 main process 调（依赖 electron.app）。

import { app } from 'electron';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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

function parseLines(raw: string): SessionLogEntry[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const entries: SessionLogEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as SessionLogEntry);
    } catch (err) {
      console.warn('[session-log] skip malformed line:', err);
    }
  }
  return entries;
}

/**
 * 按 sessionId 去重，保留每个 sessionId 在文件中**最后**出现的那一条。
 * 这样"started 占位"会被后追加的"finished 终态"覆盖。
 */
function dedupByLastOccurrence(entries: SessionLogEntry[]): SessionLogEntry[] {
  const map = new Map<string, SessionLogEntry>();
  for (const entry of entries) {
    map.set(entry.sessionId, entry);
  }
  return Array.from(map.values());
}

/**
 * 读最近的 N 条会话历史，按 startedAt 倒序（最新在前）。
 * 文件不存在返回空数组。损坏的行会被跳过并写 console.warn。
 * 同一 sessionId 的多条记录会被合并为最后一次快照。
 */
export async function readRecentSessions(limit = 100): Promise<SessionLogEntry[]> {
  let raw: string;
  try {
    raw = await readFile(getLogPath(), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const entries = dedupByLastOccurrence(parseLines(raw));
  entries.sort((a, b) => b.startedAt - a.startedAt);
  return entries.slice(0, limit);
}

/**
 * 启动时扫一次日志：任何 finishReason 为 undefined 的 sessionId（说明上次运行中
 * 崩溃/强退，从未写入最终快照）都补一条 error seal，避免永久显示为"运行中"。
 * 返回被 seal 的 sessionId 列表，便于调用方记录日志。
 */
export async function sealOrphanedSessions(): Promise<string[]> {
  let raw: string;
  try {
    raw = await readFile(getLogPath(), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const merged = dedupByLastOccurrence(parseLines(raw));
  const orphaned = merged.filter((entry) => entry.finishReason === undefined);
  if (orphaned.length === 0) return [];

  const now = Date.now();
  const sealed: string[] = [];
  for (const entry of orphaned) {
    const seal: SessionLogEntry = {
      ...entry,
      finishReason: 'error',
      endedAt: now,
      ok: false,
      errorMessage: entry.errorMessage ?? '上次运行意外退出，会话未正常结束',
    };
    await appendSessionLog(seal);
    sealed.push(entry.sessionId);
  }
  return sealed;
}

export async function deleteSessionLog(sessionId: string): Promise<void> {
  if (!sessionId.trim()) return;

  let raw: string;
  try {
    raw = await readFile(getLogPath(), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }

  const entries = parseLines(raw).filter((entry) => entry.sessionId !== sessionId);
  const serialized = entries.map((entry) => JSON.stringify(entry));
  await writeFile(
    getLogPath(),
    serialized.length > 0 ? `${serialized.join('\n')}\n` : '',
    'utf-8',
  );
}
