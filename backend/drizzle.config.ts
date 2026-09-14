import { defineConfig } from 'drizzle-kit'

/**
 * Optional helper for generating SQL from `src/db/schema.ts`.
 * Runtime queries use D1 via `drizzle-orm/d1` (see `src/db`).
 * Applied migrations live in `./migrations` and run through Wrangler.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
})
