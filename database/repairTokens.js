// database/repairTokens.js - Token Repair Utility
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('./db');

async function main() {
    console.log('🔧 Token Repair Utility\n');
    
    await db.initDatabase();
    
    console.log('Resetting all tokens...');
    const count = db.resetAllTokens();
    
    console.log(`✅ Reset ${count} tokens to available status`);
    console.log('✅ All tokens are now ready to use\n');
    
    process.exit(0);
}

main().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
});