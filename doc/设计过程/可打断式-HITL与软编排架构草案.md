## Coase 可打断式 HITL 与软编排架构草案

### 1. 文档目的

本文档用于明确 Coase 后续设计的核心方向：

- Coase 不走硬状态机式 pipeline 编排
- Coase 以单主 agent 为中心，按需派发 sub-agent
- Skill 是研究流程的主要约束来源，不是程序里的固定阶段机
- HITL 不做强关卡审批，而做“默认自动运行 + 用户随时打断纠偏”
- UI 与程序托底层负责可观测性、可干预性、可恢复性，而不替 agent 决定研究路径

本文档不是实现细节说明书，而是后续所有产品、前端、IPC、main 进程设计的总原则。

---

### 2. 核心定位

#### 2.1 Coase 是什么

Coase 的定位不是传统意义上的“多 agent pipeline engine”，而是：

**Skill-driven research cockpit**

即：

- 一个持续持有全局上下文的主 agent
- 一组带研究方法与交付规范的 skills
- 可按需调用的 sub-agent
- 一个让用户理解、观察、打断、纠偏、恢复研究过程的桌面工作台

#### 2.2 Coase 不是什么

Coase 不应被设计为：

- 程序定义死阶段顺序的硬流水线系统
- 固定多个常驻 agent、由代码显式路由的多体系统
- 把长研究过程切成多个上下文孤岛的审批机
- 以“聊天界面”替代“研究工作台”的产品

---

### 3. 总设计原则

#### 3.1 Agent 决定研究怎么做

以下内容应主要由主 agent + skill 决定：

- 当前研究路径
- 阶段切换时机
- 是否需要取数、分析、写作、审校
- 是否需要自我迭代
- 是否需要派发 sub-agent
- 工具调用顺序

程序不应把这些写死在状态机里。

#### 3.2 程序决定研究如何被观察和干预

以下内容应由 UI、IPC、main 进程和持久化层负责：

- 当前运行状态
- 成本与 token 消耗
- 最近工具调用
- 最近产物与工作区文件
- 用户打断与指导
- 会话/研究持久化
- 里程碑与恢复
- provider / R 环境 / 安全边界

#### 3.3 Stage 是解释层，不是执行层

`Planner / DataFetcher / Analyst / Writer / Reviewer` 在 Coase 中的定位应为：

- 对研究过程的解释框架
- 对用户的可视化标签
- 对 skills 的能力组织方式

而不是：

- 程序强制切换的状态
- 没完成上一阶段就不允许下一阶段的门禁

---

### 4. 软编排架构草案

#### 4.1 目标

软编排的目标不是“程序替 agent 编排”，而是：

- 让主 agent 保持长上下文连续工作
- 让 UI 能大致知道 agent 正在做什么
- 让用户可以随时介入纠偏
- 让系统保留研究过程的结构化痕迹

#### 4.2 架构分层

建议把 Coase 拆成五层：

##### A. 主 agent 层

职责：

- 持有整个研究任务的全局上下文
- 决定使用哪个 skill、何时切换工作模式
- 决定是否起 sub-agent
- 汇总 sub-agent 结果
- 输出最终论文草稿与研究产物

主 agent 是唯一长期存在的研究负责人。

##### B. sub-agent 层

职责：

- 接收主 agent 派发的局部任务
- 完成限定范围内的工作
- 返回结果给主 agent

原则：

- sub-agent 是策略性工具，不是固定组织结构
- 是否存在、存在几个、负责什么，由主 agent 决定
- UI 只展示，不强制调度

##### C. skill 层

职责：

- 提供研究方法、流程偏好、交付格式、工具边界
- 帮助主 agent 在不同研究工作模式下维持稳定行为

skill 的意义是“方法模板”，不是“程序流程节点”。

##### D. 托底程序层

职责：

- Claude Agent SDK 集成
- 工具注入与权限边界
- provider/model 配置
- transcript、artifact、milestone 持久化
- 中断、继续、恢复等运行控制

##### E. UI 层

职责：

