# Coase · 目录结构

## 顶层布局

```
Coase/
├── .claude/                    # Claude Code 配置（hook / permissions）
│   └── settings.json
├── CLAUDE.md                   # 项目工作准则（Claude 每次会话读）
├── scripts/                    # 构建 / 工具脚本（非运行时代码）
│   └── export_chat_turn.py     # Stop hook：自动归档对话到 doc/message/
├── doc/
│   ├── dev/                    # 开发文档（本目录）
│   ├── design/                 # UI mock / 架构图 / 决策记录
│   └── message/                # 对话归档（hook 自动写入 chat1.md, chat2.md, ...）
├── electron/                   # Electron 主进程 & preload
│   ├── main/                   # main process 入口和生命周期
│   ├── preload/                # contextBridge：暴露给 renderer 的 API
│   └── tsconfig.json
├── src/                        # Renderer（React UI）
│   ├── main.tsx                # renderer 入口
│   ├── App.tsx
│   ├── pages/                  # 顶级页面（Research / Skills / MCP / Settings）
│   ├── features/               # 业务功能模块（每个 feature 自包含）
│   │   ├── research/           # 研究流程页：pipeline 可视化 + 日志
│   │   ├── skill-editor/       # Skill 编辑器（Monaco + 测试运行）
│   │   ├── review-gate/        # 阶段审核弹窗
│   │   ├── mcp-manager/        # MCP 服务器配置
│   │   └── settings/           # 模型 / API key / R 环境
│   ├── components/             # 通用组件（shadcn/ui 包装层）
│   ├── lib/                    # 前端工具函数
│   ├── store/                  # Zustand stores
│   ├── types/                  # 前后端共享类型
│   └── styles/                 # Tailwind 入口、主题变量
├── agent/                      # Agent 编排层（TS，跑在 main process）
│   ├── sdk/                    # Claude Agent SDK 初始化 + 配置封装
│   ├── skills/                 # 内置 skill markdown（打包进应用）
│   │   ├── planner.md
│   │   ├── data-fetcher.md
│   │   ├── analyst.md
│   │   ├── writer.md
│   │   └── reviewer.md
│   ├── tools/                  # 自定义工具（TS 函数 + zod schema）
│   │   ├── r-exec.ts           # 封装 child_process.spawn('Rscript')
│   │   ├── pdf-parse.ts
│   │   ├── citation.ts
│   │   └── dataset-query.ts
│   ├── mcp/                    # 可选：第三方 MCP server 适配
│   ├── providers/              # 模型供应商路由（BASE_URL 切换）
│   │   ├── anthropic-native.ts # 走 Anthropic 协议的厂商
│   │   └── openai-compat.ts    # 走 OpenAI 协议的厂商
│   ├── orchestrator/           # 主编排器（阶段推进 + ReviewGate 触发）
│   │   ├── pipeline.ts         # 顶层 pipeline 定义
│   │   ├── stage.ts            # 单阶段执行（包一层 agent loop）
│   │   └── review-gate.ts      # 阶段间人工审核的钩子
│   └── logging/                # Agent 日志 / 成本统计 / 消息流
├── resources/                  # 静态资源（打包进应用安装目录）
│   ├── icons/                  # App icon, tray icon, ...
│   └── default-skills/         # 默认 skill 模板（用户可复制到自己目录编辑）
├── tests/
│   ├── unit/                   # Vitest 单测
│   └── e2e/                    # Playwright 端到端
├── package.json
├── tsconfig.json               # 根配置
├── tsconfig.node.json          # electron/main + agent 用（Node 环境）
├── tsconfig.web.json           # src/ 用（DOM 环境）
├── electron.vite.config.ts     # electron-vite 构建配置
├── tailwind.config.ts
├── postcss.config.js
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
└── README.md
```

## 为什么这样切

**`electron/` vs `src/` vs `agent/` 三分**：

- `electron/` — 只放 Electron 生命周期和 IPC 桥，不放业务逻辑
- `src/` — 只放 UI（React renderer），不直接调 SDK 或 OS API
- `agent/` — 所有 agent 编排、工具、模型调用都在这里，跑在 main process

这个切分的好处是：renderer 被 Electron 沙箱限制，不能直接 `import '@anthropic-ai/claude-agent-sdk'`（它要用 Node API）。所有 agent 能力必须通过 IPC 暴露给 renderer。这个约束强制了清晰的 UI / 业务边界。

**`features/` 而不是 `components/` 集中放所有组件**：

每个业务模块（skill-editor / review-gate / ...）自包含自己的组件、store、hooks。通用的原子组件才进 `components/`（按钮、输入框、卡片等 shadcn/ui 包装层）。这是 Linear / Notion 规模项目的通用模式，避免 `components/` 变成 2000 文件的垃圾堆。

**`agent/skills/` 是内置 skill，用户编辑的副本走 userData**：

内置 skill 打包进安装目录（只读）。用户在应用内编辑时，复制一份到 Electron 的 `app.getPath('userData')` 目录，之后读写都走用户目录。这样"恢复默认"一键可做，升级应用不会覆盖用户改动。

## 用户数据目录（运行时）

应用运行时在 Electron userData 下创建：

```
{userData}/
├── config/
│   ├── providers.json          # API keys（加密存储）
│   ├── models.json             # 模型选择 / 角色绑定
│   └── preferences.json        # UI 偏好
├── skills/                     # 用户编辑的 skill 副本
├── mcp-servers/                # 用户添加的 MCP server 配置
├── workspace/                  # 研究任务的工作目录
│   └── {task-id}/
│       ├── input/
│       ├── output/
│       └── logs/
└── cache/                      # prompt cache / 模型响应缓存
```

Windows 路径示例：`C:\Users\<User>\AppData\Roaming\Coase\`

## Git 忽略原则

- `node_modules/`, `dist/`, `out/`, `release/` — 构建产物
- `doc/message/` — **不纳入 git**（每次对话自动生成，体积大且敏感）
- `.env*` — API key 等敏感信息
- 用户数据目录（不在仓库内，无需忽略）
