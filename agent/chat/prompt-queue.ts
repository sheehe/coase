// Async iterable 队列，用于把用户消息一条一条喂给 Claude Agent SDK 的
// `query({ prompt: AsyncIterable<SDKUserMessage> })` 多轮对话入口。
//
// SDK 会持续读这个 iterable：每 yield 一条就跑一个 agent turn，turn 结束后
// 回来要下一条；队列 end() 之后 iterable 返回 done:true，SDK 那边 query 结束。
//
// 主进程这边只负责 push(newUserText) 和最终 end()，不关心 SDK 怎么调度。

import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

type Resolver = (result: IteratorResult<SDKUserMessage>) => void;

export class PromptQueue implements AsyncIterable<SDKUserMessage> {
  private readonly buffer: SDKUserMessage[] = [];
  private readonly waiters: Resolver[] = [];
  private finished = false;

  /** 推一条用户文本消息进队列；SDK 的下一个 agent turn 会消费它。 */
  push(text: string): void {
    if (this.finished) return;
    const msg: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
    };
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: msg, done: false });
    } else {
      this.buffer.push(msg);
    }
  }

  /** 标记队列已关闭。等待中的 iterator 会立刻收到 done:true，SDK 会结束 query。 */
  end(): void {
    if (this.finished) return;
    this.finished = true;
    while (this.waiters.length) {
      const w = this.waiters.shift();
      w?.({ value: undefined as unknown as SDKUserMessage, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: (): Promise<IteratorResult<SDKUserMessage>> => {
        const queued = this.buffer.shift();
        if (queued) return Promise.resolve({ value: queued, done: false });
        if (this.finished) {
          return Promise.resolve({
            value: undefined as unknown as SDKUserMessage,
            done: true,
          });
        }
        return new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
          this.waiters.push(resolve);
        });
      },
      return: async (): Promise<IteratorResult<SDKUserMessage>> => {
        this.end();
        return { value: undefined as unknown as SDKUserMessage, done: true };
      },
    };
  }
}
