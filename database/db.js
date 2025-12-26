// ============================================================================
// BARTENDER BOT V2.2 - DATABASE MODULE - COMPLETE FIXED VERSION
// WITH TOKEN RESERVATION + TICKET LOGGING + ACTIVATIONS SUPPORT
// ============================================================================

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'bartender.db');
let db = null;

// ============================================================================
// INITIALIZATION - NOW CREATES ALL BASE TABLES
// ============================================================================

function initDatabase() {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = OFF');
    
    // ========================================================================
    // CORE TABLES - Create base tables first
    // ========================================================================
    
    // GAMES table
    db.exec(`
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT UNIQUE,
            game_name TEXT NOT NULL,
            folder_name TEXT,
            size_gb REAL DEFAULT 0,
            demand_type TEXT DEFAULT 'normal',
            cover_url TEXT,
            free_panel INTEGER DEFAULT 1,
            paid_panel INTEGER DEFAULT 0,
            panel_type TEXT DEFAULT 'free',
            hidden INTEGER DEFAULT 0,
            instructions TEXT,
            download_links TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // ACCOUNTS table
    db.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_number INTEGER,
            account_name TEXT,
            email TEXT,
            password TEXT,
            steam_id TEXT,
            enabled INTEGER DEFAULT 1,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // TOKENS table
    db.exec(`
        CREATE TABLE IF NOT EXISTS tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL,
            account_id INTEGER,
            token_number INTEGER,
            status TEXT DEFAULT 'available',
            used_at DATETIME,
            regenerates_at DATETIME,
            ticket_id TEXT,
            used_by_user_id TEXT,
            used_by_username TEXT,
            reserved_by_ticket TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
    `);
    
    // ACTIVATIONS table - NEW! For logging all Steam activations
    db.exec(`
        CREATE TABLE IF NOT EXISTS activations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT,
            user_id TEXT NOT NULL,
            username TEXT,
            game_id TEXT,
            game_name TEXT,
            token_id INTEGER,
            account_id INTEGER,
            account_name TEXT,
            success INTEGER DEFAULT 1,
            error_message TEXT,
            platform TEXT DEFAULT 'steam',
            activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // TICKETS table
    db.exec(`
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT UNIQUE NOT NULL,
            thread_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            username TEXT,
            game_id TEXT NOT NULL,
            is_refill INTEGER DEFAULT 0,
            steam_id TEXT,
            status TEXT DEFAULT 'open',
            screenshot_verified INTEGER DEFAULT 0,
            token_sent INTEGER DEFAULT 0,
            close_reason TEXT,
            platform TEXT DEFAULT 'steam',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            closed_at DATETIME
        )
    `);
        
    // COOLDOWNS table
    db.exec(`
        CREATE TABLE IF NOT EXISTS cooldowns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            cooldown_type TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
        
    // TRANSCRIPTS table
    db.exec(`
        CREATE TABLE IF NOT EXISTS transcripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT NOT NULL,
            thread_id TEXT,
            user_id TEXT NOT NULL,
            username TEXT,
            game_name TEXT,
            messages_json TEXT,
            platform TEXT DEFAULT 'steam',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // SERVER SETTINGS table
    db.exec(`
        CREATE TABLE IF NOT EXISTS server_settings (
            guild_id TEXT PRIMARY KEY,
            role_ids TEXT,
            ticket_channel_id TEXT,
            panel_message_id TEXT,
            panel_channel_id TEXT,
            panel_type TEXT DEFAULT 'free',
            ticket_log_channel_id TEXT,
            activation_log_channel_id TEXT,
            high_demand_message_id TEXT,
            ubisoft_ticket_channel_id TEXT,
            ubisoft_panel_message_id TEXT,
            ubisoft_panel_channel_id TEXT
        )
    `);
    
    // Migration: Add Ubisoft columns if they don't exist (for existing databases)
    try {
        db.exec(`ALTER TABLE server_settings ADD COLUMN ubisoft_ticket_channel_id TEXT`);
    } catch (e) { /* Column already exists */ }
    try {
        db.exec(`ALTER TABLE server_settings ADD COLUMN ubisoft_panel_message_id TEXT`);
    } catch (e) { /* Column already exists */ }
    try {
        db.exec(`ALTER TABLE server_settings ADD COLUMN ubisoft_panel_channel_id TEXT`);
    } catch (e) { /* Column already exists */ }
    
    // TICKET LOGS table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT,
            guild_id TEXT,
            guild_name TEXT,
            user_id TEXT,
            username TEXT,
            game_id TEXT,
            game_name TEXT,
            event_type TEXT NOT NULL,
            event_details TEXT,
            staff_member TEXT,
            staff_id TEXT,
            duration_minutes INTEGER,
            platform TEXT DEFAULT 'steam',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // AUDIT LOGS table
    db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            category TEXT,
            target_type TEXT,
            target_id TEXT,
            target_name TEXT,
            details TEXT,
            user_id TEXT,
            username TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // MACROS table
    db.exec(`
        CREATE TABLE IF NOT EXISTS macros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            color TEXT DEFAULT '#5865F2',
            emoji TEXT DEFAULT '📝',
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // HIGH DEMAND PANELS table
    db.exec(`
        CREATE TABLE IF NOT EXISTS high_demand_panels (
            guild_id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // ========================================================================
    // INDEXES
    // ========================================================================
    
    try {
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
            CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
            CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);
            CREATE INDEX IF NOT EXISTS idx_cooldowns_user_guild ON cooldowns(user_id, guild_id);
            CREATE INDEX IF NOT EXISTS idx_transcripts_ticket ON transcripts(ticket_id);
            CREATE INDEX IF NOT EXISTS idx_tokens_game ON tokens(game_id);
            CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
            CREATE INDEX IF NOT EXISTS idx_activations_user ON activations(user_id);
            CREATE INDEX IF NOT EXISTS idx_activations_game ON activations(game_id);
            CREATE INDEX IF NOT EXISTS idx_ticket_logs_user ON ticket_logs(user_id);
            CREATE INDEX IF NOT EXISTS idx_ticket_logs_event ON ticket_logs(event_type);
        `);
    } catch (e) {}
    
    // ========================================================================
    // MIGRATIONS - Add missing columns to existing tables
    // ========================================================================
    
    // Migrate: Add steam_id column if it doesn't exist
    try {
        const tableInfo = db.prepare("PRAGMA table_info(tickets)").all();
        const hasSteamId = tableInfo.some(col => col.name === 'steam_id');
        if (!hasSteamId) {
            db.exec("ALTER TABLE tickets ADD COLUMN steam_id TEXT");
            console.log('✅ Added steam_id column to tickets table');
        }
        const hasPlatform = tableInfo.some(col => col.name === 'platform');
        if (!hasPlatform) {
            db.exec("ALTER TABLE tickets ADD COLUMN platform TEXT DEFAULT 'steam'");
            console.log('✅ Added platform column to tickets table');
        }
    } catch (e) {}
    
    // Migrate: Add platform column to ticket_logs
    try {
        const ticketLogsInfo = db.prepare("PRAGMA table_info(ticket_logs)").all();
        const ticketLogsColumns = ticketLogsInfo.map(col => col.name);
        if (!ticketLogsColumns.includes('platform')) {
            db.exec("ALTER TABLE ticket_logs ADD COLUMN platform TEXT DEFAULT 'steam'");
            console.log('✅ Added platform column to ticket_logs table');
        }
    } catch (e) {
        console.log('⚠️ ticket_logs migration:', e.message);
    }
    
    // Migrate: Add missing columns to audit_logs
    try {
        const auditLogsInfo = db.prepare("PRAGMA table_info(audit_logs)").all();
        const auditLogsColumns = auditLogsInfo.map(col => col.name);
        if (!auditLogsColumns.includes('category')) {
            db.exec("ALTER TABLE audit_logs ADD COLUMN category TEXT DEFAULT 'general'");
            console.log('✅ Added category column to audit_logs table');
        }
    } catch (e) {
        console.log('⚠️ audit_logs migration:', e.message);
    }
    
    // Migrate: Ensure accounts has enabled and steam_id columns and fix NULL values
    try {
        const accountsInfo = db.prepare("PRAGMA table_info(accounts)").all();
        const accountsColumns = accountsInfo.map(col => col.name);
        if (!accountsColumns.includes('enabled')) {
            db.exec("ALTER TABLE accounts ADD COLUMN enabled INTEGER DEFAULT 1");
            console.log('✅ Added enabled column to accounts table');
        }
        if (!accountsColumns.includes('steam_id')) {
            db.exec("ALTER TABLE accounts ADD COLUMN steam_id TEXT");
            console.log('✅ Added steam_id column to accounts table');
        }
        if (!accountsColumns.includes('email')) {
            db.exec("ALTER TABLE accounts ADD COLUMN email TEXT");
            console.log('✅ Added email column to accounts table');
        }
        if (!accountsColumns.includes('password')) {
            db.exec("ALTER TABLE accounts ADD COLUMN password TEXT");
            console.log('✅ Added password column to accounts table');
        }
        if (!accountsColumns.includes('notes')) {
            db.exec("ALTER TABLE accounts ADD COLUMN notes TEXT");
            console.log('✅ Added notes column to accounts table');
        }
        db.exec("UPDATE accounts SET enabled = 1 WHERE enabled IS NULL");
    } catch (e) {
        console.log('⚠️ accounts migration:', e.message);
    }
    
    // Migrate: Add token tracking columns
    try {
        const tokenInfo = db.prepare("PRAGMA table_info(tokens)").all();
        const columns = tokenInfo.map(col => col.name);
        
        if (!columns.includes('used_at')) {
            db.exec("ALTER TABLE tokens ADD COLUMN used_at DATETIME");
            console.log('✅ Added used_at column to tokens table');
        }
        if (!columns.includes('regenerates_at')) {
            db.exec("ALTER TABLE tokens ADD COLUMN regenerates_at DATETIME");
            console.log('✅ Added regenerates_at column to tokens table');
        }
        if (!columns.includes('ticket_id')) {
            db.exec("ALTER TABLE tokens ADD COLUMN ticket_id TEXT");
            console.log('✅ Added ticket_id column to tokens table');
        }
        if (!columns.includes('used_by_user_id')) {
            db.exec("ALTER TABLE tokens ADD COLUMN used_by_user_id TEXT");
            console.log('✅ Added used_by_user_id column to tokens table');
        }
        if (!columns.includes('used_by_username')) {
            db.exec("ALTER TABLE tokens ADD COLUMN used_by_username TEXT");
            console.log('✅ Added used_by_username column to tokens table');
        }
        if (!columns.includes('reserved_by_ticket')) {
            db.exec("ALTER TABLE tokens ADD COLUMN reserved_by_ticket TEXT");
            console.log('✅ Added reserved_by_ticket column to tokens table');
        }
    } catch (e) {
        console.log('⚠️ Token migration:', e.message);
    }
    
    // Migrate games table
    try {
        const gamesColumns = db.pragma('table_info(games)').map(c => c.name);
        if (!gamesColumns.includes('size_gb')) {
            db.exec("ALTER TABLE games ADD COLUMN size_gb REAL DEFAULT 0");
            console.log('✅ Added size_gb column to games table');
        }
        if (!gamesColumns.includes('demand_type')) {
            db.exec("ALTER TABLE games ADD COLUMN demand_type TEXT DEFAULT 'normal'");
            console.log('✅ Added demand_type column to games table');
        }
        if (!gamesColumns.includes('cover_url')) {
            db.exec("ALTER TABLE games ADD COLUMN cover_url TEXT");
            console.log('✅ Added cover_url column to games table');
        }
        if (!gamesColumns.includes('free_panel')) {
            db.exec("ALTER TABLE games ADD COLUMN free_panel INTEGER DEFAULT 1");
            console.log('✅ Added free_panel column to games table');
        }
        if (!gamesColumns.includes('hidden')) {
            db.exec("ALTER TABLE games ADD COLUMN hidden INTEGER DEFAULT 0");
            console.log('✅ Added hidden column to games table');
        }
        if (!gamesColumns.includes('folder_name')) {
            db.exec("ALTER TABLE games ADD COLUMN folder_name TEXT");
            console.log('✅ Added folder_name column to games table');
        }
        if (!gamesColumns.includes('paid_panel')) {
            db.exec("ALTER TABLE games ADD COLUMN paid_panel INTEGER DEFAULT 0");
            console.log('✅ Added paid_panel column to games table');
        }
        if (!gamesColumns.includes('panel_type')) {
            db.exec("ALTER TABLE games ADD COLUMN panel_type TEXT DEFAULT 'free'");
            console.log('✅ Added panel_type column to games table');
        }
        if (!gamesColumns.includes('download_links')) {
            db.exec("ALTER TABLE games ADD COLUMN download_links TEXT");
            console.log('✅ Added download_links column to games table');
        }
        
        // Sync free_panel/paid_panel with panel_type for existing games
        db.exec(`
            UPDATE games SET free_panel = 1 WHERE panel_type = 'free' AND (free_panel IS NULL OR free_panel = 0);
            UPDATE games SET free_panel = 1 WHERE panel_type = 'both' AND (free_panel IS NULL OR free_panel = 0);
            UPDATE games SET paid_panel = 1 WHERE panel_type = 'paid' AND (paid_panel IS NULL OR paid_panel = 0);
            UPDATE games SET paid_panel = 1 WHERE panel_type = 'both' AND (paid_panel IS NULL OR paid_panel = 0);
            UPDATE games SET free_panel = 0 WHERE panel_type = 'paid' AND free_panel = 1;
            UPDATE games SET paid_panel = 0 WHERE panel_type = 'free' AND paid_panel = 1;
        `);
        console.log('✅ Synced free_panel/paid_panel with panel_type');
    } catch (e) {
        console.log('⚠️ Games migration:', e.message);
    }
    
    // Migrate server_settings table
    try {
        const serverSettingsColumns = db.pragma('table_info(server_settings)').map(c => c.name);
        if (!serverSettingsColumns.includes('role_ids')) {
            db.exec("ALTER TABLE server_settings ADD COLUMN role_ids TEXT");
        }
        if (!serverSettingsColumns.includes('ticket_channel_id')) {
            db.exec("ALTER TABLE server_settings ADD COLUMN ticket_channel_id TEXT");
        }
        if (!serverSettingsColumns.includes('panel_message_id')) {
            db.exec("ALTER TABLE server_settings ADD COLUMN panel_message_id TEXT");
        }
        if (!serverSettingsColumns.includes('panel_channel_id')) {
            db.exec("ALTER TABLE server_settings ADD COLUMN panel_channel_id TEXT");
        }
        if (!serverSettingsColumns.includes('panel_type')) {
            db.exec("ALTER TABLE server_settings ADD COLUMN panel_type TEXT DEFAULT 'free'");
        }
        if (!serverSettingsColumns.includes('ticket_log_channel_id')) {
            db.exec("ALTER TABLE server_settings ADD COLUMN ticket_log_channel_id TEXT");
        }
        if (!serverSettingsColumns.includes('activation_log_channel_id')) {
            db.exec("ALTER TABLE server_settings ADD COLUMN activation_log_channel_id TEXT");
        }
        if (!serverSettingsColumns.includes('high_demand_message_id')) {
            db.exec("ALTER TABLE server_settings ADD COLUMN high_demand_message_id TEXT");
        }
    } catch (e) {
        console.log('⚠️ Server settings migration:', e.message);
    }
    
    // Migrate transcripts table
    try {
        const transcriptInfo = db.prepare("PRAGMA table_info(transcripts)").all();
        const transcriptCols = transcriptInfo.map(col => col.name);
        
        if (!transcriptCols.includes('thread_id')) {
            db.exec("ALTER TABLE transcripts ADD COLUMN thread_id TEXT");
        }
        if (!transcriptCols.includes('username')) {
            db.exec("ALTER TABLE transcripts ADD COLUMN username TEXT");
        }
        if (!transcriptCols.includes('game_name')) {
            db.exec("ALTER TABLE transcripts ADD COLUMN game_name TEXT");
        }
        if (!transcriptCols.includes('messages_json')) {
            db.exec("ALTER TABLE transcripts ADD COLUMN messages_json TEXT");
        }
        if (!transcriptCols.includes('platform')) {
            db.exec("ALTER TABLE transcripts ADD COLUMN platform TEXT DEFAULT 'steam'");
        }
    } catch (e) {}
    
    // ============================================================================
    // UBISOFT TABLES
    // ============================================================================
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS ubisoft_games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_name TEXT NOT NULL,
            uplay_app_id INTEGER,
            steam_app_id INTEGER,
            panel_type TEXT DEFAULT 'free',
            demand_type TEXT DEFAULT 'normal',
            token_format TEXT DEFAULT 'legacy',
            download_links TEXT,
            instructions TEXT,
            cover_url TEXT,
            size_gb REAL,
            folder_name TEXT,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS ubisoft_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_name TEXT NOT NULL,
            email TEXT NOT NULL,
            password TEXT NOT NULL,
            exe_index INTEGER,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS ubisoft_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            game_id INTEGER NOT NULL,
            reserved_by_ticket TEXT,
            last_used_at DATETIME,
            used_by_user_id TEXT,
            used_by_username TEXT,
            used_in_ticket TEXT,
            FOREIGN KEY (account_id) REFERENCES ubisoft_accounts(id),
            FOREIGN KEY (game_id) REFERENCES ubisoft_games(id)
        );
        
        CREATE TABLE IF NOT EXISTS ubisoft_activations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_id INTEGER,
            account_id INTEGER,
            game_id INTEGER,
            user_id TEXT,
            username TEXT,
            ticket_id TEXT,
            success INTEGER DEFAULT 1,
            error_message TEXT,
            activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS ubisoft_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT UNIQUE NOT NULL,
            thread_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            username TEXT,
            game_id INTEGER NOT NULL,
            status TEXT DEFAULT 'open',
            queue_position INTEGER,
            account_id INTEGER,
            verification_status TEXT DEFAULT 'pending',
            close_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            closed_at DATETIME,
            FOREIGN KEY (game_id) REFERENCES ubisoft_games(id),
            FOREIGN KEY (account_id) REFERENCES ubisoft_accounts(id)
        );
        
        CREATE TABLE IF NOT EXISTS ubisoft_server_settings (
            guild_id TEXT PRIMARY KEY,
            ticket_channel_id TEXT,
            panel_message_id TEXT,
            panel_channel_id TEXT,
            staff_role_ids TEXT,
            log_channel_id TEXT,
            exe_path TEXT DEFAULT 'ubisoft/DenuvoTicket.exe',
            token_folder TEXT DEFAULT 'ubisoft/token/',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_ubisoft_tokens_game ON ubisoft_tokens(game_id);
        CREATE INDEX IF NOT EXISTS idx_ubisoft_tokens_account ON ubisoft_tokens(account_id);
        CREATE INDEX IF NOT EXISTS idx_ubisoft_activations_user ON ubisoft_activations(user_id);
        CREATE INDEX IF NOT EXISTS idx_ubisoft_tickets_user ON ubisoft_tickets(user_id);
        CREATE INDEX IF NOT EXISTS idx_ubisoft_tickets_status ON ubisoft_tickets(status);
    `);
    
    // Migration: Add missing columns to ubisoft_games if they don't exist
    try {
        db.exec(`ALTER TABLE ubisoft_games ADD COLUMN demand_type TEXT DEFAULT 'normal'`);
        console.log('✅ Added demand_type column to ubisoft_games');
    } catch (e) { /* Column already exists */ }
    try {
        db.exec(`ALTER TABLE ubisoft_games ADD COLUMN size_gb REAL`);
    } catch (e) { /* Column already exists */ }
    try {
        db.exec(`ALTER TABLE ubisoft_games ADD COLUMN folder_name TEXT`);
    } catch (e) { /* Column already exists */ }
    try {
        db.exec(`ALTER TABLE ubisoft_games ADD COLUMN token_format TEXT DEFAULT 'legacy'`);
        console.log('✅ Added token_format column to ubisoft_games');
    } catch (e) { /* Column already exists */ }
    try {
        db.exec(`ALTER TABLE ubisoft_games ADD COLUMN download_links TEXT`);
        console.log('✅ Added download_links column to ubisoft_games');
    } catch (e) { /* Column already exists */ }
    try {
        db.exec(`ALTER TABLE ubisoft_games ADD COLUMN instructions TEXT`);
        console.log('✅ Added instructions column to ubisoft_games');
    } catch (e) { /* Column already exists */ }
    
    // Migration: Add exe_index to ubisoft_accounts
    try {
        db.exec(`ALTER TABLE ubisoft_accounts ADD COLUMN exe_index INTEGER`);
        console.log('✅ Added exe_index column to ubisoft_accounts');
    } catch (e) { /* Column already exists */ }
    
    // Migration: Add reserved_by_ticket to ubisoft_tokens
    try {
        db.exec(`ALTER TABLE ubisoft_tokens ADD COLUMN reserved_by_ticket TEXT`);
        console.log('✅ Added reserved_by_ticket column to ubisoft_tokens');
    } catch (e) { /* Column already exists */ }
    
    // Migration: Add regenerates_at to ubisoft_tokens for 24-hour regeneration
    try {
        db.exec(`ALTER TABLE ubisoft_tokens ADD COLUMN regenerates_at DATETIME`);
        console.log('✅ Added regenerates_at column to ubisoft_tokens');
    } catch (e) { /* Column already exists */ }
    
    // ============================================================================
    // EA TABLES
    // ============================================================================
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS ea_games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_name TEXT NOT NULL,
            content_id TEXT,
            panel_type TEXT DEFAULT 'free',
            demand_type TEXT DEFAULT 'normal',
            download_links TEXT,
            instructions TEXT,
            cover_url TEXT,
            size_gb REAL,
            folder_name TEXT,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS ea_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_name TEXT NOT NULL,
            tcno_id TEXT,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS ea_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            game_id INTEGER NOT NULL,
            reserved_by_ticket TEXT,
            last_used_at DATETIME,
            used_by_user_id TEXT,
            used_by_username TEXT,
            used_in_ticket TEXT,
            FOREIGN KEY (account_id) REFERENCES ea_accounts(id),
            FOREIGN KEY (game_id) REFERENCES ea_games(id)
        );
        
        CREATE TABLE IF NOT EXISTS ea_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT UNIQUE NOT NULL,
            thread_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            username TEXT,
            game_id INTEGER NOT NULL,
            status TEXT DEFAULT 'open',
            account_id INTEGER,
            verification_status TEXT DEFAULT 'pending',
            verification_result TEXT,
            token_request_content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            closed_at DATETIME,
            closed_reason TEXT
        );
        
        CREATE TABLE IF NOT EXISTS ea_activations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_id INTEGER,
            account_id INTEGER,
            game_id INTEGER,
            user_id TEXT,
            username TEXT,
            ticket_id TEXT,
            success INTEGER DEFAULT 1,
            error_message TEXT,
            activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS ea_transcripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT,
            thread_id TEXT,
            user_id TEXT,
            username TEXT,
            game_name TEXT,
            transcript TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS ea_panel_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            panel_type TEXT NOT NULL,
            channel_id TEXT,
            message_id TEXT,
            ticket_channel_id TEXT,
            UNIQUE(guild_id, panel_type)
        );
        
        CREATE TABLE IF NOT EXISTS ubisoft_panel_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            panel_type TEXT NOT NULL,
            channel_id TEXT,
            message_id TEXT,
            ticket_channel_id TEXT,
            UNIQUE(guild_id, panel_type)
        );
        
        CREATE TABLE IF NOT EXISTS dashboard_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'staff',
            last_login DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    // Migration: Add missing columns to ea_accounts
    try {
        const eaAccountsInfo = db.prepare("PRAGMA table_info(ea_accounts)").all();
        const eaAccountsCols = eaAccountsInfo.map(col => col.name);
        if (!eaAccountsCols.includes('tcno_id')) {
            db.exec("ALTER TABLE ea_accounts ADD COLUMN tcno_id TEXT");
            console.log('✅ Added tcno_id column to ea_accounts table');
        }
        if (!eaAccountsCols.includes('enabled')) {
            db.exec("ALTER TABLE ea_accounts ADD COLUMN enabled INTEGER DEFAULT 1");
            console.log('✅ Added enabled column to ea_accounts table');
        }
    } catch (e) {
        console.log('⚠️ ea_accounts migration:', e.message);
    }
    
    // Migration: Add missing columns to ea_tokens
    try {
        const eaTokensInfo = db.prepare("PRAGMA table_info(ea_tokens)").all();
        const eaTokensCols = eaTokensInfo.map(col => col.name);
        if (!eaTokensCols.includes('regenerates_at')) {
            db.exec("ALTER TABLE ea_tokens ADD COLUMN regenerates_at DATETIME");
            console.log('✅ Added regenerates_at column to ea_tokens table');
        }
        if (!eaTokensCols.includes('reserved_by_ticket')) {
            db.exec("ALTER TABLE ea_tokens ADD COLUMN reserved_by_ticket TEXT");
            console.log('✅ Added reserved_by_ticket column to ea_tokens table');
        }
    } catch (e) {
        console.log('⚠️ ea_tokens migration:', e.message);
    }
    
    // Migration: Add missing columns to ea_games
    try {
        const eaGamesInfo = db.prepare("PRAGMA table_info(ea_games)").all();
        const eaGamesCols = eaGamesInfo.map(col => col.name);
        if (!eaGamesCols.includes('panel_type')) {
            db.exec("ALTER TABLE ea_games ADD COLUMN panel_type TEXT DEFAULT 'free'");
            console.log('✅ Added panel_type column to ea_games table');
        }
        if (!eaGamesCols.includes('download_links')) {
            db.exec("ALTER TABLE ea_games ADD COLUMN download_links TEXT");
            console.log('✅ Added download_links column to ea_games table');
        }
        if (!eaGamesCols.includes('instructions')) {
            db.exec("ALTER TABLE ea_games ADD COLUMN instructions TEXT");
            console.log('✅ Added instructions column to ea_games table');
        }
        if (!eaGamesCols.includes('size_gb')) {
            db.exec("ALTER TABLE ea_games ADD COLUMN size_gb REAL");
            console.log('✅ Added size_gb column to ea_games table');
        }
        if (!eaGamesCols.includes('folder_name')) {
            db.exec("ALTER TABLE ea_games ADD COLUMN folder_name TEXT");
            console.log('✅ Added folder_name column to ea_games table');
        }
        if (!eaGamesCols.includes('demand_type')) {
            db.exec("ALTER TABLE ea_games ADD COLUMN demand_type TEXT DEFAULT 'normal'");
            console.log('✅ Added demand_type column to ea_games table');
        }
        if (!eaGamesCols.includes('cover_url')) {
            db.exec("ALTER TABLE ea_games ADD COLUMN cover_url TEXT");
            console.log('✅ Added cover_url column to ea_games table');
        }
        if (!eaGamesCols.includes('enabled')) {
            db.exec("ALTER TABLE ea_games ADD COLUMN enabled INTEGER DEFAULT 1");
            console.log('✅ Added enabled column to ea_games table');
        }
    } catch (e) {
        console.log('⚠️ ea_games migration:', e.message);
    }
    
    // Migration: Add game_name column to ea_activations
    try {
        const eaActInfo = db.prepare("PRAGMA table_info(ea_activations)").all();
        const eaActCols = eaActInfo.map(col => col.name);
        if (!eaActCols.includes('game_name')) {
            db.exec("ALTER TABLE ea_activations ADD COLUMN game_name TEXT");
            console.log('✅ Added game_name column to ea_activations table');
        }
    } catch (e) {
        console.log('⚠️ ea_activations migration:', e.message);
    }
    
    // Migration: Add game_name column to ubisoft_activations
    try {
        const ubiActInfo = db.prepare("PRAGMA table_info(ubisoft_activations)").all();
        const ubiActCols = ubiActInfo.map(col => col.name);
        if (!ubiActCols.includes('game_name')) {
            db.exec("ALTER TABLE ubisoft_activations ADD COLUMN game_name TEXT");
            console.log('✅ Added game_name column to ubisoft_activations table');
        }
    } catch (e) {
        console.log('⚠️ ubisoft_activations migration:', e.message);
    }
    
    // Create default admin user if none exists
    try {
        const adminExists = db.prepare('SELECT COUNT(*) as count FROM dashboard_users').get();
        if (adminExists.count === 0) {
            const crypto = require('crypto');
            const defaultPassword = crypto.createHash('sha256').update('admin' + 'bartender_salt').digest('hex');
            db.prepare('INSERT INTO dashboard_users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', defaultPassword, 'admin');
            console.log('✅ Created default admin user (username: admin, password: admin)');
        }
    } catch (e) {
        console.log('Dashboard users check:', e.message);
    }
    
    console.log('✅ Database initialized with all tables');
    return db;
}