- 展示当前研究意图
- 展示当前推断阶段
- 展示成本与运行状态
- 展示产物、日志、回放
- 提供“打断并指导”的入口

---

### 5. 可打断式 HITL 草案

#### 5.1 核心理念

Coase 的 HITL 不应是“阶段结束后必须人工审批”的关卡式设计。

Coase 的 HITL 更适合定义为：

**默认全自动运行，用户可随时打断并指导，指导不会清空既有研究记忆。**

#### 5.2 目标交互

期望的用户体验应为：

1. 用户给出研究任务
2. agent 自动持续运行，从规划一路推进到论文输出
3. 用户平时只观察，不需要一步一步批准
4. 如果用户发现方向偏了，可随时打断
5. 用户输入建议后，agent 在同一研究上下文中继续，而不是重开新任务
6. 最后用户只需看结果与必要的过程记录

#### 5.3 与传统 HITL Gate 的差异

传统关卡式 HITL：

- 到节点暂停
- 等用户审批
- 再继续
- 程序掌握节奏

Coase 的可打断式 HITL：

- 默认不停
- 用户随时打断
- 指导回灌到当前研究 run
- agent 掌握研究节奏，人类掌握纠偏权

#### 5.4 人类打断的语义

用户的中途输入在 Coase 中不应只是“follow-up chat”，而应被视为：

- guidance：指导
- correction：纠偏
- override：覆盖约束
- reprioritization：重排优先级
- stop-current-approach：停止当前做法

也就是说，中途输入的语义不是“重新开聊”，而是“插手当前研究”。

---

### 6. 研究运行对象：Run 而不是硬 Pipeline

#### 6.1 为什么需要 Run

虽然 Coase 不做硬流水线，但仍然需要一个程序层面的权威运行对象，用来承载：

- 当前研究是否在运行
- 当前 transcript 与 artifact
- 当前成本
- 当前里程碑
- 当前是否被用户打断
- 当前是否等待用户输入

这个对象不负责“规定研究阶段”，只负责“承载研究运行态”。

#### 6.2 Run 的建议字段

建议未来维护一个 `ResearchRun`：

```ts
type RunStatus =
  | 'idle'
  | 'running'
  | 'interrupted'
  | 'awaiting_user_guidance'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface ResearchRun {
  runId: string;
  sessionId: string | null;
  title: string;
  status: RunStatus;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  latestIntent?: string;
  inferredStage?: 'planner' | 'datafetcher' | 'analyst' | 'writer' | 'reviewer' | 'idle';
  latestProvider?: {
    label: string;
    model: string;
    baseURL?: string;
  };
  latestTurnMetrics?: {
    turns?: number;
    durationMs?: number;
    costUsd?: number;
  };
  totalCostUsd: number;
  interventionCount: number;
  artifactCount: number;
  currentMilestone?: string;
}
```

注意：

- `ResearchRun` 是程序托底对象
- 它不是流程节点树
- 它不决定 agent 下一步必须做什么

---

### 7. 当前阶段与当前意图的解释模型

#### 7.1 StageRail 的定位

StageRail 应继续保留，但必须明确它是：

- 解释层
- 用户理解层
- 观察层

而不是执行约束层。

#### 7.2 Stage 推断来源

后续可综合以下信号做软推断：

- 最近调用的 skill 名
- 最近 assistant 的工作摘要
- 最近 tool_use
- 最近产物类型
- 最近 review / self-review 行为

#### 7.3 Intent 比 Stage 更重要

仅展示阶段还不够，Coase 更应该展示当前意图：

例如：

- 正在澄清识别问题
- 正在梳理数据字典
- 正在生成基线回归代码
- 正在比较稳健性设定
- 正在重写 Results 段
- 正在做最终审校

建议未来在 StageRail 或主内容区附近增加一个 `CurrentIntentCard`。

---

### 8. 打断并指导：交互协议草案

#### 8.1 用户操作定义

建议 UI 中存在一个一级动作：

**打断并指导**

点击后行为：

1. 请求暂停当前 agent 继续推进
2. 保留当前 transcript、artifact、milestone
3. 展示一个指导输入框
4. 用户输入新建议
5. 该建议作为 intervention 注入当前 run
6. agent 在当前研究记忆上继续执行

