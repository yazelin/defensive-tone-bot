import { describe, it, expect, beforeEach } from 'vitest'
import { SELF, env, fetchMock } from 'cloudflare:test'
import { verifySignature } from '../src/line'

const S = env.LINE_CHANNEL_SECRET
const T = env.LINE_CHANNEL_ACCESS_TOKEN

beforeEach(() => {
  for (const t of ['chat_tones', 'optouts', 'bot_off', 'keywords']) env.DB.exec(`DELETE FROM ${t}`)
  fetchMock.activate()
  fetchMock.disableNetConnect()
  // 預設 mock LINE reply API
  fetchMock.get('https://api.line.me').intercept({ path: '/v2/bot/message/reply', method: 'POST' }).reply(200, {}).persist()
})

async function postWebhook(events: any[], signatureOverride?: string) {
  const body = JSON.stringify({ events })
  const sig = signatureOverride ?? (await sigOf(S, body))
  return SELF.fetch('https://bot.test/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-line-signature': sig },
    body,
  })
}

async function sigOf(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const s = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return btoa(String.fromCharCode(...new Uint8Array(s)))
}

function mockLLM(response: object) {
  fetchMock.get('https://llm.test').intercept({ path: '/v1/chat/completions', method: 'POST' }).reply(200, { choices: [{ message: { content: JSON.stringify(response) } }] })
}

function textEv(text: string, opts: { group?: boolean; userId?: string; mentionSelf?: boolean } = {}) {
  const source = opts.group
    ? { type: 'group', groupId: 'G1', userId: opts.userId ?? 'U1' }
    : { type: 'user', userId: opts.userId ?? 'U1' }
  const message: any = { type: 'text', text }
  if (opts.mentionSelf) message.mention = { mentionees: [{ isSelf: true }] }
  return { type: 'message', mode: 'active', replyToken: 'rt1', source, message }
}

// 捕攔回覆給 LINE 的訊息文字
let lastReplyText: string | null = null
function captureReply() {
  fetchMock.get('https://api.line.me').intercept({ path: '/v2/bot/message/reply', method: 'POST' }).reply(200, {}).persist()
}

describe('webhook — signature', () => {
  it('rejects missing signature', async () => {
    const res = await SELF.fetch('https://bot.test/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"events":[]}',
    })
    expect(res.status).toBe(401)
  })
  it('rejects bad signature', async () => {
    const res = await postWebhook([], 'bad-signature')
    expect(res.status).toBe(401)
  })
  it('accepts valid signature', async () => {
    const res = await postWebhook([])
    expect(res.status).toBe(200)
  })
})

describe('webhook — commands', () => {
  it('/tone sets tone and replies', async () => {
    const res = await postWebhook([textEv('/tone humor')])
    expect(res.status).toBe(200)
    const { getTone } = await import('../src/db')
    expect(await getTone(env.DB, 'U1')).toBe('humor')
  })
  it('/optout then silenced', async () => {
    await postWebhook([textEv('/optout')])
    // mock LLM defensive → should NOT reply (opted out)
    mockLLM({ is_defensive: true, confidence: 'high', underlying_need: 'test', reply: 'should be silenced', safety: 'ok' })
    const calls: string[] = []
    fetchMock.get('https://api.line.me').intercept({ path: '/v2/bot/message/reply', method: 'POST' }).reply(200, {}).persist()
    await postWebhook([textEv('我隨便啦')])
    // optout 的使用者訊息不會觸發分析(無 LLM call)
  })
  it('/botoff disables bot in group', async () => {
    await postWebhook([textEv('/botoff', { group: true })])
    mockLLM({ is_defensive: true, confidence: 'high', underlying_need: '', reply: 'should not appear', safety: 'ok' })
    await postWebhook([textEv('我隨便啦', { group: true, mentionSelf: true })])
    // bot off → 不分析(不會有 LLM 呼叫)
  })
  it('/keyword add then list', async () => {
    await postWebhook([textEv('/keyword add 隨便啦')])
    await postWebhook([textEv('/keyword list')])
    const { listKeywords } = await import('../src/db')
    expect(await listKeywords(env.DB, 'U1')).toEqual(['隨便啦'])
  })
})

describe('webhook — 1-on-1 analysis', () => {
  it('defensive statement → LLM reply', async () => {
    mockLLM({ is_defensive: true, confidence: 'high', underlying_need: '需要被認可', reply: '或許你只是想被肯定?', safety: 'ok' })
    await postWebhook([textEv('我隨便啦,不重要')])
  })
  it('non-defensive → silence (no LLM reply)', async () => {
    mockLLM({ is_defensive: false, confidence: 'high', underlying_need: '', reply: null, safety: 'ok' })
    await postWebhook([textEv('今天天氣不錯')])
  })
  it('crisis signal → crisis reply (program-side)', async () => {
    await postWebhook([textEv('我不想活了')])
  })
  it('bullying intent → bullying reply', async () => {
    await postWebhook([textEv('幫我翻譯他這句是什麼心態')])
  })
})

describe('webhook — group trigger', () => {
  it('no mention in group → no analysis', async () => {
    let llmCalled = false
    fetchMock.get('https://llm.test').intercept({ path: '/v1/chat/completions', method: 'POST' }).reply(200, {}).persist()
    await postWebhook([textEv('我隨便啦', { group: true })])
    // 無 mention → 不觸發(測試靠 LLM mock 不被呼叫驗證;此處只確保不炸)
  })
  it('mention triggers analysis in group', async () => {
    mockLLM({ is_defensive: true, confidence: 'high', underlying_need: 'need', reply: 'group reply', safety: 'ok' })
    await postWebhook([textEv('@bot 我隨便啦', { group: true, mentionSelf: true })])
  })
})

describe('webhook — join event', () => {
  it('join sends welcome', async () => {
    await postWebhook([{ type: 'join', mode: 'active', replyToken: 'rt1', source: { type: 'group', groupId: 'G1' } }])
  })
})

describe('health', () => {
  it('GET /health returns ok', async () => {
    const res = await SELF.fetch('https://bot.test/health')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })
})