---
name: executor_workflow
description: 对应 /experiment-bridge。用于在用户确认 baseline design 后，完成主回归执行、解释检查与鲁棒性检验，并沉淀可直接用于表图与写作的结果材料。
---

## Workflow Notes

- 执行本 skill 前，先阅读 `references/role-rules.md`。
- 若角色规则与正文 phase 细节冲突，以 `references/role-rules.md` 的硬约束优先。
- 当前版本直接基于 Coase 当前会话中的用户需求、附件、工作区文件和已有资料执行。
- 执行阶段默认从 `planner/stage_7_baseline_design.md` 和相邻规划文件读取已确认的 baseline design。

---

## 输出语言规范（中文输出强制）

stage_*.md 中的中文叙述**必须使用中文术语**，不得在中文句子里直接夹塞英文单词冒充术语。常见对照：

| 英文 | 中文（正文使用） |
|------|----------------|
| censoring | 删失（生存分析）/ 截断（panel 边界） |
| confounding / confounder | 混杂 / 混杂因素 |
| heterogeneity / heterogeneous treatment effect | 异质性 / 异质性处理效应 |
| endogeneity | 内生性 |
| selection bias | 选择性偏差 |
| reverse causality | 反向因果 |
| robustness check | 稳健性检验 |
| placebo test | 安慰剂检验 |
| pre-trend | 平行趋势（事前趋势） |
| spillover | 溢出效应 |
| treatment / control group | 处理组 / 对照组 |
| baseline / outcome / covariate | 基准 / 结果变量 / 协变量 |
| cluster / clustering | 聚类（标准误） |
| fixed effect (FE) | 固定效应 |
| identification strategy | 识别策略 |

**保留**的英文缩写（行业惯例，不译）：DID、IV、RDD、PSM、OLS、Logit、Probit、AIC、BIC、p-value、N、R²、F-stat、SE、CI、ATT、ATE、LATE、MVP。

R 代码、函数 / 包名（`fixest::feols`、`lmtest`）、表格表头、文件路径保留英文。**仅**适用于 stage_*.md 的中文叙述段落。

---

## 研究目的适配（执行前必读，贯穿所有 Phase）

启动时**必须**从上下文（全局 system prompt 或 `planner/stage_7_baseline_design.md` 首部的 `Research purpose` 字段）读取 **research_purpose**。它决定回归执行口径与结论表述的硬约束，Planner 的方法学选择已按此字段分化，Executor **只执行、不重定性**。

| 目的 | 执行要求 | 结论表述 | 不可做 |
|------|---------|---------|-------|
| **causal** | 严格按 Planner 锁定的识别策略执行（DID / Event Study / IV / RDD / PSM）；placebo / pre-trend / falsification 等防线必须跑出来 | 用因果语言："X 对 Y 的因果效应为…"、"识别得到…"、"处理效应…" | 用"关联/相关/在控制…后仍显著"削弱 Planner 已确立的因果结论 |
| **associative** | 按 Planner 指定的回归族（OLS / Logit / Probit / Poisson 等）+ FE / 聚类 SE 执行；补共线性（VIF）与反向因果讨论作为边界 | 首次呈现主结果时必须声明"本研究为关联性研究，结果不支持因果解读"；措辞统一"相关/关联/在控制…后仍显著" | 用"因果效应/影响/导致/使得…"冒充因果结论 |

**禁止私自降级**：若 causal 项目的识别策略在数据上失效（平行趋势不成立、IV 弱工具、RDD 带宽无变异、PSM 共同支撑过窄），**必须**在 `executor/specification_log.md` 中明确标注失效原因 + 诊断证据，并在 `stage_5_assessment.md` 中建议用户回到 Planner 调整研究问题或识别策略——**不得擅自把研究重新定性为 associative 后继续推进**。用户选 causal 就是期望因果结论，偷偷降级等于违约。

**每个 Phase 写 stage_\*.md 前自检**：通读一遍即将落盘的文本，确保所有结论性措辞与 `research_purpose` 一致；Phase 5 最终摘要是用户唯一看到的结论，"研究类型"一行必须与 `research_purpose` 完全对齐。

---

## 分析实施推荐流程

以下是推荐的执行流程，供参考。你可以根据实际情况调整顺序、回溯不适用的步骤。

---

