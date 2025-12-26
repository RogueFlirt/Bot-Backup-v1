const Database = require('better-sqlite3');
const db = new Database('./database/bartender.db');

console.log('\n=== TOKEN DEBUG ===\n');

// Check games table structure
const games = db.prepare('SELECT id, game_id, game_name FROM games LIMIT 5').all();
console.log('Sample games:');
games.forEach(g => console.log(`  id: ${g.id}, game_id: "${g.game_id}", name: "${g.game_name}"`));

// Check tokens table structure  
const tokens = db.prepare('SELECT game_id, status, COUNT(*) as count FROM tokens GROUP BY game_id, status LIMIT 10').all();
console.log('\nTokens by game_id:');
tokens.forEach(t => console.log(`  game_id: "${t.game_id}" - ${t.status}: ${t.count}`));

// Check for Atomic Heart specifically
const atomicTokens = db.prepare("SELECT * FROM tokens WHERE game_id LIKE '%atomic%' OR game_id LIKE '%heart%' LIMIT 5").all();
console.log('\nAtomic Heart tokens:', atomicTokens.length);
if (atomicTokens.length > 0) {
    console.log('  Sample:', atomicTokens[0]);
}

// Check what game_id format is used
const gameIdFormats = db.prepare("SELECT DISTINCT game_id FROM tokens LIMIT 10").all();
console.log('\nToken game_id formats:');
gameIdFormats.forEach(g => console.log(`  "${g.game_id}"`));

db.close();