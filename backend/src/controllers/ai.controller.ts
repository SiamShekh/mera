import { HTTPException } from 'hono/http-exception'

import {
  compileNaturalLanguageRule,
  validateEditedRule,
  type CompileResult,
} from '../ai/compile'
import { generateChatReply } from '../ai/llm'
import type { Db } from '../db'
import { rulesController } from './rules.controller'
import type { Bindings } from '../types/env'
import type { ChatBody } from '../validators/chat'
import type {
  CompilePromptBody,
  ConfirmRuleBody,
  ValidateCompiledBody,
} from '../validators/compile'
import type { CreateRuleBody } from '../validators/rule'

export type ChatResult =
  | { ok: true; reply: string; provider: 'openai' | 'workers_ai' }
  | { ok: false; error: string }

export const aiController = {
  /** 7.02 compile + validations + preview (+ 7.14 fallback). */
  async compile(
    env: Bindings,
    body: CompilePromptBody,
  ): Promise<CompileResult> {
    return compileNaturalLanguageRule(env, body.prompt, body.holdings)
  },

  /** In-app Mera AI assistant (hackathon-scoped chat). */
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

  /** 7.11 edit → re-validate without saving. */
  validateEdit(body: ValidateCompiledBody): CompileResult {
    return validateEditedRule(body.prompt, body.rule)
  },

  /**
   * 7.12 confirm + 7.13 save — persist compiled rule after user approval.
   * Saves as draft or active based on body.status.
   */
  async confirm(db: Db, body: ConfirmRuleBody) {
    const checked = validateEditedRule(body.prompt, body.rule)
    if (!checked.ok) {
      throw new HTTPException(400, {
        message: checked.rejection.message,
      })
    }

    const createBody = toCreateRuleBody(
      body.userAddress,
      body.prompt,
      checked.rule,
      body.status,
    )

    const rule = await rulesController.create(db, createBody)
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
  if (rule.type === 'take_profit') {
    return {
      type: 'take_profit',
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
