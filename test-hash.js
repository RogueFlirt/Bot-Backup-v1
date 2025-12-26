// Run: node test-hash.js <username> <password>
// Example: node test-hash.js brawler yourpassword

const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('./database/bartender.db');

const username = process.argv[2] || 'brawler';
const testPassword = process.argv[3] || 'test123';

console.log(`\n=== TESTING PASSWORD HASH FOR: ${username} ===\n`);

const user = db.prepare('SELECT * FROM dashboard_users WHERE username = ?').get(username);

if (!user) {
    console.log('User not found!');
    process.exit(1);
}

console.log('Stored hash:', user.password_hash);
console.log('Hash length:', user.password_hash.length);
console.log('');

// Check format
if (user.password_hash.includes(':')) {
    const [salt, hash] = user.password_hash.split(':');
    console.log('Format: salt:hash');
    console.log('Salt:', salt, `(${salt.length} chars)`);
    console.log('Hash:', hash, `(${hash.length} chars)`);
    console.log('');
    
    console.log('=== TRYING DIFFERENT ALGORITHMS ===\n');
    
    // Try different combinations
    const tests = [
        { name: 'SHA512(salt + password)', fn: () => crypto.createHash('sha512').update(salt + testPassword).digest('hex') },
        { name: 'SHA512(password + salt)', fn: () => crypto.createHash('sha512').update(testPassword + salt).digest('hex') },
        { name: 'SHA256(salt + password)', fn: () => crypto.createHash('sha256').update(salt + testPassword).digest('hex') },
        { name: 'SHA256(password + salt)', fn: () => crypto.createHash('sha256').update(testPassword + salt).digest('hex') },
        { name: 'scrypt(password, salt, 64)', fn: () => crypto.scryptSync(testPassword, salt, 64).toString('hex') },
        { name: 'scrypt(password, Buffer.from(salt, hex), 64)', fn: () => crypto.scryptSync(testPassword, Buffer.from(salt, 'hex'), 64).toString('hex') },
        { name: 'pbkdf2(password, salt, 100000, 64, sha512)', fn: () => crypto.pbkdf2Sync(testPassword, salt, 100000, 64, 'sha512').toString('hex') },
        { name: 'pbkdf2(password, salt, 10000, 64, sha512)', fn: () => crypto.pbkdf2Sync(testPassword, salt, 10000, 64, 'sha512').toString('hex') },
        { name: 'pbkdf2(password, salt, 1000, 64, sha512)', fn: () => crypto.pbkdf2Sync(testPassword, salt, 1000, 64, 'sha512').toString('hex') },
        { name: 'pbkdf2(password, Buffer.from(salt,hex), 100000, 64, sha512)', fn: () => crypto.pbkdf2Sync(testPassword, Buffer.from(salt, 'hex'), 100000, 64, 'sha512').toString('hex') },
    ];
    
    for (const test of tests) {
        try {
            const result = test.fn();
            const match = result === hash ? '✅ MATCH!' : '❌';
            console.log(`${test.name}:`);
            console.log(`  Result: ${result.substring(0, 40)}...`);
            console.log(`  ${match}`);
            if (result === hash) {
                console.log('\n🎉 FOUND THE ALGORITHM! 🎉\n');
            }
            console.log('');
        } catch (e) {
            console.log(`${test.name}: ERROR - ${e.message}`);
        }
    }
} else {
    console.log('Format: simple hash (no salt)');
    console.log('');
    
    // Try simple hashes
    const sha256 = crypto.createHash('sha256').update(testPassword + 'bartender_salt').digest('hex');
    console.log('SHA256(password + bartender_salt):', sha256);
    console.log('Match:', sha256 === user.password_hash ? '✅ YES' : '❌ NO');
}

db.close();
console.log('\n=== DONE ===\n');
console.log('If no match found, try with the correct password:');
console.log(`  node test-hash.js ${username} <correct_password>`);
