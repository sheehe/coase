# runtime-manager

pixi 二进制的发放目录。`bin/` 不入库（见 `.gitignore`），由 `scripts/fetch-pixi.mjs` 在开发机 / CI 打包前下载填充。

## 目录

```
runtime-manager/
├── .gitignore
├── README.md
└── bin/                     # 由 fetch-pixi.mjs 生成
    ├── version.json         # 当前 pixi 版本 + 来源 + SHA256 manifest
    ├── darwin-x64/pixi
    ├── darwin-arm64/pixi
    ├── win32-x64/pixi.exe
    └── linux-x64/pixi
```

## 打包时的平台选择

electron-builder 通过 `extraResources` 按当前构建目标把对应子目录拷进安装包，运行时 `agent/runtime/paths.ts` 按 `process.platform + process.arch` 解析出正确的 pixi 路径。

## 本地开发

首次开发或切换 pixi 版本后，跑一次：

```bash
pnpm fetch-pixi
```

默认只下当前平台。CI 打包前用 `pnpm fetch-pixi --all` 下全部平台。
