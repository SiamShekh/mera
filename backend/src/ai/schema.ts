/**
 * JSON Schema describing the strict rule object the model must return.
 * Kept in sync with Zod `compiledRuleSchema` (validators/compile.ts).
 */
export const COMPILED_RULE_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'CompiledPortfolioRule',
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'asset', 'unit', 'value'],
      properties: {
        type: { const: 'max_allocation' },
        asset: {
          type: 'string',
          description: 'Canonical ticker, e.g. NVDA, SOL, USDC',
        },
        unit: { enum: ['percent', 'amount'] },
        value: { type: 'number', exclusiveMinimum: 0 },
        rejection: { type: 'null' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'asset', 'unit', 'value'],
      properties: {
        type: { const: 'min_allocation' },
        asset: { type: 'string' },
        unit: { enum: ['percent', 'amount'] },
        value: { type: 'number', exclusiveMinimum: 0 },
        rejection: { type: 'null' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'type',
        'asset',
        'unit',
        'value',
        'actionUnit',
        'actionValue',
        'sellBasis',
      ],
      properties: {
        type: { const: 'take_profit' },
        asset: { type: 'string' },
        unit: { enum: ['percent', 'amount'] },
        value: { type: 'number', exclusiveMinimum: 0 },
        actionUnit: { enum: ['percent', 'amount'] },
        actionValue: { type: 'number', exclusiveMinimum: 0 },
        sellBasis: { enum: ['position', 'portfolio'] },
        rejection: { type: 'null' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['rejection'],
      properties: {
        rejection: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'message'],
          properties: {
            code: {
              enum: [
                'ambiguous',
                'unsafe',
                'unsupported',
                'invalid_percent',
                'missing_details',
              ],
            },
            message: { type: 'string' },
          },
        },
      },
    },
  ],
} as const
