// 产物预览弹窗：展示推导产物或生成文件的完整内容，并支持打开原文件。
import MarkdownContent from '../../components/MarkdownContent';
import Dialog from '../../components/ui/Dialog';
import type { ArtifactRecord } from './run-insights';

export default function ArtifactPreviewDialog({
  artifact,
  onClose,
}: {
  artifact: ArtifactRecord | null;
  onClose: () => void;
}) {
  const handleOpenFile = async (): Promise<void> => {
    if (!artifact?.filePath) return;
    const result = await window.coase.artifacts.openPath(artifact.filePath);
    if (!result.ok) {
      console.warn('failed to open artifact file', {
        filePath: artifact.filePath,
        error: result.error,
      });
    }
  };

  const shouldRenderMarkdown =
    artifact !== null &&
    artifact.kind !== 'r_script' &&
    artifact.mediaType !== 'application/octet-stream' &&
    artifact.mediaType !== 'application/pdf' &&
    artifact.mediaType !== 'image/png' &&
    artifact.mediaType !== 'image/jpeg';

  return (
    <Dialog
      open={artifact !== null}
      onClose={onClose}
      title={artifact?.title ?? '产物预览'}
      widthClass="max-w-3xl"
    >
      {artifact && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-fg-subtle">
            <span>{artifact.kind}</span>
            {artifact.inferredStage && <span>· {artifact.inferredStage}</span>}
            {artifact.sourceTool && <span>· {artifact.sourceTool}</span>}
            {artifact.path && <span>· {artifact.path}</span>}
            {artifact.mediaType && <span>· {artifact.mediaType}</span>}
          </div>

          {artifact.filePath && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-3 py-2">
              <div className="min-w-0 text-xs text-fg-muted">
                <div className="text-[11px] uppercase tracking-wider text-fg-subtle">源文件</div>
                <div className="mt-1 truncate">{artifact.filePath}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleOpenFile();
                }}
                className="shrink-0 rounded-xl border border-border px-3 py-1.5 text-sm text-fg transition hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              >
                打开原文件
              </button>
            </div>
          )}

          {shouldRenderMarkdown ? (
            <div className="max-h-[65vh] overflow-auto rounded-2xl border border-border bg-app p-4">
              <MarkdownContent
                content={artifact.content}
                className="text-[13px] leading-[1.75] text-fg"
              />
            </div>
          ) : (
            <pre className="max-h-[65vh] overflow-auto rounded-2xl border border-border bg-app p-4 text-[12px] leading-[1.65] whitespace-pre-wrap text-fg">
              {artifact.content}
            </pre>
          )}
        </div>
      )}
    </Dialog>
  );
}
