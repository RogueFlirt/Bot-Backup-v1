const fs = require('fs');
const path = require('path');

const dbCode = fs.readFileSync('./database/db.js', 'utf8');

console.log('📄 Searching for Ubisoft functions in db.js...\n');

// Find all ubisoft-related functions
const lines = dbCode.split('\n');
let inUbisoftSection = false;
let ubisoftLines = [];

lines.forEach((line, i) => {
    if (line.toLowerCase().includes('ubisoft')) {
        inUbisoftSection = true;
    }
    if (inUbisoftSection) {
        ubisoftLines.push({ num: i + 1, line });
    }
});

if (ubisoftLines.length > 0) {
    console.log('✅ Found Ubisoft code:\n');
    console.log('─'.repeat(60));
    ubisoftLines.forEach(l => console.log(`${String(l.num).padStart(4)}: ${l.line}`));
} else {
    console.log('❌ No Ubisoft functions found in db.js!');
    console.log('\n   You need to add the Ubisoft database functions.');
}

// Also show total lines
console.log(`\n📊 Total lines in db.js: ${lines.length}`);