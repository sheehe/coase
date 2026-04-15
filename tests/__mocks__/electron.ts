// 供 vitest 使用的 electron 替身。真实 electron 模块只能在 electron runtime 里
// 跑，vitest 是普通 Node，所以 session-log 这种"只依赖 app.getPath('userData')"
// 的模块在测试里就导入这个 stub。
//
// userData 路径通过 setMockUserData() 在 beforeEach 里注入一个临时目录，测试结束
// 后清理。
let userData = process.cwd();

export function setMockUserData(dir: string): void {
  userData = dir;
}

export const app = {
  getPath(key: string): string {
    if (key === 'userData') return userData;
    return userData;
  },
};
