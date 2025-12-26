// clearTickets.js - Clear stuck tickets
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('./db');

async function main() {
    await db.initDatabase();
    
    // Close all open tickets
    const initSqlJs = require('sql.js');
    const fs = require('fs');
    const path = require('path');
    
    const dbPath = path.join(__dirname, 'bartender.db');
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(dbPath);
    const database = new SQL.Database(buffer);
    
    database.run("UPDATE tickets SET status = 'closed', close_reason = 'System reset' WHERE status = 'open'");
    
    const data = database.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    
    console.log('✅ All stuck tickets closed!');
    process.exit(0);
}

main();