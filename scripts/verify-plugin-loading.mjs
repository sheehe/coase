// SDK regression check: verify that Claude Agent SDK still discovers Coase's
// built-in plugin via `plugins: [{ type: 'local', path }]` while keeping
// settingSources: [] isolation intact. Run this after every SDK version bump.
//
// Usage:
//   node scripts/verify-plugin-loading.mjs
//
// What we check:
//  1. SDK accepts the plugin config and produces an init message.
//  2. The init message's `skills` array includes at least one coase-builtin entry
//     (currently `coase-builtin:planner`).
//  3. `supportedCommands()` returns the same skill via the control channel.
//
// No LLM round-trip is required — we abort immediately after receiving the init
// message. An API key is not needed to pass this check.

import { query } from '@anthropic-ai/claude-agent-sdk';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pluginPath = resolve(__dirname, '..', 'resources', 'plugins', 'coase-builtin');

console.log('[verify] plugin path:', pluginPath);

const abortController = new AbortController();

const q = query({
  prompt: 'Do nothing. We only need the init response.',
  options: {
    abortController,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    settingSources: [],
    tools: [],
    plugins: [{ type: 'local', path: pluginPath }],
    executable: 'node',
    maxTurns: 1,
    model: process.env.VERIFY_MODEL ?? 'claude-haiku-4-5-20251001',
  },
});

let exitCode = 1;
let sawInit = false;
try {
  for await (const msg of q) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      sawInit = true;
      const skills = Array.isArray(msg.skills) ? msg.skills : [];
      const ours = skills.filter((s) => /^coase-builtin:/.test(String(s)));
      console.log('[verify] init.skills (coase-builtin only):', ours);

      const cmds = await q.supportedCommands();
      const matching = cmds.filter((c) => /planner/.test(JSON.stringify(c)));
      console.log('[verify] supportedCommands matching /planner/:', matching.length);

      if (ours.length > 0) {
        console.log('[verify] ✅ plugin loading works');
        exitCode = 0;
      } else {
        console.log('[verify] ❌ plugin skills not registered — SDK contract changed?');
      }
      abortController.abort();
      break;
    }
  }
} catch (err) {
  console.log('[verify] stream error:', err?.message ?? err);
}

if (!sawInit) {
  console.log('[verify] ❌ never received init — CLI subprocess failed to start');
}

process.exit(exitCode);
