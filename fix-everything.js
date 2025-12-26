const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'bartender.db');
const db = new Database(dbPath);

console.log('═'.repeat(60));
console.log('  UBISOFT BOT - COMPLETE FIX');
console.log('═'.repeat(60));

// ============================================================================
// STEP 1: Add token_format column
// ============================================================================
console.log('\n📋 STEP 1: Token format column...');
try {
    const columns = db.prepare("PRAGMA table_info(ubisoft_games)").all();
    const hasTokenFormat = columns.some(c => c.name === 'token_format');
    
    if (!hasTokenFormat) {
        db.exec("ALTER TABLE ubisoft_games ADD COLUMN token_format TEXT DEFAULT 'legacy'");
        console.log('   ✅ Added token_format column');
    } else {
        console.log('   ✅ Column already exists');
    }
} catch (e) {
    console.log('   ⚠️  Error:', e.message);
}

// ============================================================================
// STEP 2: Set Assassin's Creed Shadows to NORMAL (option 1)
// ============================================================================
console.log('\n📋 STEP 2: Setting Assassin\'s Creed Shadows to NORMAL format...');
const updateResult = db.prepare("UPDATE ubisoft_games SET token_format = 'normal' WHERE game_name LIKE '%Shadows%'").run();
console.log(`   ✅ Updated ${updateResult.changes} game(s)`);

// Show games
const games = db.prepare("SELECT id, game_name, token_format FROM ubisoft_games").all();
console.log('\n   Game formats:');
games.forEach(g => {
    const format = g.token_format || 'legacy';
    console.log(`   ${format === 'normal' ? '1️⃣' : '2️⃣'} ${g.game_name} → ${format.toUpperCase()}`);
});

// ============================================================================
// STEP 3: Show current token status
// ============================================================================
console.log('\n' + '═'.repeat(60));
console.log('📋 STEP 3: Current token status');
console.log('═'.repeat(60));

const accounts = db.prepare("SELECT * FROM ubisoft_accounts ORDER BY id").all();
accounts.forEach(acc => {
    const tokens = db.prepare("SELECT * FROM ubisoft_tokens WHERE account_id = ?").all(acc.id);
    const nullTokens = tokens.filter(t => t.last_used_at === null).length;
    const usedTokens = tokens.filter(t => t.last_used_at !== null).length;
    
    console.log(`\n👤 Account ${acc.id}: ${acc.account_name || acc.email}`);
    console.log(`   Tokens: ${tokens.length} total`);
    console.log(`   - Never used (NULL): ${nullTokens} ← These get picked FIRST!`);
    console.log(`   - Has been used: ${usedTokens}`);
});

// ============================================================================
// STEP 4: Mark Account 1 tokens as USED
// ============================================================================
console.log('\n' + '═'.repeat(60));
console.log('📋 STEP 4: Marking Account 1 tokens as USED...');
console.log('═'.repeat(60));

const exhaustResult = db.prepare(`
    UPDATE ubisoft_tokens 
    SET last_used_at = datetime('now'),
        used_by_username = 'EXHAUSTED_MANUAL'
    WHERE account_id = 1
`).run();

console.log(`\n   ✅ Marked ${exhaustResult.changes} tokens from Account 1 as used`);

// ============================================================================
// STEP 5: Verify the fix
// ============================================================================
console.log('\n' + '═'.repeat(60));
console.log('📋 STEP 5: Verifying fix...');
console.log('═'.repeat(60));

// Check which account would be selected now for each game
games.forEach(g => {
    const nextToken = db.prepare(`
        SELECT t.*, a.account_name, a.email
        FROM ubisoft_tokens t
        JOIN ubisoft_accounts a ON t.account_id = a.id
        WHERE t.game_id = ?
          AND a.enabled = 1
          AND (t.last_used_at IS NULL
               OR datetime(t.last_used_at, '+24 hours') < datetime('now'))
        ORDER BY t.last_used_at ASC NULLS FIRST
        LIMIT 1
    `).get(g.id);
    
    const format = g.token_format === 'normal' ? '1️⃣ NORMAL' : '2️⃣ LEGACY';
    
    if (nextToken) {
        console.log(`\n🎮 ${g.game_name}`);
        console.log(`   Format: ${format}`);
        console.log(`   Next account: Account ${nextToken.account_id} (${nextToken.account_name || nextToken.email})`);
    } else {
        console.log(`\n🎮 ${g.game_name}`);
        console.log(`   Format: ${format}`);
        console.log(`   Next account: ❌ NO AVAILABLE TOKENS`);
    }
});

// ============================================================================
// DONE
// ============================================================================
console.log('\n' + '═'.repeat(60));
console.log('  ✅ ALL FIXES APPLIED');
console.log('═'.repeat(60));
console.log('\nNow restart the bot:');
console.log('   pm2 restart ubisoft-bot --update-env');
console.log('');

db.close();