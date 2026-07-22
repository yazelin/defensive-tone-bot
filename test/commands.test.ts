import { describe, it, expect } from 'vitest'
import { parseCommand } from '../src/commands'

describe('parseCommand', () => {
  it('non-command returns null', () => {
    expect(parseCommand('你好啊')).toBeNull()
    expect(parseCommand('')).toBeNull()
  })

  describe('bare-word help triggers (no slash required)', () => {
    it.each(['help', 'Help', '說明', '教學', '怎麼用', '指令', '功能'])('%s triggers /help', (word) => {
      const r = parseCommand(word)
      expect(r).not.toBeNull()
      expect(r!.action).toEqual({ kind: 'help' })
      expect(r!.reply).toContain('/tone')
    })
    it('does not fire on sentences that merely contain the word', () => {
      expect(parseCommand('可以幫我一下嗎,說明一下這個功能好嗎')).toBeNull()
    })
  })

  describe('/tone', () => {
    it('no arg shows current', () => {
      const r = parseCommand('/tone')
      expect(r).not.toBeNull()
      expect(r!.reply).toContain('friendly')
    })
    it('valid tone sets + replies confirm', () => {
      const r = parseCommand('/tone humor')
      expect(r!.action).toEqual({ kind: 'set_tone', tone: 'humor' })
      expect(r!.reply).toContain('幽默')
    })
    it('valid formal', () => {
      const r = parseCommand('/tone formal')
      expect(r!.action).toEqual({ kind: 'set_tone', tone: 'formal' })
    })
    it('invalid tone shows options', () => {
      const r = parseCommand('/tone angry')
      expect(r!.action).toBeUndefined()
      expect(r!.reply).toContain('friendly')
    })
  })

  describe('/keyword', () => {
    it('no arg shows usage', () => {
      const r = parseCommand('/keyword')
      expect(r!.reply).toContain('add')
    })
    it('add', () => {
      const r = parseCommand('/keyword add 隨便啦')
      expect(r!.action).toEqual({ kind: 'add_keyword', pattern: '隨便啦' })
      expect(r!.reply).toContain('隨便啦')
    })
    it('remove', () => {
      const r = parseCommand('/keyword remove 隨便啦')
      expect(r!.action).toEqual({ kind: 'remove_keyword', pattern: '隨便啦' })
    })
    it('list', () => {
      const r = parseCommand('/keyword list')
      expect(r!.action).toEqual({ kind: 'list_keywords' })
    })
  })

  describe('/optout /optin', () => {
    it('optout', () => {
      const r = parseCommand('/optout')
      expect(r!.action).toEqual({ kind: 'optout' })
    })
    it('optin', () => {
      const r = parseCommand('/optin')
      expect(r!.reply).toContain('重新加入')
    })
  })

  describe('/botoff /boton', () => {
    it('botoff', () => {
      const r = parseCommand('/botoff')
      expect(r!.action).toEqual({ kind: 'botoff' })
    })
    it('boton', () => {
      const r = parseCommand('/boton')
      expect(r!.action).toEqual({ kind: 'boton' })
    })
  })

  describe('/help', () => {
    it('help text', () => {
      const r = parseCommand('/help')
      expect(r!.reply).toContain('/tone')
      expect(r!.reply).toContain('防衛')
    })
  })
})