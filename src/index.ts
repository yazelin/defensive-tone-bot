import { Hono } from 'hono'
import type { Env, Tone } from './db'
import { getTone, setTone, isOptedOut, optOut, isBotOff, setBotOff, setBotOn, addKeyword, removeKeyword, listKeywords } from './db'
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
    await handleEvent(ev, c.env).catch(() => {}) // ponytail: 單事件失敗不炸整批
  }
  return c.json({ ok: true })
})

async function handleEvent(ev: LineEvent, env: Env): Promise<void> {
  const chatId = chatIdOf(ev)
  const userId = userIdOf(ev)
  const replyToken = ev.replyToken
  if (!replyToken) return

  // bot 被加入群組/好友 → 發告知訊息
  if (ev.type === 'join' || ev.type === 'follow') {
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [
      '🛡️ 防衛語句翻譯機上線!',
      '我會把聊天中的防衛性語句翻譯成底層需求,用你選的語氣回覆。',
      '',
      '群組:@我 或回覆我才會觸發。',
      '一對一:每則訊息都會分析。',
      '',
      '/tone friendly|humor|formal — 切換語氣',
      '/optout — 退出分析  /botoff — 停用機器人',
      '/help — 完整說明',
    ].join('\n'))
    return
  }

  if (ev.type === 'leave' || ev.type === 'unfollow') return

  // 只處理文字訊息
  if (ev.type !== 'message' || ev.message?.type !== 'text') return
  const text = ev.message.text ?? ''
  if (!text.trim()) return

  const isGroup = ev.source.type === 'group' || ev.source.type === 'room'

  // 指令永遠生效
  const cmd = parseCommand(text)
  if (cmd) {
    await handleCommand(cmd, env, chatId, userId, replyToken)
    return
  }

  // 群組:bot 停用 → skip
  if (isGroup && await isBotOff(env.DB, chatId)) return

  // optout:發話者在名單 → skip(含被他人引用時也不分析該人)
  if (await isOptedOut(env.DB, chatId, userId)) return

  // 群組:需顯式觸發(@mention isSelf 或 @機器人文字)
  if (isGroup && !isGroupTrigger(ev)) return

  // 安全預檢(程式側最終把關,不信 LLM)
  if (hasCrisisSignal(text)) {
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, CRISIS_REPLY)
    return
  }
  if (hasBullyingIntent(text)) {
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, BULLYING_REPLY)
    return
  }

  // LLM 分析
  const tone = await getTone(env.DB, chatId)
  const result = await analyze(text, tone, env.LLM_BASE, env.LLM_MODEL, env.LLM_API_KEY)

  // LLM 偵測到危機/霸凌 → 程式接手
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
  // 非防衛或低信心 → 沉默(不回覆)
}

function isGroupTrigger(ev: LineEvent): boolean {
  // LINE mention feature:message.mention.mentionees[].isSelf
  const mention = (ev.message as any)?.mention
  if (mention?.mentionees?.some((m: any) => m.isSelf)) return true
  // fallback:文字含 @ + bot 名稱前綴(無 mention 結構時)
  const text = ev.message?.text ?? ''
  if (/^@\S+/u.test(text.trim())) return true
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