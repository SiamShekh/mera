import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'

import { cn } from '@/lib/utils'

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-foreground underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    const isBlock = Boolean(className)
    if (isBlock) {
      return (
        <code className="my-2 block overflow-x-auto rounded-lg bg-secondary px-2.5 py-2 text-xs">
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-secondary px-1 py-0.5 text-[0.85em]">
        {children}
      </code>
    )
  },
  pre: ({ children }) => <>{children}</>,
  h1: ({ children }) => (
    <p className="mb-2 text-base font-semibold">{children}</p>
  ),
  h2: ({ children }) => (
    <p className="mb-2 text-sm font-semibold">{children}</p>
  ),
  h3: ({ children }) => (
    <p className="mb-1.5 text-sm font-semibold">{children}</p>
  ),
}

type ChatMarkdownProps = {
  content: string
  className?: string
}

/** Renders assistant chat content with safe Markdown (no raw HTML). */
export function ChatMarkdown({ content, className }: ChatMarkdownProps) {
  return (
    <div className={cn('text-sm leading-relaxed break-words', className)}>
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  )
}
