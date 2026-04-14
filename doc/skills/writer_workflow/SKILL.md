---
name: writer_workflow
description: Writer 6 阶段推荐写作流程：Claims-Evidence 矩阵→主结果→机制异质性→稳健性→局限性→全文组装
metadata:
  agents: [writer]
---

## 论文撰写推荐流程

以下是推荐的写作流程，供参考。你可以根据实际情况调整顺序或回溯。

---

## 文件落盘契约（系统 prompt 已给出，这里重申关键点）

- 所有 section 落到 `writer/sections/<name>.tex`
- 最终组装文件**必须**命名为 `writer/full_paper.tex`（不是 `paper.tex`）—— `compile_latex` 按固定文件名读
- 所有 `\cite{key}` 必须在 `writer/reference.bib` 中有对应条目，不允许 undefined citation 进入编译
- 凡是长段落（多篇文献的 literature review、多个检验的 robustness）都直接写文件，不要粘回对话

---

### Phase 1: 产出筛选与 Claims-Evidence 矩阵

**目标**：阅读所有前序 Agent 的输出，构建论文的 Claims-Evidence 矩阵。

推荐方法：使用 `read_file` 依次阅读：
- planner/stage_7_baseline_design.md（基准设计）
- planner/stage_3_hypothesis.md（研究假设）
- executor/stage_2_run_baseline.md（基准回归结果）
- executor/stage_3_explanation_robustness.md（稳健性/机制结果）
- executor/stage_4_table_figure_output.md（表格图表产出）
- executor/specification_log.md（规格记录）
- reviews/ 目录下的所有评审报告

使用 `list_workspace_files` 查看 executor/outputs/ 下的表格和图表。

步骤：
1. 识别所有产出，分类为正文/附录/排除
2. 构建 Claims-Evidence 矩阵：
   | Claim # | 声明 | 强度（Strong/Moderate/Suggestive/Descriptive）| 证据来源 | 证据类型 |
3. 规划论文结构，确定各节需引用的表格/图表编号

**输出**：完整的 Claims-Evidence 矩阵、产出分类表、论文结构大纲

---

### Phase 2: Main Results Paragraph

**目标**：生成论文中可直接使用的主结果文字模块。

硬性规则：
1. 每个数字必须可验证：使用 `read_file` 读取表格文件，确认每个系数、标准误、p值都与表格完全一致
2. 表格引用精确：使用 "Table X, Column (Y)" 格式
3. 诚实报告：如果基准回归不显著，如实报告

推荐方法：
- 使用 `read_file` 读取 executor/outputs/tables/ 下的表格验证数字
- 使用 `write_file` 将结果写入 writer/sections/results.tex

写作模板参考：
```latex
\section{Empirical Results}
\subsection{Baseline Results}
Table \ref{tab:baseline} reports the baseline regression results.
Column (1) presents the basic specification...
The coefficient on [Treatment] is [β] (SE = [SE]),
[significant at the X% level / statistically insignificant],
suggesting that [interpretation]...
```

**输出**：Main Results Paragraph（一段正式、简洁、适合论文正文的结果描述）

---

### Phase 3: Explanation / Mechanism & Heterogeneity Paragraph

**目标**：生成克制、准确的机制和异质性描述。

语言规范（关键）：
- 机制分析：✅ "suggestive evidence that...", "consistent with the interpretation that..."；❌ "proves that the mechanism is..."
- 异质性分析：✅ "descriptive finding", "the effect appears larger for..."；❌ "the treatment causes different effects for..."

推荐方法：
- 使用 `read_file` 读取机制和异质性分析结果
- 使用 `write_file` 写入 writer/sections/mechanism.tex

**输出**：
1. Explanation/Mechanism Paragraph（默认写成 supporting evidence，明确解释力边界）
2. Heterogeneity Paragraph（若有，描述条件差异，标注为 descriptive finding）

---

### Phase 4: Robustness Paragraph

**目标**：生成说明关键稳健性检验及其意义的文字。

