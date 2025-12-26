// find-all-tables.js - Run with: node find-all-tables.js

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Find all .db files
console.log('=== LOOKING FOR DATABASE FILES ===');
const dbFiles = [];

function findDbFiles(dir) {
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            try {
                const stat = fs.statSync(fullPath);
                if (stat.isFile() && (file.endsWith('.db') || file.endsWith('.sqlite') || file.endsWith('.sqlite3'))) {
                    dbFiles.push(fullPath);
                } else if (stat.isDirectory() && !file.includes('node_modules') && !file.startsWith('.')) {
                    findDbFiles(fullPath);
                }
            } catch (e) {}
        }
    } catch (e) {}
}

findDbFiles(__dirname);
// Also check parent and database folder
findDbFiles(path.join(__dirname, 'database'));

console.log('Found database files:');
dbFiles.forEach(f => console.log('  ' + f));

// Check each database
for (const dbFile of dbFiles) {
    console.log('\n========================================');
    console.log('DATABASE: ' + dbFile);
    console.log('========================================');
    
    try {
        const db = new Database(dbFile);
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
        
        console.log('\nTables:');
        for (const t of tables) {
            if (t.name === 'sqlite_sequence') continue;
            
            try {
                const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
                console.log(`  ${t.name}: ${count.c} rows`);
                
                // Show columns
                const info = db.prepare(`PRAGMA table_info("${t.name}")`).all();
                const cols = info.map(i => i.name).join(', ');
                console.log(`    Columns: ${cols}`);
                
                // If it looks like a games table, show sample
                if (t.name.toLowerCase().includes('game') && count.c > 0) {
                    const sample = db.prepare(`SELECT * FROM "${t.name}" LIMIT 3`).all();
                    console.log('    Sample games:');
                    sample.forEach(g => console.log(`      - ${g.game_name || g.name || JSON.stringify(g)}`));
                }
            } catch (e) {
                console.log(`  ${t.name}: Error - ${e.message}`);
            }
        }
        db.close();
    } catch (e) {
        console.log('Error opening: ' + e.message);
    }
}

console.log('\n=== DONE ===');
