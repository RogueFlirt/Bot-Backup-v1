// Run: node verify-login.js azam changeme123
const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('./database/bartender.db');

const username = process.argv[2] || 'azam';
const password = process.argv[3] || 'changeme123';

console.log(`\n=== VERIFY LOGIN: ${username} ===\n`);

const user = db.prepare('SELECT * FROM dashboard_users WHERE username = ?').get(username);

if (!user) {
    console.log('❌ User not found!');
    process.exit(1);
}

console.log('User found:', user.username, '(', user.role, ')');
console.log('Stored hash:', user.password_hash.substring(0, 50) + '...');

// Verify password function (same as dashboard-v3.js)
function verifyPassword(password, storedHash) {
    // New format: simple SHA256 hash (64 chars, no colon)
    if (!storedHash.includes(':')) {
        const hash = crypto.createHash('sha256').update(password + 'bartender_salt').digest('hex');
        console.log('\nUsing simple SHA256 format');
        console.log('Computed:', hash);
        return storedHash === hash;
    }
    
    // Old format: salt:pbkdf2hash
    const [salt, hash] = storedHash.split(':');
    if (salt && hash) {
        console.log('\nUsing PBKDF2 format');
        console.log('Salt:', salt);
        // PBKDF2 with 1000 iterations, 64 bytes, sha512
        const testHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
        console.log('Computed:', testHash.substring(0, 50) + '...');
        console.log('Expected:', hash.substring(0, 50) + '...');
        return testHash === hash;
    }
    
    return false;
}

const result = verifyPassword(password, user.password_hash);
console.log('\n=== RESULT ===');
console.log(result ? '✅ LOGIN WOULD SUCCEED!' : '❌ LOGIN WOULD FAIL!');

db.close();
