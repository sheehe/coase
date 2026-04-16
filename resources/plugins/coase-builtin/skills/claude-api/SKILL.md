---
name: claude-api
description: Build, debug, and optimize Claude API / Anthropic SDK applications. Covers prompt caching, extended thinking, auto-compaction, tool use, batch processing, and model configuration. Use when working on code that imports @anthropic-ai/sdk or @anthropic-ai/claude-agent-sdk, or when optimizing LLM call patterns.
---

# Claude API & SDK Best Practices

Guide for building and optimizing applications using the Claude API, Anthropic SDK, and Claude Agent SDK. Follow these patterns to maximize performance, minimize cost, and avoid common pitfalls.

## Prompt Caching

Prompt caching reduces costs by up to 90% and latency by up to 85% for repeated prefixes. **Always enable caching for system prompts, tool definitions, and large context blocks.**

### How It Works

- Cache is keyed on the exact prefix of the prompt (system + messages up to a cache breakpoint)
- Minimum cacheable length: 1,024 tokens (Haiku), 2,048 tokens (Sonnet/Opus)
- TTL: 5 minutes from last use (refreshed on each cache hit)
- Max 4 cache breakpoints per request

### Implementation (Anthropic SDK)

```typescript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();

const response = await client.messages.create({
  model: 'claude-sonnet-4-6-20250415',
  max_tokens: 1024,
  system: [
    {
      type: 'text',
      text: LARGE_SYSTEM_PROMPT,       // put static, reusable content here
      cache_control: { type: 'ephemeral' },  // ← cache breakpoint
    },
  ],
  messages: [{ role: 'user', content: userQuery }],
});
```

### Cache Breakpoint Placement (Priority Order)

1. **System prompt** — most stable, highest reuse
2. **Tool definitions** — stable across requests
3. **Long context documents** — RAG chunks, codebases, papers
4. **Conversation history prefix** — in multi-turn, cache everything except the latest user message

### Cost

| Type | Cost vs Base |
|------|-------------|
| Cache write | 25% more than base input |
| Cache read (hit) | 90% less than base input |
| Break-even | 2nd request onward |

### Monitoring

Check `response.usage` for:
- `cache_creation_input_tokens` — tokens written to cache (first request)
- `cache_read_input_tokens` — tokens served from cache (subsequent requests)

If `cache_read_input_tokens` is 0 on requests that should hit cache, your prefix changed or TTL expired.

## Extended Thinking

Extended thinking lets Claude reason step-by-step before responding. Critical for complex analysis, math, and multi-step planning.

### When to Use

- Complex reasoning or analysis tasks
- Multi-step problem solving
- Tasks where accuracy matters more than speed
- Research planning and methodology selection

### Implementation

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-6-20250415',
  max_tokens: 16000,
  thinking: {
    type: 'enabled',
    budget_tokens: 10000,  // max tokens for internal reasoning
  },
  messages: [{ role: 'user', content: complexQuery }],
});

// Thinking blocks appear in response.content
for (const block of response.content) {
  if (block.type === 'thinking') {
    console.log('Reasoning:', block.thinking);
  } else if (block.type === 'text') {
    console.log('Answer:', block.text);
  }
}
```

### Budget Guidelines

| Task Complexity | Budget |
|----------------|--------|
| Simple analysis | 2,000-5,000 |
| Moderate reasoning | 5,000-10,000 |
| Complex multi-step | 10,000-30,000 |
| Deep research/proof | 30,000+ |

### Constraints

- Cannot be used with `temperature` != 1
- Cannot be used with `top_k` or `top_p`
- Thinking tokens count toward output token limits
- Thinking content may be redacted in some API responses

## Auto-Compaction (Agent SDK)

Auto-compaction prevents context window overflow in long-running agent sessions.

### How It Works

When conversation tokens exceed `autoCompactWindow`, the SDK automatically:
1. Summarizes older messages
2. Replaces them with a compact summary
3. Keeps recent messages intact

### Configuration

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const options = {
  model: 'claude-sonnet-4-6-20250415',
  autoCompactWindow: 160000,  // trigger compaction at this token count
  // ...other options
};
```

