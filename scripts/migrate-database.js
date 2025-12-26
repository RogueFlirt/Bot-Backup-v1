// ============================================================================
// BARTENDER BOT - DATABASE MIGRATION & CLEANUP SCRIPT
// Run this ONCE before deploying the fixes
// ============================================================================

const Database = require('better-sqlite3');
const path = require('path');
const zlib = require('zlib');
const fs = require('fs');

// Configuration
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'bartender.db');
const BACKUP_PATH = path.join(__dirname, '..', 'database', `bartender_backup_${Date.now()}.db`);

console.log('============================================================');
console.log('BARTENDER BOT - DATABASE MIGRATION SCRIPT');
console.log('============================================================');
console.log(`Database: ${DB_PATH}`);
console.log(`Backup: ${BACKUP_PATH}`);
console.log('');

// Check if database exists
if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Database not found at:', DB_PATH);
    process.exit(1);
}

// Create backup
console.log('📦 Creating backup...');
fs.copyFileSync(DB_PATH, BACKUP_PATH);
console.log('✅ Backup created:', BACKUP_PATH);
console.log('');

// Open database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Stats tracking
const stats = {
    expiredCooldowns: 0,
    stepChanges: 0,
    oldLogs: 0,
    compressedTranscripts: 0,
    newTables: 0,
    newIndexes: 0,
    sizeBefore: 0,
    sizeAfter: 0
};

// Get initial size
stats.sizeBefore = fs.statSync(DB_PATH).size;
console.log(`📊 Initial database size: ${(stats.sizeBefore / 1024 / 1024).toFixed(2)} MB`);
console.log('');

// ============================================================================
// STEP 1: ADD NEW TABLES
// ============================================================================

console.log('📝 Step 1: Creating new tables...');

try {
    // User notes table
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            username TEXT,
            note TEXT NOT NULL,
            added_by TEXT,
            added_by_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✅ user_notes table');
    stats.newTables++;
} catch (e) {
    console.log('  ⚠️ user_notes table already exists or error:', e.message);
}

