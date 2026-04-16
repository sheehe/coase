// 把 critic panel（多 provider 并行调用）包装成 in-process MCP server，
// 通过 Claude Agent SDK 的 `createSdkMcpServer` 暴露给 agent。
//
// 工作流里（idea-critic / paper-reviewer）会在 prompt 中指示 agent 调用
// 这个 tool。SDK 会把 tool 调用从 CLI 子进程 route 回父进程（Electron
// main），本模块在父进程里执行 invokeCriticPanel（裸 Anthropic Messages
// API 并行调用）并把聚合结果返回给 agent。

import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';

import type { CriticPanelEntry } from '../../shared/providers';
import { invokeCriticPanel } from '../providers/invoke';

const INVOKE_TOOL_DESCRIPTION = `
并行调用用户在设置页配置的"评审模型组"（critic panel）所有 provider，
每个模型独立针对同一 prompt 生成回答，返回聚合结果。

用途：idea 对抗评分（discuss / score）、方案批评（design-critique）、
机制稳健性结果批评（result-critique）、论文 referee 评审。

前置：用户必须已经在设置 → 评审模型组里勾选至少 2 个不同 provider，否则
返回 panelSize=0 并给出用户可见提示。

不要用这个 tool 做：
- 普通的单次对话（用 agent 自己的主 provider 就行）
- 需要多轮工具调用 / 代码执行的任务（本 tool 只做一次 prompt→response）

返回格式：一个 JSON，含每个 provider 的独立回答 + 状态 + 耗时。调用方需
自行做聚合（共识 / 分歧分析）。
`.trim();

export function buildCriticPanelMcpServer(): McpSdkServerConfigWithInstance {
  const invokeTool = tool(
    'invoke',
    INVOKE_TOOL_DESCRIPTION,
    {
      user_prompt: z
        .string()
        .min(1)
        .describe('发给每个评审模型的用户消息正文。建议包含明确的评审任务、评分维度、输出格式要求。'),
      system_prompt: z
        .string()
        .optional()
        .describe('可选的 system prompt，用于给评审模型设定角色（如"经管审稿人"）。'),
      max_tokens: z
        .number()
        .int()
        .min(256)
        .max(8192)
        .optional()
        .describe('每个模型单次调用的最大输出 token 数。默认 4096。'),
      timeout_ms: z
        .number()
        .int()
        .min(5000)
        .max(180_000)
        .optional()
        .describe('单次调用超时（毫秒）。默认 60000。'),
    },
    async (args) => {
      const result = await invokeCriticPanel({
        system: args.system_prompt,
        messages: [{ role: 'user', content: args.user_prompt }],
        maxTokens: args.max_tokens,
        timeoutMs: args.timeout_ms,
      });

      if (result.panelSize === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text:
                '评审模型组尚未配置。请提示用户前往 设置 → 评审模型组 勾选至少 2 个不同 provider 后再发起对抗评审。',
            },
          ],
          isError: true,
        };
      }

      const summary = summarizeResult(result.entries, result.totalMs);
      return {
        content: [
          {
            type: 'text' as const,
            text: summary,
          },
        ],
      };
    },
  );

  return createSdkMcpServer({
    name: 'coase-critic-panel',
    version: '0.1.0',
    tools: [invokeTool],
  });
}

function summarizeResult(entries: CriticPanelEntry[], totalMs: number): string {
  const lines: string[] = [];
  lines.push(
    `# Critic Panel Result (${entries.length} models, ${totalMs} ms total)`,
    '',
  );

  const okCount = entries.filter((e) => e.ok).length;
  const failCount = entries.length - okCount;
  lines.push(
    `**Status**: ${okCount} ok / ${failCount} failed`,
    '',
  );

  entries.forEach((entry, idx) => {
    const header = `## Model ${idx + 1}: ${entry.providerLabel} (${entry.model})`;
    lines.push(header);
    lines.push(`- provider_id: ${entry.providerId}`);
    lines.push(`- latency: ${entry.latencyMs} ms`);
    lines.push(`- ok: ${entry.ok}`);
    if (entry.ok && entry.responseText) {
      lines.push('', '### Response', entry.responseText.trim(), '');
    } else {
      lines.push(`- error: ${entry.error ?? 'unknown'}`, '');
    }
  });

  lines.push(
    '---',
    'Next step: 聚合以上独立回答，找出共识项、重大分歧、单一模型独有意见，按 idea-critic / paper-reviewer skill 要求的输出格式整理。',
  );
  return lines.join('\n');
}
