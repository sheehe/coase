// CSV → GFM 管道表格的机械派生器。
//
// 设计目标：agent 只负责写 `executor/outputs/tables/*.csv`（唯一真源），
// orchestrator 在每次 tool_result 到达后扫该目录，对每个 csv 同步生成同名 .md。
// 幂等：只在 md 不存在或 csv 比 md 新时重写。
//
// 保守约定：假设 csv 由 R `fwrite` / `write.csv` 产生（UTF-8、逗号分隔、无字段内换行）。
// 支持 quoted field 和 `""` 转义；**不**支持字段内换行。如果以后真出现了再升级。

import { promises as fs } from 'node:fs';
import path from 'node:path';

const TABLES_REL = path.join('executor', 'outputs', 'tables');

export async function syncTableMarkdowns(workspaceRoot: string): Promise<void> {
  if (!workspaceRoot) return;
  const dir = path.join(workspaceRoot, TABLES_REL);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  const csvs = entries.filter((name) => name.toLowerCase().endsWith('.csv'));
  if (csvs.length === 0) return;
  await Promise.all(csvs.map((name) => syncOne(path.join(dir, name))));
}

async function syncOne(csvPath: string): Promise<void> {
  const mdPath = csvPath.slice(0, -4) + '.md';
  try {
    const [csvStat, mdStat] = await Promise.all([
      fs.stat(csvPath),
      fs.stat(mdPath).catch(() => null),
    ]);
    if (mdStat && mdStat.mtimeMs >= csvStat.mtimeMs) return;
    const csv = await fs.readFile(csvPath, 'utf-8');
    const md = renderMarkdown(csv, path.basename(csvPath));
    await fs.writeFile(mdPath, md, 'utf-8');
  } catch {
    // 单个文件失败不影响其他文件
  }
}

function renderMarkdown(csv: string, sourceName: string): string {
  const banner = `<!-- 由 ${sourceName} 自动生成，手改无效，下次 sync 会被覆盖。 -->\n\n`;
  const rows = parseCsv(csv);
  if (rows.length === 0) return banner + `_(${sourceName} 为空)_\n`;
  const header = rows[0];
  const width = header.length;
  const body = rows.slice(1);
  const headerLine = `| ${header.map(escapeCell).join(' | ')} |`;
  const sepLine = `| ${header.map(() => '---').join(' | ')} |`;
  const bodyLines = body.map((r) => {
    const padded = [...r];
    while (padded.length < width) padded.push('');
    return `| ${padded.slice(0, width).map(escapeCell).join(' | ')} |`;
  });
  return banner + [headerLine, sepLine, ...bodyLines].join('\n') + '\n';
}

function escapeCell(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) continue;
    rows.push(parseRow(line));
  }
  return rows;
}

function parseRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  let cellStarted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"' && !cellStarted) {
      inQuotes = true;
      cellStarted = true;
    } else if (c === ',') {
      cells.push(cur);
      cur = '';
      cellStarted = false;
    } else {
      cur += c;
      cellStarted = true;
    }
  }
  cells.push(cur);
  return cells;
}
