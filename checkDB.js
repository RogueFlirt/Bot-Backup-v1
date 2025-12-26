const Database = require('better-sqlite3');
const db = new Database('./database/bartender.db');

console.log('\n=== DATABASE CHECK ===\n');

// Check table structure
console.log('Transcripts table columns:');
const columns = db.prepare("PRAGMA table_info(transcripts)").all();
columns.forEach(c => console.log(`  - ${c.name} (${c.type})`));

// Check transcript count
const count = db.prepare('SELECT COUNT(*) as count FROM transcripts').get().count;
console.log(`\nTotal transcripts: ${count}`);

// Show sample data (first 3 transcripts)
if (count > 0) {
    console.log('\nSample transcripts:');
    const samples = db.prepare('SELECT * FROM transcripts LIMIT 3').all();
    samples.forEach(t => {
        console.log(`\n  Ticket: ${t.ticket_id}`);
        Object.keys(t).forEach(key => {
            let val = t[key];
            if (typeof val === 'string' && val.length > 100) val = val.substring(0, 100) + '...';
            console.log(`    ${key}: ${val}`);
        });
    });
}

console.log('\n=== DONE ===\n');
db.close();