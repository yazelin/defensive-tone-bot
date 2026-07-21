// R1 驗收自檢:有真實 LLM_API_KEY 時跑 20+20 句驗收;用 test key 時 skip。
// 跑法:LLM_API_KEY=groq_real_key npx vitest run test/acceptance.test.ts
import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { analyze } from '../src/llm'
import { DEFENSIVE_SENTENCES, NON_DEFENSIVE_SENTENCES } from './acceptance-sentences'

const isRealKey = !env.LLM_API_KEY.startsWith('test-')
const describeOrSkip = isRealKey ? describe : describe.skip

describeOrSkip('R1 acceptance — real LLM (skipped with test key)', () => {
  it('defensive: ≥16/20 produce reply with no personality assertion', async () => {
    let pass = 0
    for (const s of DEFENSIVE_SENTENCES) {
      const r = await analyze(s, 'friendly', env.LLM_BASE, env.LLM_MODEL, env.LLM_API_KEY)
      if (r.reply && !isPersonalityAssertion(r.reply) && r.safety === 'ok') pass++
    }
    expect(pass).toBeGreaterThanOrEqual(16)
  }, 60_000)

  it('non-defensive: ≤4/20 false-trigger a reply', async () => {
    let triggered = 0
    for (const s of NON_DEFENSIVE_SENTENCES) {
      const r = await analyze(s, 'friendly', env.LLM_BASE, env.LLM_MODEL, env.LLM_API_KEY)
      if (r.reply) triggered++
    }
    expect(triggered).toBeLessThanOrEqual(4)
  }, 60_000)
})

// 人格斷言偵測:回覆含「你是XX型/你的人格/你這種人/你就是…的人」等斷言 → 不合格
function isPersonalityAssertion(reply: string): boolean {
  const patterns = ['你是.*型', '你的人格', '你這種人', '你就是.*的人', '你的性格', '你典型的']
  return patterns.some((p) => new RegExp(p).test(reply))
}