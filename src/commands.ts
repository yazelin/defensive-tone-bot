import type { Tone } from './db'

// 回傳值:null = 不是指令;{ reply: string, action?: Action } = 指令
export interface CommandResult {
  reply: string
  action?: ToneAction | KeywordAction | OptoutAction | BotoffAction | HelpAction
}

export type ToneAction = { kind: 'set_tone'; tone: Tone }
export type KeywordAction = { kind: 'add_keyword'; pattern: string } | { kind: 'remove_keyword'; pattern: string } | { kind: 'list_keywords' }
export type OptoutAction = { kind: 'optout' }
export type BotoffAction = { kind: 'botoff' } | { kind: 'boton' }
export type HelpAction = { kind: 'help' }

const TONES: Record<string, Tone> = { friendly: 'friendly', humor: 'humor', formal: 'formal' }

export function parseCommand(text: string): CommandResult | null {
  const t = text.trim()
  if (!t.startsWith('/')) return null
  const [cmd, ...rest] = t.split(/\s+/)
  const arg = rest.join(' ').trim()

  switch (cmd) {
    case '/tone': {
      if (!arg) return { reply: '目前語氣:友善(friendly)。可選 friendly / humor / formal。用法:/tone humor' }
      const tone = TONES[arg.toLowerCase()]
      if (!tone) return { reply: '未知語氣。可選:friendly(友善)、humor(幽默)、formal(正式)。例:/tone humor' }
      return { reply: `語氣已切換為 ${labelOf(tone)} ✓`, action: { kind: 'set_tone', tone } }
    }
    case '/keyword': {
      if (!arg) return { reply: '用法:/keyword add <詞>、/keyword remove <詞>、/keyword list' }
      const [sub, ...pat] = arg.split(/\s+/)
      const pattern = pat.join(' ').trim()
      if (sub === 'add' && pattern) return { reply: `已新增關鍵字「${pattern}」`, action: { kind: 'add_keyword', pattern } }
      if (sub === 'remove' && pattern) return { reply: `已移除關鍵字「${pattern}」`, action: { kind: 'remove_keyword', pattern } }
      if (sub === 'list') return { reply: '關鍵字列表 ↑', action: { kind: 'list_keywords' } }
      return { reply: '用法:/keyword add <詞>、/keyword remove <詞>、/keyword list' }
    }
    case '/optout':
      return { reply: '你已退出,你的訊息不再被分析。用 /optin 重新加入。', action: { kind: 'optout' } }
    case '/optin':
      return { reply: '你已重新加入。', action: { kind: 'optin' as any } } // ponytail: optin = clear optout, handled in index
    case '/botoff':
      return { reply: '機器人已在此聊天室停用。用 /boton 重新啟用。', action: { kind: 'botoff' } }
    case '/boton':
      return { reply: '機器人已重新啟用 ✓', action: { kind: 'boton' } }
    case '/help':
    case '/start':
      return {
        reply: [
          '🛡️ 防衛語句翻譯機',
          '我會把聊天中的防衛性語句翻譯成底層需求,用你選的語氣回覆。',
          '',
          '指令:',
          '/tone friendly|humor|formal — 切換語氣',
          '/keyword add|remove|list — 管理關鍵字',
          '/optout /optin — 退出/重新加入分析',
          '/botoff /boton — 停用/啟用機器人(群組用)',
          '/help — 顯示此說明',
          '',
          '群組中:@我 或回覆我的訊息才會觸發分析。',
          '一對一:每則訊息都會分析。',
        ].join('\n'),
        action: { kind: 'help' },
      }
    default:
      return null
  }
}

function labelOf(tone: Tone): string {
  return { friendly: '友善', humor: '幽默', formal: '正式' }[tone]
}