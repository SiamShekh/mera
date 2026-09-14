import type { Bindings } from '../types/env'
import { buildChatSystemPrompt } from './chat-prompt'
import { buildSystemPrompt } from './system-prompt'

/** Default free-tier Workers AI chat model (fast variant; non-fast IDs are deprecated). */
const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'

export type LlmResult =
  | { ok: true; text: string; provider: 'openai' | 'workers_ai' }
  | { ok: false; reason: string }

export type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Prefer Cloudflare Workers AI (free daily neurons).
 * OpenAI is only used when OPENAI_API_KEY is set and Workers AI is unavailable.
 */
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

  if (env.AI) {
    const workers = await callWorkersAiChat(env.AI, messages, {
      maxTokens: 500,
      temperature: 0,
      model: env.WORKERS_AI_MODEL,
    })
    if (workers.ok) {
      return workers
    }
    if (!env.OPENAI_API_KEY) {
      return workers
    }
  }

  if (env.OPENAI_API_KEY) {
    return callOpenAiChat(env.OPENAI_API_KEY, env.OPENAI_MODEL, messages, {
      temperature: 0,
      maxTokens: 500,
      json: true,
    })
  }

  return {
    ok: false,
    reason:
      'No AI provider configured. Enable the Workers AI binding in wrangler.toml (and `wrangler login`), or set OPENAI_API_KEY.',
  }
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

  if (env.AI) {
    const workers = await callWorkersAiChat(env.AI, messages, {
      maxTokens: 700,
      temperature: 0.4,
      model: env.WORKERS_AI_MODEL,
    })
    if (workers.ok) {
      return workers
    }
    if (!env.OPENAI_API_KEY) {
      return workers
    }
  }

  if (env.OPENAI_API_KEY) {
    return callOpenAiChat(env.OPENAI_API_KEY, env.OPENAI_MODEL, messages, {
      temperature: 0.4,
      maxTokens: 700,
    })
  }

  return {
    ok: false,
    reason:
      'No AI provider configured. Enable the Workers AI binding in wrangler.toml (and `wrangler login`), or set OPENAI_API_KEY.',
  }
}

async function callOpenAiChat(
  apiKey: string,
  model: string | undefined,
  messages: ChatMessage[],
  options: { temperature: number; maxTokens: number; json?: boolean },
): Promise<LlmResult> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        messages,
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      return {
        ok: false,
        reason: `OpenAI error ${response.status}: ${detail.slice(0, 200)}`,
      }
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = data.choices?.[0]?.message?.content
    if (!text) {
      return { ok: false, reason: 'OpenAI returned an empty response.' }
    }

    return { ok: true, text, provider: 'openai' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return { ok: false, reason: `OpenAI request failed: ${message}` }
  }
}

async function callWorkersAiChat(
  ai: Ai,
  messages: ChatMessage[],
  options: { maxTokens: number; temperature: number; model?: string },
): Promise<LlmResult> {
  const model = options.model?.trim() || DEFAULT_WORKERS_AI_MODEL

  try {
    // Model id is configurable; cast keeps Wrangler Ai typings happy.
    const result = await ai.run(
      model as '@cf/meta/llama-3.1-8b-instruct-fast',
      {
        messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
      },
    )

    const text =
      typeof result === 'string'
        ? result
        : result && typeof result === 'object' && 'response' in result
          ? String((result as { response: unknown }).response)
          : null

    if (!text) {
      return { ok: false, reason: 'Workers AI returned an empty response.' }
    }

    return { ok: true, text, provider: 'workers_ai' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return { ok: false, reason: `Workers AI failed: ${message}` }
  }
}

/** Extract a JSON object from model output (strips markdown fences if present). */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  return JSON.parse(candidate) as unknown
}