## 文件落盘契约（每个 Phase 必须落盘）

下游 Reviewer（Mode B）和 Writer 按固定文件名读取你的输出。每个 Phase 结束前**必须**调用写工具写入对应的 stage_*.md，否则等同于没做。

> ### ⚠️ 路径警示（极易写错，违反下游契约）
>
> **`stage_*.md` 必须落在 `executor/` 根目录**，绝对不能写到 `executor/scripts/` 或其他子目录。
> `executor/scripts/` 只允许存放 `.R` 脚本。

| Phase | 文件 | 关键内容 |
|------|------|---------|
| 1 | `executor/stage_1_data_preparation.md` | 数据准备说明 + 样本量 + 变量清单 |
| 2 | `executor/stage_2_run_baseline.md` | 主回归结果文字 + 系数/SE 汇报 + 2-4 句解读 |
| 3 | `executor/stage_3_explanation_robustness.md` | Priority Check Map + 机制/异质性/稳健性 |
| 4 | `executor/stage_4_table_figure_output.md` | Table Package + Figure Package 清单 + 文件路径 |
| 5 | `executor/stage_5_assessment.md` | Appendix & Next-Step Suggestions |
| 持续 | `executor/specification_log.md` | 所有跑过的规格（即使失败的） |

**硬性规则**：
- stage_*.md 的内容是**自然语言总结**，不是原始 R 输出
- 表格和图表的**原始数据**落到 `executor/outputs/tables/` 和 `executor/outputs/figures/`，stage_*.md 里只引用路径
- 不要把 `summary(model)` 全文粘到 stage_*.md 里，挑关键行就行
- 长内容只落盘不粘对话

---

## 统一 R 命令模板（强制使用）

以下是 Executor 跨项目共享的"标准配方"——表格 / 图 / 回归的口径在这里统一锁死。脚本里**直接套用**，规格调整改参数即可，**不要替换库或重写 helper**。要换写法必须先在 `specification_log.md` 说明理由。

### 1) 包加载（每个 .R 脚本顶部固定写）

```r
suppressPackageStartupMessages({
  library(data.table)    # 数据处理（fread/fwrite）
  library(arrow)         # parquet I/O
  library(fixest)        # 回归（高维 FE + C++ 后端）
  library(modelsummary)  # 表格 / 系数图
  library(ggfixest)      # event study (ggiplot)
  library(ggplot2)       # 图
  library(scales)        # 坐标格式化
})
```

### 2) 回归（baseline 与多列对比）

```r
# 双向 FE + cluster SE — 短面板最常见配方
m <- feols(y ~ x + z1 + z2 | firm + year, data = dt, cluster = ~firm)

# 主表多列对比必须用 named list（modelsummary 直接读列名）
mods <- list(
  "(1) Pooled"     = feols(y ~ x,                       data = dt, cluster = ~firm),
  "(2) + Controls" = feols(y ~ x + z1 + z2,             data = dt, cluster = ~firm),
  "(3) + FE"       = feols(y ~ x + z1 + z2 | firm+year, data = dt, cluster = ~firm)
)
```

### 3) 表格（CSV 唯一真源 — 数值精度一次决定）

```r
modelsummary(
  mods,
  output    = "data.frame",
  fmt       = 4,                                          # 系数/SE 4 位
  estimate  = "{estimate}{stars}",
  statistic = "({std.error})",
  stars     = c('*' = .1, '**' = .05, '***' = .01),
  gof_omit  = "AIC|BIC|Log.|RMSE|R2 Adj|R2 Within"
) |> fwrite("executor/outputs/tables/table_baseline.csv")
```

### 4) 图统一规格（必须用 theme_coase + save_fig）

