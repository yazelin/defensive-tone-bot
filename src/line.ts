// LINE Messaging API webhook: signature verify + reply

// 驗簗:HMAC-SHA256(channel_secret, request_body) base64 == x-line-signature
export async function verifySignature(secret: string, body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return timingSafeEqual(computed, signature)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// 回覆訊息到聊天室
export async function replyMessage(accessToken: string, replyToken: string, text: string): Promise<boolean> {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  })
  if (!res.ok) console.error('LINE reply failed:', res.status, await res.text())
  return res.ok
}

export interface LineEvent {
  type: string
  mode: string // webhook mode: active|standby
  replyToken?: string
  source: { type: string; userId?: string; groupId?: string; roomId?: string }
  message?: { type: string; text?: string }
  joined?: { type: string }
}

export function chatIdOf(ev: LineEvent): string {
  const s = ev.source
  if (s.groupId) return s.groupId
  if (s.roomId) return s.roomId
  return s.userId ?? 'unknown'
}

export function userIdOf(ev: LineEvent): string {
  return ev.source.userId ?? 'unknown'
}