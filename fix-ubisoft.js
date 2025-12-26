const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'bartender.db');
const db = new Database(dbPath);

console.log('📂 Using database:', dbPath);
console.log('');

// Check all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('📋 All tables:', tables.map(t => t.name).join(', '));
console.log('');

// Check if ubisoft_games exists
const hasUbisoftGames = tables.some(t => t.name === 'ubisoft_games');

if (!hasUbisoftGames) {
    console.log('❌ ubisoft_games table does not exist!');
    console.log('   You need to create it first via the dashboard or manually.');
} else {
    console.log('✅ ubisoft_games table found!\n');
    
    // Check columns
    const columns = db.prepare("PRAGMA table_info(ubisoft_games)").all();
    console.log('📋 Columns:', columns.map(c => c.name).join(', '));
    
    // Check if token_format exists
    const hasTokenFormat = columns.some(c => c.name === 'token_format');
    
    if (!hasTokenFormat) {
        console.log('\n⚠️  token_format column missing - adding it now...');
        db.exec("ALTER TABLE ubisoft_games ADD COLUMN token_format TEXT DEFAULT 'legacy'");
        console.log('✅ Added token_format column');
    } else {
        console.log('✅ token_format column exists');
    }
    
    // Show all games
    const games = db.prepare("SELECT id, game_name, token_format FROM ubisoft_games").all();
    console.log(`\n📋 Ubisoft games (${games.length}):`);
    games.forEach(g => {
        const format = g.token_format || 'legacy';
        const emoji = format === 'normal' ? '1️⃣' : '2️⃣';
        console.log(`   ${emoji} [${g.id}] ${g.game_name} → ${format}`);
    });
    
    // Update Shadows to normal format
    const result = db.prepare("UPDATE ubisoft_games SET token_format = 'normal' WHERE game_name LIKE '%Shadows%'").run();
    if (result.changes > 0) {
        console.log(`\n✅ Updated ${result.changes} game(s) to use NORMAL format (option 1)`);
        
        // Show updated list
        const updated = db.prepare("SELECT id, game_name, token_format FROM ubisoft_games").all();
        console.log('\n📋 Updated game list:');
        updated.forEach(g => {
            const format = g.token_format || 'legacy';
            const emoji = format === 'normal' ? '1️⃣' : '2️⃣';
            console.log(`   ${emoji} [${g.id}] ${g.game_name} → ${format}`);
        });
    } else {
        console.log('\n⚠️  No games matching "Shadows" found to update');
    }
}

db.close();
console.log('\n🎉 Done! Restart bot with: pm2 restart ubisoft-bot --update-env');