```r
# 学术风 minimal：无次网格 / 黑色边框 / 灰度调色 / 顶部图例
theme_coase <- function(base_size = 11) {
  theme_minimal(base_size = base_size, base_family = "sans") +
    theme(
      panel.grid.minor   = element_blank(),
      panel.grid.major.x = element_blank(),
      panel.grid.major.y = element_line(linewidth = .25, color = "grey85"),
      panel.border       = element_rect(color = "black", fill = NA, linewidth = .5),
      axis.ticks         = element_line(color = "black", linewidth = .35),
      axis.text          = element_text(color = "black"),
      legend.position    = "top",
      legend.title       = element_blank(),
      plot.margin        = margin(8, 12, 8, 8)
    )
}
theme_set(theme_coase())

# 调色板：≤4 类用 grayscale；>4 类用 viridis（scale_*_viridis_d(option = "D")）
pal_gray <- c("#000000", "#7F7F7F", "#BFBFBF", "#404040")

# 双格式落盘（PNG 300 DPI + PDF 矢量；含中文必须 cairo_pdf）
save_fig <- function(p, name, w = 7, h = 5) {
  ggsave(sprintf("executor/outputs/figures/%s.png", name),
         p, dpi = 300, width = w, height = h)
  ggsave(sprintf("executor/outputs/figures/%s.pdf", name),
         p, device = cairo_pdf, width = w, height = h)
}
```

### 5) 常用图模板（直接套）

```r
# (a) 系数图：多模型主回归对比 — modelplot 已自带 ggplot 接口
p <- modelplot(mods, coef_omit = "Intercept|z1|z2") +
  geom_vline(xintercept = 0, linetype = "dashed", color = "grey50") +
  scale_color_manual(values = pal_gray) +
  labs(x = NULL, y = NULL)
save_fig(p, "fig_coef_baseline")

# (b) Event Study：DID 平行趋势 + 动态效应
es <- feols(y ~ i(rel_year, treated, ref = -1) | firm + year,
            data = dt, cluster = ~firm)
p <- ggiplot(es, ref.line = 0,
             xlab = "Years relative to event",
             ylab = "Coefficient") + theme_coase()
save_fig(p, "fig_event_study")

# (c) 散点 + 拟合线：双变量描述性
p <- ggplot(dt, aes(x = x, y = y)) +
  geom_point(alpha = .25, size = .8, color = pal_gray[2]) +
  geom_smooth(method = "lm", color = pal_gray[1], se = TRUE, linewidth = .5) +
  scale_x_continuous(labels = label_comma()) +
  labs(x = "X label", y = "Y label")
save_fig(p, "fig_scatter_xy")

# (d) 异质性柱状图：子样本系数 + 95% CI
# agg 需先聚合成含 group / subgroup / est / lo / hi 的 data.table
p <- ggplot(agg, aes(x = group, y = est, fill = subgroup)) +
  geom_col(position = position_dodge(.7), width = .65) +
  geom_errorbar(aes(ymin = lo, ymax = hi),
                position = position_dodge(.7), width = .15) +
  scale_fill_manual(values = pal_gray) +
  labs(x = NULL, y = "Estimate")
save_fig(p, "fig_heterog_bar")
```

### 6) 中文出图特别说明

- PDF 含中文**必须** `device = cairo_pdf`，否则中文方框/丢失（`save_fig` 已默认使用）
- 中文字体：Windows 用 `family = "Microsoft YaHei"`，Mac 用 `family = "PingFang SC"`；在 ggplot 顶层 `theme(text = element_text(family = "..."))` 覆盖
- 不要混用中英标签——一张图要么全中文要么全英文，按 `research_purpose` 上下文决定

---

### Phase 1: 环境与数据准备 + 数据质量闸口 + 回归前诊断

**目标**：准备执行分析所需的数据环境，完成数据质量闸口检查，并在进入 baseline 回归前做好诊断。本 Phase 是实证项目最容易踩坑的环节，必须完整执行下列三块。

#### 1.A 基本数据准备

- 读取基准设计文件（planner/stage_7_baseline_design.md），理解所需变量和回归规格
- 创建 `01_data_preparation.R`：加载必要包（data.table, haven, fixest 等）、读取原始数据、数据清洗、变量构造、保存清洗后的分析数据集
- 执行脚本
- 检查输出文件是否生成，确认关键变量存在且类型正确

##### 1.A.1 大数据规模适配（读原始数据前先看规模，避免 R 内存炸掉）

以 Phase 1 `stage_1_alignment.md` 里记录的样本量为准，按规模选择工具：

