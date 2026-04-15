// 统一 Markdown 渲染组件：供对话正文与文件预览复用，基于标准 Markdown 解析库。
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

function joinClassNames(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(' ');
}

function InlineCode({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<'code'> & { className?: string }) {
  return (
    <code
      {...props}
      className={joinClassNames(
        'rounded bg-app px-1.5 py-0.5 font-mono text-[0.95em] text-fg',
        className,
      )}
    >
      {children}
    </code>
  );
}

function BlockCode({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const language = className?.replace(/^language-/, '').trim();
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-app first:mt-0">
      {language ? (
        <div className="border-b border-border px-3 py-1.5 font-mono text-[11px] text-fg-subtle">
          {language}
        </div>
      ) : null}
      <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-[1.65] whitespace-pre-wrap text-fg">
        <code className={joinClassNames('font-inherit', className)}>{children}</code>
      </pre>
    </div>
  );
}

export default function MarkdownContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ children, className: hClassName, ...props }) => (
            <h1
              {...props}
              className={joinClassNames(
                'mt-5 text-[24px] font-semibold tracking-tight text-fg first:mt-0',
                hClassName,
              )}
            >
              {children}
            </h1>
          ),
          h2: ({ children, className: hClassName, ...props }) => (
            <h2
              {...props}
              className={joinClassNames(
                'mt-5 text-[20px] font-semibold tracking-tight text-fg first:mt-0',
                hClassName,
              )}
            >
              {children}
            </h2>
          ),
          h3: ({ children, className: hClassName, ...props }) => (
            <h3
              {...props}
              className={joinClassNames(
                'mt-5 text-[17px] font-semibold text-fg first:mt-0',
                hClassName,
              )}
            >
              {children}
            </h3>
          ),
          h4: ({ children, className: hClassName, ...props }) => (
            <h4
              {...props}
              className={joinClassNames(
                'mt-5 text-[15px] font-semibold text-fg first:mt-0',
                hClassName,
              )}
            >
              {children}
            </h4>
          ),
          h5: ({ children, className: hClassName, ...props }) => (
            <h5
              {...props}
              className={joinClassNames(
                'mt-5 text-[14px] font-semibold text-fg first:mt-0',
                hClassName,
              )}
            >
              {children}
            </h5>
          ),
          h6: ({ children, className: hClassName, ...props }) => (
            <h6
              {...props}
              className={joinClassNames(
                'mt-5 text-[13px] font-semibold uppercase tracking-wide text-fg-muted first:mt-0',
                hClassName,
              )}
            >
              {children}
            </h6>
          ),
          p: ({ children, className: pClassName, ...props }) => (
            <p
              {...props}
              className={joinClassNames('mt-4 whitespace-pre-wrap text-fg first:mt-0', pClassName)}
            >
              {children}
            </p>
          ),
          a: ({ children, className: aClassName, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer"
              className={joinClassNames(
                'underline decoration-border-strong underline-offset-4 transition hover:text-fg',
                aClassName,
              )}
            >
              {children}
            </a>
          ),
          blockquote: ({ children, className: qClassName, ...props }) => (
            <blockquote
              {...props}
              className={joinClassNames(
                'mt-4 border-l-2 border-border-strong pl-4 text-fg-muted first:mt-0',
                qClassName,
              )}
            >
              {children}
            </blockquote>
          ),
          ul: ({ children, className: ulClassName, ...props }) => (
            <ul
              {...props}
              className={joinClassNames('mt-4 list-disc space-y-1 pl-5 text-fg', ulClassName)}
            >
              {children}
            </ul>
          ),
          ol: ({ children, className: olClassName, ...props }) => (
            <ol
              {...props}
              className={joinClassNames('mt-4 list-decimal space-y-1 pl-5 text-fg', olClassName)}
            >
              {children}
            </ol>
          ),
          li: ({ children, className: liClassName, ...props }) => (
            <li {...props} className={joinClassNames('text-fg', liClassName)}>
              {children}
            </li>
          ),
          hr: ({ className: hrClassName, ...props }) => (
            <hr {...props} className={joinClassNames('mt-5 border-t border-border', hrClassName)} />
          ),
          table: ({ children, className: tableClassName, ...props }) => (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-border first:mt-0">
              <table
                {...props}
                className={joinClassNames(
                  'min-w-full border-collapse text-left text-[13px] text-fg',
                  tableClassName,
                )}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children, className: theadClassName, ...props }) => (
            <thead {...props} className={joinClassNames('bg-app', theadClassName)}>
              {children}
            </thead>
          ),
          tbody: ({ children, className: tbodyClassName, ...props }) => (
            <tbody {...props} className={tbodyClassName}>
              {children}
            </tbody>
          ),
          tr: ({ children, className: trClassName, ...props }) => (
            <tr
              {...props}
              className={joinClassNames('border-b border-border last:border-b-0', trClassName)}
            >
              {children}
            </tr>
          ),
          th: ({ children, className: thClassName, ...props }) => (
            <th
              {...props}
              className={joinClassNames('border-b border-border px-3 py-2 font-medium', thClassName)}
            >
              {children}
            </th>
          ),
          td: ({ children, className: tdClassName, ...props }) => (
            <td
              {...props}
              className={joinClassNames('px-3 py-2 align-top text-fg-muted', tdClassName)}
            >
              {children}
            </td>
          ),
          img: ({ className: imgClassName, alt, ...props }) => (
            <img
              {...props}
              alt={alt ?? ''}
              className={joinClassNames(
                'mt-4 max-w-full rounded-2xl border border-border first:mt-0',
                imgClassName,
              )}
            />
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ children, className: codeClassName, ...props }) => {
            const isBlock = Boolean(codeClassName?.startsWith('language-'));
            if (isBlock) {
              return <BlockCode className={codeClassName}>{children}</BlockCode>;
            }
            return (
              <InlineCode {...props} className={codeClassName}>
                {children}
              </InlineCode>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
