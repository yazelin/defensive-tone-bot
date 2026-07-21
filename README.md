# 🛡️ 防衛語句翻譯機 — LINE Bot

> 願望池 #35「防衛性心態翻譯 LINE 機器人」實作。
>
> 偵測聊天中的防衛性語句,翻譯成底層需求,以你選的語氣(友善/幽默/正式)回覆。群組需 @mention 觸發,一對一自動分析。全年齡守則 + 危機轉介 + 霸凌防護 + 低信心沉默。

**線上 demo:** 加 LINE 好友 `@233ofgmj`

## 這是什麼

人吵架/防衛時,嘴巴講的跟心裡要的常常相反。防衛語句是殼,底層需求(被認可、被傾聽、被尊重)才是核心。這個 bot 幫你把殼剝開,看見需求,讓溝通不卡在防衛上。

**舉例:**
- 你說「關你什麼事」→ bot 翻譯:「或許你想保護自己的隱私?」
- 你說「反正你也不會懂」→ bot 翻譯:「或許你希望別人能理解你的感受?」

## 架構

```
LINE 使用者 → LINE Platform → webhook → Cloudflare Worker (Hono)
                                            ├─ 簽章驗證 (HMAC-SHA256 Web Crypto)
                                            ├─ 指令處理 (/tone /keyword /optout /botoff /help)
                                            ├─ 安全預檢 (危機/霸凌關鍵詞)
                                            ├─ LLM 分析 (Groq gpt-oss-120b)
                                            └─ D1 (設定類資料,對話零落庫)
```

- **Cloudflare Worker + Hono** — webhook 端點,零冷啟動
- **D1** — 只存設定類資料(語氣、關鍵字、optout、每日用量),**對話內容零落庫**
- **Groq gpt-oss-120b** — 防衛語句偵測 + 底層需求翻譯(OpenAI-compatible,可換 provider)
- **TDD** — 63 個 vitest 測試(真 D1 + mock LLM + mock LINE API)

## 快速開始

### 1. 建 LINE channel

到 [LINE Developers](https://developers.line.biz) 建立一個 Messaging API channel,拿到:
- **Channel secret** → `LINE_CHANNEL_SECRET`
- **Channel access token** (long-lived) → `LINE_CHANNEL_ACCESS_TOKEN`

### 2. 關閉 LINE 預設自動回覆

LINE 預設會開啟「自動回應訊息」,會擋住 webhook 回覆。必須關閉:
- 進 channel → 回應設定 → **自動回應訊息** → 關閉
- 回應方式改為「手動聊天」(不選「+自動回應訊息」)

### 3. 建 D1 + 部署

```bash
npm install
npx wrangler d1 create defensive-tone-bot   # 把印出的 database_id 貼進 wrangler.toml
npm run migrate:remote                        # 建表(含限流表)

npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put LLM_API_KEY           # Groq key: https://console.groq.com/keys

npm run deploy
```

### 4. 接上 LINE webhook

在 LINE channel 的 Messaging API 設定頁:
- **Webhook URL** 填:`https://defensive-tone-bot.<你的-subdomain>.workers.dev/webhook`
- 點「Verify」確認成功
- 開啟「Use webhook」
- 確認「Allow bot to join group chats」開啟(群組功能要用)

### 5. 測試

加 bot 為好友 → 發 `/help` 確認指令回應 → 發 `我隨便啦,不重要` 測試防衛語句翻譯。
群組中 @bot + 防衛語句 → 觸發分析。

## 指令

| 指令 | 說明 |
|---|---|
| `/tone friendly\|humor\|formal` | 切換語氣(預設友善) |
| `/keyword add\|remove\|list <詞>` | 管理自訂關鍵字 |
| `/optout` `/optin` | 退出/重新加入分析 |
| `/botoff` `/boton` | 停用/啟用機器人(群組用) |
| `/help` | 完整說明 |

## 安全設計

- **推測語氣**:一律「或許/也許」,絕不做人格或心理診斷斷言
- **低信心沉默**:不確定是否防衛 → 不回覆
- **危機轉介**:偵測自傷/輕生訊號 → 回覆安心專線 1925,不做診斷
- **霸凌防護**:偵測「幫我翻譯他/分析他」意圖 → 不翻譯,回中性提醒
- **全年齡守則**:不露骨、不暴力細節、不辱罵
- **群組第三方保護**:僅顯式觸發(@mention)、入群告知、/optout 退出
- **資料最小化**:資料庫只有設定,無任何訊息內容

## 防濫用

- **per-user 每日限流**:每人每天最多 20 次 LLM 分析,超額回覆限流提示
- **Groq 免費 tier**:30 req/分鐘、14,400 req/天(Groq 端擋,超量靜默不花錢)
- **LINE 簽章驗證**:外部無法偽造請求打 webhook

## 開發

```bash
npm test          # 63 測試全綠(vitest + 真 D1)
npm run typecheck # tsc 全綠
npm run dev       # 本機 + ngrok 接 LINE
```

### R1 驗收測試(20 句防衛 + 20 句非防衛)

需真實 Groq key 才會跑(用 test key 會 skip):

```bash
LLM_API_KEY=gsk_xxx npx vitest run test/acceptance.test.ts
```

驗收標準:防衛性 ≥16/20 產生合理翻譯且無人格斷言;非防衛性誤觸發 ≤4/20。

## 已知限制

- **Groq JSON mode bug**:gpt-oss-120b 的 `response_format: json_object` 回空字串,改用手動 `JSON.parse`(try/catch 容錯)。非 reasoning 模型(如 llama-3.3-70b)的 JSON mode 正常。
- **群組「回覆 bot」觸發**:LINE webhook 不含 reply-to 訊息,無法偵測「回覆 bot」,僅支援 @mention 觸發。
- **離線/無網路**:本工具需連線呼叫 LLM,不支援離線。

## 技術棧

- [Hono](https://hono.dev) — Cloudflare Worker web framework
- [Cloudflare D1](https://developers.cloudflare.com/d1/) — SQLite 資料庫
- [Groq](https://groq.com) — LLM 推論(gpt-oss-120b)
- [LINE Messaging API](https://developers.line.biz/) — webhook + 訊息回覆
- [vitest](https://vitest.dev) + [@cloudflare/vitest-pool-workers](https://github.com/cloudflare/workers-sdk) — TDD

## 授權

MIT — 願望池 #35 實作,by @yazelin + Copilot