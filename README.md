# EA Token Service Update - FULLY AUTOMATED

## What This Does

**FULLY AUTOMATED token generation:**
1. User opens ticket → uploads screenshots → AI verifies
2. User uploads ticket.txt
3. Bot automatically:
   - Selects best account (most slots available)
   - Switches to that account via TCNO shortcuts
   - Runs token_generator.exe
   - Sends token with instructions
   - Starts 30 minute response timer
4. User clicks "It Works!" or "SOS"

**No manual intervention needed!**

## One-Click Installation

1. Extract this zip to your bot folder (where `bartender.db` is)
2. Double-click `install.bat`
3. Type `Y` to confirm
4. Restart your bot

## Requirements

- EA Desktop running on the server
- TCNO Account Switcher shortcuts in your EA folder (e.g., `mitch.lnk`, `azam.lnk`)
- token_generator.exe in the EA folder
- Accounts already logged in via TCNO (2FA already done)

## New Commands

| Command | Description |
|---------|-------------|
| `/ea-accounts` | View all EA accounts and their status |
| `/ea-updatetoken account token` | Manual token update (backup method) |

## Rate Limits

- 5 tokens per account per 24 hours (rolling window)
- Bot automatically picks account with most available slots
- Automatically fails over to other accounts

## Token Delivery

When token is generated, user sees:
- Detailed usage instructions (anadius.cfg, etc.)
- Token file download
- "It Works!" and "SOS" buttons
- 30 minute response timer

## Troubleshooting

**"No EA accounts configured"**
→ Add accounts to `ea_accounts` table

**"All accounts rate limited"**
→ Wait for 24h cooldown or add more accounts

**Token not generating**
→ Check EA Desktop is running and logged in
→ Check TCNO shortcuts exist in EA folder

## Restore from Backup

If something breaks:
```batch
copy backup_XXXXXXXX_XXXXXX\index.js index.js
```
