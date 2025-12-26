const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'bartender.db');
const db = new Database(dbPath);

console.log('📂 Using database:', dbPath);
console.log('');

// Show all accounts
console.log('👤 UBISOFT ACCOUNTS:');
console.log('─'.repeat(50));
const accounts = db.prepare("SELECT * FROM ubisoft_accounts").all();
accounts.forEach(a => {
    console.log(`   [${a.id}] ${a.account_name || a.email}`);
    console.log(`       Email: ${a.email}`);
    console.log(`       Enabled: ${a.enabled ? '✅' : '❌'}`);
    console.log('');
});

// Show tokens grouped by account
console.log('\n🎫 UBISOFT TOKENS:');
console.log('─'.repeat(50));
const tokens = db.prepare(`
    SELECT t.*, a.account_name, a.email, g.game_name 
    FROM ubisoft_tokens t
    LEFT JOIN ubisoft_accounts a ON t.account_id = a.id
    LEFT JOIN ubisoft_games g ON t.game_id = g.id
`).all();

// Group by account
const byAccount = {};
tokens.forEach(t => {
    const key = t.account_id;
    if (!byAccount[key]) byAccount[key] = [];
    byAccount[key].push(t);
});

Object.entries(byAccount).forEach(([accountId, toks]) => {
    const acc = accounts.find(a => a.id == accountId);
    console.log(`\n👤 Account ${accountId}: ${acc?.account_name || acc?.email || 'Unknown'}`);
    
    const used = toks.filter(t => t.last_used_at).length;
    const available = toks.filter(t => !t.last_used_at).length;
    console.log(`   Total: ${toks.length} | Used: ${used} | Available: ${available}`);
    
    toks.slice(0, 5).forEach(t => {
        const status = t.last_used_at ? `❌ Used ${t.last_used_at}` : '✅ Available';
        console.log(`   [${t.id}] ${t.game_name || 'Game ' + t.game_id} - ${status}`);
    });
    if (toks.length > 5) console.log(`   ... and ${toks.length - 5} more`);
});

// Ask which account to mark as exhausted
console.log('\n' + '='.repeat(50));
console.log('To mark Account 1 tokens as USED, run:');
console.log('   node fix-accounts.js mark 1');
console.log('');
console.log('To mark a specific account, run:');
console.log('   node fix-accounts.js mark <account_id>');
console.log('='.repeat(50));

// Check if we should mark tokens
if (process.argv[2] === 'mark' && process.argv[3]) {
    const accountId = parseInt(process.argv[3]);
    console.log(`\n⚠️  Marking all tokens for account ${accountId} as USED...`);
    
    const result = db.prepare(`
        UPDATE ubisoft_tokens 
        SET last_used_at = datetime('now'), 
            used_by_username = 'MANUAL_EXHAUST'
        WHERE account_id = ? AND last_used_at IS NULL
    `).run(accountId);
    
    console.log(`✅ Marked ${result.changes} tokens as used for account ${accountId}`);
    console.log('\n🔄 Restart bot with: pm2 restart ubisoft-bot --update-env');
}

db.close();