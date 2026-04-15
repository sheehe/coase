# 桌面应用打包

## 当前方案

项目使用 `electron-builder` 打包，产物输出到 `release/`。

- Windows: `nsis` 安装包 + `portable` 免安装包
- macOS: `dmg` 安装包 + `zip` 压缩包

内置插件资源通过 `extraResources` 复制到安装目录下的 `resources/plugins`，和运行时代码里的 `process.resourcesPath/plugins/...` 约定一致。

Windows 安装版已接入自动更新，更新源使用 GitHub Releases。

## 自动更新前提

自动更新当前使用：

- `electron-updater`
- GitHub Releases
- Windows 安装版 `nsis`

限制：

- 开发模式不检查更新
- `portable` 便携版不支持自动更新
- 如果 `package.json` 里没有真实的 `repository` 指向 GitHub 仓库，客户端会禁用自动更新

发布前请补齐：

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/<owner>/<repo>.git"
  }
}
```

工作流在推送 `v*` tag 时会把 `release/*` 上传到 GitHub Release，供客户端拉取更新元数据与安装包。

## 本地打包

先安装依赖：

```bash
pnpm install
```

仅生成解包目录，便于先验证打包内容：

```bash
pnpm dist:dir
```

生成 Windows 安装包：

```bash
pnpm dist:win
```

生成 macOS 安装包：

```bash
pnpm dist:mac
```

同时打当前机器支持的默认目标：

```bash
pnpm dist
```

## 跨平台注意事项

- Windows 包建议在 Windows 上构建。
- macOS 包必须在 macOS 上构建；如果要正式分发，还需要 Apple Developer 证书做签名和 notarization。
- 不能指望在一台 Windows 机器上稳定地产出 `.dmg`；最稳妥的方式是分别在 `windows-latest` 和 `macos-latest` runner 上构建。

## CI

仓库已增加 GitHub Actions 工作流：

`/.github/workflows/build-desktop.yml`

触发方式：

- 手动触发 `workflow_dispatch`
- 推送 tag，例如 `v2.0.0`

工作流会分别在 Windows 和 macOS runner 上执行对应命令，并上传 `release/` 目录产物。

## 图标与签名

当前配置未指定自定义图标，`electron-builder` 会回退到默认 Electron 图标。

如果要发布正式版本，建议补齐：

- Windows: `resources/icons/icon.ico`
- macOS: `resources/icons/icon.icns`

然后在 `package.json -> build.win.icon` 和 `build.mac.icon` 里显式指定。
