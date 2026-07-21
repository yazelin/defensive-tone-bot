// 安全規則:危機訊息轉介、霸凌不翻譯、低信心沉默

export const CRISIS_RESOURCE = '如果需要找人談談,可以撥打衛福部安心專線 1925(依舊爱你),或 1995 生命線。你不是一個人。'

// 危機訊號關鍵詞(自傷/輕生)
const CRISIS_PATTERNS = [
  '自殺', '不想活', '想死', '了結自己', '輕生', '自殘', '活不下去',
  '沒有意義', '跳樓', '燒炭', '割腕', '了結生命', '結束一切',
  'suicide', 'kill myself', 'end my life',
]

export function hasCrisisSignal(text: string): boolean {
  return CRISIS_PATTERNS.some((p) => text.toLowerCase().includes(p.toLowerCase()))
}

// 霸凌/羞辱目的訊號(用翻譯來攻擊別人)
const BULLYING_PATTERNS = [
  '幫我翻譯他', '幫我分析他', '他在說什麼心態', '幫我嗆他', '幫我反擊',
  '幫我酸他', '幫我拆穿他', '分析一下他這句',   '他這句是什麼意思', '是什麼心態',
  '他是不是在', '幫我看看這個人',
]

export function hasBullyingIntent(text: string): boolean {
  const lower = text.toLowerCase().trim()
  return BULLYING_PATTERNS.some((p) => lower.includes(p))
}