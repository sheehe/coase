// Coase 研究运行时对外门面。按阶段增量扩展：
//   P1 pixi 自检；P2 template 声明；P4 PATH 注入到 agent 子进程；
//   P3 安装向导 / P5 Stata 检测后续再加。

export { getPixiVersion, runPixi } from './pixi';
export type { PixiRunOptions, PixiRunResult } from './pixi';
export { pixiBinaryPath, runtimeManagerResourcesDir, runtimeUserDir, currentPlatformKey } from './paths';
export {
  buildRuntimeEnv,
  researchEnvRoot,
  researchEnvPathDirs,
  researchEnvExists,
} from './env';
export { runtimeInstallManager, ensureRuntimeFiles } from './install';
export { verifyResearchEnv } from './verify';
export type { VerifyResult } from './verify';
