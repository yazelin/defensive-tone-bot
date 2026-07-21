-- 設定類資料(對話內容零落庫,依 R5 資料最小化)

CREATE TABLE IF NOT EXISTS chat_tones (
  chat_id   TEXT NOT NULL,
  tone      TEXT NOT NULL DEFAULT 'friendly',  -- friendly|humor|formal
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id)
);

CREATE TABLE IF NOT EXISTS optouts (
  chat_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS bot_off (
  chat_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id)
);

CREATE TABLE IF NOT EXISTS keywords (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    TEXT NOT NULL,        -- 'global' 或特定聊天室
  pattern    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- per-user 每日分析次數限制(防濫用耗光 LLM 額度)
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id    TEXT NOT NULL,
  date       TEXT NOT NULL,        -- YYYY-MM-DD
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);