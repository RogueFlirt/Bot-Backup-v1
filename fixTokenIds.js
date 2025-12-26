const Database = require('better-sqlite3');
const db = new Database('./database/bartender.db');

console.log('Fixing token game_id values...\n');

// Get mapping: numeric id -> text game_id
const games = db.prepare('SELECT id, game_id, game_name FROM games').all();
console.log(`Found ${games.length} games`);

let fixed = 0;
for (const game of games) {
    // Update tokens where game_id is the numeric id (as string)
    const result = db.prepare('UPDATE tokens SET game_id = ? WHERE game_id = ?')
        .run(game.game_id, String(game.id));
    
    if (result.changes > 0) {
        console.log(`  ${game.game_name}: ${result.changes} tokens fixed`);
        fixed += result.changes;
    }
}

console.log(`\n✅ Fixed ${fixed} total tokens`);

// Verify
const sample = db.prepare('SELECT game_id, COUNT(*) as count FROM tokens GROUP BY game_id LIMIT 5').all();
console.log('\nVerification (should show text slugs now):');
sample.forEach(t => console.log(`  ${t.game_id}: ${t.count} tokens`));

db.close();