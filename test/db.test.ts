import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { getTone, setTone, isOptedOut, optOut, isBotOff, setBotOff, setBotOn, addKeyword, removeKeyword, listKeywords, checkAndIncrementUsage, DAILY_LIMIT } from '../src/db'

beforeEach(async () => {
  for (const t of ['chat_tones', 'optouts', 'bot_off', 'keywords', 'usage_daily']) await env.DB.exec(`DELETE FROM ${t}`)
})

describe('chat_tones', () => {
  it('defaults to friendly when no row', async () => {
    expect(await getTone(env.DB, 'C1')).toBe('friendly')
  })
  it('sets and gets tone', async () => {
    await setTone(env.DB, 'C1', 'humor')
    expect(await getTone(env.DB, 'C1')).toBe('humor')
  })
  it('upserts tone', async () => {
    await setTone(env.DB, 'C1', 'humor')
    await setTone(env.DB, 'C1', 'formal')
    expect(await getTone(env.DB, 'C1')).toBe('formal')
  })
  it('per-chat isolation', async () => {
    await setTone(env.DB, 'C1', 'humor')
    await setTone(env.DB, 'C2', 'formal')
    expect(await getTone(env.DB, 'C1')).toBe('humor')
    expect(await getTone(env.DB, 'C2')).toBe('formal')
  })
})

describe('optouts', () => {
  it('not opted out by default', async () => {
    expect(await isOptedOut(env.DB, 'C1', 'U1')).toBe(false)
  })
  it('opt out then detected', async () => {
    await optOut(env.DB, 'C1', 'U1')
    expect(await isOptedOut(env.DB, 'C1', 'U1')).toBe(true)
    expect(await isOptedOut(env.DB, 'C1', 'U2')).toBe(false)
    expect(await isOptedOut(env.DB, 'C2', 'U1')).toBe(false)
  })
  it('idempotent opt out', async () => {
    await optOut(env.DB, 'C1', 'U1')
    await optOut(env.DB, 'C1', 'U1')
    expect(await isOptedOut(env.DB, 'C1', 'U1')).toBe(true)
  })
})

describe('bot_off', () => {
  it('off by default', async () => {
    expect(await isBotOff(env.DB, 'C1')).toBe(false)
  })
  it('set off then on', async () => {
    await setBotOff(env.DB, 'C1')
    expect(await isBotOff(env.DB, 'C1')).toBe(true)
    await setBotOn(env.DB, 'C1')
    expect(await isBotOff(env.DB, 'C1')).toBe(false)
  })
})

describe('keywords', () => {
  it('add list remove', async () => {
    expect(await listKeywords(env.DB, 'C1')).toEqual([])
    await addKeyword(env.DB, 'C1', '隨便啦')
    await addKeyword(env.DB, 'C1', '關你什麼事')
    expect(await listKeywords(env.DB, 'C1')).toEqual(['隨便啦', '關你什麼事'])
    expect(await removeKeyword(env.DB, 'C1', '隨便啦')).toBe(true)
    expect(await listKeywords(env.DB, 'C1')).toEqual(['關你什麼事'])
    expect(await removeKeyword(env.DB, 'C1', '不存在')).toBe(false)
  })
  it('per-chat isolation', async () => {
    await addKeyword(env.DB, 'C1', '隨便啦')
    await addKeyword(env.DB, 'C2', '隨便啦')
    await removeKeyword(env.DB, 'C1', '隨便啦')
    expect(await listKeywords(env.DB, 'C1')).toEqual([])
    expect(await listKeywords(env.DB, 'C2')).toEqual(['隨便啦'])
  })
})

describe('usage_daily', () => {
  it('allows up to DAILY_LIMIT', async () => {
    for (let i = 0; i < DAILY_LIMIT; i++) {
      expect(await checkAndIncrementUsage(env.DB, 'U1')).toBe(true)
    }
    expect(await checkAndIncrementUsage(env.DB, 'U1')).toBe(false)
  })
  it('per-user isolation', async () => {
    for (let i = 0; i < DAILY_LIMIT; i++) await checkAndIncrementUsage(env.DB, 'U1')
    expect(await checkAndIncrementUsage(env.DB, 'U1')).toBe(false)
    expect(await checkAndIncrementUsage(env.DB, 'U2')).toBe(true)
  })
  it('counts increment correctly', async () => {
    await checkAndIncrementUsage(env.DB, 'U1')
    await checkAndIncrementUsage(env.DB, 'U1')
    await checkAndIncrementUsage(env.DB, 'U1')
    const today = new Date().toISOString().slice(0, 10)
    const row = await env.DB.prepare('SELECT count FROM usage_daily WHERE user_id = ? AND date = ?').bind('U1', today).first<{ count: number }>()
    expect(row?.count).toBe(3)
  })
})