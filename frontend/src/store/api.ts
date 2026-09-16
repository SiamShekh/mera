import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

import { API_URL } from '@/lib/config'
import type {
  ArmAutopilotResponse,
  AutopilotTurnRequest,
  AutopilotTurnResult,
  AppendChatMessageResponse,
  ChatRequest,
  ChatResult,
  CompiledRule,
  CompileResult,
  ConfirmRuleResponse,
  CancelRuleResponse,
  CreateChatThreadResponse,
  CreateRuleBody,
  GetChatThreadResponse,
  KeeperTickResponse,
  ListChatThreadsResponse,
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
  tagTypes: ['Rules', 'ChatThreads'],
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

    cancelRule: builder.mutation<
      CancelRuleResponse,
      { id: string; userAddress: string }
    >({
      query: ({ id, userAddress }) => ({
        url: `/rules/${id}/cancel`,
        method: 'POST',
        body: { userAddress },
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

    /** Conversational Autopilot brain (clarify → propose → confirm). */
    autopilotTurn: builder.mutation<AutopilotTurnResult, AutopilotTurnRequest>({
      query: (body) => ({
        url: '/ai/autopilot',
        method: 'POST',
        body,
      }),
    }),

    listChatThreads: builder.query<
      ListChatThreadsResponse,
      { userAddress: string }
    >({
      query: ({ userAddress }) => ({
        url: '/chat/threads',
        params: { userAddress },
      }),
      providesTags: ['ChatThreads'],
    }),

    getChatThread: builder.query<
      GetChatThreadResponse,
      { id: string; userAddress: string }
    >({
      query: ({ id, userAddress }) => ({
        url: `/chat/threads/${id}`,
        params: { userAddress },
      }),
      providesTags: (_result, _err, arg) => [
        { type: 'ChatThreads', id: arg.id },
      ],
    }),

    createChatThread: builder.mutation<
      CreateChatThreadResponse,
      { userAddress: string; title?: string }
    >({
      query: (body) => ({
        url: '/chat/threads',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['ChatThreads'],
    }),

    appendChatMessage: builder.mutation<
      AppendChatMessageResponse,
      {
        threadId: string
        userAddress: string
        role: 'user' | 'assistant'
        content: string
        id?: string
        title?: string
      }
    >({
      query: ({ threadId, ...body }) => ({
        url: `/chat/threads/${threadId}/messages`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['ChatThreads'],
    }),

    deleteChatThread: builder.mutation<
      { ok: boolean },
      { id: string; userAddress: string }
    >({
      query: ({ id, userAddress }) => ({
        url: `/chat/threads/${id}`,
        method: 'DELETE',
        params: { userAddress },
      }),
      invalidatesTags: ['ChatThreads'],
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
        timeout: 90_000,
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
      invalidatesTags: ['Rules'],
    }),

    /** Attach escrow deposit so Autopilot can settle without further clicks. */
    armAutopilot: builder.mutation<
      ArmAutopilotResponse,
      {
        ruleId: string
        userAddress: string
        sellMint: string
        sellAmount: number
        depositSignature: string
      }
    >({
      query: (body) => ({
        url: '/keeper/arm',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Rules'],
    }),
  }),
})

export const {
  useUpsertUserMutation,
  useCreateRuleMutation,
  useListRulesQuery,
  useDeleteRuleMutation,
  useCancelRuleMutation,
  useCompileRuleMutation,
  useValidateCompiledRuleMutation,
  useConfirmRuleMutation,
  useChatMutation,
  useAutopilotTurnMutation,
  useListChatThreadsQuery,
  useLazyListChatThreadsQuery,
  useLazyGetChatThreadQuery,
  useCreateChatThreadMutation,
  useAppendChatMessageMutation,
  useDeleteChatThreadMutation,
  useSwapConfigQuery,
  useCompleteSwapMutation,
  useSwapFaucetMutation,
  useGetPricesQuery,
  useTickPricesMutation,
  useKeeperTickMutation,
  useArmAutopilotMutation,
} = api
