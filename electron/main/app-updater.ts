import { app, BrowserWindow } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { autoUpdater, type AppUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';

import type { AppUpdateSnapshot } from '../../shared/ipc';

interface GitHubRepoInfo {
  owner: string;
  repo: string;
}

class CoaseAppUpdater {
  private readonly updater: AppUpdater = autoUpdater;
  private state: AppUpdateSnapshot = {
    supported: false,
    enabled: false,
    status: 'disabled',
    currentVersion: app.getVersion(),
    canCheck: false,
    canDownload: false,
    canInstall: false,
  };
  private configured = false;
  private readonly repoInfo = resolveGitHubRepoInfo();

  init(): void {
    const disabledReason = this.resolveDisabledReason();
    if (disabledReason) {
      this.updateState({
        supported: false,
        enabled: false,
        status: 'disabled',
        currentVersion: app.getVersion(),
        message: disabledReason,
        canCheck: false,
        canDownload: false,
        canInstall: false,
      });
      return;
    }

    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = true;
    this.updater.allowPrerelease = true;
    this.updater.setFeedURL({
      provider: 'github',
      owner: this.repoInfo!.owner,
      repo: this.repoInfo!.repo,
    });

    this.updater.on('checking-for-update', () => {
      this.updateState({
        ...this.baseState(),
        status: 'checking',
        message: '正在检查更新',
      });
    });

    this.updater.on('update-available', (info) => {
      this.updateState({
        ...this.baseState(),
        status: 'available',
        availableVersion: info.version,
        releaseDate: info.releaseDate,
        updateInfoUrl: releaseUrl(this.repoInfo!, info.version),
        message: `发现新版本 ${info.version}`,
        canDownload: true,
      });
    });

    this.updater.on('update-not-available', () => {
      this.updateState({
        ...this.baseState(),
        status: 'not-available',
        message: '当前已经是最新版本',
      });
    });

    this.updater.on('download-progress', (progress) => {
      this.updateState(this.snapshotFromProgress(progress));
    });

    this.updater.on('update-downloaded', (info) => {
      this.updateState({
        ...this.baseState(),
        status: 'downloaded',
        availableVersion: info.version,
        downloadedVersion: info.version,
        releaseDate: info.releaseDate,
        updateInfoUrl: releaseUrl(this.repoInfo!, info.version),
        message: `更新 ${info.version} 已下载，重启后安装`,
        canInstall: true,
      });
    });

    this.updater.on('error', (error) => {
      this.updateState({
        ...this.baseState(),
        status: 'error',
        message: error?.message ?? String(error),
      });
    });

    this.configured = true;
    this.updateState({
      ...this.baseState(),
      status: 'idle',
      message: '自动更新已启用',
    });
  }

  getState(): AppUpdateSnapshot {
    return this.state;
  }

  async check(): Promise<AppUpdateSnapshot> {
    this.ensureConfigured();
    await this.updater.checkForUpdates();
    return this.state;
  }

  async download(): Promise<AppUpdateSnapshot> {
    this.ensureConfigured();
    await this.updater.downloadUpdate();
    return this.state;
  }

  install(): void {
    this.ensureConfigured();
    this.updater.quitAndInstall();
  }

  maybeCheckOnStartup(): void {
    if (!this.configured) return;
    void this.check().catch((error) => {
      this.updateState({
        ...this.baseState(),
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private ensureConfigured(): void {
    if (!this.configured) {
      throw new Error(this.state.message ?? '自动更新未启用');
    }
  }

  private resolveDisabledReason(): string | null {
    if (!app.isPackaged) return '开发模式下不检查自动更新';
    if (isPortableBuild()) return '便携版不支持自动更新，请使用安装版';
    if (!this.repoInfo) return '未配置 GitHub 仓库地址，无法检查更新';
    return null;
  }

  private baseState(): AppUpdateSnapshot {
    return {
      supported: true,
      enabled: true,
      status: 'idle',
      currentVersion: app.getVersion(),
      provider: `github:${this.repoInfo!.owner}/${this.repoInfo!.repo}`,
      canCheck: true,
      canDownload: false,
      canInstall: false,
    };
  }

  private snapshotFromProgress(progress: ProgressInfo): AppUpdateSnapshot {
    return {
      ...this.baseState(),
      status: 'downloading',
      availableVersion: this.state.availableVersion,
      progressPercent: progress.percent,
      transferredBytes: progress.transferred,
      totalBytes: progress.total,
      updateInfoUrl: this.state.updateInfoUrl,
      message: `正在下载更新 ${progress.percent.toFixed(1)}%`,
    };
  }

  private updateState(next: AppUpdateSnapshot): void {
    this.state = next;
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('app-update:event', next);
      }
    }
  }
}

function resolveGitHubRepoInfo(): GitHubRepoInfo | null {
  const pkg = readPackageJson();
  const repositoryRecord =
    pkg.repository && typeof pkg.repository === 'object'
      ? (pkg.repository as { url?: unknown })
      : null;
  const repository =
    typeof pkg.repository === 'string'
      ? pkg.repository
      : repositoryRecord && typeof repositoryRecord.url === 'string'
        ? repositoryRecord.url
        : null;

  if (!repository) return null;
  const match = repository.match(/github\.com[:/]+([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function readPackageJson(): Record<string, unknown> {
  const appPath = app.getAppPath();
  const pkgPath = join(appPath, 'package.json');
  return JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
}

function releaseUrl(repo: GitHubRepoInfo, version: string): string {
  return `https://github.com/${repo.owner}/${repo.repo}/releases/tag/v${version}`;
}

function isPortableBuild(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
}

export const coaseAppUpdater = new CoaseAppUpdater();
