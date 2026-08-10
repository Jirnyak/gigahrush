-- Invasion matchmaking: pending invasion mark on a target session
ALTER TABLE net_sessions ADD COLUMN invaded_by TEXT NOT NULL DEFAULT '';
ALTER TABLE net_sessions ADD COLUMN invaded_at INTEGER NOT NULL DEFAULT 0;
