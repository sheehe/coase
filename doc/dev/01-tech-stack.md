# Coase · 技术栈

## 总览

```
┌─────────────────────────────────────────────┐
│  Electron (main process, Node.js runtime)   │
│  ├─ @anthropic-ai/claude-agent-sdk          │
│  ├─ Agent orchestrator (TS)                 │
│  ├─ Custom tools (R exec / PDF / citation)  │
│  ├─ Provider router (BASE_URL 切换)         │
│  └─ IPC bridge to renderer                  │
└──────────────────┬──────────────────────────┘
                   │ contextBridge / IPC
┌──────────────────▼──────────────────────────┐
│  Renderer (Chromium, React 19)              │
│  ├─ Pages: Research / Skills / MCP / Set    │
│  ├─ Pipeline visualization                  │
│  ├─ Skill editor (Monaco)                   │
│  └─ ReviewGate drawer                       │
└─────────────────────────────────────────────┘
```

## 依赖清单

### 核心运行时
| 依赖 | 版本 | 用途 |
|---|---|---|
| `electron` | ^34 | 桌面壳 |
| `electron-vite` | ^2 | 构建工具链（main + preload + renderer 统一构建） |
| `electron-builder` | ^25 | 打包 `.exe` / `.dmg` / `.AppImage` |
| `typescript` | ^5.6 | 类型系统 |
| `node` | ≥20 LTS | Electron 内嵌，开发环境也要 |

### Agent 层
| 依赖 | 版本 | 用途 |
|---|---|---|
| `@anthropic-ai/claude-agent-sdk` | 最新 | Agent 主循环 |
| `@anthropic-ai/sdk` | 最新 | 兜底直连 Anthropic API（Agent SDK 之外的场景） |
| `openai` | 最新 | OpenAI 协议兼容模型（非 Anthropic 端点时的 fallback） |
| `zod` | ^3 | Tool 参数 schema 验证 |

### UI 层
| 依赖 | 版本 | 用途 |
|---|---|---|
| `react` / `react-dom` | ^19 | UI 框架 |
| `react-router-dom` | ^7 | 路由 |
| `tailwindcss` | ^4 | 样式 |
| `@radix-ui/*` + `shadcn/ui` | 最新 | 组件库（Dialog / Drawer / Command / Toast 等） |
| `lucide-react` | 最新 | 图标 |
| `framer-motion` | ^11 | 动画 |
| `zustand` | ^5 | 状态管理（不用 Redux） |
| `@monaco-editor/react` | 最新 | Skill 编辑器 |
| `react-markdown` + `remark-gfm` | 最新 | Markdown 渲染 |
| `recharts` | ^2 | 数据可视化 |

### 开发工具
| 依赖 | 用途 |
|---|---|
| `vitest` | 单元测试 |
| `playwright` | E2E 测试（renderer + main 集成） |
| `eslint` + `@typescript-eslint` | Lint |
| `prettier` | 格式化 |

## 模型供应商矩阵

走原生 Anthropic 协议（首选）：

| 厂商 | BASE_URL | 推荐模型 |
|---|---|---|
| Anthropic | `https://api.anthropic.com` | `claude-sonnet-4-6`, `claude-opus-4-6` |
| Moonshot | `https://api.moonshot.cn/anthropic` | `kimi-k2-0711-preview` |
| Z.ai (智谱) | `https://api.z.ai/api/anthropic` | `glm-4.6`, `glm-4.5-air` |
| LongCat（美团） | `https://api.longcat.chat/anthropic` | `LongCat-Flash-Thinking` |

走 OpenAI 协议（fallback，通过自建 provider wrapper 而非 LiteLLM）：

| 厂商 | BASE_URL | 备注 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | Function calling 质量一般，定位"辅助 agent" |
| 通义（Qwen） | 阿里云兼容端点 | Coder 任务备选 |
| OpenAI | `https://api.openai.com/v1` | GPT-4 系列可选 |

## 外部依赖（用户侧）

| 组件 | 处理方式 |
|---|---|
| Node.js | ✅ Electron 自带，用户无需安装 |
| Claude Code CLI | ❌ **不需要**（用 SDK 直接 API 调用，不 spawn CLI） |
| Python | ❌ 不需要（所有业务逻辑用 TS 重写） |
| R + Rscript | ⚠️ 用户自装，Launcher 预检引导到 r-project.org |
| LaTeX（如果要出 PDF） | ⚠️ 可选，Launcher 检测后按需引导 |

## 为什么不用 Python Agent SDK

Python 版的 `claude-agent-sdk` 本质是 `subprocess.Popen(["claude", ...])`，会在运行时拉起一个 Node 子进程跑 Claude Code CLI。这意味着 Python 版用户仍然需要装 Node + CLI。TS 版不存在这个问题——Electron 自带 Node，SDK 就是本地原生模块。

## 为什么不用 MCP 作为主要工具协议

MCP 的设计目标是"**跨进程**工具调用"（一个 agent 进程调另一个 server 进程）。Coase 是单 Electron 进程，工具就是同进程里的 TS 函数——多一层 JSON-RPC 翻译层毫无意义。

MCP 在项目里只保留一个用途：**允许高级用户挂载第三方 MCP server**（比如社区的 arxiv-mcp、github-mcp），作为"可选扩展"而非主通道。
