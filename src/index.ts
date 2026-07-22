import { Hono } from 'hono'
import type { Env } from './db'
import { getTone, setTone, isOptedOut, optOut, isBotOff, setBotOff, setBotOn, addKeyword, removeKeyword, listKeywords, checkAndIncrementUsage } from './db'
import { verifySignature, replyMessage, chatIdOf, userIdOf, type LineEvent } from './line'
import { parseCommand } from './commands'
import { analyze, CRISIS_REPLY, BULLYING_REPLY } from './llm'
import { hasCrisisSignal, hasBullyingIntent } from './safety'

const app = new Hono<{ Bindings: Env }>()

app.get('/health', (c) => c.text('ok'))

app.post('/webhook', async (c) => {
  const body = await c.req.text()
  const sig = c.req.header('x-line-signature') ?? null
  if (!(await verifySignature(c.env.LINE_CHANNEL_SECRET, body, sig))) {
    return c.json({ error: 'invalid signature' }, 401)
  }

  const payload = JSON.parse(body) as { events: LineEvent[] }
  const events = payload.events ?? []

  for (const ev of events) {
    if (ev.mode === 'standby') continue
    // ponytail: waitUntil lets us return 200 immediately; LLM runs in background
    c.executionCtx.waitUntil(handleEvent(ev, c.env).catch(() => {}))
  }
  return c.json({ ok: true })
})

async function handleEvent(ev: LineEvent, env: Env): Promise<void> {
  const chatId = chatIdOf(ev)
  const userId = userIdOf(ev)
  const replyToken = ev.replyToken
  if (!replyToken) return

  if (ev.type === 'join' || ev.type === 'follow') {
    // ponytail: 重用 /help 的完整說明,避免跟這裡手寫的縮寫版各自漂移、指令對不齊
    const help = parseCommand('/help')!.reply
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, `防衛語句翻譯機上線!\n\n${help}`)
    return
  }

  if (ev.type === 'leave' || ev.type === 'unfollow') return

  if (ev.type !== 'message' || ev.message?.type !== 'text') return
  const text = ev.message.text ?? ''
  if (!text.trim()) return

  const isGroup = ev.source.type === 'group' || ev.source.type === 'room'

  const cmd = parseCommand(text)
  if (cmd) {
    await handleCommand(cmd, env, chatId, userId, replyToken)
    return
  }

  if (isGroup && await isBotOff(env.DB, chatId)) return
  if (await isOptedOut(env.DB, chatId, userId)) return
  if (isGroup && !isGroupTrigger(ev)) return

  if (hasCrisisSignal(text)) {
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, CRISIS_REPLY)
    return
  }
  if (hasBullyingIntent(text)) {
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, BULLYING_REPLY)
    return
  }

  const tone = await getTone(env.DB, chatId)

  if (!(await checkAndIncrementUsage(env.DB, userId))) {
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, '今日分析次數已達上限(20 則),明天再來吧!')
    return
  }

  const result = await analyze(text, tone, env.LLM_BASE, env.LLM_MODEL, env.LLM_API_KEY)

  if (result.safety === 'crisis') {
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, CRISIS_REPLY)
    return
  }
  if (result.safety === 'bullying') {
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, BULLYING_REPLY)
    return
  }

  if (result.reply) {
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, result.reply)
  }
}

function isGroupTrigger(ev: LineEvent): boolean {
  const mention = (ev.message as any)?.mention
  if (mention?.mentionees?.some((m: any) => m.isSelf)) return true
  return false
}

async function handleCommand(cmd: NonNullable<ReturnType<typeof parseCommand>>, env: Env, chatId: string, userId: string, replyToken: string): Promise<void> {
  const action = cmd.action
  let reply = cmd.reply

  if (action) {
    switch (action.kind) {
      case 'set_tone':
        await setTone(env.DB, chatId, action.tone)
        break
      case 'add_keyword':
        await addKeyword(env.DB, chatId, action.pattern)
        break
      case 'remove_keyword':
        const removed = await removeKeyword(env.DB, chatId, action.pattern)
        if (!removed) reply = `找不到關鍵字「${action.pattern}」`
        break
      case 'list_keywords':
        const kws = await listKeywords(env.DB, chatId)
        reply = kws.length ? `關鍵字:\n${kws.map((k) => `• ${k}`).join('\n')}` : '目前沒有自訂關鍵字。'
        break
      case 'optout':
        await optOut(env.DB, chatId, userId)
        break
      case 'botoff':
        await setBotOff(env.DB, chatId)
        break
      case 'boton':
        await setBotOn(env.DB, chatId)
        break
    }
  }

  await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, reply)
}

export default app
