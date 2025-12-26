// fixGameSizes.js - Fix remaining 16 games with manual sizes
const Database = require('better-sqlite3');
const db = new Database('./database/bartender.db');

// Map: DB name -> size in GB
const manualSizes = {
    'Dead Space': 36.33,
    'F1 25': 84.4,
    'F1 Manager 2024': 17.49,
    'Football Manager 2026': 7.14,
    'Judgment': 61.59,  // Lost Judgment
    'Like A Dragon Gaiden': 87.26,
    'Marvels Midnight Suns': 57.17,
    'Raidou Remastered': 16.17,
    'Smt Iii Nocturne': 10.65,
    'Smt V Vengeance': 30.14,
    'Sonic Crossworlds': 15.9,
    'Civilization 7': 17.6,
    'Demon Slayer Hinokami Chronicles': 24.59,
    'Demon Slayer Hinokami Chronicles 2': 24.4,
    'Warhammer 40k Chaos Gate': 18.49,
    'Warhammer Realms Of Ruin': 14.67,
};

console.log('Updating game sizes...\n');

let updated = 0;
let notFound = [];

for (const [gameName, size] of Object.entries(manualSizes)) {
    // Try exact match
    let result = db.prepare('UPDATE games SET size_gb = ? WHERE game_name = ?').run(size, gameName);
    
    // Try case-insensitive if no match
    if (result.changes === 0) {
        result = db.prepare('UPDATE games SET size_gb = ? WHERE LOWER(game_name) = LOWER(?)').run(size, gameName);
    }
    
    // Try partial match if still no match
    if (result.changes === 0) {
        result = db.prepare('UPDATE games SET size_gb = ? WHERE LOWER(game_name) LIKE LOWER(?)').run(size, `%${gameName}%`);
    }
    
    if (result.changes > 0) {
        console.log(`✅ ${gameName}: ${size} GB`);
        updated++;
    } else {
        console.log(`❌ ${gameName}: not found in DB`);
        notFound.push(gameName);
    }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`✅ Updated: ${updated} games`);
if (notFound.length > 0) {
    console.log(`❌ Not found: ${notFound.length}`);
    notFound.forEach(n => console.log(`   • ${n}`));
}

// Verify
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log('Games still missing sizes:');
const missing = db.prepare('SELECT game_name FROM games WHERE size_gb = 0 OR size_gb IS NULL').all();
if (missing.length === 0) {
    console.log('✅ All games have sizes!');
} else {
    missing.forEach(g => console.log(`   • ${g.game_name}`));
}

db.close();
