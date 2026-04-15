// Append-only JSONL 会话历史。
//
// 存在 {userData}/sessions.jsonl。每行一个 SessionLogEntry，JSON.stringify 之后加 '\n'。
// 同一会话在生命周期内会多次出现：
//   - 会话启动 / 续跑启动时，先追加一条 `finishReason` 为 undefined 的"占位"快照
//   - 会话结束（finish / cancel / error）时，再追加一条"最终"快照
// 读取侧按 sessionId 去重，文件中**后出现的覆盖前者**，这样运行中的会话只看到
// 占位快照、已结束的会话看到最终快照。这个策略不引入新 IPC，也不需要前端 merge
// 逻辑，写入全程是 append-only，一次只写一行，崩溃至多丢一次 append。
//
// 为避免 append-only 文件无限膨胀，我们会在启动时 / 每 N 次 append 后，把文件
// 重写为去重后的最终状态（compactSessionLog）。重写走"临时文件 + rename"保证原子。
//
// 这个模块只能在 main process 调（依赖 electron.app），但为了可测试，getLogPath
// 走的是一个模块内的 override；测试里可以通过 `__setSessionLogPathForTests` 注入
// 假路径，这样 vitest 不必 mock 整个 electron 模块。

import { app } from 'electron';
import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { SessionLogEntry } from '../../shared/runs';

let pathOverride: string | null = null;

/**
 * 仅供测试使用：把 sessions.jsonl 的绝对路径重定向到指定位置。
 * 传 `null` 恢复默认（走 electron 的 userData）。
 */
export function __setSessionLogPathForTests(path: string | null): void {
  pathOverride = path;
}

function getLogPath(): string {
  if (pathOverride) return pathOverride;
  return join(app.getPath('userData'), 'sessions.jsonl');
}

// 每多少次 append 后主动触发一次 compaction 检查。太小浪费 IO，太大意义不大。
const APPEND_COMPACT_EVERY = 25;
// 文件超过这个大小就值得 compact（未 dedup 前）。默认 64 KiB——这个文件是纯文本，
// 超过 64 KiB 一般意味着积累了上百条记录。
const COMPACT_MIN_BYTES = 64 * 1024;

let appendCounter = 0;

export async function appendSessionLog(entry: SessionLogEntry): Promise<void> {
  const path = getLogPath();
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(entry) + '\n', 'utf-8');

  appendCounter += 1;
  if (appendCounter >= APPEND_COMPACT_EVERY) {
    appendCounter = 0;
    // 不 await，失败也不该阻塞主流程；内部自己写 console.warn。
    void compactSessionLogIfNeeded().catch((err) =>
      console.warn('[session-log] background compact failed:', err),
    );
  }
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
 * 读出某个 sessionId 的最新快照。用于续跑时合并历史总耗、复用 firstPrompt 等。
 */
export async function loadSessionEntry(sessionId: string): Promise<SessionLogEntry | null> {
  if (!sessionId.trim()) return null;
  let raw: string;
  try {
    raw = await readFile(getLogPath(), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const merged = dedupByLastOccurrence(parseLines(raw));
  return merged.find((entry) => entry.sessionId === sessionId) ?? null;
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
  await writeFileAtomic(
    getLogPath(),
    serialized.length > 0 ? `${serialized.join('\n')}\n` : '',
  );
}

/**
 * 把日志文件重写成"已去重的最终状态"：每个 sessionId 只留最后一条。
 * 重写走临时文件 + rename 保证原子性——中途崩溃最多丢掉这次 compact，不会
 * 出现半截文件。
 *
 * 返回：是否真的重写过，以及 dedup 后的条数。
 */
export async function compactSessionLog(): Promise<{ rewrote: boolean; entries: number }> {
  let raw: string;
  try {
    raw = await readFile(getLogPath(), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { rewrote: false, entries: 0 };
    }
    throw err;
  }

  const allLines = parseLines(raw);
  const deduped = dedupByLastOccurrence(allLines);

  // 如果 dedup 前后条数相同，说明每个 sessionId 都只写了一条，文件已经是 canonical。
  // 这种情况继续重写只会浪费 IO（文件内容字节级相同），直接跳过。
  if (deduped.length === allLines.length) {
    return { rewrote: false, entries: deduped.length };
  }

  const body = deduped.map((entry) => JSON.stringify(entry)).join('\n');
  await writeFileAtomic(getLogPath(), deduped.length > 0 ? `${body}\n` : '');
  return { rewrote: true, entries: deduped.length };
}

/**
 * 条件触发 compaction：只在文件已经变大后才重写，避免对小文件无意义反复改写。
 */
export async function compactSessionLogIfNeeded(): Promise<{
  rewrote: boolean;
  entries: number;
}> {
  let size: number;
  try {
    const info = await stat(getLogPath());
    size = info.size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { rewrote: false, entries: 0 };
    }
    throw err;
  }
  if (size < COMPACT_MIN_BYTES) {
    return { rewrote: false, entries: 0 };
  }
  return compactSessionLog();
}

async function writeFileAtomic(targetPath: string, content: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  // 同目录临时文件避免跨盘 rename 退化成拷贝。
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, content, 'utf-8');
  await rename(tempPath, targetPath);
}
