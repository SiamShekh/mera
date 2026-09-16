import type { Bindings } from '../types/env'
import { buildChatSystemPrompt } from './chat-prompt'
import { buildSystemPrompt } from './system-prompt'

export type LlmResult =
  { ok: true; text: string; provider: 'openai' } | { ok: false; reason: string }

export type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** OpenAI-only Autopilot / chat LLM (no Workers AI fallback). */
export async function resolveLlmForAgent(
  env: Bindings,
  messages: ChatMessage[],
  options: {
    temperature?: number
    maxTokens?: number
    json?: boolean
  } = {},
): Promise<LlmResult> {
  return resolveLlm(env, messages, {
    temperature: options.temperature ?? 0.2,
    // Multi-rule portfolio plans need room for a full JSON rules array.
    maxTokens: options.maxTokens ?? 1600,
    json: options.json ?? true,
  })
}

async function resolveLlm(
  env: Bindings,
  messages: ChatMessage[],
  options: { temperature: number; maxTokens: number; json?: boolean },
): Promise<LlmResult> {
  const openaiKey = env.OPENAI_API_KEY?.trim()
  if (!openaiKey) {
    return {
      ok: false,
      reason:
        'OPENAI_API_KEY is missing. Add it to backend/.env (recommended OPENAI_MODEL=gpt-5.6-luna) and restart the server.',
    }
  }

  return callOpenAiChat(openaiKey, env.OPENAI_MODEL, messages, options)
}

export async function generateRuleJson(
  env: Bindings,
  prompt: string,
  holdings?: string[],
): Promise<LlmResult> {
  const system = buildSystemPrompt(holdings)
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ]

  return resolveLlm(env, messages, {
    temperature: 0,
    maxTokens: 500,
    json: true,
  })
}

/** Conversational reply for the Mera AI drawer. */
export async function generateChatReply(
  env: Bindings,
  input: {
    message: string
    history?: ChatTurn[]
    holdings?: string[]
    walletConnected?: boolean
  },
): Promise<LlmResult> {
  const system = buildChatSystemPrompt({
    holdings: input.holdings,
    walletConnected: input.walletConnected,
  })

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...(input.history ?? []).map((turn) => ({
      role: turn.role as 'user' | 'assistant',
      content: turn.content,
    })),
    { role: 'user', content: input.message },
  ]

  return resolveLlm(env, messages, {
    temperature: 0.4,
    maxTokens: 700,
  })
}

async function callOpenAiChat(
  apiKey: string,
  model: string | undefined,
  messages: ChatMessage[],
  options: { temperature: number; maxTokens: number; json?: boolean },
): Promise<LlmResult> {
  const modelId = model?.trim() || 'gpt-5.6-luna'
  const isGpt5Family = /^gpt-5/i.test(modelId)

  try {
    const body: Record<string, unknown> = {
      model: modelId,
      messages,
      ...(options.json ? { response_format: { type: 'json_object' } } : {}),
    }

    // GPT-5+ chat completions use max_completion_tokens; older models use max_tokens.
    if (isGpt5Family) {
      body.max_completion_tokens = options.maxTokens
      body.reasoning_effort = 'none'
    } else {
      body.max_tokens = options.maxTokens
      body.temperature = options.temperature
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const detail = await response.text()
      return {
        ok: false,
        reason: `OpenAI error ${response.status}: ${detail.slice(0, 300)}`,
      }
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
    }
    const text = data.choices?.[0]?.message?.content
    if (!text || !String(text).trim()) {
      return { ok: false, reason: 'OpenAI returned an empty response.' }
    }

    return { ok: true, text: String(text), provider: 'openai' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return { ok: false, reason: `OpenAI request failed: ${message}` }
  }
}

/** Extract a JSON object from model output (strips markdown fences if present). */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  return JSON.parse(candidate) as unknown
}
