const db = require('./database/db');

// Initialize the database first
db.initDatabase();

// Close all open tickets
const result = db.getDatabase().prepare("UPDATE tickets SET status='closed', closed_at=datetime('now') WHERE status='open'").run();

console.log(`✅ Closed ${result.changes} stuck ticket(s)!`);

// Show any remaining open tickets
const remaining = db.getDatabase().prepare("SELECT * FROM tickets WHERE status='open'").all();
console.log(`📋 Remaining open tickets: ${remaining.length}`);
