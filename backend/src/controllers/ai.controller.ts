import { AppError } from '../errors'
import {
  runAutopilotAgent,
  type AutopilotAgentResult,
} from '../ai/autopilot-agent'
import type { OpenOrderHint } from '../ai/cancel'
import {
  compileNaturalLanguageRule,
  validateEditedRule,
  type CompileResult,
} from '../ai/compile'
import { generateChatReply } from '../ai/llm'
import { rulesController } from './rules.controller'
import type { Bindings } from '../types/env'
import type { AutopilotTurnBody } from '../validators/autopilot'
import type { ChatBody } from '../validators/chat'
import type {
  CompilePromptBody,
  ConfirmRuleBody,
  ValidateCompiledBody,
} from '../validators/compile'
import type { CreateRuleBody } from '../validators/rule'

export type ChatResult =
  { ok: true; reply: string; provider: 'openai' } | { ok: false; error: string }

export const aiController = {
  async compile(
    env: Bindings,
    body: CompilePromptBody,
  ): Promise<CompileResult> {
    return compileNaturalLanguageRule(env, body.prompt, body.holdings)
  },

  async chat(env: Bindings, body: ChatBody): Promise<ChatResult> {
    const result = await generateChatReply(env, {
      message: body.message,
      history: body.history,
      holdings: body.holdings,
      walletConnected: body.walletConnected,
    })

    if (!result.ok) {
      return { ok: false, error: result.reason }
    }

    return { ok: true, reply: result.text, provider: result.provider }
  },

  async autopilotTurn(
    env: Bindings,
    body: AutopilotTurnBody,
  ): Promise<AutopilotAgentResult> {
    const openRules = body.userAddress
      ? await rulesController.listOpen(body.userAddress)
      : []
    const openOrders: OpenOrderHint[] = openRules.map((rule) => ({
      id: rule.id,
      type: rule.type,
      asset: rule.asset,
      payAsset: rule.payAsset,
      value: rule.value,
      unit: rule.unit,
      actionValue: rule.actionValue,
      limitPrice: rule.limitPrice,
      escrowAmount: rule.escrowSellAmount,
      escrowMint: rule.mint,
      prompt: rule.prompt,
    }))

    return runAutopilotAgent(env, {
      message: body.message,
      history: body.history,
      holdings: body.holdings,
      walletConnected: body.walletConnected,
      pendingRule: body.pendingRule,
      pendingRules: body.pendingRules,
      pendingCancelIds: body.pendingCancelIds,
      openOrders,
    })
  },

  validateEdit(body: ValidateCompiledBody): CompileResult {
    return validateEditedRule(body.prompt, body.rule)
  },

  async confirm(body: ConfirmRuleBody) {
    const checked = validateEditedRule(body.prompt, body.rule)
    if (!checked.ok) {
      throw new AppError(400, checked.rejection.message)
    }

    const createBody = toCreateRuleBody(
      body.userAddress,
      body.prompt,
      checked.rule,
      body.status,
    )

    const rule = await rulesController.create(createBody)
    return {
      rule,
      interpretation: checked.interpretation,
      preview: checked.preview,
    }
  },
}

function toCreateRuleBody(
  userAddress: string,
  prompt: string | undefined,
  rule: ConfirmRuleBody['rule'],
  status: 'draft' | 'active',
): CreateRuleBody {
  if (rule.type === 'take_profit' || rule.type === 'stop_loss') {
    return {
      type: rule.type,
      userAddress,
      prompt,
      asset: rule.asset,
      unit: rule.unit,
      value: rule.value,
      actionUnit: rule.actionUnit,
      actionValue: rule.actionValue,
      sellBasis: rule.sellBasis,
      status,
    }
  }

  if (rule.type === 'market_buy' || rule.type === 'limit_buy') {
    return {
      type: rule.type,
      userAddress,
      prompt,
      asset: rule.asset,
      unit: 'amount',
      value: rule.value,
      payAsset: rule.payAsset,
      limitPrice: rule.type === 'limit_buy' ? rule.limitPrice : null,
      status,
    }
  }

  return {
    type: rule.type,
    userAddress,
    prompt,
    asset: rule.asset,
    unit: rule.unit,
    value: rule.value,
    status,
  }
}
