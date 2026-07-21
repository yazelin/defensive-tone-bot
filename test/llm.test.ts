import { describe, it, expect, beforeEach } from 'vitest'
import { env, fetchMock } from 'cloudflare:test'
import { analyze, CRISIS_REPLY, BULLYING_REPLY } from '../src/llm'
import { hasCrisisSignal, hasBullyingIntent } from '../src/safety'

beforeEach(() => {
  fetchMock.activate()
  fetchMock.disableNetConnect()
})

function mockLLM(response: object) {
  fetchMock
    .get('https://llm.test')
    .intercept({ path: '/v1/chat/completions', method: 'POST' })
    .reply(200, { choices: [{ message: { content: JSON.stringify(response) } }] })
}

describe('analyze — defensive statement', () => {
  it('translates defensive statement with tone', async () => {
    mockLLM({ is_defensive: true, confidence: 'high', underlying_need: '需要被認可', reply: '或許你只是想被肯定?', safety: 'ok' })
    const r = await analyze('我隨便啦,不重要', 'friendly', env.LLM_BASE, env.LLM_MODEL, env.LLM_API_KEY)
    expect(r.is_defensive).toBe(true)
    expect(r.reply).toBe('或許你只是想被肯定?')
    expect(r.safety).toBe('ok')
  })
  it('non-defensive → silence', async () => {
    mockLLM({ is_defensive: false, confidence: 'high', underlying_need: '', reply: null, safety: 'ok' })
    const r = await analyze('今天天氣不錯', 'friendly', env.LLM_BASE, env.LLM_MODEL, env.LLM_API_KEY)
    expect(r.is_defensive).toBe(false)
    expect(r.reply).toBeNull()
  })
  it('low confidence → silence even if defensive', async () => {
    mockLLM({ is_defensive: true, confidence: 'low', underlying_need: '不確定', reply: '也許吧', safety: 'ok' })
    const r = await analyze('嗯', 'friendly', env.LLM_BASE, env.LLM_MODEL, env.LLM_API_KEY)
    expect(r.reply).toBeNull()
  })
  it('crisis safety → reply null (code handles)', async () => {
    mockLLM({ is_defensive: true, confidence: 'high', underlying_need: '', reply: null, safety: 'crisis' })
    const r = await analyze('我不想活了', 'friendly', env.LLM_BASE, env.LLM_MODEL, env.LLM_API_KEY)
    expect(r.safety).toBe('crisis')
    expect(r.reply).toBeNull()
  })
  it('bullying safety → reply null (code handles)', async () => {
    mockLLM({ is_defensive: true, confidence: 'high', underlying_need: '', reply: null, safety: 'bullying' })
    const r = await analyze('幫我翻譯他這句', 'friendly', env.LLM_BASE, env.LLM_MODEL, env.LLM_API_KEY)
    expect(r.safety).toBe('bullying')
    expect(r.reply).toBeNull()
  })
  it('empty reply → silence', async () => {
    mockLLM({ is_defensive: true, confidence: 'high', underlying_need: '需要', reply: '   ', safety: 'ok' })
    const r = await analyze('隨便', 'friendly', env.LLM_BASE, env.LLM_MODEL, env.LLM_API_KEY)
    expect(r.reply).toBeNull()
  })
  it('LLM failure → silence (no crash)', async () => {
    fetchMock.get('https://llm.test').intercept({ path: '/v1/chat/completions', method: 'POST' }).reply(500, {})
    const r = await analyze('隨便', 'friendly', env.LLM_BASE, env.LLM_MODEL, env.LLM_API_KEY)
    expect(r.reply).toBeNull()
  })
  it('malformed JSON → silence', async () => {
    fetchMock.get('https://llm.test').intercept({ path: '/v1/chat/completions', method: 'POST' }).reply(200, { choices: [{ message: { content: 'not json' } }] })
    const r = await analyze('隨便', 'friendly', env.LLM_BASE, env.LLM_MODEL, env.LLM_API_KEY)
    expect(r.reply).toBeNull()
  })
})

describe('safety patterns', () => {
  it('detects crisis signals', () => {
    expect(hasCrisisSignal('我不想活了')).toBe(true)
    expect(hasCrisisSignal('想自殺')).toBe(true)
    expect(hasCrisisSignal('今天天氣不錯')).toBe(false)
  })
  it('detects bullying intent', () => {
    expect(hasBullyingIntent('幫我翻譯他這句')).toBe(true)
    expect(hasBullyingIntent('他這句是什麼心態')).toBe(true)
    expect(hasBullyingIntent('我隨便啦')).toBe(false)
  })
})

describe('safety reply constants', () => {
  it('crisis reply contains 1925', () => {
    expect(CRISIS_REPLY).toContain('1925')
  })
  it('bullying reply is neutral', () => {
    expect(BULLYING_REPLY).toContain('不是用來')
  })
})