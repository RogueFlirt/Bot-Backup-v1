const Database = require('better-sqlite3');
const db = new Database('./bartender.db');

console.log('Updating database...\n');

// Step 1: Add token_format column (ignore error if already exists)
try {
    db.exec("ALTER TABLE ubisoft_games ADD COLUMN token_format TEXT DEFAULT 'legacy'");
    console.log('✅ Added token_format column');
} catch (e) {
    if (e.message.includes('duplicate column')) {
        console.log('ℹ️  token_format column already exists');
    } else {
        console.log('⚠️  Error adding column:', e.message);
    }
}

// Step 2: Set Assassin's Creed Shadows to normal format
const result = db.prepare("UPDATE ubisoft_games SET token_format = 'normal' WHERE game_name LIKE '%Shadows%'").run();
console.log(`✅ Updated ${result.changes} game(s) to normal format`);

// Step 3: Show all games and their format
console.log('\n📋 Current games and formats:');
const games = db.prepare("SELECT game_name, token_format FROM ubisoft_games").all();
games.forEach(g => {
    console.log(`   ${g.token_format === 'normal' ? '1️⃣' : '2️⃣'} ${g.game_name} → ${g.token_format || 'legacy'}`);
});

db.close();
console.log('\n✅ Done! Now restart the bot with: pm2 restart ubisoft-bot --update-env');