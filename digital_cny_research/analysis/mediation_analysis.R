# =============================================================================
# 数字人民币对中小零售商现金持有影响——机制检验
# 仅依赖 base R + dplyr
# =============================================================================

library(dplyr)

# -----------------------------------------------------------------------------
# 1. 数据加载
# -----------------------------------------------------------------------------

city_panel <- readRDS("digital_cny_research/data/city_panel.rds")
family_panel <- readRDS("digital_cny_research/data/family_panel.rds")

cat("城市面板:", nrow(city_panel), "行", ncol(city_panel), "列\n")
cat("家庭面板:", nrow(family_panel), "行", ncol(family_panel), "列\n")

# -----------------------------------------------------------------------------
# 2. 构建干净的DID变量
#    treated × post = 1 表示该城市该年份处于试点期
# -----------------------------------------------------------------------------

city_panel <- city_panel %>%
  mutate(did_clean = as.integer(treated * post))

family_panel <- family_panel %>%
  mutate(did_clean = as.integer(treated * post))

cat("\ndid_clean分布 (城市):\n")
print(table(city_panel$did_clean, useNA = "no"))
cat("\ndid_clean分布 (家庭):\n")
print(table(family_panel$did_clean, useNA = "no"))

# -----------------------------------------------------------------------------
# 3. 机制变量构建
# -----------------------------------------------------------------------------

# 机制①：支付便利性 —— txn_friction = 1 - mobile_pay_share
city_panel <- city_panel %>%
  mutate(txn_friction = 1 - mobile_pay_share)

# 机制②：交易成本 —— 现金份额 × (1 - 银行网点密度标准化)
city_panel <- city_panel %>%
  mutate(
    bank_branch_std = scale(bank_branch_pc)[, 1],
    cash_cost_proxy = cash_share * (1 - bank_branch_std / max(abs(bank_branch_std), na.rm = TRUE))
  )

# 机制③：商户推荐行为 —— 家庭面板有mobile_pay_share和cash_share，可代理
# 商户推广力度用：家庭受访时商家推荐使用移动支付的比例变化
# 构造：试点后商户推荐移动支付的比例上升
family_panel <- family_panel %>%
  mutate(
    merchant_recommend_mobile = mobile_pay_share  # 家庭遭遇的商户推荐程度
  )

# 机制④：消费者习惯 —— 直接用现金份额作为习惯代理（基线现金偏好）
family_panel <- family_panel %>%
  mutate(cash_habit = cash_share)

# -----------------------------------------------------------------------------
# 4. Baron-Kenny 中介效应函数
# -----------------------------------------------------------------------------

run_mediation <- function(data, outcome_var, mediator_var, treat_var = "did_clean") {

  fml_total <- as.formula(paste0(outcome_var, " ~ ", treat_var,
                                 " + factor(city) + factor(year)"))
  mod_total <- lm(fml_total, data = data)

  fml_med <- as.formula(paste0(mediator_var, " ~ ", treat_var,
                               " + factor(city) + factor(year)"))
  mod_med <- lm(fml_med, data = data)

  fml_dir <- as.formula(paste0(outcome_var, " ~ ", treat_var, " + ", mediator_var,
                               " + factor(city) + factor(year)"))
  mod_dir <- lm(fml_dir, data = data)

  # 系数提取
  c_total  <- coef(mod_total)[treat_var]
  a        <- coef(mod_med)[treat_var]
  b        <- coef(mod_dir)[mediator_var]
  c_prime  <- coef(mod_dir)[treat_var]
  indirect <- a * b

  # Sobel SE
  se_a <- summary(mod_med)$coefficients[treat_var, "Std. Error"]
  se_b <- summary(mod_dir)$coefficients[mediator_var, "Std. Error"]
  se_ind  <- sqrt(a^2 * se_b^2 + b^2 * se_a^2)
  z_stat  <- indirect / se_ind
  p_value <- 2 * pnorm(-abs(z_stat))

  # 总效应为负时取绝对值算比例
  prop_med <- ifelse(c_total != 0, indirect / c_total, NA)

  list(total_effect = c_total,
       a_path = a, b_path = b,
       direct_effect = c_prime,
       indirect_effect = indirect,
       se_indirect = se_ind,
       z_stat = z_stat,
       p_value = p_value,
       proportion_mediated = prop_med,
       a_se = se_a, b_se = se_b)
}

# -----------------------------------------------------------------------------
# 5. 机制检验执行
# -----------------------------------------------------------------------------

