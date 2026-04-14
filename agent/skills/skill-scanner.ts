// 扫描 coase-builtin 和 coase-user 两个 plugin 目录，找出所有 skill。
//
// 不走 SDK 的 supportedCommands()，原因：
//  1. supportedCommands 只在 Query 对象上，必须先起一次 query 才能调；
//     query 又需要解析 provider、启子进程，代价太大，UI 拿不动
//  2. 我们完全控制 plugin 目录的布局（skills/<name>/SKILL.md），直接 fs 扫出来
//     更快，不依赖 provider 配置
//  3. Bundled skill 不在我们手上，本页也不展示它们——用户需要的是"我能编辑哪些"
//
// Frontmatter 解析是故意写得朴素：只支持 `key: value` 一行一项 + `|` 块标量。
// Skill 作者用 Markdown frontmatter 的用法也就这么点，不值得引入 yaml 依赖。

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { SkillInfo, SkillSource } from '../../shared/skills';
import { resolveCoasePluginPaths } from './plugin-paths';

export async function scanAllSkills(): Promise<SkillInfo[]> {
  const paths = await resolveCoasePluginPaths();
  const [builtin, user] = await Promise.all([
    scanPluginSkills(paths.builtin, 'coase-builtin'),
    scanPluginSkills(paths.user, 'coase-user'),
  ]);
  return [...builtin, ...user];
}

async function scanPluginSkills(
  pluginDir: string,
  source: SkillSource,
): Promise<SkillInfo[]> {
  const skillsDir = join(pluginDir, 'skills');
  let entries: string[];
  try {
    entries = await readdir(skillsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const results: SkillInfo[] = [];
  for (const entry of entries) {
    const skillDir = join(skillsDir, entry);
    let isDir: boolean;
    try {
      isDir = (await stat(skillDir)).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    const skillFile = join(skillDir, 'SKILL.md');
    let raw: string;
    try {
      raw = await readFile(skillFile, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      console.warn(`[skill-scanner] 读不开 ${skillFile}:`, err);
      continue;
    }

    const parsed = parseFrontmatter(raw);
    // 没有 frontmatter 也不会崩，只是 name/description 会用 fallback。
    results.push({
      name: parsed.fields.name ?? entry,
      description: parsed.fields.description ?? '(无 description)',
      source,
      filePath: skillFile,
      frontmatterRaw: parsed.frontmatterRaw,
      body: parsed.body,
    });
  }
  return results;
}

interface ParsedSkillFile {
  fields: Record<string, string>;
  frontmatterRaw: string;
  body: string;
}

function parseFrontmatter(raw: string): ParsedSkillFile {
  // 找到首尾两组 '---' 分隔符。第一组必须在文件开头。
  if (!raw.startsWith('---')) {
    return { fields: {}, frontmatterRaw: '', body: raw };
  }
  const end = raw.indexOf('\n---', 3);
  if (end < 0) {
    return { fields: {}, frontmatterRaw: '', body: raw };
  }
  const frontmatterRaw = raw.slice(3, end).replace(/^\r?\n/, '');
  // 结束分隔符后面可能是 \n 或 \r\n，都跳掉
  const afterEnd = end + 4; // 跳过 '\n---'
  const body = raw.slice(afterEnd).replace(/^\r?\n/, '');

  const fields: Record<string, string> = {};
  // 每行 `key: value`。value 两端去空白。不支持嵌套、数组、多行字符串。
  // Skill frontmatter 在 Coase 场景下只需要 name + description，够用。
  for (const line of frontmatterRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (key) fields[key] = value;
  }

  return { fields, frontmatterRaw, body };
}