// ============================================================================
// GAMES
// ============================================================================

function getAllGames() {
    const stmt = db.prepare('SELECT *, (CASE WHEN hidden = 1 THEN 0 ELSE 1 END) as enabled FROM games ORDER BY game_name ASC');
    return stmt.all();
}

function getGame(gameId) {
    if (typeof gameId === 'number' || /^\d+$/.test(gameId)) {
        const stmt = db.prepare('SELECT *, (CASE WHEN hidden = 1 THEN 0 ELSE 1 END) as enabled FROM games WHERE id = ?');
        return stmt.get(parseInt(gameId));
    } else {
        const stmt = db.prepare('SELECT *, (CASE WHEN hidden = 1 THEN 0 ELSE 1 END) as enabled FROM games WHERE game_id = ?');
        return stmt.get(gameId);
    }
}

function getGameById(id) {
    const stmt = db.prepare('SELECT *, (CASE WHEN hidden = 1 THEN 0 ELSE 1 END) as enabled FROM games WHERE id = ?');
    return stmt.get(id);
}

function getGameBySlug(gameId) {
    const stmt = db.prepare('SELECT *, (CASE WHEN hidden = 1 THEN 0 ELSE 1 END) as enabled FROM games WHERE game_id = ?');
    return stmt.get(gameId);
}

