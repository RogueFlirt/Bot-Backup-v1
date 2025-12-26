const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('./database/bartender.db');

// See current users
console.log('Current users:');
console.log(db.prepare('SELECT id, username, role FROM dashboard_users').all());

// Reset admin password to 'admin123'
const newHash = crypto.createHash('sha256').update('admin123' + 'bartender_salt').digest('hex');
db.prepare('UPDATE dashboard_users SET password_hash = ? WHERE username = ?').run(newHash, 'admin');

console.log('Admin password reset to: admin123');           