# EA Token Service - Installation & Testing Guide

## Overview

This update replaces the unreliable exe-based token generation with direct API calls to EA's servers. The system:

- Makes HTTPS calls directly to EA's license server
- Handles multiple accounts with automatic selection
- Tracks per-account rate limits (5 tokens per 24h rolling window)
- Falls back to exe if API fails
- Integrates with your existing ticket system

---

## Prerequisites

- Node.js 16+ 
- Your existing bot with EA tables already set up
- EA Desktop installed on the server (for token refresh)
- At least one EA account configured in the database

---

## Installation Steps

### Step 1: Backup Your Bot

```batch
:: Run this in your bot folder
mkdir backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%
copy index.js backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%\
copy db.js backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%\
xcopy EA backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%\EA\ /E /I
```

### Step 2: Install Dependencies

```batch
cd C:\path\to\your\bot
npm install xml2js
```

### Step 3: Copy New EA Files

Copy these files to your bot's `EA` folder:
- `ea-api.js` (NEW - Direct API integration)
- `ea-account-manager.js` (NEW - Multi-account handling)
- `ea-token-service.js` (NEW - Main service)

Keep your existing:
- `token_generator.exe` (still used for fallback)
- `ea-db.js` (unchanged)
- `ea-tickets.js` (unchanged)

### Step 4: Run Database Migration

```batch
cd C:\path\to\your\bot
node migrate-ea-db.js
```

This adds:
- `access_token` column to `ea_accounts`
- `token_expires_at` column to `ea_accounts`
- `games_owned` column to `ea_accounts`
- `ea_generations` table for tracking rate limits

### Step 5: Edit index.js

Open `index.js` and make these changes:

#### 5a. Add Import (near top, around line 25)

Find where you have other `require()` statements and add:

```javascript
const eaTokenService = require('./EA/ea-token-service');
```

#### 5b. Initialize Service (in ready event, around line 7070)

Find `console.log('🚀 BOT READY')` and add BEFORE it:

```javascript
// Initialize EA Token Service
try {
    eaTokenService.init(db.getDatabase(), {
        exePath: path.join(__dirname, 'EA', 'token_generator.exe'),
        tcnoPath: 'C:\\Program Files\\TcNo Account Switcher\\TcNo-Acc-Switcher.exe'
    });
    console.log('✅ EA Token Service initialized');
} catch (err) {
    console.error('❌ EA Token Service init error:', err.message);
}
```

#### 5c. Replace generateEAToken Function (around line 2984)

Find the existing `generateEAToken` function (starts with `async function generateEAToken(ticket)`) and **REPLACE THE ENTIRE FUNCTION** with:

```javascript
async function generateEAToken(ticket) {
    console.log(`[EA] ========== TOKEN GENERATION START ==========`);
    console.log(`[EA] Ticket: ${ticket.id}, Game: ${ticket.gameName}`);
    
    try {
        // Use the new EA Token Service
        const result = await eaTokenService.generateToken({
            id: ticket.id,
            gameId: ticket.gameId,
            gameName: ticket.gameName,
            userId: ticket.userId,
            username: ticket.username,
            tokenRequestFile: ticket.tokenRequestFile
        });
        
        if (result.success) {
            // Mark token as used in existing database
            if (db.markEATokenUsed) {
                const tokenData = db.getReservedEAToken ? db.getReservedEAToken(ticket.id) : null;
                if (tokenData) {
                    db.markEATokenUsed(tokenData.id, ticket.userId, ticket.username, ticket.id);
                }
            }
            updateEAPanel();
            console.log(`[EA] SUCCESS! Token: ${result.tokenText.length} chars`);
            return { 
                success: true, 
                tokenText: result.tokenText, 
                accountUsed: result.accountUsed 
            };
        } else {
            console.log(`[EA] FAILED: ${result.error}`);
            return { 
                success: false, 
                error: result.error,
                needsRefresh: result.needsRefresh,
                waitTime: result.waitTime
            };
        }
    } catch (err) {
        console.error('[EA] Exception:', err);
        return { success: false, error: err.message };
    }
}
```

