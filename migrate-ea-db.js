// EA Database Migration Script
// Run with: node migrate-ea-db.js
// This safely adds required columns/tables for the EA Token Service

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'bartender.db');

console.log('========================================');
console.log('EA Token Service - Database Migration');
console.log('========================================');
console.log(`Database: ${DB_PATH}`);
console.log('');

try {
    const db = new Database(DB_PATH);
    
    // Helper to safely add column
    function addColumnIfNotExists(table, column, type) {
        try {
            // Check if column exists
            const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all();
            const columnExists = tableInfo.some(col => col.name === column);
            
            if (!columnExists) {
                db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
                console.log(`✅ Added column: ${table}.${column}`);
            } else {
                console.log(`⏭️  Column exists: ${table}.${column}`);
            }
        } catch (e) {
            console.log(`⚠️  Error with ${table}.${column}: ${e.message}`);
        }
    }
    
    // Check if ea_accounts table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const hasEAAccounts = tables.some(t => t.name === 'ea_accounts');
    
    if (!hasEAAccounts) {
        console.log('❌ ea_accounts table not found!');
        console.log('   Make sure you have the base EA tables set up first.');
        process.exit(1);
    }
    
    console.log('Adding columns to ea_accounts...');
    addColumnIfNotExists('ea_accounts', 'access_token', 'TEXT');
    addColumnIfNotExists('ea_accounts', 'token_expires_at', 'DATETIME');
    addColumnIfNotExists('ea_accounts', 'games_owned', 'TEXT');
    
    console.log('');
    console.log('Creating ea_generations table...');
    
    db.exec(`
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
        )
    `);
    console.log('✅ ea_generations table ready');
    
    console.log('');
    console.log('Creating indexes...');
    
    try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_ea_generations_account ON ea_generations(account_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_ea_generations_time ON ea_generations(generated_at)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_ea_generations_expires ON ea_generations(expires_at)');
        console.log('✅ Indexes created');
    } catch (e) {
        console.log('⏭️  Indexes already exist');
    }
    
    console.log('');
    console.log('Verifying ea_accounts...');
    const accounts = db.prepare('SELECT id, account_name, access_token, enabled FROM ea_accounts').all();
    console.log(`Found ${accounts.length} EA account(s):`);
    accounts.forEach(acc => {
        const tokenStatus = acc.access_token ? '🟢 Has token' : '⚫ No token';
        const enabledStatus = acc.enabled ? 'enabled' : 'disabled';
        console.log(`  - ${acc.account_name} (ID: ${acc.id}) - ${tokenStatus} - ${enabledStatus}`);
    });
    
    console.log('');
    console.log('========================================');
    console.log('✅ Migration complete!');
    console.log('========================================');
    console.log('');
    console.log('Next steps:');
    console.log('1. Copy the EA folder files to your bot');
    console.log('2. Install xml2js: npm install xml2js');
    console.log('3. Add the code changes to index.js');
    console.log('4. Get access tokens using /ea-updatetoken');
    console.log('');
    
    db.close();
    
} catch (error) {
    console.error('');
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
}
