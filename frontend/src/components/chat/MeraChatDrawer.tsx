import { useConnectedWallet } from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, EllipsisVertical, History, Trash2, X } from 'lucide-react'

import { useMeraAi } from '@/components/chat/MeraAiContext'
import { ChatMarkdown, stripMarkdown } from '@/components/chat/ChatMarkdown'
import { PROJECT_LOGO_URL } from '@/components/deposit/DepositQr'
import { Button } from '@/components/ui/button'
import type { AppClient } from '@/lib/solanaClient'
import { cn } from '@/lib/utils'
import {
  useAppendChatMessageMutation,
  useArmAutopilotMutation,
  useAutopilotTurnMutation,
  useConfirmRuleMutation,
  useCreateChatThreadMutation,
  useDeleteChatThreadMutation,
  useLazyGetChatThreadQuery,
  useLazyListChatThreadsQuery,
  useSwapConfigQuery,
} from '@/store/api'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadPortfolio } from '@/store/portfolioSlice'
import { sendHoldingTransfer } from '@/lib/sendTransfer'
import { requestPortfolioRefresh } from '@/lib/portfolioRefresh'
import type { CompiledRule } from '@/types/api'
import { isBuySideRule, isSellSideRule } from '@/types/api'
import type { Holding } from '@/types/holding'

type DrawerView = 'chat' | 'history'
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

function MiraAvatar({
  className,
  size = 'sm',
}: {
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-lime',
        size === 'md' ? 'size-8' : 'size-7',
        className,
      )}
    >
      <img
        src={PROJECT_LOGO_URL}
        alt="Mera"
        className="size-full object-cover"
      />
    </span>
  )
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

function formatRelativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) {
    return 'Just now'
  }
  const deltaSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (deltaSec < 45) return 'Just now'
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`
  if (deltaSec < 604800) return `${Math.floor(deltaSec / 86400)}d ago`
  return new Date(then).toLocaleDateString()
}

/** Join chat sections with blank lines so Markdown paragraphs/lists render. */
function joinChatBlocks(
  parts: Array<string | null | undefined | false>,
): string {
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join('\n\n')
}

function nextId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
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
      error?: string | { status?: number; data?: { error?: string; message?: string } }
      message?: string
      status?: number
    }
    const fromData =
      record.data?.error ??
      record.data?.message ??
      (typeof record.error === 'object'
        ? (record.error?.data?.error ?? record.error?.data?.message)
        : null) ??
      (typeof record.error === 'string' ? record.error : null)
    if (fromData && String(fromData).trim()) {
      const msg = String(fromData)
      if (/internal server error/i.test(msg) || msg === 'Internal Server Error') {
        return 'Couldn’t save or arm the order. Please try again in a moment.'
      }
      return msg
    }
    if (record.message && String(record.message).trim()) {
      return String(record.message)
    }
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return 'Something went wrong while arming Autopilot. Please try again.'
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
  const { open, closeChat, consumeDraftPrefill } = useMeraAi()
  const client = useClient<AppClient>()
  const connected = useConnectedWallet(client)
  const dispatch = useAppDispatch()
  const holdings = useAppSelector((state) => state.portfolio.holdings)
  const [autopilotTurn] = useAutopilotTurnMutation()
  const [confirmRule] = useConfirmRuleMutation()
  const [armAutopilot] = useArmAutopilotMutation()
  const [createChatThread] = useCreateChatThreadMutation()
  const [appendChatMessage] = useAppendChatMessageMutation()
  const [deleteChatThread] = useDeleteChatThreadMutation()
  const [listChatThreads] = useLazyListChatThreadsQuery()
  const [getChatThread] = useLazyGetChatThreadQuery()
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
  const [historyLoading, setHistoryLoading] = useState(false)
  const [menuThreadId, setMenuThreadId] = useState<string | null>(null)
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null)
  const [pendingRules, setPendingRules] = useState<CompiledRule[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeIdRef = useRef(activeId)
  const threadRemapRef = useRef<Map<string, string>>(new Map())
  const historyMenuRef = useRef<HTMLDivElement>(null)
  activeIdRef.current = activeId

  const active = threads.find((t) => t.id === activeId) ?? threads[0]
  const ownerAddress = connected?.account.address

  // Load persisted threads when a wallet connects.
  useEffect(() => {
    if (!ownerAddress) {
      return
    }
    let cancelled = false
    setHistoryLoading(true)
    void (async () => {
        try {
          const listed = await listChatThreads({
            userAddress: ownerAddress,
          }).unwrap()
          if (cancelled) return

          if (listed.threads.length === 0) {
            const created = await createChatThread({
              userAddress: ownerAddress,
            }).unwrap()
            if (cancelled) return
            setThreads([
              {
                id: created.thread.id,
                title: created.thread.title,
                updatedAt: formatRelativeTime(created.thread.updatedAt),
                messages: [],
              },
            ])
            setActiveId(created.thread.id)
            return
          }

          const loaded = await Promise.all(
            listed.threads.map(async (summary) => {
              const { thread } = await getChatThread({
                id: summary.id,
                userAddress: ownerAddress,
              }).unwrap()
              return {
                id: thread.id,
                title: thread.title,
                updatedAt: formatRelativeTime(thread.updatedAt),
                messages: thread.messages.map((message) => ({
                  id: message.id,
                  role: message.role,
                  content: message.content,
                })),
              } satisfies Thread
            }),
          )
          if (cancelled) return
          setThreads(loaded)
          setActiveId(loaded[0]?.id ?? activeIdRef.current)
        } catch {
          // Keep in-memory threads if history API is unavailable.
        } finally {
          if (!cancelled) {
            setHistoryLoading(false)
          }
        }
      })()
    return () => {
      cancelled = true
    }
  }, [ownerAddress, listChatThreads, getChatThread, createChatThread])

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

  useEffect(() => {
    if (!menuThreadId) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (historyMenuRef.current?.contains(target)) {
        return
      }
      setMenuThreadId(null)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuThreadId(null)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuThreadId])

  async function startNewChat() {
    const owner = connected?.account.address
    if (owner) {
      try {
        const created = await createChatThread({
          userAddress: owner,
        }).unwrap()
        setThreads((prev) => [
          {
            id: created.thread.id,
            title: created.thread.title,
            updatedAt: formatRelativeTime(created.thread.updatedAt),
            messages: [],
          },
          ...prev,
        ])
        setActiveId(created.thread.id)
        setView('chat')
        setDraft('')
        setPendingRules([])
        window.setTimeout(() => {
          inputRef.current?.focus()
        }, 50)
        return
      } catch {
        // Fall through to local-only thread.
      }
    }

    const id = nextId()
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
    setPendingRules([])
    window.setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
  }

  async function deleteThread(threadId: string) {
    if (deletingThreadId) {
      return
    }
    setMenuThreadId(null)
    setDeletingThreadId(threadId)

    const remaining = threads.filter((thread) => thread.id !== threadId)
    const wasActive = activeIdRef.current === threadId
    const owner = connected?.account.address

    try {
      if (owner && isUuid(threadId)) {
        await deleteChatThread({ id: threadId, userAddress: owner }).unwrap()
      }
    } catch {
      setDeletingThreadId(null)
      return
    }

    if (remaining.length > 0) {
      setThreads(remaining)
      if (wasActive) {
        setActiveId(remaining[0]!.id)
      }
      setDeletingThreadId(null)
      return
    }

    // Always leave at least one empty chat after deleting the last thread.
    if (owner) {
      try {
        const created = await createChatThread({
          userAddress: owner,
        }).unwrap()
        setThreads([
          {
            id: created.thread.id,
            title: created.thread.title,
            updatedAt: formatRelativeTime(created.thread.updatedAt),
            messages: [],
          },
        ])
        setActiveId(created.thread.id)
        setPendingRules([])
        setDeletingThreadId(null)
        return
      } catch {
        // Fall through to local empty thread.
      }
    }

    const id = nextId()
    setThreads([
      {
        id,
        title: 'New chat',
        updatedAt: 'Just now',
        messages: [],
      },
    ])
    setActiveId(id)
    setPendingRules([])
    setDeletingThreadId(null)
  }

  async function appendMessage(
    threadId: string,
    message: ChatMessage,
  ): Promise<string> {
    const resolvedId = threadRemapRef.current.get(threadId) ?? threadId
    let nextTitle: string | undefined
    setThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== resolvedId) {
          return thread
        }
        const title =
          thread.title === 'New chat' && message.role === 'user'
            ? message.content.slice(0, 40) || 'New chat'
            : thread.title
        if (title !== thread.title) {
          nextTitle = title
        }
        return {
          ...thread,
          title,
          updatedAt: 'Just now',
          messages: [...thread.messages, message],
        }
      }),
    )

    const owner = connected?.account.address
    if (!owner) {
      return resolvedId
    }

    try {
      let remoteId = resolvedId
      if (!isUuid(resolvedId)) {
        const created = await createChatThread({
          userAddress: owner,
          title: nextTitle,
        }).unwrap()
        remoteId = created.thread.id
        threadRemapRef.current.set(threadId, remoteId)
        threadRemapRef.current.set(resolvedId, remoteId)
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === resolvedId
              ? {
                ...thread,
                id: remoteId,
                title: nextTitle ?? created.thread.title,
                updatedAt: formatRelativeTime(created.thread.updatedAt),
              }
              : thread,
          ),
        )
        if (activeIdRef.current === resolvedId || activeIdRef.current === threadId) {
          setActiveId(remoteId)
        }
      }

      const saved = await appendChatMessage({
        threadId: remoteId,
        userAddress: owner,
        role: message.role,
        content: message.content,
        id: isUuid(message.id) ? message.id : undefined,
        title: nextTitle,
      }).unwrap()

      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === remoteId
            ? {
              ...thread,
              title: saved.thread.title,
              updatedAt: formatRelativeTime(saved.thread.updatedAt),
            }
            : thread,
        ),
      )
      return remoteId
    } catch {
      return resolvedId
    }
  }

  async function armAndSettle(
    threadId: string,
    owner: string,
    rules: CompiledRule[],
    prompt: string,
    interpretation: string | null,
  ) {
    const signer = connected?.signer
    const treasury = swapConfig?.treasury

    if (!signer) {
      await appendMessage(threadId, {
        id: nextId(),
        role: 'assistant',
        content:
          'I understand the plan, but I need a connected wallet to approve any escrows. Connect a wallet and reply **yes** again.',
      })
      return
    }
    if (!treasury) {
      await appendMessage(threadId, {
        id: nextId(),
        role: 'assistant',
        content:
          'I can’t arm Autopilot yet — swap is temporarily unavailable. Try again later.',
      })
      return
    }

    const activated: string[] = []
    const sellRules = rules.filter(isSellSideRule)
    const buyRules = rules.filter(isBuySideRule)
    const guardRules = rules.filter(
      (rule) => !isSellSideRule(rule) && !isBuySideRule(rule),
    )

    for (const rule of guardRules) {
      await confirmRule({
        userAddress: owner,
        prompt,
        rule,
        status: 'active',
      }).unwrap()
      activated.push(
        rule.type === 'max_allocation'
          ? `Cap ${rule.asset} at ${rule.value}${rule.unit === 'percent' ? '%' : ' USD'}`
          : `Floor ${rule.asset} at ${rule.value}${rule.unit === 'percent' ? '%' : ' USD'}`,
      )
    }

    if (sellRules.length === 0 && buyRules.length === 0) {
      setPendingRules([])
      await appendMessage(threadId, {
        id: nextId(),
        role: 'assistant',
        content: joinChatBlocks([
          `**Portfolio plan activated** (${activated.length} rule${activated.length === 1 ? '' : 's'})`,
          interpretation ?? activated.map((line) => `- ${line}`).join('\n'),
          'Allocation guards are live — Autopilot will rebalance into USDC when breached.',
        ]),
      })
      return
    }

    let liveHoldings = holdings
    try {
      const loaded = await dispatch(loadPortfolio(owner)).unwrap()
      liveHoldings = loaded.holdings
    } catch {
      // Fall back to whatever Redux already has
    }

    const tokenPrice = (symbol: string): number => {
      const fromSwap = swapConfig?.tokens.find(
        (t) => t.symbol.toUpperCase() === symbol.toUpperCase(),
      )?.priceUsd
      if (fromSwap && fromSwap > 0) return fromSwap
      const fromHold = liveHoldings.find(
        (h) => normalizeHoldingSymbol(h.asset) === normalizeHoldingSymbol(symbol),
      )?.price
      return fromHold && fromHold > 0 ? fromHold : 0
    }

    for (const rule of sellRules) {
      const holding = findSellHolding(liveHoldings, rule.asset)
      if (!holding || holding.quantity <= 0) {
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: joinChatBlocks([
            `I still can’t see **${rule.asset}** in the connected wallet.`,
            liveHoldings.length === 0
              ? 'Holdings didn’t load — open **Spot**, confirm your wallet is connected, then reply **yes** again.'
              : `I see: ${liveHoldings.map((row) => `${row.asset} ${row.quantity}`).join(', ') || 'nothing'}. Deposit **${rule.asset}** to your wallet, then reply **yes**.`,
          ]),
        })
        return
      }
      if (!holding.tokenProgram || holding.mint === 'native') {
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content:
            'Autopilot sells need an SPL token (e.g. NVDAx), not native SOL.',
        })
        return
      }

      const sized = computeSellUiAmount(holding, rule)
      if (!(sized.uiNumber > 0)) {
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: `I couldn’t size the **${rule.asset}** sell from your balance. Check the amount and try again.`,
        })
        return
      }

      try {
        // Persist the rule BEFORE escrow so a DB failure cannot lock tokens.
        const confirmed = await confirmRule({
          userAddress: owner,
          prompt,
          rule,
          status: 'active',
        }).unwrap()

        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: `Approve in your wallet to lock **${sized.uiNumber} ${holding.asset}** for Autopilot (${rule.type === 'stop_loss' ? 'stop-loss' : 'sell'}).`,
        })

        const depositSignature = await sendHoldingTransfer({
          client,
          signer,
          holding,
          recipient: treasury,
          uiAmount: sized.uiAmount,
        })

        const armed = await armAutopilot({
          ruleId: confirmed.rule.id,
          userAddress: owner,
          sellMint: holding.mint,
          sellAmount: sized.uiNumber,
          depositSignature,
        }).unwrap()

        activated.push(
          armed.settledNow
            ? `${rule.asset} ${rule.type} filled now`
            : `${rule.asset} ${rule.type} armed — ${armed.reason}`,
        )
      } catch (err) {
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: joinChatBlocks([
            '**Wallet approval or arming failed**',
            formatChatError(err),
            activated.length > 0
              ? `Already activated: ${activated.join('; ')}.`
              : 'If you already signed a deposit, your tokens may be in treasury — reply **yes** again only after checking Spot balances.',
          ]),
        })
        return
      }
    }

    for (const rule of buyRules) {
      const payHolding = findSellHolding(liveHoldings, rule.payAsset)
      if (!payHolding || payHolding.quantity <= 0) {
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: joinChatBlocks([
            `I can’t fund the buy — no **${rule.payAsset}** in your wallet.`,
            `I see: ${liveHoldings.map((row) => `${row.asset} ${row.quantity}`).join(', ') || 'nothing'}. Deposit **${rule.payAsset}** to your wallet, then reply **yes**.`,
          ]),
        })
        return
      }
      if (!payHolding.tokenProgram || payHolding.mint === 'native') {
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: 'Buys need an SPL pay asset (usually USDC), not native SOL.',
        })
        return
      }

      const buyPx =
        rule.type === 'limit_buy' && rule.limitPrice != null && rule.limitPrice > 0
          ? rule.limitPrice
          : tokenPrice(rule.asset)
      const payPx = tokenPrice(rule.payAsset) || (rule.payAsset.toUpperCase() === 'USDC' ? 1 : 0)
      if (!(buyPx > 0) || !(payPx > 0)) {
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: `I couldn’t price **${rule.asset}** / **${rule.payAsset}** to size the buy escrow. Try again in a moment.`,
        })
        return
      }

      const payUsd = rule.value * buyPx
      const payUiNumber = payUsd / payPx
      if (!(payUiNumber > 0) || payUiNumber > payHolding.quantity + 1e-9) {
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: `Not enough **${rule.payAsset}** — need ~${payUiNumber.toFixed(4)} for ${rule.value} ${rule.asset}, you have ${payHolding.quantity}.`,
        })
        return
      }

      const decimals = Math.min(Math.max(payHolding.decimals, 0), 9)
      const payUiAmount = payUiNumber.toFixed(decimals)

      try {
        // Persist the buy rule BEFORE escrow so a DB failure cannot lock USDC.
        const confirmed = await confirmRule({
          userAddress: owner,
          prompt,
          rule,
          status: 'active',
        }).unwrap()

        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: `Approve in your wallet to lock **${payUiAmount} ${payHolding.asset}** to buy **${rule.value} ${rule.asset}** (${rule.type === 'limit_buy' ? `limit ≤ $${rule.limitPrice}` : 'market'}).`,
        })

        const depositSignature = await sendHoldingTransfer({
          client,
          signer,
          holding: payHolding,
          recipient: treasury,
          uiAmount: payUiAmount,
        })

        const armed = await armAutopilot({
          ruleId: confirmed.rule.id,
          userAddress: owner,
          sellMint: payHolding.mint,
          sellAmount: Number(payUiAmount),
          depositSignature,
        }).unwrap()

        activated.push(
          armed.settledNow
            ? armed.execution?.note ??
            `Bought ${armed.execution?.buyAmount ?? rule.value} ${rule.asset} now`
            : `${rule.asset} ${rule.type} armed — ${armed.reason}`,
        )

        // Refresh balances for subsequent ladder legs + Spot / portfolio UI
        try {
          await new Promise((r) => setTimeout(r, 400))
          const loaded = await dispatch(loadPortfolio(owner)).unwrap()
          liveHoldings = loaded.holdings
        } catch {
          // keep previous
        }
      } catch (err) {
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: joinChatBlocks([
            '**Wallet approval or buy arming failed**',
            formatChatError(err),
            activated.length > 0
              ? `Already activated: ${activated.join('; ')}.`
              : 'No tokens were locked if you never approved the wallet prompt. Fix the error, then reply **yes** to retry.',
          ]),
        })
        return
      }
    }

    // Force portfolio + Spot balances to refresh after fills
    try {
      await new Promise((r) => setTimeout(r, 600))
      await dispatch(loadPortfolio(owner)).unwrap()
    } catch {
      void dispatch(loadPortfolio(owner))
    }
    requestPortfolioRefresh()
    setPendingRules([])
    await appendMessage(threadId, {
      id: nextId(),
      role: 'assistant',
      content: joinChatBlocks([
        `**Portfolio plan activated** (${activated.length} step${activated.length === 1 ? '' : 's'})`,
        interpretation,
        activated.map((line) => `- ${line}`).join('\n'),
      ]),
    })
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

    await appendMessage(threadId, {
      id: nextId(),
      role: 'user',
      content,
    })
    setDraft('')
    setTyping(true)

    try {
      if (looksLikeDeployIntent(content)) {
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: joinChatBlocks([
            'Deploying / linking the **Portfolio PDA** isn’t an Autopilot sell rule.',
            'For sells, just tell me what to sell in plain English and I’ll confirm with you first.',
          ]),
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
        pendingRules,
        pendingRule: pendingRules[0] ?? null,
      }).unwrap()

      if (!result.ok) {
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: `I couldn’t reach Autopilot AI right now. ${result.error}`,
        })
        return
      }

      const planRules =
        result.rules && result.rules.length > 0
          ? result.rules
          : result.rule
            ? [result.rule]
            : []

      if (result.kind === 'propose' && planRules.length > 0) {
        setPendingRules(planRules)
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: joinChatBlocks([
            result.reply,
            result.interpretation
              ? `**Plan draft (${planRules.length} rule${planRules.length === 1 ? '' : 's'}):** ${result.interpretation}`
              : null,
            'Reply **yes** to confirm, or tell me what to change.',
          ]),
        })
        return
      }

      if (
        result.kind === 'clarify' ||
        result.kind === 'cannot' ||
        result.kind === 'chat'
      ) {
        if (result.kind === 'cannot') setPendingRules([])
        await appendMessage(threadId, {
          id: nextId(),
          role: 'assistant',
          content: result.reply,
        })
        return
      }

      if (result.kind === 'execute' && planRules.length > 0) {
        if (!owner) {
          setPendingRules(planRules)
          await appendMessage(threadId, {
            id: nextId(),
            role: 'assistant',
            content:
              'Plan is ready, but you need a connected wallet. Connect, then reply **yes**.',
          })
          return
        }
        await armAndSettle(
          threadId,
          owner,
          planRules,
          content,
          result.interpretation,
        )
        return
      }

      await appendMessage(threadId, {
        id: nextId(),
        role: 'assistant',
        content: result.reply,
      })
    } catch (err) {
      await appendMessage(threadId, {
        id: nextId(),
        role: 'assistant',
        content: joinChatBlocks([
          'I couldn’t finish that Autopilot turn.',
          formatChatError(err),
        ]),
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

  const title = view === 'history' ? 'History' : 'Mera AI'

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
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground capitalize">
              {view === 'chat' ? (active?.title ?? title) : title}
            </p>
            {view === 'chat' ? (
              <p className="text-[11px] text-muted-foreground">Autopilot</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {view === 'chat' ? (
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
              <li key={thread.id} className="relative">
                <div
                  className={cn(
                    'flex items-start gap-1 rounded-2xl px-2 py-2 transition',
                    thread.id === activeId
                      ? 'bg-secondary'
                      : 'hover:bg-secondary/70',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuThreadId(null)
                      setActiveId(thread.id)
                      setView('chat')
                    }}
                    className="min-w-0 flex-1 cursor-pointer rounded-xl px-1.5 py-1 text-left"
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
                      {thread.messages.length > 0
                        ? stripMarkdown(
                          thread.messages[thread.messages.length - 1]!
                            .content,
                        ) || 'Empty chat'
                        : 'Empty chat'}
                    </p>
                  </button>

                  <div
                    className="relative shrink-0"
                    ref={
                      menuThreadId === thread.id ? historyMenuRef : undefined
                    }
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-xl text-muted-foreground hover:text-foreground"
                      aria-label="Chat options"
                      aria-haspopup="menu"
                      aria-expanded={menuThreadId === thread.id}
                      disabled={deletingThreadId === thread.id}
                      onClick={(event) => {
                        event.stopPropagation()
                        setMenuThreadId((current) =>
                          current === thread.id ? null : thread.id,
                        )
                      }}
                    >
                      <EllipsisVertical className="size-4" />
                    </Button>

                    {menuThreadId === thread.id ? (
                      <div
                        role="menu"
                        className="absolute right-0 top-9 z-20 min-w-[9.5rem] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-md"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-secondary"
                          disabled={deletingThreadId === thread.id}
                          onClick={(event) => {
                            event.stopPropagation()
                            void deleteThread(thread.id)
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          {deletingThreadId === thread.id
                            ? 'Deleting…'
                            : 'Delete chat'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view === 'chat' ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
            {historyLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
                <MiraAvatar className="mb-3" size="md" />
                <p className="text-sm text-muted-foreground">
                  Loading chat history…
                </p>
              </div>
            ) : active && active.messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
                <div className="mb-3 flex size-11 items-center justify-center overflow-hidden rounded-2xl bg-lime/20">
                  <img
                    src={PROJECT_LOGO_URL}
                    alt="Mera"
                    className="size-9 object-contain"
                  />
                </div>
                <p className="text-base font-semibold text-foreground">
                  Talk to Autopilot
                </p>
                <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                  Say what you want in natural language, and AI will convert it
                  into a program.
                </p>
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
                    <MiraAvatar />
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
