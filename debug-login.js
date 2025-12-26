// Run this with: node debug-login.js
const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('./database/bartender.db');

console.log('=== DEBUG LOGIN ===\n');

// Check if table exists
try {
    const users = db.prepare('SELECT * FROM dashboard_users').all();
    console.log('dashboard_users table exists!');
    console.log('Users found:', users.length);
    users.forEach(u => {
        console.log(`\n  ID: ${u.id}`);
        console.log(`  Username: ${u.username}`);
        console.log(`  Role: ${u.role}`);
        console.log(`  Hash: ${u.password_hash}`);
    });
} catch (e) {
    console.log('❌ dashboard_users table does not exist:', e.message);
}

// Test password hash
console.log('\n=== PASSWORD HASH TEST ===\n');
const testPassword = 'admin';
const salt = 'bartender_salt';
const expectedHash = crypto.createHash('sha256').update(testPassword + salt).digest('hex');
console.log('Password:', testPassword);
console.log('Salt:', salt);
console.log('Expected hash:', expectedHash);

// Try to find matching user
try {
    const admin = db.prepare('SELECT * FROM dashboard_users WHERE username = ?').get('admin');
    if (admin) {
        console.log('\nAdmin user hash:', admin.password_hash);
        console.log('Hashes match:', admin.password_hash === expectedHash ? '✅ YES' : '❌ NO');
        
        if (admin.password_hash !== expectedHash) {
            console.log('\n⚠️ Updating admin password...');
            db.prepare('UPDATE dashboard_users SET password_hash = ? WHERE username = ?').run(expectedHash, 'admin');
            console.log('✅ Password updated! Try logging in again.');
        }
    } else {
        console.log('\n❌ No admin user found! Creating...');
        db.prepare('INSERT INTO dashboard_users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', expectedHash, 'admin');
        console.log('✅ Admin user created!');
    }
} catch (e) {
    console.log('Error:', e.message);
}

db.close();
console.log('\n=== DONE ===');
