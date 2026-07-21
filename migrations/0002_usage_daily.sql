-- 新增 usage_daily 表(per-user 每日限流)
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id    TEXT NOT NULL,
  date       TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);