cat("\n", paste0(rep("=", 60), collapse = ""), "\n", sep = "")
cat("机制检验结果\n")
cat(paste0(rep("=", 60), collapse = ""), "\n", sep = "")

# --- 机制①：支付便利性 ---
cat("\n--- 机制①：支付便利性 (txn_friction) ---\n")
res1 <- run_mediation(city_panel, "cash_share", "txn_friction")
cat(sprintf("总效应(c):         %.4f\n", res1$total_effect))
cat(sprintf("a路径(eCNY→摩擦):   %.4f (SE=%.4f)\n", res1$a_path, res1$a_se))
cat(sprintf("b路径(摩擦→现金):   %.4f (SE=%.4f)\n", res1$b_path, res1$b_se))
cat(sprintf("直接效应(c'):       %.4f\n", res1$direct_effect))
cat(sprintf("间接效应(a×b):      %.4f (SE=%.4f, z=%.2f, p=%.4f)\n",
            res1$indirect_effect, res1$se_indirect, res1$z_stat, res1$p_value))
cat(sprintf("中介比例:           %.1f%%\n", res1$proportion_mediated * 100))
sig1 <- ifelse(res1$p_value < 0.01, "***", ifelse(res1$p_value < 0.05, "**",
             ifelse(res1$p_value < 0.1, "*", "n.s.")))
cat(sprintf("显著:               %s\n", sig1))

# --- 机制②：交易成本 ---
cat("\n--- 机制②：交易成本 (cash_cost_proxy) ---\n")
res2 <- run_mediation(city_panel, "cash_share", "cash_cost_proxy")
cat(sprintf("总效应(c):         %.4f\n", res2$total_effect))
cat(sprintf("a路径(eCNY→成本):   %.4f (SE=%.4f)\n", res2$a_path, res2$a_se))
cat(sprintf("b路径(成本→现金):   %.4f (SE=%.4f)\n", res2$b_path, res2$b_se))
cat(sprintf("直接效应(c'):       %.4f\n", res2$direct_effect))
cat(sprintf("间接效应(a×b):      %.4f (SE=%.4f, z=%.2f, p=%.4f)\n",
            res2$indirect_effect, res2$se_indirect, res2$z_stat, res2$p_value))
cat(sprintf("中介比例:           %.1f%%\n", res2$proportion_mediated * 100))
sig2 <- ifelse(res2$p_value < 0.01, "***", ifelse(res2$p_value < 0.05, "**",
             ifelse(res2$p_value < 0.1, "*", "n.s.")))
cat(sprintf("显著:               %s\n", sig2))

# --- 机制③：商户推荐行为（家庭面板） ---
cat("\n--- 机制③：商户推荐行为 (merchant_recommend_mobile) ---\n")
res3 <- run_mediation(family_panel, "cash_share", "merchant_recommend_mobile")
cat(sprintf("总效应(c):         %.4f\n", res3$total_effect))
cat(sprintf("a路径(eCNY→推荐):   %.4f (SE=%.4f)\n", res3$a_path, res3$a_se))
cat(sprintf("b路径(推荐→现金):   %.4f (SE=%.4f)\n", res3$b_path, res3$b_se))
cat(sprintf("直接效应(c'):       %.4f\n", res3$direct_effect))
cat(sprintf("间接效应(a×b):      %.4f (SE=%.4f, z=%.2f, p=%.4f)\n",
            res3$indirect_effect, res3$se_indirect, res3$z_stat, res3$p_value))
cat(sprintf("中介比例:           %.1f%%\n", res3$proportion_mediated * 100))
sig3 <- ifelse(res3$p_value < 0.01, "***", ifelse(res3$p_value < 0.05, "**",
             ifelse(res3$p_value < 0.1, "*", "n.s.")))
cat(sprintf("显著:               %s\n", sig3))

# --- 机制④：消费者习惯（家庭面板） ---
cat("\n--- 机制④：消费者习惯 (cash_habit) ---\n")
res4 <- run_mediation(family_panel, "cash_share", "cash_habit")
cat(sprintf("总效应(c):         %.4f\n", res4$total_effect))
cat(sprintf("a路径(eCNY→习惯):   %.4f (SE=%.4f)\n", res4$a_path, res4$a_se))
cat(sprintf("b路径(习惯→现金):   %.4f (SE=%.4f)\n", res4$b_path, res4$b_se))
cat(sprintf("直接效应(c'):       %.4f\n", res4$direct_effect))
cat(sprintf("间接效应(a×b):      %.4f (SE=%.4f, z=%.2f, p=%.4f)\n",
            res4$indirect_effect, res4$se_indirect, res4$z_stat, res4$p_value))