try {
    // Manual generations log
    db.exec(`
        CREATE TABLE IF NOT EXISTS manual_generations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            game_id TEXT,
            game_name TEXT,
            user_id TEXT,
            username TEXT,
            staff_id TEXT,
            staff_name TEXT,
            token_id INTEGER,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✅ manual_generations table');
    stats.newTables++;
} catch (e) {
    console.log('  ⚠️ manual_generations table already exists or error:', e.message);
}

try {
    // System metrics table
    db.exec(`
        CREATE TABLE IF NOT EXISTS system_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metric_name TEXT NOT NULL,
            metric_value REAL,
            metric_data TEXT,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✅ system_metrics table');
    stats.newTables++;
} catch (e) {
    console.log('  ⚠️ system_metrics table already exists or error:', e.message);
}

console.log('');

// ============================================================================
// STEP 2: ADD MISSING COLUMNS
// ============================================================================

console.log('📝 Step 2: Adding missing columns...');

const columnsToAdd = [
    { table: 'transcripts', column: 'is_compressed', type: 'INTEGER DEFAULT 0' },
    { table: 'transcripts', column: 'compressed_data', type: 'BLOB' },
    { table: 'transcripts', column: 'platform', type: "TEXT DEFAULT 'steam'" },
    { table: 'ea_transcripts', column: 'is_compressed', type: 'INTEGER DEFAULT 0' },
    { table: 'ea_transcripts', column: 'compressed_data', type: 'BLOB' },
    { table: 'ubisoft_transcripts', column: 'is_compressed', type: 'INTEGER DEFAULT 0' },
    { table: 'ubisoft_transcripts', column: 'compressed_data', type: 'BLOB' },
    { table: 'cooldowns', column: 'game_name', type: 'TEXT' },
    { table: 'tickets', column: 'platform', type: "TEXT DEFAULT 'steam'" },
    { table: 'ticket_logs', column: 'platform', type: "TEXT DEFAULT 'steam'" }
];

for (const col of columnsToAdd) {
    try {
        db.exec(`ALTER TABLE ${col.table} ADD COLUMN ${col.column} ${col.type}`);
        console.log(`  ✅ Added ${col.table}.${col.column}`);
    } catch (e) {
        // Column likely already exists
        console.log(`  ⚠️ ${col.table}.${col.column} already exists`);
    }
}

console.log('');

// ============================================================================
// STEP 3: CREATE INDEXES
// ============================================================================

console.log('📝 Step 3: Creating indexes...');

const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_ticket_logs_user ON ticket_logs(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ticket_logs_event ON ticket_logs(event_type)',
    'CREATE INDEX IF NOT EXISTS idx_ticket_logs_platform ON ticket_logs(platform)',
    'CREATE INDEX IF NOT EXISTS idx_ticket_logs_created ON ticket_logs(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_ticket_logs_staff ON ticket_logs(staff_id)',
    'CREATE INDEX IF NOT EXISTS idx_cooldowns_user_guild ON cooldowns(user_id, guild_id)',
    'CREATE INDEX IF NOT EXISTS idx_cooldowns_expires ON cooldowns(expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_cooldowns_type ON cooldowns(cooldown_type)',
    'CREATE INDEX IF NOT EXISTS idx_transcripts_ticket ON transcripts(ticket_id)',
    'CREATE INDEX IF NOT EXISTS idx_transcripts_user ON transcripts(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category)',
    'CREATE INDEX IF NOT EXISTS idx_ea_tickets_user ON ea_tickets(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ea_tickets_status ON ea_tickets(status)',
    'CREATE INDEX IF NOT EXISTS idx_ubisoft_tickets_user ON ubisoft_tickets(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ubisoft_tickets_status ON ubisoft_tickets(status)',
    'CREATE INDEX IF NOT EXISTS idx_user_notes_user ON user_notes(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_manual_generations_staff ON manual_generations(staff_id)'
];

for (const idx of indexes) {
    try {
        db.exec(idx);
        stats.newIndexes++;
    } catch (e) {}
}
console.log(`  ✅ Created/verified ${stats.newIndexes} indexes`);
console.log('');

// ============================================================================
// STEP 4: CLEANUP EXPIRED COOLDOWNS
// ============================================================================

console.log('📝 Step 4: Cleaning up expired cooldowns...');

try {
    const now = new Date().toISOString();
    const result = db.prepare('DELETE FROM cooldowns WHERE expires_at < ?').run(now);
    stats.expiredCooldowns = result.changes;
    console.log(`  ✅ Deleted ${stats.expiredCooldowns} expired cooldowns`);
} catch (e) {
    console.log('  ❌ Error:', e.message);
}

console.log('');

// ============================================================================
// STEP 5: CLEANUP OLD STEP_CHANGE EVENTS (7 days)
// ============================================================================

console.log('📝 Step 5: Cleaning up old step_change events (7+ days)...');

try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare(`
        DELETE FROM ticket_logs WHERE event_type = 'step_change' AND created_at < ?
    `).run(cutoff);
    stats.stepChanges = result.changes;
    console.log(`  ✅ Deleted ${stats.stepChanges} old step_change events`);
} catch (e) {
    console.log('  ❌ Error:', e.message);
}

console.log('');

// ============================================================================
// STEP 6: CLEANUP OLD TICKET LOGS (90 days, non-essential)
// ============================================================================

console.log('📝 Step 6: Cleaning up old ticket logs (90+ days, non-essential)...');

try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare(`
        DELETE FROM ticket_logs 
        WHERE created_at < ? 
        AND event_type NOT IN ('completed', 'opened', 'ghosted', 'timeout', 'closed')
    `).run(cutoff);
    stats.oldLogs = result.changes;
    console.log(`  ✅ Deleted ${stats.oldLogs} old log entries`);
} catch (e) {
    console.log('  ❌ Error:', e.message);
}

console.log('');

// ============================================================================
// STEP 7: COMPRESS OLD TRANSCRIPTS (30+ days)
// ============================================================================

console.log('📝 Step 7: Compressing old transcripts (30+ days)...');

