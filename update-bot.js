const fs = require('fs');
const path = require('path');

const botFile = path.join(__dirname, 'ubisoft-bot.js');
let code = fs.readFileSync(botFile, 'utf8');

// Backup first
fs.writeFileSync(botFile + '.backup', code);
console.log('✅ Created backup: ubisoft-bot.js.backup');

// Find and replace the PowerShell script section
const oldScript = `# Send "1" to select account
[System.Windows.Forms.SendKeys]::SendWait("1")
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 2

# Send "\${formatChoice}" for token format (1=normal, 2=legacy)
[System.Windows.Forms.SendKeys]::SendWait("\${formatChoice}")`;

const newScript = `# Send account selection (based on database account_id)
[System.Windows.Forms.SendKeys]::SendWait("\${accountChoice}")
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 2

# Send "\${formatChoice}" for token format (1=normal, 2=legacy)
[System.Windows.Forms.SendKeys]::SendWait("\${formatChoice}")`;

if (code.includes(oldScript)) {
    code = code.replace(oldScript, newScript);
    console.log('✅ Updated PowerShell script section');
} else {
    console.log('⚠️  Could not find exact script section, trying alternative...');
    
    // Try to find just the account selection part
    const altOld = `# Send "1" to select account
[System.Windows.Forms.SendKeys]::SendWait("1")`;
    
    const altNew = `# Send account selection (based on database account_id)
[System.Windows.Forms.SendKeys]::SendWait("\${accountChoice}")`;
    
    if (code.includes(altOld)) {
        code = code.replace(altOld, altNew);
        console.log('✅ Updated account selection line');
    } else {
        console.log('❌ Could not find account selection code');
        process.exit(1);
    }
}

// Now add the accountChoice variable definition
// Find where formatChoice is defined and add accountChoice after it
const formatChoiceLine = `const formatChoice = game.token_format === 'normal' ? '1' : '2';`;
const newFormatSection = `const formatChoice = game.token_format === 'normal' ? '1' : '2';
            const accountChoice = String(tokenData.account_id); // Use account_id as exe menu position`;

if (code.includes(formatChoiceLine) && !code.includes('accountChoice')) {
    code = code.replace(formatChoiceLine, newFormatSection);
    console.log('✅ Added accountChoice variable');
} else if (code.includes('accountChoice')) {
    console.log('ℹ️  accountChoice already exists');
} else {
    console.log('⚠️  Could not find formatChoice line');
}

// Write the updated file
fs.writeFileSync(botFile, code);
console.log('✅ Saved updated ubisoft-bot.js');

console.log('\n═══════════════════════════════════════════════');
console.log('Now restart the bot:');
console.log('   pm2 restart ubisoft-bot --update-env');
console.log('═══════════════════════════════════════════════');