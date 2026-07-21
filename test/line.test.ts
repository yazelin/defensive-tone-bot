import { describe, it, expect } from 'vitest'
import { verifySignature, chatIdOf, userIdOf, type LineEvent } from '../src/line'

async function sign(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

describe('verifySignature', () => {
  it('valid signature passes', async () => {
    const body = '{"events":[]}'
    const sig = await sign('test-line-secret', body)
    expect(await verifySignature('test-line-secret', body, sig)).toBe(true)
  })
  it('wrong secret fails', async () => {
    const body = '{"events":[]}'
    const sig = await sign('test-line-secret', body)
    expect(await verifySignature('wrong-secret', body, sig)).toBe(false)
  })
  it('tampered body fails', async () => {
    const sig = await sign('test-line-secret', '{"events":[]}')
    expect(await verifySignature('test-line-secret', '{"events":[1]}', sig)).toBe(false)
  })
  it('missing signature fails', async () => {
    expect(await verifySignature('test-line-secret', '{}', null)).toBe(false)
  })
  it('empty signature fails', async () => {
    expect(await verifySignature('test-line-secret', '{}', '')).toBe(false)
  })
})

describe('chatIdOf / userIdOf', () => {
  it('group chat id', () => {
    const ev: LineEvent = { type: 'message', mode: 'active', source: { type: 'group', groupId: 'G1', userId: 'U1' }, message: { type: 'text', text: 'hi' } }
    expect(chatIdOf(ev)).toBe('G1')
    expect(userIdOf(ev)).toBe('U1')
  })
  it('1-on-1 chat id = userId', () => {
    const ev: LineEvent = { type: 'message', mode: 'active', source: { type: 'user', userId: 'U1' }, message: { type: 'text', text: 'hi' } }
    expect(chatIdOf(ev)).toBe('U1')
    expect(userIdOf(ev)).toBe('U1')
  })
  it('room chat id', () => {
    const ev: LineEvent = { type: 'message', mode: 'active', source: { type: 'room', roomId: 'R1', userId: 'U1' }, message: { type: 'text', text: 'hi' } }
    expect(chatIdOf(ev)).toBe('R1')
  })
})