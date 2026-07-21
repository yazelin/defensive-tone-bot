import type { Tone } from './db'

export interface AnalysisResult {
  is_defensive: boolean
  confidence: 'high' | 'medium' | 'low'
  underlying_need: string
  reply: string | null  // null = 沉默(非防衛或低信心)
  safety: 'ok' | 'crisis' | 'bullying'
}

const TONE_GUIDE: Record<Tone, string> = {
  friendly: '友善同理:溫暖、不說教,像關心你的朋友。例:「或許你只是想被理解?」',
  humor: '幽默不酸人:輕盈點出需求,帶點溫柔的玩笑,不嘲弄對方。例:「其實你只是想找人喝杯酒吧?」',
  formal: '正式書面:平和、中性陳述底層需求,像專業調解。例:「此表達背後可能是需要被傾聽。」',
}

const SYSTEM_PROMPT = `你是一個「防衛語句翻譯器」,專門把聊天中防衛性的話翻譯成說話者底層的需求。全程使用台灣繁體中文。

規則:
1. 判斷輸入是否為「防衛性語句」(例如:推卸、否認、攻擊、冷嘲、裝沒事、合理化、轉移焦點,目的是保護自己不被看見)。
2. 若是防衛性語句,推測背後的真實需求,用指定的語氣包裝成一句回覆。
3. 回覆一律使用「推測語氣」(也許/或許/是不是),絕不做人格或心理狀態斷言,絕不包裝成心理診斷。
4. 非防衛性語句(純聊天、問句、陳述事實)→ is_defensive=false,reply=null(沉默)。
5. 信心不足(is_defensive 但看不太出需求)→ confidence=low,reply=null(沉默)。
6. 全年齡守則:不露骨、不暴力細節、不辱罵被分析者、不成人內容。
7. 若輸入含自傷/輕生訊號 → safety=crisis,reply=null(由程式接手轉介)。
8. 若輸入目的是用翻譯來攻擊/羞辱/分析「別人」(幫我翻譯他、他這句什麼心態)→ safety=bullying,reply=null(由程式接手)。

範例:

輸入:「關你什麼事」
輸出:{"is_defensive": true, "confidence": "high", "underlying_need": "想保護自己的隱私與界線", "reply": "或許你只是想守住自己的空間,被過問的感覺不太舒服吧?", "safety": "ok"}

輸入:「今天天氣不錯耶」
輸出:{"is_defensive": false, "confidence": "high", "underlying_need": "", "reply": null, "safety": "ok"}

輸入:「幫我翻譯他剛剛那句什麼心態」
輸出:{"is_defensive": false, "confidence": "high", "underlying_need": "", "reply": null, "safety": "bullying"}

輸入:「我隨便啦,你們決定就好」
輸出:{"is_defensive": true, "confidence": "medium", "underlying_need": "怕表達意見後被否定,乾脆放棄发言權", "reply": "或許你其實有想法,只是怕說了不被採納,乾脆先讓自己看起來不在乎?", "safety": "ok"}

輸入:「反正沒人在乎我說什麼」
輸出:{"is_defensive": true, "confidence": "high", "underlying_need": "渴望被傾聽、被重視", "reply": "或許你不是真的覺得沒人在乎,而是好幾次說了像沒說,讓你不想再試了?", "safety": "ok"}

回覆格式(JSON):
{"is_defensive": true/false, "confidence": "high|medium|low", "underlying_need": "一句話", "reply": "回覆句或null", "safety": "ok|crisis|bullying"}`

export async function analyze(
  text: string,
  tone: Tone,
  llmBase: string,
  llmModel: string,
  llmKey: string,
): Promise<AnalysisResult> {
  const res = await fetch(`${llmBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmKey}` },
    body: JSON.stringify({
      model: llmModel,
      temperature: 0.4,
      max_tokens: 800,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `語氣:${TONE_GUIDE[tone]}\n\n輸入句子:${text}` },
      ],
    }),
  })
  if (!res.ok) {
    // ponytail: LLM 失敗 = 沉默,不炸 webhook(不讓使用者看到錯誤)
    return { is_defensive: false, confidence: 'low', underlying_need: '', reply: null, safety: 'ok' }
  }
  const data = await res.json() as any
  const content = data?.choices?.[0]?.message?.content ?? ''
  try {
    const parsed = JSON.parse(content) as AnalysisResult
    return normalize(parsed, tone)
  } catch {
    return { is_defensive: false, confidence: 'low', underlying_need: '', reply: null, safety: 'ok' }
  }
}

function normalize(r: AnalysisResult, tone: Tone): AnalysisResult {
  // safety 由程式側 safety.ts 最終把關,不信 LLM 自報
  if (r.safety !== 'ok' && r.safety !== 'crisis' && r.safety !== 'bullying') r.safety = 'ok'
  if (r.confidence !== 'high' && r.confidence !== 'medium' && r.confidence !== 'low') r.confidence = 'low'
  // 低信心或非防衛 → 沉默
  if (!r.is_defensive || r.confidence === 'low') {
    return { ...r, reply: null }
  }
  // safety 非 ok → reply 交給程式接手
  if (r.safety !== 'ok') return { ...r, reply: null }
  // 回覆空字串也算沉默
  if (!r.reply || !r.reply.trim()) return { ...r, reply: null }
  return r
}

export const CRISIS_REPLY = '我注意到一些令人擔心的訊號。如果需要找人談談,可以撥打衛福部安心專線 1925(依舊爱你),或 1995 生命線。你不是一個人在面對這些。'
export const BULLYING_REPLY = '這個工具是把防衛語句翻譯成理解需求,不是用來分析或攻擊別人的喔。'