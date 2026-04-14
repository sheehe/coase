---
name: latex_compile_repair
description: compile_latex 失败时按错误类型进行定位和最小修复的操作指南，覆盖引用、语法、宏包、文件引用等常见错误类型
metadata:
  agents: [writer]
---

## LaTeX 编译错误修复手册

当 `compile_latex` 返回 `FAILED` 时加载本 skill。本文档按错误类型给出**具体的识别特征**和**最小修复动作**。

**核心原则**：
1. 每次只修一类错误，修完立刻重编一次（用反馈验证）
2. 不要盲改——先 `read_file` 读出错位置前后 20 行
3. 同一个错误连续出现 3 次 → 停下来，换一种思路，或者检查是不是你修错了别的地方
4. 5 轮仍失败 → 停，诊断落盘，如实汇报

---

## 错误类型速查表

### 1. Citation 错误（最常见）

**识别**：`Key errors` 段出现 `LaTeX Warning: Citation 'XXX' on page N undefined` 或 `! Package natbib Error: Bibliography not compatible`

**根因**：正文写了 `\cite{XXX}` 但 `reference.bib` 里没有 `XXX` 这个条目。

**修复**：
```
1. grep_workspace(pattern=r"\\cite\{XXX\}", file_pattern="*.tex")  # 确认在哪里引用了
2. reference_manage(action='list')  # 确认 bib 中确实没有
3. fetch_bibtex("<DOI 或 paper_id 或 标题>", "doi")  # 获取 BibTeX 字符串
4. reference_manage(action='add', entries=[<bibtex_str>])  # 写入 bib
5. 重编
```

**禁止**：
- ❌ 手写 BibTeX 条目（作者、期刊、volume 很容易错）
- ❌ 直接删掉 `\cite{XXX}` 回避问题——这会篡改论文内容
- ❌ 用占位 key（如 `\cite{TODO}`）

---

### 2. 语法错误：括号 / 环境未配对

**识别**：
- `! Missing } inserted.`
- `! Missing { inserted.`
- `! LaTeX Error: \begin{xxx} on input line N ended by \end{yyy}`
- `! Runaway argument?`

**定位**：错误日志会给出 `l.N` 表示出错行号。用 `read_file` 读该文件，查看 N 行附近。

**修复**：
- 逐字符检查该段的 `{` / `}` 是否配对
- 检查 `\begin{equation}` 是否有对应 `\end{equation}`
- 常见坑：`\text{foo} bar}` 多了一个 `}`

---

### 3. 特殊字符未转义

**识别**：`! You can't use `macro parameter character #' in...` 或编译出的 PDF 中显示乱码

**LaTeX 特殊字符**（必须转义）：

| 字符 | 转义写法 | 说明 |
|-----|---------|-----|
| `&` | `\&` | 表格外裸露的 & 会报错 |
| `%` | `\%` | 百分号 |
| `$` | `\$` | 数学环境分隔符 |
| `#` | `\#` | 宏参数 |
| `_` | `\_` | 数学环境外的下划线（变量名常中招） |
| `{` `}` | `\{` `\}` | 分组符号 |
| `\` | `\textbackslash{}` | 反斜杠 |
| `~` | `\textasciitilde{}` | 波浪号 |
| `^` | `\textasciicircum{}` | 上标符 |

**修复**：`grep_workspace` 找到裸露的特殊字符（注意只在**正文**中，不是宏命令里），`file_edit` 精确替换。

**警告**：不要全局 `_` → `\_`，因为数学环境内的下划线是合法的。只改正文段落。

---

### 4. 宏包 / 命令未定义

**识别**：
- `! LaTeX Error: File 'xxx.sty' not found.`
- `! Undefined control sequence.` 后跟某个 `\command`

**修复**：
- 文件未找到 → 该宏包未安装，用基础宏包替代：
  - `natbib` 缺失 → 改用 `\bibliographystyle{plain}` + 原生 `\cite`
  - `booktabs` 缺失 → 改用原生 `\hline`
  - `subfig` 缺失 → 改用 `subcaption`
- 命令未定义 → 检查是否漏加 `\usepackage{xxx}`；或命令拼写错（如 `\texbf` 应为 `\textbf`）

---

### 5. \input / \include 文件找不到

**识别**：`! LaTeX Error: File 'sections/xxx' not found.`

**修复**：
1. `list_workspace_files(workspace_dir, subdir="writer/sections")` 核对实际文件名
2. 常见坑：`\input{sections/results.tex}` 和 `\input{sections/results}` 都能工作，但 `\input{sections/Results}` 在大小写敏感系统（Docker/Linux）下会失败
3. `file_edit` 修正 `full_paper.tex` 中的 `\input{}` 路径

---

### 6. 数学环境错误

**识别**：
- `! Missing $ inserted.`
- `! Display math should end with $$.`
- `! Extra }, or forgotten $.`

**常见原因**：
- 数学变量（如 `R^2`、`\beta`）写在了文本模式外
- 美元符号未配对：`$x = 1`（缺右 `$`）

**修复**：检查错误行前后，确保数学内容被 `$...$` 或 `\(...\)` 包裹。

---

### 7. 表格错误

**识别**：
- `! Extra alignment tab has been changed to \cr.` → 表格列数不匹配
- `! Misplaced \noalign.` → `\hline` 用错位置

**修复**：
- 数表格 `\begin{tabular}{lcc}` 的列数应该和每行 `a & b & c \\` 的 `&` 数量匹配
- `\hline` 只能在行之间或表格首尾

---

### 8. 编码问题

**识别**：中文或特殊字符变成乱码；`! Package inputenc Error: Unicode character xxx`

**修复**：
- 英文论文中出现的中文字符全部删除或替换
- 确保 `\usepackage[utf8]{inputenc}` 在 preamble 中
- 引号使用 `` `` 和 `''`，不要用 `"`

---

## 修复循环协议

1. **读错误**：`compile_latex` 返回中 `Key errors:` 段是精华，先读这段
2. **定位类型**：对照上面 8 类，找最贴近的
3. **读上下文**：`read_file` 读出错文件的相关部分
4. **最小修复**：`file_edit` 改一处，不顺便动别的
5. **立刻重编**：`compile_latex`，看错误是否消失或变成新的
6. **进度跟踪**：连续 3 轮没进展或同一错误反复 → 停，换思路
7. **兜底**：5 轮仍失败 → 写 `writer/compile_failure.md` 说明无法修复的原因，结束

**不要**：
- ❌ 一次改多个地方 —— 无法定位哪个改动有效
- ❌ 跳过读文件直接猜 —— 大概率越修越错
- ❌ 删除报错的段落回避问题 —— 那是篡改论文