| 行数 | 读取方式 | 清洗后存储 |
|------|---------|---------|
| < 100K | `data.table::fread()` 全量读入 | csv / RData 皆可 |
| 100K – 1M | `fread(select = c(...))` 只读需要的列 | **转存 parquet**（`arrow::write_parquet`）或 fst，禁止反复用 csv 中转 |
| 1M – 10M | 用 `duckdb::dbGetQuery(con, "SELECT ... FROM read_csv_auto('...')")` 直接在 SQL 里过滤/聚合，再落入 R | parquet + DuckDB 常驻 |
| > 10M | **不得一次性 read 进 R**；用 DuckDB / Arrow 做切片查询，或按时间/行业分区分批处理 | parquet 分区 |

**强制规则**：
- 多表 merge 前先 `nrow()` 每一张表，估算笛卡尔积上限；若匹配后预期 > 100M 行必须报告并与 baseline 设计者核对
- 主回归 N > 1M 时**必须用 `fixest::feols`**，不得用 `lm()` / `plm()` 强撑
- 相关系数矩阵、VIF 面对 > 100 个变量时按主题分组计算，不得一次性打印 > 100 × 100 的矩阵到 stage_1
- 描述性统计表超过 50 行变量时拆成多张表落盘，stage_1 里只引用路径

#### 1.B 数据质量闸口（6 条强制检查，必须写入 stage_1）

1. **主键一致性**：报告单表主键唯一性 + 跨年份主键稳定性。**常见坑**：公司名变更 / 公司代码重编 / 调查数据主键年度漂移。有重复或漂移时必须先清理再 merge。
2. **多源 merge 质量**：涉及多表合并时，必须报告**匹配率** + **未匹配样本结构性差异**（是随机缺失还是某类系统性排除）。匹配率异常低时不得沉默推进。
3. **删样本日志**：每删除一批样本都在 stage_1 里记录"删除理由 + 删除前 N + 删除后 N"。**删除顺序会影响结果**，必须明确。
4. **加工变量核验**：CSMAR / Wind / 其他二手数据平台提供的**加工指标**（如已算好的 TFP、投资效率、公司治理指数等）必须核验一次计算方法；**可行时优先用原始变量自己算**，不要过度相信平台加工的数据质量。
5. **研究范围外样本处理**：ST / *ST / 金融行业（银行保险证券） / 子公司 / 数据严重缺失样本是否排除，必须在 stage_1 中**显式声明**剔除规则。
6. **缺失值策略**：对每个关键变量，在"线性插值 / 均值填充 / 删除 / Heckman 两阶段"中选一种并说明理由。**重要变量缺失过多时必须考虑样本选择偏差**（参考 executor_system.md Rule 8 / Planner Rule 7 的 Selection 项）。

#### 1.C 回归前诊断（Pre-regression Diagnostics，6 条）

1. **描述性统计**：N / mean / SD / min / p25 / p50 / p75 / max，加上**相关系数矩阵**（`cor()` 或 `modelsummary::datasummary_correlation`）。描述性统计表落盘到 `executor/outputs/tables/desc_stats.*`。
2. **异常值处理**：winsorize 1%/99%（`DescTools::Winsorize`）或直接 drop，必须说明选择理由——数据质量差倾向 winsorize，明显录入错误倾向 drop，**不要沉默处理**。
3. **分布与对数变换**：偏态严重的连续变量考虑取对数；⚠️ **DV 含过多 0 时不要随便用 `log(1+x)`**（经济学五大刊已批评过 log(1+x) 滥用），替代方案是 IHS 变换（`asinh`）或直接改用 Poisson / NB 回归。
4. **变量单位与数量级**：确保核心变量在相近数量级（如金额用亿元而非元），避免系数过大或过小难以解读。
5. **VIF 多重共线性检验**：`car::vif()` 或 `performance::check_collinearity()`。**VIF < 10 过线，> 5 需要解释**。**检验 VIF 时可不放 FE 变量**——部分 FE 会人为拉高 VIF 但不影响估计结果。VIF 严重超标时必须剔除或合并变量。
6. **数据类型判断**：
   - **截面数据**：普通 OLS / Logit / Probit 等
   - **短面板（大 n 小 T，最常见）**：一般认为平稳，**不做单位根检验**，直接上 Panel FE
   - **长面板（小 n 大 T，较少）**：需要单位根检验；不平稳时考虑面板协整、误差修正模型
   判定后在 stage_1 里明确写出数据类型，**这会决定 Phase 2 baseline 的模型选择**。

