# 系统提示词（System Prompts）

本目录存放 4 个 Agent 的系统提示词，纯 Markdown。

| 文件 | 作用 | 对应 Agent |
|------|------|----------|
| `planner_system.md` | 研究方案设计 | Planner Agent |
| `executor_system.md` | R 代码执行与分析 | Executor Agent |
| `writer_system.md` | LaTeX 论文撰写 | Writer Agent |
| `reviewer_system.md` | 对抗式评审 | Reviewer Agent |

运行时通过 `Path(__file__).resolve().parent.parent / "prompts" / "xxx_system.md"`
由对应的 `src/agents/*.py` 模块加载（见各 .py 文件顶部的 `_PROMPT_FILE` 变量）。

目录位置：`src/prompts/`（与 `src/agents/`、`src/skills/` 同层）。

---

## 编辑规则（非程序员必读）

1. **直接改文字**：打开 .md 文件，正常编辑段落、表格、规则内容即可，保存生效。
2. **不要改文件名**：4 个文件名一字不差被 Python 引用，改名会直接报错。
3. **保留 Markdown 结构**：`##` 标题、`|` 表格、`-` 列表、`` ` `` 反引号（工具名用）这些符号不要乱动。
4. **中英文混用是有意的**：不要强行翻译 `research_purpose`、`causal`、`APPROVE / REVISE`、
   工具名（如 `write_file`、`grep_workspace`）等英文符号——它们是代码里的关键字。
5. **表格列数要对齐**：修改 Markdown 表格时，每行 `|` 的数量必须一致，否则渲染会错乱。
6. **emoji ❌ ✅ • → 保留**：这些符号在提示词里承担视觉强调作用，尤其是"允许/禁止"清单。
7. **改完建议手工校对一次**：读一遍改动段落，确认语义没有自相矛盾。

## 与 src/skills/ 目录的关系

`src/prompts/*.md` 是 Agent 的**系统提示词**（角色定位、硬性规则、文件落盘契约）。
`src/skills/*/SKILL.md` 是**工作流技能文档**（Phase 1-8 的推荐步骤、每步的自检清单），
由 Agent 在运行中用 `load_skill(...)` 加载，属于另一套内容体系。

两者都可以改，改的方向不同：
- 想改 Agent 的**底线规则 / 身份定位 / 不可逾越的约束** → 改 `src/prompts/*.md`
- 想改 Agent 的**具体执行步骤 / 工作流细节 / Phase 顺序** → 改 `src/skills/*/SKILL.md`

## 改完之后

- **不需要重启服务**：Python 每次创建 Agent 实例时都会 `read_text` 重新读取 .md 文件，
  改完保存后下一次 pipeline 运行自动生效。
- **有 Git 就最好**：改动后建议 `git diff` 看一眼自己改了什么，`git commit` 保存版本，
  改坏了可以随时回滚到上一版。
- **建议跑一次完整 pipeline 验证**：光看文字读不出 Agent 是否还能正确工作，
  必须用一个小项目跑一次 Planner → Executor → Writer 的全流程。
