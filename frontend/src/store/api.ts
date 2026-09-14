import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

import { API_URL } from '@/lib/config'
import type {
  ChatRequest,
  ChatResult,
  CompiledRule,
  CompileResult,
  ConfirmRuleResponse,
  CreateRuleBody,
  KeeperTickResponse,
  PriceBook,
  Rule,
  RuleStatus,
  SwapCompleteRequest,
  SwapCompleteResponse,
  SwapConfigResponse,
  SwapFaucetResponse,
  UpsertUserResponse,
} from '@/types/api'

/** Shared RTK Query API — add endpoints here as the backend grows. */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: API_URL }),
  tagTypes: ['Rules'],
  endpoints: (builder) => ({
    upsertUser: builder.mutation<UpsertUserResponse, { address: string }>({
      query: (body) => ({
        url: '/users',
        method: 'POST',
        body,
      }),
    }),

    createRule: builder.mutation<{ rule: Rule }, CreateRuleBody>({
      query: (body) => ({
        url: '/rules',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Rules'],
    }),

    listRules: builder.query<
      { rules: Rule[] },
      { userAddress: string; status?: RuleStatus }
    >({
      query: ({ userAddress, status }) => ({
        url: '/rules',
        params: { userAddress, ...(status ? { status } : {}) },
      }),
      providesTags: ['Rules'],
    }),

    deleteRule: builder.mutation<{ ok: boolean }, { id: string }>({
      query: ({ id }) => ({
        url: `/rules/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Rules'],
    }),

    /** 7.02 — NL → strict rule preview (not saved). */
    compileRule: builder.mutation<
      CompileResult,
      { prompt: string; userAddress: string; holdings?: string[] }
    >({
      query: (body) => ({
        url: '/ai/compile',
        method: 'POST',
        body,
      }),
    }),

    /** 7.11 — Re-validate an edited draft. */
    validateCompiledRule: builder.mutation<
      CompileResult,
      { userAddress: string; prompt?: string; rule: CompiledRule }
    >({
      query: (body) => ({
        url: '/ai/validate',
        method: 'POST',
        body,
      }),
    }),

    /** 7.12–7.13 — Confirm and save. */
    confirmRule: builder.mutation<
      ConfirmRuleResponse,
      {
        userAddress: string
        prompt?: string
        rule: CompiledRule
        status?: 'draft' | 'active'
      }
    >({
      query: (body) => ({
        url: '/ai/confirm',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Rules'],
    }),

    /** In-app Mera AI drawer chat. */
    chat: builder.mutation<ChatResult, ChatRequest>({
      query: (body) => ({
        url: '/ai/chat',
        method: 'POST',
        body,
      }),
    }),

    swapConfig: builder.query<SwapConfigResponse, void>({
      query: () => ({ url: '/swap/config' }),
    }),

    completeSwap: builder.mutation<SwapCompleteResponse, SwapCompleteRequest>({
      query: (body) => ({
        url: '/swap/complete',
        method: 'POST',
        body,
      }),
    }),

    swapFaucet: builder.mutation<SwapFaucetResponse, { userAddress: string }>({
      query: (body) => ({
        url: '/swap/faucet',
        method: 'POST',
        body,
      }),
    }),

    /** Live Devnet mock price book (auto-simulates). */
    getPrices: builder.query<PriceBook, void>({
      query: () => ({ url: '/prices' }),
    }),

    tickPrices: builder.mutation<PriceBook, void>({
      query: () => ({
        url: '/prices/tick',
        method: 'POST',
      }),
    }),

    keeperTick: builder.mutation<
      KeeperTickResponse,
      { userAddress?: string; dryRun?: boolean }
    >({
      query: (body) => ({
        url: '/keeper/tick',
        method: 'POST',
        body,
      }),
    }),
  }),
})

export const {
  useUpsertUserMutation,
  useCreateRuleMutation,
  useListRulesQuery,
  useDeleteRuleMutation,
  useCompileRuleMutation,
  useValidateCompiledRuleMutation,
  useConfirmRuleMutation,
  useChatMutation,
  useSwapConfigQuery,
  useCompleteSwapMutation,
  useSwapFaucetMutation,
  useGetPricesQuery,
  useTickPricesMutation,
  useKeeperTickMutation,
} = api
