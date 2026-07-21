# 🛡️ 防衛語句翻譯機 — LINE Bot

> 願望池 #35「防衛性心態翻譯 LINE 機器人」實作。
>
> 偵測聊天中的防衛性語句,翻譯成底層需求,以你選的語氣(友善/幽默/正式)回覆。群組需 @mention 觸發,一對一自動分析。全年齡守則 + 危機轉介 + 霸凌防護 + 低信心沉默。

## 架構

- **Cloudflare Worker + Hono** — webhook 端點,零冷啟動
- **D1** — 只存設定類資料(語氣、關鍵字、optout 名單),**對話內容零落庫**
- **Groq / OpenAI-compatible LLM** — 防衛語句偵測 + 底層需求翻譯(單次 JSON 回應)
- **TDD** — 60 個 vitest 測試(真 D1 + mock LLM + mock LINE API)

## 快速開始

### 1. 建 LINE channel

到 [LINE Developers](https://developers.line.biz) 建立一個 Messaging API channel,拿到:
- **Channel secret** → `LINE_CHANNEL_SECRET`
- **Channel access token** (long-lived) → `LINE_CHANNEL_ACCESS_TOKEN`

### 2. 建 D1 + 部署

```bash
npm install
npx wrangler d1 create defensive-tone-bot   # 把印出的 database_id 貼進 wrangler.toml
npm run migrate:remote                        # 建表

npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put LLM_API_KEY

npm run deploy
```

### 3. 接上 LINE webhook

在 LINE channel 的 Messaging API 設定頁,Webhook URL 填:
```
https://defensive-tone-bot.<你的-subdomain>.workers.dev/webhook
```
開啟「Use webhook」。

### 4. 測試

加 bot 為好友 → 發 `我隨便啦,不重要` → bot 回覆翻譯。
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

## 開發

```bash
npm test          # 60 個測試(vitest + 真 D1)
npm run typecheck # tsc 全綠
npm run dev       # 本機 + ngrok 接 LINE
```

## 授權

MIT — 願望池 #35 實作,by @yazelin + Copilot