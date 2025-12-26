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
    `);
    
    // Migration: Add regenerates_at to ea_tokens for 24-hour regeneration
    try {
        db.exec(`ALTER TABLE ea_tokens ADD COLUMN regenerates_at DATETIME`);
        console.log('✅ Added regenerates_at column to ea_tokens');
    } catch (e) { /* Column already exists */ }
    
    console.log('✅ Database initialized with all tables');
    return db;
}

// ============================================================================
// GAMES
// ============================================================================

function getAllGames() {
    const stmt = db.prepare('SELECT * FROM games ORDER BY game_name ASC');
    return stmt.all();
}

function getGame(gameId) {
    if (typeof gameId === 'number' || /^\d+$/.test(gameId)) {
        const stmt = db.prepare('SELECT * FROM games WHERE id = ?');
        return stmt.get(parseInt(gameId));
    } else {
        const stmt = db.prepare('SELECT * FROM games WHERE game_id = ?');
        return stmt.get(gameId);
    }
}

function getGameById(id) {
    const stmt = db.prepare('SELECT * FROM games WHERE id = ?');
    return stmt.get(id);
}

function getGameBySlug(gameId) {
    const stmt = db.prepare('SELECT * FROM games WHERE game_id = ?');
    return stmt.get(gameId);
}

function addGame(gameId, gameName, sizeGb = 0, demandType = 'normal', coverUrl = null) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO games (game_id, game_name, size_gb, demand_type, cover_url)
        VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(gameId, gameName, sizeGb, demandType, coverUrl);
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
    const stmt = db.prepare('SELECT * FROM games WHERE free_panel = 1 AND (hidden = 0 OR hidden IS NULL) ORDER BY game_name ASC');
    return stmt.all();
}

function getPaidPanelGames() {
    const stmt = db.prepare('SELECT * FROM games WHERE (hidden = 0 OR hidden IS NULL) ORDER BY game_name ASC');
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
        const stmt = db.prepare("SELECT * FROM games WHERE demand_type = 'high' ORDER BY game_name ASC");
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

function addAccount(accountName, email, password, accountNumber = null) {
    try {
        const stmt = db.prepare(`
            INSERT INTO accounts (account_name, email, password, account_number)
            VALUES (?, ?, ?, ?)
        `);
        return stmt.run(accountName, email, password, accountNumber);
    } catch (e) {
        console.error('[DB] addAccount error:', e.message);
        return null;
    }
}

function updateAccount(id, accountName, email, password, enabled, accountNumber = null) {
    try {
        if (password) {
            const stmt = db.prepare(`
                UPDATE accounts 
                SET account_name = ?, email = ?, password = ?, enabled = ?, account_number = ?
                WHERE id = ?
            `);
            return stmt.run(accountName, email, password, enabled ? 1 : 0, accountNumber, id);
        } else {
            const stmt = db.prepare(`
                UPDATE accounts 
                SET account_name = ?, email = ?, enabled = ?, account_number = ?
                WHERE id = ?
            `);
            return stmt.run(accountName, email, enabled ? 1 : 0, accountNumber, id);
        }
    } catch (e) {
        console.error('[DB] updateAccount error:', e.message);
        return null;
    }
}

function deleteAccount(id) {
    try {
        return db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    } catch (e) {
        console.error('[DB] deleteAccount error:', e.message);
        return null;
    }
}

function updateGame(id, gameName, appId, folderName, sizeGb, panelType, demandType, downloadLinks, instructions, coverUrl, hidden = 0) {
    try {
        const stmt = db.prepare(`
            UPDATE games 
            SET game_name = ?, game_id = ?, folder_name = ?, size_gb = ?, 
                panel_type = ?, demand_type = ?, instructions = ?, cover_url = ?, hidden = ?
            WHERE id = ?
        `);
        return stmt.run(gameName, appId, folderName, sizeGb, panelType, demandType, instructions, coverUrl, hidden ? 1 : 0, id);
    } catch (e) {
        console.error('[DB] updateGame error:', e.message);
        return null;
    }
}

function deleteGame(id) {
    try {
        return db.prepare('DELETE FROM games WHERE id = ?').run(id);
    } catch (e) {
        console.error('[DB] deleteGame error:', e.message);
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
            cat = actionOrData.category;
            tType = actionOrData.targetType || actionOrData.target_type;
            tId = actionOrData.targetId || actionOrData.target_id;
            tName = actionOrData.targetName || actionOrData.target_name;
            det = actionOrData.details;
            uId = actionOrData.userId || actionOrData.user_id;
            uName = actionOrData.username;
            ip = actionOrData.ipAddress || actionOrData.ip_address || null;
        } else {
            action = actionOrData;
            cat = category;
            tType = targetType;
            tId = targetId;
            tName = targetName;
            det = details;
            uId = userId;
            uName = username;
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
            SELECT tl.*, g.game_name as game_name_lookup
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

function addUbisoftGame(gameName, uplayAppId, steamAppId, panelType, downloadLinks, instructions, coverUrl) {
    try {
        const stmt = db.prepare(`
            INSERT INTO ubisoft_games (game_name, uplay_app_id, steam_app_id, panel_type, download_links, instructions, cover_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(gameName, uplayAppId, steamAppId, panelType, downloadLinks, instructions, coverUrl);
    } catch (e) {
        console.error('[DB] addUbisoftGame error:', e.message);
        return null;
    }
}