try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // Get transcripts to compress
    const transcripts = db.prepare(`
        SELECT id, messages_json FROM transcripts 
        WHERE created_at < ? AND (is_compressed = 0 OR is_compressed IS NULL) AND messages_json IS NOT NULL
    `).all(cutoff);
    
    console.log(`  📊 Found ${transcripts.length} transcripts to compress`);
    
    const updateStmt = db.prepare(`
        UPDATE transcripts SET compressed_data = ?, is_compressed = 1, messages_json = NULL WHERE id = ?
    `);
    
    let compressed = 0;
    let errors = 0;
    
    for (const t of transcripts) {
        try {
            const compressedData = zlib.gzipSync(t.messages_json);
            updateStmt.run(compressedData, t.id);
            compressed++;
            
            if (compressed % 1000 === 0) {
                console.log(`    Compressed ${compressed}/${transcripts.length}...`);
            }
        } catch (e) {
            errors++;
        }
    }
    
    stats.compressedTranscripts = compressed;
    console.log(`  ✅ Compressed ${compressed} transcripts (${errors} errors)`);
    
    // Also compress EA transcripts
    try {
        const eaTranscripts = db.prepare(`
            SELECT id, messages_json FROM ea_transcripts 
            WHERE created_at < ? AND (is_compressed = 0 OR is_compressed IS NULL) AND messages_json IS NOT NULL
        `).all(cutoff);
        
        const eaUpdateStmt = db.prepare(`
            UPDATE ea_transcripts SET compressed_data = ?, is_compressed = 1, messages_json = NULL WHERE id = ?
        `);
        
        for (const t of eaTranscripts) {
            try {
                const compressedData = zlib.gzipSync(t.messages_json);
                eaUpdateStmt.run(compressedData, t.id);
                stats.compressedTranscripts++;
            } catch (e) {}
        }
        console.log(`  ✅ Compressed ${eaTranscripts.length} EA transcripts`);
    } catch (e) {}
    
    // Also compress Ubisoft transcripts
    try {
        const ubiTranscripts = db.prepare(`
            SELECT id, messages_json FROM ubisoft_transcripts 
            WHERE created_at < ? AND (is_compressed = 0 OR is_compressed IS NULL) AND messages_json IS NOT NULL
        `).all(cutoff);
        
        const ubiUpdateStmt = db.prepare(`
            UPDATE ubisoft_transcripts SET compressed_data = ?, is_compressed = 1, messages_json = NULL WHERE id = ?
        `);
        
        for (const t of ubiTranscripts) {
            try {
                const compressedData = zlib.gzipSync(t.messages_json);
                ubiUpdateStmt.run(compressedData, t.id);
                stats.compressedTranscripts++;
            } catch (e) {}
        }
        console.log(`  ✅ Compressed ${ubiTranscripts.length} Ubisoft transcripts`);
    } catch (e) {}
    
} catch (e) {
    console.log('  ❌ Error:', e.message);
}

console.log('');

// ============================================================================
// STEP 8: VACUUM DATABASE
// ============================================================================

console.log('📝 Step 8: Vacuuming database (this may take a while)...');

try {
    db.exec('VACUUM');
    console.log('  ✅ Database vacuumed');
} catch (e) {
    console.log('  ❌ Error:', e.message);
}

console.log('');

// ============================================================================
// STEP 9: ANALYZE
// ============================================================================

console.log('📝 Step 9: Analyzing database...');

try {
    db.exec('ANALYZE');
    console.log('  ✅ Database analyzed');
} catch (e) {
    console.log('  ❌ Error:', e.message);
}

// Close database
db.close();

// Get final size
stats.sizeAfter = fs.statSync(DB_PATH).size;

// ============================================================================
// SUMMARY
// ============================================================================

console.log('');
console.log('============================================================');
console.log('MIGRATION COMPLETE - SUMMARY');
console.log('============================================================');
console.log(`New tables created: ${stats.newTables}`);
console.log(`New indexes created: ${stats.newIndexes}`);
console.log(`Expired cooldowns cleaned: ${stats.expiredCooldowns}`);
console.log(`Old step_change events removed: ${stats.stepChanges}`);
console.log(`Old log entries removed: ${stats.oldLogs}`);
console.log(`Transcripts compressed: ${stats.compressedTranscripts}`);
console.log('');
console.log(`Size before: ${(stats.sizeBefore / 1024 / 1024).toFixed(2)} MB`);
console.log(`Size after: ${(stats.sizeAfter / 1024 / 1024).toFixed(2)} MB`);
console.log(`Space saved: ${((stats.sizeBefore - stats.sizeAfter) / 1024 / 1024).toFixed(2)} MB`);
console.log('');
console.log(`Backup saved at: ${BACKUP_PATH}`);
console.log('');
console.log('✅ Migration completed successfully!');
console.log('');
