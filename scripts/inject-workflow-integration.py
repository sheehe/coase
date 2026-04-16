#!/usr/bin/env python3
"""Prepend Workflow Integration section after frontmatter for each method skill."""
import os
import sys
from pathlib import Path

SKILLS_ROOT = Path(r"C:\Projects\Coase\resources\plugins\coase-builtin\skills")

# 8 个涉及识别策略的方法 skill —— 三工作流都会经手
METHOD_ROUTING = """- **/idea-discovery Phase 2 Step 3 (Baseline Design Lock)**: 返回"模型设定 + 识别假设 + 主要识别风险"三段，由 planner 填入 `planner/stage_7_baseline_design.md`。**此阶段不执行代码**。
- **/experiment-bridge Phase 4 (Run Baseline)**: 生成并执行主回归代码，主回归表走 `table` skill 规范化，结果写入 `executor/stage_1_run_baseline.md`。
- **/experiment-bridge Phase 5 (Robustness)**: 提供本方法特有的替代估计量、识别诊断或敏感性检验，写入 `executor/stage_2_explanation_robustness.md` 对应条目。
- **/paper-writing Phase 6**: 不直接参与。writer 从 `executor/` 目录摘录方法描述，**不得补跑回归**。"""

ROUTINGS = {
    "ols-regression": METHOD_ROUTING,
    "did-analysis": METHOD_ROUTING,
    "iv-estimation": METHOD_ROUTING,
    "rdd-analysis": METHOD_ROUTING,
    "panel-data": METHOD_ROUTING,
    "synthetic-control": METHOD_ROUTING,
    "time-series": METHOD_ROUTING,
    "ml-causal": METHOD_ROUTING,

    "data-cleaning": """- **/idea-discovery Phase 2 Step 1 (Variable Mapping)**: 诊断变量构造需求、缺失值与异常值，输出"变量清洗计划"填入 `planner/stage_5_variable_mapping.md`。**此阶段不执行代码**。
- **/experiment-bridge Phase 4 执行前**: 按 planner 确认的清洗计划实际执行（构造处理组、生成 log/滞后项、winsorize、样本筛选），清洗后的数据与日志记入 `executor/stage_1_run_baseline.md` 的"数据准备"小节。
- **/experiment-bridge Phase 5 Robustness**: 提供替代变量定义、替代样本、winsorize 临界值对比，结果写入 `executor/stage_2_explanation_robustness.md`。
- **/paper-writing Phase 6**: 不直接参与。writer 从 executor/ 摘录样本筛选与变量定义说明。""",

    "data-fetcher": """- **/idea-discovery Phase 1 (Idea–Data Alignment)**: 评估数据可行性，列出取数方案、API/数据源、预期样本范围、时间覆盖，填入 `planner/stage_1_alignment.md`。若用户未提供数据，给出最小可行取数方案。
- **/experiment-bridge Phase 4 执行前**: 按 planner 确认的取数方案实际抓取数据，抓取脚本与日志写入 `executor/stage_1_run_baseline.md` 的"数据来源"小节。
- **/paper-writing Phase 6**: 不直接参与。writer 从 executor/ 摘录数据来源说明用于 Data 章节。""",

    "stats": """- **/idea-discovery Phase 2 Step 4 (Descriptive Snapshot)**: 生成关键变量的描述性统计表与必要分组对比，填入 `planner/stage_8_descriptive_snapshot.md`。只保留与 baseline 决策直接相关的 descriptives。
- **/experiment-bridge Phase 4 辅助**: 主回归前的样本健康检查（样本量、缺失率、关键变量变异），简要纳入 `executor/stage_1_run_baseline.md`。
- **/experiment-bridge Phase 5 Robustness**: 分组一致性 / 子样本描述性对比，写入 `executor/stage_2_explanation_robustness.md`。
- **/paper-writing Phase 6**: 配合 `table` skill 生成 Summary Statistics Table（通常放正文或附录）。""",

    "figure": """- **/idea-discovery Phase 2 Step 4 (Descriptive Snapshot)**: 生成 1-2 张最有帮助的描述性图形（因变量分布 / 处理组对照组比较 / 样本年份覆盖），路径记入 `planner/stage_8_descriptive_snapshot.md`。
- **/experiment-bridge Phase 5 Robustness**: 事件研究图 / 平行趋势图 / coefficient plot 等识别支持性图形，文件路径记入 `executor/stage_2_explanation_robustness.md`。
- **/paper-writing Phase 6 Figure Package**: **主要落脚点**。生成正文图形（1-2 张）和附录图形，每张图提供"目的 / 展示内容 / 帮助解释什么 / 不能证明什么"四段说明，输出汇总到 `writer/stage_3_figure_package.md`。""",

    "table": """- **/experiment-bridge Phase 4 (Run Baseline)**: 生成主回归 Main Results Table，LaTeX booktabs 或 Markdown 格式，填入 `executor/stage_1_run_baseline.md`。
- **/experiment-bridge Phase 5 (Robustness)**: 生成 Robustness Table 与 Mechanism-Supporting Table（若适用），填入 `executor/stage_2_explanation_robustness.md`。
- **/paper-writing Phase 6 Table Package**: **主要落脚点**。按正文/附录分级生成完整表格包（Main / Mechanism / Robustness / Appendix A1 A2 ...），统一风格，输出到 `writer/stage_2_table_package.md`。所有表必须与 Writing Blocks 段落结论严格一致。""",

    "paper-writing": """- **/idea-discovery**: 不直接参与（planner 不写正文）。
- **/experiment-bridge**: 不直接参与（executor 不写正文）。
- **/paper-writing Phase 6 Writing Blocks**: **主要落脚点**。基于 `executor/` 目录下已有主回归和稳健性结果，生成 Main Results Paragraph / Explanation Paragraph / Robustness Paragraph / Limitation Paragraph / Presentation Summary，输出到 `writer/stage_4_writing_blocks.md`。**不得夸大结论、不得补跑回归**。文字必须与 Table Package 表格结论完全一致。""",

    "literature-review": """- **/idea-discovery Phase 1 辅助 / Phase 2 文献部分**: 生成文献综述（相关文献梳理、研究空白、本研究贡献），写入 `planner/stage_2_literature.md`。
- **/experiment-bridge**: 不直接参与。
- **/paper-writing Phase 6 辅助**: 若用户要求完整 Literature Review 章节，基于 planner/stage_2_literature.md 扩写到论文级长度，并整理参考文献 BibTeX。""",

    "beamer-ppt": """- **/idea-discovery / /experiment-bridge**: 不直接参与。
- **/paper-writing Phase 6 Presentation Summary（可选）**: 当用户明确要求答辩 / 组会 / 汇报材料时调用。基于 `writer/stage_4_writing_blocks.md` 的 Writing Blocks 和 `writer/stage_2_table_package.md` 的主表，生成 Beamer 幻灯片大纲与关键 slide 内容，输出到 `writer/stage_5_appendix_next_steps.md` 的 presentation 附录。""",
}