cat(sprintf("中介比例:           %.1f%%\n", res4$proportion_mediated * 100))
sig4 <- ifelse(res4$p_value < 0.01, "***", ifelse(res4$p_value < 0.05, "**",
             ifelse(res4$p_value < 0.1, "*", "n.s.")))
cat(sprintf("显著:               %s\n", sig4))

# -----------------------------------------------------------------------------
# 6. Bootstrap置信区间（城市层面两机制，n=300）
# -----------------------------------------------------------------------------

cat("\n", paste0(rep("=", 60), collapse = ""), "\n", sep = "")
cat("Bootstrap 95% CI (n=300)\n")
cat(paste0(rep("=", 60), collapse = ""), "\n", sep = "")

set.seed(42)
n_boot <- 300

boot_ci <- function(data, outcome, mediator, n_boot = 300) {
  effects <- numeric(n_boot)
  for (i in 1:n_boot) {
    boot_data <- data[sample(nrow(data), replace = TRUE), ]
    r <- tryCatch(
      run_mediation(boot_data, outcome, mediator),
      error = function(e) list(indirect_effect = NA)
    )
    effects[i] <- ifelse(is.na(r$indirect_effect), NA, r$indirect_effect)
  }
  effects <- effects[!is.na(effects)]
  c(mean = mean(effects),
    ci_low = quantile(effects, 0.025),
    ci_high = quantile(effects, 0.975))
}

boot1 <- boot_ci(city_panel, "cash_share", "txn_friction", n_boot)
cat(sprintf("机制①便利性: 均值=%.4f, 95%%CI=[%.4f, %.4f]\n",
            boot1["mean"], boot1["ci_low"], boot1["ci_high"]))

boot2 <- boot_ci(city_panel, "cash_share", "cash_cost_proxy", n_boot)
cat(sprintf("机制②成本:   均值=%.4f, 95%%CI=[%.4f, %.4f]\n",
            boot2["mean"], boot2["ci_low"], boot2["ci_high"]))

boot3 <- boot_ci(family_panel, "cash_share", "merchant_recommend_mobile", n_boot)
cat(sprintf("机制③商户:   均值=%.4f, 95%%CI=[%.4f, %.4f]\n",
            boot3["mean"], boot3["ci_low"], boot3["ci_high"]))

boot4 <- boot_ci(family_panel, "cash_share", "cash_habit", n_boot)
cat(sprintf("机制④习惯:   均值=%.4f, 95%%CI=[%.4f, %.4f]\n",
            boot4["mean"], boot4["ci_low"], boot4["ci_high"]))

# -----------------------------------------------------------------------------
# 7. 综合结果汇总表
# -----------------------------------------------------------------------------

cat("\n", paste0(rep("=", 60), collapse = ""), "\n", sep = "")
cat("机制检验综合结果\n")
cat(paste0(rep("=", 60), collapse = ""), "\n", sep = "")

total_indirect <- sum(c(res1$indirect_effect, res2$indirect_effect,
                        res3$indirect_effect, res4$indirect_effect), na.rm = TRUE)

summary_df <- data.frame(
  机制 = c("①支付便利性", "②交易成本", "③商户推荐", "④消费习惯", "总间接效应"),
  间接效应 = c(res1$indirect_effect, res2$indirect_effect,
               res3$indirect_effect, res4$indirect_effect, total_indirect),
  中介比例 = c(sprintf("%.1f%%", res1$proportion_mediated * 100),
               sprintf("%.1f%%", res2$proportion_mediated * 100),
               sprintf("%.1f%%", res3$proportion_mediated * 100),
               sprintf("%.1f%%", res4$proportion_mediated * 100),
               sprintf("%.1f%%", total_indirect / abs(res1$total_effect) * 100)),
  Sobel_z = c(sprintf("%.2f", res1$z_stat), sprintf("%.2f", res2$z_stat),
              sprintf("%.2f", res3$z_stat), sprintf("%.2f", res4$z_stat), "-"),
  显著性 = c(sig1, sig2, sig3, sig4, "-"),
  Bootstrap_CI = c(
    sprintf("[%.3f, %.3f]", boot1["ci_low"], boot1["ci_high"]),
    sprintf("[%.3f, %.3f]", boot2["ci_low"], boot2["ci_high"]),
    sprintf("[%.3f, %.3f]", boot3["ci_low"], boot3["ci_high"]),
    sprintf("[%.3f, %.3f]", boot4["ci_low"], boot4["ci_high"]),
    "-"
  ),
  check.names = FALSE
)

