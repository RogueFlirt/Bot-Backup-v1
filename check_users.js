const db = require('./database/db');

setTimeout(() => {
    const database = db.getDatabase();
    
    console.log('getDashboardUser exists:', typeof db.getDashboardUser);
    
    try {
        const users = database.prepare('SELECT id, username, role FROM dashboard_users').all();
        console.log('Users in dashboard_users:', users);
    } catch(e) {
        console.log('dashboard_users error:', e.message);
    }
    
    if (db.getDashboardUser) {
        const result = db.getDashboardUser('admin');
        console.log('getDashboardUser(admin):', result);
    }
    
    process.exit(0);
}, 1000);
