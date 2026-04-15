import { defineConfig } from 'vitest/config';

// Coase 目前只跑一条"冒烟测试线"。测试文件都放在 tests/ 下，是可以独立运行的
// 纯逻辑模块（session-log 的去重、压实、orphan seal，UsagePage 的 aggregateUsage）。
// electron 模块在这里被 alias 成一个可注入 userData 路径的 stub，这样 session-log
// 可以直接 import 而不需要真实的 Electron 环境。
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
  },
  resolve: {
    alias: {
      electron: new URL('./tests/__mocks__/electron.ts', import.meta.url).pathname,
    },
  },
});
