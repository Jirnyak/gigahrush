-- Adding online sessions and hosting room columns
ALTER TABLE net_players ADD COLUMN total_sessions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE net_sessions ADD COLUMN hosting_room TEXT NOT NULL DEFAULT '';