#### 8.2 不是 Cancel

“打断并指导”与 `cancel` 必须严格区分：

- `cancel`：结束当前 run，不再继续
- `interrupt`：暂停当前 run，等待新的指导后继续

#### 8.3 建议新增的运行语义

后续 IPC/内部运行控制建议区分：

- `run.start`
- `run.interrupt`
- `run.provideGuidance`
- `run.resume`
- `run.cancel`

其中：

- `interrupt` 只负责停住当前推进
- `provideGuidance` 负责把用户建议注入上下文
- `resume` 负责继续运行

在实现上也可以把 `provideGuidance` 隐式触发 `resume`，但语义上应区分。

#### 8.4 指导输入应保留类型

建议未来对用户指导做轻结构化：

```ts
type GuidanceKind =
  | 'direction_change'
  | 'fact_correction'
  | 'method_constraint'
  | 'writing_feedback'
  | 'cost_control'
  | 'other';

interface UserGuidance {
  id: string;
  runId: string;
  ts: number;
  kind: GuidanceKind;
  text: string;
}
```

原因：

- 后续可以在 UI 中单独展示“指导历史”
- agent 也更容易理解哪些是长期约束，哪些是局部修改

---

### 9. 记忆与不中断上下文

#### 9.1 核心原则

用户打断后，系统必须保证：

- 不丢既有研究上下文
- 不丢既有 transcript
- 不丢已生成产物
- 不把指导误当作新会话

#### 9.2 建议的记忆分层

未来可把研究记忆分成三层：

##### A. 对话记忆

- transcript
- tool_use / tool_result
- provider / turn_result

##### B. 工作记忆

- 当前研究目标
- 当前假设
- 当前约束
- 当前最新用户指导
- 当前 agent 自我计划

##### C. 外部记忆

- artifacts
- milestone
- 会话摘要
- review / guidance 历史

agent 的“持续性”主要依赖 A+B，用户理解和恢复主要依赖 C。

---

### 10. 产物优先：Artifact Layer

#### 10.1 为什么必须做 Artifact Layer

可打断式 HITL 成立的前提，是用户不仅能看 transcript，还能看实际研究产物。

用户的很多指导都针对具体产物：

- 这段 R 代码设定不对
- 这个样本处理要改
- 这张表的解释不成立
- 这一段写得像报告，不像论文

因此 Coase 必须从“会话中心”走向“产物中心”。

#### 10.2 建议的 artifact 类型

至少应支持：

- `plan`
- `r_script`
- `table`
- `figure`
- `results_text`
- `draft_section`
- `review_note`
- `final_paper`

#### 10.3 建议的 artifact 索引结构

```ts
interface ArtifactRecord {
  id: string;
  runId: string;
  ts: number;
  kind:
    | 'plan'
    | 'r_script'
    | 'table'
    | 'figure'
    | 'results_text'
    | 'draft_section'
    | 'review_note'
    | 'final_paper';
  title: string;
  path?: string;
  contentPreview?: string;
  inferredStage?: string;
  sourceTool?: string;
}
```

UI 后续需要有一个 Artifacts Panel，而不是只让用户翻 transcript。

---

### 11. Milestone Layer

#### 11.1 为什么需要里程碑

虽然不做硬 pipeline，但仍然需要对研究进展形成结构化刻度。

Milestone 的作用：

- 帮助用户理解研究走到哪里
- 帮助系统做恢复
- 帮助未来从某个节点继续研究

#### 11.2 里程碑不等于阶段门禁

Milestone 只记录“已经达到什么状态”，不要求：

- 没到这个里程碑就不能继续
- 达到后必须进入下一固定步骤

#### 11.3 建议的 milestone 示例

- 研究问题已澄清
- 识别策略已形成
- 数据已完成初步准备
- 基线结果已生成
- 稳健性检查已完成
- Results 草稿已生成
- 全文草稿已生成
- 自我审校已完成

---

### 12. Sub-agent 的定位

#### 12.1 主 agent 与 sub-agent 的关系

