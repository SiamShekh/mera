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
import {
  useArmAutopilotMutation,
  useAutopilotTurnMutation,
  useConfirmRuleMutation,
  useSwapConfigQuery,
} from '@/store/api'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadPortfolio } from '@/store/portfolioSlice'
import { sendHoldingTransfer } from '@/lib/sendTransfer'
import type { CompiledRule } from '@/types/api'
import type { Holding } from '@/types/holding'

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
  'Sell all of my NVIDIA at the current price',
  'Sell 50% of NVIDIA above $100',
] as const

const AUTOPILOT_STARTERS = [
  'Sell all of my NVIDIA stock at the current price.',
  'Sell 50% of my NVIDIA stocks when the price goes above $100.',
  'When NVDAx is up 20%, sell 10%',
] as const

let seq = 0
function nextId(prefix: string) {
  seq += 1
  return `${prefix}-${seq}`
}

function looksLikeDeployIntent(text: string) {
  return /deploy.*(pda|pdr|portfolio|vault)|initialize[_\s-]?portfolio|link.*(vault|pda|pdr)/i.test(
    text,
  )
}

function formatChatError(err: unknown): string {
  if (err && typeof err === 'object') {
    const record = err as {
      data?: { error?: string; message?: string }
      error?: string | { status?: number; data?: { error?: string } }
      message?: string
      status?: number
    }
    const fromData =
      record.data?.error ??
      record.data?.message ??
      (typeof record.error === 'object' ? record.error?.data?.error : null) ??
      (typeof record.error === 'string' ? record.error : null)
    if (fromData && String(fromData).trim()) {
      return String(fromData)
    }
    if (record.message && String(record.message).trim()) {
      return String(record.message)
    }
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return 'Something went wrong while arming Autopilot. Check the backend terminal for details.'
}

function normalizeHoldingSymbol(raw: string): string {
  const upper = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (
    upper === 'NVDA' ||
    upper === 'NVDAX' ||
    upper.includes('NVIDIA') ||
    upper === 'NAVIDIA'
  ) {
    return 'NVDAX'
  }
  return upper
}

function findSellHolding(holdings: Holding[], asset: string): Holding | null {
  const want = normalizeHoldingSymbol(asset)
  return (
    holdings.find((row) => normalizeHoldingSymbol(row.asset) === want) ?? null
  )
}

function computeSellUiAmount(
  holding: Holding,
  rule: {
    actionUnit: string
    actionValue: number
    sellBasis: string
  },
): { uiAmount: string; uiNumber: number } {
  const decimals = Math.min(Math.max(holding.decimals, 0), 9)
  const scale = 10 ** decimals
  const balanceRaw = Math.floor(holding.quantity * scale + 1e-9)

  let sellRaw: number
  if (rule.actionUnit === 'amount') {
    const price = holding.price > 0 ? holding.price : 0
    if (!(price > 0)) {
      return { uiAmount: '0', uiNumber: 0 }
    }
    const fromUsd = Math.floor((rule.actionValue / price) * scale + 1e-9)
    sellRaw = Math.min(balanceRaw, fromUsd)
  } else {
    // Integer percent of raw balance — avoids arm/verify float off-by-one.
    sellRaw = Math.floor((balanceRaw * rule.actionValue) / 100)
  }

  if (sellRaw <= 0) {
    return { uiAmount: '0', uiNumber: 0 }
  }

  const uiNumber = sellRaw / scale
  const exact = uiNumber.toFixed(decimals)
  return { uiAmount: exact, uiNumber: Number(exact) }
}

/**
 * Mera AI chat as part of the app shell:
 * - Desktop: right layout column that shrinks main content when open
 * - Mobile: full-screen page when open
 * Reopen from the sidebar "AI Chat" item after closing.
 */
export function MeraChatDrawer() {
  const { open, closeChat, intent, consumeDraftPrefill } = useMeraAi()
  const client = useClient<AppClient>()
  const connected = useConnectedWallet(client)
  const dispatch = useAppDispatch()
  const holdings = useAppSelector((state) => state.portfolio.holdings)
  const [autopilotTurn] = useAutopilotTurnMutation()
  const [confirmRule] = useConfirmRuleMutation()
  const [armAutopilot] = useArmAutopilotMutation()
  const { data: swapConfig } = useSwapConfigQuery()
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
  const [pendingRule, setPendingRule] = useState<CompiledRule | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const active = threads.find((t) => t.id === activeId) ?? threads[0]
  const starterPrompts = intent === 'autopilot' ? AUTOPILOT_STARTERS : STARTERS

  useEffect(() => {
    if (!open) {
      return
    }
    const prefill = consumeDraftPrefill()
    if (!prefill) {
      return
    }
    // Defer so we don't setState synchronously inside the effect body.
    const id = window.setTimeout(() => {
      setDraft(prefill)
      inputRef.current?.focus()
    }, 0)
    return () => {
      window.clearTimeout(id)
    }
  }, [open, consumeDraftPrefill])

  // Autopilot balance checks need live chain holdings — refresh when chat opens.
  useEffect(() => {
    const owner = connected?.account.address
    if (!open || !owner) {
      return
    }
    void dispatch(loadPortfolio(owner))
  }, [open, connected?.account.address, dispatch])

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

  // Mobile full-screen only — desktop chat is a layout column, so page can scroll.
  useEffect(() => {
    if (!open) {
      return
    }
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => {
      document.body.style.overflow = mq.matches ? 'hidden' : ''
    }
    apply()
    mq.addEventListener('change', apply)
    return () => {
      mq.removeEventListener('change', apply)
      document.body.style.overflow = ''
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
    setPendingRule(null)
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

  async function armAndSettle(
    threadId: string,
    owner: string,
    rule: CompiledRule,
    prompt: string,
    interpretation: string | null,
  ) {
    const signer = connected?.signer
    const treasury = swapConfig?.treasury

    if (!signer) {
      appendMessage(threadId, {
        id: nextId('a'),
        role: 'assistant',
        content:
          'I understand the order, but I need a connected wallet to approve the escrow. Connect a Devnet wallet and reply **yes** again.',
      })
      return
    }
    if (!treasury) {
      appendMessage(threadId, {
        id: nextId('a'),
        role: 'assistant',
        content:
          'I can’t arm Autopilot yet — the swap treasury isn’t configured on the backend (SWAP_AUTHORITY_SECRET + mock mints).',
      })
      return
    }

    if (rule.type !== 'take_profit') {
      await confirmRule({
        userAddress: owner,
        prompt,
        rule,
        status: 'active',
      }).unwrap()
      setPendingRule(null)
      appendMessage(threadId, {
        id: nextId('a'),
        role: 'assistant',
        content: [
          '**Autopilot rule activated**',
          '',
          interpretation ??
            'Allocation rule is live and watched in the background.',
        ].join('\n'),
      })
      return
    }

    // Always re-read the wallet before claiming "no balance".
    let liveHoldings = holdings
    try {
      const loaded = await dispatch(loadPortfolio(owner)).unwrap()
      liveHoldings = loaded.holdings
    } catch {
      // Fall back to whatever Redux already has
    }

    const holding = findSellHolding(liveHoldings, rule.asset)
    if (!holding || holding.quantity <= 0) {
      appendMessage(threadId, {
        id: nextId('a'),
        role: 'assistant',
        content: [
          `I still can’t see **${rule.asset}** in the connected Devnet wallet.`,
          '',
          liveHoldings.length === 0
            ? 'Holdings didn’t load from RPC — open **Spot**, confirm your wallet is on Devnet, then reply **yes** again.'
            : `I see: ${liveHoldings.map((row) => `${row.asset} ${row.quantity}`).join(', ') || 'nothing'}. If NVDAx is missing, use **Faucet** on Spot, then reply **yes**.`,
        ].join('\n'),
      })
      return
    }
    if (!holding.tokenProgram || holding.mint === 'native') {
      appendMessage(threadId, {
        id: nextId('a'),
        role: 'assistant',
        content:
          'Autopilot sells need an SPL mock stock (e.g. NVDAx), not native SOL.',
      })
      return
    }

    const sized = computeSellUiAmount(holding, rule)
    if (!(sized.uiNumber > 0)) {
      appendMessage(threadId, {
        id: nextId('a'),
        role: 'assistant',
        content:
          'I couldn’t size that sell from your balance. Check the amount and try again.',
      })
      return
    }

    appendMessage(threadId, {
      id: nextId('a'),
      role: 'assistant',
      content: `Approve in your wallet to lock **${sized.uiNumber} ${holding.asset}** for Autopilot.`,
    })

    try {
      const depositSignature = await sendHoldingTransfer({
        client,
        signer,
        holding,
        recipient: treasury,
        uiAmount: sized.uiAmount,
      })

      const confirmed = await confirmRule({
        userAddress: owner,
        prompt,
        rule,
        status: 'active',
      }).unwrap()

      const armed = await armAutopilot({
        ruleId: confirmed.rule.id,
        userAddress: owner,
        sellMint: holding.mint,
        sellAmount: sized.uiNumber,
        depositSignature,
      }).unwrap()

      void dispatch(loadPortfolio(owner))
      setPendingRule(null)

      appendMessage(threadId, {
        id: nextId('a'),
        role: 'assistant',
        content: armed.settledNow
          ? [
              '**Done — Autopilot sold**',
              '',
              interpretation ?? confirmed.interpretation,
              '',
              armed.execution?.note ?? armed.reason,
              armed.execution?.txid ? `Tx: \`${armed.execution.txid}\`` : null,
            ]
              .filter(Boolean)
              .join('\n')
          : [
              '**Autopilot armed**',
              '',
              interpretation ?? confirmed.interpretation,
              '',
              `Escrow locked. ${armed.reason}`,
              'No Force tick / keeper clicks needed — it sells when the condition hits.',
            ].join('\n'),
      })
    } catch (err) {
      appendMessage(threadId, {
        id: nextId('a'),
        role: 'assistant',
        content: [
          '**Wallet approval or arming failed**',
          '',
          formatChatError(err),
          '',
          'If you already signed a deposit, your tokens may be in treasury — reply **yes** again only after checking Spot balances, or ask me to retry.',
        ].join('\n'),
      })
    }
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
    const owner = connected?.account.address

    appendMessage(threadId, {
      id: nextId('u'),
      role: 'user',
      content,
    })
    setDraft('')
    setTyping(true)

    try {
      if (looksLikeDeployIntent(content)) {
        appendMessage(threadId, {
          id: nextId('a'),
          role: 'assistant',
          content: [
            'Deploying / linking the **Portfolio PDA** isn’t an Autopilot sell rule.',
            '',
            'For sells, just tell me what to sell in plain English and I’ll confirm with you first.',
          ].join('\n'),
        })
        return
      }

      // Stale/empty Redux holdings caused false "no balance" — refresh from chain first.
      let liveHoldings = holdings
      if (owner) {
        try {
          const loaded = await dispatch(loadPortfolio(owner)).unwrap()
          liveHoldings = loaded.holdings
        } catch {
          // Keep last known holdings if RPC fails
        }
      }

      const result = await autopilotTurn({
        message: content,
        history,
        holdings: liveHoldings.map((row) => ({
          symbol: row.asset,
          quantity: row.quantity,
          priceUsd: row.price,
        })),
        walletConnected: Boolean(connected),
        pendingRule,
      }).unwrap()

      if (!result.ok) {
        appendMessage(threadId, {
          id: nextId('a'),
          role: 'assistant',
          content: `I couldn’t reach Autopilot AI right now. ${result.error}`,
        })
        return
      }

      if (result.kind === 'propose' && result.rule) {
        setPendingRule(result.rule)
        appendMessage(threadId, {
          id: nextId('a'),
          role: 'assistant',
          content: [
            result.reply,
            '',
            result.interpretation
              ? `**Order draft:** ${result.interpretation}`
              : null,
            '',
            'Reply **yes** to confirm, or tell me what to change.',
          ]
            .filter(Boolean)
            .join('\n'),
        })
        return
      }

      if (
        result.kind === 'clarify' ||
        result.kind === 'cannot' ||
        result.kind === 'chat'
      ) {
        if (result.kind === 'clarify' || result.kind === 'cannot') {
          // Keep pending only if still relevant; clear on cannot
          if (result.kind === 'cannot') setPendingRule(null)
        }
        appendMessage(threadId, {
          id: nextId('a'),
          role: 'assistant',
          content: result.reply,
        })
        return
      }

      if (result.kind === 'execute' && result.rule) {
        if (!owner) {
          setPendingRule(result.rule)
          appendMessage(threadId, {
            id: nextId('a'),
            role: 'assistant',
            content:
              'Order is ready, but you need a connected Devnet wallet. Connect, then reply **yes**.',
          })
          return
        }
        await armAndSettle(
          threadId,
          owner,
          result.rule,
          content,
          result.interpretation,
        )
        return
      }

      appendMessage(threadId, {
        id: nextId('a'),
        role: 'assistant',
        content: result.reply,
      })
    } catch (err) {
      appendMessage(threadId, {
        id: nextId('a'),
        role: 'assistant',
        content: [
          'I couldn’t finish that Autopilot turn.',
          '',
          formatChatError(err),
        ].join('\n'),
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
    <aside
      className={cn(
        'flex flex-col bg-background text-foreground',
        // Mobile: full-screen page over the shell
        'fixed inset-0 z-50',
        // Desktop: layout column — shrinks main content (not an overlay)
        'lg:relative lg:inset-auto lg:z-auto lg:h-svh lg:w-[22.5rem] lg:shrink-0 lg:border-l lg:border-border',
      )}
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
                Autopilot brain: understands natural language, asks if unclear,
                confirms with you, then arms the sell. Uses OpenAI when
                configured.
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
                    Talk to Autopilot
                  </p>
                  <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                    Say what you want in plain English. I’ll clarify, then ask
                    you to confirm before doing anything.
                  </p>
                  <div className="mt-5 flex w-full flex-col gap-2">
                    {starterPrompts.map((prompt) => (
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
  )
}