推荐方法：
- 说明进行了哪些关键检验、这些检验缓解了什么问题、哪些问题仍未完全解决
- 使用 `read_file` 读取稳健性检验结果
- 使用 `write_file` 写入 writer/sections/robustness.tex

写作模板参考：
```latex
\subsection{Robustness Checks}
To address potential threats to our identification strategy,
we conduct several robustness checks.
\subsubsection{Placebo Test}
We conduct a placebo test by [description]...
```

**输出**：Robustness Paragraph

---

### Phase 5: Limitation / Interpretation Boundary Paragraph

**目标**：此输出为必选，不得省略。

必须包含的三类局限：
1. 识别策略局限：因果识别的核心假设有哪些无法完全验证
2. 数据局限：样本代表性、变量测量误差、缺失数据的影响
3. 外部有效性局限：结果是否可以推广到其他情境

附加要求：
- 如果有稳健性检验未通过，必须在此提及
- 不要使用 "future research can address..." 作为搪塞
- 每个局限都要说明对结论的具体影响

推荐方法：使用 `read_file` 阅读评审反馈和稳健性结果；使用 `write_file` 写入 writer/sections/limitations.tex

**输出**：Limitation / Interpretation Boundary Paragraph

---

### Phase 6: 文献引用锁定

**目标**：确保正文中每一处 `\cite{key}` 都有对应的真实 BibTeX 条目。

**引用必须是原子操作**：

每次在正文中提到某篇文献时，**在写完那句话之前**立即完成以下四步，不得事后批量补引用：

1. **搜索文献**：使用 `search_semantic_scholar` 搜索论文，获得 paper_id 或 DOI
2. **抓取 BibTeX**：调用 `fetch_bibtex`，优先传入 DOI（最准确），其次 paper_id，再次标题
   ```
   fetch_bibtex("10.1086/261725", "doi")           # 最优：DOI
   fetch_bibtex("<paper_id>", "paper_id")           # 次优：SS paper_id
   fetch_bibtex("Title of the paper", "title")      # 备用：标题搜索
   ```
3. **写入 .bib**：调用 `reference_manage(action='add', entries=[<bibtex_str>])`，记录返回的 citation key
4. **当场插入 cite**：在刚刚写的那句话中插入 `\cite{key}`，**这一步不得延后**

**原子操作示例**：
```
# 错误做法（分离）：先写完所有正文，最后再批量加引用 ❌
# 正确做法（原子）：
写到 "Bertrand and Mullainathan (2004) find that..." → 立即执行步骤1-4，
插入 \cite{BertrandMullainathan2004}，再继续写下一句。
```

**常见引用场景**：
- Literature Review / Introduction：每引用一篇文献，执行上述 1-4 步
- 对比分析中提到的基准论文：同上
- 方法论来源（DID、RDD、IV 等经典文献）：同上

**禁止行为**：
- ❌ 直接编写 BibTeX 条目（作者、期刊、年份易出错）
- ❌ 使用不存在于 reference.bib 中的 `\cite{key}`
- ❌ 在正文中提到某论文但不插入 `\cite{}`（文字引用必须有 LaTeX 引用）
- ❌ 引用无法通过 `search_semantic_scholar` 找到的虚构论文

---

### Phase 7: 全文组装与最终检查

**目标**：将所有 Writing Blocks 组装成完整的学术论文，编译出 PDF。

#### Step 1 — 补齐所有缺失的 section

使用 `read_file` 读取 `writer/sections/` 下已有文件，找出缺失的 section，逐一写入：

- `writer/sections/abstract.tex`（3-5 句）
- `writer/sections/introduction.tex`（研究动机、贡献、结构预告）
- `writer/sections/literature.tex`（文献综述 / 制度背景）
- `writer/sections/data_methodology.tex`（数据、变量、识别策略）
- `writer/sections/results.tex`（Phase 2 已写，如缺则补）
- `writer/sections/mechanism.tex`（有机制分析时）
- `writer/sections/robustness.tex`（Phase 4 已写，如缺则补）
- `writer/sections/limitations.tex`（Phase 5 已写，**必选**）
- `writer/sections/conclusion.tex`