Coase 更适合：

- 一个长期存在的主 agent
- 若干临时 sub-agent

而不适合：

- 固定 Planner / Analyst / Writer / Reviewer 四个常驻 agent

#### 12.2 sub-agent 的使用原则

sub-agent 只在以下情况启用：

- 某任务天然可并行
- 某任务需要临时隔离上下文
- 某任务需要 reviewer 视角
- 某任务计算量或整理量较大

#### 12.3 UI 需要展示什么

UI 不需要复杂调度器，但建议未来可展示：

- 当前是否有 sub-agent 正在运行
- sub-agent 的任务简述
- sub-agent 返回了什么结果

这样用户能理解“当前 agent 是否在分派工作”。

---

### 13. 系统级提醒：不是 Gate，而是 Risk Prompt

#### 13.1 为什么还需要系统提醒

虽然 Coase 不做强制审批关卡，但某些情况仍应提醒用户是否要介入：

- 成本急剧上升
- 长时间无明显收敛
- 即将执行高风险操作
- 即将覆盖重要产物
- 模型多轮反复尝试失败

#### 13.2 提醒的定位

这些提醒不是“必须批准才可继续”，而是：

- 提示用户有风险
- 给用户介入入口
- 若用户不介入，系统可继续

这更符合 Coase 的自动化目标。

---

### 14. 前端工作台建议形态

#### 14.1 从 Chat UI 走向 Research Console

Coase 前端后续不应再围绕“聊天”作为中心，而应围绕“研究运行工作台”展开。

建议核心区域包括：

- StageRail：当前软阶段与模型/成本摘要
- CurrentIntent：当前 agent 正在做什么
- Transcript：过程回放
- Artifacts Panel：产物浏览
- Guidance Timeline：用户打断与指导记录
- StatusFooter：R 环境、provider、成本、运行状态

#### 14.2 一级动作建议

后续建议把以下动作做成一级可见操作：

- 开始研究
- 打断并指导
- 恢复自动运行
- 查看产物
- 查看指导历史
- 开始新研究

---

### 15. 后续实现边界原则

#### 15.1 应写进 skill / prompt 的内容

- 研究方法路径
- 阶段切换逻辑
- 自我迭代方式
- sub-agent 何时使用
- reviewer 何时介入
- 工具使用策略

#### 15.2 应写进 IPC / renderer / main 的内容

- interrupt / guidance / resume 语义
- transcript 持久化
- artifact 索引与预览
- milestone 记录
- provider / cost / 环境状态
- 运行状态与历史

#### 15.3 明确不建议做的内容

- 程序强制阶段门禁
- 固定多 agent 编排图
- 每阶段必须人工审批
- 把用户中途指导变成“开新会话”

---

### 16. 推荐的近期路线图

#### Phase A：可打断运行

目标：

- 引入 interrupt / guidance / resume 语义
- 让用户能在同一 run 中打断并继续

优先事项：

- 运行态对象
- 中断事件
- 指导记录
- UI 的“打断并指导”入口

#### Phase B：Artifact Layer

目标：

- 让 transcript 之外的产物成为一等公民

优先事项：

- artifact 索引
- 产物面板
- 代码/文本/表格/图形的基础预览

#### Phase C：Milestone 与恢复

目标：

- 支持从历史 run 恢复与继续

优先事项：

- milestone 记录
- run 级历史
- 从指定 milestone 继续

#### Phase D：sub-agent 可视化

目标：

- 让用户理解主 agent 是否在分派局部任务

优先事项：

- sub-agent 事件
- sub-agent 摘要
- 主线与子线关系展示

---

### 17. 结论

Coase 的正确方向不是复刻传统多 agent pipeline 系统，而是：

- 保留单主 agent 的长上下文优势
- 用 skill 而不是状态机来驱动研究流程
- 用可打断式 HITL 而不是强审批 Gate 来实现人工协作
- 用 artifact、milestone、cost、intent、history 来提升可观测性与可恢复性

一句话总结：

**让 agent 自由做研究，让程序负责让研究过程可见、可控、可恢复。**