function updateUbisoftGame(id, gameName, uplayAppId, steamAppId, panelType, downloadLinks, instructions, coverUrl, enabled) {
    try {
        const stmt = db.prepare(`
            UPDATE ubisoft_games 
            SET game_name = ?, uplay_app_id = ?, steam_app_id = ?, panel_type = ?, 
                download_links = ?, instructions = ?, cover_url = ?, enabled = ?
            WHERE id = ?
        `);
        return stmt.run(gameName, uplayAppId, steamAppId, panelType, downloadLinks, instructions, coverUrl, enabled, id);
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

function regenerateExpiredUbisoftTokens() {
    try {
        const now = new Date().toISOString();
        const stmt = db.prepare(`
            UPDATE ubisoft_tokens 
            SET last_used_at = NULL, regenerates_at = NULL, used_by_user_id = NULL, 
                used_by_username = NULL, used_in_ticket = NULL, reserved_by_ticket = NULL
            WHERE last_used_at IS NOT NULL AND regenerates_at IS NOT NULL AND regenerates_at <= ?
        `);
        const result = stmt.run(now);
        if (result.changes > 0) {
            console.log(`[DB] Regenerated ${result.changes} Ubisoft tokens`);
        }
        return result.changes;
    } catch (e) {
        console.error('[DB] regenerateExpiredUbisoftTokens error:', e.message);
        return 0;
    }
}

function getUpcomingUbisoftRegens(gameId = null, limit = 10) {
    try {
        const now = new Date().toISOString();
        let sql = `
            SELECT t.*, g.game_name, a.account_name
            FROM ubisoft_tokens t
            LEFT JOIN ubisoft_games g ON t.game_id = g.id
            LEFT JOIN ubisoft_accounts a ON t.account_id = a.id
            WHERE t.last_used_at IS NOT NULL AND t.regenerates_at IS NOT NULL AND t.regenerates_at > ?
        `;
        const params = [now];
        if (gameId) {
            sql += ` AND t.game_id = ?`;
            params.push(gameId);
        }
        sql += ` ORDER BY t.regenerates_at ASC LIMIT ?`;
        params.push(limit);
        return db.prepare(sql).all(...params);
    } catch (e) {
        console.error('[DB] getUpcomingUbisoftRegens error:', e.message);
        return [];
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

function addEAGame(gameName, contentId, panelType, downloadLinks, instructions, coverUrl) {
    try {
        const stmt = db.prepare(`
            INSERT INTO ea_games (game_name, content_id, panel_type, download_links, instructions, cover_url)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(gameName, contentId, panelType || 'free', downloadLinks, instructions, coverUrl);
    } catch (e) {
        console.error('[DB] addEAGame error:', e.message);
        return null;
    }
}

function updateEAGame(id, gameName, contentId, panelType, downloadLinks, instructions, coverUrl, enabled) {
    try {
        const stmt = db.prepare(`
            UPDATE ea_games 
            SET game_name = ?, content_id = ?, panel_type = ?, 
                download_links = ?, instructions = ?, cover_url = ?, enabled = ?
            WHERE id = ?
        `);
        return stmt.run(gameName, contentId, panelType || 'free', downloadLinks, instructions, coverUrl, enabled ? 1 : 0, id);
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

function regenerateExpiredEATokens() {
    try {
        const now = new Date().toISOString();
        const stmt = db.prepare(`
            UPDATE ea_tokens 
            SET last_used_at = NULL, regenerates_at = NULL, used_by_user_id = NULL, 
                used_by_username = NULL, used_in_ticket = NULL, reserved_by_ticket = NULL
            WHERE last_used_at IS NOT NULL AND regenerates_at IS NOT NULL AND regenerates_at <= ?
        `);
        const result = stmt.run(now);
        if (result.changes > 0) {
            console.log(`[DB] Regenerated ${result.changes} EA tokens`);
        }
        return result.changes;
    } catch (e) {
        console.error('[DB] regenerateExpiredEATokens error:', e.message);
        return 0;
    }
}

function getUpcomingEARegens(gameId = null, limit = 10) {
    try {
        const now = new Date().toISOString();
        let sql = `
            SELECT t.*, g.game_name, a.account_name
            FROM ea_tokens t
            LEFT JOIN ea_games g ON t.game_id = g.id
            LEFT JOIN ea_accounts a ON t.account_id = a.id
            WHERE t.last_used_at IS NOT NULL AND t.regenerates_at IS NOT NULL AND t.regenerates_at > ?
        `;
        const params = [now];
        if (gameId) {
            sql += ` AND t.game_id = ?`;
            params.push(gameId);
        }
        sql += ` ORDER BY t.regenerates_at ASC LIMIT ?`;
        params.push(limit);
        return db.prepare(sql).all(...params);
    } catch (e) {
        console.error('[DB] getUpcomingEARegens error:', e.message);
        return [];
    }
}

// ============================================================================
// EA ACCOUNTS
// ============================================================================

function getAllEAAccounts() {
    try {
        return db.prepare('SELECT * FROM ea_accounts ORDER BY account_name ASC').all();
    } catch (e) {
        console.error('[DB] getAllEAAccounts error:', e.message);
        return [];
    }
}

function getEAAccount(accountId) {
    try {
        return db.prepare('SELECT * FROM ea_accounts WHERE id = ?').get(accountId);
    } catch (e) {
        return null;
    }
}

function addEAAccount(accountName, tcnoId = null) {
    try {
        const stmt = db.prepare(`
            INSERT INTO ea_accounts (account_name, tcno_id)
            VALUES (?, ?)
        `);
        return stmt.run(accountName, tcnoId);
    } catch (e) {
        console.error('[DB] addEAAccount error:', e.message);
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
// EA TOKENS - Additional functions
// ============================================================================

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
        const stmt = db.prepare(`
            INSERT INTO ea_tokens (account_id, game_id)
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
        console.error('[DB] addEATokensBulk error:', e.message);
        return { changes: 0 };
    }
}

function deleteEAToken(id) {
    try {
        return db.prepare('DELETE FROM ea_tokens WHERE id = ?').run(id);
    } catch (e) {
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
            ORDER BY t.id DESC
        `).all();
    } catch (e) {
        console.error('[DB] getAllEATokens error:', e.message);
        return [];
    }
}

function getAvailableEATokenCount(gameId) {
    try {
        const result = db.prepare(`
            SELECT COUNT(*) as count FROM ea_tokens 
            WHERE game_id = ? AND reserved_by_ticket IS NULL AND last_used_at IS NULL
        `).get(gameId);
        return result?.count || 0;
    } catch (e) {
        return 0;
    }
}

function getTotalEATokenCount(gameId) {
    try {
        const result = db.prepare('SELECT COUNT(*) as count FROM ea_tokens WHERE game_id = ?').get(gameId);
        return result?.count || 0;
    } catch (e) {
        return 0;
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
            INSERT INTO ea_activations (token_id, game_id, user_id, username, ticket_id, activated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(tokenId, gameId, userId, username, ticketId);
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
    getUpcomingRegens,
    getRegenStats,
    resetAllTokens,
    resetGameTokens,
    getTokensByGame,
    getUsedTokens,
    
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
    getAllUserCooldowns,
    setCooldown,
    removeCooldowns,
    removeAllUserCooldowns,
    removeCooldown,
    clearExpiredCooldowns,
    checkCooldown,
    
    // Transcripts
    saveTranscript,
    getTranscript,
    getUserTranscripts,
    
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
    
    // Game CRUD
    updateGame,
    deleteGame,
    
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
    getAvailableUbisoftToken,
    getAvailableUbisoftTokenCount,
    reserveUbisoftToken,
    releaseUbisoftToken,
    getReservedUbisoftToken,
    getTotalUbisoftTokenCount,
    markUbisoftTokenUsed,
    markAllUbisoftTokensExhausted,
    regenerateExpiredUbisoftTokens,
    getUpcomingUbisoftRegens,
    
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
    
    // EA Accounts
    getAllEAAccounts,
    getEAAccount,
    addEAAccount,
    updateEAAccount,
    deleteEAAccount,
    
    // EA Tokens
    getAllEATokens,
    getAvailableEATokenCount,
    getTotalEATokenCount,
    reserveEAToken,
    releaseEAToken,
    getReservedEAToken,
    getAvailableEAToken,
    markEATokenUsed,
    addEAToken,
    addEATokensBulk,
    deleteEAToken,
    regenerateExpiredEATokens,
    getUpcomingEARegens,
    
    // EA Tickets
    createEATicket,
    getEATicket,
    getEAUserOpenTicket,
    updateEATicketStatus,
    updateEAVerificationStatus,
    closeEATicket,
    saveEATranscript,
    logEAActivation,
    
    // EA Panel Settings
    getEAPanelSettings,
    saveEAPanelSettings,
    getEATicketChannel
};
