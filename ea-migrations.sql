-- ============================================================================
-- EA TOKEN SERVICE DATABASE MIGRATIONS
-- ============================================================================
-- Run this SQL against your bartender.db to add required columns/tables
-- You can run this via: sqlite3 bartender.db < ea-migrations.sql
-- Or the install.bat will do it automatically
-- ============================================================================

-- Add access_token column to ea_accounts (stores EA bearer token)
ALTER TABLE ea_accounts ADD COLUMN access_token TEXT;

-- Add token_expires_at column to ea_accounts (when the token expires, ~4h)
ALTER TABLE ea_accounts ADD COLUMN token_expires_at DATETIME;

-- Add games_owned column to ea_accounts (JSON array of game IDs this account owns)
ALTER TABLE ea_accounts ADD COLUMN games_owned TEXT;

-- Create ea_generations table to track per-token cooldowns (5 per 24h rolling window)
CREATE TABLE IF NOT EXISTS ea_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    game_id INTEGER,
    ticket_id TEXT,
    user_id TEXT,
    username TEXT,
    game_name TEXT,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (account_id) REFERENCES ea_accounts(id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_ea_generations_account ON ea_generations(account_id);
CREATE INDEX IF NOT EXISTS idx_ea_generations_time ON ea_generations(generated_at);
CREATE INDEX IF NOT EXISTS idx_ea_generations_expires ON ea_generations(expires_at);

-- Verify columns exist (these will fail silently if columns already exist)
-- SQLite doesn't have IF NOT EXISTS for ALTER TABLE, so we handle errors gracefully
