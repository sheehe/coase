# Coase · 从 v1 迁移什么

## 原则

**迁移的是资产，不是代码**。v1 代码本身 90% 不能直接用（语言不同、架构不同），但 v1 积累的**领域知识、踩坑经验、交互设计**全部要保留。

## 迁移清单

### ✅ 100% 迁移（直接拷贝或翻译）

| 资产 | v1 位置 | v2 目标位置 | 形态 |
|---|---|---|---|
| 各 agent 的 system prompt | `src/agents/*/prompts.py` 等 | `agent/skills/*.md` | 直接改成 Markdown |
| Few-shot 示例 | 同上 | 同上 | 嵌入 skill 或放 `resources/default-skills/` |
| R 脚本模板 | `src/**/scripts/*.R` | `resources/r-templates/` | 文件内容 100% 复用，R 代码不改 |
| 研究方法论文档 | `doc/*.md` | `doc/design/methodology/` | 直接拷贝 |
| 参考文献规范 | 配置/代码 | `agent/tools/citation.ts` 内嵌配置 | 逻辑翻译 |
| UX 流程（预检、ReviewGate、向导） | `deploy/mars_gui.py` | `src/features/*/` | 交互设计不变，换实现 |
| 版本号规则、Git 约定 | `CLAUDE.md` | 已复制到 v2 `CLAUDE.md` | 原样保留 |

### ⚠️ 部分迁移（提取知识，重写实现）

| 资产 | v1 状况 | v2 做法 |
|---|---|---|
| **OOM 检测 + R 错误摘要逻辑** | `src/infrastructure/docker_runner.py` 里 ~60 行 Python | 翻译成 TS 放 `agent/tools/r-exec.ts`，**逻辑完全保留** |
| **R stdout 噪声过滤** | 同上 | 同上，正则表达式一行都不改 |
| **Launcher 预检系统** | `deploy/mars_gui.py` 的 `_refresh_preflight` | v2 重写为 React 组件，但"检查哪几项"和提示文案直接复用 |
| **模型配置对话框** | Python + CustomTkinter | v2 用 shadcn/ui `Dialog` + `Form` 重写，但字段、校验规则、"测试连接"的行为照搬 |
| **研究流程编排逻辑** | LangChain Chain / Graph | 用 Agent SDK 的 skill 串联重写，但**阶段划分和阶段间 ReviewGate 位置保持一致** |
| **Pipeline 状态可视化** | v1 简单列表 | v2 用 Framer Motion + 时间线组件升级 |

### ❌ 不迁移（v2 直接扔掉）

| 资产 | 为什么不要 |
|---|---|
| LangChain 相关所有代码 | v2 用 Claude Agent SDK，LangChain 抽象层冗余 |
| CustomTkinter Launcher 代码 | v2 用 React 重写 |
| Docker / docker-compose 配置 | v2 不走 Docker 分发 |
| `docker.sock` sibling container 模式 | v2 R 直接 `spawn('Rscript')` |
| PyInstaller / 打包脚本 | v2 用 electron-builder |
| Python 依赖（`requirements.txt`、`pyproject.toml`） | v2 无 Python |
| litellm / proxy 相关实验代码 | v2 直连原生端点 |

## 具体翻译指南

### R exec 工具（最重要的一个）

v1 `docker_runner.py` 的核心价值不在"调 Docker"这部分（v2 扔掉），而在：

1. **OOM 检测**：识别被 OOM killer 杀掉的进程
2. **stderr 噪声过滤**：过滤 R 启动时的一堆无用警告
3. **错误摘要**：把几百行 R 报错压缩成几十行给 LLM 看

这三块要**字面翻译**到 `agent/tools/r-exec.ts`。正则表达式保持一致（它们是血泪踩出来的）。

伪代码结构：

```typescript
// agent/tools/r-exec.ts
import { spawn } from 'node:child_process';
import { z } from 'zod';

const R_NOISE_PATTERNS = [
  /* 从 v1 Python 代码里一字不差拷过来 */
];

export const rExecTool = {
  name: 'r_exec',
  description: '执行 R 脚本并返回结构化结果',
  inputSchema: z.object({
    script: z.string(),
    timeout_sec: z.number().default(300),
    memory_limit_mb: z.number().default(2048),
  }),
  async execute(input) {
    // 1. spawn Rscript
    // 2. 收集 stdout / stderr
    // 3. 应用噪声过滤
    // 4. OOM 检测
    // 5. 返回 { exit_code, stdout, stderr, summary, oom_hint }
  }
};
```

### Skill 文件格式

v1 里 prompt 散落在 Python 文件的字符串常量里。v2 每个 skill 是一个 `.md` 文件：

```markdown
---
name: planner
description: 研究方案设计
model_preference: claude-sonnet-4-6
tools: [r_exec, dataset_query]
---

你是一位资深社会科学研究员...

## 任务
{{research_topic}}

## 输出格式
...
```

前置 YAML frontmatter 定义元数据，下面是 system prompt 模板。Agent 编排器读这个文件，把 `{{vars}}` 填好后传给 SDK 的 `systemPrompt` 字段。

### 用户数据导入

v2 正式版要提供"从 v1 导入"向导：

1. 询问 v1 安装目录（默认 `c:\Projects\Multi-Agent_Research_System`）
2. 扫描 `generated_papers/`、`research_ledger.json`、`workspace/`
3. 复制到 v2 的 `{userData}/workspace/imported-from-v1/`
4. 显示导入报告：N 个任务 / M 篇论文

这个向导在 Phase 4 做。

## 不要做的事

- ❌ **不要**把 v1 的 Python agent 代码当"参考实现"逐行翻译。v1 的 agent loop 是 LangChain 包出来的黑盒，翻译没有价值。只翻译 prompt 和工具函数。
- ❌ **不要**在 v2 里用"兼容 v1 配置格式"的代码。v2 是新版本，配置文件格式重来。导入向导一次性转换，之后只认 v2 格式。
- ❌ **不要**同时开发 v1 新功能。v1 冻结新功能，所有新想法进 v2 backlog。
