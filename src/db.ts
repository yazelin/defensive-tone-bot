export type Tone = 'friendly' | 'humor' | 'formal'

export interface Env {
  DB: D1Database
  LINE_CHANNEL_SECRET: string
  LINE_CHANNEL_ACCESS_TOKEN: string
  LLM_BASE: string
  LLM_MODEL: string
  LLM_API_KEY: string
}

// ---- chat_tones ----
export async function getTone(db: D1Database, chatId: string): Promise<Tone> {
  const row = await db.prepare('SELECT tone FROM chat_tones WHERE chat_id = ?').bind(chatId).first<{ tone: Tone }>()
  return row?.tone ?? 'friendly'
}

export async function setTone(db: D1Database, chatId: string, tone: Tone): Promise<void> {
  const now = Date.now()
  await db.prepare(
    'INSERT INTO chat_tones (chat_id, tone, updated_at) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET tone = excluded.tone, updated_at = excluded.updated_at',
  ).bind(chatId, tone, now).run()
}

// ---- optouts ----
export async function isOptedOut(db: D1Database, chatId: string, userId: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 FROM optouts WHERE chat_id = ? AND user_id = ?').bind(chatId, userId).first()
  return !!row
}

export async function optOut(db: D1Database, chatId: string, userId: string): Promise<void> {
  await db.prepare('INSERT OR IGNORE INTO optouts (chat_id, user_id, created_at) VALUES (?, ?, ?)').bind(chatId, userId, Date.now()).run()
}

// ---- bot_off (群組停用) ----
export async function isBotOff(db: D1Database, chatId: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 FROM bot_off WHERE chat_id = ?').bind(chatId).first()
  return !!row
}

export async function setBotOff(db: D1Database, chatId: string): Promise<void> {
  await db.prepare('INSERT OR IGNORE INTO bot_off (chat_id, created_at) VALUES (?, ?)').bind(chatId, Date.now()).run()
}

export async function setBotOn(db: D1Database, chatId: string): Promise<void> {
  await db.prepare('DELETE FROM bot_off WHERE chat_id = ?').bind(chatId).run()
}

// ---- keywords ----
export async function addKeyword(db: D1Database, chatId: string, pattern: string): Promise<void> {
  await db.prepare('INSERT INTO keywords (chat_id, pattern, created_at) VALUES (?, ?, ?)').bind(chatId, pattern, Date.now()).run()
}

export async function removeKeyword(db: D1Database, chatId: string, pattern: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM keywords WHERE chat_id = ? AND pattern = ?').bind(chatId, pattern).run()
  return (r.meta.changes ?? 0) > 0
}

export async function listKeywords(db: D1Database, chatId: string): Promise<string[]> {
  const { results } = await db.prepare('SELECT pattern FROM keywords WHERE chat_id = ? ORDER BY id').bind(chatId).all<{ pattern: string }>()
  return results.map((r) => r.pattern)
}

// ---- per-user 每日限流 ----
export const DAILY_LIMIT = 20 // 每人每天最多 20 次 LLM 分析

export async function checkAndIncrementUsage(db: D1Database, userId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10)
  const row = await db.prepare('SELECT count FROM usage_daily WHERE user_id = ? AND date = ?').bind(userId, today).first<{ count: number }>()
  if (row && row.count >= DAILY_LIMIT) return false // 超額 → 拒絕
  await db.prepare(
    'INSERT INTO usage_daily (user_id, date, count) VALUES (?, ?, 1) ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1',
  ).bind(userId, today).run()
  return true
}