function addGame(gameIdOrData, gameName, sizeGb = 0, demandType = 'normal', coverUrl = null) {
    // Support both old positional args and new object format
    if (typeof gameIdOrData === 'object' && gameIdOrData !== null) {
        const data = gameIdOrData;
        const panelType = data.panel_type || 'free';
        const freePanel = (panelType === 'free' || panelType === 'both') ? 1 : 0;
        const paidPanel = (panelType === 'paid' || panelType === 'both') ? 1 : 0;
        
        const stmt = db.prepare(`
            INSERT INTO games (game_id, game_name, folder_name, size_gb, demand_type, cover_url, panel_type, free_panel, paid_panel, instructions, download_links)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            data.app_id || data.game_id || null,
            data.game_name,
            data.folder_name || null,
            parseFloat(data.size_gb) || 0,
            data.demand_type || 'normal',
            data.cover_url || null,
            panelType,
            freePanel,
            paidPanel,
            data.instructions || null,
            data.download_links || null
        );
    }
    
    // Legacy positional args format
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO games (game_id, game_name, size_gb, demand_type, cover_url, free_panel)
        VALUES (?, ?, ?, ?, ?, 1)
    `);
    return stmt.run(gameIdOrData, gameName, sizeGb, demandType, coverUrl);
}

function updateGame(id, data) {
    try {
        console.log(`[DB] updateGame(${id}):`, JSON.stringify(data));
        
        // Calculate free_panel and paid_panel from panel_type
        let freePanel = null;
        let paidPanel = null;
        if (data.panel_type) {
            freePanel = (data.panel_type === 'free' || data.panel_type === 'both') ? 1 : 0;
            paidPanel = (data.panel_type === 'paid' || data.panel_type === 'both') ? 1 : 0;
        }
        
        const stmt = db.prepare(`
            UPDATE games SET 
                game_name = COALESCE(?, game_name),
                game_id = COALESCE(?, game_id),
                folder_name = ?,
                size_gb = COALESCE(?, size_gb),
                demand_type = COALESCE(?, demand_type),
                cover_url = ?,
                panel_type = COALESCE(?, panel_type),
                free_panel = COALESCE(?, free_panel),
                paid_panel = COALESCE(?, paid_panel),
                instructions = ?,
                download_links = ?,
                hidden = COALESCE(?, hidden)
            WHERE id = ?
        `);
        const result = stmt.run(
            data.game_name || null,
            data.app_id || data.game_id || null,
            data.folder_name || null,
            parseFloat(data.size_gb) || null,
            data.demand_type || null,
            data.cover_url || null,
            data.panel_type || null,
            freePanel,
            paidPanel,
            data.instructions || null,
            data.download_links || null,
            data.enabled === undefined ? null : (data.enabled ? 0 : 1),  // hidden is opposite of enabled
            id
        );
        console.log(`[DB] updateGame result: ${result.changes} rows updated`);
        return result;
    } catch (e) {
        console.error('[DB] updateGame error:', e.message);
        return null;
    }
}

function deleteGame(id) {
    try {
        const stmt = db.prepare('DELETE FROM games WHERE id = ?');
        return stmt.run(id);
    } catch (e) {
        console.error('[DB] deleteGame error:', e.message);
        return null;
    }
}

function updateGameSize(gameId, sizeGb) {
    const stmt = db.prepare('UPDATE games SET size_gb = ? WHERE game_id = ?');
    return stmt.run(sizeGb, gameId);
}

function updateGameSizeByName(gameName, sizeGb) {
    console.log(`[DB] updateGameSizeByName: "${gameName}" -> ${sizeGb} GB`);
    
    function normalize(str) {
        return str.toLowerCase()
            .replace(/[&\-:;.,'"!?()]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    let stmt = db.prepare('UPDATE games SET size_gb = ? WHERE game_name = ?');
    let result = stmt.run(sizeGb, gameName);
    if (result.changes > 0) return result;
    
    stmt = db.prepare('UPDATE games SET size_gb = ? WHERE LOWER(game_name) = LOWER(?)');
    result = stmt.run(sizeGb, gameName);
    if (result.changes > 0) return result;
    
    const allGames = db.prepare('SELECT id, game_name FROM games').all();
    const normalizedInput = normalize(gameName);
    
    for (const game of allGames) {
        const normalizedDb = normalize(game.game_name);
        if (normalizedDb === normalizedInput) {
            stmt = db.prepare('UPDATE games SET size_gb = ? WHERE id = ?');
            return stmt.run(sizeGb, game.id);
        }
        if (normalizedDb.includes(normalizedInput) || normalizedInput.includes(normalizedDb)) {
            const shorter = normalizedDb.length < normalizedInput.length ? normalizedDb : normalizedInput;
            const longer = normalizedDb.length >= normalizedInput.length ? normalizedDb : normalizedInput;
            if (shorter.length >= longer.length * 0.7) {
                stmt = db.prepare('UPDATE games SET size_gb = ? WHERE id = ?');
                return stmt.run(sizeGb, game.id);
            }
        }
    }
    
    return { changes: 0 };
}

function setHighDemand(gameIdOrName, isHighDemand) {
    let stmt = db.prepare('UPDATE games SET demand_type = ? WHERE game_id = ?');
    let result = stmt.run(isHighDemand ? 'high' : 'normal', gameIdOrName);
    
    if (result.changes === 0) {
        stmt = db.prepare('UPDATE games SET demand_type = ? WHERE game_name = ?');
        result = stmt.run(isHighDemand ? 'high' : 'normal', gameIdOrName);
    }
    
    if (result.changes === 0) {
        stmt = db.prepare('UPDATE games SET demand_type = ? WHERE LOWER(game_name) = LOWER(?)');
        result = stmt.run(isHighDemand ? 'high' : 'normal', gameIdOrName);
    }
    
    return result;
}

function setFreePanel(gameIdOrName, showOnFreePanel) {
    const value = showOnFreePanel ? 1 : 0;
    
    let stmt = db.prepare('UPDATE games SET free_panel = ? WHERE game_id = ?');
    let result = stmt.run(value, gameIdOrName);
    
    if (result.changes === 0) {
        stmt = db.prepare('UPDATE games SET free_panel = ? WHERE game_name = ?');
        result = stmt.run(value, gameIdOrName);
    }
    
    if (result.changes === 0) {
        stmt = db.prepare('UPDATE games SET free_panel = ? WHERE LOWER(game_name) = LOWER(?)');
        result = stmt.run(value, gameIdOrName);
    }
    
    return result;
}

function getFreePanelGames() {
    const stmt = db.prepare('SELECT *, (CASE WHEN hidden = 1 THEN 0 ELSE 1 END) as enabled FROM games WHERE free_panel = 1 AND (hidden = 0 OR hidden IS NULL) ORDER BY game_name ASC');
    return stmt.all();
}

function getPaidPanelGames() {
    const stmt = db.prepare('SELECT *, (CASE WHEN hidden = 1 THEN 0 ELSE 1 END) as enabled FROM games WHERE (hidden = 0 OR hidden IS NULL) ORDER BY game_name ASC');
    return stmt.all();
}

function setGameHidden(gameIdOrName, hidden) {
    const value = hidden ? 1 : 0;
    let result;
    
    if (typeof gameIdOrName === 'number') {
        const stmt = db.prepare('UPDATE games SET hidden = ? WHERE id = ?');
        result = stmt.run(value, gameIdOrName);
    } else {
        const stmt = db.prepare('UPDATE games SET hidden = ? WHERE game_id = ?');
        result = stmt.run(value, gameIdOrName);
    }
    
    return result;
}

function getHighDemandGames() {
    try {
        const stmt = db.prepare("SELECT *, (CASE WHEN hidden = 1 THEN 0 ELSE 1 END) as enabled FROM games WHERE demand_type = 'high' ORDER BY game_name ASC");
        return stmt.all();
    } catch (e) {
        console.error('[DB] getHighDemandGames error:', e.message);
        return [];
    }
}

// ============================================================================
// TOKENS - WITH RESERVATION SYSTEM
// ============================================================================

function getAvailableTokenCount(gameId) {
    if (!gameId) {
        const stmt = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE status = 'available' AND (reserved_by_ticket IS NULL OR reserved_by_ticket = '')");
        return stmt.get()?.count || 0;
    }
    
    let stmt = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE game_id = ? AND status = 'available' AND (reserved_by_ticket IS NULL OR reserved_by_ticket = '')");
    let count = stmt.get(gameId)?.count || 0;
    
    if (count === 0 && typeof gameId === 'string' && !/^\d+$/.test(gameId)) {
        const game = db.prepare('SELECT id FROM games WHERE game_id = ?').get(gameId);
        if (game) {
            count = stmt.get(game.id)?.count || 0;
            if (count === 0) {
                count = stmt.get(String(game.id))?.count || 0;
            }
        }
    }
    
    return count;
}

function getReservedTokenCount(gameId) {
    if (!gameId) {
        const stmt = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE status = 'available' AND reserved_by_ticket IS NOT NULL AND reserved_by_ticket != ''");
        return stmt.get()?.count || 0;
    }
    
    let stmt = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE game_id = ? AND status = 'available' AND reserved_by_ticket IS NOT NULL AND reserved_by_ticket != ''");
    let count = stmt.get(gameId)?.count || 0;
    
    if (count === 0 && typeof gameId === 'string' && !/^\d+$/.test(gameId)) {
        const game = db.prepare('SELECT id FROM games WHERE game_id = ?').get(gameId);
        if (game) {
            count = stmt.get(game.id)?.count || 0;
        }
    }
    
    return count;
}

function getUsedTokenCount(gameId) {
    if (!gameId) {
        const stmt = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE status = 'used'");
        return stmt.get()?.count || 0;
    }
    
    let stmt = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE game_id = ? AND status = 'used'");
    let count = stmt.get(gameId)?.count || 0;
    
    if (count === 0 && typeof gameId === 'string' && !/^\d+$/.test(gameId)) {
        const game = db.prepare('SELECT id FROM games WHERE game_id = ?').get(gameId);
        if (game) {
            count = stmt.get(game.id)?.count || 0;
        }
    }
    
    return count;
}

function getTokenStats(gameId) {
    const available = getAvailableTokenCount(gameId);
    const reserved = getReservedTokenCount(gameId);
    const used = getUsedTokenCount(gameId);
    const total = getTotalTokenCount(gameId);
    
    return { available, reserved, used, total };
}

function getTotalTokenCount(gameId) {
    if (!gameId) {
        const stmt = db.prepare("SELECT COUNT(*) as count FROM tokens");
        return stmt.get()?.count || 0;
    }
    
    let stmt = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE game_id = ?");
    let count = stmt.get(gameId)?.count || 0;
    
    if (count === 0 && typeof gameId === 'string' && !/^\d+$/.test(gameId)) {
        const game = db.prepare('SELECT id FROM games WHERE game_id = ?').get(gameId);
        if (game) {
            count = stmt.get(game.id)?.count || 0;
            if (count === 0) {
                count = stmt.get(String(game.id))?.count || 0;
            }
        }
    }
    
    return count;
}

function reserveToken(gameId, ticketId) {
    let stmt = db.prepare(`
        UPDATE tokens 
        SET reserved_by_ticket = ? 
        WHERE id = (
            SELECT id FROM tokens 
            WHERE game_id = ? AND status = 'available' AND (reserved_by_ticket IS NULL OR reserved_by_ticket = '')
            LIMIT 1
        )
    `);
    let result = stmt.run(ticketId, gameId);
    
    if (result.changes === 0 && typeof gameId === 'string' && !/^\d+$/.test(gameId)) {
        const game = db.prepare('SELECT id FROM games WHERE game_id = ?').get(gameId);
        if (game) {
            result = stmt.run(ticketId, game.id);
            if (result.changes === 0) {
                result = stmt.run(ticketId, String(game.id));
            }
        }
    }
    
    console.log(`[DB] Reserved token for ticket ${ticketId}: ${result.changes > 0 ? 'SUCCESS' : 'FAILED'}`);
    return result;
}

function releaseReservedToken(ticketId) {
    const stmt = db.prepare(`
        UPDATE tokens 
        SET reserved_by_ticket = NULL 
        WHERE reserved_by_ticket = ?
    `);
    const result = stmt.run(ticketId);
    if (result.changes > 0) {
        console.log(`[DB] Released reserved token for ticket ${ticketId}`);
    }
    return result;
}

function getReservedToken(ticketId) {
    const stmt = db.prepare(`
        SELECT t.*, a.account_number, a.account_name 
        FROM tokens t
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.reserved_by_ticket = ?
        LIMIT 1
    `);
    return stmt.get(ticketId);
}

function useReservedToken(ticketId, userId = null, username = null, regenHours = 24) {
    const usedAt = new Date().toISOString();
    const regeneratesAt = new Date(Date.now() + regenHours * 60 * 60 * 1000).toISOString();
    
    const stmt = db.prepare(`
        UPDATE tokens 
        SET status = 'used', reserved_by_ticket = NULL, used_at = ?, regenerates_at = ?, 
            ticket_id = ?, used_by_user_id = ?, used_by_username = ?
        WHERE reserved_by_ticket = ?
    `);
    const result = stmt.run(usedAt, regeneratesAt, ticketId, userId, username, ticketId);
    
    if (result.changes > 0) {
        console.log(`[DB] Token used for ticket ${ticketId}, regenerates at ${regeneratesAt}`);
    }
    return result;
}

function hasReservedToken(ticketId) {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE reserved_by_ticket = ?");
    return stmt.get(ticketId)?.count > 0;
}

function getNextAvailableToken(gameId) {
    const stmt = db.prepare(`
        SELECT t.*, a.account_number, a.account_name 
        FROM tokens t
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.game_id = ? AND t.status = 'available' AND (t.reserved_by_ticket IS NULL OR t.reserved_by_ticket = '')
        ORDER BY a.account_number ASC, t.token_number ASC
        LIMIT 1
    `);
    return stmt.get(gameId);
}

function getNextRegenerationTime(gameId) {
    const stmt = db.prepare(`
        SELECT MIN(regenerates_at) as next_regen
        FROM tokens 
        WHERE game_id = ? AND status = 'used' AND regenerates_at IS NOT NULL
    `);
    const result = stmt.get(gameId);
    return result?.next_regen ? new Date(result.next_regen) : null;
}

function markTokenUsed(tokenId, ticketId = null, userId = null, username = null, regenHours = 24) {
    const usedAt = new Date().toISOString();
    const regeneratesAt = new Date(Date.now() + regenHours * 60 * 60 * 1000).toISOString();
    
    const stmt = db.prepare(`
        UPDATE tokens 
        SET status = 'used', used_at = ?, regenerates_at = ?, ticket_id = ?, 
            used_by_user_id = ?, used_by_username = ?, reserved_by_ticket = NULL
        WHERE id = ?
    `);
    return stmt.run(usedAt, regeneratesAt, ticketId, userId, username, tokenId);
}

function markTokenAvailable(tokenId) {
    const stmt = db.prepare(`
        UPDATE tokens 
        SET status = 'available', used_at = NULL, regenerates_at = NULL, ticket_id = NULL, reserved_by_ticket = NULL
        WHERE id = ?
    `);
    return stmt.run(tokenId);
}

function regenerateExpiredTokens() {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        UPDATE tokens 
        SET status = 'available', used_at = NULL, regenerates_at = NULL, ticket_id = NULL, reserved_by_ticket = NULL
        WHERE status = 'used' AND regenerates_at IS NOT NULL AND regenerates_at <= ?
    `);
    const result = stmt.run(now);
    return result.changes;
}

function regenerateExpiredUbisoftTokens() {
    try {
        const now = new Date().toISOString();
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        // Regenerate tokens where regenerates_at has passed
        const stmt1 = db.prepare(`
            UPDATE ubisoft_tokens 
            SET last_used_at = NULL, regenerates_at = NULL, used_by_user_id = NULL, 
                used_by_username = NULL, used_in_ticket = NULL, reserved_by_ticket = NULL
            WHERE last_used_at IS NOT NULL AND regenerates_at IS NOT NULL AND regenerates_at <= ?
        `);
        const result1 = stmt1.run(now);
        
        // Also regenerate old tokens that don't have regenerates_at but were used 24+ hours ago
        const stmt2 = db.prepare(`
            UPDATE ubisoft_tokens 
            SET last_used_at = NULL, regenerates_at = NULL, used_by_user_id = NULL, 
                used_by_username = NULL, used_in_ticket = NULL, reserved_by_ticket = NULL
            WHERE last_used_at IS NOT NULL AND regenerates_at IS NULL AND last_used_at <= ?
        `);
        const result2 = stmt2.run(twentyFourHoursAgo);
        
        const totalChanges = result1.changes + result2.changes;
        if (totalChanges > 0) {
            console.log(`[DB] Regenerated ${totalChanges} Ubisoft tokens (${result1.changes} with timer, ${result2.changes} legacy)`);
        }
        return totalChanges;
    } catch (e) {
        console.error('[DB] regenerateExpiredUbisoftTokens error:', e.message);
        return 0;
    }
}

function regenerateExpiredEATokens() {
    try {
        const now = new Date().toISOString();
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        // Regenerate tokens where regenerates_at has passed
        const stmt1 = db.prepare(`
            UPDATE ea_tokens 
            SET last_used_at = NULL, regenerates_at = NULL, used_by_user_id = NULL, 
                used_by_username = NULL, used_in_ticket = NULL, reserved_by_ticket = NULL
            WHERE last_used_at IS NOT NULL AND regenerates_at IS NOT NULL AND regenerates_at <= ?
        `);
        const result1 = stmt1.run(now);
        
        // Also regenerate old tokens that don't have regenerates_at but were used 24+ hours ago
        const stmt2 = db.prepare(`
            UPDATE ea_tokens 
            SET last_used_at = NULL, regenerates_at = NULL, used_by_user_id = NULL, 
                used_by_username = NULL, used_in_ticket = NULL, reserved_by_ticket = NULL
            WHERE last_used_at IS NOT NULL AND regenerates_at IS NULL AND last_used_at <= ?
        `);
        const result2 = stmt2.run(twentyFourHoursAgo);
        
        const totalChanges = result1.changes + result2.changes;
        if (totalChanges > 0) {
            console.log(`[DB] Regenerated ${totalChanges} EA tokens (${result1.changes} with timer, ${result2.changes} legacy)`);
        }
        return totalChanges;
    } catch (e) {
        console.error('[DB] regenerateExpiredEATokens error:', e.message);
        return 0;
    }
}

function getUpcomingRegens(gameId = null, limit = 5) {
    const now = new Date().toISOString();
    let sql = `
        SELECT t.*, g.game_name, a.account_number
        FROM tokens t
        LEFT JOIN games g ON t.game_id = g.game_id OR t.game_id = CAST(g.id AS TEXT) OR t.game_id = g.id
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.status = 'used' AND t.regenerates_at IS NOT NULL AND t.regenerates_at > ?
    `;
    if (gameId) sql += ` AND t.game_id = ?`;
    sql += ` ORDER BY t.regenerates_at ASC LIMIT ?`;
    
    const stmt = db.prepare(sql);
    return gameId ? stmt.all(now, gameId, limit) : stmt.all(now, limit);
}

function getRegenStats() {
    const now = new Date().toISOString();
    const oneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const sixHours = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    
    const within1h = db.prepare(`
        SELECT COUNT(*) as count FROM tokens 
        WHERE status = 'used' AND regenerates_at > ? AND regenerates_at <= ?
    `).get(now, oneHour);
    
    const within6h = db.prepare(`
        SELECT COUNT(*) as count FROM tokens 
        WHERE status = 'used' AND regenerates_at > ? AND regenerates_at <= ?
    `).get(now, sixHours);
    
    return {
        within1h: within1h?.count || 0,
        within6h: within6h?.count || 0
    };
}

function resetAllTokens() {
    const stmt = db.prepare(`
        UPDATE tokens 
        SET status = 'available', used_at = NULL, regenerates_at = NULL, ticket_id = NULL, reserved_by_ticket = NULL
    `);
    return stmt.run().changes;
}

function resetGameTokens(gameId) {
    const stmt = db.prepare(`
        UPDATE tokens 
        SET status = 'available', used_at = NULL, regenerates_at = NULL, ticket_id = NULL, reserved_by_ticket = NULL
        WHERE game_id = ?
    `);
    return stmt.run(gameId).changes;
}

function getTokensByGame(gameId) {
    const stmt = db.prepare(`
        SELECT t.*, a.account_number, a.account_name
        FROM tokens t
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.game_id = ?
        ORDER BY a.account_number, t.token_number
    `);
    return stmt.all(gameId);
}

function getAllTokens() {
    try {
        return db.prepare(`
            SELECT t.*, g.game_name, a.account_name, a.account_number
            FROM tokens t
            LEFT JOIN games g ON t.game_id = g.id OR t.game_id = g.game_id
            LEFT JOIN accounts a ON t.account_id = a.id
            ORDER BY g.game_name, a.account_name
            LIMIT 500
        `).all();
    } catch (e) {
        return [];
    }
}

// Get tokens with filters and pagination
function getTokensFiltered(filters = {}, page = 1, limit = 100) {
    try {
        let where = [];
        let params = [];
        
        if (filters.game) {
            where.push('(t.game_id = ? OR t.game_id = CAST(? AS TEXT))');
            params.push(filters.game, filters.game);
        }
        if (filters.account) {
            where.push('t.account_id = ?');
            params.push(filters.account);
        }
        if (filters.status === 'available') {
            where.push("(t.status = 'available' AND t.reserved_by_ticket IS NULL)");
        } else if (filters.status === 'reserved') {
            where.push('t.reserved_by_ticket IS NOT NULL');
        } else if (filters.status === 'used') {
            where.push("t.status = 'used'");
        }
        
        const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
        const offset = (page - 1) * limit;
        
        const countStmt = db.prepare(`
            SELECT COUNT(*) as total FROM tokens t ${whereClause}
        `);
        const total = countStmt.get(...params)?.total || 0;
        
        const stmt = db.prepare(`
            SELECT t.*, g.game_name, a.account_name, a.account_number
            FROM tokens t
            LEFT JOIN games g ON t.game_id = g.id OR t.game_id = g.game_id
            LEFT JOIN accounts a ON t.account_id = a.id
            ${whereClause}
            ORDER BY g.game_name, a.account_number, t.token_number
            LIMIT ? OFFSET ?
        `);
        
        const tokens = stmt.all(...params, limit, offset);
        
        return {
            tokens,
            pagination: {
                page,
                totalPages: Math.ceil(total / limit),
                totalCount: total
            }
        };
    } catch (e) {
        console.error('getTokensFiltered error:', e);
        return { tokens: [], pagination: { page: 1, totalPages: 1, totalCount: 0 } };
    }
}

// Get token regeneration stats
function getTokenRegenStats() {
    try {
        const now = new Date().toISOString();
        const oneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const sixHours = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
        
        const stats = db.prepare(`
            SELECT 
                SUM(CASE WHEN status = 'available' AND reserved_by_ticket IS NULL THEN 1 ELSE 0 END) as available,
                SUM(CASE WHEN reserved_by_ticket IS NOT NULL THEN 1 ELSE 0 END) as reserved,
                SUM(CASE WHEN status = 'used' AND reserved_by_ticket IS NULL THEN 1 ELSE 0 END) as regenerating,
                SUM(CASE WHEN regenerates_at IS NOT NULL AND regenerates_at <= ? AND status = 'used' THEN 1 ELSE 0 END) as within1h,
                SUM(CASE WHEN regenerates_at IS NOT NULL AND regenerates_at > ? AND regenerates_at <= ? AND status = 'used' THEN 1 ELSE 0 END) as within6h
            FROM tokens
        `).get(oneHour, oneHour, sixHours);
        
        return {
            available: stats?.available || 0,
            reserved: stats?.reserved || 0,
            regenerating: stats?.regenerating || 0,
            within1h: stats?.within1h || 0,
            within6h: stats?.within6h || 0
        };
    } catch (e) {
        return { available: 0, reserved: 0, regenerating: 0, within1h: 0, within6h: 0 };
    }
}

// Reset a single token to available
function resetToken(tokenId) {
    try {
        const stmt = db.prepare(`
            UPDATE tokens 
            SET status = 'available', used_at = NULL, regenerates_at = NULL, 
                ticket_id = NULL, reserved_by_ticket = NULL, used_by_user_id = NULL, used_by_username = NULL
            WHERE id = ?
        `);
        const result = stmt.run(tokenId);
        console.log(`[DB] resetToken(${tokenId}): ${result.changes} rows updated`);
        return result.changes;
    } catch (e) {
        console.error('[DB] resetToken error:', e.message);
        return 0;
    }
}

// Mark a single token as used
function useToken(tokenId, regenHours = 24) {
    try {
        const regenAt = new Date(Date.now() + regenHours * 60 * 60 * 1000).toISOString();
        const stmt = db.prepare(`
            UPDATE tokens 
            SET status = 'used', used_at = datetime('now'), regenerates_at = ?
            WHERE id = ?
        `);
        const result = stmt.run(regenAt, tokenId);
        console.log(`[DB] useToken(${tokenId}): ${result.changes} rows updated`);
        return result.changes;
    } catch (e) {
        console.error('[DB] useToken error:', e.message);
        return 0;
    }
}

// Delete a single token
function deleteToken(tokenId) {
    try {
        const stmt = db.prepare('DELETE FROM tokens WHERE id = ?');
        const result = stmt.run(tokenId);
        console.log(`[DB] deleteToken(${tokenId}): ${result.changes} rows deleted`);
        return result.changes;
    } catch (e) {
        console.error('[DB] deleteToken error:', e.message);
        return 0;
    }
}

// Add a new token
function addToken(gameId, token = null, accountId = null) {
    try {
        console.log(`[DB] addToken: gameId=${gameId}, accountId=${accountId}`);
        // Get the next token number for this game/account combo
        const maxNum = db.prepare(`
            SELECT MAX(token_number) as maxNum FROM tokens 
            WHERE game_id = ? AND account_id = ?
        `).get(gameId, accountId)?.maxNum || 0;
        
        console.log(`[DB] addToken: maxNum=${maxNum}, inserting token_number=${maxNum + 1}`);
        
        const stmt = db.prepare(`
            INSERT INTO tokens (game_id, account_id, token_number, status)
            VALUES (?, ?, ?, 'available')
        `);
        const result = stmt.run(gameId, accountId, maxNum + 1);
        console.log(`[DB] addToken: inserted with id=${result.lastInsertRowid}`);
        return result.lastInsertRowid;
    } catch (e) {
        console.error('[DB] addToken error:', e.message);
        return null;
    }
}

// Release all reserved tokens
function releaseReservedTokens() {
    try {
        const stmt = db.prepare(`
            UPDATE tokens 
            SET reserved_by_ticket = NULL, status = 'available'
            WHERE reserved_by_ticket IS NOT NULL
        `);
        return stmt.run().changes;
    } catch (e) {
        return 0;
    }
}

// Mark all tokens as used (with optional filters)
function useAllTokens(filters = {}, regenHours = 24) {
    try {
        const regenAt = new Date(Date.now() + regenHours * 60 * 60 * 1000).toISOString();
        let where = ["status = 'available'", 'reserved_by_ticket IS NULL'];
        let params = [regenAt];
        
        if (filters.game) {
            where.push('(game_id = ? OR game_id = CAST(? AS TEXT))');
            params.push(filters.game, filters.game);
        }
        if (filters.account) {
            where.push('account_id = ?');
            params.push(filters.account);
        }
        
        const stmt = db.prepare(`
            UPDATE tokens 
            SET status = 'used', used_at = datetime('now'), regenerates_at = ?
            WHERE ${where.join(' AND ')}
        `);
        return stmt.run(...params).changes;
    } catch (e) {
        return 0;
    }
}

// Reset filtered tokens
function resetFilteredTokens(filters = {}) {
    try {
        let where = [];
        let params = [];
        
        if (filters.game) {
            where.push('(game_id = ? OR game_id = CAST(? AS TEXT))');
            params.push(filters.game, filters.game);
        }
        if (filters.account) {
            where.push('account_id = ?');
            params.push(filters.account);
        }
        if (filters.status === 'used') {
            where.push("status = 'used'");
        } else if (filters.status === 'reserved') {
            where.push('reserved_by_ticket IS NOT NULL');
        }
        
        const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
        
        const stmt = db.prepare(`
            UPDATE tokens 
            SET status = 'available', used_at = NULL, regenerates_at = NULL, 
                ticket_id = NULL, reserved_by_ticket = NULL
            ${whereClause}
        `);
        return stmt.run(...params).changes;
    } catch (e) {
        return 0;
    }
}

// Delete all tokens for a specific game+account combination
function deleteTokensByGameAccount(gameId, accountId) {
    try {
        const stmt = db.prepare(`
            DELETE FROM tokens 
            WHERE (game_id = ? OR game_id = CAST(? AS TEXT)) AND account_id = ?
        `);
        return stmt.run(gameId, gameId, accountId).changes;
    } catch (e) {
        return 0;
    }
}

function getUsedTokens(limit = 20) {
    const stmt = db.prepare(`
        SELECT t.*, g.game_name, a.account_number
        FROM tokens t
        LEFT JOIN games g ON t.game_id = g.game_id OR t.game_id = CAST(g.id AS TEXT) OR t.game_id = g.id
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.status = 'used'
        ORDER BY t.used_at DESC
        LIMIT ?
    `);
    return stmt.all(limit);
}

function cancelToken(ticketId) {
    const reserved = getReservedToken(ticketId);
    if (reserved) {
        releaseReservedToken(ticketId);
        return { success: true, message: 'Reserved token released' };
    }
    
    const usedToken = db.prepare("SELECT * FROM tokens WHERE ticket_id = ? AND status = 'used'").get(ticketId);
    if (usedToken) {
        markTokenAvailable(usedToken.id);
        return { success: true, message: 'Used token returned to pool' };
    }
    
    return { success: false, error: 'No token found for this ticket' };
}

function releaseExpiredReservations(maxHours = 24) {
    const cutoff = new Date(Date.now() - maxHours * 60 * 60 * 1000).toISOString();
    const result = db.prepare(`
        UPDATE tokens 
        SET reserved_by_ticket = NULL 
        WHERE reserved_by_ticket IS NOT NULL 
        AND reserved_by_ticket IN (
            SELECT ticket_id FROM tickets 
            WHERE created_at < ? AND status = 'open' AND token_sent = 0
        )
    `).run(cutoff);
    if (result.changes > 0) {
        console.log(`[DB] Released ${result.changes} expired token reservation(s) (>24h old)`);
    }
    return result.changes;
}

// ============================================================================
// TICKETS
// ============================================================================

function createTicket(ticketId, threadId, guildId, userId, username, gameId, isRefill = false, steamId = null) {
    const stmt = db.prepare(`
        INSERT INTO tickets (ticket_id, thread_id, guild_id, user_id, username, game_id, is_refill, steam_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(ticketId, threadId, guildId, userId, username, gameId, isRefill ? 1 : 0, steamId);
}

function getTicket(ticketId) {
    const stmt = db.prepare(`
        SELECT t.*, g.game_name, g.folder_name
        FROM tickets t
        LEFT JOIN games g ON t.game_id = g.id OR t.game_id = g.game_id
        WHERE t.ticket_id = ?
    `);
    return stmt.get(ticketId);
}

function getTicketByThread(threadId) {
    const stmt = db.prepare(`
        SELECT t.*, g.game_name, g.folder_name
        FROM tickets t
        LEFT JOIN games g ON t.game_id = g.id OR t.game_id = g.game_id
        WHERE t.thread_id = ?
    `);
    return stmt.get(threadId);
}

function getUserOpenTicket(userId, guildId) {
    const stmt = db.prepare(`
        SELECT * FROM tickets 
        WHERE user_id = ? AND guild_id = ? AND status = 'open'
        LIMIT 1
    `);
    return stmt.get(userId, guildId);
}

function updateTicketStatus(ticketId, status) {
    const stmt = db.prepare('UPDATE tickets SET status = ? WHERE ticket_id = ?');
    return stmt.run(status, ticketId);
}

function markScreenshotVerified(ticketId) {
    const stmt = db.prepare('UPDATE tickets SET screenshot_verified = 1 WHERE ticket_id = ?');
    return stmt.run(ticketId);
}

function markTokenSent(ticketId) {
    const stmt = db.prepare('UPDATE tickets SET token_sent = 1 WHERE ticket_id = ?');
    return stmt.run(ticketId);
}

function closeTicket(ticketId, reason) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        UPDATE tickets 
        SET status = 'closed', close_reason = ?, closed_at = ?
        WHERE ticket_id = ?
    `);
    return stmt.run(reason, now, ticketId);
}

function closeUserTickets(userId, guildId, reason) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        UPDATE tickets 
        SET status = 'closed', close_reason = ?, closed_at = ?
        WHERE user_id = ? AND guild_id = ? AND status = 'open'
    `);
    return stmt.run(reason, now, userId, guildId);
}

function getUserTickets(userId, limit = 20) {
    const stmt = db.prepare(`
        SELECT * FROM tickets 
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    `);
    return stmt.all(userId, limit);
}

function getOpenTickets() {
    const stmt = db.prepare("SELECT * FROM tickets WHERE status = 'open' ORDER BY created_at ASC");
    return stmt.all();
}

function updateTicketSteamId(ticketId, steamId) {
    const stmt = db.prepare('UPDATE tickets SET steam_id = ? WHERE ticket_id = ?');
    const result = stmt.run(steamId, ticketId);
    return result.changes;
}

function closeAllOpenTickets() {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        UPDATE tickets 
        SET status = 'closed', close_reason = 'admin_cleared_all', closed_at = ?
        WHERE status = 'open'
    `);
    const result = stmt.run(now);
    return result.changes;
}

// ============================================================================
// COOLDOWNS
// ============================================================================

function getUserCooldown(userId, guildId, cooldownType) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        SELECT * FROM cooldowns 
        WHERE user_id = ? AND guild_id = ? AND cooldown_type = ? AND expires_at > ?
        LIMIT 1
    `);
    return stmt.get(userId, guildId, cooldownType, now);
}

function getUniversalCooldown(userId, cooldownType) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        SELECT * FROM cooldowns 
        WHERE user_id = ? AND cooldown_type = ? AND expires_at > ?
        ORDER BY expires_at DESC
        LIMIT 1
    `);
    return stmt.get(userId, cooldownType, now);
}

function getAllUserCooldowns(userId, guildId) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        SELECT * FROM cooldowns 
        WHERE user_id = ? AND guild_id = ? AND expires_at > ?
    `);
    return stmt.all(userId, guildId, now);
}

