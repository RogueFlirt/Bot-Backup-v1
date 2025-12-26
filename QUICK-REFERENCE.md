# EA Token Service - Quick Reference

## Fully Automated Flow

```
User clicks game in panel
        ↓
Thread created, user uploads screenshots
        ↓
AI verifies screenshots
        ↓
User uploads ticket.txt
        ↓
Bot selects best account (most slots available)
        ↓
TCNO switches to that account (via shortcut)
        ↓
token_generator.exe runs
        ↓
Token sent with instructions + "It Works!" / "SOS" buttons
        ↓
30 minute response timer starts
```

## New Commands

| Command | Description |
|---------|-------------|
| `/ea-accounts` | View all accounts, slots used, status |
| `/ea-updatetoken <account> <token>` | Manual token update (backup) |

## Rate Limits

- **5 tokens per account per 24 hours** (rolling window)
- Bot automatically picks account with most slots
- Queues requests if multiple come at once

## Token Delivery Message

User receives:
- Full usage instructions (anadius.cfg editing)
- Game-specific notes (F1, FC, NFL)
- Token file download
- "It Works!" and "SOS" buttons

## Timers

| Stage | Time Limit |
|-------|------------|
| Screenshots | 10 minutes |
| Token request file | 30 minutes |
| Response after token | 30 minutes |

## TCNO Account Switching

Bot looks for shortcuts in EA folder:
- `mitch.lnk` → switches to mitch account
- `azam.lnk` → switches to azam account

Or uses TCNO ID from database:
- `+ea:{tcno_id}` command

## Database Tables

| Table | Purpose |
|-------|---------|
| `ea_accounts` | Accounts + TCNO IDs |
| `ea_generations` | Token usage tracking (rate limits) |
| `ea_games` | Games configuration |
| `ea_tickets` | Ticket tracking |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "All rate limited" | Wait for slots or add more accounts |
| Token not generating | Check EA Desktop is running |
| "No accounts" | Add to `ea_accounts` table |
| TCNO not switching | Check shortcuts exist in EA folder |

## Files

```
EA/
├── ea-token-service.js    # Main service (TCNO + exe)
├── ea-account-manager.js  # Multi-account handling  
├── ea-api.js              # Direct API (backup)
├── token_generator.exe    # Token generation
├── mitch.lnk             # TCNO shortcut
└── azam.lnk              # TCNO shortcut
```
