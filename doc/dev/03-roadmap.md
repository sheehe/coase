# Coase · 路线图

## 总时间预估

**8–11 周**，分 4 个阶段 + 1 个持续性 track。

每个阶段都有明确的"可运行产出"作为 exit criteria，不允许无限期延长。

## Phase 0: 选型与骨架（1 周）

**目标**：能 `pnpm dev` 打开一个 Electron 窗口显示 Hello World。

任务：
- [ ] 确认技术栈版本锁（见 `01-tech-stack.md`）
- [ ] 初始化 `package.json` + `electron-vite` 脚手架
- [ ] 配置 TS / ESLint / Prettier / Tailwind 4 / shadcn/ui
- [ ] Electron main + preload + renderer 三层骨架
- [ ] 一个最小 IPC：renderer 按钮 → main 返回字符串 → renderer 显示
- [ ] 跑通 `pnpm dev` / `pnpm build` / `pnpm package`

**Exit criteria**：空应用能打包成 `.exe` 并双击运行。

## Phase 1: Agent POC（1–2 周）

**目标**：一个 skill + 一个工具，端到端跑通 Claude Agent SDK。

任务：
- [ ] `agent/sdk/` 初始化 Claude Agent SDK（`permissionMode: 'bypassPermissions'`, `systemPromptType: 'none'`）
- [ ] `agent/providers/anthropic-native.ts`：单一供应商（先 Anthropic 官方），读 API key
- [ ] `agent/tools/r-exec.ts`：最小版 R 执行工具（`child_process.spawn` + stdout/stderr 收集 + OOM 检测）
- [ ] `agent/skills/planner.md`：从 v1 拷贝一段现成 prompt
- [ ] 一个最小编排器：renderer 传研究主题 → main 跑 planner → 把 assistant text 流式回推
- [ ] Renderer 显示 agent 消息流（先纯文本，不用华丽 UI）
- [ ] `canUseTool` 回调：拒绝 `Bash` 之类不该用的默认工具

**Exit criteria**：用户在 UI 输入一个研究主题，点"运行"，能看到 Claude 调用 R 工具产出结果，全程零权限弹窗。

**这是最重要的验证点**：如果这一步不通，整个技术栈选型要回头重评。

## Phase 2: 多供应商 + 核心工具（2 周）

**目标**：四家模型可切换，四个核心工具齐全。

任务：
- [ ] 供应商路由：Anthropic / Moonshot / Z.ai / LongCat 的原生端点切换
- [ ] Settings 页：模型下拉 + API key 表单 + "测试连接"按钮
- [ ] OpenAI 协议 fallback（给 DeepSeek / 通义 一条路）
- [ ] 工具：`pdf-parse`, `citation`, `dataset-query`（从 v1 Python 翻译成 TS）
- [ ] 工具参数统一用 zod schema，自动生成传给 Agent SDK 的 JSON schema
- [ ] 成本统计：记录每次调用的 token / 美元估算

**Exit criteria**：用户可在 Settings 切模型，所有四个工具都能被 agent 调用。

## Phase 3: 编排器 + ReviewGate + 现代 UI（3 周）

**目标**：完整研究 pipeline + 现代桌面级 UI。

任务：
- [ ] 多 skill pipeline：Planner → DataFetcher → Analyst → Writer → Reviewer
- [ ] 阶段间 ReviewGate：每阶段结束弹 Drawer，用户 批准 / 编辑 / 驳回
- [ ] Pipeline 可视化：时间线 + 每阶段状态 + 可展开的日志
- [ ] Skill 编辑器（Monaco + 语法高亮 + 变量占位符 + "测试运行"）
- [ ] MCP 配置页（第 1 层：启用/禁用 + 参数；第 3 层可选）
- [ ] 深色模式
- [ ] 命令面板（Cmd/Ctrl+K）

**Exit criteria**：能跑完一次完整研究任务，UI 质感达到"可截图发朋友圈"的水平。

## Phase 4: 打包、签名、首次运行向导（1–2 周）

**目标**：可分发的 Win/Mac 安装包。

任务：
- [ ] `electron-builder` 配置：Win NSIS / Mac DMG / Linux AppImage
- [ ] 代码签名（Win：证书 or self-sign；Mac：Apple Developer + notarization）
- [ ] 首次运行向导：API key 引导、R 环境检测、默认 skill 选择
- [ ] R 未安装时的引导页（带 r-project.org 链接）
- [ ] 自动更新（`electron-updater` + GitHub Releases）
- [ ] v1 数据导入向导（读取 v1 的 `generated_papers/` 等目录）
- [ ] 跨平台测试（Win 10/11、macOS 13+）

**Exit criteria**：从 GitHub Release 下载安装包 → 双击安装 → 首次启动向导走完 → 跑通一次研究任务。

## 并行 Track: v1 维护

v1 不停更新，但只接 bug fix 和安全补丁，不加新功能。所有新功能往 v2 做。

v2.0 正式发布 → 公告 → v1 进入 6 个月维护期 → 停止维护。

## 里程碑版本号

| 版本 | 时机 | 内容 |
|---|---|---|
| `v2.0.0.0-alpha.1` | Phase 1 完成 | 内部 POC，不分发 |
| `v2.0.0.0-alpha.2` | Phase 2 完成 | 内部，多供应商验证 |
| `v2.0.0.0-beta.1` | Phase 3 完成 | 小范围公测 |
| `v2.0.0.0-rc.1` | Phase 4 大半 | 公开候选版 |
| `v2.0.0.0` | Phase 4 完成 | 正式版 |

版本号规则沿用 CLAUDE.md 定义的 `x.x.x.x`。

## 风险清单（持续跟踪）

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 国产模型原生 Anthropic 端点的工具调用质量不及预期 | 中 | 高 | Phase 1 POC 时先用 Kimi 跑一次工具密集任务，不行就在 Phase 2 加 OpenAI 协议 fallback 作为主路径 |
| Claude Agent SDK TS 版 API 不稳定 | 低 | 中 | 锁定次要版本 + 每次升级做 smoke test |
| Monaco Editor 在 Electron 里打包体积膨胀 | 中 | 低 | 用 `@monaco-editor/react` 的 CDN loader 或按需加载 |
| R 跨平台 `Rscript` 路径差异（macOS / Linux / Win） | 中 | 中 | 启动时检测常见位置 + 允许用户手动指定 |
| 代码签名成本和流程 | 高 | 低 | 先发 self-sign 的 alpha/beta，正式版再上签名 |

## 什么时候可以回头重评

只有两个信号触发"暂停推进，回去重看技术选型"：

1. **Phase 1 POC 失败**：Claude Agent SDK 的 TS 版在基本 agent loop 上就跑不通，或性能/稳定性问题无法解决
2. **Phase 2 多供应商完全不行**：所有国产模型的原生 Anthropic 端点都无法承载工具密集任务

其它所有问题都在当前方案内解决，不再回头讨论"要不要换路线"。