function getAllCooldowns() {
    const now = new Date().toISOString();
    try {
        return db.prepare(`
            SELECT * FROM cooldowns 
            WHERE expires_at > ?
            ORDER BY expires_at ASC
        `).all(now);
    } catch (e) {
        return [];
    }
}

function clearCooldown(id) {
    try {
        return db.prepare('DELETE FROM cooldowns WHERE id = ?').run(id);
    } catch (e) {
        return null;
    }
}

function setCooldown(userId, guildId, cooldownType, hours) {
    const deleteStmt = db.prepare(`
        DELETE FROM cooldowns 
        WHERE user_id = ? AND guild_id = ? AND cooldown_type = ?
    `);
    deleteStmt.run(userId, guildId, cooldownType);
    
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const insertStmt = db.prepare(`
        INSERT INTO cooldowns (user_id, guild_id, cooldown_type, expires_at)
        VALUES (?, ?, ?, ?)
    `);
    return insertStmt.run(userId, guildId, cooldownType, expiresAt);
}

function removeCooldowns(userId, guildId) {
    const stmt = db.prepare('DELETE FROM cooldowns WHERE user_id = ? AND guild_id = ?');
    return stmt.run(userId, guildId);
}

function removeAllUserCooldowns(userId) {
    const stmt = db.prepare('DELETE FROM cooldowns WHERE user_id = ?');
    return stmt.run(userId);
}

function removeCooldown(userId, guildId, cooldownType) {
    const stmt = db.prepare('DELETE FROM cooldowns WHERE user_id = ? AND guild_id = ? AND cooldown_type = ?');
    return stmt.run(userId, guildId, cooldownType);
}

function clearExpiredCooldowns() {
    const now = new Date().toISOString();
    const stmt = db.prepare('DELETE FROM cooldowns WHERE expires_at <= ?');
    const result = stmt.run(now);
    return result.changes;
}

function checkCooldown(userId, guildId, cooldownType) {
    return getUserCooldown(userId, guildId, cooldownType);
}

// Per-game 24-hour cooldown (anti-reseller)
function checkGameCooldown(userId, gameId, platform = 'steam') {
    try {
        const cooldownType = `game_${platform}_${gameId}`;
        const result = db.prepare(`
            SELECT * FROM cooldowns 
            WHERE user_id = ? AND cooldown_type = ? AND expires_at > datetime('now')
        `).get(userId, cooldownType);
        return result || null;
    } catch (err) {
        console.error('[DB] checkGameCooldown error:', err.message);
        return null;
    }
}

function setGameCooldown(userId, gameId, platform = 'steam', hours = 24) {
    try {
        const cooldownType = `game_${platform}_${gameId}`;
        // Delete any existing cooldown for this game
        db.prepare(`
            DELETE FROM cooldowns 
            WHERE user_id = ? AND cooldown_type = ?
        `).run(userId, cooldownType);
        
        // Set new cooldown
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        db.prepare(`
            INSERT INTO cooldowns (user_id, guild_id, cooldown_type, expires_at)
            VALUES (?, ?, ?, ?)
        `).run(userId, 'global', cooldownType, expiresAt);
        
        console.log(`[DB] Game cooldown set for user ${userId} on ${platform}/${gameId} for ${hours}h`);
        return true;
    } catch (err) {
        console.error('[DB] setGameCooldown error:', err.message);
        return false;
    }
}

function getUserGameCooldowns(userId) {
    try {
        return db.prepare(`
            SELECT cooldown_type, expires_at FROM cooldowns 
            WHERE user_id = ? AND cooldown_type LIKE 'game_%' AND expires_at > datetime('now')
            ORDER BY expires_at DESC
        `).all(userId);
    } catch (err) {
        return [];
    }
}

// ============================================================================
// TRANSCRIPTS
// ============================================================================

