const fs = require('fs');
const path = require('path');

console.log('🔍 Searching for database files...\n');

// Check current directory
console.log('📁 Current directory (C:\\bartenderbot\\bot-v2):');
fs.readdirSync('.').filter(f => f.endsWith('.db')).forEach(f => {
    console.log(`   ✅ ${f}`);
});

// Check database folder
console.log('\n📁 database folder:');
if (fs.existsSync('./database')) {
    fs.readdirSync('./database').forEach(f => {
        console.log(`   - ${f}`);
    });
} else {
    console.log('   ❌ Folder not found');
}

// Check parent directory
console.log('\n📁 Parent directory (C:\\bartenderbot):');
try {
    fs.readdirSync('..').filter(f => f.endsWith('.db')).forEach(f => {
        console.log(`   ✅ ${f}`);
    });
} catch(e) {
    console.log('   Could not read');
}

// Now let's look inside db.js to see where it connects
console.log('\n📄 Checking database/db.js for database path...');
try {
    const dbCode = fs.readFileSync('./database/db.js', 'utf8');
    
    // Look for Database() or sqlite connection strings
    const dbMatch = dbCode.match(/new Database\(['"]([^'"]+)['"]\)/);
    const sqliteMatch = dbCode.match(/sqlite3?\.Database\(['"]([^'"]+)['"]\)/);
    const pathMatch = dbCode.match(/\.db['"]/g);
    
    if (dbMatch) console.log(`   Found: new Database('${dbMatch[1]}')`);
    if (sqliteMatch) console.log(`   Found: sqlite.Database('${sqliteMatch[1]}')`);
    
    // Show first 50 lines of db.js
    console.log('\n📄 First 50 lines of database/db.js:');
    console.log('─'.repeat(50));
    const lines = dbCode.split('\n').slice(0, 50);
    lines.forEach((line, i) => console.log(`${String(i+1).padStart(3)}: ${line}`));
} catch(e) {
    console.log('   ❌ Could not read db.js:', e.message);
}