# Coase · 项目概览

## 是什么

Multi-Agent Research System (MARS) 的 v2 桌面应用版本，项目代号 **Coase**（取自经济学家 Ronald Coase）。用 **Electron + TypeScript + Claude Agent SDK** 重写，目标是"真正的打开即用桌面软件"。

v1（`Multi-Agent_Research_System`）继续维护，Coase 在此目录独立开发。两者并行，最终 Coase 稳定后 v1 进入维护模式。

## 为什么要做 v2

v1 的三个根本性问题在 v1 架构内无解：

1. **分发门槛高**：Docker Desktop 对非技术用户是硬门槛
2. **GUI 表现力天花板**：CustomTkinter 做不出 Cursor/Linear 级的体验
3. **LangChain 维护税**：breaking change 频繁 + PyInstaller 打包多 100-200MB

v2 用 **Electron + TS Agent SDK** 同时解掉这三个。

## 核心设计决定（已锁定，不再讨论）

| 维度 | 选择 | 理由 |
|---|---|---|
| 运行壳 | Electron | 真·桌面软件，双击即用，自带自动更新 |
| Agent 引擎 | `@anthropic-ai/claude-agent-sdk`（TS 原生） | Anthropic 一等公民实现，Claude Code 同源 |
| 多模型 | 原生 Anthropic 端点切换（`ANTHROPIC_BASE_URL`） | 零 proxy，零 LiteLLM 供应链风险 |
| UI | React 19 + Tailwind 4 + shadcn/ui + Monaco | 现代桌面软件标配 |
| 权限模式 | `bypassPermissions` + `canUseTool` 回调兜底 | 全自动执行，但危险操作在代码层拦截 |
| ReviewGate | 放在**编排层**，不放在 agent 权限层 | 每阶段结束弹 UI，agent 内部零打扰 |
| R 执行 | 用户自装 R + `child_process.spawn('Rscript')` | 维持 arm's length GPL 立场 |
| Skill | Markdown 文件，应用内可编辑（Monaco） | 一等公民功能，相对 ARIS 的差异化优势 |

## 明确不做

- ❌ Docker 分发（对用户群不适用）
- ❌ LiteLLM（供应链风险 + output_config bug）
- ❌ Python Claude Agent SDK（Node subprocess 让分发变噩梦）
- ❌ MCP 作为主要工具协议（单进程桌面应用用不上跨进程协议；MCP 只用于"让用户挂载第三方工具"的可选场景）
- ❌ 自写 ReAct loop（有 Anthropic 官方 SDK 就不自己造轮子）
- ❌ 嵌入 R 二进制（GPL 风险 + 品牌定位冲突）

## 目标用户

和 v1 一致：社科/经济学研究者、研究生，可能没有命令行经验。衡量标准是"下载安装包→双击→填 API key→开始研究"这条路径不超过 3 分钟。

## 成功标准

v2.0 正式版的定义：

1. Windows / macOS 双平台安装包，单次下载 < 300MB
2. 首次启动向导覆盖：API key 配置、R 环境检测、基础 skill 选择
3. 至少 3 个模型走原生 Anthropic 协议：Claude Sonnet、Kimi K2、GLM-4.x
4. 跑通 v1 已有的完整研究流程（Planner → 数据获取 → 分析 → 写作 → 审核）
5. Skill 编辑器可用，用户能在应用内修改并即时测试 skill
6. 所有 v1 用户数据可一键导入