function saveTranscript(ticketId, threadId, userId, username, gameName, messagesJson) {
    try {
        const stmt = db.prepare(`
            INSERT INTO transcripts (ticket_id, thread_id, user_id, username, game_name, messages_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        const result = stmt.run(ticketId, threadId, userId, username, gameName, messagesJson);
        console.log(`[DB] Transcript saved for ${ticketId}`);
        return result;
    } catch (err) {
        console.error('[DB] saveTranscript error:', err.message);
        return null;
    }
}

function getTranscript(ticketId) {
    try {
        const stmt = db.prepare('SELECT * FROM transcripts WHERE ticket_id = ?');
        return stmt.get(ticketId);
    } catch (err) {
        return null;
    }
}

function getUserTranscripts(userId, limit = 10) {
    try {
        const stmt = db.prepare(`
            SELECT * FROM transcripts 
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `);
        return stmt.all(userId, limit);
    } catch (err) {
        return [];
    }
}

function getTranscripts(options = {}) {
    try {
        let sql = `SELECT * FROM transcripts WHERE (platform = 'steam' OR platform IS NULL)`;
        const params = [];
        
        if (options.userId) {
            sql += ' AND user_id = ?';
            params.push(options.userId);
        }
        if (options.username) {
            // Search in username, user_id, ticket_id, and game_name
            sql += ' AND (username LIKE ? OR user_id LIKE ? OR ticket_id LIKE ? OR game_name LIKE ?)';
            params.push(`%${options.username}%`, `%${options.username}%`, `%${options.username}%`, `%${options.username}%`);
        }
        
        sql += ' ORDER BY created_at DESC';
        
        // Only apply limit if explicitly provided
        if (options.limit) {
            sql += ' LIMIT ?';
            params.push(options.limit);
            if (options.offset) {
                sql += ' OFFSET ?';
                params.push(options.offset);
            }
        }
        
        return db.prepare(sql).all(...params);
    } catch (err) {
        console.error('[DB] getTranscripts error:', err.message);
        return [];
    }
}

function getUbisoftTranscripts(options = {}) {
    try {
        const limit = options.limit || 100;
        const offset = options.offset || 0;
        
        let sql = `SELECT * FROM transcripts WHERE platform = 'ubisoft'`;
        const params = [];
        
        if (options.userId) {
            sql += ' AND user_id = ?';
            params.push(options.userId);
        }
        if (options.username) {
            sql += ' AND username LIKE ?';
            params.push(`%${options.username}%`);
        }
        
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        return db.prepare(sql).all(...params);
    } catch (err) {
        console.error('[DB] getUbisoftTranscripts error:', err.message);
        return [];
    }
}

function getEATranscripts(options = {}) {
    try {
        const limit = options.limit || 100;
        const offset = options.offset || 0;
        
        return db.prepare(`
            SELECT * FROM ea_transcripts 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `).all(limit, offset);
    } catch (err) {
        console.error('[DB] getEATranscripts error:', err.message);
        return [];
    }
}

// ============================================================================
// SERVER SETTINGS
// ============================================================================

function getServerStaffRoles(guildId) {
    try {
        const stmt = db.prepare('SELECT role_ids FROM server_settings WHERE guild_id = ?');
        const result = stmt.get(guildId);
        if (result && result.role_ids) {
            return result.role_ids.split(',').filter(Boolean);
        }
    } catch (e) {}
    return [];
}

function setServerStaffRoles(guildId, roleIds) {
    try {
        const roleStr = Array.isArray(roleIds) ? roleIds.join(',') : roleIds;
        const stmt = db.prepare(`
            INSERT INTO server_settings (guild_id, role_ids) VALUES (?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET role_ids = ?
        `);
        return stmt.run(guildId, roleStr, roleStr);
    } catch (e) {
        console.error('[DB] setServerStaffRoles error:', e.message);
        return null;
    }
}

function getServerTicketChannel(guildId) {
    try {
        const stmt = db.prepare('SELECT ticket_channel_id FROM server_settings WHERE guild_id = ?');
        const result = stmt.get(guildId);
        return result?.ticket_channel_id || null;
    } catch (e) {
        return null;
    }
}

function setServerTicketChannel(guildId, channelId) {
    try {
        const stmt = db.prepare(`
            INSERT INTO server_settings (guild_id, ticket_channel_id) VALUES (?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET ticket_channel_id = ?
        `);
        return stmt.run(guildId, channelId, channelId);
    } catch (e) {
        console.error('[DB] setServerTicketChannel error:', e.message);
        return null;
    }
}

function saveServerPanel(guildId, messageId, channelId, panelType = 'free') {
    try {
        const stmt = db.prepare(`
            INSERT INTO server_settings (guild_id, panel_message_id, panel_channel_id, panel_type) VALUES (?, ?, ?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET panel_message_id = ?, panel_channel_id = ?, panel_type = ?
        `);
        return stmt.run(guildId, messageId, channelId, panelType, messageId, channelId, panelType);
    } catch (e) {
        console.error('[DB] saveServerPanel error:', e.message);
        return null;
    }
}

function getAllServerPanels() {
    try {
        const stmt = db.prepare('SELECT * FROM server_settings WHERE panel_message_id IS NOT NULL');
        return stmt.all();
    } catch (e) {
        return [];
    }
}

function getServerTicketLogChannel(guildId) {
    try {
        const stmt = db.prepare('SELECT ticket_log_channel_id FROM server_settings WHERE guild_id = ?');
        const result = stmt.get(guildId);
        return result?.ticket_log_channel_id || null;
    } catch (e) {
        return null;
    }
}

function setServerTicketLogChannel(guildId, channelId) {
    try {
        const stmt = db.prepare(`
            INSERT INTO server_settings (guild_id, ticket_log_channel_id) VALUES (?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET ticket_log_channel_id = ?
        `);
        return stmt.run(guildId, channelId, channelId);
    } catch (e) {
        console.error('[DB] setServerTicketLogChannel error:', e.message);
        return null;
    }
}

function getServerActivationLogChannel(guildId) {
    try {
        const stmt = db.prepare('SELECT activation_log_channel_id FROM server_settings WHERE guild_id = ?');
        const result = stmt.get(guildId);
        return result?.activation_log_channel_id || null;
    } catch (e) {
        return null;
    }
}

function setServerActivationLogChannel(guildId, channelId) {
    try {
        const stmt = db.prepare(`
            INSERT INTO server_settings (guild_id, activation_log_channel_id) VALUES (?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET activation_log_channel_id = ?
        `);
        return stmt.run(guildId, channelId, channelId);
    } catch (e) {
        console.error('[DB] setServerActivationLogChannel error:', e.message);
        return null;
    }
}

function setServerPanelType(guildId, panelType) {
    try {
        const stmt = db.prepare(`
            UPDATE server_settings SET panel_type = ? WHERE guild_id = ?
        `);
        return stmt.run(panelType, guildId);
    } catch (e) {
        console.error('[DB] setServerPanelType error:', e.message);
        return null;
    }
}

// ============================================================================
// TICKET STATISTICS
// ============================================================================

function getTicketStats(guildId) {
    try {
        const total = db.prepare('SELECT COUNT(*) as count FROM tickets WHERE guild_id = ?').get(guildId)?.count || 0;
        const open = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND status = 'open'").get(guildId)?.count || 0;
        const closed = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND status = 'closed'").get(guildId)?.count || 0;
        const successful = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND close_reason = 'success'").get(guildId)?.count || 0;
        const cancelled = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND (close_reason LIKE '%closed%' OR close_reason LIKE '%cancel%')").get(guildId)?.count || 0;
        const timedOut = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND (close_reason LIKE '%timeout%' OR close_reason LIKE '%inactive%')").get(guildId)?.count || 0;
        const ghosted = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND close_reason LIKE '%ghost%'").get(guildId)?.count || 0;
        
        const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;
        
        let avgResolutionTime = 'N/A';
        try {
            const avgResult = db.prepare(`
                SELECT AVG((julianday(closed_at) - julianday(created_at)) * 24 * 60) as avg_minutes
                FROM tickets 
                WHERE guild_id = ? AND close_reason = 'success' AND closed_at IS NOT NULL AND created_at IS NOT NULL
            `).get(guildId);
            
            if (avgResult?.avg_minutes) {
                const mins = Math.round(avgResult.avg_minutes);
                avgResolutionTime = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
            }
        } catch (e) {}
        
        return { total, open, closed, successful, cancelled, timedOut, ghosted, successRate, avgResolutionTime };
    } catch (e) {
        console.error('[DB] getTicketStats error:', e.message);
        return { total: 0, open: 0, closed: 0, successful: 0, cancelled: 0, timedOut: 0, ghosted: 0, successRate: 0, avgResolutionTime: 'N/A' };
    }
}

function getDailyTicketStats(guildId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const opened = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND date(created_at) = ?").get(guildId, today)?.count || 0;
        const closed = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND date(closed_at) = ?").get(guildId, today)?.count || 0;
        const successful = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND date(closed_at) = ? AND close_reason = 'success'").get(guildId, today)?.count || 0;
        const cancelled = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND date(closed_at) = ? AND (close_reason LIKE '%closed%' OR close_reason LIKE '%cancel%')").get(guildId, today)?.count || 0;
        const timedOut = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND date(closed_at) = ? AND (close_reason LIKE '%timeout%' OR close_reason LIKE '%inactive%')").get(guildId, today)?.count || 0;
        
        return { opened, closed, successful, cancelled, timedOut };
    } catch (e) {
        console.error('[DB] getDailyTicketStats error:', e.message);
        return { opened: 0, closed: 0, successful: 0, cancelled: 0, timedOut: 0 };
    }
}

function getWeeklyTicketStats(guildId) {
    try {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const opened = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND created_at >= ?").get(guildId, weekAgo)?.count || 0;
        const closed = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND closed_at >= ?").get(guildId, weekAgo)?.count || 0;
        const successful = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND closed_at >= ? AND close_reason = 'success'").get(guildId, weekAgo)?.count || 0;
        
        return { opened, closed, successful };
    } catch (e) {
        console.error('[DB] getWeeklyTicketStats error:', e.message);
        return { opened: 0, closed: 0, successful: 0 };
    }
}

// ============================================================================
// ACCOUNTS
// ============================================================================

function getAccount(accountId) {
    const stmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
    return stmt.get(accountId);
}

function getAccountByNumber(accountNumber) {
    const stmt = db.prepare('SELECT * FROM accounts WHERE account_number = ?');
    return stmt.get(accountNumber);
}

function getAllAccounts() {
    const stmt = db.prepare('SELECT * FROM accounts ORDER BY account_number');
    return stmt.all();
}

function addAccount(data) {
    try {
        // Get next account number
        const maxNum = db.prepare('SELECT MAX(account_number) as maxNum FROM accounts').get()?.maxNum || 0;
        
        const stmt = db.prepare(`
            INSERT INTO accounts (account_number, account_name, email, password, steam_id, notes, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            data.account_number || (maxNum + 1),
            data.account_name || null,
            data.email || null,
            data.password || null,
            data.steam_id || null,
            data.notes || null,
            data.enabled === undefined ? 1 : (data.enabled ? 1 : 0)
        );
    } catch (e) {
        console.error('[DB] addAccount error:', e.message);
        return null;
    }
}

function updateAccount(id, data) {
    try {
        const stmt = db.prepare(`
            UPDATE accounts SET
                account_name = COALESCE(?, account_name),
                email = COALESCE(?, email),
                password = COALESCE(?, password),
                steam_id = COALESCE(?, steam_id),
                notes = ?,
                enabled = COALESCE(?, enabled)
            WHERE id = ?
        `);
        return stmt.run(
            data.account_name || null,
            data.email || null,
            data.password || null,
            data.steam_id || null,
            data.notes || null,
            data.enabled === undefined ? null : (data.enabled ? 1 : 0),
            id
        );
    } catch (e) {
        console.error('[DB] updateAccount error:', e.message);
        return null;
    }
}

function deleteAccount(id) {
    try {
        const stmt = db.prepare('DELETE FROM accounts WHERE id = ?');
        return stmt.run(id);
    } catch (e) {
        console.error('[DB] deleteAccount error:', e.message);
        return null;
    }
}

// ============================================================================
// STATISTICS
// ============================================================================

function getStats() {
    try {
        const games = db.prepare('SELECT COUNT(*) as count FROM games').get();
        const totalTokens = db.prepare('SELECT COUNT(*) as count FROM tokens').get();
        const availableTokens = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE status = 'available' AND (reserved_by_ticket IS NULL OR reserved_by_ticket = '')").get();
        const reservedTokens = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE status = 'available' AND reserved_by_ticket IS NOT NULL AND reserved_by_ticket != ''").get();
        const usedTokens = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE status = 'used'").get();
        const openTickets = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'").get();
        const totalTickets = db.prepare('SELECT COUNT(*) as count FROM tickets').get();
        
        return {
            games: games?.count || 0,
            totalTokens: totalTokens?.count || 0,
            availableTokens: availableTokens?.count || 0,
            reservedTokens: reservedTokens?.count || 0,
            usedTokens: usedTokens?.count || 0,
            openTickets: openTickets?.count || 0,
            totalTickets: totalTickets?.count || 0
        };
    } catch (e) {
        console.error('[DB] getStats error:', e.message);
        return {
            games: 0, totalTokens: 0, availableTokens: 0,
            reservedTokens: 0, usedTokens: 0, openTickets: 0, totalTickets: 0
        };
    }
}

// ============================================================================
// STEAM ACTIVATIONS LOGGING - NEW!
// ============================================================================

function logActivation(ticketId, userId, username, gameId, gameName, tokenId, accountId, success = true, errorMessage = null, platform = 'steam') {
    try {
        let accountName = null;
        if (accountId) {
            try {
                const account = db.prepare('SELECT account_name FROM accounts WHERE id = ?').get(accountId);
                accountName = account?.account_name;
            } catch (e) {}
        }
        
        const stmt = db.prepare(`
            INSERT INTO activations (ticket_id, user_id, username, game_id, game_name, token_id, account_id, account_name, success, error_message, platform)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(ticketId, userId, username, gameId, gameName, tokenId, accountId, accountName, success ? 1 : 0, errorMessage, platform);
    } catch (err) {
        console.error('[DB] logActivation error:', err.message);
        return null;
    }
}

function getUserActivationCount(userId, platform = null) {
    try {
        let sql = 'SELECT COUNT(*) as count FROM activations WHERE user_id = ? AND success = 1';
        const params = [userId];
        if (platform) {
            sql += ' AND platform = ?';
            params.push(platform);
        }
        return db.prepare(sql).get(...params)?.count || 0;
    } catch (err) {
        return 0;
    }
}

function getGameDailyActivationCount(gameId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        return db.prepare(`
            SELECT COUNT(*) as count FROM activations 
            WHERE game_id = ? AND success = 1 AND DATE(activated_at) = ?
        `).get(gameId, today)?.count || 0;
    } catch (err) {
        return 0;
    }
}

function getRecentActivations(limit = 50, filters = {}) {
    try {
        let sql = 'SELECT * FROM activations WHERE 1=1';
        const params = [];
        
        if (filters.userId) {
            sql += ' AND user_id = ?';
            params.push(filters.userId);
        }
        if (filters.gameId) {
            sql += ' AND game_id = ?';
            params.push(filters.gameId);
        }
        if (filters.platform) {
            sql += ' AND platform = ?';
            params.push(filters.platform);
        }
        if (filters.success !== undefined) {
            sql += ' AND success = ?';
            params.push(filters.success ? 1 : 0);
        }
        
        sql += ' ORDER BY activated_at DESC LIMIT ?';
        params.push(limit);
        
        return db.prepare(sql).all(...params);
    } catch (err) {
        console.error('[DB] getRecentActivations error:', err.message);
        return [];
    }
}

function getActivationStats(days = 30) {
    try {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        
        const total = db.prepare(`SELECT COUNT(*) as count FROM activations WHERE activated_at >= ?`).get(startDate)?.count || 0;
        const successful = db.prepare(`SELECT COUNT(*) as count FROM activations WHERE activated_at >= ? AND success = 1`).get(startDate)?.count || 0;
        const failed = db.prepare(`SELECT COUNT(*) as count FROM activations WHERE activated_at >= ? AND success = 0`).get(startDate)?.count || 0;
        const uniqueUsers = db.prepare(`SELECT COUNT(DISTINCT user_id) as count FROM activations WHERE activated_at >= ? AND success = 1`).get(startDate)?.count || 0;
        
        return {
            total,
            successful,
            failed,
            successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
            uniqueUsers
        };
    } catch (err) {
        console.error('[DB] getActivationStats error:', err.message);
        return { total: 0, successful: 0, failed: 0, successRate: 0, uniqueUsers: 0 };
    }
}

// ============================================================================
// HIGH DEMAND PANEL FUNCTIONS
// ============================================================================

function setHighDemandPanel(guildId, channelId, messageId) {
    try {
        const stmt = db.prepare(`
            INSERT INTO high_demand_panels (guild_id, channel_id, message_id, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(guild_id) DO UPDATE SET 
                channel_id = excluded.channel_id,
                message_id = excluded.message_id,
                updated_at = CURRENT_TIMESTAMP
        `);
        return stmt.run(guildId, channelId, messageId);
    } catch (e) {
        console.error('[DB] setHighDemandPanel error:', e.message);
        return null;
    }
}

function getHighDemandPanel(guildId) {
    try {
        return db.prepare('SELECT * FROM high_demand_panels WHERE guild_id = ?').get(guildId);
    } catch (e) {
        return null;
    }
}

function getAllHighDemandPanels() {
    try {
        return db.prepare('SELECT * FROM high_demand_panels').all();
    } catch (e) {
        return [];
    }
}

function deleteHighDemandPanel(guildId) {
    try {
        return db.prepare('DELETE FROM high_demand_panels WHERE guild_id = ?').run(guildId);
    } catch (e) {
        return null;
    }
}

// ============================================================================
// AUDIT LOGS
// ============================================================================

function logAudit(actionOrData, category, targetType, targetId, targetName, details, userId, username, ipAddress = null) {
    try {
        let action, cat, tType, tId, tName, det, uId, uName, ip;
        
        if (typeof actionOrData === 'object' && actionOrData !== null) {
            action = actionOrData.action;
            cat = actionOrData.category || 'general';
            tType = actionOrData.targetType || actionOrData.target_type;
            tId = actionOrData.targetId || actionOrData.target_id;
            tName = actionOrData.targetName || actionOrData.target_name;
            det = actionOrData.details;
            uId = actionOrData.userId || actionOrData.user_id;
            uName = actionOrData.username || 'system';
            ip = actionOrData.ipAddress || actionOrData.ip_address || null;
        } else {
            action = actionOrData;
            cat = category || 'general';
            tType = targetType;
            tId = targetId;
            tName = targetName;
            det = details;
            uId = userId;
            uName = username || 'system';
            ip = ipAddress;
        }
        
        const stmt = db.prepare(`
            INSERT INTO audit_logs (action, category, target_type, target_id, target_name, details, user_id, username, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(action, cat, tType, tId, tName, 
            typeof det === 'object' ? JSON.stringify(det) : det,
            uId, uName, ip);
    } catch (err) {
        console.error('[DB] logAudit error:', err.message);
        return null;
    }
}

function getAuditLogs(options = {}) {
    try {
        const { category, limit = 100, offset = 0 } = options;
        
        let query = 'SELECT * FROM audit_logs';
        const params = [];
        
        if (category) {
            query += ' WHERE category = ?';
            params.push(category);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        return db.prepare(query).all(...params);
    } catch (err) {
        console.error('[DB] getAuditLogs error:', err.message);
        return [];
    }
}

function getAuditLogsCount(category = null) {
    try {
        let query = 'SELECT COUNT(*) as count FROM audit_logs';
        if (category) {
            query += ' WHERE category = ?';
            return db.prepare(query).get(category)?.count || 0;
        }
        return db.prepare(query).get()?.count || 0;
    } catch (err) {
        return 0;
    }
}

// ============================================================================
// TICKET LOGS
// ============================================================================

function logTicketEvent(ticketId, guildId, guildName, userId, username, gameId, gameName, eventType, eventDetails, staffMember = null, staffId = null, durationMinutes = null, platform = 'steam') {
    try {
        const stmt = db.prepare(`
            INSERT INTO ticket_logs (ticket_id, guild_id, guild_name, user_id, username, game_id, game_name, event_type, event_details, staff_member, staff_id, duration_minutes, platform)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(ticketId, guildId, guildName, userId, username, gameId, gameName, eventType,
            typeof eventDetails === 'object' ? JSON.stringify(eventDetails) : eventDetails,
            staffMember, staffId, durationMinutes, platform);
    } catch (err) {
        console.error('[DB] logTicketEvent error:', err.message);
        return null;
    }
}

function getTicketLogs(options = {}) {
    try {
        const { guildId, eventType, startDate, endDate, limit = 50, offset = 0 } = options;
        
        let query = 'SELECT * FROM ticket_logs WHERE 1=1';
        const params = [];
        
        if (guildId) {
            query += ' AND guild_id = ?';
            params.push(guildId);
        }
        if (eventType) {
            query += ' AND event_type = ?';
            params.push(eventType);
        }
        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        return db.prepare(query).all(...params);
    } catch (err) {
        console.error('[DB] getTicketLogs error:', err.message);
        return [];
    }
}

function getTicketLogsCount(options = {}) {
    try {
        const { guildId, eventType, startDate, endDate } = options;
        
        let query = 'SELECT COUNT(*) as count FROM ticket_logs WHERE 1=1';
        const params = [];
        
        if (guildId) {
            query += ' AND guild_id = ?';
            params.push(guildId);
        }
        if (eventType) {
            query += ' AND event_type = ?';
            params.push(eventType);
        }
        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }
        
        return db.prepare(query).get(...params)?.count || 0;
    } catch (err) {
        return 0;
    }
}

function getTicketLogsSummary(guildId = null, days = 7) {
    try {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        
        let query = `SELECT event_type, COUNT(*) as count FROM ticket_logs WHERE created_at >= ?`;
        const params = [startDate];
        
        if (guildId) {
            query += ' AND guild_id = ?';
            params.push(guildId);
        }
        
        query += ' GROUP BY event_type';
        
        const results = db.prepare(query).all(...params);
        const summary = {};
        results.forEach(r => { summary[r.event_type] = r.count; });
        return summary;
    } catch (err) {
        return {};
    }
}

function getTicketLogsGuilds() {
    try {
        return db.prepare(`
            SELECT DISTINCT guild_id, guild_name 
            FROM ticket_logs 
            WHERE guild_id IS NOT NULL
            ORDER BY guild_name
        `).all();
    } catch (err) {
        return [];
    }
}

// ============================================================================
// ANALYTICS FUNCTIONS
// ============================================================================

function getAnalyticsData(days = 30) {
    try {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        
        const totalActivations = db.prepare(`
            SELECT COUNT(*) as count FROM ticket_logs 
            WHERE event_type = 'completed' AND created_at >= ?
        `).get(startDate)?.count || 0;
        
        const totalTickets = db.prepare(`
            SELECT COUNT(*) as count FROM ticket_logs 
            WHERE event_type = 'opened' AND created_at >= ?
        `).get(startDate)?.count || 0;
        
        const ghosted = db.prepare(`
            SELECT COUNT(*) as count FROM ticket_logs 
            WHERE event_type IN ('ghosted', 'ghosted_activation', 'ghosted_screenshot', 'ghost_closed') AND created_at >= ?
        `).get(startDate)?.count || 0;
        
        const rejected = db.prepare(`
            SELECT COUNT(*) as count FROM ticket_logs 
            WHERE event_type IN ('rejected', 'closed_by_staff', 'user_inactive', 'closed') AND created_at >= ?
        `).get(startDate)?.count || 0;
        
        const uniqueUsers = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count FROM ticket_logs 
            WHERE event_type = 'completed' AND created_at >= ?
        `).get(startDate)?.count || 0;
        
        const successRate = totalTickets > 0 ? Math.round((totalActivations / totalTickets) * 100) : 0;
        const ghostRate = totalTickets > 0 ? Math.round((ghosted / totalTickets) * 100) : 0;
        
        const dailyStats = db.prepare(`
            SELECT 
                DATE(created_at) as date,
                SUM(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END) as activations,
                SUM(CASE WHEN event_type = 'opened' THEN 1 ELSE 0 END) as tickets
            FROM ticket_logs
            WHERE created_at >= ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `).all(startDate);
        
        const topGames = db.prepare(`
            SELECT game_name, COUNT(*) as count
            FROM ticket_logs
            WHERE event_type = 'completed' AND created_at >= ? AND game_name IS NOT NULL
            GROUP BY game_name
            ORDER BY count DESC
            LIMIT 10
        `).all(startDate);
        
        const topUsers = db.prepare(`
            SELECT username, user_id, COUNT(*) as count
            FROM ticket_logs
            WHERE event_type = 'completed' AND created_at >= ?
            GROUP BY user_id
            ORDER BY count DESC
            LIMIT 10
        `).all(startDate);
        
        return {
            totalActivations, totalTickets, ghosted, rejected, uniqueUsers,
            successRate, ghostRate, dailyStats, topGames, topUsers
        };
    } catch (err) {
        console.error('[DB] getAnalyticsData error:', err.message);
        return {
            totalActivations: 0, totalTickets: 0, ghosted: 0, rejected: 0, uniqueUsers: 0,
            successRate: 0, ghostRate: 0, dailyStats: [], topGames: [], topUsers: []
        };
    }
}

function getHourlyActivity(days = 7) {
    try {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        return db.prepare(`
            SELECT strftime('%H', created_at) as hour, COUNT(*) as count
            FROM ticket_logs
            WHERE event_type = 'completed' AND created_at >= ?
            GROUP BY hour
            ORDER BY hour ASC
        `).all(startDate);
    } catch (err) {
        return [];
    }
}

function getGameStats(days = 30) {
    try {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        return db.prepare(`
            SELECT game_name, game_id, COUNT(*) as total_activations, COUNT(DISTINCT user_id) as unique_users
            FROM ticket_logs
            WHERE event_type = 'completed' AND created_at >= ? AND game_name IS NOT NULL
            GROUP BY game_id
            ORDER BY total_activations DESC
        `).all(startDate);
    } catch (err) {
        return [];
    }
}

function getStaffStats(days = 30) {
    try {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        return db.prepare(`
            SELECT staff_member as username, staff_id as user_id, COUNT(*) as total_actions
            FROM ticket_logs
            WHERE staff_member IS NOT NULL AND created_at >= ?
            GROUP BY staff_id
            ORDER BY total_actions DESC
        `).all(startDate);
    } catch (err) {
        return [];
    }
}

function getActivations(filters = {}) {
    try {
        let sql = `
            SELECT tl.*, 
                   COALESCE(tl.game_name, g.game_name) as game_name,
                   t.account_id,
                   a.account_name,
                   a.account_number,
                   tl.created_at as activated_at
            FROM ticket_logs tl
            LEFT JOIN games g ON tl.game_id = g.id OR tl.game_id = g.game_id
            LEFT JOIN tokens t ON t.ticket_id = tl.ticket_id
            LEFT JOIN accounts a ON t.account_id = a.id
            WHERE tl.event_type = 'completed'
        `;
        const params = [];
        
        if (filters.platform) {
            sql += ' AND (tl.platform = ? OR tl.platform IS NULL)';
            params.push(filters.platform);
        }
        if (filters.username) {
            // Search in username, user_id, ticket_id, and game_name
            sql += ' AND (tl.username LIKE ? OR tl.user_id LIKE ? OR tl.ticket_id LIKE ? OR tl.game_name LIKE ?)';
            params.push(`%${filters.username}%`, `%${filters.username}%`, `%${filters.username}%`, `%${filters.username}%`);
        }
        if (filters.userId) {
            sql += ' AND tl.user_id = ?';
            params.push(filters.userId);
        }
        if (filters.gameId) {
            sql += ' AND (tl.game_id = ? OR g.id = ?)';
            params.push(filters.gameId, filters.gameId);
        }
        if (filters.startDate) {
            sql += ' AND DATE(tl.created_at) >= ?';
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            sql += ' AND DATE(tl.created_at) <= ?';
            params.push(filters.endDate);
        }
        
        sql += ' ORDER BY tl.created_at DESC';
        
        if (filters.limit) {
            sql += ' LIMIT ?';
            params.push(filters.limit);
        }
        if (filters.offset) {
            sql += ' OFFSET ?';
            params.push(filters.offset);
        }
        
        return db.prepare(sql).all(...params);
    } catch (err) {
        console.error('[DB] getActivations error:', err.message);
        return [];
    }
}

function getActivationsCount(filters = {}) {
    try {
        let sql = `
            SELECT COUNT(*) as count
            FROM ticket_logs tl
            LEFT JOIN games g ON tl.game_id = g.id OR tl.game_id = g.game_id
            WHERE tl.event_type = 'completed'
        `;
        const params = [];
        
        if (filters.username) {
            sql += ' AND tl.username LIKE ?';
            params.push(`%${filters.username}%`);
        }
        if (filters.userId) {
            sql += ' AND tl.user_id = ?';
            params.push(filters.userId);
        }
        if (filters.gameId) {
            sql += ' AND (tl.game_id = ? OR g.id = ?)';
            params.push(filters.gameId, filters.gameId);
        }
        if (filters.startDate) {
            sql += ' AND DATE(tl.created_at) >= ?';
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            sql += ' AND DATE(tl.created_at) <= ?';
            params.push(filters.endDate);
        }
        
        return db.prepare(sql).get(...params)?.count || 0;
    } catch (err) {
        console.error('[DB] getActivationsCount error:', err.message);
        return 0;
    }
}

function getUserHistory(userId) {
    try {
        return db.prepare(`
            SELECT * FROM ticket_logs
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 500
        `).all(userId);
    } catch (err) {
        return [];
    }
}

function getUserUbisoftHistory(userId) {
    try {
        return db.prepare(`
            SELECT ua.*, ug.game_name
            FROM ubisoft_activations ua
            LEFT JOIN ubisoft_games ug ON ua.game_id = ug.id
            WHERE ua.user_id = ?
            ORDER BY ua.activated_at DESC
            LIMIT 100
        `).all(userId);
    } catch (err) {
        return [];
    }
}

function getUserEAHistory(userId) {
    try {
        return db.prepare(`
            SELECT ea.*, eg.game_name
            FROM ea_activations ea
            LEFT JOIN ea_games eg ON ea.game_id = eg.id
            WHERE ea.user_id = ?
            ORDER BY ea.activated_at DESC
            LIMIT 100
        `).all(userId);
    } catch (err) {
        return [];
    }
}

function getAllUserHistory(userId) {
    try {
        console.log(`[DB] getAllUserHistory for userId: ${userId}`);
        
        // Get Steam history from ticket_logs (this was working!)
        const steamHistory = db.prepare(`
            SELECT ticket_id, game_name, 'steam' as platform, created_at, 
                   COALESCE(event_details, 'Completed') as close_reason
            FROM ticket_logs
            WHERE user_id = ? AND event_type = 'completed'
            ORDER BY created_at DESC
            LIMIT 50
        `).all(userId);
        console.log(`[DB] Steam ticket_logs: ${steamHistory.length}`);
        
        // Get Ubisoft history
        let ubisoftHistory = [];
        try {
            ubisoftHistory = db.prepare(`
                SELECT ua.ticket_id, ug.game_name, 'ubisoft' as platform, ua.activated_at as created_at,
                       'Completed' as close_reason
                FROM ubisoft_activations ua
                LEFT JOIN ubisoft_games ug ON ua.game_id = ug.id
                WHERE ua.user_id = ?
                ORDER BY ua.activated_at DESC
                LIMIT 50
            `).all(userId);
        } catch (e) {
            console.log('[DB] Ubisoft query error:', e.message);
        }
        console.log(`[DB] Ubisoft activations: ${ubisoftHistory.length}`);
        
        // Get EA history
        let eaHistory = [];
        try {
            eaHistory = db.prepare(`
                SELECT ea.ticket_id, COALESCE(ea.game_name, eg.game_name) as game_name, 'ea' as platform, 
                       ea.activated_at as created_at, 'Completed' as close_reason
                FROM ea_activations ea
                LEFT JOIN ea_games eg ON ea.game_id = eg.id
                WHERE ea.user_id = ?
                ORDER BY ea.activated_at DESC
                LIMIT 50
            `).all(userId);
        } catch (e) {
            console.log('[DB] EA query error:', e.message);
        }
        console.log(`[DB] EA activations: ${eaHistory.length}`);
        
        // Combine all sources, deduplicate by ticket_id
        const seenTickets = new Set();
        const allHistory = [];
        
        // Add Steam first
        for (const item of steamHistory) {
            if (item.ticket_id && !seenTickets.has(item.ticket_id)) {
                seenTickets.add(item.ticket_id);
                allHistory.push(item);
            }
        }
        
        // Add Ubisoft
        for (const item of ubisoftHistory) {
            if (item.ticket_id && !seenTickets.has(item.ticket_id)) {
                seenTickets.add(item.ticket_id);
                allHistory.push(item);
            } else if (!item.ticket_id && item.game_name) {
                allHistory.push(item);
            }
        }
        
        // Add EA
        for (const item of eaHistory) {
            if (item.ticket_id && !seenTickets.has(item.ticket_id)) {
                seenTickets.add(item.ticket_id);
                allHistory.push(item);
            } else if (!item.ticket_id && item.game_name) {
                allHistory.push(item);
            }
        }
        
        // Sort by date
        allHistory.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        console.log(`[DB] Total combined history: ${allHistory.length}`);
        return allHistory;
    } catch (err) {
        console.error('[DB] getAllUserHistory error:', err.message);
        return [];
    }
}

// ============================================================================
// STAFF ACTIVITY FUNCTIONS
// ============================================================================

function getStaffActivity(days = 30) {
    try {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        return db.prepare(`
            SELECT 
                COALESCE(staff_id, staff_member) as user_id,
                staff_member as username,
                COUNT(*) as total_actions,
                SUM(CASE WHEN event_type = 'staff_action' THEN 1 ELSE 0 END) as verifications_approved,
                SUM(CASE WHEN event_type = 'staff_rejected' THEN 1 ELSE 0 END) as verifications_rejected,
                SUM(CASE WHEN event_type = 'manual_generation' OR (event_type = 'staff_action' AND event_details LIKE '%token%') THEN 1 ELSE 0 END) as manual_generations,
                SUM(CASE WHEN event_type IN ('cdclose', 'hdclose', 'cooldown_applied', 'closed') THEN 1 ELSE 0 END) as cooldowns_applied,
                SUM(CASE WHEN event_type = 'closed' AND staff_member IS NOT NULL THEN 1 ELSE 0 END) as manual_closes,
                SUM(CASE WHEN event_type = 'help_response' THEN 1 ELSE 0 END) as help_responses,
                MAX(created_at) as last_action
            FROM ticket_logs
            WHERE (staff_id IS NOT NULL OR staff_member IS NOT NULL) AND created_at >= ?
            GROUP BY COALESCE(staff_id, staff_member)
            ORDER BY total_actions DESC
        `).all(startDate);
    } catch (err) {
        console.error('[DB] getStaffActivity error:', err.message);
        return [];
    }
}

function getStaffActivityByDay(days = 30) {
    try {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        return db.prepare(`
            SELECT DATE(created_at) as date, COUNT(*) as actions, COUNT(DISTINCT COALESCE(staff_id, staff_member)) as active_staff
            FROM ticket_logs
            WHERE (staff_id IS NOT NULL OR staff_member IS NOT NULL) AND created_at >= ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `).all(startDate);
    } catch (err) {
        return [];
    }
}

function getStaffActivityDetails(staffId, days = 30) {
    try {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        return db.prepare(`
            SELECT * FROM ticket_logs
            WHERE staff_id = ? AND created_at >= ?
            ORDER BY created_at DESC
            LIMIT 200
        `).all(staffId, startDate);
    } catch (err) {
        return [];
    }
}

// ============================================================================
// MACROS FUNCTIONS
// ============================================================================

function getAllMacros() {
    try {
        return db.prepare('SELECT * FROM macros ORDER BY name ASC').all();
    } catch (err) {
        return [];
    }
}

function getMacroById(id) {
    try {
        return db.prepare('SELECT * FROM macros WHERE id = ?').get(id);
    } catch (err) {
        return null;
    }
}

function getMacroByName(name) {
    try {
        return db.prepare('SELECT * FROM macros WHERE name = ?').get(name.toLowerCase());
    } catch (err) {
        return null;
    }
}

function getMacro(name) {
    return getMacroByName(name);
}

function getMacroNames() {
    try {
        return db.prepare('SELECT name, title, emoji FROM macros ORDER BY name ASC').all();
    } catch (err) {
        return [];
    }
}

function createMacro(name, title, content, color, emoji, createdBy) {
    try {
        return db.prepare(`
            INSERT INTO macros (name, title, content, color, emoji, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(name.toLowerCase(), title, content, color, emoji, createdBy);
    } catch (err) {
        console.error('[DB] createMacro error:', err.message);
        return null;
    }
}

function updateMacro(id, title, content, color, emoji) {
    try {
        return db.prepare(`
            UPDATE macros SET title = ?, content = ?, color = ?, emoji = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(title, content, color, emoji, id);
    } catch (err) {
        return null;
    }
}

function deleteMacro(id) {
    try {
        return db.prepare('DELETE FROM macros WHERE id = ?').run(id);
    } catch (err) {
        return null;
    }
}

// ============================================================================
// UBISOFT GAMES
// ============================================================================

function getAllUbisoftGames() {
    try {
        return db.prepare('SELECT * FROM ubisoft_games ORDER BY game_name ASC').all();
    } catch (e) {
        return [];
    }
}

function getUbisoftGame(gameId) {
    try {
        return db.prepare('SELECT * FROM ubisoft_games WHERE id = ?').get(gameId);
    } catch (e) {
        return null;
    }
}

function getUbisoftGamesByPanel(panelType) {
    try {
        // Return ALL enabled games for both panels (free and paid)
        return db.prepare('SELECT * FROM ubisoft_games WHERE enabled = 1 ORDER BY game_name ASC').all();
    } catch (e) {
        return [];
    }
}

function addUbisoftGame(data) {
    try {
        // Handle both object and individual parameters for backward compatibility
        const gameName = typeof data === 'object' ? data.game_name : data;
        const uplayAppId = typeof data === 'object' ? (data.uplay_app_id || data.app_id) : arguments[1];
        const steamAppId = typeof data === 'object' ? data.steam_app_id : arguments[2];
        const panelType = typeof data === 'object' ? data.panel_type : arguments[3];
        const downloadLinks = typeof data === 'object' ? data.download_links : arguments[4];
        const instructions = typeof data === 'object' ? data.instructions : arguments[5];
        const coverUrl = typeof data === 'object' ? data.cover_url : arguments[6];
        const sizeGb = typeof data === 'object' ? data.size_gb : null;
        const folderName = typeof data === 'object' ? data.folder_name : null;
        const demandType = typeof data === 'object' ? data.demand_type : 'normal';
        
        const stmt = db.prepare(`
            INSERT INTO ubisoft_games (game_name, uplay_app_id, steam_app_id, panel_type, download_links, instructions, cover_url, size_gb, folder_name, demand_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(gameName, uplayAppId || null, steamAppId || null, panelType || 'free', downloadLinks || null, instructions || null, coverUrl || null, sizeGb || null, folderName || null, demandType || 'normal');
    } catch (e) {
        console.error('[DB] addUbisoftGame error:', e.message);
        return null;
    }
}

function updateUbisoftGame(id, data) {
    try {
        // Handle both object and individual parameters for backward compatibility
        const gameName = typeof data === 'object' ? data.game_name : data;
        const uplayAppId = typeof data === 'object' ? (data.uplay_app_id || data.app_id) : arguments[2];
        const steamAppId = typeof data === 'object' ? data.steam_app_id : arguments[3];
        const panelType = typeof data === 'object' ? data.panel_type : arguments[4];
        const downloadLinks = typeof data === 'object' ? data.download_links : arguments[5];
        const instructions = typeof data === 'object' ? data.instructions : arguments[6];
        const coverUrl = typeof data === 'object' ? data.cover_url : arguments[7];
        const enabled = typeof data === 'object' ? (data.enabled === 'on' || data.enabled === true || data.enabled === 1) : arguments[8];
        const sizeGb = typeof data === 'object' ? data.size_gb : null;
        const folderName = typeof data === 'object' ? data.folder_name : null;
        const demandType = typeof data === 'object' ? data.demand_type : 'normal';
        
        const stmt = db.prepare(`
            UPDATE ubisoft_games 
            SET game_name = ?, uplay_app_id = ?, steam_app_id = ?, panel_type = ?, 
                download_links = ?, instructions = ?, cover_url = ?, enabled = ?,
                size_gb = ?, folder_name = ?, demand_type = ?
            WHERE id = ?
        `);
        return stmt.run(gameName, uplayAppId || null, steamAppId || null, panelType || 'free', downloadLinks || null, instructions || null, coverUrl || null, enabled ? 1 : 0, sizeGb || null, folderName || null, demandType || 'normal', id);
    } catch (e) {
        console.error('[DB] updateUbisoftGame error:', e.message);
        return null;
    }
}

function deleteUbisoftGame(id) {
    try {
        db.prepare('DELETE FROM ubisoft_tokens WHERE game_id = ?').run(id);
        return db.prepare('DELETE FROM ubisoft_games WHERE id = ?').run(id);
    } catch (e) {
        return null;
    }
}

function toggleUbisoftGameHighDemand(id) {
    try {
        const game = db.prepare('SELECT demand_type FROM ubisoft_games WHERE id = ?').get(id);
        const newDemand = game?.demand_type === 'high' ? 'normal' : 'high';
        return db.prepare('UPDATE ubisoft_games SET demand_type = ? WHERE id = ?').run(newDemand, id);
    } catch (e) {
        console.error('[DB] toggleUbisoftGameHighDemand error:', e.message);
        return null;
    }
}

function getUbisoftHighDemandGames() {
    try {
        return db.prepare(`
            SELECT g.*, 
                   (SELECT COUNT(*) FROM ubisoft_tokens t 
                    WHERE t.game_id = g.id 
                    AND t.reserved_by_ticket IS NULL 
                    AND (t.last_used_at IS NULL OR datetime(t.last_used_at, '+24 hours') < datetime('now'))) as available_tokens
            FROM ubisoft_games g 
            WHERE g.demand_type = 'high' AND g.enabled = 1
            ORDER BY g.game_name
        `).all();
    } catch (e) {
        console.error('[DB] getUbisoftHighDemandGames error:', e.message);
        return [];
    }
}

// ============================================================================
// UBISOFT ACCOUNTS
// ============================================================================

function getAllUbisoftAccounts() {
    try {
        return db.prepare('SELECT * FROM ubisoft_accounts ORDER BY account_name ASC').all();
    } catch (e) {
        return [];
    }
}

function getUbisoftAccount(accountId) {
    try {
        return db.prepare('SELECT * FROM ubisoft_accounts WHERE id = ?').get(accountId);
    } catch (e) {
        return null;
    }
}

function addUbisoftAccount(accountName, email, password) {
    try {
        const stmt = db.prepare(`
            INSERT INTO ubisoft_accounts (account_name, email, password)
            VALUES (?, ?, ?)
        `);
        return stmt.run(accountName, email, password);
    } catch (e) {
        console.error('[DB] addUbisoftAccount error:', e.message);
        return null;
    }
}

function updateUbisoftAccount(id, accountName, email, password, enabled) {
    try {
        if (password) {
            const stmt = db.prepare(`
                UPDATE ubisoft_accounts 
                SET account_name = ?, email = ?, password = ?, enabled = ?
                WHERE id = ?
            `);
            return stmt.run(accountName, email, password, enabled, id);
        } else {
            const stmt = db.prepare(`
                UPDATE ubisoft_accounts 
                SET account_name = ?, email = ?, enabled = ?
                WHERE id = ?
            `);
            return stmt.run(accountName, email, enabled, id);
        }
    } catch (e) {
        console.error('[DB] updateUbisoftAccount error:', e.message);
        return null;
    }
}

function deleteUbisoftAccount(id) {
    try {
        db.prepare('DELETE FROM ubisoft_tokens WHERE account_id = ?').run(id);
        return db.prepare('DELETE FROM ubisoft_accounts WHERE id = ?').run(id);
    } catch (e) {
        return null;
    }
}

// ============================================================================
// UBISOFT TOKENS
// ============================================================================

function getAllUbisoftTokens() {
    try {
        return db.prepare(`
            SELECT t.*, g.game_name, a.account_name, a.email
            FROM ubisoft_tokens t
            JOIN ubisoft_games g ON t.game_id = g.id
            JOIN ubisoft_accounts a ON t.account_id = a.id
            ORDER BY g.game_name, a.account_name
        `).all();
    } catch (e) {
        return [];
    }
}

function getUbisoftTokensByGame(gameId) {
    try {
        return db.prepare(`
            SELECT t.*, a.account_name, a.email
            FROM ubisoft_tokens t
            JOIN ubisoft_accounts a ON t.account_id = a.id
            WHERE t.game_id = ?
            ORDER BY a.account_name
        `).all(gameId);
    } catch (e) {
        return [];
    }
}

function getUbisoftTokensByAccount(accountId) {
    try {
        return db.prepare(`
            SELECT t.*, g.game_name
            FROM ubisoft_tokens t
            JOIN ubisoft_games g ON t.game_id = g.id
            WHERE t.account_id = ?
            ORDER BY g.game_name
        `).all(accountId);
    } catch (e) {
        return [];
    }
}

function addUbisoftToken(accountId, gameId) {
    try {
        const stmt = db.prepare(`
            INSERT INTO ubisoft_tokens (account_id, game_id)
            VALUES (?, ?)
        `);
        return stmt.run(accountId, gameId);
    } catch (e) {
        console.error('[DB] addUbisoftToken error:', e.message);
        return null;
    }
}

function addUbisoftTokensBulk(accountId, gameId, count) {
    try {
        const stmt = db.prepare(`
            INSERT INTO ubisoft_tokens (account_id, game_id)
            VALUES (?, ?)
        `);
        const insert = db.transaction((count) => {
            for (let i = 0; i < count; i++) {
                stmt.run(accountId, gameId);
            }
        });
        insert(count);
        return { changes: count };
    } catch (e) {
        console.error('[DB] addUbisoftTokensBulk error:', e.message);
        return { changes: 0 };
    }
}

function deleteUbisoftToken(id) {
    try {
        return db.prepare('DELETE FROM ubisoft_tokens WHERE id = ?').run(id);
    } catch (e) {
        return null;
    }
}

function resetUbisoftToken(id) {
    try {
        return db.prepare(`
            UPDATE ubisoft_tokens 
            SET reserved_by_ticket = NULL, 
                last_used_at = NULL, 
                used_by_user_id = NULL, 
                used_by_username = NULL,
                used_in_ticket = NULL
            WHERE id = ?
        `).run(id);
    } catch (e) {
        console.error('[DB] resetUbisoftToken error:', e.message);
        return null;
    }
}

function markUbisoftTokenUsedManually(id) {
    try {
        return db.prepare(`
            UPDATE ubisoft_tokens 
            SET last_used_at = datetime('now'),
                reserved_by_ticket = NULL,
                used_by_username = 'Manual (Dashboard)'
            WHERE id = ?
        `).run(id);
    } catch (e) {
        console.error('[DB] markUbisoftTokenUsedManually error:', e.message);
        return null;
    }
}

// Mark ALL tokens for a specific account+game as used (for daily limit scenarios)
function markUbisoftAccountGameTokensUsed(accountEmail, gameId) {
    try {
        const result = db.prepare(`
            UPDATE ubisoft_tokens 
            SET last_used_at = datetime('now'),
                used_by_username = 'Daily Limit (Auto)'
            WHERE game_id = ? 
              AND account_id IN (SELECT id FROM ubisoft_accounts WHERE email = ?)
              AND (last_used_at IS NULL OR datetime(last_used_at, '+24 hours') < datetime('now'))
        `).run(gameId, accountEmail);
        console.log(`[DB] Marked ${result.changes} tokens as used for account ${accountEmail}, game ${gameId} (daily limit)`);
        return result;
    } catch (e) {
        console.error('[DB] markUbisoftAccountGameTokensUsed error:', e.message);
        return null;
    }
}

function getAvailableUbisoftToken(gameId) {
    try {
        return db.prepare(`
            SELECT t.*, a.email, a.password, a.account_name, a.exe_index
            FROM ubisoft_tokens t
            JOIN ubisoft_accounts a ON t.account_id = a.id
            JOIN ubisoft_games g ON t.game_id = g.id
            WHERE t.game_id = ?
              AND a.enabled = 1
              AND g.enabled = 1
              AND t.reserved_by_ticket IS NULL
              AND (t.last_used_at IS NULL 
                   OR datetime(t.last_used_at, '+24 hours') < datetime('now'))
            ORDER BY t.last_used_at ASC NULLS FIRST
            LIMIT 1
        `).get(gameId);
    } catch (e) {
        return null;
    }
}

// Get available Ubisoft token excluding certain account emails (for retry with different account)
function getAvailableUbisoftTokenExcluding(gameId, excludeEmails = []) {
    try {
        if (!excludeEmails || excludeEmails.length === 0) {
            return getAvailableUbisoftToken(gameId);
        }
        
        const placeholders = excludeEmails.map(() => '?').join(',');
        return db.prepare(`
            SELECT t.*, a.email, a.password, a.account_name, a.exe_index
            FROM ubisoft_tokens t
            JOIN ubisoft_accounts a ON t.account_id = a.id
            JOIN ubisoft_games g ON t.game_id = g.id
            WHERE t.game_id = ?
              AND a.enabled = 1
              AND g.enabled = 1
              AND t.reserved_by_ticket IS NULL
              AND a.email NOT IN (${placeholders})
              AND (t.last_used_at IS NULL 
                   OR datetime(t.last_used_at, '+24 hours') < datetime('now'))
            ORDER BY t.last_used_at ASC NULLS FIRST
            LIMIT 1
        `).get(gameId, ...excludeEmails);
    } catch (e) {
        console.error('[DB] getAvailableUbisoftTokenExcluding error:', e.message);
        return null;
    }
}

// Reserve a specific Ubisoft token by its ID
function reserveUbisoftTokenById(tokenId, ticketId) {
    try {
        const result = db.prepare(`
            UPDATE ubisoft_tokens 
            SET reserved_by_ticket = ?
            WHERE id = ? AND reserved_by_ticket IS NULL
        `).run(ticketId, tokenId);
        
        if (result.changes > 0) {
            console.log(`[DB] Reserved Ubisoft token ${tokenId} for ticket ${ticketId}`);
            return true;
        }
        return false;
    } catch (e) {
        console.error('[DB] reserveUbisoftTokenById error:', e.message);
        return false;
    }
}

function getAvailableUbisoftTokenCount(gameId) {
    try {
        const result = db.prepare(`
            SELECT COUNT(*) as count
            FROM ubisoft_tokens t
            JOIN ubisoft_accounts a ON t.account_id = a.id
            JOIN ubisoft_games g ON t.game_id = g.id
            WHERE t.game_id = ?
              AND a.enabled = 1
              AND g.enabled = 1
              AND t.reserved_by_ticket IS NULL
              AND (t.last_used_at IS NULL 
                   OR datetime(t.last_used_at, '+24 hours') < datetime('now'))
        `).get(gameId);
        return result ? result.count : 0;
    } catch (e) {
        return 0;
    }
}

function reserveUbisoftToken(gameId, ticketId) {
    try {
        // Find an available token
        const token = db.prepare(`
            SELECT t.id, a.email, a.account_name
            FROM ubisoft_tokens t
            JOIN ubisoft_accounts a ON t.account_id = a.id
            JOIN ubisoft_games g ON t.game_id = g.id
            WHERE t.game_id = ?
              AND a.enabled = 1
              AND g.enabled = 1
              AND t.reserved_by_ticket IS NULL
              AND (t.last_used_at IS NULL 
                   OR datetime(t.last_used_at, '+24 hours') < datetime('now'))
            ORDER BY t.last_used_at ASC NULLS FIRST
            LIMIT 1
        `).get(gameId);
        
        if (!token) {
            return { success: false, error: 'No available tokens' };
        }
        
        // Reserve it
        db.prepare('UPDATE ubisoft_tokens SET reserved_by_ticket = ? WHERE id = ?').run(ticketId, token.id);
        console.log(`[DB] Reserved Ubisoft token ${token.id} (${token.email}) for ticket ${ticketId}`);
        
        return { success: true, tokenId: token.id, accountEmail: token.email, accountName: token.account_name };
    } catch (e) {
        console.error('[DB] reserveUbisoftToken error:', e.message);
        return { success: false, error: e.message };
    }
}

function releaseUbisoftToken(ticketId) {
    try {
        const result = db.prepare('UPDATE ubisoft_tokens SET reserved_by_ticket = NULL WHERE reserved_by_ticket = ?').run(ticketId);
        if (result.changes > 0) {
            console.log(`[DB] Released Ubisoft token for ticket ${ticketId}`);
        }
        return result.changes > 0;
    } catch (e) {
        console.error('[DB] releaseUbisoftToken error:', e.message);
        return false;
    }
}

function getReservedUbisoftToken(ticketId) {
    try {
        return db.prepare(`
            SELECT t.*, a.email, a.password, a.account_name, a.exe_index
            FROM ubisoft_tokens t
            JOIN ubisoft_accounts a ON t.account_id = a.id
            WHERE t.reserved_by_ticket = ?
        `).get(ticketId);
    } catch (e) {
        return null;
    }
}

function getTotalUbisoftTokenCount(gameId) {
    try {
        const result = db.prepare(`
            SELECT COUNT(*) as count
            FROM ubisoft_tokens t
            JOIN ubisoft_accounts a ON t.account_id = a.id
            WHERE t.game_id = ? AND a.enabled = 1
        `).get(gameId);
        return result ? result.count : 0;
    } catch (e) {
        return 0;
    }
}

function markUbisoftTokenUsed(tokenId, userId, username, ticketId) {
    try {
        // Regenerate after 24 hours
        const regeneratesAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const stmt = db.prepare(`
            UPDATE ubisoft_tokens 
            SET last_used_at = datetime('now'),
                regenerates_at = ?,
                used_by_user_id = ?,
                used_by_username = ?,
                used_in_ticket = ?,
                reserved_by_ticket = NULL
            WHERE id = ?
        `);
        return stmt.run(regeneratesAt, userId, username, ticketId, tokenId);
    } catch (e) {
        console.error('[DB] markUbisoftTokenUsed error:', e.message);
        return null;
    }
}

function markAllUbisoftTokensExhausted(accountId, gameId) {
    try {
        const stmt = db.prepare(`
            UPDATE ubisoft_tokens 
            SET last_used_at = datetime('now')
            WHERE account_id = ? AND game_id = ?
              AND (last_used_at IS NULL OR datetime(last_used_at, '+24 hours') < datetime('now'))
        `);
        const result = stmt.run(accountId, gameId);
        console.log(`[DB] Marked ${result.changes} Ubisoft tokens as exhausted for account ${accountId}, game ${gameId}`);
        return result;
    } catch (e) {
        return null;
    }
}

// ============================================================================
// UBISOFT ACTIVATIONS
// ============================================================================

function logUbisoftActivation(tokenId, accountId, gameId, userId, username, ticketId, success = true, errorMessage = null) {
    try {
        const stmt = db.prepare(`
            INSERT INTO ubisoft_activations (token_id, account_id, game_id, user_id, username, ticket_id, success, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(tokenId, accountId, gameId, userId, username, ticketId, success ? 1 : 0, errorMessage);
    } catch (e) {
        console.error('[DB] logUbisoftActivation error:', e.message);
        return null;
    }
}

function getUbisoftActivations(limit = 100, offset = 0, filters = {}) {
    try {
        let sql = `
            SELECT a.*, g.game_name, acc.account_name
            FROM ubisoft_activations a
            LEFT JOIN ubisoft_games g ON a.game_id = g.id
            LEFT JOIN ubisoft_accounts acc ON a.account_id = acc.id
            WHERE 1=1
        `;
        const params = [];
        
        if (filters.gameId) {
            sql += ' AND a.game_id = ?';
            params.push(filters.gameId);
        }
        if (filters.userId) {
            sql += ' AND a.user_id = ?';
            params.push(filters.userId);
        }
        if (filters.username) {
            sql += ' AND a.username LIKE ?';
            params.push(`%${filters.username}%`);
        }
        if (filters.success !== undefined) {
            sql += ' AND a.success = ?';
            params.push(filters.success ? 1 : 0);
        }
        
        sql += ' ORDER BY a.activated_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        return db.prepare(sql).all(...params);
    } catch (e) {
        return [];
    }
}

function getUbisoftActivationsCount(filters = {}) {
    try {
        let sql = 'SELECT COUNT(*) as count FROM ubisoft_activations a WHERE 1=1';
        const params = [];
        
        if (filters.gameId) {
            sql += ' AND a.game_id = ?';
            params.push(filters.gameId);
        }
        if (filters.userId) {
            sql += ' AND a.user_id = ?';
            params.push(filters.userId);
        }
        if (filters.username) {
            sql += ' AND a.username LIKE ?';
            params.push(`%${filters.username}%`);
        }
        if (filters.success !== undefined) {
            sql += ' AND a.success = ?';
            params.push(filters.success ? 1 : 0);
        }
        
        const result = db.prepare(sql).get(...params);
        return result ? result.count : 0;
    } catch (e) {
        return 0;
    }
}

// ============================================================================
// UBISOFT SERVER SETTINGS
// ============================================================================

function getUbisoftServerSettings(guildId) {
    try {
        return db.prepare('SELECT * FROM ubisoft_server_settings WHERE guild_id = ?').get(guildId);
    } catch (e) {
        return null;
    }
}

function setUbisoftServerSettings(guildId, settings) {
    try {
        const stmt = db.prepare(`
            INSERT INTO ubisoft_server_settings (guild_id, ticket_channel_id, panel_message_id, panel_channel_id, staff_role_ids, log_channel_id, exe_path, token_folder)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET 
                ticket_channel_id = excluded.ticket_channel_id,
                panel_message_id = excluded.panel_message_id,
                panel_channel_id = excluded.panel_channel_id,
                staff_role_ids = excluded.staff_role_ids,
                log_channel_id = excluded.log_channel_id,
                exe_path = excluded.exe_path,
                token_folder = excluded.token_folder
        `);
        return stmt.run(
            guildId,
            settings.ticket_channel_id || null,
            settings.panel_message_id || null,
            settings.panel_channel_id || null,
            settings.staff_role_ids || null,
            settings.log_channel_id || null,
            settings.exe_path || 'ubisoft/DenuvoTicket.exe',
            settings.token_folder || 'ubisoft/token/'
        );
    } catch (e) {
        console.error('[DB] setUbisoftServerSettings error:', e.message);
        return null;
    }
}

// ============================================================================
// UBISOFT TICKETS
// ============================================================================

function createUbisoftTicket(ticketId, threadId, guildId, userId, username, gameId) {
    try {
        const stmt = db.prepare(`
            INSERT INTO ubisoft_tickets (ticket_id, thread_id, guild_id, user_id, username, game_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(ticketId, threadId, guildId, userId, username, gameId);
    } catch (e) {
        console.error('[DB] createUbisoftTicket error:', e.message);
        return null;
    }
}

function getUbisoftTicket(ticketId) {
    try {
        return db.prepare(`
            SELECT t.*, g.game_name
            FROM ubisoft_tickets t
            LEFT JOIN ubisoft_games g ON t.game_id = g.id
            WHERE t.ticket_id = ?
        `).get(ticketId);
    } catch (e) {
        return null;
    }
}

function getUbisoftTicketByThread(threadId) {
    try {
        return db.prepare(`
            SELECT t.*, g.game_name
            FROM ubisoft_tickets t
            LEFT JOIN ubisoft_games g ON t.game_id = g.id
            WHERE t.thread_id = ?
        `).get(threadId);
    } catch (e) {
        return null;
    }
}

function getUserOpenUbisoftTicket(userId, guildId) {
    try {
        return db.prepare(`
            SELECT * FROM ubisoft_tickets 
            WHERE user_id = ? AND guild_id = ? AND status = 'open'
            LIMIT 1
        `).get(userId, guildId);
    } catch (e) {
        return null;
    }
}

function getOpenUbisoftTickets() {
    try {
        return db.prepare(`
            SELECT t.*, g.game_name
            FROM ubisoft_tickets t
            LEFT JOIN ubisoft_games g ON t.game_id = g.id
            WHERE t.status = 'open'
            ORDER BY t.created_at ASC
        `).all();
    } catch (e) {
        return [];
    }
}

function updateUbisoftTicketStatus(ticketId, status) {
    try {
        return db.prepare('UPDATE ubisoft_tickets SET status = ? WHERE ticket_id = ?').run(status, ticketId);
    } catch (e) {
        return null;
    }
}

function closeUbisoftTicket(ticketId, reason) {
    try {
        const now = new Date().toISOString();
        return db.prepare(`
            UPDATE ubisoft_tickets 
            SET status = 'closed', close_reason = ?, closed_at = ?
            WHERE ticket_id = ?
        `).run(reason, now, ticketId);
    } catch (e) {
        return null;
    }
}

function getUbisoftUserOpenTicket(userId, guildId) {
    try {
        return db.prepare(`
            SELECT * FROM ubisoft_tickets 
            WHERE user_id = ? AND guild_id = ? AND status != 'closed'
            LIMIT 1
        `).get(userId, guildId);
    } catch (e) {
        return null;
    }
}

function saveUbisoftTranscript(ticketId, threadId, userId, username, gameName, transcript) {
    try {
        return db.prepare(`
            INSERT INTO transcripts (ticket_id, thread_id, user_id, username, game_name, messages_json, platform)
            VALUES (?, ?, ?, ?, ?, ?, 'ubisoft')
        `).run(ticketId, threadId, userId, username, gameName, transcript);
    } catch (e) {
        console.error('[DB] saveUbisoftTranscript error:', e.message);
        return null;
    }
}

function setUbisoftTicketChannel(guildId, channelId) {
    try {
        return db.prepare(`
            INSERT INTO server_settings (guild_id, ubisoft_ticket_channel_id)
            VALUES (?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET ubisoft_ticket_channel_id = ?
        `).run(guildId, channelId, channelId);
    } catch (e) {
        console.error('[DB] setUbisoftTicketChannel error:', e.message);
        return null;
    }
}

function getUbisoftTicketChannel(guildId) {
    try {
        const result = db.prepare(`
            SELECT ubisoft_ticket_channel_id FROM server_settings WHERE guild_id = ?
        `).get(guildId);
        return result?.ubisoft_ticket_channel_id;
    } catch (e) {
        return null;
    }
}

function getAllUbisoftPanels() {
    try {
        return db.prepare(`
            SELECT guild_id, message_id as panel_message_id, 
                   channel_id as panel_channel_id, panel_type
            FROM ubisoft_panel_settings 
            WHERE message_id IS NOT NULL
        `).all();
    } catch (e) {
        // Fallback to old server_settings table
        try {
            return db.prepare(`
                SELECT guild_id, ubisoft_panel_message_id as panel_message_id, 
                       ubisoft_panel_channel_id as panel_channel_id, 'free' as panel_type
                FROM server_settings 
                WHERE ubisoft_panel_message_id IS NOT NULL
            `).all();
        } catch (e2) {
            return [];
        }
    }
}

function saveUbisoftPanel(guildId, messageId, channelId, panelType = 'free') {
    try {
        return db.prepare(`
            INSERT INTO ubisoft_panel_settings (guild_id, panel_type, channel_id, message_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(guild_id, panel_type) DO UPDATE SET 
                channel_id = ?, 
                message_id = ?
        `).run(guildId, panelType, channelId, messageId, channelId, messageId);
    } catch (e) {
        console.error('[DB] saveUbisoftPanel error:', e.message);
        return null;
    }
}

function getUbisoftTicketChannel(guildId) {
    try {
        const result = db.prepare(`
            SELECT ticket_channel_id FROM ubisoft_panel_settings 
            WHERE guild_id = ? AND ticket_channel_id IS NOT NULL 
            LIMIT 1
        `).get(guildId);
        return result?.ticket_channel_id;
    } catch (e) {
        return null;
    }
}

function setUbisoftTicketChannel(guildId, channelId, panelType = 'free') {
    try {
        return db.prepare(`
            UPDATE ubisoft_panel_settings 
            SET ticket_channel_id = ? 
            WHERE guild_id = ? AND panel_type = ?
        `).run(channelId, guildId, panelType);
    } catch (e) {
        return null;
    }
}

// ============================================================================
// UTILITY
// ============================================================================

function getDatabase() {
    return db;
}

// ============================================================================
// EA GAMES
// ============================================================================

function getAllEAGames() {
    return db.prepare('SELECT * FROM ea_games ORDER BY game_name ASC').all();
}

function getEAGame(gameId) {
    return db.prepare('SELECT * FROM ea_games WHERE id = ?').get(gameId);
}

function getEAGamesByPanel(panelType) {
    // Return ALL enabled games for both panels (same as Ubisoft)
    return db.prepare('SELECT * FROM ea_games WHERE enabled = 1 ORDER BY game_name ASC').all();
}

function addEAGame(data) {
    try {
        console.log('[DB] addEAGame called with:', JSON.stringify(data));
        
        // Handle both object and individual parameters for backward compatibility
        const gameName = typeof data === 'object' ? data.game_name : data;
        const contentId = typeof data === 'object' ? (data.content_id || data.app_id) : arguments[1];
        const panelType = typeof data === 'object' ? data.panel_type : arguments[2];
        const downloadLinks = typeof data === 'object' ? data.download_links : arguments[3];
        const instructions = typeof data === 'object' ? data.instructions : arguments[4];
        const coverUrl = typeof data === 'object' ? data.cover_url : arguments[5];
        const sizeGb = typeof data === 'object' ? data.size_gb : null;
        const folderName = typeof data === 'object' ? data.folder_name : null;
        const demandType = typeof data === 'object' ? data.demand_type : 'normal';
        
        console.log('[DB] addEAGame parsed:', { gameName, contentId, panelType, downloadLinks: downloadLinks?.substring(0, 50), instructions: instructions?.substring(0, 50), coverUrl, sizeGb, folderName, demandType });
        
        const stmt = db.prepare(`
            INSERT INTO ea_games (game_name, content_id, panel_type, download_links, instructions, cover_url, size_gb, folder_name, demand_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(gameName, contentId, panelType || 'free', downloadLinks || null, instructions || null, coverUrl || null, sizeGb || null, folderName || null, demandType || 'normal');
        console.log('[DB] addEAGame result:', result);
        return result;
    } catch (e) {
        console.error('[DB] addEAGame error:', e.message);
        return null;
    }
}

function updateEAGame(id, data) {
    try {
        console.log('[DB] updateEAGame called with id:', id, 'data:', JSON.stringify(data));
        
        // Handle both object and individual parameters for backward compatibility
        const gameName = typeof data === 'object' ? data.game_name : data;
        const contentId = typeof data === 'object' ? (data.content_id || data.app_id) : arguments[2];
        const panelType = typeof data === 'object' ? data.panel_type : arguments[3];
        const downloadLinks = typeof data === 'object' ? data.download_links : arguments[4];
        const instructions = typeof data === 'object' ? data.instructions : arguments[5];
        const coverUrl = typeof data === 'object' ? data.cover_url : arguments[6];
        const enabled = typeof data === 'object' ? (data.enabled === 'on' || data.enabled === true || data.enabled === 1) : arguments[7];
        const sizeGb = typeof data === 'object' ? data.size_gb : null;
        const folderName = typeof data === 'object' ? data.folder_name : null;
        const demandType = typeof data === 'object' ? data.demand_type : 'normal';
        
        console.log('[DB] updateEAGame parsed:', { gameName, contentId, panelType, downloadLinks: downloadLinks?.substring(0, 50), instructions: instructions?.substring(0, 50), coverUrl, enabled, sizeGb, folderName, demandType });
        
        const stmt = db.prepare(`
            UPDATE ea_games 
            SET game_name = ?, content_id = ?, panel_type = ?, 
                download_links = ?, instructions = ?, cover_url = ?, enabled = ?,
                size_gb = ?, folder_name = ?, demand_type = ?
            WHERE id = ?
        `);
        const result = stmt.run(gameName, contentId, panelType || 'free', downloadLinks || null, instructions || null, coverUrl || null, enabled ? 1 : 0, sizeGb || null, folderName || null, demandType || 'normal', id);
        console.log('[DB] updateEAGame result:', result);
        return result;
    } catch (e) {
        console.error('[DB] updateEAGame error:', e.message);
        return null;
    }
}

function deleteEAGame(id) {
    try {
        return db.prepare('DELETE FROM ea_games WHERE id = ?').run(id);
    } catch (e) {
        console.error('[DB] deleteEAGame error:', e.message);
        return null;
    }
}

function toggleEAGameHighDemand(id) {
    try {
        const game = db.prepare('SELECT demand_type FROM ea_games WHERE id = ?').get(id);
        const newDemand = game?.demand_type === 'high' ? 'normal' : 'high';
        return db.prepare('UPDATE ea_games SET demand_type = ? WHERE id = ?').run(newDemand, id);
    } catch (e) {
        console.error('[DB] toggleEAGameHighDemand error:', e.message);
        return null;
    }
}

function getEAHighDemandGames() {
    try {
        return db.prepare(`
            SELECT g.*, 
                   (SELECT COUNT(*) FROM ea_tokens t 
                    WHERE t.game_id = g.id 
                    AND t.reserved_by_ticket IS NULL 
                    AND (t.last_used_at IS NULL OR datetime(t.last_used_at, '+24 hours') < datetime('now'))) as available_tokens
            FROM ea_games g 
            WHERE g.demand_type = 'high' AND g.enabled = 1
            ORDER BY g.game_name
        `).all();
    } catch (e) {
        console.error('[DB] getEAHighDemandGames error:', e.message);
        return [];
    }
}

function getAvailableEATokenCount(gameId) {
    try {
        const result = db.prepare(`
            SELECT COUNT(*) as count
            FROM ea_tokens t
            JOIN ea_accounts a ON t.account_id = a.id
            JOIN ea_games g ON t.game_id = g.id
            WHERE t.game_id = ?
              AND a.enabled = 1
              AND g.enabled = 1
              AND t.reserved_by_ticket IS NULL
              AND (t.last_used_at IS NULL 
                   OR datetime(t.last_used_at, '+24 hours') < datetime('now'))
        `).get(gameId);
        return result ? result.count : 0;
    } catch (e) {
        return 0;
    }
}

function getTotalEATokenCount(gameId) {
    try {
        const result = db.prepare(`
            SELECT COUNT(*) as count
            FROM ea_tokens t
            JOIN ea_accounts a ON t.account_id = a.id
            WHERE t.game_id = ? AND a.enabled = 1
        `).get(gameId);
        return result ? result.count : 0;
    } catch (e) {
        return 0;
    }
}

function reserveEAToken(gameId, ticketId) {
    try {
        const token = db.prepare(`
            SELECT t.id, a.account_name, a.tcno_id
            FROM ea_tokens t
            JOIN ea_accounts a ON t.account_id = a.id
            JOIN ea_games g ON t.game_id = g.id
            WHERE t.game_id = ?
              AND a.enabled = 1
              AND g.enabled = 1
              AND t.reserved_by_ticket IS NULL
              AND (t.last_used_at IS NULL 
                   OR datetime(t.last_used_at, '+24 hours') < datetime('now'))
            ORDER BY t.last_used_at ASC NULLS FIRST
            LIMIT 1
        `).get(gameId);
        
        if (!token) {
            return { success: false, error: 'No available tokens' };
        }
        
        db.prepare('UPDATE ea_tokens SET reserved_by_ticket = ? WHERE id = ?').run(ticketId, token.id);
        console.log(`[DB] Reserved EA token ${token.id} (${token.account_name}) for ticket ${ticketId}`);
        
        return { success: true, tokenId: token.id, accountName: token.account_name, tcnoId: token.tcno_id };
    } catch (e) {
        console.error('[DB] reserveEAToken error:', e.message);
        return { success: false, error: e.message };
    }
}

function releaseEAToken(ticketId) {
    try {
        const result = db.prepare('UPDATE ea_tokens SET reserved_by_ticket = NULL WHERE reserved_by_ticket = ?').run(ticketId);
        if (result.changes > 0) {
            console.log(`[DB] Released EA token for ticket ${ticketId}`);
        }
        return result.changes > 0;
    } catch (e) {
        console.error('[DB] releaseEAToken error:', e.message);
        return false;
    }
}

function getReservedEAToken(ticketId) {
    try {
        return db.prepare(`
            SELECT t.*, a.account_name, a.tcno_id
            FROM ea_tokens t
            JOIN ea_accounts a ON t.account_id = a.id
            WHERE t.reserved_by_ticket = ?
        `).get(ticketId);
    } catch (e) {
        return null;
    }
}

function getAvailableEAToken(gameId) {
    try {
        return db.prepare(`
            SELECT t.*, a.account_name, a.tcno_id
            FROM ea_tokens t
            JOIN ea_accounts a ON t.account_id = a.id
            JOIN ea_games g ON t.game_id = g.id
            WHERE t.game_id = ?
              AND a.enabled = 1
              AND g.enabled = 1
              AND t.reserved_by_ticket IS NULL
              AND (t.last_used_at IS NULL 
                   OR datetime(t.last_used_at, '+24 hours') < datetime('now'))
            ORDER BY t.last_used_at ASC NULLS FIRST
            LIMIT 1
        `).get(gameId);
    } catch (e) {
        return null;
    }
}

// Get available EA token excluding certain account names (for retry with different account)
function getAvailableEATokenExcluding(gameId, excludeAccountNames = []) {
    try {
        if (!excludeAccountNames || excludeAccountNames.length === 0) {
            return getAvailableEAToken(gameId);
        }
        
        const placeholders = excludeAccountNames.map(() => '?').join(',');
        return db.prepare(`
            SELECT t.*, a.account_name, a.tcno_id
            FROM ea_tokens t
            JOIN ea_accounts a ON t.account_id = a.id
            JOIN ea_games g ON t.game_id = g.id
            WHERE t.game_id = ?
              AND a.enabled = 1
              AND g.enabled = 1
              AND t.reserved_by_ticket IS NULL
              AND a.account_name NOT IN (${placeholders})
              AND (t.last_used_at IS NULL 
                   OR datetime(t.last_used_at, '+24 hours') < datetime('now'))
            ORDER BY t.last_used_at ASC NULLS FIRST
            LIMIT 1
        `).get(gameId, ...excludeAccountNames);
    } catch (e) {
        console.error('[DB] getAvailableEATokenExcluding error:', e.message);
        return null;
    }
}

// Reserve a specific EA token by its ID
function reserveEATokenById(tokenId, ticketId) {
    try {
        const result = db.prepare(`
            UPDATE ea_tokens 
            SET reserved_by_ticket = ?
            WHERE id = ? AND reserved_by_ticket IS NULL
        `).run(ticketId, tokenId);
        
        if (result.changes > 0) {
            console.log(`[DB] Reserved EA token ${tokenId} for ticket ${ticketId}`);
            return true;
        }
        return false;
    } catch (e) {
        console.error('[DB] reserveEATokenById error:', e.message);
        return false;
    }
}

function markEATokenUsed(tokenId, userId, username, ticketId) {
    try {
        // Regenerate after 24 hours
        const regeneratesAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const stmt = db.prepare(`
            UPDATE ea_tokens 
            SET last_used_at = datetime('now'),
                regenerates_at = ?,
                used_by_user_id = ?,
                used_by_username = ?,
                used_in_ticket = ?,
                reserved_by_ticket = NULL
            WHERE id = ?
        `);
        return stmt.run(regeneratesAt, userId, username, ticketId, tokenId);
    } catch (e) {
        console.error('[DB] markEATokenUsed error:', e.message);
        return null;
    }
}

function getAllEATokens() {
    try {
        return db.prepare(`
            SELECT t.*, g.game_name, a.account_name
            FROM ea_tokens t
            LEFT JOIN ea_games g ON t.game_id = g.id
            LEFT JOIN ea_accounts a ON t.account_id = a.id
            ORDER BY g.game_name, a.account_name
        `).all();
    } catch (e) {
        console.error('[DB] getAllEATokens error:', e.message);
        return [];
    }
}

function addEAToken(accountId, gameId) {
    try {
        const stmt = db.prepare(`
            INSERT INTO ea_tokens (account_id, game_id)
            VALUES (?, ?)
        `);
        return stmt.run(accountId, gameId);
    } catch (e) {
        console.error('[DB] addEAToken error:', e.message);
        return null;
    }
}

function addEATokensBulk(accountId, gameId, count) {
    try {
        const stmt = db.prepare(`INSERT INTO ea_tokens (account_id, game_id) VALUES (?, ?)`);
        const insert = db.transaction((n) => {
            for (let i = 0; i < n; i++) {
                stmt.run(accountId, gameId);
            }
        });
        insert(count);
        return { changes: count };
    } catch (e) {
        console.error('[DB] addEATokensBulk error:', e.message);
        return null;
    }
}

function deleteEAToken(id) {
    try {
        return db.prepare('DELETE FROM ea_tokens WHERE id = ?').run(id);
    } catch (e) {
        console.error('[DB] deleteEAToken error:', e.message);
        return null;
    }
}

function resetEAToken(id) {
    try {
        return db.prepare(`
            UPDATE ea_tokens 
            SET reserved_by_ticket = NULL, 
                last_used_at = NULL, 
                used_by_user_id = NULL, 
                used_by_username = NULL,
                used_in_ticket = NULL
            WHERE id = ?
        `).run(id);
    } catch (e) {
        console.error('[DB] resetEAToken error:', e.message);
        return null;
    }
}

function markEATokenUsedManually(id) {
    try {
        return db.prepare(`
            UPDATE ea_tokens 
            SET last_used_at = datetime('now'),
                reserved_by_ticket = NULL,
                used_by_username = 'Manual (Dashboard)'
            WHERE id = ?
        `).run(id);
    } catch (e) {
        console.error('[DB] markEATokenUsedManually error:', e.message);
        return null;
    }
}

// Mark ALL tokens for a specific account+game as used (for daily limit scenarios)
function markEAAccountGameTokensUsed(accountName, gameId) {
    try {
        const result = db.prepare(`
            UPDATE ea_tokens 
            SET last_used_at = datetime('now'),
                used_by_username = 'Daily Limit (Auto)'
            WHERE game_id = ? 
              AND account_id IN (SELECT id FROM ea_accounts WHERE account_name = ?)
              AND (last_used_at IS NULL OR datetime(last_used_at, '+24 hours') < datetime('now'))
        `).run(gameId, accountName);
        console.log(`[DB] Marked ${result.changes} EA tokens as used for account ${accountName}, game ${gameId} (daily limit)`);
        return result;
    } catch (e) {
        console.error('[DB] markEAAccountGameTokensUsed error:', e.message);
        return null;
    }
}

// ============================================================================
// EA ACCOUNTS
// ============================================================================

function getAllEAAccounts() {
    try {
        return db.prepare('SELECT * FROM ea_accounts ORDER BY account_name ASC').all();
    } catch (e) {
        if (e.message.includes('no such table')) {
            // Create table with new format
            db.exec(`
                CREATE TABLE IF NOT EXISTS ea_accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_name TEXT NOT NULL,
                    account_id TEXT,
                    tcno_id TEXT,
                    enabled INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('[DB] Created ea_accounts table');
            return [];
        }
        console.error('[DB] getAllEAAccounts error:', e.message);
        return [];
    }
}

function getEAAccount(accountId) {
    return db.prepare('SELECT * FROM ea_accounts WHERE id = ?').get(accountId);
}

function addEAAccount(accountName, tcnoId = null) {
    try {
        // First check the table structure
        const tableInfo = db.prepare("PRAGMA table_info(ea_accounts)").all();
        const columns = tableInfo.map(c => c.name);
        console.log('[DB] ea_accounts columns:', columns.join(', '));
        
        // Check which column to use for TCNO ID
        if (columns.includes('account_id')) {
            // Old format - uses 'account_id' for TCNO ID
            console.log('[DB] Using account_id column for TCNO ID');
            const stmt = db.prepare(`
                INSERT INTO ea_accounts (account_name, account_id)
                VALUES (?, ?)
            `);
            return stmt.run(accountName, tcnoId || '');
        } else if (columns.includes('tcno_id')) {
            // New format - uses 'tcno_id'
            console.log('[DB] Using tcno_id column');
            const stmt = db.prepare(`
                INSERT INTO ea_accounts (account_name, tcno_id)
                VALUES (?, ?)
            `);
            return stmt.run(accountName, tcnoId);
        } else {
            // Fallback - just account_name
            console.log('[DB] Only account_name column available');
            const stmt = db.prepare(`INSERT INTO ea_accounts (account_name) VALUES (?)`);
            return stmt.run(accountName);
        }
        
    } catch (e) {
        console.error('[DB] addEAAccount error:', e.message);
        
        // If table doesn't exist, create it
        if (e.message.includes('no such table')) {
            try {
                db.exec(`
                    CREATE TABLE IF NOT EXISTS ea_accounts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        account_name TEXT NOT NULL,
                        account_id TEXT,
                        tcno_id TEXT,
                        enabled INTEGER DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                console.log('[DB] Created ea_accounts table');
                const stmt = db.prepare(`INSERT INTO ea_accounts (account_name, account_id) VALUES (?, ?)`);
                return stmt.run(accountName, tcnoId || '');
            } catch (e2) {
                console.error('[DB] addEAAccount create table error:', e2.message);
                return null;
            }
        }
        
        return null;
    }
}

function updateEAAccount(id, accountName, tcnoId, enabled) {
    try {
        const stmt = db.prepare(`
            UPDATE ea_accounts 
            SET account_name = ?, tcno_id = ?, enabled = ?
            WHERE id = ?
        `);
        return stmt.run(accountName, tcnoId, enabled ? 1 : 0, id);
    } catch (e) {
        console.error('[DB] updateEAAccount error:', e.message);
        return null;
    }
}

function deleteEAAccount(id) {
    try {
        return db.prepare('DELETE FROM ea_accounts WHERE id = ?').run(id);
    } catch (e) {
        console.error('[DB] deleteEAAccount error:', e.message);
        return null;
    }
}

// ============================================================================
// EA TICKETS
// ============================================================================

function createEATicket(ticketId, threadId, guildId, userId, username, gameId) {
    try {
        db.prepare(`
            INSERT INTO ea_tickets (ticket_id, thread_id, guild_id, user_id, username, game_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(ticketId, threadId, guildId, userId, username, gameId);
        return true;
    } catch (e) {
        console.error('[DB] createEATicket error:', e.message);
        return false;
    }
}

function getEATicket(ticketId) {
    return db.prepare('SELECT * FROM ea_tickets WHERE ticket_id = ?').get(ticketId);
}

function getEATicketByThread(threadId) {
    return db.prepare('SELECT * FROM ea_tickets WHERE thread_id = ?').get(threadId);
}

function getEAUserOpenTicket(userId, guildId) {
    return db.prepare(`
        SELECT * FROM ea_tickets 
        WHERE user_id = ? AND guild_id = ? AND status = 'open'
    `).get(userId, guildId);
}

function updateEATicketStatus(ticketId, status) {
    return db.prepare('UPDATE ea_tickets SET status = ? WHERE ticket_id = ?').run(status, ticketId);
}

function updateEAVerificationStatus(ticketId, status, result = null) {
    return db.prepare(`
        UPDATE ea_tickets 
        SET verification_status = ?, verification_result = ?
        WHERE ticket_id = ?
    `).run(status, result, ticketId);
}

function closeEATicket(ticketId, reason) {
    return db.prepare(`
        UPDATE ea_tickets 
        SET status = 'closed', closed_at = datetime('now'), closed_reason = ?
        WHERE ticket_id = ?
    `).run(reason, ticketId);
}

function saveEATranscript(ticketId, threadId, userId, username, gameName, transcript) {
    try {
        db.prepare(`
            INSERT INTO ea_transcripts (ticket_id, thread_id, user_id, username, game_name, transcript)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(ticketId, threadId, userId, username, gameName, transcript);
        return true;
    } catch (e) {
        console.error('[DB] saveEATranscript error:', e.message);
        return false;
    }
}

function logEAActivation(guildId, userId, username, gameId, gameName, tokenId, accountName, ticketId) {
    try {
        db.prepare(`
            INSERT INTO ea_activations (token_id, game_id, user_id, username, ticket_id, game_name, activated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(tokenId, gameId, userId, username, ticketId, gameName || null);
        return true;
    } catch (e) {
        console.error('[DB] logEAActivation error:', e.message);
        return false;
    }
}

// ============================================================================
// EA PANEL SETTINGS
// ============================================================================

function getEAPanelSettings(guildId, panelType) {
    return db.prepare(`
        SELECT * FROM ea_panel_settings WHERE guild_id = ? AND panel_type = ?
    `).get(guildId, panelType);
}

function getAllEAPanels() {
    try {
        return db.prepare(`
            SELECT * FROM ea_panel_settings WHERE channel_id IS NOT NULL AND message_id IS NOT NULL
        `).all();
    } catch (e) {
        console.error('[DB] getAllEAPanels error:', e.message);
        return [];
    }
}

function saveEAPanelSettings(guildId, panelType, channelId, messageId, ticketChannelId = null) {
    try {
        db.prepare(`
            INSERT OR REPLACE INTO ea_panel_settings (guild_id, panel_type, channel_id, message_id, ticket_channel_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(guildId, panelType, channelId, messageId, ticketChannelId);
        return true;
    } catch (e) {
        return false;
    }
}

function getEATicketChannel(guildId) {
    const setting = db.prepare(`
        SELECT ticket_channel_id FROM ea_panel_settings WHERE guild_id = ? AND ticket_channel_id IS NOT NULL LIMIT 1
    `).get(guildId);
    return setting?.ticket_channel_id;
}

// ============================================================================
// DASHBOARD USERS
// ============================================================================

function getDashboardUser(username) {
    try {
        return db.prepare('SELECT * FROM dashboard_users WHERE username = ?').get(username);
    } catch (e) {
        console.error('getDashboardUser error:', e.message);
        return null;
    }
}

function getDashboardUserById(id) {
    try {
        return db.prepare('SELECT * FROM dashboard_users WHERE id = ?').get(id);
    } catch (e) {
        return null;
    }
}

function getAllDashboardUsers() {
    try {
        return db.prepare('SELECT id, username, role, last_login, created_at FROM dashboard_users ORDER BY username ASC').all();
    } catch (e) {
        return [];
    }
}

function addDashboardUser(data) {
    try {
        return db.prepare('INSERT INTO dashboard_users (username, password_hash, role) VALUES (?, ?, ?)').run(data.username, data.password_hash, data.role || 'staff');
    } catch (e) {
        console.error('addDashboardUser error:', e.message);
        return null;
    }
}

function createDashboardUser(username, passwordHash, role = 'staff') {
    try {
        return db.prepare('INSERT INTO dashboard_users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, role);
    } catch (e) {
        console.error('createDashboardUser error:', e.message);
        return null;
    }
}

function updateDashboardUser(id, data) {
    try {
        const fields = [];
        const values = [];
        
        if (data.password_hash) { fields.push('password_hash = ?'); values.push(data.password_hash); }
        if (data.role) { fields.push('role = ?'); values.push(data.role); }
        if (data.last_login) { fields.push('last_login = ?'); values.push(data.last_login); }
        
        if (fields.length === 0) return null;
        
        values.push(id);
        return db.prepare(`UPDATE dashboard_users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    } catch (e) {
        console.error('updateDashboardUser error:', e.message);
        return null;
    }
}

function deleteDashboardUser(id) {
    try {
        return db.prepare('DELETE FROM dashboard_users WHERE id = ?').run(id);
    } catch (e) {
        return null;
    }
}

function close() {
    if (db) {
        db.close();
        db = null;
    }
}

// ============================================================================
// EXPORTS - COMPLETE LIST
// ============================================================================

module.exports = {
    initDatabase,
    getDatabase,
    close,
    
    // Games
    getAllGames,
    getGame,
    getGameById,
    getGameBySlug,
    addGame,
    updateGame,
    deleteGame,
    updateGameSize,
    updateGameSizeByName,
    setHighDemand,
    setFreePanel,
    setGameHidden,
    getFreePanelGames,
    getPaidPanelGames,
    getHighDemandGames,
    
    // Tokens
    getAvailableTokenCount,
    getReservedTokenCount,
    getUsedTokenCount,
    getTokenStats,
    getTotalTokenCount,
    getNextAvailableToken,
    getNextRegenerationTime,
    markTokenUsed,
    markTokenAvailable,
    regenerateExpiredTokens,
    regenerateExpiredUbisoftTokens,
    regenerateExpiredEATokens,
    getUpcomingRegens,
    getRegenStats,
    resetAllTokens,
    resetGameTokens,
    getTokensByGame,
    getAllTokens,
    getUsedTokens,
    getTokensFiltered,
    getTokenRegenStats,
    resetToken,
    useToken,
    deleteToken,
    addToken,
    releaseReservedTokens,
    useAllTokens,
    resetFilteredTokens,
    deleteTokensByGameAccount,
    
    // Token Reservation
    reserveToken,
    releaseReservedToken,
    getReservedToken,
    useReservedToken,
    hasReservedToken,
    cancelToken,
    releaseExpiredReservations,
    
    // Tickets
    createTicket,
    getTicket,
    getTicketByThread,
    getUserOpenTicket,
    updateTicketStatus,
    markScreenshotVerified,
    markTokenSent,
    closeTicket,
    closeUserTickets,
    closeAllOpenTickets,
    getUserTickets,
    getOpenTickets,
    updateTicketSteamId,
    
    // Cooldowns
    getUserCooldown,
    getUniversalCooldown,
    getAllCooldowns,
    getAllUserCooldowns,
    setCooldown,
    checkGameCooldown,
    setGameCooldown,
    getUserGameCooldowns,
    removeCooldowns,
    removeAllUserCooldowns,
    removeCooldown,
    clearCooldown,
    clearExpiredCooldowns,
    checkCooldown,
    
    // Transcripts
    saveTranscript,
    getTranscript,
    getTranscripts,
    getUserTranscripts,
    getUbisoftTranscripts,
    getEATranscripts,
    
    // Server Settings
    getServerStaffRoles,
    setServerStaffRoles,
    getServerTicketChannel,
    setServerTicketChannel,
    saveServerPanel,
    getAllServerPanels,
    setServerPanelType,
    getServerTicketLogChannel,
    setServerTicketLogChannel,
    getServerActivationLogChannel,
    setServerActivationLogChannel,
    
    // High Demand Panel
    setHighDemandPanel,
    getHighDemandPanel,
    getAllHighDemandPanels,
    deleteHighDemandPanel,
    
    // Ticket Statistics
    getTicketStats,
    getDailyTicketStats,
    getWeeklyTicketStats,
    
    // Accounts
    getAccount,
    getAccountByNumber,
    getAllAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
    
    // Stats
    getStats,
    
    // Steam Activations - NEW!
    logActivation,
    getUserActivationCount,
    getGameDailyActivationCount,
    getRecentActivations,
    getActivationStats,
    
    // Audit Logs
    logAudit,
    getAuditLogs,
    getAuditLogsCount,
    
    // Ticket Logs
    logTicketEvent,
    getTicketLogs,
    getTicketLogsCount,
    getTicketLogsSummary,
    getTicketLogsGuilds,
    
    // Analytics
    getAnalyticsData,
    getHourlyActivity,
    getGameStats,
    getStaffStats,
    
    // Activations (from ticket_logs)
    getActivations,
    getActivationsCount,
    getUserHistory,
    getUserUbisoftHistory,
    getUserEAHistory,
    getAllUserHistory,
    
    // Staff Activity
    getStaffActivity,
    getStaffActivityByDay,
    getStaffActivityDetails,
    
    // Macros
    getAllMacros,
    getMacroById,
    getMacroByName,
    getMacro,
    getMacroNames,
    createMacro,
    updateMacro,
    deleteMacro,
    
    // Ubisoft Games
    getAllUbisoftGames,
    getUbisoftGame,
    getUbisoftGamesByPanel,
    addUbisoftGame,
    updateUbisoftGame,
    deleteUbisoftGame,
    toggleUbisoftGameHighDemand,
    getUbisoftHighDemandGames,
    
    // Ubisoft Accounts
    getAllUbisoftAccounts,
    getUbisoftAccount,
    addUbisoftAccount,
    updateUbisoftAccount,
    deleteUbisoftAccount,
    
    // Ubisoft Tokens
    getAllUbisoftTokens,
    getUbisoftTokensByGame,
    getUbisoftTokensByAccount,
    addUbisoftToken,
    addUbisoftTokensBulk,
    deleteUbisoftToken,
    resetUbisoftToken,
    markUbisoftTokenUsedManually,
    markUbisoftAccountGameTokensUsed,
    getAvailableUbisoftToken,
    getAvailableUbisoftTokenExcluding,
    reserveUbisoftTokenById,
    getAvailableUbisoftTokenCount,
    reserveUbisoftToken,
    releaseUbisoftToken,
    getReservedUbisoftToken,
    getTotalUbisoftTokenCount,
    markUbisoftTokenUsed,
    markAllUbisoftTokensExhausted,
    
    // Ubisoft Activations
    logUbisoftActivation,
    getUbisoftActivations,
    getUbisoftActivationsCount,
    
    // Ubisoft Server Settings
    getUbisoftServerSettings,
    setUbisoftServerSettings,
    
    // Ubisoft Tickets
    createUbisoftTicket,
    getUbisoftTicket,
    getUbisoftTicketByThread,
    getUserOpenUbisoftTicket,
    getOpenUbisoftTickets,
    updateUbisoftTicketStatus,
    closeUbisoftTicket,
    getUbisoftUserOpenTicket,
    saveUbisoftTranscript,
    setUbisoftTicketChannel,
    getUbisoftTicketChannel,
    getAllUbisoftPanels,
    saveUbisoftPanel,
    getUbisoftTicketChannel,
    setUbisoftTicketChannel,
    
    // EA Games
    getAllEAGames,
    getEAGame,
    getEAGamesByPanel,
    addEAGame,
    updateEAGame,
    deleteEAGame,
    toggleEAGameHighDemand,
    getEAHighDemandGames,
    
    // EA Tokens
    getAvailableEATokenCount,
    getTotalEATokenCount,
    reserveEAToken,
    releaseEAToken,
    getReservedEAToken,
    getAvailableEAToken,
    getAvailableEATokenExcluding,
    reserveEATokenById,
    markEATokenUsed,
    getAllEATokens,
    addEAToken,
    addEATokensBulk,
    deleteEAToken,
    resetEAToken,
    markEATokenUsedManually,
    markEAAccountGameTokensUsed,
    
    // EA Accounts
    getAllEAAccounts,
    getEAAccount,
    addEAAccount,
    updateEAAccount,
    deleteEAAccount,
    
    // EA Tickets
    createEATicket,
    getEATicket,
    getEATicketByThread,
    getEAUserOpenTicket,
    updateEATicketStatus,
    updateEAVerificationStatus,
    closeEATicket,
    saveEATranscript,
    logEAActivation,
    
    // EA Panel Settings
    getEAPanelSettings,
    getAllEAPanels,
    saveEAPanelSettings,
    getEATicketChannel,
    
    // Dashboard Users
    getDashboardUser,
    getDashboardUserById,
    getAllDashboardUsers,
    addDashboardUser,
    createDashboardUser,
    updateDashboardUser,
    deleteDashboardUser
};
