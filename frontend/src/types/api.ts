export type RuleUnit = 'percent' | 'amount'
export type RuleStatus = 'draft' | 'active' | 'paused'
export type RuleType = 'max_allocation' | 'min_allocation' | 'take_profit'

export type User = {
  address: string
  createdAt: string
}

export type UpsertUserResponse = {
  user: User
}

export type Rule = {
  id: string
  userAddress: string
  prompt: string | null
  type: RuleType
  asset: string
  unit: RuleUnit
  value: number
  actionUnit: RuleUnit | null
  actionValue: number | null
  sellBasis: 'position' | 'portfolio' | null
  status: RuleStatus
  createdAt: string
  updatedAt: string
}

export type CreateRuleBody =
  | {
      type: 'max_allocation' | 'min_allocation'
      userAddress: string
      asset: string
      unit: RuleUnit
      value: number
      prompt?: string
      status?: RuleStatus
    }
  | {
      type: 'take_profit'
      userAddress: string
      asset: string
      unit: RuleUnit
      value: number
      actionUnit: RuleUnit
      actionValue: number
      sellBasis?: 'position' | 'portfolio'
      prompt?: string
      status?: RuleStatus
    }

export type CompiledRule =
  | {
      type: 'max_allocation' | 'min_allocation'
      asset: string
      unit: RuleUnit
      value: number
    }
  | {
      type: 'take_profit'
      asset: string
      unit: RuleUnit
      value: number
      actionUnit: RuleUnit
      actionValue: number
      sellBasis: 'position' | 'portfolio'
    }

export type RulePreview = {
  type: RuleType
  asset: string
  summary: string
  fields: Record<string, string | number>
}

export type CompileSuccess = {
  ok: true
  source: 'ai' | 'fallback'
  provider?: 'openai'
  rule: CompiledRule
  interpretation: string
  preview: RulePreview
  prompt: string
}

export type CompileFailure = {
  ok: false
  source: 'ai' | 'fallback' | 'validation'
  rejection: {
    code:
      | 'ambiguous'
      | 'unsafe'
      | 'unsupported'
      | 'invalid_percent'
      | 'missing_details'
    message: string
  }
  prompt: string
  providerError?: string
}

export type CompileResult = CompileSuccess | CompileFailure

export type ConfirmRuleResponse = {
  rule: Rule
  interpretation: string
  preview: RulePreview
}

export type ChatMessageTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatRequest = {
  message: string
  history?: ChatMessageTurn[]
  holdings?: string[]
  walletConnected?: boolean
}

export type AutopilotTurnRequest = {
  message: string
  history?: ChatMessageTurn[]
  holdings?: Array<{ symbol: string; quantity: number; priceUsd: number }>
  walletConnected?: boolean
  pendingRule?: CompiledRule | null
}

export type AutopilotTurnResult =
  | {
      ok: true
      kind: 'clarify' | 'propose' | 'cannot' | 'chat' | 'execute'
      reply: string
      rule: CompiledRule | null
      interpretation: string | null
      provider: 'openai'
    }
  | { ok: false; error: string }

export type ChatSuccess = {
  ok: true
  reply: string
  provider: 'openai'
}

export type ChatFailure = {
  ok: false
  error: string
}

export type ChatResult = ChatSuccess | ChatFailure

export type SwapTokenInfo = {
  symbol: string
  mint: string
  decimals: number
  priceUsd: number
}

export type SwapConfigResponse = {
  ready: boolean
  treasury: string | null
  tokens: SwapTokenInfo[]
  network: 'devnet'
}

export type SwapCompleteRequest = {
  userAddress: string
  sellMint: string
  buyMint: string
  sellAmount: number
  depositSignature: string
}

export type SwapCompleteResponse = {
  ok: true
  buyAmount: number
  payoutSignature: string | null
  replay: boolean
}

export type SwapFaucetResponse = {
  ok: true
  signature: string
}

export type LivePrice = {
  mint: string
  symbol: string
  priceUsd: number
  anchorUsd: number
  changePct: number
  updatedAt: string
}

export type PriceBook = {
  updatedAt: string | null
  prices: LivePrice[]
  ticks: Array<{
    mint: string
    symbol: string
    priceUsd: number
    changePct: number
    createdAt: string
  }>
}

export type KeeperTickResponse = {
  dryRun: boolean
  evaluated: number
  actionable: Array<{
    ruleId: string
    type: string
    asset: string
    reason: string
    triggered: boolean
    assetValueUsd?: number
    portfolioValueUsd?: number
    profitPercent?: number
  }>
  executions?: Array<{
    ruleId: string
    asset: string
    soldAmount: number
    buyAmount: number
    buySymbol: string
    txid: string | null
    note: string
  }>
  skipped: number
  pricesUpdatedAt: string | null
  note: string
}

export type ArmAutopilotResponse = {
  armed: boolean
  settledNow: boolean
  reason: string
  execution: {
    ruleId: string
    asset: string
    soldAmount: number
    buyAmount: number
    buySymbol: string
    txid: string | null
    note: string
  } | null
  rule: Rule
}
