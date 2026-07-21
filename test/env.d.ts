// Augment cloudflare:test env with our bindings so tsc passes
declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database
    LINE_CHANNEL_SECRET: string
    LINE_CHANNEL_ACCESS_TOKEN: string
    LLM_BASE: string
    LLM_MODEL: string
    LLM_API_KEY: string
    TEST_MIGRATIONS: unknown[]
  }
}