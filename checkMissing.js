// checkMissing.js
const Database = require('better-sqlite3');
const db = new Database('./database/bartender.db');

// Get all games from DB
const dbGames = db.prepare('SELECT game_name, size_gb FROM games ORDER BY game_name').all();

console.log('Games in DB with NO size (size_gb = 0 or null):\n');

let missing = 0;
for (const game of dbGames) {
    if (!game.size_gb || game.size_gb === 0) {
        console.log(`  • ${game.game_name}`);
        missing++;
    }
}

console.log(`\nTotal: ${missing} games need sizes`);
db.close();