import { interpretRule } from './interpret'
import { fallbackCompile } from './fallback'
import { extractJsonObject, generateRuleJson } from './llm'
import type { Bindings } from '../types/env'
import {
  compiledRuleSchema,
  llmCompileOutputSchema,
  type CompiledRule,
  type CompiledRuleRejection,
} from '../validators/compile'

export type RulePreview = {
  type: CompiledRule['type']
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
  rejection: CompiledRuleRejection['rejection']
  prompt: string
  providerError?: string
}

export type CompileResult = CompileSuccess | CompileFailure

/**
 * 7.02–7.14 orchestration:
 * NL prompt → LLM (or fallback) → schema/asset/%/safety validation → preview.
 */
export async function compileNaturalLanguageRule(
  env: Bindings,
  prompt: string,
  holdings?: string[],
): Promise<CompileResult> {
  const llm = await generateRuleJson(env, prompt, holdings)

  if (llm.ok) {
    const fromAi = parseAndValidate(llm.text, prompt, 'ai', llm.provider)
    if (fromAi.ok) return fromAi

    // If the model rejects or returns invalid JSON, still try deterministic
    // patterns (e.g. absolute-price sells) before surfacing the AI rejection.
    const fallback = fallbackCompile(prompt)
    if (!('rejection' in fallback)) {
      return toCompileResult(fallback, prompt, 'fallback', undefined, llm.provider)
    }

    if (fromAi.source === 'ai') return fromAi
  }

  const fallback = fallbackCompile(prompt)
  return toCompileResult(
    fallback,
    prompt,
    'fallback',
    llm.ok ? undefined : llm.reason,
  )
}

/** Re-validate an edited rule (7.11) and rebuild interpretation/preview. */
export function validateEditedRule(
  prompt: string | undefined,
  ruleInput: unknown,
): CompileResult {
  const parsed = compiledRuleSchema.safeParse(ruleInput)
  if (!parsed.success) {
    return {
      ok: false,
      source: 'validation',
      prompt: prompt ?? '',
      rejection: {
        code: 'missing_details',
        message:
          parsed.error.issues[0]?.message ?? 'Edited rule failed validation.',
      },
    }
  }

  return {
    ok: true,
    source: 'fallback',
    rule: parsed.data,
    interpretation: interpretRule(parsed.data, prompt),
    preview: buildPreview(parsed.data),
    prompt: prompt ?? '',
  }
}

function parseAndValidate(
  rawText: string,
  prompt: string,
  source: 'ai',
  provider: 'openai',
): CompileResult {
  let json: unknown
  try {
    json = extractJsonObject(rawText)
  } catch {
    return {
      ok: false,
      source: 'validation',
      prompt,
      providerError: 'Model did not return valid JSON.',
      rejection: {
        code: 'unsupported',
        message: 'Model did not return valid JSON.',
      },
    }
  }

  const parsed = llmCompileOutputSchema.safeParse(json)
  if (!parsed.success) {
    return {
      ok: false,
      source: 'validation',
      prompt,
      providerError: parsed.error.issues[0]?.message,
      rejection: {
        code: 'missing_details',
        message:
          parsed.error.issues[0]?.message ??
          'Compiled output failed schema validation.',
      },
    }
  }

  return toCompileResult(parsed.data, prompt, source, undefined, provider)
}

function toCompileResult(
  output: CompiledRule | CompiledRuleRejection,
  prompt: string,
  source: 'ai' | 'fallback',
  providerError?: string,
  provider?: 'openai',
): CompileResult {
  if ('rejection' in output) {
    return {
      ok: false,
      source,
      prompt,
      rejection: output.rejection,
      providerError,
    }
  }

  // Second pass through Zod (known asset + percent) — already done for AI path;
  // ensure fallback path is normalized too.
  const checked = compiledRuleSchema.safeParse(output)
  if (!checked.success) {
    return {
      ok: false,
      source: 'validation',
      prompt,
      rejection: {
        code: 'missing_details',
        message: checked.error.issues[0]?.message ?? 'Rule failed validation.',
      },
      providerError,
    }
  }

  const rule = checked.data
  return {
    ok: true,
    source,
    provider,
    rule,
    interpretation: interpretRule(rule, prompt),
    preview: buildPreview(rule),
    prompt,
  }
}

/** 7.10 — Compact preview card fields. */
export function buildPreview(rule: CompiledRule): RulePreview {
  if (rule.type === 'take_profit') {
    return {
      type: rule.type,
      asset: rule.asset,
      summary: interpretRule(rule),
      fields: {
        trigger: formatField(rule.unit, rule.value),
        sell: formatField(rule.actionUnit, rule.actionValue),
        sellBasis: rule.sellBasis,
      },
    }
  }

  return {
    type: rule.type,
    asset: rule.asset,
    summary: interpretRule(rule),
    fields: {
      limit: formatField(rule.unit, rule.value),
    },
  }
}

function formatField(unit: 'percent' | 'amount', value: number): string {
  return unit === 'percent' ? `${value}%` : `$${value}`
}
