// Run this with: node setup-admin.js
const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('./database/bartender.db');

// Create table
db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'staff',
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Hash password
const hash = crypto.createHash('sha256').update('admin' + 'bartender_salt').digest('hex');

// Add/update admin user
db.prepare(`INSERT OR REPLACE INTO dashboard_users (username, password_hash, role) VALUES (?, ?, ?)`).run('admin', hash, 'admin');

console.log('✅ Admin user created!');
console.log('   Username: admin');
console.log('   Password: admin');

// Show all users
const users = db.prepare('SELECT id, username, role FROM dashboard_users').all();
console.log('\nDashboard users:');
users.forEach(u => console.log(`  - ${u.username} (${u.role})`));

db.close();
