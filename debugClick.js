// debugClick.js
const Database = require('better-sqlite3');
const db = new Database('./database/bartender.db');

// Simulate what happens when user clicks "Atomic Heart"
const atomicHeart = db.prepare("SELECT * FROM games WHERE game_name LIKE '%Atomic Heart%'").get();
console.log('Game from DB:', atomicHeart);

// This is what dropdown passes (string of id)
const dropdownValue = String(atomicHeart.id);
console.log('Dropdown would pass:', dropdownValue);

// Check tokens with different query methods
const asString = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE game_id = ? AND status = 'available'").get(dropdownValue);
const asInt = db.prepare("SELECT COUNT(*) as count FROM tokens WHERE game_id = ? AND status = 'available'").get(atomicHeart.id);

console.log('Query with string "3":', asString);
console.log('Query with int 3:', asInt);  

// Show actual token game_ids
const tokenIds = db.prepare("SELECT DISTINCT game_id, typeof(game_id) as type FROM tokens LIMIT 5").all();
console.log('Token game_id types:', tokenIds);

db.close();