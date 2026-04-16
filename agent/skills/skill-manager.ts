// skill-manager.ts — coase-user skill 的导入与删除。
//
// 导入支持两种姿势：
//   1. 选择单个 SKILL.md 文件 → 解析 frontmatter.name → 拷贝到 skills/{name}/SKILL.md
//   2. 选择一个文件夹（内含 SKILL.md）→ 整个文件夹递归拷贝到 skills/{folderName}/
//
// 删除只允许 coase-user 来源的 skill，移除整个 skills/{name}/ 目录。

import { dialog, shell, type BrowserWindow } from 'electron';
import { cp, readFile, mkdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { SkillImportResult } from '../../shared/ipc';
import { resolveCoasePluginPaths } from './plugin-paths';

/**
 * 弹出选择器，导入 skill 到 coase-user plugin。
 * 返回导入结果，不抛异常（错误走 result.error）。
 */
export async function importSkill(
  parentWindow: BrowserWindow | null,
): Promise<SkillImportResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog(
    parentWindow ?? (undefined as unknown as BrowserWindow),
    {
      title: '导入 Skill',
      message: '选择一个 SKILL.md 文件，或包含 SKILL.md 的文件夹',
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: 'SKILL.md', extensions: ['md'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    },
  );

  if (canceled || filePaths.length === 0) {
    return { ok: false, error: 'cancelled' };
  }

  const selected = filePaths[0];
  const info = await stat(selected);

  if (info.isDirectory()) {
    return importFromDirectory(selected);
  }
  // 单文件
  if (basename(selected).toUpperCase() !== 'SKILL.MD') {
    return { ok: false, error: '请选择名为 SKILL.md 的文件。' };
  }
  return importFromFile(selected);
}

/**
 * 删除 coase-user skill。
 * 如果 name 对应的目录不存在或不在 coase-user 下，会抛错。
 */
export async function deleteUserSkill(skillName: string): Promise<void> {
  const { user } = await resolveCoasePluginPaths();
  const skillDir = join(user, 'skills', skillName);

  // 安全检查：必须在 user skills 目录内
  const resolved = join(skillDir); // normalize
  if (!resolved.startsWith(join(user, 'skills'))) {
    throw new Error(`非法的 skill name: ${skillName}`);
  }

  await rm(skillDir, { recursive: true, force: true });
}

/**
 * 在系统文件管理器中打开 coase-user skills 目录。
 */
export async function openUserSkillsDir(): Promise<void> {
  const { user } = await resolveCoasePluginPaths();
  const skillsDir = join(user, 'skills');
  await mkdir(skillsDir, { recursive: true });
  await shell.openPath(skillsDir);
}

// ── 内部实现 ──────────────────────────────────────────────

async function importFromFile(filePath: string): Promise<SkillImportResult> {
  const raw = await readFile(filePath, 'utf-8');
  const name = parseSkillName(raw) ?? inferNameFromPath(filePath);
  if (!name) {
    return { ok: false, error: '无法从文件中解析 skill name。' };
  }

  const { user } = await resolveCoasePluginPaths();
  const destDir = join(user, 'skills', sanitizeName(name));
  await mkdir(destDir, { recursive: true });
  await cp(filePath, join(destDir, 'SKILL.md'));

  return { ok: true, name: sanitizeName(name) };
}

async function importFromDirectory(dirPath: string): Promise<SkillImportResult> {
  const skillMdPath = join(dirPath, 'SKILL.md');
  let raw: string;
  try {
    raw = await readFile(skillMdPath, 'utf-8');
  } catch {
    return { ok: false, error: '所选文件夹内没有找到 SKILL.md。' };
  }

  const name = parseSkillName(raw) ?? basename(dirPath);
  const { user } = await resolveCoasePluginPaths();
  const destDir = join(user, 'skills', sanitizeName(name));

  // 递归拷贝整个目录（覆盖已有内容）
  await cp(dirPath, destDir, { recursive: true, force: true });

  return { ok: true, name: sanitizeName(name) };
}

/**
 * 从 SKILL.md 的 frontmatter 中提取 name 字段。
 * 不引入 yaml 解析器，手动匹配 `name: xxx`。
 */
function parseSkillName(raw: string): string | undefined {
  if (!raw.startsWith('---')) return undefined;
  const end = raw.indexOf('\n---', 3);
  if (end < 0) return undefined;

  const frontmatter = raw.slice(3, end);
  const match = frontmatter.match(/^name:\s*(.+)$/m);
  return match?.[1]?.trim() || undefined;
}

function inferNameFromPath(filePath: string): string | undefined {
  // 尝试用上层目录名
  const parts = filePath.replace(/\\/g, '/').split('/');
  const idx = parts.length - 2; // parent of SKILL.md
  return idx >= 0 ? parts[idx] : undefined;
}

/**
 * 把 skill name 规范化成安全的目录名。
 */
function sanitizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff_-]/g, '');
}