#### 5d. Add New Commands (around line 6643)

Find where you handle slash commands (look for `else if (commandName === 'ea-setup')`) and add these new handlers:

```javascript
else if (commandName === 'ea-updatetoken') {
    // Staff only
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
    }
    
    const accountName = interaction.options.getString('account');
    const token = interaction.options.getString('token');
    
    try {
        eaTokenService.updateAccessTokenByName(accountName, token);
        await interaction.reply({ 
            content: `✅ Updated access token for **${accountName}**\n\nToken will expire in ~4 hours.`, 
            ephemeral: true 
        });
    } catch (err) {
        await interaction.reply({ 
            content: `❌ Error: ${err.message}`, 
            ephemeral: true 
        });
    }
}

else if (commandName === 'ea-accounts') {
    const status = eaTokenService.getStatus();
    
    let accountsText = '';
    for (const acc of status.accounts) {
        const tokenStatus = acc.hasToken 
            ? (acc.tokenExpired ? '🔴 Expired' : '🟢 Valid')
            : '⚫ No token';
        accountsText += `**${acc.name}**: ${acc.available}/5 slots | ${tokenStatus}\n`;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🎮 EA Account Status')
        .setDescription(accountsText || 'No accounts configured')
        .addFields(
            { name: 'Total Slots', value: `${status.summary.availableSlots}/${status.summary.totalSlots} available`, inline: true },
            { name: 'Accounts', value: `${status.summary.accountsWithValidTokens}/${status.summary.totalAccounts} with valid tokens`, inline: true }
        )
        .setColor(status.summary.availableSlots > 0 ? 0x00FF00 : 0xFF0000)
        .setTimestamp();
    
    if (status.summary.accountsNeedingRefresh > 0) {
        embed.addFields({
            name: '⚠️ Action Needed',
            value: `${status.summary.accountsNeedingRefresh} account(s) need token refresh.\nUse \`/ea-updatetoken\` to update.`
        });
    }
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}
```

#### 5e. Register New Slash Commands

Find your commands array (where you register slash commands) and add:

```javascript
{
    name: 'ea-updatetoken',
    description: 'Update an EA account access token',
    options: [
        {
            name: 'account',
            description: 'Account name (e.g., mitch, azam)',
            type: 3,
            required: true
        },
        {
            name: 'token',
            description: 'The new access token',
            type: 3,
            required: true
        }
    ]
},
{
    name: 'ea-accounts',
    description: 'View EA account status and availability',
},
```

### Step 6: Restart Bot

```batch
pm2 restart all
:: or
node index.js
```

---

## Getting Access Tokens

The EA API requires an access token from each account. Here's how to get them:

### Method 1: From token_generator.exe

1. Make sure EA Desktop is running and logged into the account
2. Run `token_generator.exe`
3. Choose option 2 (Force get access token)
4. Copy the token that appears
5. Run `/ea-updatetoken accountname "paste_token_here"`

### Method 2: From EA Desktop Memory (Advanced)

The access token is stored in EA Desktop's memory. Tools like CheatEngine can find it, or the exe extracts it automatically.

### Token Refresh Schedule

- Tokens expire every ~4 hours
- You need to refresh before they expire
- Consider setting up a scheduled task to remind you

---

## Testing Guide

### Test 1: Verify Installation

```
/ea-accounts
```

Should show:
- All your EA accounts
- Token status (⚫ No token if not set yet)
- Available slots

### Test 2: Set Access Token

```
/ea-updatetoken mitch "eyJ0eXAiOiJKV1QiLC..."
```

Should respond with success message.

### Test 3: Verify Token

```
/ea-accounts
```

Should now show 🟢 Valid for the account you updated.

### Test 4: Full Flow Test

1. Open an EA ticket (use the panel)
2. Upload screenshots (get verified)
3. Upload a `.txt` ticket file
4. Watch the logs for:
   ```
   [EA Token Service] ========== TOKEN GENERATION START ==========
   [EA Token Service] Using account: mitch (5 slots available)
   [EA Token Service] Making request to: https://proxy.novafusion.ea.com/licenses
   [EA Token Service] Response status: 200
   [EA Token Service] Decrypting response...
   [EA Token Service] Extracting GameToken...
   [EA Token Service] Success! Token length: XXXXX
   ```
5. User should receive the token file

### Test 5: Rate Limit Test

Generate 5 tokens from one account:
- After 5, should automatically switch to another account
- After all accounts maxed, should show wait time

### Test 6: Token Expiry Test

1. Wait 4+ hours (or manually set `token_expires_at` to past)
2. Try to generate
3. Should show "Access tokens expired" error
4. Use `/ea-updatetoken` to refresh
5. Should work again

---

## Troubleshooting

### "No EA accounts configured"

Your `ea_accounts` table is empty. Add accounts:

```sql
INSERT INTO ea_accounts (account_name, tcno_id, enabled) 
VALUES ('mitch', 'b96496bb-ab9f-49ec-9250-40840c8d64fa', 1);
```

### "Access token expired or invalid"

Run `/ea-updatetoken` with a fresh token from EA Desktop.

### "Account does not own this game"

The account you're trying to use doesn't have that game. Either:
- Add the game to that account's library
- Configure another account that owns the game

### "All accounts rate limited"

All accounts have used their 5 tokens in the last 24 hours. Wait for slots to free up, or add more accounts.

### "Failed to decrypt license response"

The API response format may have changed. Check if:
- The access token is valid
- EA's servers are working
- The ticket data is correct

### EXE Fallback Not Working

If API fails and exe fallback also fails:
- Check `token_generator.exe` exists in EA folder
- Check EA Desktop is running
- Check TCNO Account Switcher is installed

---

## Adding More Accounts

1. Add to database:
```sql
INSERT INTO ea_accounts (account_name, tcno_id, enabled) 
VALUES ('newaccount', 'tcno-guid-here', 1);
```

2. Set which games it owns:
```sql
UPDATE ea_accounts SET games_owned = '[1, 2, 3]' WHERE account_name = 'newaccount';
```
(Use game IDs from ea_games table)

3. Get access token and update:
```
/ea-updatetoken newaccount "token_here"
```

---

## Monitoring

### View Account Status
```
/ea-accounts
```

### View Generation History
Check `ea_generations` table:
```sql
SELECT * FROM ea_generations ORDER BY generated_at DESC LIMIT 20;
```

### Check Rate Limits
```sql
SELECT 
    a.account_name,
    COUNT(g.id) as used_24h,
    5 - COUNT(g.id) as available
FROM ea_accounts a
LEFT JOIN ea_generations g ON a.id = g.account_id 
    AND g.generated_at > datetime('now', '-24 hours')
WHERE a.enabled = 1
GROUP BY a.id;
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `EA/ea-api.js` | Direct HTTPS calls to EA API |
| `EA/ea-account-manager.js` | Multi-account selection & rate limiting |
| `EA/ea-token-service.js` | Main service (what index.js calls) |
| `EA/token_generator.exe` | Fallback (kept from original) |
| `migrate-ea-db.js` | Database migration script |

---

## Support

If you have issues:
1. Check the console logs
2. Verify account tokens with `/ea-accounts`
3. Check database tables have the new columns
4. Make sure xml2js is installed

---

## Changelog

### v1.0.0 (Initial Release)
- Direct EA API integration
- Multi-account support with auto-selection
- Per-token 24h rolling window rate limits
- Token expiry tracking
- Fallback to exe if API fails
- New commands: `/ea-updatetoken`, `/ea-accounts`
