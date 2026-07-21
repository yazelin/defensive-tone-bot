import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config'
import path from 'node:path'

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'))
  return {
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              LINE_CHANNEL_SECRET: 'test-line-secret',
              LINE_CHANNEL_ACCESS_TOKEN: 'test-line-token',
              LLM_BASE: 'https://llm.test/v1',
              LLM_MODEL: 'test-model',
              LLM_API_KEY: 'test-llm-key',
            },
          },
        },
      },
    },
  }
})