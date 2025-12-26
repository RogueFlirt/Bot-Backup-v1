// check-ea-tables.js - Run with: node check-ea-tables.js

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'bartender.db');
const db = new Database(dbPath);

console.log('=== ALL TABLES ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
tables.forEach(t => console.log('  ' + t.name));

console.log('\n=== EA-RELATED TABLES ===');
const eaTables = tables.filter(t => t.name.toLowerCase().includes('ea'));
if (eaTables.length === 0) {
    console.log('  No EA tables found');
} else {
    eaTables.forEach(t => {
        console.log('\n  TABLE: ' + t.name);
        try {
            const rows = db.prepare(`SELECT * FROM ${t.name} LIMIT 10`).all();
            console.log('  Rows:', rows.length);
            if (rows.length > 0) {
                console.log('  Sample:', JSON.stringify(rows[0], null, 2));
            }
        } catch (e) {
            console.log('  Error reading:', e.message);
        }
    });
}

console.log('\n=== CHECKING MAIN GAMES TABLE FOR EA GAMES ===');
try {
    const allGames = db.prepare("SELECT * FROM games").all();
    console.log('Total games in main table:', allGames.length);
    
    // Look for EA-like games
    const eaKeywords = ['EA', 'F1', 'FIFA', 'Madden', 'NFS', 'Need for Speed', 'Battlefield', 'Apex', 'Sims', 'Mass Effect', 'Dragon Age', 'Star Wars'];
    const possibleEA = allGames.filter(g => 
        eaKeywords.some(kw => g.game_name && g.game_name.toLowerCase().includes(kw.toLowerCase()))
    );
    
    if (possibleEA.length > 0) {
        console.log('\nPossible EA games found in main table:');
        possibleEA.forEach(g => console.log('  - ' + g.game_name + ' (id: ' + g.id + ')'));
    } else {
        console.log('\nNo obvious EA games found in main games table');
        console.log('First 5 games:');
        allGames.slice(0, 5).forEach(g => console.log('  - ' + g.game_name));
    }
} catch (e) {
    console.log('Error checking games table:', e.message);
}

db.close();
console.log('\n=== DONE ===');
