import { useConnectedWallet } from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowLeft,
  ArrowUp,
  History,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'

import { useMeraAi } from '@/components/chat/MeraAiContext'
import { ChatMarkdown } from '@/components/chat/ChatMarkdown'
import { Button } from '@/components/ui/button'
import type { AppClient } from '@/lib/solanaClient'
import { cn } from '@/lib/utils'
import { useChatMutation } from '@/store/api'
import { useAppSelector } from '@/store/hooks'

type DrawerView = 'chat' | 'history' | 'settings'
type Role = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: Role
  content: string
}

type Thread = {
  id: string
  title: string
  updatedAt: string
  messages: ChatMessage[]
}

const STARTERS = [
  'How does Autopilot work?',
  'What’s my biggest risk?',
  'Draft a max 40% SOL rule',
] as const

let seq = 0
function nextId(prefix: string) {
  seq += 1
  return `${prefix}-${seq}`
}

/**
 * Mera AI slide-over — same white theme as wallet connect / details.
 */
export function MeraChatDrawer() {
  const { open, closeChat } = useMeraAi()
  const client = useClient<AppClient>()
  const connected = useConnectedWallet(client)
  const holdings = useAppSelector((state) => state.portfolio.holdings)
  const [chat] = useChatMutation()
  const [view, setView] = useState<DrawerView>('chat')
  const [threads, setThreads] = useState<Thread[]>([
    {
      id: 't-welcome',
      title: 'New chat',
      updatedAt: 'Just now',
      messages: [],
    },
  ])
  const [activeId, setActiveId] = useState('t-welcome')
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const active = threads.find((t) => t.id === activeId) ?? threads[0]

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (view !== 'chat') {
          setView('chat')
          return
        }
        closeChat()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closeChat, view])

  useEffect(() => {
    if (!open) {
      return
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (open && view === 'chat') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, view, active?.messages.length, typing])

  function startNewChat() {
    const id = nextId('t')
    setThreads((prev) => [
      {
        id,
        title: 'New chat',
        updatedAt: 'Just now',
        messages: [],
      },
      ...prev,
    ])
    setActiveId(id)
    setView('chat')
    setDraft('')
    window.setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
  }

  function appendMessage(threadId: string, message: ChatMessage) {
    setThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== threadId) {
          return thread
        }
        const title =
          thread.title === 'New chat' && message.role === 'user'
            ? message.content.slice(0, 40) || 'New chat'
            : thread.title
        return {
          ...thread,
          title,
          updatedAt: 'Just now',
          messages: [...thread.messages, message],
        }
      }),
    )
  }

  async function sendMessage(text: string) {
    const content = text.trim()
    if (!content || typing || !active) {
      return
    }
    const threadId = active.id
    const history = active.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }))

    appendMessage(threadId, {
      id: nextId('u'),
      role: 'user',
      content,
    })
    setDraft('')
    setTyping(true)

    try {
      const result = await chat({
        message: content,
        history,
        holdings: holdings.map((row) => row.asset).filter(Boolean),
        walletConnected: Boolean(connected),
      }).unwrap()

      appendMessage(threadId, {
        id: nextId('a'),
        role: 'assistant',
        content: result.ok
          ? result.reply
          : `I couldn’t reach the AI right now. ${result.error}`,
      })
    } catch {
      appendMessage(threadId, {
        id: nextId('a'),
        role: 'assistant',
        content:
          'I couldn’t reach Mera AI. Keep the backend running with `wrangler login` so Workers AI works (or set OPENAI_API_KEY as a fallback).',
      })
    } finally {
      setTyping(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage(draft)
    }
  }

  if (!open) {
    return null
  }

  const title =
    view === 'history'
      ? 'History'
      : view === 'settings'
        ? 'Settings'
        : 'Mera AI'

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-black/40"
        aria-label="Close Mera AI"
        onClick={closeChat}
      />

      <aside
        className="relative flex h-full w-full max-w-md flex-col bg-background text-foreground shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Mera AI"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {view !== 'chat' ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-xl"
                onClick={() => {
                  setView('chat')
                }}
                aria-label="Back to chat"
              >
                <ArrowLeft className="size-4" />
              </Button>
            ) : (
              <span className="flex size-8 items-center justify-center rounded-full bg-lime text-[10px] font-bold text-lime-foreground">
                AI
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                {view === 'chat' ? (active?.title ?? title) : title}
              </p>
              {view === 'chat' ? (
                <p className="text-[11px] text-muted-foreground">Inside Mera</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            {view === 'chat' ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => {
                    setView('history')
                  }}
                  aria-label="History"
                >
                  <History className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => {
                    setView('settings')
                  }}
                  aria-label="Settings"
                >
                  <Settings className="size-4" />
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-xl"
              onClick={closeChat}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {view === 'history' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
            <Button
              type="button"
              className="mb-3 h-11 w-full rounded-2xl bg-lime font-semibold text-lime-foreground hover:bg-lime/90"
              onClick={startNewChat}
            >
              New chat
            </Button>
            <ul className="space-y-1">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(thread.id)
                      setView('chat')
                    }}
                    className={cn(
                      'w-full cursor-pointer rounded-2xl px-3.5 py-3 text-left transition',
                      thread.id === activeId
                        ? 'bg-secondary'
                        : 'hover:bg-secondary/70',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {thread.title}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {thread.updatedAt}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {thread.messages[thread.messages.length - 1]?.content ??
                        'Empty chat'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {view === 'settings' ? (
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <section className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">
                About Mera AI
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Product assistant for this hackathon build — portfolio,
                Autopilot, rules, Deposit, and Send. It stays on Mera topics and
                refuses unrelated requests.
              </p>
            </section>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-foreground">Live LLM</span>
              <span className="rounded-full bg-lime/30 px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
                Backend
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-foreground">Save chat history</span>
              <span className="text-xs text-muted-foreground">Local only</span>
            </div>
          </div>
        ) : null}

        {view === 'chat' ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
              {active && active.messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
                  <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-lime/20">
                    <Sparkles className="size-5 text-foreground" />
                  </div>
                  <p className="text-base font-semibold text-foreground">
                    Ask Mera anything
                  </p>
                  <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                    About your portfolio, vault, or next move.
                  </p>
                  <div className="mt-5 flex w-full flex-col gap-2">
                    {STARTERS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          sendMessage(prompt)
                        }}
                        className="cursor-pointer rounded-2xl border border-border bg-card px-3 py-2.5 text-left text-xs text-foreground transition hover:bg-secondary"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {active?.messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'flex gap-2.5',
                        message.role === 'user'
                          ? 'justify-end'
                          : 'justify-start',
                      )}
                    >
                      {message.role === 'assistant' ? (
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-lime text-[9px] font-bold text-lime-foreground">
                          AI
                        </span>
                      ) : null}
                      <div
                        className={cn(
                          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                          message.role === 'user'
                            ? 'rounded-br-md bg-lime text-lime-foreground'
                            : 'rounded-bl-md border border-border bg-card text-foreground',
                        )}
                      >
                        {message.role === 'assistant' ? (
                          <ChatMarkdown content={message.content} />
                        ) : (
                          message.content
                        )}
                      </div>
                    </div>
                  ))}
                  {typing ? (
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-full bg-lime text-[9px] font-bold text-lime-foreground">
                        AI
                      </span>
                      <div className="flex gap-1 rounded-2xl border border-border bg-card px-3 py-2.5">
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:120ms]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:240ms]" />
                      </div>
                    </div>
                  ) : null}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <div className="border-t border-border bg-background p-3">
              <form
                className="flex items-end gap-2 rounded-2xl border border-border bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring"
                onSubmit={(event) => {
                  event.preventDefault()
                  sendMessage(draft)
                }}
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value)
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Message Mera…"
                  className="max-h-28 min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!draft.trim() || typing}
                  className="mb-0.5 size-10 shrink-0 rounded-xl bg-lime text-lime-foreground hover:bg-lime/90"
                  aria-label="Send"
                >
                  <ArrowUp className="size-4" strokeWidth={2.5} />
                </Button>
              </form>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  )
}