**输出**：数据准备脚本（保存在 executor/scripts/）、清洗后的分析数据集描述、样本量记录、数据质量闸口结果、回归前诊断结果

**落盘（必须）**：记录：
- 1.A 数据准备过程 + 最终样本量 + 关键变量类型与缺失率 + 清洗数据集路径
- 1.B 数据质量闸口 6 条检查结果（每条一段）
- 1.C 回归前诊断 6 条结果（含 VIF 值、异常值处理方式、数据类型判定结论、描述性统计表路径）

---

### Phase 2: Run Baseline

**目标**：执行主回归，产出可信赖的基准结果。

推荐方法：
- 重新阅读基准设计（planner/stage_7_baseline_design.md），严格按设计执行
- 创建 `02_baseline_regression.R`，生成清晰、可运行、注释简洁的 R 代码
- 执行；如失败，优先做最小修改修复技术错误，不得随意改变研究设计
- 输出主回归表，用简洁语言解释系数方向、显著性、经济意义

若主结果不稳或不显著，允许对控制变量、样本定义或变量处理做有限的替代设定（最多2次），须标注 changed what。

**输出格式**：
1. 主回归结果 table
2. 系数方向、统计显著性、量级的汇报
3. 2-4句解读
4. 边界：可以支持什么，不能支持什么
5. Specification Log → 追加写入 `executor/specification_log.md`

**落盘（必须）**：
- 写入 1-4 项（自然语言总结 + 表格路径引用）
- 追加第 5 项（追加时先读现有内容再拼接，不要覆盖）

---

### Phase 3: Explanation Check & Robustness

**目标**：基于 baseline 结果，选择最有必要的扩展分析。不是尽可能多跑，而是有针对性地选择。

推荐方法：
**Step 1: 明确需要检验什么**
- 识别主结果最需要补充解释的地方（Mechanism-supporting evidence needed）
- 识别主结果最可能被质疑的地方（Robustness concerns）
- 识别结果边界（Heterogeneity worth checking）

**Step 2: 选择有针对性的检验**
- Mechanism-Supporting Evidence：仅在数据有相关变量、时序关系合理时考虑（最多2-3个）
- Heterogeneity：仅在理论明确预期条件差异时考虑（最多2-3个）
- Robustness Checks：仅选最能回应 baseline concern 的（最多3-5个）
- 若某检验不适合当前数据，输出 "not feasible"

**Step 3: 执行并记录**
- 对每个选中的检验：说明为什么选它、它对应哪个问题
- 执行
- 失败时做最小技术修复，不得改变检验逻辑

**输出格式**：Priority Check Map、Mechanism-Supporting Evidence（最多3个）、Heterogeneity（最多3个）、Robustness Checks（最多5个）、Overall Assessment

**落盘（必须）**：
- 写入全部 5 个部分
- 追加到 `executor/specification_log.md`（同 Phase 2，读后拼接再写）

---

### Phase 4: Table & Figure Output

**目标**：将已完成的分析结果转化为出版质量的输出材料。

推荐方法：
**Step 1: Final Output Selection**
- 从已完成结果中识别主结果、最关键的扩展结果、最值得展示的稳健性结果
- 决定哪些进正文，哪些进附录

**Step 2: Table Package**
- 使用工具生成表格
- Main Results Table（只保留最重要列，标注 baseline specification）
- Explanation/Mechanism Table（若机制证据较弱，改为正文描述或附录表）
- Robustness Table（只展示最关键检验）
- 表格保存到 `executor/outputs/tables/`，**agent 只写 `.csv`（唯一真源）**：
  - R 里用 `modelsummary(..., output="data.frame")` + `fwrite`，或直接 `write.csv(df, "table_xxx.csv")`
  - 数值精度在 CSV 里一次决定（系数/SE 4 位小数，p 值 4 位，N 整数），后处理不改数值
  - **同名 `.md`（GFM pipe 表格）由 orchestrator 自动派生**，agent 无需手写；手写 `.md`/`.tex`/`.xlsx` 都会被下一次 sync 覆盖或与唯一真源冲突
  - **命名规范**：统一 `table_{role}.csv`，`role ∈ {baseline, mechanism, robust, heterog, desc_stats, corr_matrix}`；迭代时**覆盖写同名文件**，禁止加 `_v2` / `_new` / `_final` / `_vN` 等版本后缀（迭代轨迹写入 `specification_log.md`，不要用文件名记版本）