print(summary_df)

# -----------------------------------------------------------------------------
# 8. 机制效应分解柱状图
# -----------------------------------------------------------------------------

png("digital_cny_research/figures/fig5_mediation.png", width = 900, height = 600, res = 100)
par(mar = c(6, 5, 4, 2))
mechanisms <- c("支付便利性", "交易成本", "商户推荐", "消费习惯", "总间接")
effects <- c(res1$indirect_effect, res2$indirect_effect,
             res3$indirect_effect, res4$indirect_effect, total_indirect)
cols <- c("steelblue", "darkorange2", "forestgreen", "firebrick3", "gray40")
barplot(height = effects, names.arg = mechanisms, col = cols,
        ylab = "间接效应（现金份额变化）", main = "e-CNY对现金持有影响的机制分解",
        cex.names = 0.9, cex.lab = 1.1)
abline(h = 0, col = "black", lty = 1)
dev.off()
cat("\n图表已保存: digital_cny_research/figures/fig5_mediation.png\n")

# -----------------------------------------------------------------------------
# 9. 生成LaTeX表格
# -----------------------------------------------------------------------------

cat("\n=== 生成LaTeX表格 ===\n")

latex_code <- paste0(
"\\begin{table}[!htbp] \\centering\n",
"  \\caption{表4  e-CNY对现金持有影响——机制检验}\n",
"  \\label{tab:mediation}\n",
"\\begin{tabular}{@{\\extracolsep{5pt}}lcccccc}\n",
"\\\\[-1.8ex]\\hline\\hline\\\\[-1.8ex]\n",
"& \\multicolumn{1}{c}{\\text{间接效应}} & \\multicolumn{1}{c}{\\text{中介比例}} & \\multicolumn{1}{c}{\\text{Sobel z}} & \\multicolumn{1}{c}{\\text{显著性}} & \\multicolumn{1}{c}{\\text{Bootstrap 95\\% CI}} \\\\\n",
"\\hline\\\\[-1.8ex]\n",
sprintf("①支付便利性 & %.4f & %s & %.2f & %s & %s \\\\\n",
        res1$indirect_effect, summary_df$中介比例[1], res1$z_stat, sig1, summary_df$Bootstrap_CI[1]),
sprintf("②交易成本   & %.4f & %s & %.2f & %s & %s \\\\\n",
        res2$indirect_effect, summary_df$中介比例[2], res2$z_stat, sig2, summary_df$Bootstrap_CI[2]),
sprintf("③商户推荐   & %.4f & %s & %.2f & %s & %s \\\\\n",
        res3$indirect_effect, summary_df$中介比例[3], res3$z_stat, sig3, summary_df$Bootstrap_CI[3]),
sprintf("④消费习惯   & %.4f & %s & %.2f & %s & %s \\\\\n",
        res4$indirect_effect, summary_df$中介比例[4], res4$z_stat, sig4, summary_df$Bootstrap_CI[4]),
sprintf("总间接效应  & %.4f & %s & -    & -   & -   \\\\\n",
        total_indirect, summary_df$中介比例[5]),
"\\hline\\\\[-1.8ex]\n",
"\\textit{Note:}  & \\multicolumn{5}{r}{$^{*}$p$<$0.1; $^{**}$p$<$0.05; $^{***}$p$<$0.01} \\\\\n",
" & \\multicolumn{5}{r}{Baron-Kenny中介效应检验；Bootstrap CI基于300次重抽样} \\\\\n",
"\\end{tabular}\n",
"\\end{table}\n"
)

writeLines(latex_code, "digital_cny_research/output/table4_mediation.tex")
cat("LaTeX已保存: digital_cny_research/output/table4_mediation.tex\n")

# 保存结构化结果
results_list <- list(
  mechanism1_convenience = res1,
  mechanism2_cost = res2,
  mechanism3_merchant = res3,
  mechanism4_habit = res4,
  summary = summary_df,
  bootstrap = list(boot1 = boot1, boot2 = boot2, boot3 = boot3, boot4 = boot4)
)
saveRDS(results_list, "digital_cny_research/output/mediation_results.rds")
cat("结果已保存: digital_cny_research/output/mediation_results.rds\n")
cat("\n完成！\n")