#### Step 2 — 组装 full_paper.tex

使用 `write_file(workspace_dir, "writer/full_paper.tex", content)` 创建主文件（**文件名是 `full_paper.tex`，不是 `paper.tex`**）。模板：

```latex
\documentclass[12pt]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb,booktabs,graphicx,natbib}
\usepackage[margin=1in]{geometry}

\title{Your Title}
\author{Your Name}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
\input{sections/abstract}
\end{abstract}

\section{Introduction}
\input{sections/introduction}

\section{Literature Review}
\input{sections/literature}

\section{Data and Methodology}
\input{sections/data_methodology}

\section{Empirical Results}
\input{sections/results}

% 可选：机制 / 异质性
\input{sections/mechanism}

\section{Robustness Checks}
\input{sections/robustness}

\section{Limitations}
\input{sections/limitations}

\section{Conclusion}
\input{sections/conclusion}

\bibliographystyle{aer}
\bibliography{reference}

\end{document}
```

#### Step 3 — 提交前自检（强制 4 步，与 system prompt 对应）

1. **查文件**：`list_workspace_files(workspace_dir, subdir="writer")` —— 9 个 section + `full_paper.tex` + `reference.bib` 必须都在
2. **查引用**：
   ```
   grep_workspace(pattern=r"\\cite\{([^}]+)\}", file_pattern="*.tex")
   reference_manage(action='list')
   ```
   正文用到的每个 key 都必须在 bib 中。缺失的立刻 `fetch_bibtex` 补全（必须按 Phase 6 的原子四步做，优先 DOI）。
3. **查一致性**：打开 `writer/full_paper.tex`，每个 `\input{sections/xxx}` 都要对应实际存在的文件
4. **首次编译**：`compile_latex(workspace_dir)` —— 默认编译 `writer/full_paper.tex`

#### Step 4 — 编译自我修复循环（失败时）

如果 Step 3 的 `compile_latex` 返回 `FAILED`，进入最多 5 轮的修复循环：

| 错误类型 | 识别特征 | 修复动作 |
|---------|---------|---------|
| `Citation X undefined` | Key errors 段出现此串 | 返回 Phase 6 原子四步，`fetch_bibtex` + `reference_manage(add)` 补齐，重编 |
| `Undefined control sequence` | `! Undefined control sequence.` | 通常是宏包未加载或拼写错误，`file_edit` 修复命令 |
| `LaTeX Error: File not found` | `! LaTeX Error: File xxx.tex not found` | `list_workspace_files` 找真实文件名，`file_edit` 修 `\input{}` 路径 |
| `Missing $ inserted` | 数学环境未配对 | 找到对应段落，检查 `$...$` 闭合 |
| 特殊字符未转义 | `! Missing } inserted` 或意外 `&` | 检查 `_`、`&`、`%`、`#`、`$` 是否在文本中裸露，需转义 |
| `Runaway argument` | `Runaway argument?` | 某个 `{` 未闭合，通常在报错行附近 |

修复规则：
- 每次只修一类错误，修完立刻重编
- 同一个错误重复 3 次 → 停下读 `read_file` 看完整上下文，不要盲改
- 5 轮仍失败 → `write_file(workspace_dir, "writer/compile_failure.md", diagnostics)` 写入完整诊断，如实说明无法修复的原因，再结束
- 详细错误手册：`load_skill('latex_compile_repair')`

#### Step 5 — 产出最终摘要

编译成功后：
1. 生成 Presentation Summary（3-5 句，答辩/组会口头摘要）
2. Claims-Evidence 最终审计：验证矩阵中每个 Claim 都在正文中体现

**输出格式**：
- Presentation Summary（3-5句）
- Paper Assembly Summary（论文结构概要、Claims-Evidence 审计结果、LaTeX 编译状态、PDF 路径）
