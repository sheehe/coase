#!/usr/bin/env node
// 小包装：在 spawn electron-vite 之前清掉 ELECTRON_RUN_AS_NODE。
// VS Code 的集成终端会把这个变量注入到子进程，导致 electron.exe 退化成纯 Node，
// 然后 require('electron') 返回一个字符串路径，main 里 `electron.app.isPackaged`
// 就炸成 "Cannot read properties of undefined"。清掉它即可。
import { spawn } from 'node:child_process';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = process.argv.slice(2);

// shell:true 是 Windows 上 spawn .cmd 的唯一通路（Node 24+ 禁止直接 spawn .cmd 文件）。
// args 来自我们自己的 npm scripts，不接受外部输入，没有注入风险；
// Node 会打 DEP0190 警告，无害，忽略即可。
const child = spawn('electron-vite', args, {
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