### Sizing Guidelines

| Model Context | Recommended autoCompactWindow |
|--------------|------------------------------|
| 200K (Sonnet/Haiku) | 140,000-170,000 |
| 1M (Opus) | 700,000-850,000 |

Set it to ~70-85% of the model's context limit. Too low = frequent compaction (loses detail). Too high = risk of hitting the hard limit.

## Tool Use

### Defining Tools

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-6-20250415',
  max_tokens: 1024,
  tools: [
    {
      name: 'get_weather',
      description: 'Get current weather for a location. Use when the user asks about weather conditions.',
      input_schema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City and state/country, e.g. "San Francisco, CA"',
          },
        },
        required: ['location'],
      },
    },
  ],
  messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
});
```

### Tool Use Loop Pattern

```typescript
let messages = [{ role: 'user', content: userInput }];

while (true) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6-20250415',
    max_tokens: 4096,
    tools: TOOLS,
    messages,
  });

  // Add assistant response to conversation
  messages.push({ role: 'assistant', content: response.content });

  if (response.stop_reason === 'end_turn') break;

  // Process tool calls
  const toolResults = [];
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      const result = await executeToolCall(block.name, block.input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
  }

  messages.push({ role: 'user', content: toolResults });
}
```

### Tool Description Best Practices

- Start with what the tool does, then when to use it
- Include parameter descriptions with examples
- Mention edge cases or limitations
- Cache tool definitions (they're stable across requests)

## Batch Processing

For non-time-sensitive workloads, batch processing offers 50% cost reduction.

```typescript
const batch = await client.messages.batches.create({
  requests: items.map((item, i) => ({
    custom_id: `item-${i}`,
    params: {
      model: 'claude-sonnet-4-6-20250415',
      max_tokens: 1024,
      messages: [{ role: 'user', content: item.prompt }],
    },
  })),
});

// Poll for completion
let result = await client.messages.batches.retrieve(batch.id);
while (result.processing_status !== 'ended') {
  await new Promise(r => setTimeout(r, 10000));
  result = await client.messages.batches.retrieve(batch.id);
}
```

## Model Selection

| Model | Best For | Context |
|-------|----------|---------|
| claude-opus-4-6 | Complex reasoning, research, architecture | 1M |
| claude-sonnet-4-6 | General coding, analysis, balanced cost/quality | 200K |
| claude-haiku-4-5 | Fast tasks, classification, extraction, high volume | 200K |

### Model IDs (Current as of May 2025)

- `claude-opus-4-6-20250415`
- `claude-sonnet-4-6-20250415`
- `claude-haiku-4-5-20251001`

## Common Anti-Patterns

1. **Not caching system prompts** — If you send the same system prompt repeatedly without `cache_control`, you pay full input price every time.
2. **Setting autoCompactWindow too low** — Causes frequent compaction, losing important context.
3. **Ignoring stop_reason** — Always check `stop_reason` to handle `tool_use`, `end_turn`, and `max_tokens` differently.
4. **Large tool results without summarization** — If a tool returns 10K+ tokens, consider summarizing before passing back.
5. **Not using thinking for complex tasks** — Thinking consistently improves accuracy on multi-step reasoning.
6. **Hardcoding model IDs without fallback** — Use model aliases or configuration to allow easy model switching.

## Debugging

### Token Usage

Always log `response.usage`:

```typescript
console.log({
  input: response.usage.input_tokens,
  output: response.usage.output_tokens,
  cache_write: response.usage.cache_creation_input_tokens,
  cache_read: response.usage.cache_read_input_tokens,
});
```

### Rate Limits

- Check `x-ratelimit-*` response headers
- Implement exponential backoff on 429 responses
- Use `retry-after` header value when present

### Streaming

For long responses, use streaming to improve time-to-first-token:

```typescript
const stream = client.messages.stream({
  model: 'claude-sonnet-4-6-20250415',
  max_tokens: 4096,
  messages: [{ role: 'user', content: query }],
});

for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  }
}
```