- 每张表最终落盘两个文件：`.csv`（agent 写）+ 同名 `.md`（程序自动派生）

**Step 3: Figure Package**
- 判断是否需要图形；不需要则明确说明原因
- 最多推荐3-7张正文图，其他归附录
- 使用 `analyze_image` 验证图表质量
- 保存到 `executor/outputs/figures/`，**统一调用「统一 R 命令模板」第 4 节的 `save_fig(p, name)`**——它已自动处理 PNG 300 DPI + PDF 矢量 + cairo_pdf 中文支持
- ggplot 对象先 `+ theme_coase()`（或 `theme_set` 已设全局），再 `save_fig`；不要绕开 helper 自己调 `ggsave`

**输出格式**：Final Output Recommendation、Table Package、Figure Package

**落盘（必须）**：文件内需列出：
- 所有 `executor/outputs/tables/` 下的表格四件套（`.tex` / `.csv` / `.md` / `.xlsx`）路径及一句话说明
- 所有 `executor/outputs/figures/` 下的图表两件套（`.png` / `.pdf`）路径及一句话说明
- 哪些进正文、哪些进附录

---

### Phase 5: Output Assessment

**目标**：评估产出完整性，给出下一步建议。

推荐方法：
- 列出建议放附录的内容
- 判断当前实证部分还缺什么（关键 robustness、变量定义说明、样本筛选说明等）
- 给出简洁的下一步建议

**输出格式**：Appendix & Next-Step Suggestions（建议附录内容、仍缺少什么、推荐下一步）

**落盘（必须）**。

---

## 最终自检（所有 Phase 结束后执行）

在给出最终总结**之前**，核对以下文件：

- [ ] `executor/stage_1_data_preparation.md`
- [ ] `executor/stage_2_run_baseline.md` ← Reviewer Mode B 必读
- [ ] `executor/stage_3_explanation_robustness.md` ← Reviewer Mode B 必读
- [ ] `executor/stage_4_table_figure_output.md`
- [ ] `executor/stage_5_assessment.md`
- [ ] `executor/specification_log.md` ← Reviewer Mode B 必读
- [ ] 至少一个 `executor/outputs/tables/table_{role}.csv`（主回归表，唯一真源）
- [ ] 对应的 `executor/outputs/tables/table_{role}.md`（由 orchestrator 自动派生，agent 不要手写；若缺失说明 sync 未触发，可通过任意后续 tool_use 再推一次）
- [ ] `tables/` 下不得出现 `.tex` / `.xlsx` 文件，也不得出现 `_v2` / `_final` 等版本后缀的冗余 csv
- [ ] 若产出图：每张图必须同时有 `.png`（300 DPI）和 `.pdf`（矢量，含中文用 `cairo_pdf`）

缺失任何一个 → 立刻补写再给最终总结。

**研究目的一致性核查（最终摘要前必做）**：

1. 读取 `planner/stage_7_baseline_design.md` 首部的 `Research purpose` 字段，记作 `P`
2. 全文扫描 `stage_2_run_baseline.md` / `stage_3_explanation_robustness.md` / `stage_5_assessment.md` 以及即将输出给用户的最终摘要：
   - `P = causal` → 禁止出现 "关联性研究"、"非因果识别"、"仅为相关关系"、"本研究不支持因果解读" 等降级措辞
   - `P = associative` → 最终摘要必须有 "本研究为关联性研究，结果不支持因果解读" 的明确声明，且禁止出现 "因果效应"、"X 导致 Y"、"X 使得 Y 上升" 等因果措辞
3. 发现任一处与 `P` 冲突的措辞 → **先改 stage_\*.md，再重写摘要**，不得带着不一致的结论输出给用户
4. 若 causal 策略真的失效、确需建议降级，走"禁止私自降级"条款：在 specification_log + stage_5 中标注并建议用户回到 Planner，而不是在摘要里直接改口径

完成核对后，提供 Executor 阶段的完整总结（不超过5000字），涵盖：基准回归结果、关键发现、稳健性检验结论、生成的表格和图表清单、Specification Log 摘要、对 Writer 的建议。摘要开头必须有一行 **"研究类型：{P}"**，与 Planner 完全一致。