TEMPLATE = """
## Workflow Integration

若当前会话由 Coase 研究工作流触发（`/idea-discovery` / `/experiment-bridge` / `/paper-writing`），本 skill 的输出必须按以下规则落入阶段文件，**不得自行新建目录或脱离工作流上下文**：

{routing}

若用户未指定工作流（直接提问使用本方法），忽略本节，按下方正文自由执行。

---
"""

def inject(skill_dir: Path, routing: str) -> bool:
    skill_file = skill_dir / "SKILL.md"
    if not skill_file.exists():
        print(f"MISSING {skill_dir.name}/SKILL.md")
        return False

    content = skill_file.read_text(encoding="utf-8")

    if "## Workflow Integration" in content:
        print(f"SKIP {skill_dir.name} (already integrated)")
        return False

    # Find end of YAML frontmatter (second `---` line)
    lines = content.split("\n")
    dashes = [i for i, ln in enumerate(lines) if ln.strip() == "---"]
    if len(dashes) < 2:
        print(f"WARN {skill_dir.name} no frontmatter, prepending at top")
        injected = TEMPLATE.format(routing=routing).strip() + "\n\n" + content
    else:
        end_idx = dashes[1]
        injection = TEMPLATE.format(routing=routing)
        injected = "\n".join(lines[: end_idx + 1]) + injection + "\n".join(lines[end_idx + 1 :])

    skill_file.write_text(injected, encoding="utf-8")
    print(f"OK   {skill_dir.name}")
    return True


def main():
    injected_count = 0
    for skill_name, routing in ROUTINGS.items():
        skill_dir = SKILLS_ROOT / skill_name
        if inject(skill_dir, routing):
            injected_count += 1
    print(f"\n{injected_count}/{len(ROUTINGS)} skills integrated.")


if __name__ == "__main__":
    main()
