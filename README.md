# Coase

社科研究多 agent 桌面系统（MARS v2 分支，以经济学家 Ronald Coase 命名）。

## 是什么

一款为社会科学研究者设计的多 agent 研究助手桌面应用。
**Electron + TypeScript + Claude Agent SDK**，真·打开即用。

前身：[`../Multi-Agent_Research_System`](../Multi-Agent_Research_System)（MARS v1，Python + LangChain + Docker，继续维护，新功能只在 Coase 里做）。

## 状态

🚧 **Phase 0 · 搭骨架中**。

## 开发文档

先读这五份：

1. [`doc/dev/00-overview.md`](doc/dev/00-overview.md) — 项目定位、范围、核心设计决定
2. [`doc/dev/01-tech-stack.md`](doc/dev/01-tech-stack.md) — 技术栈、依赖、模型供应商矩阵
3. [`doc/dev/02-project-structure.md`](doc/dev/02-project-structure.md) — 目录结构和切分理由
4. [`doc/dev/03-roadmap.md`](doc/dev/03-roadmap.md) — 4 阶段路线图、里程碑、风险清单
5. [`doc/dev/04-v1-migration.md`](doc/dev/04-v1-migration.md) — 从 v1 迁什么、怎么迁、不迁什么

工作准则见 [`CLAUDE.md`](CLAUDE.md)。

## 对话归档

每次 Claude Code 会话结束后，`scripts/export_chat_turn.py`（Stop hook）自动把对话追加到 `doc/message/chatN.md`。这个目录**不纳入 git**（见 `.gitignore`）。
