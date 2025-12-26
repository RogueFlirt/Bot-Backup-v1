// ============================================================================
// 🍺 PUB'S BARTENDER BOT V2.1 - COMPLETE FIXED VERSION
// Part 1 of 4 - Imports, Config, Helpers, Ticket Logging
// ============================================================================

require('dotenv').config();
const {
    Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType,
    SlashCommandBuilder, REST, Routes, PermissionFlagsBits, AttachmentBuilder
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

// ============================================================================
// IMPORTS
// ============================================================================

const db = require('./database/db');
const apiClient = require('./utils/apiClient');
const BotQueueHelper = require('./utils/botQueueHelper');
const AIVerifier = require('./ai-verifier');
const { getBotManager } = require('./utils/botManager');

// EA Ticket System is now integrated into main bot (no separate files)

// ============================================================================
// UBISOFT SYSTEM - INTEGRATED INTO MAIN BOT
// ============================================================================
const { spawn, exec } = require('child_process');

// Ubisoft Configuration
const ubisoftConfig = {
    denuvoExePath: process.env.DENUVO_EXE_PATH || path.join(__dirname, 'ubisoft', 'DenuvoTicket.exe'),
    tokenOutputPath: process.env.DENUVO_TOKEN_PATH || path.join(__dirname, 'ubisoft', 'token'),
    screenshotTimeout: 10 * 60 * 1000,      // 10 minutes for screenshots
    tokenRequestTimeout: 30 * 60 * 1000,    // 30 minutes for token request txt
    responseTimeout: 30 * 60 * 1000,        // 30 minutes to respond after token
};

// Ubisoft State
const activeUbisoftTickets = new Map();
const ubisoftPanels = new Map();
const ubisoftTokenQueue = [];
let isProcessingUbisoftQueue = false;

console.log('✅ Ubisoft system integrated into main bot');

// ============================================================================
// EA SYSTEM CONFIG & STATE
// ============================================================================

const eaConfig = {
    tokenGenPath: process.env.EA_TOKEN_GEN_PATH || path.join(__dirname, 'EA', 'EAgen.exe'),
    tcnoPath: process.env.TCNO_PATH || 'C:\\Program Files\\TcNo Account Switcher\\TcNo-Acc-Switcher.exe',
    tokenOutputPath: process.env.EA_TOKEN_PATH || path.join(__dirname, 'EA', 'tokens'),
    screenshotTimeout: 10 * 60 * 1000,
    tokenRequestTimeout: 30 * 60 * 1000,
    responseTimeout: 30 * 60 * 1000,
};

const activeEATickets = new Map();
const eaPanels = new Map();
const eaTokenQueue = [];
let isProcessingEAQueue = false;

// Reset queue flag on startup (in case previous run got stuck)
setTimeout(() => {
    if (isProcessingEAQueue && eaTokenQueue.length === 0) {
        console.log(`[EA] Resetting stuck queue flag on startup`);
        isProcessingEAQueue = false;
    }
}, 5000);
let currentEAAccount = null;

// Make activeEATickets available globally for dashboard
global.activeEATickets = activeEATickets;

const EA_INSTRUCTIONS = `Before Doing Below Steps
- Restart your PC first.
- Install EA Desktop App — No need to login & do not keep it open.

CLEAN GAME FILES / NOTACRACK/MAGIC/SECRET FILES HERE :
🎫 Premium Pub: https://discord.com/channels/1265025550485950634/1444311914871001249
🆓 Free Pub: https://discord.com/channels/1310909523715690536/1444312033175666688
———————————————————
# Step 1️⃣:
Download & extract the game files.
(For Dead Space Remake Only, Steam files will need Steam to EA conversion files.)

# Step 2️⃣:
Download Magic / Not a Crack / Secret Sauce → extract into your game folder.
(For FC games, also extract Live Editor into your game folder - FC26 uses FMT instead of LiveEditor. LiveEditor is optional for FC26 and can be found in Google)

# Step 3️⃣:
Rename: 
\`GAME.exe → GAME-original.exe
GAME fixed.exe → GAME.exe\`

# Step 4️⃣:
Run the renamed \`GAME.exe\`
- Denuvo ticket/txt file will be created automatically. However,
- If an error pops up → press Ctrl+C, paste the message in Notepad, save it as .txt.
\`Send that .txt file in your ticket.\`

# Step 5️⃣:
# \`Now Just Wait for your token & Instructions to apply it\`

[USE GOOGLE TRANSLATE IF YOU DON'T UNDERSTAND](https://discord.com/channels/1265025550485950634/1281057687638904922)`;

console.log('✅ EA system integrated into main bot');

// Local backup system
let LocalBackup = null;
let backupSystem = null;
try {
    LocalBackup = require('./utils/backup');
    console.log('✅ Local backup module loaded');
} catch (e) {
    console.log('⚠️ Local backup not loaded:', e.message);
}

let handleHistoryCommand, handleHistorySelect, handleHistoryPage;
try {
    const historyModule = require('./commands/historyCommand');
    handleHistoryCommand = historyModule.handleHistoryCommand;
    handleHistorySelect = historyModule.handleHistorySelect;
    handleHistoryPage = historyModule.handleHistoryPage;
    console.log('✅ History command module loaded');
} catch (e) {
    console.log('⚠️ History command not loaded:', e.message);
}

let startTranscriptServer = null;
try {
    const transcriptModule = require('./web/transcriptServer');
    startTranscriptServer = transcriptModule.startServer;
    console.log('✅ Transcript server module loaded');
} catch (e) {
    console.log('⚠️ Transcript server not loaded:', e.message);
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
    token: process.env.DISCORD_TOKEN || process.env.TOKEN,
    forumChannelId: process.env.FORUM_CHANNEL_ID || '1442908992698318950',
    ticketChannelId: process.env.TICKET_CHANNEL_ID || process.env.FORUM_CHANNEL_ID || '1442908992698318950',
    reviewChannelId: process.env.REVIEW_CHANNEL_ID || '1354860460687491183',
    uploadsChannelId: process.env.UPLOADS_CHANNEL_ID || '1354860460687491183',
    staffRoleIds: (process.env.STAFF_ROLE_IDS || '').split(',').filter(Boolean),
    // NEW - Ticket Log Channels
    ticketLogChannelPaid: process.env.TICKET_LOG_CHANNEL_PAID || null,
    ticketLogChannelFree: process.env.TICKET_LOG_CHANNEL_FREE || null,
    screenshotTimeout: 5 * 60 * 1000,
    responseTimeout: 20 * 60 * 1000,
    inactivityTimeout: 10 * 60 * 1000,
    ghostPenalty: 7 * 24 * 60 * 60 * 1000,
    videoGuideUrl: 'https://discord.com/channels/1265271912037089312/1265354035423219823/1444487517737849012',
    steamIdFinderUrl: 'https://discord.com/channels/1310909523715690536/1415060167027982336',
    avgGenerationTime: 30000,
    geminiApiKey: process.env.GEMINI_API_KEY || null,
    groqApiKey: process.env.GROQ_API_KEY || null,
    cloudflareAccountId: process.env.CF_ACCOUNT_ID || null,
    cloudflareToken: process.env.CF_API_TOKEN || null,
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8080/api'
};

// Multi-provider AI verification (Gemini → Groq → Cloudflare → Staff Review)
const aiVerifier = new AIVerifier({
    geminiApiKey: config.geminiApiKey,
    groqApiKey: config.groqApiKey,
    cloudflareAccountId: config.cloudflareAccountId,
    cloudflareToken: config.cloudflareToken
});

// Queue manager for verification and generation queues
const queueManager = require('./utils/queueManager');

// Set up skip Gemini callback - skip when 10+ tickets open
aiVerifier.setShouldSkipGemini(() => {
    const ticketCount = activeTickets.size;
    if (ticketCount >= 10) {
        console.log(`[AIVerifier] High load: ${ticketCount} tickets open, skipping Gemini`);
        return true;
    }
    return false;
});

// ============================================================================
// GAME-SPECIFIC INSTRUCTIONS - Issues #5, #11, #12 FIXED
// Added folderName overrides for verification
// ============================================================================

const gameInstructions = {
    'f1-25': {
        expiryMinutes: 15,
        instructions: `• Extract the content of this zip/rar file to game folder (use WinRAR/7-Zip)
• Replace files
• Run EAANTICHEAT.GAMESERVICELAUNCHER.EXE and game will launch
  OR launch bypass.exe and keep it open >>> launch f1_25.exe

If you experience any issues press the red button below, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'F1 25'
    },
    'f1-25-iconic-edition': {
        expiryMinutes: 15,
        instructions: `• Extract the content of this zip/rar file to game folder (use WinRAR/7-Zip)
• Replace files
• Run EAANTICHEAT.GAMESERVICELAUNCHER.EXE and game will launch
  OR launch bypass.exe and keep it open >>> launch f1_25.exe

If you experience any issues press the red button below, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'F1 25'
    },
    'football-manager-2026': {
        expiryMinutes: 5,
        instructions: `⚠️ NOTE: Wait till the game reaches main menu to respond if it works or not

1. Extract the content of this zip/rar file to game folder (use WinRAR/7-Zip)
2. Replace files
3. Run exe (do NOT run it through Steam)
4. Ping/reply to bartender if it works or you got an error (NOT REPLYING WILL RESULT IN 7 DAY MUTE)

For dummies: DO NOT EXTRACT AS A FOLDER, double-click and open the file I sent you, drag all the files from the rar/zip file into your game folder, and press yes to replace everything.

⚠️ WARNING: IF YOU DON'T USE THIS FILE WITHIN 5 MINUTES, IT WILL EXPIRE.
💡 Incase of "unable to initialize SteamAPI" error try running the exe as admin

If you experience any issues press the red button below, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'Football Manager 2026'
    },
    'football-manager-26': {
        expiryMinutes: 5,
        instructions: `⚠️ NOTE: Wait till the game reaches main menu to respond if it works or not

1. Extract the content of this zip/rar file to game folder (use WinRAR/7-Zip)
2. Replace files
3. Run exe (do NOT run it through Steam)
4. Ping/reply to bartender if it works or you got an error (NOT REPLYING WILL RESULT IN 7 DAY MUTE)

For dummies: DO NOT EXTRACT AS A FOLDER, double-click and open the file I sent you, drag all the files from the rar/zip file into your game folder, and press yes to replace everything.

⚠️ WARNING: IF YOU DON'T USE THIS FILE WITHIN 5 MINUTES, IT WILL EXPIRE.
💡 Incase of "unable to initialize SteamAPI" error try running the exe as admin

If you experience any issues press the red button below, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'Football Manager 2026'
    },
    'football-manager-2025': {
        expiryMinutes: 5,
        instructions: `⚠️ NOTE: Wait till the game reaches main menu to respond if it works or not

1. Extract the content of this zip/rar file to game folder (use WinRAR/7-Zip)
2. Replace files
3. Run exe (do NOT run it through Steam)
4. Ping/reply to bartender if it works or you got an error (NOT REPLYING WILL RESULT IN 7 DAY MUTE)

For dummies: DO NOT EXTRACT AS A FOLDER, double-click and open the file I sent you, drag all the files from the rar/zip file into your game folder, and press yes to replace everything.

⚠️ WARNING: IF YOU DON'T USE THIS FILE WITHIN 5 MINUTES, IT WILL EXPIRE.
💡 Incase of "unable to initialize SteamAPI" error try running the exe as admin

If you experience any issues press the red button below, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'Football Manager 2025'
    },
    'mortal-kombat-1': {
        expiryMinutes: 15,
        instructions: `⚠️ PLEASE USE EITHER 7-Zip OR WinRAR TO EXTRACT THE FILES!

1. Download the .7z attached to message above
2. Extract it inside your game folder. This means that if you right-click on it, choose \`Extract Here\` option, NOT \`Extract to MK1 1971870/\`
3. Run \`MK12.exe\`

💡 If you get an Anti-Tamper error, close it and launch the game AGAIN. If you still get it then probably zip is expired, or out.

**Mods FAQ:**
• You can press \`F1\` to summon MK1Hook menu, feel free to toy around in it.
• You can toggle 60 FPS Unlocker mod from Game Settings -> Graphics. Scroll down to the very end, it will be there.
• In order to unlock characters properly, you need to go into \`Kustomization\` at least once. It will be permanently unlocked afterwards.

If you experience any issues press the red button below, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'Mortal Kombat 1'
    },
    'stellar-blade': {
        expiryMinutes: 15,
        instructions: `🚨 IMPORTANT NOTICE FOR STEAM DECK AND LINUX USERS: IGNORE ALL THESE STEPS!

**For Windows users:**
1. Extract the content of this zip/rar file to game folder (use WinRAR/7-Zip)
2. Replace files
3. RUN DLC.BAT to make a shortcut
4. Run the shortcut (move shortcut to wherever you want)

**If you get PlayStation SDK error:**
• Go to \`\\SB\\Binaries\\Win64\\\`
• Run the \`install_pspc_sdk_runtime.bat\` file

If you experience any issues press the red button below, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'Stellar Blade'
    },
    'the-first-berserker-khazan': {
        expiryMinutes: 15,
        instructions: `1. Extract the content of this zip/rar file to game folder (use WinRAR/7-Zip)
2. Replace files
3. RUN DLC.BAT to make a shortcut
4. Run the shortcut (move shortcut to wherever you want)

If you experience any issues press the red button below, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'The First Berserker Khazan'
    },
    'marvel-midnight-suns': {
        expiryMinutes: 15,
        instructions: `1. Extract the ZIP to your game folder
2. Run DLC.BAT to create a desktop shortcut
3. Launch the game using the shortcut (not the exe directly)

If you experience any issues press the red button below, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: "Marvel's Midnight Suns"
    },
    'demon-slayer-hinokami-chronicles': {
        expiryMinutes: 15,
        instructions: `1. Extract the content of this zip/rar file to game folder (use WinRAR/7-Zip)
2. Replace files
3. Launch the game executable

If you experience any issues press the red button below, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'Demon Slayer -Kimetsu no Yaiba- The Hinokami Chronicles'
    },
    'demon-slayer-hinokami-chronicles-2': {
        expiryMinutes: 15,
        instructions: `1. Extract the content of this zip/rar file to game folder (use WinRAR/7-Zip)
2. Replace files
3. Launch the game executable

If you experience any issues press the red button below and tell staff what the issue is, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'Demon Slayer -Kimetsu no Yaiba- The Hinokami Chronicles 2'
    },
    'sonic-x-shadow-generations': {
        expiryMinutes: 15,
        instructions: `1. Extract in game files
2. Replace files
3. Run \`sonic_x_shadow.exe\`
4. Pick **Shadow**
5. Close game
6. Run again
7. Pick **Sonic**
8. Close game

If you experience any issues press the red button below and tell staff what the issue is, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'Sonic X Shadow Generations'
    },
    'mafia-the-old-country': {
        expiryMinutes: 15,
        instructions: `1. Extract the content of this zip/rar file to game folder (use WinRAR/7-Zip)
2. Replace files
3. Run exe inside \`MafiaTheOldCountry/Binaries/Win64/\`

If you experience any issues press the red button below and tell staff what the issue is, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'Mafia The Old Country'
    },
    'street-fighter-6': {
        expiryMinutes: 15,
        instructions: `1. Extract the ZIP to your game folder using WinRAR or 7-Zip
2. Replace all files when prompted
3. Launch the game executable (NOT through Steam)

**🎮 Unlock all costumes and colors:**
1. Launch game and wait for it to load into main menu
2. Wait for REFramework to pop-up
3. Click on \`Script Generated UI\`
4. Click on \`Unlock Costumes\` then on \`Unlock Colors\`

⚠️ If any dialogs appear, close them! After this process is done, you can close REFramework by clicking on the \`X\` button and resume playing!

If you experience any issues press the red button below and tell staff what the issue is, if it works press the It Works button.`,
        troubleshooting: null,
        folderName: 'Street Fighter 6'
    }
};

const defaultInstructions = {
    expiryMinutes: 15,
    instructions: `1. Extract the ZIP to your game folder using WinRAR or 7-Zip
2. Replace all files when prompted
3. Launch the game executable (NOT through Steam)

If you experience any issues press the red button below and tell staff what the issue is, if it works press the It Works button.`,
    troubleshooting: null
};

// ============================================================================
// CLIENT SETUP
// ============================================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Make client globally accessible for dashboard role checks
global.discordClient = client;

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const activeTickets = new Map();
const activeTimers = new Map();
let queueHelper = null;
const activeQueueWatchers = new Map();
const serverPanels = new Map();

if (process.env.PANEL_MESSAGE_ID && process.env.PANEL_CHANNEL_ID) {
    console.log('[Panel] Legacy panel IDs found in .env - will migrate on first use');
}
const legacyPanelMessageId = process.env.PANEL_MESSAGE_ID || null;
const legacyPanelChannelId = process.env.PANEL_CHANNEL_ID || null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateTicketId() {
    return `TKT-${Date.now().toString(36).toUpperCase()}`;
}

// Issue #5 FIX - Improved game instructions lookup
function getGameInstructions(gameId) {
    if (!gameId) return defaultInstructions;
    
    // Ensure gameId is a string
    gameId = String(gameId);
    
    // Try exact match first
    if (gameInstructions[gameId]) return gameInstructions[gameId];
    
    // Try normalized match (lowercase, replace special chars with dash)
    const normalizedId = gameId.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (gameInstructions[normalizedId]) return gameInstructions[normalizedId];
    
    // Try without numbers at the end (e.g., "f1-25" from "F1 25")
    const withoutSpaces = gameId.toLowerCase().replace(/\s+/g, '-');
    if (gameInstructions[withoutSpaces]) return gameInstructions[withoutSpaces];
    
    // Try common variations
    const variations = [
        normalizedId,
        normalizedId.replace(/®|™/g, ''),
        gameId.toLowerCase().replace(/\s+/g, '-'),
        gameId.toLowerCase().replace(/[^a-z0-9-]/g, ''),
    ];
    
    for (const v of variations) {
        if (gameInstructions[v]) return gameInstructions[v];
    }
    
    return defaultInstructions;
}

function getStaffMention(guildId) {
    if (guildId) {
        const serverRoles = db.getServerStaffRoles(guildId);
        if (serverRoles.length > 0) return serverRoles.map(id => `<@&${id}>`).join(' ');
    }
    if (config.staffRoleIds.length > 0) return config.staffRoleIds.map(id => `<@&${id}>`).join(' ');
    return '@here';
}

// Helper function to get ticket from channel - with database recovery
function getTicketFromChannel(channelId, guildId = null) {
    // First try to find in active tickets
    let ticket = Array.from(activeTickets.values()).find(t => t.threadId === channelId);
    
    if (ticket) return ticket;
    
    // If not in memory, try to recover from database
    try {
        const savedTicket = db.getTicketByThread(channelId);
        if (savedTicket && savedTicket.status !== 'closed') {
            // Recover ticket to memory
            const ticketId = savedTicket.ticket_id;
            activeTickets.set(ticketId, {
                id: ticketId,
                threadId: savedTicket.thread_id,
                channelId: savedTicket.thread_id,
                userId: savedTicket.user_id,
                username: savedTicket.username,
                gameId: savedTicket.game_id,
                gameName: savedTicket.game_name,
                folderName: savedTicket.folder_name,
                guildId: savedTicket.guild_id || guildId,
                isRefill: savedTicket.is_refill || false,
                steamId: savedTicket.steam_id,
                status: savedTicket.status || 'active',
                platform: 'steam',
                isLinuxMac: savedTicket.is_linux_mac || false,
                collectedScreenshots: [],
                helpRequested: savedTicket.help_requested || false,
                activationRequested: savedTicket.activation_requested || false,
                generationInProgress: false,
                tokenReserved: savedTicket.token_reserved || false,
                createdAt: savedTicket.created_at || Date.now()
            });
            ticket = activeTickets.get(ticketId);
            console.log(`[GetTicket] Recovered ticket ${ticketId} from database, status: ${ticket.status}`);
            return ticket;
        }
    } catch (err) {
        console.error('[GetTicket] Recovery error:', err.message);
    }
    
    return null;
}

function isStaff(interaction) {
    if (!interaction.member) return false;
    if (!interaction.member.roles?.cache) return false;
    
    const guildId = interaction.guild?.id;
    if (guildId) {
        const serverRoles = db.getServerStaffRoles(guildId);
        if (serverRoles && serverRoles.length > 0) {
            return serverRoles.some(roleId => interaction.member.roles.cache.has(roleId));
        }
    }
    if (config.staffRoleIds && config.staffRoleIds.length > 0) {
        return config.staffRoleIds.some(roleId => interaction.member.roles.cache.has(roleId));
    }
    return false;
}

function getCooldownHours(member) {
    if (!member) return 48;
    const roles = member.roles.cache;
    if (roles.some(r => r.name.toLowerCase().includes('gold'))) return 0;
    if (roles.some(r => r.name.toLowerCase().includes('silver'))) return 24;
    if (roles.some(r => r.name.toLowerCase().includes('bronze'))) return 24;
    if (roles.some(r => r.name.toLowerCase().includes('donator'))) return 48;
    return 48;
}

function isExemptFromHighDemand(member) {
    if (!member) return false;
    const roles = member.roles.cache;
    return roles.some(r => {
        const name = r.name.toLowerCase();
        return name.includes('gold') || name.includes('silver') || name.includes('bronze') || name.includes('donator');
    });
}

// ============================================================================
// UBISOFT HELPER FUNCTIONS
// ============================================================================

function generateUbisoftTicketId() {
    return `UBI-${Date.now().toString(36).toUpperCase()}`;
}

function isUbisoftTicket(ticketId) {
    return ticketId && ticketId.startsWith('UBI-');
}

function getUbisoftTicketFromChannel(channelId, guildId = null) {
    let ticket = Array.from(activeUbisoftTickets.values()).find(t => t.threadId === channelId);
    if (ticket) return ticket;
    
    // Try database recovery
    try {
        const savedTicket = db.getUbisoftTicketByThread ? db.getUbisoftTicketByThread(channelId) : null;
        if (savedTicket && savedTicket.status !== 'closed') {
            const ticketId = savedTicket.ticket_id;
            activeUbisoftTickets.set(ticketId, {
                id: ticketId,
                threadId: savedTicket.thread_id,
                channelId: savedTicket.thread_id,
                userId: savedTicket.user_id,
                username: savedTicket.username,
                gameId: savedTicket.game_id,
                gameName: savedTicket.game_name,
                guildId: savedTicket.guild_id || guildId,
                status: savedTicket.status || 'active',
                platform: 'ubisoft',
                collectedScreenshots: [],
                helpRequested: savedTicket.help_requested || false,
                tokenRequestContent: null,
                createdAt: savedTicket.created_at || Date.now()
            });
            ticket = activeUbisoftTickets.get(ticketId);
            console.log(`[Ubisoft] Recovered ticket ${ticketId} from database`);
            return ticket;
        }
    } catch (err) {
        console.error('[Ubisoft] Recovery error:', err.message);
    }
    
    return null;
}

// EA ticket getter from channel
function getEATicketFromChannel(channelId, guildId = null) {
    let ticket = Array.from(activeEATickets.values()).find(t => t.threadId === channelId);
    if (ticket) return ticket;
    
    // Try database recovery
    try {
        const savedTicket = db.getEATicketByThread ? db.getEATicketByThread(channelId) : null;
        if (savedTicket && savedTicket.status !== 'closed') {
            const ticketId = savedTicket.ticket_id;
            activeEATickets.set(ticketId, {
                id: ticketId,
                threadId: savedTicket.thread_id,
                channelId: savedTicket.thread_id,
                userId: savedTicket.user_id,
                username: savedTicket.username,
                gameId: savedTicket.game_id,
                gameName: savedTicket.game_name,
                guildId: savedTicket.guild_id || guildId,
                status: savedTicket.status || 'open',
                platform: 'ea',
                collectedScreenshots: [],
                helpRequested: savedTicket.help_requested || false,
                tokenRequestContent: null,
                createdAt: savedTicket.created_at || Date.now()
            });
            ticket = activeEATickets.get(ticketId);
            console.log(`[EA] Recovered ticket ${ticketId} from database`);
            return ticket;
        }
    } catch (err) {
        console.error('[EA] Recovery error:', err.message);
    }
    
    return null;
}

// Universal ticket getter - checks Steam, Ubisoft, and EA
function getAnyTicketFromChannel(channelId, guildId = null) {
    // Try Steam first
    let ticket = getTicketFromChannel(channelId, guildId);
    if (ticket) {
        ticket.platform = 'steam';
        return ticket;
    }
    
    // Try Ubisoft
    ticket = getUbisoftTicketFromChannel(channelId, guildId);
    if (ticket) {
        ticket.platform = 'ubisoft';
        return ticket;
    }
    
    // Try EA
    ticket = getEATicketFromChannel(channelId, guildId);
    if (ticket) {
        ticket.platform = 'ea';
        return ticket;
    }
    
    return null;
}

function setUbisoftTicketTimer(ticketId, type, timer) {
    const key = `ubi_${ticketId}_${type}`;
    if (activeTimers.has(key)) clearTimeout(activeTimers.get(key));
    activeTimers.set(key, timer);
}

function clearUbisoftTicketTimer(ticketId, type) {
    const key = `ubi_${ticketId}_${type}`;
    if (activeTimers.has(key)) {
        clearTimeout(activeTimers.get(key));
        activeTimers.delete(key);
    }
}

function clearAllUbisoftTicketTimers(ticketId) {
    ['screenshot', 'token_request', 'response', 'inactivity', 'success'].forEach(type => {
        clearUbisoftTicketTimer(ticketId, type);
    });
}

// 10 minute screenshot timer for Ubisoft
function startUbisoftScreenshotTimer(ticketId, channel) {
    const timer = setTimeout(async () => {
        const ticket = activeUbisoftTickets.get(ticketId);
        if (!ticket || ticket.status !== 'awaiting_screenshot') return;
        
        await channel.send({
            content: `<@${ticket.userId}>`,
            embeds: [new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⏰ Time\'s Up!')
                .setDescription('No screenshot uploaded within 10 minutes. Ticket closing.')
            ]
        });
        await closeUbisoftTicket(ticketId, 'timeout_screenshot', channel);
    }, ubisoftConfig.screenshotTimeout);
    
    setUbisoftTicketTimer(ticketId, 'screenshot', timer);
}

// 30 minute token request timer for Ubisoft
function startUbisoftTokenRequestTimer(ticketId, channel) {
    const timer = setTimeout(async () => {
        const ticket = activeUbisoftTickets.get(ticketId);
        if (!ticket || ticket.status !== 'awaiting_token_request') return;
        
        await channel.send({
            content: `<@${ticket.userId}>`,
            embeds: [new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⏰ Time\'s Up!')
                .setDescription('No token request file uploaded within 30 minutes. Ticket closing.')
            ]
        });
        await closeUbisoftTicket(ticketId, 'timeout_token_request', channel);
    }, ubisoftConfig.tokenRequestTimeout);
    
    setUbisoftTicketTimer(ticketId, 'token_request', timer);
}

// 30 minute response timer after Ubisoft token sent
function startUbisoftResponseTimer(ticketId, channel) {
    const timer = setTimeout(async () => {
        const ticket = activeUbisoftTickets.get(ticketId);
        if (!ticket || ticket.status !== 'token_sent') return;
        
        await channel.send({
            content: `<@${ticket.userId}>`,
            embeds: [new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⏰ No Response - Ghosted')
                .setDescription('You didn\'t respond after receiving your token.\n\n**7-day cooldown applied.**')
            ]
        });
        
        // Apply cooldown
        db.setCooldown(ticket.userId, ticket.guildId, 'ticket', 168);
        await logCooldownEvent(ticket.guildId, ticket.userId, ticket.username, 'applied', 'ticket', 168, 'System (ghosted)', null);
        
        await closeUbisoftTicket(ticketId, 'ghosted', channel);
    }, ubisoftConfig.responseTimeout);
    
    setUbisoftTicketTimer(ticketId, 'response', timer);
}

// ============================================================================
// TICKET LOGGING SYSTEM - NEW FEATURE
// ============================================================================

async function logTicketEvent(ticket, eventType, details = {}) {
    try {
        const guildId = ticket.guildId;
        const logChannelId = db.getServerTicketLogChannel(guildId);
        
        if (!logChannelId) return;
        
        const channel = await client.channels.fetch(logChannelId).catch(() => null);
        if (!channel) return;
        
        const colors = {
            'opened': 0x00FF00,
            'closed': 0xFF0000,
            'success': 0x00FF00,
            'cancelled': 0xFFA500,
            'timeout': 0xFF6600,
            'ghosted': 0x800080,
            'step_change': 0x5865F2,
            'staff_action': 0xFFFF00
        };
        
        const emojis = {
            'opened': '🎫',
            'closed': '🔒',
            'success': '✅',
            'cancelled': '❌',
            'timeout': '⏰',
            'ghosted': '👻',
            'step_change': '📝',
            'staff_action': '👮'
        };
        
        const stats = db.getTicketStats(guildId);
        const dailyStats = db.getDailyTicketStats(guildId);
        
        const embed = new EmbedBuilder()
            .setColor(colors[eventType] || 0x5865F2)
            .setTitle(`${emojis[eventType] || '📋'} Ticket ${eventType.charAt(0).toUpperCase() + eventType.slice(1).replace('_', ' ')}`)
            .addFields(
                { name: '🎫 Ticket ID', value: ticket.id || 'N/A', inline: true },
                { name: '👤 User', value: `<@${ticket.userId}> (${ticket.username || 'Unknown'})`, inline: true },
                { name: '🎮 Game', value: ticket.gameName || 'Unknown', inline: true }
            )
            .setFooter({ text: `Open: ${stats.open} | Today: ${dailyStats.opened} | Total: ${stats.total}` })
            .setTimestamp();
        
        if (details.reason) embed.addFields({ name: '📝 Reason', value: details.reason, inline: false });
        if (details.staffMember) embed.addFields({ name: '👮 Staff', value: details.staffMember, inline: true });
        if (details.duration) embed.addFields({ name: '⏱️ Duration', value: details.duration, inline: true });
        if (details.step) embed.addFields({ name: '📊 Step', value: details.step, inline: true });
        
        await channel.send({ embeds: [embed] });
        
        // Also log to database for dashboard
        try {
            db.logTicketEvent(
                ticket.id, ticket.guildId, null, ticket.userId, ticket.username,
                ticket.gameId, ticket.gameName, eventType, 
                JSON.stringify(details), details.staffMember, details.staffId, details.durationMinutes
            );
        } catch (dbErr) {
            console.error('[TicketLog] DB log error:', dbErr.message);
        }
        
    } catch (err) {
        console.error('[TicketLog] Error:', err.message);
    }
}

// ============================================================================
// COOLDOWN LOGGING SYSTEM - Discord + Dashboard
// ============================================================================

async function logCooldownEvent(guildId, userId, username, action, cooldownType, hours, staffMember, staffId) {
    try {
        const logChannelId = db.getServerTicketLogChannel(guildId);
        
        // Log to Discord if channel configured
        if (logChannelId) {
            const channel = await client.channels.fetch(logChannelId).catch(() => null);
            if (channel) {
                const colors = {
                    'applied': 0xFF6600,
                    'removed': 0x00FF00,
                    'expired': 0x888888
                };
                
                const emojis = {
                    'applied': '⏱️',
                    'removed': '✅',
                    'expired': '🔓'
                };
                
                const cooldownNames = {
                    'ticket': 'Standard Cooldown',
                    'high_demand': 'High Demand Cooldown'
                };
                
                const embed = new EmbedBuilder()
                    .setColor(colors[action] || 0x5865F2)
                    .setTitle(`${emojis[action] || '⏱️'} Cooldown ${action.charAt(0).toUpperCase() + action.slice(1)}`)
                    .addFields(
                        { name: '👤 User', value: `<@${userId}> (${username})`, inline: true },
                        { name: '📋 Type', value: cooldownNames[cooldownType] || cooldownType, inline: true }
                    )
                    .setTimestamp();
                
                if (hours && action === 'applied') {
                    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
                    embed.addFields({ name: '⏰ Duration', value: `${hours} hours`, inline: true });
                    embed.addFields({ name: '🔓 Expires', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true });
                }
                
                if (staffMember) {
                    embed.addFields({ name: '👮 Staff', value: staffMember, inline: true });
                }
                
                await channel.send({ embeds: [embed] });
            }
        }
        
        // Log to database for dashboard
        try {
            db.logTicketEvent(
                null, guildId, null, userId, username,
                null, null, `cooldown_${action}`,
                JSON.stringify({ cooldownType, hours, action }),
                staffMember, staffId, null
            );
        } catch (dbErr) {
            console.error('[CooldownLog] DB log error:', dbErr.message);
        }
        
    } catch (err) {
        console.error('[CooldownLog] Error:', err.message);
    }
}

// ============================================================================
// HIGH DEMAND PANEL - Auto-updating list of high demand games
// ============================================================================

async function createHighDemandEmbed() {
    const hdGames = db.getHighDemandGames ? db.getHighDemandGames() : [];
    
    let gameList = '';
    if (hdGames.length === 0) {
        gameList = '*No high demand games currently set*';
    } else {
        gameList = hdGames.map((g, i) => {
            const tokens = db.getAvailableTokenCount(g.id);
            const status = tokens > 0 ? '🟢' : '🔴';
            return `${status} **${g.game_name}**`;
        }).join('\n');
    }
    
    const embed = new EmbedBuilder()
        .setColor(0xFF6600)
        .setTitle('🔥 High Demand Games')
        .setDescription(`These games have limited availability and a **7-day cooldown** between activations.\n\n${gameList}`)
        .addFields(
            { name: '⏰ Cooldown', value: '7 days between HD activations', inline: true },
            { name: '📊 Total HD Games', value: `${hdGames.length}`, inline: true }
        )
        .setFooter({ text: `Last updated: ${new Date().toLocaleString()} • Auto-updates every 24 hours` })
        .setTimestamp();
    
    return embed;
}

async function updateAllHighDemandPanels() {
    try {
        const panels = db.getAllHighDemandPanels ? db.getAllHighDemandPanels() : [];
        
        if (panels.length === 0) return;
        
        console.log(`[HighDemand] Updating ${panels.length} high demand panels...`);
        
        const embed = await createHighDemandEmbed();
        
        for (const panel of panels) {
            try {
                const channel = await client.channels.fetch(panel.hd_panel_channel_id).catch(() => null);
                if (!channel) {
                    console.log(`[HighDemand] Channel ${panel.hd_panel_channel_id} not found for guild ${panel.guild_id}`);
                    continue;
                }
                
                try {
                    // Try to edit existing message
                    const message = await channel.messages.fetch(panel.hd_panel_message_id).catch(() => null);
                    if (message) {
                        await message.edit({ embeds: [embed] });
                        console.log(`[HighDemand] Updated panel in guild ${panel.guild_id}`);
                    } else {
                        // Message deleted, create new one
                        const newMessage = await channel.send({ embeds: [embed] });
                        db.setHighDemandPanel(panel.guild_id, channel.id, newMessage.id);
                        console.log(`[HighDemand] Created new panel in guild ${panel.guild_id} (old was deleted)`);
                    }
                } catch (editErr) {
                    // Try sending new message if edit fails
                    const newMessage = await channel.send({ embeds: [embed] });
                    db.setHighDemandPanel(panel.guild_id, channel.id, newMessage.id);
                    console.log(`[HighDemand] Resent panel in guild ${panel.guild_id}`);
                }
            } catch (err) {
                console.error(`[HighDemand] Error updating panel for guild ${panel.guild_id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[HighDemand] Update all panels error:', err.message);
    }
}

// Start 10-minute auto-update timer for high demand panels
let highDemandUpdateInterval = null;
function startHighDemandAutoUpdate() {
    // Update immediately on start
    setTimeout(() => updateAllHighDemandPanels(), 10000); // Wait 10s for bot to be ready
    
    // Then update every 10 minutes
    highDemandUpdateInterval = setInterval(() => {
        updateAllHighDemandPanels();
    }, 10 * 60 * 1000); // 10 minutes
    
    console.log('✅ High demand panel auto-update started (10 min interval)');
}

// ============================================================================
// ACTIVATION LOGGING - Sends to dedicated Discord channel
// ============================================================================

async function logActivation(ticket, duration) {
    try {
        // Log to activation channel if configured
        const activationChannelId = db.getServerActivationLogChannel(ticket.guildId);
        
        if (activationChannelId) {
            const channel = await client.channels.fetch(activationChannelId).catch(() => null);
            if (channel) {
                // Detect platform and get game info
                const platform = ticket.platform || 'steam';
                let game = null;
                let platformEmoji = '🎮';
                let platformName = 'Steam';
                let platformColor = 0x1b2838;
                
                if (platform === 'ubisoft') {
                    game = db.getUbisoftGame ? db.getUbisoftGame(ticket.gameId) : null;
                    platformEmoji = '🔷';
                    platformName = 'Ubisoft';
                    platformColor = 0x0070FF;
                } else if (platform === 'ea') {
                    game = db.getEAGame ? db.getEAGame(ticket.gameId) : null;
                    platformEmoji = '⚽';
                    platformName = 'EA';
                    platformColor = 0xFF4500;
                } else {
                    game = db.getGame(ticket.gameId);
                }
                
                // Get total activations for this user (all platforms)
                const userHistory = db.getAllUserHistory ? db.getAllUserHistory(ticket.userId) : [];
                const userActivations = userHistory.length || 1;
                
                // Get total activations for this game today (platform-specific)
                const today = new Date().toISOString().split('T')[0];
                let gameActivationsToday = 1;
                
                try {
                    if (platform === 'ubisoft') {
                        gameActivationsToday = db.getDatabase().prepare(`
                            SELECT COUNT(*) as count FROM ubisoft_activations 
                            WHERE game_id = ? AND DATE(activated_at) = ?
                        `).get(ticket.gameId, today)?.count || 1;
                    } else if (platform === 'ea') {
                        gameActivationsToday = db.getDatabase().prepare(`
                            SELECT COUNT(*) as count FROM ea_activations 
                            WHERE game_id = ? AND DATE(activated_at) = ?
                        `).get(ticket.gameId, today)?.count || 1;
                    } else {
                        gameActivationsToday = db.getDatabase().prepare(`
                            SELECT COUNT(*) as count FROM ticket_logs 
                            WHERE game_id = ? AND event_type = 'completed' AND DATE(created_at) = ?
                        `).get(ticket.gameId, today)?.count || 1;
                    }
                } catch (e) {}
                
                const embed = new EmbedBuilder()
                    .setColor(platformColor)
                    .setTitle(`${platformEmoji} Game Activated`)
                    .setThumbnail(game?.cover_url || null)
                    .addFields(
                        { name: '👤 User', value: `<@${ticket.userId}>\n\`${ticket.username}\``, inline: true },
                        { name: '🎮 Game', value: ticket.gameName || game?.game_name || 'Unknown', inline: true },
                        { name: '🎯 Platform', value: platformName, inline: true },
                        { name: '⏱️ Duration', value: `${duration} min`, inline: true },
                        { name: '📊 User Total', value: `${userActivations} activations`, inline: true },
                        { name: '📈 Game Today', value: `${gameActivationsToday} today`, inline: true }
                    )
                    .setFooter({ text: `Ticket: ${ticket.id}` })
                    .setTimestamp();
                
                await channel.send({ embeds: [embed] });
            }
        }
    } catch (err) {
        console.error('[ActivationLog] Error:', err.message);
    }
}

// Log staff close actions (cdclose, hdclose) to activation channel
async function logStaffClose(ticket, staffUser, closeType, reason) {
    try {
        const activationChannelId = db.getServerActivationLogChannel(ticket.guildId);
        
        if (activationChannelId) {
            const channel = await client.channels.fetch(activationChannelId).catch(() => null);
            if (channel) {
                // Detect platform and get game info
                const platform = ticket.platform || 'steam';
                let game = null;
                let platformEmoji = '🎮';
                let platformName = 'Steam';
                
                if (platform === 'ubisoft') {
                    game = db.getUbisoftGame ? db.getUbisoftGame(ticket.gameId) : null;
                    platformEmoji = '🔷';
                    platformName = 'Ubisoft';
                } else if (platform === 'ea') {
                    game = db.getEAGame ? db.getEAGame(ticket.gameId) : null;
                    platformEmoji = '⚽';
                    platformName = 'EA';
                } else {
                    game = db.getGame(ticket.gameId);
                }
                
                const colorMap = {
                    'cdclose': 0xFFA500,  // Orange
                    'hdclose': 0xFF4500   // Red-Orange
                };
                
                const titleMap = {
                    'cdclose': `${platformEmoji} Ticket Closed with Cooldown`,
                    'hdclose': `${platformEmoji} Ticket Closed with HD Cooldown`
                };
                
                const embed = new EmbedBuilder()
                    .setColor(colorMap[closeType] || 0xFF0000)
                    .setTitle(titleMap[closeType] || '🚫 Ticket Closed')
                    .setThumbnail(game?.cover_url || null)
                    .addFields(
                        { name: '👤 User', value: `<@${ticket.userId}>\n\`${ticket.username}\``, inline: true },
                        { name: '🎮 Game', value: ticket.gameName || game?.game_name || 'Unknown', inline: true },
                        { name: '🎯 Platform', value: platformName, inline: true },
                        { name: '👮 Staff', value: `<@${staffUser.id}>\n\`${staffUser.username}\``, inline: true },
                        { name: '📋 Action', value: `\`/${closeType}\``, inline: true },
                        { name: '⏰ Cooldown', value: reason, inline: true }
                    )
                    .setFooter({ text: `Ticket: ${ticket.id}` })
                    .setTimestamp();
                
                await channel.send({ embeds: [embed] });
            }
        }
    } catch (err) {
        console.error('[StaffCloseLog] Error:', err.message);
    }
}

// ============================================================================
// END OF PART 1 - Continue to Part 2
// ============================================================================
// ============================================================================
// 🍺 PUB'S BARTENDER BOT V2.1 - COMPLETE FIXED VERSION
// Part 2 of 4 - Panel Creation, Ticket Creation
// ============================================================================

// ============================================================================
// PANEL CREATION
// ============================================================================

async function createPanel(channel, panelType = 'public') {
    if (!channel) {
        console.error('[Panel] Cannot create panel: channel is null');
        return null;
    }
    
    const games = panelType === 'free' ? db.getFreePanelGames() : db.getPaidPanelGames();
    games.sort((a, b) => a.game_name.localeCompare(b.game_name));
    
    const MAX_PER_DROPDOWN = 25, MAX_DROPDOWNS = 4;
    const displayGames = games.slice(0, MAX_PER_DROPDOWN * MAX_DROPDOWNS);
    const numDropdowns = Math.min(MAX_DROPDOWNS, Math.ceil(displayGames.length / MAX_PER_DROPDOWN));
    const baseSize = Math.floor(displayGames.length / numDropdowns);
    const remainder = displayGames.length % numDropdowns;
    
    const chunks = [], chunkLabels = [];
    let gameIndex = 0;
    for (let i = 0; i < numDropdowns; i++) {
        const chunkSize = baseSize + (i < remainder ? 1 : 0);
        const chunkGames = displayGames.slice(gameIndex, gameIndex + chunkSize);
        gameIndex += chunkSize;
        if (chunkGames.length > 0) {
            chunks.push(chunkGames);
            const startLetter = chunkGames[0].game_name[0].toUpperCase();
            const endLetter = chunkGames[chunkGames.length - 1].game_name[0].toUpperCase();
            chunkLabels.push(startLetter === endLetter ? startLetter : `${startLetter}-${endLetter}`);
        }
    }
    
    let totalAvailable = 0, gamesWithTokens = 0, highDemandCount = 0;
    for (const game of games) {
        const available = db.getAvailableTokenCount(game.id);
        if (available > 0) { totalAvailable += available; gamesWithTokens++; }
        if (game.demand_type === 'high') highDemandCount++;
    }
    
    const regenStats = db.getRegenStats();
    const panelTitle = panelType === 'free' ? "🍻 Pub's Free Lounge 🍻" : "🍻 Pub's Premium Lounge 🍻";
    
    const embed = new EmbedBuilder()
        .setColor(0xF4900C)
        .setTitle(panelTitle)
        .setDescription(`*The finest establishment for your gaming needs*\n\n**Select a game from the dropdown below**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        .addFields(
            { name: '🎫 Available', value: `**${totalAvailable}** tokens`, inline: true },
            { name: '🎮 Games', value: `**${gamesWithTokens}**/${games.length}`, inline: true },
            { name: '🔥 High Demand', value: `**${highDemandCount}** games`, inline: true },
            { name: '♻️ Regenerating', value: `**${regenStats.within1h}** in <1h | **${regenStats.within6h}** in <6h`, inline: false },
            { name: '📖 Legend', value: '🔥 High Demand | 🟢 10+ | 🟡 <10 | 🔴 Empty', inline: false }
        )
        .setFooter({ text: `🍺 Pub's Bartender | ${panelType === 'free' ? 'Free' : 'Premium'} Panel` })
        .setTimestamp();
    
    const rows = [];
    for (let i = 0; i < chunks.length; i++) {
        if (chunks[i].length === 0) continue;
        const options = chunks[i].map(game => {
            const available = db.getAvailableTokenCount(game.id);
            let emoji = available >= 10 ? '🟢' : available > 0 ? '🟡' : '🔴';
            if (game.demand_type === 'high') emoji = '🔥';
            return { label: game.game_name.substring(0, 100), value: String(game.id), description: `${available} tokens available`, emoji };
        });
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId(`game_select_${i}`).setPlaceholder(`🎮 ${chunkLabels[i]} (${chunks[i].length})`).addOptions(options.slice(0, 25))
        ));
    }
    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('refresh_panel').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('view_high_demand').setLabel('High Demand').setEmoji('🔥').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('view_rules').setLabel('Rules').setEmoji('📋').setStyle(ButtonStyle.Primary)
    ));
    
    const message = await channel.send({ embeds: [embed], components: rows });
    serverPanels.set(channel.guild.id, { messageId: message.id, channelId: channel.id, type: panelType });
    db.saveServerPanel(channel.guild.id, message.id, channel.id, panelType);
    console.log(`📋 Panel created for guild ${channel.guild.id} (${panelType})`);
    return message;
}

// Issue #2 & #17 FIX - updatePanel now properly refreshes after all ticket actions
async function updatePanel() {
    if (serverPanels.size === 0 && legacyPanelMessageId && legacyPanelChannelId) {
        try {
            const channel = await client.channels.fetch(legacyPanelChannelId);
            if (channel?.guild) serverPanels.set(channel.guild.id, { messageId: legacyPanelMessageId, channelId: legacyPanelChannelId, type: 'free' });
        } catch (e) {}
    }
    if (serverPanels.size === 0) {
        console.log('[Panel] No panels to update (serverPanels is empty)');
        return;
    }
    
    const regenStats = db.getRegenStats();
    for (const [guildId, panelInfo] of serverPanels) {
        try {
            const panelType = panelInfo.type || 'free';
            const games = panelType === 'free' ? db.getFreePanelGames() : db.getPaidPanelGames();
            games.sort((a, b) => a.game_name.localeCompare(b.game_name));
            
            const MAX_PER_DROPDOWN = 25, MAX_DROPDOWNS = 4;
            const displayGames = games.slice(0, MAX_PER_DROPDOWN * MAX_DROPDOWNS);
            const numDropdowns = Math.min(MAX_DROPDOWNS, Math.ceil(displayGames.length / MAX_PER_DROPDOWN));
            const baseSize = Math.floor(displayGames.length / numDropdowns);
            const remainder = displayGames.length % numDropdowns;
            
            const chunks = [], chunkLabels = [];
            let gameIndex = 0;
            for (let i = 0; i < numDropdowns; i++) {
                const chunkSize = baseSize + (i < remainder ? 1 : 0);
                const chunkGames = displayGames.slice(gameIndex, gameIndex + chunkSize);
                gameIndex += chunkSize;
                if (chunkGames.length > 0) {
                    chunks.push(chunkGames);
                    const startLetter = chunkGames[0].game_name[0].toUpperCase();
                    const endLetter = chunkGames[chunkGames.length - 1].game_name[0].toUpperCase();
                    chunkLabels.push(startLetter === endLetter ? startLetter : `${startLetter}-${endLetter}`);
                }
            }
            
            let totalAvailable = 0, gamesWithTokens = 0, highDemandCount = 0;
            for (const game of games) {
                const available = db.getAvailableTokenCount(game.id);
                if (available > 0) { totalAvailable += available; gamesWithTokens++; }
                if (game.demand_type === 'high') highDemandCount++;
            }
            
            const panelTitle = panelType === 'free' ? "🍻 Pub's Free Lounge 🍻" : "🍻 Pub's Premium Lounge 🍻";
            
            const embed = new EmbedBuilder()
                .setColor(0xF4900C)
                .setTitle(panelTitle)
                .setDescription(`*The finest establishment for your gaming needs*\n\n**Select a game from the dropdown below**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
                .addFields(
                    { name: '🎫 Available', value: `**${totalAvailable}** tokens`, inline: true },
                    { name: '🎮 Games', value: `**${gamesWithTokens}**/${games.length}`, inline: true },
                    { name: '🔥 High Demand', value: `**${highDemandCount}** games`, inline: true },
                    { name: '♻️ Regenerating', value: `**${regenStats.within1h}** in <1h | **${regenStats.within6h}** in <6h`, inline: false },
                    { name: '📖 Legend', value: '🔥 High Demand | 🟢 10+ | 🟡 <10 | 🔴 Empty', inline: false }
                )
                .setFooter({ text: `🍺 Pub's Bartender | ${panelType === 'free' ? 'Free' : 'Premium'} Panel` })
                .setTimestamp();
            
            const rows = [];
            for (let i = 0; i < chunks.length; i++) {
                if (chunks[i].length === 0) continue;
                const options = chunks[i].map(game => {
                    const available = db.getAvailableTokenCount(game.id);
                    let emoji = available >= 10 ? '🟢' : available > 0 ? '🟡' : '🔴';
                    if (game.demand_type === 'high') emoji = '🔥';
                    return { label: game.game_name.substring(0, 100), value: String(game.id), description: `${available} tokens available`, emoji };
                });
                rows.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(`game_select_${i}`).setPlaceholder(`🎮 ${chunkLabels[i]} (${chunks[i].length})`).addOptions(options.slice(0, 25))
                ));
            }
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('refresh_panel').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('view_high_demand').setLabel('High Demand').setEmoji('🔥').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('view_rules').setLabel('Rules').setEmoji('📋').setStyle(ButtonStyle.Primary)
            ));
            
            const channel = await client.channels.fetch(panelInfo.channelId);
            const message = await channel.messages.fetch(panelInfo.messageId);
            await message.edit({ embeds: [embed], components: rows });
            console.log(`[Panel] Updated for guild ${guildId}: ${totalAvailable} tokens available`);
        } catch (err) {
            console.error(`[Panel] Update error for guild ${guildId}:`, err.message);
            if (err.code === 10008 || err.code === 10003) serverPanels.delete(guildId);
        }
    }
}

// ============================================================================
// UBISOFT PANEL CREATION
// ============================================================================

async function createUbisoftPanel(channel, panelType = 'free') {
    try {
        const games = panelType === 'free' 
            ? db.getUbisoftGamesByPanel('free') 
            : db.getUbisoftGamesByPanel('paid');
        
        if (!games || games.length === 0) {
            return channel.send(`No ${panelType} Ubisoft games available.`);
        }
        
        games.sort((a, b) => a.game_name.localeCompare(b.game_name));
        
        let totalAvailable = 0, gamesWithTokens = 0, highDemandCount = 0;
        for (const game of games) {
            const available = db.getAvailableUbisoftTokenCount(game.id);
            if (available > 0) { totalAvailable += available; gamesWithTokens++; }
            if (game.demand_type === 'high') highDemandCount++;
        }
        
        const options = games.map(game => {
            const available = db.getAvailableUbisoftTokenCount(game.id);
            let emoji = available >= 10 ? '🟢' : available > 0 ? '🟡' : '🔴';
            if (game.demand_type === 'high') emoji = '🔥';
            return {
                label: game.game_name.substring(0, 100),
                description: `${available} tokens available`,
                value: `ubisoft_game_${game.id}`,
                emoji
            };
        });
        
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`ubisoft_panel_${panelType}_0`)
            .setPlaceholder('🎯 Select a Ubisoft game...')
            .addOptions(options.slice(0, 25));
        
        const panelTitle = panelType === 'free' ? "🎯 Ubisoft Free Games" : "🎯 Ubisoft Premium Games";
        
        const embed = new EmbedBuilder()
            .setColor(panelType === 'free' ? 0x00ff00 : 0xffd700)
            .setTitle(panelTitle)
            .setDescription(`*Select a game from the dropdown below*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
            .addFields(
                { name: '🎫 Available', value: `**${totalAvailable}** tokens`, inline: true },
                { name: '🎮 Games', value: `**${gamesWithTokens}**/${games.length}`, inline: true },
                { name: '🔥 High Demand', value: `**${highDemandCount}** games`, inline: true },
                { name: '📖 Legend', value: '🔥 High Demand | 🟢 10+ | 🟡 <10 | 🔴 Empty', inline: false }
            )
            .setFooter({ text: `🎯 Ubisoft Token System | ${panelType === 'free' ? 'Free' : 'Premium'} Panel` })
            .setTimestamp();
        
        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ubisoft_refresh_panel').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('ubisoft_view_rules').setLabel('Rules').setEmoji('📋').setStyle(ButtonStyle.Primary)
        );
        
        const message = await channel.send({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(menu), buttonRow]
        });
        
        ubisoftPanels.set(channel.guild.id, { messageId: message.id, channelId: channel.id, type: panelType });
        if (db.saveUbisoftPanel) {
            db.saveUbisoftPanel(channel.guild.id, message.id, channel.id, panelType);
        }
        
        console.log(`[Ubisoft] Created ${panelType} panel with ${games.length} games`);
        return message;
        
    } catch (error) {
        console.error('[Ubisoft] Error creating panel:', error);
    }
}

async function updateUbisoftPanel() {
    if (ubisoftPanels.size === 0) {
        try {
            const panels = db.getAllUbisoftPanels ? db.getAllUbisoftPanels() : [];
            for (const panel of panels) {
                ubisoftPanels.set(panel.guild_id, {
                    messageId: panel.panel_message_id,
                    channelId: panel.panel_channel_id,
                    type: panel.panel_type || 'free'
                });
            }
        } catch (e) {}
    }
    
    if (ubisoftPanels.size === 0) return;
    
    for (const [guildId, panelInfo] of ubisoftPanels) {
        try {
            const panelType = panelInfo.type || 'free';
            const games = panelType === 'free' 
                ? db.getUbisoftGamesByPanel('free') 
                : db.getUbisoftGamesByPanel('paid');
            
            if (!games || games.length === 0) continue;
            
            games.sort((a, b) => a.game_name.localeCompare(b.game_name));
            
            let totalAvailable = 0, gamesWithTokens = 0, highDemandCount = 0;
            for (const game of games) {
                const available = db.getAvailableUbisoftTokenCount(game.id);
                if (available > 0) { totalAvailable += available; gamesWithTokens++; }
                if (game.demand_type === 'high') highDemandCount++;
            }
            
            const options = games.map(game => {
                const available = db.getAvailableUbisoftTokenCount(game.id);
                let emoji = available >= 10 ? '🟢' : available > 0 ? '🟡' : '🔴';
                if (game.demand_type === 'high') emoji = '🔥';
                return {
                    label: game.game_name.substring(0, 100),
                    description: `${available} tokens available`,
                    value: `ubisoft_game_${game.id}`,
                    emoji
                };
            });
            
            const menu = new StringSelectMenuBuilder()
                .setCustomId(`ubisoft_panel_${panelType}_0`)
                .setPlaceholder('🎯 Select a Ubisoft game...')
                .addOptions(options.slice(0, 25));
            
            const panelTitle = panelType === 'free' ? "🎯 Ubisoft Free Games" : "🎯 Ubisoft Premium Games";
            
            const embed = new EmbedBuilder()
                .setColor(panelType === 'free' ? 0x00ff00 : 0xffd700)
                .setTitle(panelTitle)
                .setDescription(`*Select a game from the dropdown below*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
                .addFields(
                    { name: '🎫 Available', value: `**${totalAvailable}** tokens`, inline: true },
                    { name: '🎮 Games', value: `**${gamesWithTokens}**/${games.length}`, inline: true },
                    { name: '🔥 High Demand', value: `**${highDemandCount}** games`, inline: true },
                    { name: '📖 Legend', value: '🔥 High Demand | 🟢 10+ | 🟡 <10 | 🔴 Empty', inline: false }
                )
                .setFooter({ text: `🎯 Ubisoft Token System | ${panelType === 'free' ? 'Free' : 'Premium'} Panel` })
                .setTimestamp();
            
            const buttonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ubisoft_refresh_panel').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ubisoft_view_rules').setLabel('Rules').setEmoji('📋').setStyle(ButtonStyle.Primary)
            );
            
            const channel = await client.channels.fetch(panelInfo.channelId);
            const message = await channel.messages.fetch(panelInfo.messageId);
            await message.edit({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(menu), buttonRow]
            });
            
        } catch (err) {
            console.error(`[Ubisoft Panel] Update error for ${guildId}:`, err.message);
            if (err.code === 10008 || err.code === 10003) ubisoftPanels.delete(guildId);
        }
    }
}

// ============================================================================
// UBISOFT TICKET CREATION
// Flow: Screenshots → Instructions/Download → User uploads token_request.txt → Queue → Token
// ============================================================================

async function createUbisoftTicket(interaction, gameId) {
    try {
        await interaction.deferReply({ ephemeral: true });
    } catch (e) {
        return;
    }
    
    const game = db.getUbisoftGame(gameId);
    if (!game) {
        return interaction.editReply({ content: '❌ Game not found.' });
    }
    
    // Server membership check (same as Steam)
    const MAIN_SERVER_ID = process.env.MAIN_SERVER_ID || '1265271912037089312';
    const PAID_SERVER_ID = process.env.PAID_SERVER_ID || '1265025550485950634';
    const FREE_SERVER_ID = process.env.FREE_SERVER_ID || '1310909523715690536';
    
    let isInMainServer = false, isInPaidServer = false, isInFreeServer = false;
    
    try {
        const mainGuild = await client.guilds.fetch(MAIN_SERVER_ID).catch(() => null);
        if (mainGuild) {
            const mainMember = await mainGuild.members.fetch(interaction.user.id).catch(() => null);
            isInMainServer = !!mainMember;
        }
        
        const paidGuild = await client.guilds.fetch(PAID_SERVER_ID).catch(() => null);
        if (paidGuild) {
            const paidMember = await paidGuild.members.fetch(interaction.user.id).catch(() => null);
            isInPaidServer = !!paidMember;
        }
        
        const freeGuild = await client.guilds.fetch(FREE_SERVER_ID).catch(() => null);
        if (freeGuild) {
            const freeMember = await freeGuild.members.fetch(interaction.user.id).catch(() => null);
            isInFreeServer = !!freeMember;
        }
    } catch (err) {
        console.log(`[Ubisoft] Server check error: ${err.message}`);
    }
    
    if (!isInMainServer) {
        return interaction.editReply({ content: '❌ **Main Server Required**\n\nJoin the main server first!' });
    }
    
    if (!isInPaidServer && !isInFreeServer) {
        return interaction.editReply({ content: '❌ **Tier Server Required**\n\nJoin Paid or Free server!' });
    }
    
    // Check timeout
    if (interaction.member?.communicationDisabledUntil) {
        const timeoutEnd = new Date(interaction.member.communicationDisabledUntil);
        if (timeoutEnd > new Date()) {
            return interaction.editReply({ content: '❌ **You have a timeout**\n\nTry again later.' });
        }
    }
    
    // Check existing ticket
    const existingTicket = db.getUbisoftUserOpenTicket ? db.getUbisoftUserOpenTicket(interaction.user.id, interaction.guild.id) : null;
    if (existingTicket) {
        return interaction.editReply({ content: '❌ You already have an open Ubisoft ticket!' });
    }
    
    // PER-GAME 24-HOUR COOLDOWN (Anti-Reseller - No exceptions)
    const gameCooldown = db.checkGameCooldown(interaction.user.id, gameId, 'ubisoft');
    if (gameCooldown) {
        const expiresAt = new Date(gameCooldown.expires_at);
        return interaction.editReply({ 
            content: `❌ **Game Cooldown Active**\n\nYou already requested **${game.game_name}** recently.\n\n⏰ You can request this game again <t:${Math.floor(expiresAt.getTime() / 1000)}:R>\n\n💡 You can still request **other games** while on cooldown for this one.` 
        });
    }
    
    // SHARED COOLDOWN CHECK
    const cooldown = db.getUniversalCooldown(interaction.user.id, 'ticket');
    if (cooldown) {
        const expiresAt = new Date(cooldown.expires_at);
        return interaction.editReply({ 
            content: `❌ **Cooldown Active!**\n\nYou have a cooldown (applies to Steam & Ubisoft).\nTry again <t:${Math.floor(expiresAt.getTime() / 1000)}:R>` 
        });
    }
    
    // High demand cooldown check
    if (game.demand_type === 'high') {
        const hdCooldown = db.getUniversalCooldown(interaction.user.id, 'high_demand');
        if (hdCooldown) {
            const expiresAt = new Date(hdCooldown.expires_at);
            return interaction.editReply({ 
                content: `🔥 **HD Cooldown Active!**\n\nTry again <t:${Math.floor(expiresAt.getTime() / 1000)}:R>\n\n💡 You can still request normal games!` 
            });
        }
    }
    
    // Check tokens
    const available = db.getAvailableUbisoftTokenCount(gameId);
    if (available <= 0) {
        return interaction.editReply({ content: `❌ No tokens for **${game.game_name}**.` });
    }
    
    // Generate ticket ID first so we can reserve token
    const ticketId = generateUbisoftTicketId();
    
    // Reserve token BEFORE creating thread
    const reserveResult = db.reserveUbisoftToken ? db.reserveUbisoftToken(gameId, ticketId) : null;
    if (!reserveResult || !reserveResult.success) {
        return interaction.editReply({ content: `❌ Failed to reserve token for **${game.game_name}**.` });
    }
    console.log(`[Ubisoft] Reserved token for ticket ${ticketId}: ${reserveResult.accountEmail}`);
    
    try {
        // Use the forum/ticket channel from server settings or config
        const serverTicketChannelId = db.getUbisoftTicketChannel ? db.getUbisoftTicketChannel(interaction.guild.id) : null;
        const configChannelId = config.ticketChannelId || config.forumChannelId;
        
        // Try to find a valid ticket channel
        let ticketChannel = null;
        let ticketChannelId = null;
        
        // Try server-specific channel first
        if (serverTicketChannelId) {
            try {
                ticketChannel = await client.channels.fetch(serverTicketChannelId).catch(() => null);
                if (ticketChannel) ticketChannelId = serverTicketChannelId;
            } catch (e) {
                console.log(`[Ubisoft] Server ticket channel ${serverTicketChannelId} not found`);
            }
        }
        
        // Try config channel
        if (!ticketChannel && configChannelId) {
            try {
                ticketChannel = await client.channels.fetch(configChannelId).catch(() => null);
                if (ticketChannel) ticketChannelId = configChannelId;
            } catch (e) {
                console.log(`[Ubisoft] Config ticket channel ${configChannelId} not found`);
            }
        }
        
        // Fallback: use the current channel if it supports threads
        if (!ticketChannel) {
            ticketChannel = interaction.channel;
            ticketChannelId = interaction.channel.id;
            console.log(`[Ubisoft] Using current channel ${ticketChannelId} as fallback`);
        }
        
        if (!ticketChannel) {
            if (db.releaseUbisoftToken) db.releaseUbisoftToken(ticketId);
            return interaction.editReply({ content: '❌ No valid ticket channel found. Please contact staff.' });
        }
        
        if (ticketChannel.guild?.id !== interaction.guild.id) {
            // Release reserved token on error
            if (db.releaseUbisoftToken) db.releaseUbisoftToken(ticketId);
            return interaction.editReply({ content: '❌ Ticket channel not configured for this server. Run `/ubisoft-setup`.' });
        }
        
        console.log(`[Ubisoft] Using ticket channel: ${ticketChannelId} (${ticketChannel.name || 'unknown'})`);
        
        const isHighDemand = game.demand_type === 'high';
        
        // STEP 1: Ask for screenshots (10 min timer)
        const embed = new EmbedBuilder()
            .setColor(isHighDemand ? 0xFF6600 : 0x5865F2)
            .setTitle(`🎯 ${game.game_name}`)
            .setDescription(`Welcome **${interaction.user.username}**!\n\n${isHighDemand ? '🔥 **HIGH DEMAND GAME**\n\n' : ''}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📸 **Step 1: Upload Screenshots**`)
            .addFields(
                { name: '📋 Required', value: '• Game folder properties (showing size)\n• Windows Update Blocker (showing DISABLED - red X)\n• Proof of legitimate installation', inline: false },
                { name: '⏱️ Time Limit', value: '10 minutes', inline: true },
                { name: '📦 Expected Size', value: game.size_gb ? `~${game.size_gb} GB` : 'Any size', inline: true }
            )
            .setFooter({ text: `Ticket: ${ticketId} | Platform: Ubisoft` })
            .setTimestamp();
        
        if (game.cover_url) embed.setThumbnail(game.cover_url);
        
        let thread;
        if (ticketChannel.type === ChannelType.GuildForum) {
            thread = await ticketChannel.threads.create({
                name: `🎯 ${interaction.user.username} | ${game.game_name}`,
                autoArchiveDuration: 1440,
                message: { content: `<@${interaction.user.id}>`, embeds: [embed] }
            });
        } else {
            thread = await ticketChannel.threads.create({
                name: `🎯 ${interaction.user.username} | ${game.game_name}`,
                autoArchiveDuration: 1440,
                type: ChannelType.PrivateThread,
                invitable: false,
                reason: `Ubisoft Ticket for ${interaction.user.username}`
            });
            await thread.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });
            await thread.members.add(interaction.user.id);
        }
        
        // Cancel/Help buttons
        const screenshotButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ubisoft_early_help_${ticketId}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ubisoft_close_ticket_${ticketId}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
        );
        await thread.send({ components: [screenshotButtons] });
        
        const ticketData = {
            id: ticketId,
            threadId: thread.id,
            channelId: thread.id,
            userId: interaction.user.id,
            username: interaction.user.username,
            gameId,
            gameName: game.game_name,
            guildId: interaction.guild.id,
            status: 'awaiting_screenshot',
            platform: 'ubisoft',
            collectedScreenshots: [],
            helpRequested: false,
            tokenRequestContent: null,
            tokenReserved: true,
            reservedTokenId: reserveResult.tokenId,
            createdAt: Date.now()
        };
        
        activeUbisoftTickets.set(ticketId, ticketData);
        console.log(`[Ubisoft] Ticket ${ticketId} added to activeUbisoftTickets map. Total: ${activeUbisoftTickets.size}`);
        
        // Save to database
        if (db.createUbisoftTicket) {
            db.createUbisoftTicket(ticketId, thread.id, interaction.guild.id, interaction.user.id, interaction.user.username, gameId);
        }
        
        startUbisoftScreenshotTimer(ticketId, thread);
        
        // Log ticket opened
        await logTicketEvent(ticketData, 'opened', { reason: 'User opened Ubisoft ticket', platform: 'ubisoft' });
        
        // Update panel to show reserved token
        updateUbisoftPanel();
        
        await interaction.editReply({ content: `✅ Ubisoft ticket created! Head to ${thread}` });
        
    } catch (err) {
        console.error('[Ubisoft] Ticket creation error:', err);
        // Release reserved token on error
        if (db.releaseUbisoftToken) db.releaseUbisoftToken(ticketId);
        await interaction.editReply({ content: '❌ Failed to create ticket.' }).catch(() => {});
    }
}

// ============================================================================
// UBISOFT SCREENSHOT HANDLING
// ============================================================================

async function handleUbisoftScreenshot(message) {
    const ticket = Array.from(activeUbisoftTickets.values()).find(t => 
        t.threadId === message.channel.id && message.author.id === t.userId
    );
    
    if (!ticket || ticket.status !== 'awaiting_screenshot') return;
    
    const images = message.attachments.filter(a => 
        a.contentType?.startsWith('image/') || 
        /\.(png|jpg|jpeg|gif|webp)$/i.test(a.name)
    );
    
    if (images.size === 0) return;
    
    images.forEach(img => {
        if (ticket.collectedScreenshots.length < 4) {
            ticket.collectedScreenshots.push(img.url);
        }
    });
    
    console.log(`[Ubisoft] Collected ${ticket.collectedScreenshots.length} screenshot(s) for ${ticket.id}`);
    
    if (ticket.collectedScreenshots.length >= 1) {
        clearUbisoftTicketTimer(ticket.id, 'screenshot');
        
        // Show submit button
        const submitEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📸 Screenshots Received')
            .setDescription(`Collected **${ticket.collectedScreenshots.length}** screenshot(s).\n\nClick **Submit** to proceed or upload more.`)
            .setFooter({ text: 'Max 4 screenshots' });
        
        const submitButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ubisoft_submit_screenshots_${ticket.id}`).setLabel('Submit for Review').setEmoji('✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ubisoft_clear_screenshots_${ticket.id}`).setLabel('Clear & Retry').setEmoji('🗑️').setStyle(ButtonStyle.Secondary)
        );
        
        const submitMsg = await message.channel.send({ embeds: [submitEmbed], components: [submitButtons] });
        ticket.submitMessageId = submitMsg.id;
    }
}

// ============================================================================
// UBISOFT INSTRUCTIONS & DOWNLOAD
// ============================================================================

async function showUbisoftInstructionsAndDownload(interaction, ticket, game) {
    clearUbisoftTicketTimer(ticket.id, 'screenshot');
    
    ticket.status = 'awaiting_token_request';
    
    // Handle case where game is null
    if (!game) {
        game = { game_name: ticket.gameName || 'Unknown Game', download_links: null, instructions: null, cover_url: null };
    }
    
    // Get download links and instructions from game data
    let downloadLinks = game.download_links || 'No download links configured.';
    let instructions = game.instructions || getDefaultUbisoftInstructions(game.game_name);
    
    // Discord embed field limit is 1024 characters - truncate or send separately
    const maxFieldLength = 1000;
    const instructionsTooLong = instructions.length > maxFieldLength;
    const downloadLinksTooLong = downloadLinks.length > maxFieldLength;
    
    const instructionsEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`📥 ${game.game_name} - Download & Instructions`)
        .setDescription(`**Step 2: Download Files & Generate Token Request**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        .addFields(
            { name: '⏱️ Next Step', value: 'After following the instructions, upload the generated `token_req_####.txt` file here.\n\n**Time Limit: 30 minutes**', inline: false }
        )
        .setFooter({ text: `Ticket: ${ticket.id} | Awaiting token_request.txt` })
        .setTimestamp();
    
    // Only add fields if they fit, otherwise send as separate messages
    if (!downloadLinksTooLong) {
        instructionsEmbed.addFields({ name: '📥 Download Links', value: downloadLinks.substring(0, maxFieldLength), inline: false });
    }
    if (!instructionsTooLong) {
        instructionsEmbed.addFields({ name: '📋 Instructions', value: instructions.substring(0, maxFieldLength), inline: false });
    }
    
    if (game.cover_url) instructionsEmbed.setThumbnail(game.cover_url);
    
    const helpButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ubisoft_early_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ubisoft_close_ticket_${ticket.id}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
    );
    
    await interaction.channel.send({ content: `<@${ticket.userId}>`, embeds: [instructionsEmbed], components: [helpButtons] });
    
    // Send long content as separate messages
    if (downloadLinksTooLong) {
        await interaction.channel.send({ content: `**📥 Download Links:**\n${downloadLinks}` });
    }
    if (instructionsTooLong) {
        // Split long instructions into chunks
        const chunks = [];
        let remaining = instructions;
        while (remaining.length > 1900) {
            let splitAt = remaining.lastIndexOf('\n', 1900);
            if (splitAt === -1) splitAt = 1900;
            chunks.push(remaining.substring(0, splitAt));
            remaining = remaining.substring(splitAt);
        }
        if (remaining.length > 0) chunks.push(remaining);
        
        for (let i = 0; i < chunks.length; i++) {
            await interaction.channel.send({ content: i === 0 ? `**📋 Instructions:**\n${chunks[i]}` : chunks[i] });
        }
    }
    
    // Start 30 minute timer for token request
    startUbisoftTokenRequestTimer(ticket.id, interaction.channel);
    
    await logTicketEvent(ticket, 'step_change', { step: 'Instructions shown, awaiting token_request.txt', platform: 'ubisoft' });
}

function getDefaultUbisoftInstructions(gameName) {
    return `\`\`\`
1. Download and extract the setup files
2. Follow the included README
3. Run the token generator tool
4. Upload the generated token_req_####.txt here
\`\`\`

⚠️ **Important:**
• Never launch the game through Ubisoft Connect
• Never update the game files`;
}

// ============================================================================
// UBISOFT TOKEN REQUEST FILE HANDLING
// ============================================================================

async function handleUbisoftTokenRequestFile(message) {
    const ticket = Array.from(activeUbisoftTickets.values()).find(t => 
        t.threadId === message.channel.id && message.author.id === t.userId
    );
    
    if (!ticket) return;
    if (ticket.status !== 'awaiting_token_request') return;
    
    // Look for .txt attachment
    const txtFile = message.attachments.find(a => a.name?.toLowerCase().endsWith('.txt'));
    if (!txtFile) return;
    
    // Download and read the file content
    try {
        const response = await fetch(txtFile.url);
        const content = await response.text();
        
        if (!content || content.trim().length < 10) {
            await message.reply({ content: '❌ The txt file appears to be empty or invalid. Please upload a valid token request file.' });
            return;
        }
        
        // Stop the token request timer
        clearUbisoftTicketTimer(ticket.id, 'token_request');
        
        ticket.tokenRequestContent = content.trim();
        ticket.status = 'in_queue';
        
        // Add to FIFO queue
        const queueEntry = {
            ticketId: ticket.id,
            channel: message.channel,
            addedAt: Date.now()
        };
        
        ubisoftTokenQueue.push(queueEntry);
        const position = ubisoftTokenQueue.length;
        ticket.queuePosition = position;
        
        console.log(`[Ubisoft] Ticket ${ticket.id} added to queue at position ${position}`);
        
        // Show queue status
        const queueEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📥 Token Request Received!')
            .setDescription(`Your request has been added to the queue.`)
            .addFields(
                { name: '📊 Queue Position', value: `**#${position}**`, inline: true },
                { name: '⏱️ Estimated Wait', value: `~${position * 2} minutes`, inline: true }
            )
            .setFooter({ text: 'Processing in order...' });
        
        await message.reply({ embeds: [queueEmbed] });
        
        await logTicketEvent(ticket, 'step_change', { step: `Added to queue at position ${position}`, platform: 'ubisoft' });
        
        // Process queue if not already processing
        processUbisoftTokenQueue();
        
    } catch (err) {
        console.error('[Ubisoft] Error reading token request file:', err);
        await message.reply({ content: '❌ Error reading the file. Please try uploading again.' });
    }
}

// ============================================================================
// UBISOFT FIFO QUEUE PROCESSING
// ============================================================================

async function processUbisoftTokenQueue() {
    if (isProcessingUbisoftQueue) return;
    if (ubisoftTokenQueue.length === 0) return;
    
    isProcessingUbisoftQueue = true;
    
    while (ubisoftTokenQueue.length > 0) {
        const entry = ubisoftTokenQueue[0];
        const ticket = activeUbisoftTickets.get(entry.ticketId);
        
        if (!ticket) {
            ubisoftTokenQueue.shift();
            continue;
        }
        
        // Update queue positions for remaining tickets
        ubisoftTokenQueue.forEach((e, i) => {
            const t = activeUbisoftTickets.get(e.ticketId);
            if (t) t.queuePosition = i + 1;
        });
        
        ticket.status = 'processing';
        
        // Notify user processing started
        const processingEmbed = new EmbedBuilder()
            .setColor(0xFFFF00)
            .setTitle('⚡ Processing Your Request...')
            .setDescription('Generating your token. This may take 1-2 minutes.')
            .addFields({ name: '🎮 Game', value: ticket.gameName, inline: true });
        
        try {
            await entry.channel.send({ content: `<@${ticket.userId}>`, embeds: [processingEmbed] });
        } catch (e) {
            console.error('[Ubisoft] Error sending processing message:', e.message);
        }
        
        // Generate token
        const result = await generateUbisoftToken(ticket);
        
        if (result.success) {
            ticket.status = 'token_sent';
            
            const game = db.getUbisoftGame(ticket.gameId);
            
            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🎉 Your Token is Ready!')
                .setDescription('Download the token file below and follow the usage instructions.')
                .addFields(
                    { name: '📋 Usage', value: '1. Download dbdata.json, & paste into game files (Beside exe file).\n`Make sure it DOES NOT have (1) in its file name, just dbdata`\n2. DO NOT Rename or Delete Anything.\n3. Launch the game from Game.exe in game files (NOT through Ubisoft Connect or Steam).\n4. Enjoy! & Drop a Review.', inline: false },
                    { name: '⏱️ Response Required', value: 'Please click a button below within 30 minutes', inline: false }
                );
            
            if (game?.cover_url) successEmbed.setThumbnail(game.cover_url);
            
            const responseButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ubisoft_it_works_${ticket.id}`).setLabel('It Works!').setEmoji('✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`ubisoft_need_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger)
            );
            
            try {
                await entry.channel.send({
                    content: `<@${ticket.userId}> 🎉 **Token ready!**`,
                    embeds: [successEmbed],
                    components: [responseButtons]
                });
                
                // Send the token file
                if (result.tokenFile && fs.existsSync(result.tokenFile)) {
                    await entry.channel.send({ 
                        content: '📁 **Your Token File:**', 
                        files: [result.tokenFile] 
                    });
                }
            } catch (e) {
                console.error('[Ubisoft] Error sending token:', e.message);
            }
            
            await logTicketEvent(ticket, 'step_change', { step: 'Token sent', platform: 'ubisoft' });
            
            // Set per-game 24h cooldown immediately when token is delivered (anti-reseller)
            db.setGameCooldown(ticket.userId, ticket.gameId, 'ubisoft', 24);
            
            // Start 30 minute response timer
            startUbisoftResponseTimer(ticket.id, entry.channel);
            
            // Update panel
            await updateUbisoftPanel();
            
        } else {
            // Generation failed - handle retry logic
            ticket.retryCount = (ticket.retryCount || 0) + 1;
            ticket.failedAccounts = ticket.failedAccounts || [];
            
            // Track failed account if we should try different one
            if (result.tryDifferentAccount && result.accountUsed) {
                ticket.failedAccounts.push(result.accountUsed);
                console.log(`[Ubisoft] Added ${result.accountUsed} to failed accounts list. Total failed: ${ticket.failedAccounts.length}`);
            }
            
            const maxRetries = 6;
            
            if (ticket.retryCount >= maxRetries) {
                // Too many retries - notify staff
                ticket.status = 'generation_failed';
                try {
                    await entry.channel.send({
                        content: `${getStaffMention(ticket.guildId)} <@${ticket.userId}>`,
                        embeds: [new EmbedBuilder()
                            .setColor(0xFF0000)
                            .setTitle('❌ Generation Failed')
                            .setDescription(`**Error:** ${result.error}\n\nMultiple attempts (${maxRetries}) failed. Staff has been notified.`)
                        ]
                    });
                } catch (e) {}
                await logTicketEvent(ticket, 'step_change', { step: 'Generation failed after max retries', error: result.error, platform: 'ubisoft' });
            } else if (result.tryDifferentAccount) {
                // Try a different account automatically
                console.log(`[Ubisoft] Trying different account for ticket ${ticket.id}...`);
                
                // Release current reserved token
                if (db.releaseUbisoftToken) {
                    db.releaseUbisoftToken(ticket.id);
                }
                
                // Try to reserve a different token (excluding failed accounts)
                const newToken = db.getAvailableUbisoftTokenExcluding ? 
                    db.getAvailableUbisoftTokenExcluding(ticket.gameId, ticket.failedAccounts) :
                    db.getAvailableUbisoftToken(ticket.gameId);
                
                if (newToken && !ticket.failedAccounts.includes(newToken.email)) {
                    // Reserve the new token
                    if (db.reserveUbisoftTokenById) {
                        db.reserveUbisoftTokenById(newToken.id, ticket.id);
                    }
                    ticket.reservedTokenId = newToken.id;
                    
                    try {
                        const retryEmbed = new EmbedBuilder()
                            .setColor(0xFFA500)
                            .setTitle('🔄 Trying Different Account')
                            .setDescription(`**Previous Error:** ${result.error}\n\nSwitching to a different account and retrying automatically...\n\nAttempt ${ticket.retryCount}/${maxRetries}`)
                            .setFooter({ text: 'Please wait...' });
                        
                        await entry.channel.send({
                            content: `<@${ticket.userId}>`,
                            embeds: [retryEmbed]
                        });
                    } catch (e) {}
                    
                    // Re-add to queue for automatic retry
                    ticket.status = 'in_queue';
                    ubisoftTokenQueue.push({
                        ticketId: ticket.id,
                        channel: entry.channel,
                        addedAt: Date.now()
                    });
                    
                    await logTicketEvent(ticket, 'step_change', { step: `Switching account, retry ${ticket.retryCount}/${maxRetries}`, error: result.error, newAccount: newToken.email, platform: 'ubisoft' });
                } else {
                    // No more accounts available - ask user for new token_req
                    ticket.status = 'awaiting_token_request';
                    try {
                        const retryEmbed = new EmbedBuilder()
                            .setColor(0xFFA500)
                            .setTitle('⚠️ No More Accounts Available')
                            .setDescription(`**Error:** ${result.error}\n\nAll available accounts have been tried.\n\n**Please try again:**\n1. Generate a new \`token_req_####.txt\` file\n2. Upload it here\n\nAttempt ${ticket.retryCount}/${maxRetries}`)
                            .setFooter({ text: 'Staff will be notified if this continues to fail' });
                        
                        await entry.channel.send({
                            content: `<@${ticket.userId}>`,
                            embeds: [retryEmbed]
                        });
                    } catch (e) {}
                    
                    startUbisoftTokenRequestTimer(ticket.id, entry.channel);
                    await logTicketEvent(ticket, 'step_change', { step: `No more accounts, awaiting new token_req ${ticket.retryCount}/${maxRetries}`, error: result.error, platform: 'ubisoft' });
                }
            } else {
                // Same account can retry - ask user to upload new token_req file
                ticket.status = 'awaiting_token_request';
                try {
                    const retryEmbed = new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setTitle('⚠️ Token Generation Failed')
                        .setDescription(`**Error:** ${result.error}\n\n**Please try again:**\n1. Generate a new \`token_req_####.txt\` file\n2. Upload it here\n\nAttempt ${ticket.retryCount}/${maxRetries}`)
                        .setFooter({ text: 'Your reserved token is still active' });
                    
                    await entry.channel.send({
                        content: `<@${ticket.userId}>`,
                        embeds: [retryEmbed]
                    });
                } catch (e) {}
                
                // Restart the timer for new upload
                startUbisoftTokenRequestTimer(ticket.id, entry.channel);
                
                await logTicketEvent(ticket, 'step_change', { step: `Generation failed, retry ${ticket.retryCount}/${maxRetries}`, error: result.error, platform: 'ubisoft' });
            }
        }
        
        // Remove from queue
        ubisoftTokenQueue.shift();
        
        // Small delay between processing
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    isProcessingUbisoftQueue = false;
}

// ============================================================================
// UBISOFT TOKEN GENERATION - Uses DenuvoTicket.exe
// ============================================================================

async function generateUbisoftToken(ticket) {
    console.log(`[Ubisoft] ========== TOKEN GENERATION START ==========`);
    console.log(`[Ubisoft] Ticket: ${ticket.id}, Game: ${ticket.gameName}`);
    
    return new Promise((resolve) => {
        try {
            // Check exe exists
            console.log(`[Ubisoft] Exe path: ${ubisoftConfig.denuvoExePath}`);
            if (!fs.existsSync(ubisoftConfig.denuvoExePath)) {
                console.log(`[Ubisoft] ERROR: Exe not found!`);
                resolve({ success: false, error: 'DenuvoTicket.exe not found.' });
                return;
            }
            console.log(`[Ubisoft] Exe exists: YES`);
            
            // Get the RESERVED token for this ticket (not just any available token)
            let tokenData = db.getReservedUbisoftToken ? db.getReservedUbisoftToken(ticket.id) : null;
            
            // Fallback to getting any available token if no reserved token found
            if (!tokenData) {
                console.log(`[Ubisoft] No reserved token found, getting available token...`);
                tokenData = db.getAvailableUbisoftToken(ticket.gameId);
            }
            
            console.log(`[Ubisoft] Token data:`, tokenData ? `Found account ${tokenData.email}` : 'NONE');
            if (!tokenData) {
                resolve({ success: false, error: 'No available accounts.' });
                return;
            }
            
            const email = tokenData.email;
            const password = tokenData.password;
            const tokenContent = ticket.tokenRequestContent;
            
            // Get game info for format
            const game = db.getUbisoftGame(ticket.gameId);
            const tokenFormat = game?.token_format || 'legacy';
            
            const exeDir = path.dirname(ubisoftConfig.denuvoExePath);
            console.log(`[Ubisoft] Exe dir: ${exeDir}`);
            console.log(`[Ubisoft] Account: ${email}`);
            console.log(`[Ubisoft] Format: ${tokenFormat}`);
            console.log(`[Ubisoft] Token content length: ${tokenContent?.length || 0}`);
            
            // Clean old output files (both token.txt and dbdata.json)
            const tokenOutputPath = ubisoftConfig.tokenOutputPath || exeDir;
            const filesToClean = [
                path.join(tokenOutputPath, 'token.txt'),
                path.join(tokenOutputPath, 'dbdata.json'),
                path.join(exeDir, 'token.txt'),
                path.join(exeDir, 'dbdata.json')
            ];
            for (const f of filesToClean) {
                try { fs.unlinkSync(f); console.log(`[Ubisoft] Deleted: ${f}`); } catch (e) {}
            }
            
            // Use automation mode with -l -p -t arguments
            // -l = login (email), -p = password, -t = token request content
            const args = [
                '-l', email,
                '-p', password,
                '-t', tokenContent
            ];
            
            console.log(`[Ubisoft] Spawning exe in automation mode...`);
            console.log(`[Ubisoft] Command: DenuvoTicket.exe -l ${email} -p *** -t [${tokenContent?.length || 0} chars]`);
            
            // With patched DenuvoTicket.exe (SafeSetCursorVisible), no shell needed
            const childProcess = spawn(ubisoftConfig.denuvoExePath, args, {
                cwd: exeDir,
                windowsHide: true
            });
            
            let stdout = '';
            let stderr = '';
            
            childProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            childProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            const processTimeout = setTimeout(() => {
                console.log(`[Ubisoft] TIMEOUT - killing process`);
                childProcess.kill();
                resolve({ success: false, error: 'Process timed out (2 minutes)' });
            }, 120000);
            
            childProcess.on('error', (err) => {
                console.log(`[Ubisoft] Process ERROR:`, err.message);
                clearTimeout(processTimeout);
                resolve({ success: false, error: err.message });
            });
            
            childProcess.on('close', (code) => {
                clearTimeout(processTimeout);
                console.log(`[Ubisoft] Process exited with code: ${code}`);
                console.log(`[Ubisoft] stdout: ${stdout.substring(0, 1500)}`);
                if (stderr) console.log(`[Ubisoft] stderr: ${stderr.substring(0, 500)}`);
                
                // Check stdout for success/failure messages from exe
                const exeSuccess = stdout.includes('Automated token generation was successful!') || code === 0;
                const exeFailed = stdout.includes('Automated token generation failed!') || code === 1;
                const accountNoOwn = stdout.includes('You do not own') || stdout.includes('not own this game');
                const dailyLimitReached = stdout.includes('daily limit') || stdout.includes('token limit');
                
                console.log(`[Ubisoft] Exit code: ${code}, Exe success: ${exeSuccess}, Exe failed: ${exeFailed}, No own: ${accountNoOwn}, Daily limit: ${dailyLimitReached}`);
                
                // Check for token file after delay
                setTimeout(() => {
                    console.log(`[Ubisoft] Checking for token file...`);
                    
                    const tokenOutputPath = ubisoftConfig.tokenOutputPath || exeDir;
                    
                    // Check for either dbdata.json or token.txt
                    const possibleFiles = [
                        path.join(tokenOutputPath, 'dbdata.json'),
                        path.join(tokenOutputPath, 'token.txt'),
                        path.join(exeDir, 'dbdata.json'),
                        path.join(exeDir, 'token.txt')
                    ];
                    
                    let foundTokenFile = null;
                    for (const filePath of possibleFiles) {
                        console.log(`[Ubisoft] Checking: ${filePath} - exists: ${fs.existsSync(filePath)}`);
                        if (fs.existsSync(filePath)) {
                            foundTokenFile = filePath;
                            break;
                        }
                    }
                    
                    if (foundTokenFile) {
                        const content = fs.readFileSync(foundTokenFile, 'utf8');
                        console.log(`[Ubisoft] Token file found: ${foundTokenFile}, Length: ${content.length}`);
                        
                        if (content && content.length > 10) {
                            // Mark token used (this clears the reservation and sets last_used_at)
                            if (db.markUbisoftTokenUsed) {
                                db.markUbisoftTokenUsed(tokenData.id, ticket.userId, ticket.username, ticket.id);
                            }
                            
                            // Log activation (fix: correct parameter order)
                            if (db.logUbisoftActivation) {
                                db.logUbisoftActivation(
                                    tokenData.id,           // token_id
                                    tokenData.account_id,   // account_id
                                    ticket.gameId,          // game_id
                                    ticket.userId,          // user_id
                                    ticket.username,        // username
                                    ticket.id,              // ticket_id
                                    true,                   // success
                                    null                    // error_message
                                );
                            }
                            
                            updateUbisoftPanel();
                            console.log(`[Ubisoft] ========== TOKEN GENERATION SUCCESS ==========`);
                            resolve({ success: true, tokenFile: foundTokenFile, accountUsed: email });
                        } else {
                            console.log(`[Ubisoft] Token file empty or too short`);
                            resolve({ success: false, error: 'Token file is empty', accountUsed: email, tryDifferentAccount: true });
                        }
                    } else {
                        console.log(`[Ubisoft] No token file found!`);
                        let errorMsg = 'No token file generated';
                        let tryDifferentAccount = false;
                        
                        // Determine error type and if we should try different account
                        if (accountNoOwn) {
                            errorMsg = 'Account does not own this game';
                            tryDifferentAccount = true;
                        } else if (dailyLimitReached) {
                            errorMsg = 'Account daily token limit reached';
                            tryDifferentAccount = true;
                            // Mark ALL tokens for this account+game as used so they won't be selected again today
                            if (db.markUbisoftAccountGameTokensUsed) {
                                db.markUbisoftAccountGameTokensUsed(email, ticket.gameId);
                            }
                        } else if (exeFailed) {
                            errorMsg = 'Token generation failed';
                            tryDifferentAccount = false; // Same account can retry with new token_req
                        }
                        
                        console.log(`[Ubisoft] ========== TOKEN GENERATION FAILED ==========`);
                        resolve({ success: false, error: errorMsg, accountUsed: email, tryDifferentAccount });
                    }
                }, 2000);
            });
            
        } catch (err) {
            console.error('[Ubisoft] EXCEPTION:', err);
            resolve({ success: false, error: err.message });
        }
    });
}

// ============================================================================
// UBISOFT CLOSE TICKET
// ============================================================================

async function closeUbisoftTicket(ticketId, reason, channel) {
    const ticket = activeUbisoftTickets.get(ticketId);
    if (!ticket) return;
    
    clearAllUbisoftTicketTimers(ticketId);
    
    ticket.status = 'closed';
    
    // Remove from queue if present
    const queueIndex = ubisoftTokenQueue.findIndex(entry => entry.ticketId === ticketId);
    if (queueIndex !== -1) {
        ubisoftTokenQueue.splice(queueIndex, 1);
        console.log(`[Ubisoft] Removed ticket ${ticketId} from queue (position ${queueIndex + 1})`);
        
        // Update positions for remaining tickets
        ubisoftTokenQueue.forEach((e, i) => {
            const t = activeUbisoftTickets.get(e.ticketId);
            if (t) t.queuePosition = i + 1;
        });
    }
    
    // Release reserved token if ticket wasn't completed successfully
    if (reason !== 'completed' && db.releaseUbisoftToken) {
        db.releaseUbisoftToken(ticketId);
        console.log(`[Ubisoft] Released reserved token for ticket ${ticketId} (reason: ${reason})`);
    }
    
    // Save transcript
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const transcript = messages.reverse().map(m => ({
            author: m.author.username,
            authorId: m.author.id,
            content: m.content,
            timestamp: m.createdTimestamp,
            attachments: m.attachments.map(a => a.url)
        }));
        
        if (db.saveUbisoftTranscript) {
            db.saveUbisoftTranscript(ticketId, ticket.threadId, ticket.userId, ticket.username, ticket.gameName, JSON.stringify(transcript));
        }
    } catch (e) {
        console.error('[Ubisoft] Transcript error:', e.message);
    }
    
    // Update database
    if (db.closeUbisoftTicket) {
        db.closeUbisoftTicket(ticketId, reason);
    }
    
    // Log close event
    await logTicketEvent(ticket, 'closed', { reason, platform: 'ubisoft' });
    
    // Update panel to show released token
    updateUbisoftPanel();
    
    // Send close message
    const closeEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🔒 Ticket Closed')
        .setDescription(`**Reason:** ${reason}`)
        .setFooter({ text: `Ticket: ${ticketId}` })
        .setTimestamp();
    
    try {
        await channel.send({ embeds: [closeEmbed] });
    } catch (e) {}
    
    // Delete thread after short delay
    setTimeout(async () => {
        try {
            await channel.delete();
        } catch (e) {
            try { await channel.setArchived(true); } catch (e2) {}
        }
    }, 3000);
    
    activeUbisoftTickets.delete(ticketId);
    await updateUbisoftPanel();
    
    console.log(`[Ubisoft] Ticket ${ticketId} closed: ${reason}`);
}

// ============================================================================
// EA TICKET SYSTEM
// ============================================================================

function generateEATicketId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = 'EA-';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

async function createEAPanel(channel, panelType = 'free') {
    const games = db.getEAGamesByPanel(panelType);
    
    if (games.length === 0) {
        return channel.send({ content: '❌ No EA games available.' });
    }
    
    // Calculate stats
    let totalAvailable = 0;
    let highDemandCount = 0;
    games.forEach(game => {
        totalAvailable += db.getAvailableEATokenCount(game.id);
        if (game.demand_type === 'high') highDemandCount++;
    });
    
    const panelTitle = panelType === 'paid' ? '🎮 EA Premium Games 🎮' : '🎮 EA Free Games 🎮';
    const panelColor = panelType === 'paid' ? 0xFFD700 : 0x00FF00;
    
    const embed = new EmbedBuilder()
        .setColor(panelColor)
        .setTitle(panelTitle)
        .setDescription('*Select a game from the dropdown below*\n________________________________________')
        .addFields(
            { name: '🎫 Available', value: `**${totalAvailable}** tokens`, inline: true },
            { name: '🎮 Games', value: `**${games.filter(g => db.getAvailableEATokenCount(g.id) > 0).length}**/${games.length}`, inline: true },
            { name: '🔥 High Demand', value: `**${highDemandCount}** games`, inline: true },
            { name: '📖 Legend', value: '🔥 High Demand | 🟢 10+ | 🟡 <10 | 🔴 Empty', inline: false }
        )
        .setFooter({ text: `EA Token System | ${panelType === 'paid' ? 'Premium' : 'Free'} Panel` })
        .setTimestamp();
    
    // Create select menu with token counts
    const options = games.slice(0, 25).map(game => {
        const available = db.getAvailableEATokenCount(game.id);
        const isHighDemand = game.demand_type === 'high';
        let emoji = '🟢';
        if (available === 0) emoji = '🔴';
        else if (available < 10) emoji = '🟡';
        if (isHighDemand) emoji = '🔥';
        
        return {
            label: game.game_name.substring(0, 100),
            value: `ea_game_${game.id}`,
            description: `${available} tokens available`,
            emoji: emoji
        };
    });
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ea_panel_${panelType}`)
        .setPlaceholder('🎮 Select an EA game...')
        .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    // Add buttons
    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ea_refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('view_ea_high_demand').setLabel('High Demand').setEmoji('🔥').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('view_rules').setLabel('Rules').setEmoji('📜').setStyle(ButtonStyle.Primary)
    );
    
    const message = await channel.send({ embeds: [embed], components: [row, buttonRow] });
    
    // Save panel settings
    db.saveEAPanelSettings(channel.guild.id, panelType, channel.id, message.id);
    eaPanels.set(`${channel.guild.id}_${panelType}`, { channelId: channel.id, messageId: message.id });
    
    return message;
}

async function updateEAPanel() {
    // Auto-recover panels from database if map is empty
    if (eaPanels.size === 0) {
        try {
            const panels = db.getAllEAPanels ? db.getAllEAPanels() : [];
            for (const panel of panels) {
                const key = `${panel.guild_id}_${panel.panel_type || 'free'}`;
                eaPanels.set(key, {
                    channelId: panel.channel_id,
                    messageId: panel.message_id
                });
                console.log(`[EA Panel] Loaded panel: ${key} -> channel=${panel.channel_id}, message=${panel.message_id}`);
            }
            console.log(`[EA Panel] Loaded ${panels.length} panels from database`);
        } catch (e) {
            console.log(`[EA Panel] Error loading panels: ${e.message}`);
        }
    }
    
    if (eaPanels.size === 0) {
        console.log(`[EA Panel] No panels to update`);
        return;
    }
    
    console.log(`[EA Panel] Updating ${eaPanels.size} panels...`);
    
    // Update all EA panels
    for (const [key, panel] of eaPanels) {
        try {
            console.log(`[EA Panel] Fetching channel ${panel.channelId}...`);
            const channel = await client.channels.fetch(panel.channelId).catch(() => null);
            if (!channel) {
                console.log(`[EA Panel] Channel ${panel.channelId} not found`);
                continue;
            }
            
            const message = await channel.messages.fetch(panel.messageId).catch((e) => {
                console.log(`[EA Panel] Message ${panel.messageId} fetch error: ${e.message}`);
                return null;
            });
            if (!message) {
                console.log(`[EA Panel] Message ${panel.messageId} not found in channel ${panel.channelId}`);
                continue;
            }
            
            console.log(`[EA Panel] Updating panel ${key}...`);
            
            const panelType = key.split('_')[1] || 'free';
            const games = db.getEAGamesByPanel(panelType);
            
            // Calculate stats
            let totalAvailable = 0;
            let highDemandCount = 0;
            games.forEach(game => {
                totalAvailable += db.getAvailableEATokenCount(game.id);
                if (game.demand_type === 'high') highDemandCount++;
            });
            
            const panelTitle = panelType === 'paid' ? '🎮 EA Premium Games 🎮' : '🎮 EA Free Games 🎮';
            const panelColor = panelType === 'paid' ? 0xFFD700 : 0x00FF00;
            
            const embed = new EmbedBuilder()
                .setColor(panelColor)
                .setTitle(panelTitle)
                .setDescription('*Select a game from the dropdown below*\n________________________________________')
                .addFields(
                    { name: '🎫 Available', value: `**${totalAvailable}** tokens`, inline: true },
                    { name: '🎮 Games', value: `**${games.filter(g => db.getAvailableEATokenCount(g.id) > 0).length}**/${games.length}`, inline: true },
                    { name: '🔥 High Demand', value: `**${highDemandCount}** games`, inline: true },
                    { name: '📖 Legend', value: '🔥 High Demand | 🟢 10+ | 🟡 <10 | 🔴 Empty', inline: false }
                )
                .setFooter({ text: `EA Token System | ${panelType === 'paid' ? 'Premium' : 'Free'} Panel` })
                .setTimestamp();
            
            // Create select menu with updated token counts
            const options = games.slice(0, 25).map(game => {
                const available = db.getAvailableEATokenCount(game.id);
                const isHighDemand = game.demand_type === 'high';
                let emoji = '🟢';
                if (available === 0) emoji = '🔴';
                else if (available < 10) emoji = '🟡';
                if (isHighDemand) emoji = '🔥';
                
                return {
                    label: game.game_name.substring(0, 100),
                    value: `ea_game_${game.id}`,
                    description: `${available} tokens available`,
                    emoji: emoji
                };
            });
            
            // Skip if no games
            if (options.length === 0) {
                console.log(`[EA Panel] No games for panel ${key}, skipping update`);
                continue;
            }
            
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`ea_panel_${panelType}`)
                .setPlaceholder('🎮 Select an EA game...')
                .addOptions(options);
            
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            // Add buttons
            const buttonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ea_refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('view_ea_high_demand').setLabel('High Demand').setEmoji('🔥').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('view_rules').setLabel('Rules').setEmoji('📜').setStyle(ButtonStyle.Primary)
            );
            
            await message.edit({ embeds: [embed], components: [row, buttonRow] });
            console.log(`[EA Panel] Successfully updated panel ${key}`);
        } catch (e) {
            console.log(`[EA Panel] Update error for ${key}: ${e.message}`);
        }
    }
}

async function createEATicket(interaction, gameId) {
    try {
        await interaction.deferReply({ ephemeral: true });
    } catch (e) {
        return;
    }
    
    const game = db.getEAGame(gameId);
    if (!game) {
        return interaction.editReply({ content: '❌ Game not found.' });
    }
    
    // Server membership check (same as Steam/Ubisoft)
    const MAIN_SERVER_ID = process.env.MAIN_SERVER_ID || '1265271912037089312';
    const PAID_SERVER_ID = process.env.PAID_SERVER_ID || '1265025550485950634';
    const FREE_SERVER_ID = process.env.FREE_SERVER_ID || '1310909523715690536';
    
    let isInMainServer = false, isInPaidServer = false, isInFreeServer = false;
    
    try {
        const mainGuild = await client.guilds.fetch(MAIN_SERVER_ID).catch(() => null);
        if (mainGuild) {
            const mainMember = await mainGuild.members.fetch(interaction.user.id).catch(() => null);
            isInMainServer = !!mainMember;
        }
        
        const paidGuild = await client.guilds.fetch(PAID_SERVER_ID).catch(() => null);
        if (paidGuild) {
            const paidMember = await paidGuild.members.fetch(interaction.user.id).catch(() => null);
            isInPaidServer = !!paidMember;
        }
        
        const freeGuild = await client.guilds.fetch(FREE_SERVER_ID).catch(() => null);
        if (freeGuild) {
            const freeMember = await freeGuild.members.fetch(interaction.user.id).catch(() => null);
            isInFreeServer = !!freeMember;
        }
    } catch (err) {
        console.log(`[EA] Server check error: ${err.message}`);
    }
    
    if (!isInMainServer) {
        return interaction.editReply({ content: '❌ **Main Server Required**\n\nJoin the main server first!' });
    }
    
    if (!isInPaidServer && !isInFreeServer) {
        return interaction.editReply({ content: '❌ **Tier Server Required**\n\nJoin Paid or Free server!' });
    }
    
    // Check timeout
    if (interaction.member?.communicationDisabledUntil) {
        const timeoutEnd = new Date(interaction.member.communicationDisabledUntil);
        if (timeoutEnd > new Date()) {
            return interaction.editReply({ content: '❌ **You have a timeout**\n\nTry again later.' });
        }
    }
    
    // Check existing ticket
    const existingTicket = db.getEAUserOpenTicket ? db.getEAUserOpenTicket(interaction.user.id, interaction.guild.id) : null;
    if (existingTicket) {
        return interaction.editReply({ content: '❌ You already have an open EA ticket!' });
    }
    
    // PER-GAME 24-HOUR COOLDOWN (Anti-Reseller - No exceptions)
    const gameCooldown = db.checkGameCooldown(interaction.user.id, gameId, 'ea');
    if (gameCooldown) {
        const expiresAt = new Date(gameCooldown.expires_at);
        return interaction.editReply({ 
            content: `❌ **Game Cooldown Active**\n\nYou already requested **${game.game_name}** recently.\n\n⏰ You can request this game again <t:${Math.floor(expiresAt.getTime() / 1000)}:R>\n\n💡 You can still request **other games** while on cooldown for this one.` 
        });
    }
    
    // SHARED COOLDOWN CHECK
    const cooldown = db.getUniversalCooldown(interaction.user.id, 'ticket');
    if (cooldown) {
        const expiresAt = new Date(cooldown.expires_at);
        return interaction.editReply({ 
            content: `❌ **Cooldown Active!**\n\nYou have a cooldown (applies to Steam, Ubisoft & EA).\nTry again <t:${Math.floor(expiresAt.getTime() / 1000)}:R>` 
        });
    }
    
    // Check tokens
    const available = db.getAvailableEATokenCount(gameId);
    if (available <= 0) {
        return interaction.editReply({ content: `❌ No tokens for **${game.game_name}**.` });
    }
    
    // Generate ticket ID first so we can reserve token
    const ticketId = generateEATicketId();
    
    // Reserve token BEFORE creating thread
    const reserveResult = db.reserveEAToken ? db.reserveEAToken(gameId, ticketId) : null;
    if (!reserveResult || !reserveResult.success) {
        return interaction.editReply({ content: `❌ Failed to reserve token for **${game.game_name}**.` });
    }
    console.log(`[EA] Reserved token for ticket ${ticketId}: ${reserveResult.accountName}`);
    
    try {
        // Use the forum/ticket channel from server settings or config
        const serverTicketChannelId = db.getEATicketChannel ? db.getEATicketChannel(interaction.guild.id) : null;
        const configChannelId = config.ticketChannelId || config.forumChannelId;
        
        // Try to find a valid ticket channel
        let ticketChannel = null;
        let ticketChannelId = null;
        
        // Try server-specific channel first
        if (serverTicketChannelId) {
            try {
                ticketChannel = await client.channels.fetch(serverTicketChannelId).catch(() => null);
                if (ticketChannel) ticketChannelId = serverTicketChannelId;
            } catch (e) {
                console.log(`[EA] Server ticket channel ${serverTicketChannelId} not found`);
            }
        }
        
        // Try config channel
        if (!ticketChannel && configChannelId) {
            try {
                ticketChannel = await client.channels.fetch(configChannelId).catch(() => null);
                if (ticketChannel) ticketChannelId = configChannelId;
            } catch (e) {
                console.log(`[EA] Config ticket channel ${configChannelId} not found`);
            }
        }
        
        // Fallback: use the current channel if it supports threads
        if (!ticketChannel) {
            ticketChannel = interaction.channel;
            ticketChannelId = interaction.channel.id;
            console.log(`[EA] Using current channel ${ticketChannelId} as fallback`);
        }
        
        if (!ticketChannel) {
            if (db.releaseEAToken) db.releaseEAToken(ticketId);
            return interaction.editReply({ content: '❌ No valid ticket channel found. Please contact staff.' });
        }
        
        if (ticketChannel.guild?.id !== interaction.guild.id) {
            if (db.releaseEAToken) db.releaseEAToken(ticketId);
            return interaction.editReply({ content: '❌ Ticket channel not configured for this server. Run `/ea-setup`.' });
        }
        
        console.log(`[EA] Using ticket channel: ${ticketChannelId} (${ticketChannel.name || 'unknown'})`);
        
        const isHighDemand = game.demand_type === 'high';
        
        // STEP 1: Ask for screenshots (10 min timer)
        const embed = new EmbedBuilder()
            .setColor(isHighDemand ? 0xFF6600 : 0xFF0000)
            .setTitle(`🎮 ${game.game_name}`)
            .setDescription(`Welcome **${interaction.user.username}**!\n\n${isHighDemand ? '🔥 **HIGH DEMAND GAME**\n\n' : ''}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📸 **Step 1: Upload Screenshots**`)
            .addFields(
                { name: '📋 Required', value: '• Game folder properties (showing size)\n• Windows Update Blocker (showing DISABLED - red X)\n• Proof of legitimate installation', inline: false },
                { name: '⏱️ Time Limit', value: '10 minutes', inline: true },
                { name: '📦 Expected Size', value: game.size_gb ? `~${game.size_gb} GB` : 'Any size', inline: true }
            )
            .setFooter({ text: `Ticket: ${ticketId} | Platform: EA` })
            .setTimestamp();
        
        if (game.cover_url) embed.setThumbnail(game.cover_url);
        
        let thread;
        if (ticketChannel.type === ChannelType.GuildForum) {
            thread = await ticketChannel.threads.create({
                name: `🎮 ${interaction.user.username} | ${game.game_name}`,
                autoArchiveDuration: 1440,
                message: { content: `<@${interaction.user.id}>`, embeds: [embed] }
            });
        } else {
            thread = await ticketChannel.threads.create({
                name: `🎮 ${interaction.user.username} | ${game.game_name}`,
                autoArchiveDuration: 1440,
                type: ChannelType.PrivateThread,
                invitable: false,
                reason: `EA Ticket for ${interaction.user.username}`
            });
            await thread.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });
            await thread.members.add(interaction.user.id);
        }
        
        // Cancel/Help buttons
        const screenshotButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ea_early_help_${ticketId}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ea_close_ticket_${ticketId}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
        );
        await thread.send({ components: [screenshotButtons] });
        
        const ticketData = {
            id: ticketId,
            threadId: thread.id,
            channelId: thread.id,
            userId: interaction.user.id,
            username: interaction.user.username,
            gameId,
            gameName: game.game_name,
            guildId: interaction.guild.id,
            status: 'awaiting_screenshot',
            platform: 'ea',
            collectedScreenshots: [],
            helpRequested: false,
            tokenRequestContent: null,
            tokenReserved: true,
            reservedTokenId: reserveResult.tokenId,
            createdAt: Date.now()
        };
        
        activeEATickets.set(ticketId, ticketData);
        console.log(`[EA] Ticket ${ticketId} added to activeEATickets map. Total: ${activeEATickets.size}`);
        
        // Save to database
        if (db.createEATicket) {
            db.createEATicket(ticketId, thread.id, interaction.guild.id, interaction.user.id, interaction.user.username, gameId);
        }
        
        startEAScreenshotTimer(ticketId, thread);
        
        // Log ticket opened
        await logTicketEvent(ticketData, 'opened', { reason: 'User opened EA ticket', platform: 'ea' });
        
        // Update panel
        updateEAPanel();
        
        await interaction.editReply({ content: `✅ EA ticket created! Head to ${thread}` });
        
    } catch (err) {
        console.error('[EA] Ticket creation error:', err);
        if (db.releaseEAToken) db.releaseEAToken(ticketId);
        await interaction.editReply({ content: '❌ Failed to create ticket.' }).catch(() => {});
    }
}

// EA Screenshot Timer
function startEAScreenshotTimer(ticketId, channel) {
    const timeout = setTimeout(async () => {
        const ticket = activeEATickets.get(ticketId);
        if (ticket && ticket.status === 'awaiting_screenshot') {
            await channel.send({ content: '⏰ **Time expired!** No screenshots received. Closing ticket...' }).catch(() => {});
            await closeEATicket(ticketId, 'timeout_screenshot', channel);
        }
    }, eaConfig.screenshotTimeout);
    
    const ticket = activeEATickets.get(ticketId);
    if (ticket) ticket.screenshotTimer = timeout;
}

// Helper to proceed EA ticket to token request phase
async function proceedToEATokenRequest(ticket, channel, game) {
    ticket.status = 'awaiting_token_request';
    
    // Use game-specific instructions if available, otherwise use default
    const defaultInstr = EA_INSTRUCTIONS;
    const gameInstructions = game?.instructions || defaultInstr;
    
    // Show instructions
    const instructionsEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Screenshots Approved!')
        .setDescription('**Follow these instructions:**')
        .addFields({ name: '📋 Instructions', value: gameInstructions.substring(0, 1024) })
        .setFooter({ text: `Ticket: ${ticket.id}` });
    
    if (game?.cover_url) instructionsEmbed.setThumbnail(game.cover_url);
    
    await channel.send({ embeds: [instructionsEmbed] });
    
    // Add download links if available
    if (game?.download_links) {
        const dlEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📥 Download Links')
            .setDescription(game.download_links);
        await channel.send({ embeds: [dlEmbed] });
    }
    
    const tokenRequestEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📤 Step 2: Upload Token Request File')
        .setDescription('Upload the `.txt` file generated by the game.\n\n⏱️ **Time Limit:** 30 minutes')
        .setFooter({ text: ticket.id });
    
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ea_early_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ea_close_ticket_${ticket.id}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
    );
    
    await channel.send({ embeds: [tokenRequestEmbed], components: [buttons] });
    startEATokenRequestTimer(ticket.id, channel);
    
    // Update database
    if (db.updateEATicketStatus) db.updateEATicketStatus(ticket.id, 'awaiting_token_request');
}

// EA Token Request Timer
function startEATokenRequestTimer(ticketId, channel) {
    const timeout = setTimeout(async () => {
        const ticket = activeEATickets.get(ticketId);
        if (ticket && ticket.status === 'awaiting_token_request') {
            await channel.send({ content: '⏰ **Time expired!** No token request file received. Closing ticket...' }).catch(() => {});
            await closeEATicket(ticketId, 'timeout_token_request', channel);
        }
    }, eaConfig.tokenRequestTimeout);
    
    const ticket = activeEATickets.get(ticketId);
    if (ticket) ticket.tokenRequestTimer = timeout;
}

function clearAllEATicketTimers(ticketId) {
    const ticket = activeEATickets.get(ticketId);
    if (ticket) {
        if (ticket.screenshotTimer) clearTimeout(ticket.screenshotTimer);
        if (ticket.tokenRequestTimer) clearTimeout(ticket.tokenRequestTimer);
        if (ticket.responseTimer) clearTimeout(ticket.responseTimer);
    }
}

async function handleEAScreenshot(message) {
    const ticket = Array.from(activeEATickets.values()).find(t => 
        t.threadId === message.channel.id && message.author.id === t.userId
    );
    
    if (!ticket || ticket.status !== 'awaiting_screenshot') return;
    
    const images = message.attachments.filter(a => 
        a.contentType?.startsWith('image/') || 
        /\.(png|jpg|jpeg|gif|webp)$/i.test(a.name)
    );
    
    if (images.size === 0) return;
    
    images.forEach(img => {
        if (ticket.collectedScreenshots.length < 4) {
            ticket.collectedScreenshots.push(img.url);
        }
    });
    
    console.log(`[EA] Collected ${ticket.collectedScreenshots.length} screenshot(s) for ${ticket.id}`);
    
    if (ticket.collectedScreenshots.length >= 1) {
        // Clear screenshot timer
        if (ticket.screenshotTimer) clearTimeout(ticket.screenshotTimer);
        
        // Update status
        ticket.status = 'verifying';
        
        // Verify with AI
        await message.channel.send({ content: '🔍 Verifying screenshots...' });
        
        try {
            const game = db.getEAGame(ticket.gameId);
            const verificationResult = await aiVerifier.verifyScreenshots(ticket.collectedScreenshots, {
                gameName: game?.game_name,
                folderName: game?.folder_name,
                expectedSize: game?.size_gb
            });
            
            if (verificationResult.decision === 'approve') {
                // AI approved - show instructions (same as Ubisoft)
                console.log(`[EA] AI approved screenshots for ${ticket.id}`);
                const game = db.getEAGame(ticket.gameId);
                await proceedToEATokenRequest(ticket, message.channel, game);
                await logTicketEvent(ticket, 'step_change', { step: 'AI approved screenshots', provider: verificationResult.provider, platform: 'ea' });
                
            } else if (verificationResult.decision === 'reject') {
                // Rejected - allow retry
                ticket.status = 'awaiting_screenshot';
                ticket.collectedScreenshots = [];
                
                await message.channel.send({
                    content: `<@${ticket.userId}>`,
                    embeds: [new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('❌ Screenshots Rejected')
                        .setDescription(`**Reason:** ${verificationResult.reason}\n\nPlease upload new screenshots.`)
                    ]
                });
                startEAScreenshotTimer(ticket.id, message.channel);
                
            } else {
                // Staff review needed (uncertain)
                ticket.status = 'awaiting_staff';
                const game = db.getEAGame(ticket.gameId);
                
                console.log(`[EA] AI uncertain, sending to staff review for ${ticket.id}`);
                
                await message.channel.send({
                    content: `${getStaffMention(ticket.guildId)}`,
                    embeds: [new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setTitle('👀 Staff Review Required')
                        .setDescription(`AI couldn't verify automatically.\n**Reason:** ${verificationResult.reason || 'Verification uncertain'}`)
                        .addFields(
                            { name: '🎮 Game', value: game?.game_name || 'Unknown', inline: true },
                            { name: '👤 User', value: `<@${ticket.userId}>`, inline: true },
                            { name: '📸 Screenshots', value: `${ticket.collectedScreenshots.length} image(s)`, inline: true }
                        )
                        .setImage(ticket.collectedScreenshots[0])
                        .setFooter({ text: `EA Ticket: ${ticket.id}` })
                    ],
                    components: [new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`ea_staff_approve_${ticket.id}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`ea_staff_reject_${ticket.id}`).setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger)
                    )]
                });
                
                // Show additional screenshots
                for (let i = 1; i < ticket.collectedScreenshots.length; i++) {
                    await message.channel.send({ 
                        embeds: [new EmbedBuilder()
                            .setColor(0xFFA500)
                            .setTitle(`📸 Screenshot ${i + 1}/${ticket.collectedScreenshots.length}`)
                            .setImage(ticket.collectedScreenshots[i])]
                    });
                }
            }
            
        } catch (err) {
            console.error('[EA] Verification error:', err);
            ticket.status = 'needs_staff';
            ticket.helpRequested = true;
            await message.channel.send({ content: `${getStaffMention(ticket.guildId)} AI verification failed. Please review manually.` });
        }
    }
}

async function handleEATokenRequestFile(message) {
    const ticket = Array.from(activeEATickets.values()).find(t => 
        t.threadId === message.channel.id && message.author.id === t.userId
    );
    
    if (!ticket || ticket.status !== 'awaiting_token_request') return;
    
    // Debounce - prevent duplicate processing
    if (ticket.processingFile) {
        console.log(`[EA] Already processing file for ${ticket.id}, skipping duplicate`);
        return;
    }
    ticket.processingFile = true;
    
    const txtFile = message.attachments.find(a => a.name?.toLowerCase().endsWith('.txt'));
    if (!txtFile) {
        ticket.processingFile = false;
        return;
    }
    
    console.log(`[EA] Processing token request file for ${ticket.id}`);
    
    // Clear timer
    if (ticket.tokenRequestTimer) clearTimeout(ticket.tokenRequestTimer);
    
    try {
        // Download file as binary buffer to preserve EXACT content
        const response = await fetch(txtFile.url);
        const buffer = await response.arrayBuffer();
        const rawContent = Buffer.from(buffer);
        
        console.log(`[EA] Downloaded file: ${rawContent.length} bytes`);
        
        // Save the EXACT file content to disk
        const exeDir = path.dirname(eaConfig.tokenGenPath);
        const savedFile = path.join(exeDir, `ticket_${ticket.id}.txt`);
        fs.writeFileSync(savedFile, rawContent);
        console.log(`[EA] Saved exact file to: ${savedFile}`);
        
        // Store path for generator
        ticket.tokenRequestFile = savedFile;
        ticket.status = 'generating';
        
        await message.channel.send({ content: '⚙️ Processing your request... Please wait.' });
        
        // Add to queue
        eaTokenQueue.push({
            ticketId: ticket.id,
            channelId: message.channel.id
        });
        
        console.log(`[EA] Ticket ${ticket.id} added to queue at position ${eaTokenQueue.length}`);
        
        // Process queue
        processEATokenQueue();
        
    } catch (err) {
        console.error('[EA] Token request file error:', err);
        ticket.processingFile = false;
        await message.channel.send({ content: '❌ Failed to read the file. Please try uploading again.' });
    }
}

async function processEATokenQueue() {
    console.log(`[EA] processEATokenQueue called - isProcessing: ${isProcessingEAQueue}, queueLength: ${eaTokenQueue.length}`);
    
    if (isProcessingEAQueue || eaTokenQueue.length === 0) return;
    
    isProcessingEAQueue = true;
    
    const item = eaTokenQueue.shift();
    const ticket = activeEATickets.get(item.ticketId);
    
    console.log(`[EA] Processing queue item for ticket: ${item.ticketId}`);
    
    if (!ticket) {
        console.log(`[EA] Ticket ${item.ticketId} not found in activeEATickets`);
        isProcessingEAQueue = false;
        processEATokenQueue();
        return;
    }
    
    try {
        const channel = await client.channels.fetch(item.channelId).catch(() => null);
        if (!channel) throw new Error('Channel not found');
        
        // Generate token with overall timeout (4 minutes max)
        const generateWithTimeout = new Promise(async (resolve) => {
            const maxTimeout = setTimeout(() => {
                console.log(`[EA] Generation took too long, forcing failure`);
                resolve({ success: false, error: 'Generation timed out. Staff will generate manually.' });
            }, 240000); // 4 minutes
            
            try {
                const result = await generateEAToken(ticket);
                clearTimeout(maxTimeout);
                resolve(result);
            } catch (err) {
                clearTimeout(maxTimeout);
                resolve({ success: false, error: err.message });
            }
        });
        
        const result = await generateWithTimeout;
        
        if (result.success) {
            // Success! Send the token
            const tokenEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🎉 Your Token is Ready!')
                .setDescription('Your token has been generated. Follow the usage instructions below.')
                .setFooter({ text: `Ticket: ${ticket.id} | Account: ${result.accountUsed}` })
                .setTimestamp();
            
            const game = db.getEAGame(ticket.gameId);
            if (game?.cover_url) tokenEmbed.setThumbnail(game.cover_url);
            
            // Use game-specific instructions if available, otherwise use default
            const defaultUsage = '1. Copy the token text below (or download the file)\n2. Open `anadius.cfg` in your game files and paste the token inside `"Paste_Valid_Denuvo_Token_Here"`\n3. Launch the game (NOT through EA App)\n   - Make sure to rename the new fixed executable:\n     `GAME fixed.exe` → `GAME.exe`\n     Example: `BF6 fixed.exe` → `BF6.exe`\n     (It should NOT end in `(1)`, `exe.exe`, or similar)\n   - For **Madden NFL 26**, always launch from the newly extracted `EAAntiCheat.GameServiceLauncher.exe`\n   - For **F1 24 / F1 25**, always launch `Bypass.exe` first and keep it open, then launch the newly renamed `F1_24.exe` / `F1_25.exe`\n   - For **FC 24 / FC 25 / FC 26**, always launch from the newly renamed `FC24.exe` / `FC25.exe` / `FC26.exe` OR `Launcher.exe`\n4. Enjoy!';
            const usageInstructions = game?.instructions || defaultUsage;
            tokenEmbed.addFields(
                { name: '📋 Usage', value: usageInstructions.substring(0, 1024), inline: false },
                { name: '⏰ Response Required', value: 'Please click a button below within 30 minutes', inline: false }
            );
            
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ea_works_${ticket.id}`).setLabel('It Works!').setEmoji('✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`ea_early_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger)
            );
            
            await channel.send({ content: `<@${ticket.userId}> 🎉 Token ready!`, embeds: [tokenEmbed], components: [buttons] });
            
            // Send the token - either as file or text depending on result type
            if (result.tokenFile && fs.existsSync(result.tokenFile)) {
                // Copy token file to unique path to prevent overwrites
                const tokenDir = path.join(__dirname, 'EA', 'tokens');
                const uniqueTokenPath = path.join(tokenDir, `EA_Token_${ticket.id}.txt`);
                try {
                    fs.copyFileSync(result.tokenFile, uniqueTokenPath);
                    // Delete original to prevent stale file issues
                    fs.unlinkSync(result.tokenFile);
                    
                    const tokenFile = new AttachmentBuilder(uniqueTokenPath, { name: `EA_Token_${ticket.id}.txt` });
                    await channel.send({ content: '📁 Your Token File:', files: [tokenFile] });
                    ticket.lastDownloadLink = uniqueTokenPath;
                } catch (copyErr) {
                    console.log(`[EA] Failed to copy token file: ${copyErr.message}`);
                    // Fallback - try to send original
                    const tokenFile = new AttachmentBuilder(result.tokenFile, { name: path.basename(result.tokenFile) });
                    await channel.send({ content: '📁 Your Token File:', files: [tokenFile] });
                    ticket.lastDownloadLink = result.tokenFile;
                }
            } else if (result.tokenText) {
                // Text-based token - save to file and send
                const tokenFilePath = path.join(__dirname, 'EA', 'tokens', `EA_Token_${ticket.id}.txt`);
                try {
                    // Ensure directory exists
                    const tokenDir = path.dirname(tokenFilePath);
                    if (!fs.existsSync(tokenDir)) {
                        fs.mkdirSync(tokenDir, { recursive: true });
                    }
                    fs.writeFileSync(tokenFilePath, result.tokenText, 'utf8');
                    const tokenFile = new AttachmentBuilder(tokenFilePath, { name: `EA_Token_${ticket.id}.txt` });
                    await channel.send({ content: '📁 Your Token File:', files: [tokenFile] });
                    ticket.lastDownloadLink = tokenFilePath;
                } catch (writeErr) {
                    console.log(`[EA] Failed to save token file, sending as text: ${writeErr.message}`);
                    // Fallback: send as code block if file write fails
                    const tokenMsg = result.tokenText.length > 1900 
                        ? result.tokenText.substring(0, 1900) + '...(truncated)'
                        : result.tokenText;
                    await channel.send({ content: `📝 Your Token:\n\`\`\`\n${tokenMsg}\n\`\`\`` });
                }
            }
            
            ticket.status = 'awaiting_response';
            
            // Set per-game 24h cooldown immediately when token is delivered (anti-reseller)
            db.setGameCooldown(ticket.userId, ticket.gameId, 'ea', 24);
            
        } else {
            // Failed
            const failEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Generation Failed')
                .setDescription(`Error: ${result.error}\n\nStaff has been notified.`)
                .setFooter({ text: ticket.id });
            
            await channel.send({ content: `${getStaffMention(ticket.guildId)} <@${ticket.userId}>`, embeds: [failEmbed] });
            ticket.status = 'needs_staff';
        }
        
    } catch (err) {
        console.error('[EA] Queue processing error:', err);
    }
    
    isProcessingEAQueue = false;
    
    // Continue processing queue
    if (eaTokenQueue.length > 0) {
        setTimeout(processEATokenQueue, 2000);
    }
}

// Helper function to extract token from token_generator output
function extractTokenFromOutput(stdout) {
    if (!stdout || stdout.length < 100) return null;
    
    // The token is a huge base64-like string
    // It starts after "Enter ticket:" prompt response and ends with == or similar
    
    // Remove menu text and prompts
    let cleanOutput = stdout
        .replace(/Version:.*?Quit\./gs, '')  // Remove menu
        .replace(/Your choice:/g, '')
        .replace(/Enter ticket:/g, '')
        .replace(/Bad ticket!.*?user\./g, '')
        .replace(/----------------------------------------/g, '')
        .replace(/\r/g, '');
    
    // Split into lines and find the token
    const lines = cleanOutput.split('\n');
    let tokenParts = [];
    let inToken = false;
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Skip known non-token lines
        if (trimmed.includes('This program requires') ||
            trimmed.includes('EA app') ||
            trimmed.includes('Alternatively') ||
            trimmed.includes('Generate Denuvo') ||
            trimmed.includes('Force get') ||
            trimmed.includes('Options') ||
            trimmed.includes('1.') ||
            trimmed.includes('2.') ||
            trimmed.includes('3.') ||
            trimmed.includes('4.') ||
            trimmed.includes('5.') ||
            trimmed.includes('q.') ||
            trimmed.startsWith('exe:') ||  // This is input, not output
            trimmed.startsWith('dll:')) {
            continue;
        }
        
        // Token lines are long and contain base64-like chars
        // Check if line looks like token content (alphanumeric + base64 chars)
        if (trimmed.length > 50 && /^[A-Za-z0-9+/=_\-]+$/.test(trimmed.replace(/\s/g, ''))) {
            inToken = true;
            tokenParts.push(trimmed);
        } else if (inToken && trimmed.length > 20) {
            // Continue collecting if we're in token mode
            tokenParts.push(trimmed);
        }
    }
    
    // Join token parts
    if (tokenParts.length > 0) {
        const token = tokenParts.join('');
        // Token should be very long (thousands of chars)
        if (token.length > 500) {
            console.log(`[EA] Extracted token: ${token.length} chars, starts with: ${token.substring(0, 50)}...`);
            return token;
        }
    }
    
    // Fallback: Look for the longest continuous base64-like sequence
    const base64Pattern = /[A-Za-z0-9+/=_\-]{500,}/g;
    const matches = cleanOutput.replace(/\s+/g, '').match(base64Pattern);
    
    if (matches && matches.length > 0) {
        // Return the longest match
        const longest = matches.reduce((a, b) => a.length > b.length ? a : b);
        console.log(`[EA] Fallback extracted token: ${longest.length} chars`);
        return longest;
    }
    
    // Last resort: find content between last "Enter ticket:" and end
    const lastPromptIdx = stdout.lastIndexOf('Enter ticket:');
    if (lastPromptIdx !== -1) {
        const afterPrompt = stdout.substring(lastPromptIdx + 'Enter ticket:'.length).trim();
        // Skip past the input echo and Bad ticket message
        const lines2 = afterPrompt.split('\n');
        let foundBadTicket = false;
        let potentialToken = '';
        
        for (const line of lines2) {
            const trimmed = line.trim();
            if (trimmed.includes('Bad ticket')) {
                foundBadTicket = true;
                continue;
            }
            if (foundBadTicket && trimmed.length > 100 && !trimmed.includes('Enter ticket')) {
                potentialToken += trimmed;
            }
        }
        
        if (potentialToken.length > 500) {
            console.log(`[EA] Last-resort extracted token: ${potentialToken.length} chars`);
            return potentialToken;
        }
    }
    
    return null;
}

async function generateEAToken(ticket) {
    console.log(`[EA] ========== TOKEN GENERATION START ==========`);
    console.log(`[EA] Ticket: ${ticket.id}, Game: ${ticket.gameName}`);
    
    return new Promise(async (resolve) => {
        try {
            const eaGenPath = path.join(__dirname, 'EA', 'EAgen.exe');
            const tokenOutputPath = path.join(__dirname, 'EA', 'tokens', 'EA_Token.txt');
            
            // Check exe exists
            if (!fs.existsSync(eaGenPath)) {
                console.log(`[EA] ERROR: EAgen.exe not found at ${eaGenPath}`);
                resolve({ success: false, error: 'EAgen.exe not found.' });
                return;
            }
            
            // Get the user's uploaded ticket file
            const ticketFile = ticket.tokenRequestFile;
            if (!ticketFile || !fs.existsSync(ticketFile)) {
                console.log(`[EA] Ticket file not found: ${ticketFile}`);
                resolve({ success: false, error: 'Ticket file not found.' });
                return;
            }
            
            // Read and parse the ticket file to extract the ticket line
            let fileContent = fs.readFileSync(ticketFile, 'utf8');
            
            // Strip UTF-8 BOM if present
            if (fileContent.charCodeAt(0) === 0xFEFF) {
                fileContent = fileContent.slice(1);
            }
            
            console.log(`[EA] File content length: ${fileContent.length}`);
            
            // Find the ticket line - pattern: something|0|something (the denuvo ticket format)
            // It could be like: AAABBBCCC|0|12345 or base64data|0|contentid
            const lines = fileContent.split(/\r?\n/);
            let ticketLine = null;
            
            for (const line of lines) {
                const trimmed = line.trim();
                // Match pattern: string|0|string (ticket|0|contentID)
                if (/^[A-Za-z0-9+/=]+\|0\|[A-Za-z0-9]+$/i.test(trimmed)) {
                    ticketLine = trimmed;
                    console.log(`[EA] Found ticket line: ${ticketLine.substring(0, 50)}...`);
                    break;
                }
            }
            
            if (!ticketLine) {
                // Try alternative: look for any line with |0| pattern
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.includes('|0|') && trimmed.split('|').length === 3) {
                        ticketLine = trimmed;
                        console.log(`[EA] Found ticket line (alt): ${ticketLine.substring(0, 50)}...`);
                        break;
                    }
                }
            }
            
            if (!ticketLine) {
                console.log(`[EA] Could not find ticket line in file. Content preview: ${fileContent.substring(0, 200)}`);
                resolve({ success: false, error: 'Could not find valid ticket format (ticket|0|contentID) in file.' });
                return;
            }
            
            // Clean up old token file if exists
            if (fs.existsSync(tokenOutputPath)) {
                try { fs.unlinkSync(tokenOutputPath); } catch(e) {}
            }
            
            // Run EAgen.exe with -t argument
            const exeDir = path.dirname(eaGenPath);
            console.log(`[EA] Running: EAgen.exe -t "${ticketLine}"`);
            
            const child = spawn(eaGenPath, ['-t', ticketLine], {
                cwd: exeDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });
            
            let stdout = '';
            let stderr = '';
            
            child.stdout.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                console.log(`[EA] stdout: ${text.replace(/\n/g, '\\n')}`);
            });
            
            child.stderr.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                console.log(`[EA] stderr: ${text.replace(/\n/g, '\\n')}`);
            });
            
            // Timeout after 2 minutes
            const timeout = setTimeout(() => {
                console.log(`[EA] Timeout - killing process`);
                try { child.kill(); } catch(e) {}
            }, 120000);
            
            child.on('close', (code) => {
                clearTimeout(timeout);
                console.log(`[EA] Process exited with code: ${code}`);
                console.log(`[EA] Full stdout: ${stdout}`);
                
                // Cleanup user's ticket file
                try { fs.unlinkSync(ticketFile); } catch(e) {}
                
                // Check for success/failure in output
                const outputLower = stdout.toLowerCase() + stderr.toLowerCase();
                const isSuccess = outputLower.includes('successful') || outputLower.includes('success');
                const isFailed = outputLower.includes('failed') || outputLower.includes('error') || outputLower.includes('conflict');
                
                // Check if token file was created
                setTimeout(() => {
                    if (fs.existsSync(tokenOutputPath)) {
                        const tokenContent = fs.readFileSync(tokenOutputPath, 'utf8');
                        if (tokenContent && tokenContent.length > 100) {
                            console.log(`[EA] SUCCESS! Token file found: ${tokenContent.length} chars`);
                            
                            // Mark token as used
                            if (db.markEATokenUsed && ticket.reservedTokenId) {
                                db.markEATokenUsed(ticket.reservedTokenId, ticket.userId, ticket.username, ticket.id);
                            }
                            
                            // Update panel after token use
                            updateEAPanel();
                            
                            resolve({ 
                                success: true, 
                                tokenFile: tokenOutputPath,
                                tokenText: tokenContent,
                                accountUsed: 'EAgen' 
                            });
                        } else {
                            console.log(`[EA] Token file exists but empty or too short`);
                            resolve({ success: false, error: 'Token file generated but appears invalid.' });
                        }
                    } else if (isSuccess) {
                        console.log(`[EA] Console said success but no token file found`);
                        resolve({ success: false, error: 'Generation reported success but token file not found.' });
                    } else if (isFailed) {
                        // Extract error message if possible
                        let errorMsg = 'Token generation failed';
                        if (outputLower.includes('conflict')) {
                            errorMsg = 'Conflict error - token may already exist';
                        }
                        console.log(`[EA] Generation failed: ${errorMsg}`);
                        resolve({ success: false, error: errorMsg });
                    } else {
                        console.log(`[EA] Unknown result - no token file, unclear console output`);
                        resolve({ success: false, error: 'Generation result unclear. Staff will check.' });
                    }
                }, 2000); // Wait 2 seconds for file to be written
            });
            
            child.on('error', (err) => {
                clearTimeout(timeout);
                console.error(`[EA] Process error: ${err.message}`);
                resolve({ success: false, error: `Process error: ${err.message}` });
            });
            
        } catch (err) {
            console.error('[EA] Exception:', err);
            resolve({ success: false, error: err.message });
        }
    });
}

async function closeEATicket(ticketId, reason, channel) {
    const ticket = activeEATickets.get(ticketId);
    if (!ticket) return;
    
    clearAllEATicketTimers(ticketId);
    
    ticket.status = 'closed';
    
    // Release reserved token if not completed
    if (reason !== 'completed' && db.releaseEAToken) {
        db.releaseEAToken(ticketId);
        console.log(`[EA] Released reserved token for ticket ${ticketId} (reason: ${reason})`);
    }
    
    // Save transcript
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const transcript = messages.reverse().map(m => ({
            author: m.author.username,
            authorId: m.author.id,
            content: m.content,
            timestamp: m.createdTimestamp,
            attachments: m.attachments.map(a => a.url)
        }));
        
        if (db.saveEATranscript) {
            db.saveEATranscript(ticketId, ticket.threadId, ticket.userId, ticket.username, ticket.gameName, JSON.stringify(transcript));
        }
    } catch (e) {
        console.error('[EA] Transcript error:', e.message);
    }
    
    // Update database
    if (db.closeEATicket) {
        db.closeEATicket(ticketId, reason);
    }
    
    // Log close event
    await logTicketEvent(ticket, 'closed', { reason, platform: 'ea' });
    
    // Update panel
    updateEAPanel();
    
    // Send close message
    const closeEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🔒 Ticket Closed')
        .setDescription(`**Reason:** ${reason}`)
        .setFooter({ text: `Ticket: ${ticketId}` })
        .setTimestamp();
    
    try {
        await channel.send({ embeds: [closeEmbed] });
    } catch (e) {}
    
    // Delete thread after short delay
    setTimeout(async () => {
        try {
            await channel.delete();
        } catch (e) {
            // If delete fails, try archive as fallback
            try { await channel.setArchived(true); } catch (e2) {}
        }
    }, 3000);
    
    activeEATickets.delete(ticketId);
    
    console.log(`[EA] Ticket ${ticketId} closed: ${reason}`);
}

// ============================================================================

async function createTicket(interaction, gameId) {
    try { await interaction.deferReply({ ephemeral: true }); } catch (e) { return; }
    
    const game = db.getGame(gameId);
    if (!game) return interaction.editReply({ content: '❌ Game not found.' });
    
    // =========================================================================
    // SERVER MEMBERSHIP CHECK
    // User MUST be in the main server AND (paid OR free server)
    // =========================================================================
    const MAIN_SERVER_ID = process.env.MAIN_SERVER_ID || '1265271912037089312';
    const PAID_SERVER_ID = process.env.PAID_SERVER_ID || '1265025550485950634';
    const FREE_SERVER_ID = process.env.FREE_SERVER_ID || '1310909523715690536';
    
    let isInMainServer = false;
    let isInPaidServer = false;
    let isInFreeServer = false;
    
    try {
        // Check main server membership (REQUIRED)
        const mainGuild = await client.guilds.fetch(MAIN_SERVER_ID).catch(() => null);
        if (mainGuild) {
            const mainMember = await mainGuild.members.fetch(interaction.user.id).catch(() => null);
            isInMainServer = !!mainMember;
        }
        
        // Check paid server membership
        const paidGuild = await client.guilds.fetch(PAID_SERVER_ID).catch(() => null);
        if (paidGuild) {
            const paidMember = await paidGuild.members.fetch(interaction.user.id).catch(() => null);
            isInPaidServer = !!paidMember;
        }
        
        // Check free server membership
        const freeGuild = await client.guilds.fetch(FREE_SERVER_ID).catch(() => null);
        if (freeGuild) {
            const freeMember = await freeGuild.members.fetch(interaction.user.id).catch(() => null);
            isInFreeServer = !!freeMember;
        }
        
        console.log(`[Ticket] Server check for ${interaction.user.username}: Main=${isInMainServer}, Paid=${isInPaidServer}, Free=${isInFreeServer}`);
        
    } catch (err) {
        console.log(`[Ticket] Error checking server membership: ${err.message}`);
    }
    
    // Must be in main server
    if (!isInMainServer) {
        return interaction.editReply({ 
            content: '❌ **Main Server Membership Required**\n\nYou must be a member of the **PubsLounge Main Server** to open a ticket.\n\nPlease join our main server first and try again!' 
        });
    }
    
    // Must also be in either paid OR free server
    if (!isInPaidServer && !isInFreeServer) {
        return interaction.editReply({ 
            content: '❌ **Tier Server Membership Required**\n\nYou are in the main server ✅ but you also need to be in one of our tier servers:\n\n• **Paid Server** - For donators\n• **Free Server** - For free activations\n\nPlease join one of these servers and try again!' 
        });
    }
    // =========================================================================
    
    // Check if user is timed out (Discord timeout feature)
    if (interaction.member?.communicationDisabledUntil) {
        const timeoutEnd = new Date(interaction.member.communicationDisabledUntil);
        if (timeoutEnd > new Date()) {
            return interaction.editReply({ 
                content: '❌ **You currently have a timeout**\n\nThis could be due to cooldown on Non Steam games.\n\nPlease try again after your timeout is over.' 
            });
        }
    }
    
    // Check for Non-Steam high demand cooldown role (specific server)
    // This role ONLY blocks high demand games, not normal games
    const NON_STEAM_COOLDOWN_ROLE = '1387728192051347556';
    const NON_STEAM_SERVER_ID = '1310909523715690536';
    
    // Only check this role for HIGH DEMAND games
    if (game.demand_type === 'high') {
        try {
            let hasNonSteamCooldownRole = false;
            
            // Check if we're in the specific server OR check the user's roles in that server
            if (interaction.guild.id === NON_STEAM_SERVER_ID) {
                // We're in the server, check directly
                hasNonSteamCooldownRole = interaction.member?.roles?.cache?.has(NON_STEAM_COOLDOWN_ROLE);
            } else {
                // We're in a different server, try to check the user's roles in the Non-Steam server
                const nonSteamGuild = await client.guilds.fetch(NON_STEAM_SERVER_ID).catch(() => null);
                if (nonSteamGuild) {
                    const memberInNonSteam = await nonSteamGuild.members.fetch(interaction.user.id).catch(() => null);
                    hasNonSteamCooldownRole = memberInNonSteam?.roles?.cache?.has(NON_STEAM_COOLDOWN_ROLE);
                }
            }
            
            if (hasNonSteamCooldownRole) {
                return interaction.editReply({ 
                    content: '❌ **You currently have a Non Steam game high demand cooldown**\n\nYou cannot request high demand games while you have this role.\n\n💡 **You can still request normal (non-HD) games!**\n\nPlease try again after 7 days from your last HD activation.' 
                });
            }
        } catch (err) {
            console.log(`[Ticket] Error checking Non-Steam cooldown role: ${err.message}`);
        }
    }
    
    const existingTicket = db.getUserOpenTicket(interaction.user.id, interaction.guild.id);
    if (existingTicket) return interaction.editReply({ content: '❌ You already have an open ticket!' });
    
    // =========================================================================
    // PER-GAME 24-HOUR COOLDOWN (Anti-Reseller - No exceptions)
    // =========================================================================
    const gameCooldown = db.checkGameCooldown(interaction.user.id, gameId, 'steam');
    if (gameCooldown) {
        const expiresAt = new Date(gameCooldown.expires_at);
        const timeLeft = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60)); // hours
        return interaction.editReply({ 
            content: `❌ **Game Cooldown Active**\n\nYou already requested **${game.game_name}** recently.\n\n⏰ You can request this game again <t:${Math.floor(expiresAt.getTime() / 1000)}:R>\n\n💡 You can still request **other games** while on cooldown for this one.` 
        });
    }
    // =========================================================================
    
    const cooldown = db.getUniversalCooldown(interaction.user.id, 'ticket');
    if (cooldown) {
        const expiresAt = new Date(cooldown.expires_at);
        return interaction.editReply({ content: `❌ On cooldown! Try again <t:${Math.floor(expiresAt.getTime() / 1000)}:R>` });
    }
    
    if (game.demand_type === 'high') {
        const hdCooldown = db.getUniversalCooldown(interaction.user.id, 'high_demand');
        if (hdCooldown) {
            const expiresAt = new Date(hdCooldown.expires_at);
            return interaction.editReply({ content: `🔥 High demand cooldown! Try again <t:${Math.floor(expiresAt.getTime() / 1000)}:R>\n\n💡 You can still request normal demand games!` });
        }
    }
    
    // Check available tokens (excludes reserved)
    const available = db.getAvailableTokenCount(gameId);
    if (available <= 0) {
        return interaction.editReply({ content: `❌ No tokens available for **${game.game_name}**.` });
    }
    
    try {
        const serverTicketChannelId = db.getServerTicketChannel(interaction.guild.id);
        const ticketChannelId = serverTicketChannelId || config.ticketChannelId || config.forumChannelId;
        const ticketChannel = await client.channels.fetch(ticketChannelId);
        
        if (ticketChannel.guild?.id !== interaction.guild.id) {
            return interaction.editReply({ content: '❌ Ticket channel not configured for this server. Ask an admin to run `/setup`.' });
        }
        
        const ticketId = generateTicketId();
        
        // RESERVE TOKEN IMMEDIATELY
        const reserveResult = db.reserveToken(gameId, ticketId);
        if (reserveResult.changes === 0) {
            return interaction.editReply({ content: `❌ No tokens available for **${game.game_name}**. Someone just took the last one!` });
        }
        console.log(`[Ticket] Reserved token for ${ticketId}`);
        
        const isHighDemand = game.demand_type === 'high';
        
        // Issue #13 FIX - Better intro explaining the process
        const embed = new EmbedBuilder()
            .setColor(isHighDemand ? 0xFF6600 : 0x5865F2)
            .setTitle(`🎫 ${game.game_name}`)
            .setDescription(`Welcome **${interaction.user.username}**!\n\n${isHighDemand ? '🔥 **HIGH DEMAND GAME** - Longer cooldown for free users\n\n' : ''}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
            .addFields(
                { name: '📖 How This Works', value: '1️⃣ Tell us if this is a refill or new activation\n2️⃣ Upload screenshots for verification\n3️⃣ Get your activation token\n4️⃣ Follow the setup instructions', inline: false },
                { name: '❓ Is this a refill?', value: 'A refill is when you **already have** this game activated and need a new token (e.g., after PC reset, Windows reinstall).', inline: false },
                { name: '🔘 Button Guide', value: '• **New Activation** - First time activating this game\n• **Refill** - You had this game before and need a new token\n• **Close** - Cancel and close this ticket', inline: false }
            )
            .setFooter({ text: `Ticket: ${ticketId} • Token reserved for you!` })
            .setTimestamp();
        
        if (game.cover_url) embed.setThumbnail(game.cover_url);
        
        let thread;
        if (ticketChannel.type === ChannelType.GuildForum) {
            thread = await ticketChannel.threads.create({
                name: `🎫 ${interaction.user.username} | ${game.game_name}`,
                autoArchiveDuration: 1440,
                message: { content: `<@${interaction.user.id}>`, embeds: [embed] }
            });
        } else {
            thread = await ticketChannel.threads.create({
                name: `🎫 ${interaction.user.username} | ${game.game_name}`,
                autoArchiveDuration: 1440,
                type: ChannelType.PrivateThread,
                invitable: false,
                reason: `Ticket for ${interaction.user.username}`
            });
            await thread.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });
            await thread.members.add(interaction.user.id);
        }
        
        // Issue #14 FIX - New Activation FIRST, Refill SECOND
        // Issue #13 FIX - No SOS button at start
        const refillButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`refill_no_${ticketId}`).setLabel('New Activation').setEmoji('🆕').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`refill_yes_${ticketId}`).setLabel('Refill').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`close_ticket_${ticketId}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
        );
        await thread.send({ components: [refillButtons] });
        
        const ticketData = {
            id: ticketId, threadId: thread.id, channelId: thread.id, userId: interaction.user.id,
            username: interaction.user.username, gameId, gameName: game.game_name,
            folderName: game.folder_name || game.game_name, guildId: interaction.guild.id,
            isRefill: false, steamId: null, status: 'awaiting_refill_choice', platform: 'steam',
            collectedScreenshots: [], helpRequested: false, activationRequested: false,
            generationInProgress: false, tokenReserved: true, createdAt: Date.now()
        };
        
        activeTickets.set(ticketId, ticketData);
        db.createTicket(ticketId, thread.id, interaction.guild.id, interaction.user.id, interaction.user.username, gameId);
        startInactivityTimer(ticketId, thread);
        
        // NEW - Log ticket opened
        await logTicketEvent(ticketData, 'opened', { reason: 'User opened ticket' });
        
        // Issue #2 FIX - Update panel to reflect reserved token
        await updatePanel();
        
        await interaction.editReply({ content: `✅ Ticket created! Head to ${thread}` });
    } catch (err) {
        console.error('Ticket creation error:', err);
        // Release reserved token on error - but only if ticketId was created
        // ticketId is defined inside try block, so we can't reference it here
        // The token reservation happens AFTER ticketId is created, so if we get here
        // before that point, there's nothing to release
        await interaction.editReply({ content: '❌ Failed to create ticket. Please ask an admin to run `/setticketchannel` in the correct channel.' }).catch(() => {});
    }
}

// ============================================================================
// END OF PART 2 - Continue to Part 3
// ============================================================================
// ============================================================================
// 🍺 PUB'S BARTENDER BOT V2.1 - COMPLETE FIXED VERSION
// Part 3 of 4 - Screenshot Handling, Token Generation, Response Handlers
// ============================================================================

// ============================================================================
// SCREENSHOT HANDLING
// ============================================================================

async function handleScreenshot(message) {
    const ticket = Array.from(activeTickets.values()).find(t => t.threadId === message.channel.id);
    if (!ticket || message.author.id !== ticket.userId) return;
    
    // Accept screenshots for both Windows and Linux/Mac flows
    if (ticket.status !== 'awaiting_screenshot' && ticket.status !== 'awaiting_linux_screenshot') return;
    
    resetInactivityTimer(ticket.id, message.channel);
    
    const images = message.attachments.filter(a => a.contentType?.startsWith('image/'));
    if (images.size === 0) return;
    
    if (!ticket.collectedScreenshots) ticket.collectedScreenshots = [];
    
    let tooSmallCount = 0;
    for (const [, image] of images) {
        if (image.size < 10 * 1024) { tooSmallCount++; continue; }
        ticket.collectedScreenshots.push({ url: image.url, proxyURL: image.proxyURL, name: image.name, size: image.size });
    }
    
    if (tooSmallCount > 0 && ticket.collectedScreenshots.length === 0) {
        await message.reply({ content: `⚠️ Image(s) too small. Please upload actual screenshots.` }).catch(() => {});
        return;
    }
    
    clearTicketTimer(ticket.id, 'screenshot');
    
    // Different UI for Linux/Mac vs Windows
    if (ticket.isLinuxMac) {
        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle('🐧 Linux/Mac Screenshots Received!')
            .setDescription(`You've uploaded **${ticket.collectedScreenshots.length}** screenshot(s).\n\n✅ Upload more if needed, then click **Submit for Review** when ready.`)
            .addFields({ name: '📋 Required', value: '• Game folder with files\n• File manager showing location\n• Proof of installation', inline: false })
            .setThumbnail(ticket.collectedScreenshots[ticket.collectedScreenshots.length - 1].url);
        
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`linux_submit_${ticket.id}`).setLabel(`Submit ${ticket.collectedScreenshots.length} for Review`).setEmoji('📤').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`clear_screenshots_${ticket.id}`).setLabel('Clear All').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
        );
        
        if (ticket.submitMessageId) {
            try { const oldMsg = await message.channel.messages.fetch(ticket.submitMessageId); await oldMsg.delete(); } catch (e) {}
        }
        
        const submitMsg = await message.channel.send({ embeds: [embed], components: [buttons] });
        ticket.submitMessageId = submitMsg.id;
    } else {
        // Windows flow - original code
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📸 Screenshots Received!')
            .setDescription(`You've uploaded **${ticket.collectedScreenshots.length}** screenshot(s).\n\n✅ Upload more if needed, then click **Submit** when ready.`)
            .addFields({ name: '📋 Required Screenshots', value: '• Game folder properties (showing size)\n• Windows Update Blocker (showing DISABLED - red X)', inline: false })
            .setThumbnail(ticket.collectedScreenshots[ticket.collectedScreenshots.length - 1].url);
        
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`submit_screenshots_${ticket.id}`).setLabel(`Submit ${ticket.collectedScreenshots.length} Screenshot(s)`).setEmoji('✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`clear_screenshots_${ticket.id}`).setLabel('Clear All').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
        );
        
        if (ticket.submitMessageId) {
            try { const oldMsg = await message.channel.messages.fetch(ticket.submitMessageId); await oldMsg.delete(); } catch (e) {}
        }
        
        const submitMsg = await message.channel.send({ embeds: [embed], components: [buttons] });
        ticket.submitMessageId = submitMsg.id;
        startScreenshotTimer(ticket.id, message.channel);
    }
}

// Issue #18 FIX - Prevent self-verification during staff review
async function processScreenshots(interaction, ticketId) {
    const ticket = activeTickets.get(ticketId);
    if (!ticket || !ticket.collectedScreenshots || ticket.collectedScreenshots.length === 0) return;
    if (ticket.processingScreenshots) return;
    
    // Issue #18 FIX - Prevent processing if already in staff review
    if (ticket.status === 'awaiting_staff') {
        try { await interaction.reply({ content: '⏳ Your screenshots are being reviewed by staff. Please wait.', ephemeral: true }); } catch(e) {}
        return;
    }
    
    ticket.processingScreenshots = true;
    
    // Defer immediately to prevent timeout
    try { await interaction.deferUpdate(); } catch (e) { ticket.processingScreenshots = false; return; }
    
    const game = db.getGame(ticket.gameId);
    const imageUrls = ticket.collectedScreenshots.map(s => s.url);
    
    // DEBUG: Log game info being used for verification
    console.log(`[Verification] Ticket ${ticket.id} - Game lookup:`);
    console.log(`[Verification]   ticket.gameId: ${ticket.gameId}`);
    console.log(`[Verification]   ticket.gameName: ${ticket.gameName}`);
    console.log(`[Verification]   game from DB: ${game ? game.game_name : 'NOT FOUND'}`);
    console.log(`[Verification]   game.game_id: ${game?.game_id}`);
    console.log(`[Verification]   game.size_gb: ${game?.size_gb}`);
    
    // Ensure we have the correct game - use ticket's stored game name as fallback
    if (!game) {
        console.log(`[Verification] ERROR: Game not found for ID ${ticket.gameId}`);
        await interaction.channel.send({ content: `⚠️ Error: Could not find game data. Please try again or contact staff.` });
        ticket.processingScreenshots = false;
        return;
    }
    
    // Check if verification slot is available
    if (!queueManager.canStartVerification()) {
        // Add to verification queue
        const position = queueManager.addToVerificationQueue(ticket.id, ticket.username);
        
        const queueEmbed = new EmbedBuilder()
            .setColor(0xFFFF00)
            .setTitle('⏳ Queued for Verification')
            .setDescription(`Your screenshots are queued for AI verification.\n\n**Position:** #${position}\n**Estimated wait:** ~${position * 15} seconds`)
            .setFooter({ text: 'Please wait - you will be notified when verification starts' });
        
        try { await interaction.message.edit({ embeds: [queueEmbed], components: [] }); } catch (e) {}
        
        // Wait for verification slot
        const gotSlot = await waitForVerificationSlot(ticket.id, 5 * 60 * 1000); // 5 min timeout
        if (!gotSlot) {
            console.log(`[Verification] Timeout waiting for slot: ${ticket.id}`);
            ticket.processingScreenshots = false;
            queueManager.removeFromVerificationQueue(ticket.id);
            await interaction.channel.send({ content: `<@${ticket.userId}> ⚠️ Verification queue timeout. Please try again.` }).catch(() => {});
            return;
        }
    }
    
    // Start verification - claim a slot
    queueManager.startVerification(ticket.id);
    
    try {
        await runVerification(interaction, ticket, game, imageUrls);
    } finally {
        // Always release the slot
        queueManager.completeVerification(ticket.id);
        ticket.processingScreenshots = false;
    }
}

// Wait for a verification slot to become available
async function waitForVerificationSlot(ticketId, timeout = 5 * 60 * 1000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        
        const checkSlot = () => {
            // Check if we're at the front of queue and slot is available
            if (queueManager.canStartVerification() && queueManager.isNextInVerificationQueue(ticketId)) {
                resolve(true);
                return;
            }
            
            // Check timeout
            if (Date.now() - startTime > timeout) {
                resolve(false);
                return;
            }
            
            // Check again in 2 seconds
            setTimeout(checkSlot, 2000);
        };
        
        // Start checking
        setTimeout(checkSlot, 1000);
    });
}

// Run the actual verification
async function runVerification(interaction, ticket, game, imageUrls) {
    const verifyingEmbed = new EmbedBuilder().setColor(0xFFFF00).setTitle('🔍 Verifying Screenshots...').setDescription('Please wait while we check your screenshots.');
    try { await interaction.message.edit({ embeds: [verifyingEmbed], components: [] }); } catch (e) {}
    
    // Issue #12 FIX - Use game-specific folder name override
    // Try multiple lookup keys to find the right instructions
    const gameSlug = game.game_id || game.folder_name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || game.game_name?.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const gameInstr = getGameInstructions(gameSlug);
    const expectedFolderName = gameInstr.folderName || game.folder_name || game.game_name;
    
    console.log(`[Verification]   gameSlug: ${gameSlug}`);
    console.log(`[Verification]   expectedFolderName: ${expectedFolderName}`);
    
    // FIX: Pre-check for suspicious screenshots (too many small thumbnails)
    const screenshotSizes = ticket.collectedScreenshots?.map(s => s.size) || [];
    const avgSize = screenshotSizes.length > 0 ? screenshotSizes.reduce((a, b) => a + b, 0) / screenshotSizes.length : 0;
    const smallScreenshots = screenshotSizes.filter(s => s < 50 * 1024).length; // < 50KB
    
    // If most screenshots are very small, send to staff review (likely thumbnails or fake screenshots)
    if (screenshotSizes.length > 2 && smallScreenshots > screenshotSizes.length * 0.5) {
        console.log(`[Verification] Suspicious: ${smallScreenshots}/${screenshotSizes.length} screenshots are very small`);
        ticket.status = 'awaiting_staff';
        clearTicketTimer(ticket.id, 'inactivity');
        await requestManualReview(interaction.channel, ticket, game, imageUrls, `Suspicious screenshots detected: ${smallScreenshots}/${screenshotSizes.length} images appear to be thumbnails or low quality`);
        const staffReviewEmbed = new EmbedBuilder()
            .setColor(0xFFA500).setTitle('⏳ Sent to Staff Review')
            .setDescription('Your screenshots need manual verification.\n\n⚠️ **Please wait** - A staff member will review your screenshots shortly.\n\n🚫 **Do not ping or DM staff** - They have been contacted and will assist you when available.');
        try { await interaction.message.edit({ embeds: [staffReviewEmbed], components: [] }); } catch (e) {}
        await interaction.channel.send({ content: `<@${ticket.userId}> 👀 A staff member will review shortly.` }).catch(() => {});
        await logTicketEvent(ticket, 'step_change', { step: 'Sent to staff review', reason: 'Suspicious screenshot sizes' });
        ticket.collectedScreenshots = [];
        ticket.submitMessageId = null;
        return;
    }
    
    let verificationResult;
    try {
        verificationResult = await aiVerifier.verifyScreenshots(imageUrls, {
            gameName: game.game_name, 
            expectedSize: game.size_gb, 
            folderName: expectedFolderName  // Use override
        });
    } catch (aiError) {
        console.error(`[Verification] AI Error: ${aiError.message}`);
        // If AI fails completely, send to staff review instead of bypassing
        verificationResult = { decision: 'staff_review', reason: `AI verification failed: ${aiError.message}` };
    }
    
    // FIX: Ensure we have a valid decision - if not, always go to staff review
    if (!verificationResult || !verificationResult.decision || !['approve', 'reject', 'staff_review'].includes(verificationResult.decision)) {
        console.log(`[Verification] Invalid or missing AI decision, sending to staff review`);
        verificationResult = { decision: 'staff_review', reason: 'AI verification returned an uncertain result' };
    }
    
    // FIX: If confidence is low or AI is uncertain, send to staff review
    if (verificationResult.confidence && verificationResult.confidence < 0.7) {
        console.log(`[Verification] Low confidence (${verificationResult.confidence}), sending to staff review`);
        verificationResult.decision = 'staff_review';
        verificationResult.reason = `Low confidence verification (${Math.round(verificationResult.confidence * 100)}%)`;
    }
    
    // Issue #8 & #9 FIX - Additional checks after Gemini response
    // Track if WUB is missing for special handling
    let wubMissing = false;
    
    if (verificationResult.details) {
        const d = verificationResult.details;
        // Check WUB visibility
        if (d.wubStatusVisible === false || d.wubColor === 'not_visible') {
            wubMissing = true;
            verificationResult.decision = 'reject';
            verificationResult.reason = 'Windows Update Blocker screenshot not detected.';
        } else if (d.wubColor === 'green') {
            verificationResult.decision = 'reject';
            verificationResult.reason = 'Windows Update Blocker must show DISABLED (red X), not enabled (green).';
        }
        // Check folder name
        if (d.folderNameOk === false) {
            verificationResult.decision = 'reject';
            verificationResult.reason = `Folder name "${d.folderName}" does not match expected game "${expectedFolderName}".`;
        }
        // Issue #8 FIX - Check size vs size on disk match
        if (d.sizesMatch === false) {
            verificationResult.decision = 'reject';
            verificationResult.reason = `Size mismatch: Size=${d.sizeGB}GB but Size on disk=${d.sizeOnDiskGB}GB. Please upload real screenshots.`;
        }
    }
    
    if (verificationResult.decision === 'approve') {
        ticket.status = 'screenshot_approved';
        db.markScreenshotVerified(ticket.id);
        
        // Log step change
        await logTicketEvent(ticket, 'step_change', { step: 'Screenshots approved by AI' });
        
        const approveEmbed = new EmbedBuilder()
            .setColor(0x00FF00).setTitle('✅ Screenshots Verified!')
            .setDescription('Your screenshots have been auto-approved. Click the button below to get your activation.')
            .addFields(
                { name: '🎮 Game', value: game.game_name, inline: true },
                { name: '🚨 Rules to Keep Your Game Working', value: '```• Never launch from Steam/Ubisoft/EA\n• Keep Windows Update Blocker enabled\n• Never update your game files```', inline: false }
            )
            .setImage(imageUrls[0]);
        
        const button = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`get_activation_${ticket.id}`).setLabel('Get Activation').setEmoji('🎮').setStyle(ButtonStyle.Success)
        );
        
        try { await interaction.message.edit({ embeds: [approveEmbed], components: [button] }); }
        catch (e) { await interaction.channel.send({ content: `<@${ticket.userId}>`, embeds: [approveEmbed], components: [button] }); }
        await interaction.channel.send({ content: `<@${ticket.userId}> ✅ Your screenshots are verified!` }).catch(() => {});
        
    } else if (verificationResult.decision === 'reject') {
        ticket.status = 'awaiting_screenshot';
        
        // Special handling for missing WUB
        if (wubMissing) {
            const wubEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🛡️ Turn Off Windows Updates')
                .setDescription('**Windows Update Blocker (WUB) screenshot is required!**\n\nDisable Windows Updates using WUB v1.8')
                .addFields(
                    { name: '⚠️ Important Requirements', value: '• Take a clear screenshot of WUB showing the **RED shield with the X**\n• Pausing updates through Windows Settings will **NOT BE ACCEPTED**', inline: false },
                    { name: '🚫 NO TOKEN', value: 'No token will be issued without the required WUB screenshot.', inline: false }
                )
                .setImage('attachment://wub-example.png')
                .setFooter({ text: 'Upload a new screenshot showing WUB with the red X' });
            
            const wubButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Windows Update Blocker').setEmoji('🛡️').setStyle(ButtonStyle.Link).setURL('https://tiny.cc/KeepTokenSafe'),
                new ButtonBuilder().setCustomId(`early_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`close_ticket_${ticket.id}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
            );
            
            // Send with the WUB example image attached
            const wubImagePath = path.join(__dirname, 'web', 'public', 'wub-example.png');
            let attachment = null;
            if (fs.existsSync(wubImagePath)) {
                attachment = new AttachmentBuilder(wubImagePath, { name: 'wub-example.png' });
            }
            
            try { 
                await interaction.message.edit({ embeds: [wubEmbed], components: [wubButtons], files: attachment ? [attachment] : [] }); 
            } catch (e) { 
                await interaction.channel.send({ 
                    content: `<@${ticket.userId}>`, 
                    embeds: [wubEmbed], 
                    components: [wubButtons],
                    files: attachment ? [attachment] : []
                }); 
            }
            await interaction.channel.send({ content: `<@${ticket.userId}> ⚠️ **WUB screenshot required!** Download and run Windows Update Blocker, then upload a new screenshot.` }).catch(() => {});
            
        } else {
            // Standard rejection (not WUB related)
            const rejectEmbed = new EmbedBuilder()
                .setColor(0xFF0000).setTitle('❌ Screenshot Verification Failed')
                .setDescription(`**Issue:** ${verificationResult.reason}\n\nPlease upload new screenshots.`)
                .addFields(
                    { name: '📦 Expected Size', value: game.size_gb ? `~${game.size_gb} GB` : 'Any size', inline: true },
                    { name: '🎮 Expected Folder', value: expectedFolderName, inline: true }
                )
                .setImage(imageUrls[0]);
            
            // Issue #13 FIX - Show SOS button after rejection
            const retryButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`early_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`close_ticket_${ticket.id}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
            );
            
            try { await interaction.message.edit({ embeds: [rejectEmbed], components: [retryButtons] }); }
            catch (e) { await interaction.channel.send({ embeds: [rejectEmbed], components: [retryButtons] }); }
            await interaction.channel.send({ content: `<@${ticket.userId}> ⚠️ Please upload new screenshots.` }).catch(() => {});
        }
        
        ticket.collectedScreenshots = [];
        ticket.submitMessageId = null;
        startScreenshotTimer(ticket.id, interaction.channel);
        
    } else {
        // Staff review
        ticket.status = 'awaiting_staff';
        
        // Pause inactivity timer - staff will handle from here
        clearTicketTimer(ticket.id, 'inactivity');
        
        await requestManualReview(interaction.channel, ticket, game, imageUrls, `AI Verification Uncertain: ${verificationResult.reason}`);
        
        // Issue #18 FIX - No buttons during staff review
        const staffReviewEmbed = new EmbedBuilder()
            .setColor(0xFFA500).setTitle('⏳ Sent to Staff Review')
            .setDescription('Your screenshots need manual verification.\n\n⚠️ **Please wait** - A staff member will review your screenshots shortly.\n\n🚫 **Do not ping or DM staff** - They have been contacted and will assist you when available. Pinging or DM\'ing staff will result in a timeout and your ticket being closed.');
        
        try { await interaction.message.edit({ embeds: [staffReviewEmbed], components: [] }); }
        catch (e) { await interaction.channel.send({ embeds: [staffReviewEmbed] }); }
        await interaction.channel.send({ content: `<@${ticket.userId}> 👀 A staff member will review shortly.` }).catch(() => {});
        
        // Log step change
        await logTicketEvent(ticket, 'step_change', { step: 'Sent to staff review', reason: verificationResult.reason });
    }
    
    ticket.collectedScreenshots = [];
    ticket.submitMessageId = null;
}

async function askForScreenshots(interaction, ticket) {
    ticket.status = 'awaiting_screenshot';
    ticket.collectedScreenshots = [];
    
    const game = db.getGame(ticket.gameId);
    
    // Issue #12 FIX - Use game-specific folder name override
    const gameInstr = getGameInstructions(game.game_id || game.folder_name || game.game_name);
    const expectedFolderName = gameInstr.folderName || game.folder_name || game.game_name;
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2).setTitle('📸 Screenshot Required')
        .setDescription('Please upload screenshot(s) showing:')
        .addFields(
            { name: '📋 Required', value: '• Game folder properties (showing size)\n• Windows Update Blocker (showing DISABLED - red X icon)', inline: false },
            { name: '⏱️ Time Limit', value: '10 minutes', inline: true },
            { name: '📦 Expected Size', value: game.size_gb ? `~${game.size_gb} GB` : 'Any size', inline: true },
            { name: '📁 Expected Folder', value: expectedFolderName, inline: true },
            { name: '🚨 Rules', value: '```• Never launch from Steam\n• Keep WUB enabled\n• Never update game files```', inline: false }
        );
    
    // Issue #13 FIX - Show SOS button after first step
    // Button order: SOS, Close, Linux/Mac
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`early_help_${ticket.id}`).setLabel(ticket.helpRequested ? 'Help Requested' : 'Need Help').setEmoji('🆘').setStyle(ticket.helpRequested ? ButtonStyle.Secondary : ButtonStyle.Danger).setDisabled(ticket.helpRequested),
        new ButtonBuilder().setCustomId(`close_ticket_${ticket.id}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`linux_mac_${ticket.id}`).setLabel('Linux/Mac').setEmoji('🐧').setStyle(ButtonStyle.Primary)
    );
    
    await interaction.update({ embeds: [embed], components: [buttons] });
    
    // Log step change
    await logTicketEvent(ticket, 'step_change', { step: 'Awaiting screenshots' });
    
    startScreenshotTimer(ticket.id, interaction.channel);
}

async function requestManualReview(channel, ticket, game, imageUrls, reason) {
    ticket.status = 'awaiting_staff';
    const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
    
    const embed = new EmbedBuilder()
        .setColor(0xFFA500).setTitle('⚠️ Staff Review Required')
        .setDescription(`**${reason}**`)
        .addFields(
            { name: '🎮 Game', value: game.game_name, inline: true },
            { name: '📦 Expected', value: `${game.size_gb || '?'} GB`, inline: true },
            { name: '📸 Screenshots', value: `${urls.length} image(s)`, inline: true }
        )
        .setImage(urls[0])
        .setFooter({ text: `Ticket: ${ticket.id}` });
    
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`staff_approve_${ticket.id}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`staff_reject_${ticket.id}`).setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger)
    );
    
    await channel.send({ content: getStaffMention(ticket.guildId), embeds: [embed], components: [buttons] });
    
    for (let i = 1; i < urls.length; i++) {
        await channel.send({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle(`📸 Screenshot ${i + 1}/${urls.length}`).setImage(urls[i])] });
    }
}

// ============================================================================
// TOKEN GENERATION VIA QUEUE SYSTEM
// ============================================================================

async function handleGetActivation(interaction, ticketId) {
    const ticket = activeTickets.get(ticketId);
    if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true }).catch(() => {});
    if (interaction.user.id !== ticket.userId) return interaction.reply({ content: '❌ Not your ticket.', ephemeral: true }).catch(() => {});
    
    if (ticket.generationInProgress) return interaction.reply({ content: '⏳ Already generating...', ephemeral: true }).catch(() => {});
    
    // Verify token is still reserved
    if (!db.hasReservedToken(ticketId)) {
        return interaction.reply({ 
            content: '❌ Your reserved token has expired. Please create a new ticket.', 
            ephemeral: true 
        }).catch(() => {});
    }
    
    ticket.generationInProgress = true;
    ticket.activationRequested = true;
    
    try { await interaction.deferUpdate(); } catch (e) { ticket.generationInProgress = false; return; }
    
    if (!queueHelper) {
        ticket.generationInProgress = false;
        await interaction.channel.send({ content: `${getStaffMention(ticket.guildId)} ❌ Queue system not initialized.` });
        return;
    }
    
    const gameInfo = db.getGame(ticket.gameId);
    
    // Log step change
    await logTicketEvent(ticket, 'step_change', { step: 'Queued for token generation' });
    
    try {
        console.log(`[Queue] Adding: ${ticket.gameName} for ${ticket.username}`);
        
        const queueResult = await queueHelper.addToQueue({
            gameId: ticket.gameId, ticketId: ticket.id, channelId: ticket.threadId,
            userId: ticket.userId, username: ticket.username, steamId: ticket.steamId || ''
        });
        
        if (!queueResult.success) throw new Error(queueResult.error || 'Failed to add to queue');
        
        console.log(`[Queue] Position #${queueResult.position}, ETA: ${queueResult.etaFormatted}`);
        
        // Get game name from ticket or database
        const gameName = ticket.gameName || gameInfo?.game_name || 'Unknown Game';
        
        const queueEmbed = new EmbedBuilder()
            .setColor(0xFFFF00)
            .setTitle('⏳ Queued for Generation')
            .setDescription('Your request has been added to the queue.')
            .addFields(
                { name: '📊 Position', value: `#${queueResult.position || 1}`, inline: true },
                { name: '⏱️ ETA', value: queueResult.etaFormatted || '~1 min', inline: true },
                { name: '🎮 Game', value: gameName, inline: true }
            )
            .setFooter({ text: "You'll be pinged when you're #1 and when ready!" });
        if (gameInfo?.cover_url) queueEmbed.setThumbnail(gameInfo.cover_url);
        
        let queueMessage;
        try { queueMessage = await interaction.editReply({ embeds: [queueEmbed], components: [] }); }
        catch (e) { queueMessage = await interaction.channel.send({ embeds: [queueEmbed] }); }
        
        ticket.queueMessageId = queueMessage.id;
        
        if (activeQueueWatchers.has(ticket.id)) {
            activeQueueWatchers.get(ticket.id)();
            activeQueueWatchers.delete(ticket.id);
        }
        
        const stopWatching = queueHelper.startWatching({
            ticketId: ticket.id, channelId: ticket.threadId, messageId: queueMessage.id, userId: ticket.userId,
            
            onPositionUpdate: async (update) => {
                try {
                    const channel = await client.channels.fetch(ticket.threadId);
                    if (!channel) return;
                    
                    if (update.position === 1 && update.shouldPing) {
                        const nextEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('🎉 You\'re Next!')
                            .setDescription('Your token is about to be generated!')
                            .addFields(
                                { name: '📊 Position', value: '#1', inline: true },
                                { name: '🎮 Game', value: ticket.gameName, inline: true }
                            )
                            .setFooter({ text: 'Processing will begin momentarily...' });
                        if (gameInfo?.cover_url) nextEmbed.setThumbnail(gameInfo.cover_url);
                        await channel.send({ content: `<@${ticket.userId}> 🎉 **You're next!**`, embeds: [nextEmbed] });
                    } else {
                        const updateEmbed = new EmbedBuilder()
                            .setColor(update.position === 1 ? 0x00FF00 : 0xFFFF00)
                            .setTitle(update.position === 1 ? '🎉 You\'re Next!' : '⏳ Queue Position Updated')
                            .addFields(
                                { name: '📊 Position', value: `#${update.position}`, inline: true },
                                { name: '⏱️ ETA', value: update.etaFormatted || 'Calculating...', inline: true },
                                { name: '🎮 Game', value: ticket.gameName, inline: true }
                            )
                            .setFooter({ text: "You'll be pinged when you're #1 and when ready!" });
                        if (gameInfo?.cover_url) updateEmbed.setThumbnail(gameInfo.cover_url);
                        try {
                            const msg = await channel.messages.fetch(ticket.queueMessageId);
                            await msg.edit({ embeds: [updateEmbed] });
                        } catch (e) {
                            const newMsg = await channel.send({ embeds: [updateEmbed] });
                            ticket.queueMessageId = newMsg.id;
                        }
                    }
                } catch (e) { console.error('[Queue] Position update error:', e.message); }
            },
            
            onProcessing: async () => {
                try {
                    const channel = await client.channels.fetch(ticket.threadId);
                    if (!channel) return;
                    
                    const processingEmbed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('⚡ Generating Your Token...')
                        .setDescription('Please wait while we generate your activation token.')
                        .addFields({ name: '🎮 Game', value: ticket.gameName, inline: true })
                        .setFooter({ text: 'This can take up to 10 minutes. If you wait longer, hit the help button.' });
                    if (gameInfo?.cover_url) processingEmbed.setThumbnail(gameInfo.cover_url);
                    
                    const helpButton = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`early_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger)
                    );
                    
                    try {
                        const msg = await channel.messages.fetch(ticket.queueMessageId);
                        await msg.edit({ embeds: [processingEmbed], components: [helpButton] });
                    } catch (e) { await channel.send({ embeds: [processingEmbed], components: [helpButton] }); }
                } catch (e) { console.error('[Queue] Processing error:', e.message); }
            },
            
            onComplete: async (result) => {
                try {
                    console.log(`[Queue] Token ready for ${ticket.username}`);
                    activeQueueWatchers.delete(ticket.id);
                    
                    const channel = await client.channels.fetch(ticket.threadId);
                    if (!channel) return;
                    
                    // USE the reserved token - this starts the 24h timer
                    db.useReservedToken(ticket.id, ticket.userId, ticket.username);
                    console.log(`[Token] Reserved token used for ${ticket.id} - 24h timer started`);
                    
                    ticket.status = 'token_sent';
                    ticket.generationInProgress = false;
                    db.markTokenSent(ticket.id);
                    clearTicketTimer(ticket.id, 'inactivity');
                    
                    // Issue #2 FIX - Update panel after token used
                    await updatePanel();
                    
                    // Get game from database to check for custom instructions/download links
                    const game = db.getGame(ticket.gameId);
                    const gameSlug = game?.game_id || game?.folder_name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || ticket.gameId;
                    console.log(`[Instructions] Looking up: gameId=${ticket.gameId}, gameSlug=${gameSlug}, gameName=${game?.game_name}`);
                    
                    // Prefer database instructions, fall back to hardcoded
                    let instructions;
                    if (game?.instructions) {
                        instructions = { instructions: game.instructions, troubleshooting: null };
                        console.log(`[Instructions] Using database instructions for ${game.game_name}`);
                    } else {
                        instructions = getGameInstructions(gameSlug);
                        console.log(`[Instructions] Found: ${instructions === defaultInstructions ? 'DEFAULT' : 'CUSTOM (hardcoded)'}`);
                    }
                    
                    // Issue #3 FIX - Add save data check message for refills
                    let refillNote = '';
                    if (ticket.isRefill) {
                        refillNote = '\n\n⚠️ **REFILL NOTE:** Please check your save data is working before confirming the game is working!';
                    }
                    
                    const responseButtons = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`it_works_${ticket.id}`).setLabel('It Works!').setEmoji('✅').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`need_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setLabel('Video Guide').setEmoji('🎬').setStyle(ButtonStyle.Link).setURL(config.videoGuideUrl)
                    );
                    
                    // Build description with download link and instructions
                    let embedDescription = `**Download:** [${result.gameName} Token](${result.downloadUrl})\n\n`;
                    
                    // Add download links from database if available
                    if (game?.download_links) {
                        embedDescription += `**📥 Game Download:**\n${game.download_links}\n\n`;
                    }
                    
                    embedDescription += `${instructions.instructions}${refillNote}`;
                    
                    const successEmbed = new EmbedBuilder()
                        .setColor(0x00FF00).setTitle('🎉 Here\'s Your Activation!')
                        .setDescription(embedDescription.substring(0, 4000));
                    
                    successEmbed.addFields({ name: '⏱️ Link expires in 60 minutes!', value: 'Download, extract, launch, and confirm below.', inline: false });
                    
                    if (game?.cover_url) successEmbed.setThumbnail(game.cover_url);
                    if (instructions.troubleshooting) successEmbed.addFields({ name: '🔧 Troubleshooting', value: instructions.troubleshooting, inline: false });
                    
                    await channel.send({ content: `<@${ticket.userId}> 🎉 **Your token is ready!**`, embeds: [successEmbed], components: [responseButtons] });
                    startResponseTimer(ticket.id, channel);
                    
                    // Set per-game 24h cooldown immediately when token is delivered (anti-reseller)
                    db.setGameCooldown(ticket.userId, ticket.gameId, 'steam', 24);
                    
                    // Log step change
                    await logTicketEvent(ticket, 'step_change', { step: 'Token sent to user' });
                    
                } catch (e) { console.error('[Queue] Complete error:', e); }
            },
            
            onFailed: async (error) => {
                try {
                    console.error(`[Queue] Failed: ${error}`);
                    activeQueueWatchers.delete(ticket.id);
                    const channel = await client.channels.fetch(ticket.threadId);
                    if (!channel) return;
                    ticket.generationInProgress = false;
                    await channel.send({ content: `${getStaffMention(ticket.guildId)} <@${ticket.userId}>`, embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Generation Failed').setDescription(`Error: ${error}\n\nStaff has been notified. Your token is still reserved.`)] });
                } catch (e) { console.error('[Queue] Failed error:', e); }
            }
        });
        
        activeQueueWatchers.set(ticket.id, stopWatching);
        
    } catch (err) {
        console.error('[Queue] Error:', err);
        ticket.generationInProgress = false;
        await interaction.channel.send({ content: getStaffMention(ticket.guildId), embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Queue Error').setDescription(`Error: ${err.message}`)] });
    }
}

// ============================================================================
// RESPONSE HANDLERS
// ============================================================================

async function handleItWorks(interaction, ticketId) {
    const ticket = activeTickets.get(ticketId);
    if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true }).catch(() => {});
    if (interaction.user.id !== ticket.userId) return interaction.reply({ content: '❌ Not your ticket.', ephemeral: true }).catch(() => {});
    
    try { await interaction.deferUpdate(); } catch (e) { return; }
    
    clearTicketTimer(ticket.id, 'response');
    if (activeQueueWatchers.has(ticket.id)) { activeQueueWatchers.get(ticket.id)(); activeQueueWatchers.delete(ticket.id); }
    
    const member = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
    const baseCooldownHours = getCooldownHours(member);
    const game = db.getGame(ticket.gameId);
    
    if (baseCooldownHours > 0) {
        db.setCooldown(ticket.userId, interaction.guild.id, 'ticket', baseCooldownHours);
        await logCooldownEvent(interaction.guild.id, ticket.userId, ticket.username, 'applied', 'ticket', baseCooldownHours, 'System (auto)', null);
    }
    if (game?.demand_type === 'high' && !isExemptFromHighDemand(member)) {
        db.setCooldown(ticket.userId, interaction.guild.id, 'high_demand', 168);
        await logCooldownEvent(interaction.guild.id, ticket.userId, ticket.username, 'applied', 'high_demand', 168, 'System (auto)', null);
    }
    
    const successEmbed = new EmbedBuilder().setColor(0x00FF00).setTitle('🎉 Awesome! Enjoy your game!').setDescription('Thanks for using Pub\'s Bartender!\n\n*Ticket will close in 1 minute.*');
    const reviewButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Leave a Review').setEmoji('⭐').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${interaction.guild.id}/${config.reviewChannelId}`)
    );
    
    await interaction.editReply({ embeds: [successEmbed], components: [reviewButton] });
    ticket.status = 'closing';
    
    // Calculate duration
    const duration = ticket.createdAt ? Math.round((Date.now() - ticket.createdAt) / 60000) : 0;
    
    // Log completed activation
    await logTicketEvent(ticket, 'completed', { 
        reason: 'User confirmed game working',
        duration: `${duration} minutes`,
        durationMinutes: duration
    });
    
    // Log to activation channel
    await logActivation(ticket, duration);
    
    startSuccessCloseTimer(ticket.id, interaction.channel);
}

async function handleNeedHelp(interaction, ticketId) {
    const ticket = activeTickets.get(ticketId);
    if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true }).catch(() => {});
    
    try { await interaction.deferUpdate(); } catch (e) { return; }
    
    clearTicketTimer(ticket.id, 'response');
    clearTicketTimer(ticket.id, 'inactivity'); // Also pause inactivity timer
    ticket.status = 'needs_help';
    ticket.helpRequested = true;
    
    try {
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`it_works_${ticket.id}`).setLabel('It Works!').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(`need_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger).setDisabled(true),
            new ButtonBuilder().setLabel('Video Guide').setEmoji('🎬').setStyle(ButtonStyle.Link).setURL(config.videoGuideUrl)
        );
        await interaction.message.edit({ components: [disabledRow] });
    } catch (e) {}
    
    await interaction.channel.send({ 
        content: getStaffMention(ticket.guildId), 
        embeds: [new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🆘 Help Requested')
            .addFields({ name: '🎮 Game', value: ticket.gameName || 'Unknown', inline: true }, { name: '👤 User', value: `<@${ticket.userId}>`, inline: true })
        ] 
    });
    
    await interaction.channel.send({
        content: `<@${ticket.userId}>`,
        embeds: [new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('⏳ Staff Notified')
            .setDescription('A staff member has been notified and will help you shortly.\n\n🚫 **Do not ping or DM staff** - They have been contacted and will assist you when available. Pinging or DM\'ing staff will result in a timeout and your ticket being closed.')
        ]
    }).catch(() => {});
    
    // Log step change
    await logTicketEvent(ticket, 'step_change', { step: 'User requested help after receiving token' });
}

// ============================================================================
// END OF PART 3 - Continue to Part 4
// ============================================================================
// ============================================================================
// 🍺 PUB'S BARTENDER BOT V2.1 - COMPLETE FIXED VERSION
// Part 4 of 4 - Steam ID, Staff Actions, Timers, Commands, Events
// ============================================================================

// ============================================================================
// STEAM ID HANDLING
// ============================================================================

async function handleSteamIdMessage(message) {
    const ticket = Array.from(activeTickets.values()).find(t => t.threadId === message.channel.id && t.status === 'awaiting_steam_id' && !t.steamId);
    if (!ticket || message.author.id !== ticket.userId) return;
    
    resetInactivityTimer(ticket.id, message.channel);
    
    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        const fileName = attachment.name.toLowerCase();
        
        if (fileName.endsWith('.ini') || fileName.endsWith('.txt')) {
            try {
                const response = await fetch(attachment.url);
                const fileContent = await response.text();
                
                let steamId = null, accountName = null;
                const nameMatch = fileContent.match(/account_name=(\S+)/);
                if (nameMatch) accountName = nameMatch[1];
                
                const oldIdMatch = fileContent.match(/steamid_old=(7656119\d{10})/);
                if (oldIdMatch) steamId = oldIdMatch[1];
                if (!steamId) { const accountIdMatch = fileContent.match(/account_steamid=(7656119\d{10})/); if (accountIdMatch) steamId = accountIdMatch[1]; }
                if (!steamId) { const anyIdMatch = fileContent.match(/7656119\d{10}/); if (anyIdMatch) steamId = anyIdMatch[0]; }
                
                if (steamId) {
                    ticket.steamId = steamId;
                    await message.reply(`✅ **Steam ID found!**\n\`${steamId}\`${accountName ? `\n📋 Account: \`${accountName}\`` : ''}`);
                    ticket.status = 'awaiting_screenshot';
                    ticket.collectedScreenshots = [];
                    
                    const game = db.getGame(ticket.gameId);
                    const gameInstr = getGameInstructions(game.game_id || game.folder_name || game.game_name);
                    const expectedFolderName = gameInstr.folderName || game.folder_name || game.game_name;
                    
                    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📸 Screenshot Required').setDescription('Now please upload screenshot(s) showing:')
                        .addFields(
                            { name: '📋 Required', value: '• Game folder properties\n• Windows Update Blocker (DISABLED)', inline: false }, 
                            { name: '📦 Expected Size', value: game.size_gb ? `~${game.size_gb} GB` : 'Any size', inline: true },
                            { name: '📁 Expected Folder', value: expectedFolderName, inline: true }
                        );
                    const buttons = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`early_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId(`close_ticket_${ticket.id}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`linux_mac_${ticket.id}`).setLabel('Linux/Mac').setEmoji('🐧').setStyle(ButtonStyle.Primary)
                    );
                    await message.channel.send({ embeds: [embed], components: [buttons] });
                    startScreenshotTimer(ticket.id, message.channel);
                    
                    await logTicketEvent(ticket, 'step_change', { step: 'Steam ID captured, awaiting screenshots' });
                    return;
                }
                await message.reply(`❌ **Could not find Steam ID in ${attachment.name}**`);
                return;
            } catch (err) { await message.reply('❌ Could not read the file.'); return; }
        }
        if (!message.content.trim()) { await message.reply('📋 **Please paste the Steam ID as text**'); return; }
    }
    
    const content = message.content.trim();
    if (!content) return;
    
    let steamId = null, accountName = null;
    
    if (content.includes('account_steamid') || content.includes('steamid_old')) {
        const nameMatch = content.match(/account_name=(\S+)/);
        if (nameMatch) accountName = nameMatch[1];
        const oldIdMatch = content.match(/steamid_old=(7656119\d{10})/);
        const regIdMatch = content.match(/account_steamid=(7656119\d{10})/);
        if (oldIdMatch) steamId = oldIdMatch[1];
        else if (regIdMatch) steamId = regIdMatch[1];
    }
    
    if (!steamId) {
        const finderMatch = content.match(/OLD\s*[\|│]\s*(7656119\d{10})\s*[\|│]\s*(\S+)/i);
        if (finderMatch) { steamId = finderMatch[1]; accountName = finderMatch[2]; }
    }
    
    if (!steamId) {
        const simpleMatch = content.match(/7656119\d{10}/);
        if (simpleMatch) steamId = simpleMatch[0];
    }
    
    if (steamId) {
        ticket.steamId = steamId;
        await message.reply(`✅ **Steam ID captured!**\n\`${steamId}\`${accountName ? `\n📋 Account: \`${accountName}\`` : ''}`);
        ticket.status = 'awaiting_screenshot';
        ticket.collectedScreenshots = [];
        
        const game = db.getGame(ticket.gameId);
        const gameInstr = getGameInstructions(game.game_id || game.folder_name || game.game_name);
        const expectedFolderName = gameInstr.folderName || game.folder_name || game.game_name;
        
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📸 Screenshot Required').setDescription('Now please upload screenshot(s):')
            .addFields(
                { name: '📋 Required', value: '• Game folder properties\n• Windows Update Blocker (DISABLED)', inline: false },
                { name: '📦 Expected Size', value: game.size_gb ? `~${game.size_gb} GB` : 'Any size', inline: true },
                { name: '📁 Expected Folder', value: expectedFolderName, inline: true }
            );
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`early_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`close_ticket_${ticket.id}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`linux_mac_${ticket.id}`).setLabel('Linux/Mac').setEmoji('🐧').setStyle(ButtonStyle.Primary)
        );
        await message.channel.send({ embeds: [embed], components: [buttons] });
        startScreenshotTimer(ticket.id, message.channel);
        
        await logTicketEvent(ticket, 'step_change', { step: 'Steam ID captured, awaiting screenshots' });
    } else if (content.length > 5) {
        await message.reply(`❌ **Could not find valid Steam ID**`);
    }
}

// ============================================================================
// STAFF ACTIONS
// ============================================================================

async function handleStaffApprove(interaction, ticketId) {
    const ticket = activeTickets.get(ticketId);
    if (!ticket) return interaction.editReply({ content: '❌ Ticket not found.' });
    
    ticket.status = 'screenshot_approved';
    db.markScreenshotVerified(ticket.id);
    
    // Log staff action
    await logTicketEvent(ticket, 'staff_action', { 
        staffMember: interaction.user.username,
        staffId: interaction.user.id,
        reason: 'Screenshots approved by staff'
    });
    
    // Restart inactivity timer after staff approval
    startInactivityTimer(ticket.id, interaction.channel);
    
    // Update the staff review message (this is in the staff review area)
    await interaction.message.edit({ 
        embeds: [new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Approved!')
            .setDescription(`Approved by ${interaction.user.username}`)
        ], 
        components: [] 
    });
    
    // Send approval message WITH user ping and Get Activation button in the ticket channel
    await interaction.channel.send({ 
        content: `<@${ticket.userId}>`, 
        embeds: [new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Staff Approved')
            .setDescription(`Your screenshots have been approved by ${interaction.user.username}!\n\nClick the button below to get your activation.`)
        ], 
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`get_activation_${ticket.id}`).setLabel('Get Activation').setEmoji('🎮').setStyle(ButtonStyle.Success)
        )] 
    });
    
    await interaction.editReply({ content: '✅ Screenshots approved! User has been notified.' });
}

async function handleStaffReject(interaction, ticketId) {
    const ticket = activeTickets.get(ticketId);
    if (!ticket) return interaction.editReply({ content: '❌ Ticket not found.' });
    
    ticket.status = 'awaiting_screenshot';
    
    // Log staff action
    await logTicketEvent(ticket, 'staff_action', { 
        staffMember: interaction.user.username,
        staffId: interaction.user.id,
        reason: 'Screenshots rejected by staff'
    });
    
    // Restart inactivity timer after staff rejection
    startInactivityTimer(ticket.id, interaction.channel);
    
    await interaction.message.edit({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Rejected').setDescription(`Rejected by ${interaction.user.username}\n\nPlease upload a new screenshot.`)], components: [] });
    await interaction.editReply({ content: '❌ Screenshots rejected.' });
    startScreenshotTimer(ticket.id, interaction.channel);
}

// ============================================================================
// TIMERS
// ============================================================================

function startScreenshotTimer(ticketId, channel) {
    const timer = setTimeout(async () => {
        const ticket = activeTickets.get(ticketId);
        if (!ticket || ticket.status !== 'awaiting_screenshot') return;
        await channel.send({ content: `<@${ticket.userId}>`, embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('⏰ Time\'s Up!').setDescription('No screenshot uploaded. Ticket closing.')] });
        await closeTicket(ticketId, 'timeout_screenshot', channel);
    }, config.screenshotTimeout);
    setTicketTimer(ticketId, 'screenshot', timer);
}

function startResponseTimer(ticketId, channel, minutes = 20) {
    const timer = setTimeout(async () => {
        const ticket = activeTickets.get(ticketId);
        if (!ticket || ticket.status !== 'token_sent') return;
        await channel.send({ content: `<@${ticket.userId}>`, embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('⏰ No Response - Ghosted').setDescription('7-day cooldown applied.')] });
        db.setCooldown(ticket.userId, ticket.guildId, 'ticket', 168);
        await logCooldownEvent(ticket.guildId, ticket.userId, ticket.username, 'applied', 'ticket', 168, 'System (ghosted)', null);
        await closeTicket(ticketId, 'ghosted_activation', channel);
    }, config.responseTimeout);
    setTicketTimer(ticketId, 'response', timer);
}

function startSuccessCloseTimer(ticketId, channel) {
    const timer = setTimeout(async () => {
        const ticket = activeTickets.get(ticketId);
        if (ticket) await closeTicket(ticketId, 'success', channel);
    }, 1 * 60 * 1000);
    setTicketTimer(ticketId, 'success', timer);
}

function startInactivityTimer(ticketId, channel) {
    const ticket = activeTickets.get(ticketId);
    if (!ticket || ticket.status === 'closing' || ticket.status === 'token_sent') return;
    const timer = setTimeout(async () => {
        const ticket = activeTickets.get(ticketId);
        if (!ticket || ticket.status === 'token_sent' || ticket.status === 'closing') return;
        await channel.send({ content: `<@${ticket.userId}>`, embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('⏰ Ticket Closed - Inactive').setDescription('No activity for 10 minutes.')] });
        await closeTicket(ticketId, 'user_inactive', channel);
    }, config.inactivityTimeout);
    setTicketTimer(ticketId, 'inactivity', timer);
}

function resetInactivityTimer(ticketId, channel) {
    const ticket = activeTickets.get(ticketId);
    if (!ticket || ticket.status === 'closing' || ticket.status === 'token_sent') return;
    clearTicketTimer(ticketId, 'inactivity');
    startInactivityTimer(ticketId, channel);
}

function setTicketTimer(ticketId, type, timer) {
    const key = `${ticketId}_${type}`;
    if (activeTimers.has(key)) clearTimeout(activeTimers.get(key));
    activeTimers.set(key, timer);
}

function clearTicketTimer(ticketId, type) {
    const key = `${ticketId}_${type}`;
    if (activeTimers.has(key)) { clearTimeout(activeTimers.get(key)); activeTimers.delete(key); }
}

// ============================================================================
// CLOSE TICKET - RELEASES RESERVED TOKEN IF NOT USED
// ============================================================================

async function closeTicket(ticketId, reason, channel) {
    const ticket = activeTickets.get(ticketId);
    if (!ticket) return;
    
    clearTicketTimer(ticketId, 'screenshot');
    clearTicketTimer(ticketId, 'response');
    clearTicketTimer(ticketId, 'success');
    clearTicketTimer(ticketId, 'inactivity');
    
    if (activeQueueWatchers.has(ticketId)) { activeQueueWatchers.get(ticketId)(); activeQueueWatchers.delete(ticketId); }
    
    // RELEASE RESERVED TOKEN if ticket closes before token was used
    if (ticket.tokenReserved && ticket.status !== 'token_sent') {
        const released = db.releaseReservedToken(ticketId);
        if (released.changes > 0) {
            console.log(`[Ticket] Released reserved token for ${ticketId} (reason: ${reason})`);
        }
    }
    
    console.log(`[Ticket] Closing ${ticketId} - ${reason}`);
    
    // Calculate duration
    const duration = ticket.createdAt ? Math.round((Date.now() - ticket.createdAt) / 60000) : 0;
    
    // Log ticket closed
    const eventType = reason === 'success' ? 'success' : 
                      reason.includes('timeout') ? 'timeout' :
                      reason.includes('ghost') ? 'ghosted' :
                      reason.includes('user_closed') ? 'cancelled' : 'closed';
    
    await logTicketEvent(ticket, eventType, { 
        reason: reason,
        duration: `${duration} minutes`
    });
    
    // Send close reason message to ticket before saving transcript
    try {
        const thread = await client.channels.fetch(ticket.threadId);
        if (thread) {
            // Format close reason for display
            const closeReasonMap = {
                'success': '✅ Activation Successful',
                'user_closed': '👤 Closed by User',
                'timeout_screenshot': '⏰ Timed Out (Screenshot)',
                'timeout_by_staff': '👮 Closed by Staff (7d Cooldown)',
                'cdclose_by_staff': '👮 Closed by Staff (2d Cooldown)',
                'hdclose_by_staff': '🔥 Closed by Staff (HD Cooldown)',
                'ghosted_activation': '👻 User Did Not Respond',
                'user_inactive': '⏰ Timed Out (Inactivity)',
                'cancelled': '❌ Cancelled'
            };
            
            const displayReason = closeReasonMap[reason] || `🔒 ${reason.replace(/_/g, ' ')}`;
            
            const closeEmbed = new EmbedBuilder()
                .setColor(reason === 'success' ? 0x00FF00 : 0xFF6600)
                .setTitle('🔒 Ticket Closing')
                .setDescription(`**Reason:** ${displayReason}\n**Duration:** ${duration} minutes\n**Ticket ID:** ${ticketId}`)
                .setFooter({ text: 'This ticket will be archived in the transcript' })
                .setTimestamp();
            
            await thread.send({ embeds: [closeEmbed] }).catch(() => {});
            
            // Small delay to ensure message is saved in transcript
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Now fetch messages for transcript (including the close message)
            const messages = await thread.messages.fetch({ limit: 100 });
            const transcriptMessages = messages.reverse().map(m => ({
                author: m.author.username, authorId: m.author.id, bot: m.author.bot, content: m.content || '',
                timestamp: m.createdAt.toISOString(), attachments: m.attachments.map(a => ({ url: a.url, name: a.name })),
                embeds: m.embeds.map(e => ({ title: e.title, description: e.description }))
            }));
            const game = db.getGame(ticket.gameId);
            let username = 'Unknown';
            try { const user = await client.users.fetch(ticket.userId); username = user.username; } catch (e) {}
            db.saveTranscript(ticketId, ticket.threadId, ticket.userId, username, game?.game_name || ticket.gameId, JSON.stringify(transcriptMessages));
        }
    } catch (err) {
        console.error('[Ticket] Close message error:', err.message);
    }
    
    db.closeTicket(ticketId, reason);
    activeTickets.delete(ticketId);
    
    try { const thread = await client.channels.fetch(ticket.threadId); if (thread) await thread.delete(); } catch (err) {}
    
    // Issue #2 FIX - Update panel after ticket closes
    await updatePanel();
}

// ============================================================================
// BUTTON HANDLER
// ============================================================================

async function handleButton(interaction) {
    const id = interaction.customId;
    
    try {
        if (id === 'refresh_panel') {
            await interaction.deferReply({ ephemeral: true });
            console.log(`[Panel] Refresh requested by ${interaction.user.username}`);
            console.log(`[Panel] serverPanels size: ${serverPanels.size}`);
            await updatePanel();
            const games = db.getAllGames();
            const totalAvail = games.reduce((sum, g) => sum + db.getAvailableTokenCount(g.id), 0);
            await interaction.editReply({ content: `✅ Refreshed! (${totalAvail} tokens available)` });
            return;
        }
        if (id === 'view_high_demand') {
            const games = db.getAllGames().filter(g => g.demand_type === 'high');
            const list = games.length > 0 ? games.map(g => `• ${g.game_name}`).join('\n') : 'None currently.';
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF4500).setTitle('🔥 High Demand').setDescription(list)], ephemeral: true });
            return;
        }
        if (id === 'view_ea_high_demand') {
            const games = db.getEAHighDemandGames ? db.getEAHighDemandGames() : [];
            let list = 'None currently.';
            if (games.length > 0) {
                list = games.map(g => {
                    const status = g.available_tokens > 0 ? `🟢 ${g.available_tokens} available` : '🔴 No tokens';
                    return `🔥 **${g.game_name}** - ${status}`;
                }).join('\n');
            }
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF4500).setTitle('🔥 EA High Demand Games').setDescription(list).setFooter({ text: 'High demand games have 7-day cooldown' })], ephemeral: true });
            return;
        }
        if (id === 'view_rules') {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📋 Rules')
                .addFields(
                    { name: '⏱️ Cooldowns', value: '🥇 Gold - 0h\n🥈 Silver/Bronze - 24h\n💝 Donator - 48h\n👤 Free - 48h', inline: true },
                    { name: '🔥 High Demand', value: 'Free users: +7 days', inline: true },
                    { name: '🚨 Keep Game Working', value: '```• Never launch from Steam\n• Keep WUB enabled\n• Never update game```', inline: false }
                )], ephemeral: true });
            return;
        }
        
        let ticketId = null, ticket = null;
        const prefixes = ['close_ticket_', 'refill_yes_', 'refill_no_', 'get_activation_', 'it_works_', 'need_help_', 'submit_screenshots_', 'clear_screenshots_', 'early_help_', 'linux_mac_', 'linux_submit_'];
        for (const prefix of prefixes) {
            if (id.startsWith(prefix)) { ticketId = id.replace(prefix, ''); ticket = activeTickets.get(ticketId); break; }
        }
        
        // Debug logging for ticket lookup
        if (ticketId) {
            console.log(`[Button] Looking for ticket: ${ticketId}`);
            console.log(`[Button] Active tickets: ${Array.from(activeTickets.keys()).join(', ') || 'NONE'}`);
            console.log(`[Button] Found ticket: ${ticket ? 'YES' : 'NO'}`);
        }
        
        if (id.startsWith('staff_approve_')) {
            await interaction.deferReply({ ephemeral: true });
            if (!isStaff(interaction)) {
                await interaction.editReply({ content: '❌ Only staff can approve screenshots.' });
                return;
            }
            await handleStaffApprove(interaction, id.replace('staff_approve_', '')); 
            return; 
        }
        if (id.startsWith('staff_reject_')) {
            await interaction.deferReply({ ephemeral: true });
            if (!isStaff(interaction)) {
                await interaction.editReply({ content: '❌ Only staff can reject screenshots.' });
                return;
            }
            await handleStaffReject(interaction, id.replace('staff_reject_', '')); 
            return; 
        }
        
        if (ticketId && !ticket) {
            // Try to recover ticket from database
            const savedTicket = db.getTicket ? db.getTicket(ticketId) : null;
            if (savedTicket && savedTicket.status !== 'closed') {
                console.log(`[Button] Attempting to recover ticket ${ticketId} from database`);
                // Restore to memory
                activeTickets.set(ticketId, {
                    id: ticketId,
                    threadId: savedTicket.thread_id || interaction.channel.id,
                    channelId: savedTicket.channel_id || interaction.channel.id,
                    userId: savedTicket.user_id,
                    username: savedTicket.username,
                    gameId: savedTicket.game_id,
                    gameName: savedTicket.game_name,
                    folderName: savedTicket.folder_name,
                    guildId: savedTicket.guild_id || interaction.guildId,
                    isRefill: savedTicket.is_refill || false,
                    steamId: savedTicket.steam_id,
                    status: savedTicket.status || 'active',
                    platform: 'steam',
                    isLinuxMac: savedTicket.is_linux_mac || false,
                    collectedScreenshots: [],
                    helpRequested: savedTicket.help_requested || false,
                    activationRequested: savedTicket.activation_requested || false,
                    generationInProgress: false,
                    tokenReserved: savedTicket.token_reserved || false,
                    createdAt: savedTicket.created_at || Date.now()
                });
                ticket = activeTickets.get(ticketId);
                console.log(`[Button] Recovered ticket ${ticketId} from database, status: ${ticket.status}`);
            } else {
                await interaction.reply({ content: '❌ Ticket expired. Please create a new one.', ephemeral: true });
                return;
            }
        }
        
        // Check permissions first (before any response)
        if (ticket) {
            const isOwner = interaction.user.id === ticket.userId;
            const staffMember = isStaff(interaction);
            if (!isOwner && !staffMember) { 
                await interaction.reply({ content: '❌ Not your ticket.', ephemeral: true }); 
                return; 
            }
            // Reset inactivity timer on ANY button press (not just messages) - unless ticket is done or closing
            if (isOwner && ticket.status !== 'token_sent' && ticket.status !== 'closing' && ticket.status !== 'awaiting_staff') {
                resetInactivityTimer(ticket.id, interaction.channel);
            }
        }
        
        // Handle close_ticket - uses reply (defer first)
        if (id.startsWith('close_ticket_')) {
            await interaction.deferReply({ ephemeral: true });
            const isOwner = interaction.user.id === ticket.userId;
            const staffMember = isStaff(interaction);
            if (isOwner && !staffMember && ticket.activationRequested) {
                await interaction.editReply({ content: '❌ Cannot close after requesting activation.' });
                return;
            }
            await interaction.editReply({ content: '✅ Ticket closed.' });
            await closeTicket(ticketId, 'user_closed', interaction.channel);
        }
        // Issue #1 FIX - Added configs.user.ini to list
        // refill_yes uses update() - NO defer
        else if (id.startsWith('refill_yes_')) {
            ticket.isRefill = true;
            ticket.status = 'awaiting_steam_id';
            
            const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🔄 Refill Request')
                .setDescription('Please search for the files below in your game files. Open the file and send us the text inside it.\n\n```\nconfigs.user.ini\nforce_steamid.txt\ncirno.ini\n```\nIf you feel lazy, download and run the exe from the **Steam ID Finder** button below, then send the result.')
                .addFields({ name: '📝 Or paste Steam ID', value: '`76561198012345678`', inline: false });
            
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Steam ID Finder').setEmoji('🔍').setStyle(ButtonStyle.Link).setURL('https://discord.com/channels/1265025550485950634/1415060448298139659'),
                new ButtonBuilder().setCustomId(`close_ticket_${ticketId}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
            );
            await interaction.update({ embeds: [embed], components: [buttons] });
            
            await logTicketEvent(ticket, 'step_change', { step: 'Refill - awaiting Steam ID' });
        }
        // refill_no uses update() via askForScreenshots - NO defer
        else if (id.startsWith('refill_no_')) {
            ticket.isRefill = false;
            await askForScreenshots(interaction, ticket);
        }
        // Issue #7 FIX - SOS does NOT bypass verification
        // early_help uses reply - defer first
        else if (id.startsWith('early_help_')) {
            await interaction.deferReply({ ephemeral: true });
            if (ticket.helpRequested) { await interaction.editReply({ content: '⚠️ Help already requested!' }); return; }
            ticket.helpRequested = true;
            // NOTE: We do NOT change ticket.status - just notify staff
            
            // Pause inactivity timer - staff will handle from here
            clearTicketTimer(ticket.id, 'inactivity');
            
            await interaction.editReply({ content: '✅ Staff notified! Please describe your issue below so staff can help you faster.' });
            
            const game = db.getGame(ticket.gameId);
            
            // Send prompt asking user to explain their issue
            await interaction.channel.send({
                content: `<@${ticket.userId}>`,
                embeds: [new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('💬 Please Explain Your Issue')
                    .setDescription('**Staff has been notified!**\n\nWhile you wait, please type a message explaining:\n• What problem are you experiencing?\n• What have you tried so far?\n• Any error messages you\'re seeing?\n\nThis helps staff assist you faster!\n\n🚫 **Do not ping or DM staff** - They have been contacted and will assist you when available. Pinging or DM\'ing staff will result in a timeout and your ticket being closed.')
                    .setFooter({ text: 'A staff member will be with you shortly' })
                ]
            });
            
            // Notify staff
            await interaction.channel.send({ 
                content: getStaffMention(ticket.guildId), 
                embeds: [new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('🆘 Help Requested')
                    .setDescription('User needs assistance.\n\n**⚠️ This does NOT skip verification.**')
                    .addFields(
                        { name: '🎮 Game', value: game?.game_name || 'Unknown', inline: true }, 
                        { name: '📋 Status', value: ticket.status.replace(/_/g, ' '), inline: true },
                        { name: '👤 User', value: `<@${ticket.userId}>`, inline: true }
                    )
                ] 
            });
            
            await logTicketEvent(ticket, 'step_change', { step: 'User requested help' });
        }
        // Linux/Mac activation flow
        else if (id.startsWith('linux_mac_')) {
            ticket.status = 'awaiting_linux_screenshot';
            ticket.isLinuxMac = true;
            ticket.collectedScreenshots = [];
            
            // Clear any existing timers - Linux/Mac tickets have paused timers until staff review
            clearTicketTimer(ticket.id, 'screenshot');
            clearTicketTimer(ticket.id, 'inactivity');
            
            const game = db.getGame(ticket.gameId);
            
            const embed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle('🐧 Linux/Mac Activation')
                .setDescription('Please upload screenshots showing your game installation:')
                .addFields(
                    { name: '📋 Required Screenshots', value: '• Game folder with files visible\n• File manager showing game location\n• Any proof of legitimate installation', inline: false },
                    { name: '🎮 Game', value: game?.game_name || ticket.gameName, inline: true },
                    { name: '📦 Expected Size', value: game?.size_gb ? `~${game.size_gb} GB` : 'Check game size', inline: true },
                    { name: '⏳ Review', value: 'Manual staff review required', inline: true }
                );
            
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`early_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`close_ticket_${ticket.id}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
            );
            
            await interaction.update({ embeds: [embed], components: [buttons] });
            await logTicketEvent(ticket, 'step_change', { step: 'Linux/Mac activation requested' });
        }
        else if (id.startsWith('get_activation_')) { await handleGetActivation(interaction, ticketId); }
        else if (id.startsWith('it_works_')) { await handleItWorks(interaction, ticketId); }
        else if (id.startsWith('need_help_')) { await handleNeedHelp(interaction, ticketId); }
        // Issue #18 FIX - Prevent submission if in staff review
        else if (id.startsWith('submit_screenshots_')) {
            if (!ticket.collectedScreenshots?.length) { await interaction.reply({ content: '❌ No screenshots.', ephemeral: true }); return; }
            if (ticket.processingScreenshots) { await interaction.reply({ content: '⏳ Processing...', ephemeral: true }); return; }
            if (ticket.status === 'awaiting_staff') { 
                await interaction.reply({ content: '⏳ Screenshots are being reviewed by staff. Please wait.', ephemeral: true }); 
                return; 
            }
            await processScreenshots(interaction, ticketId);
        }
        // Linux/Mac submit - goes directly to staff review
        else if (id.startsWith('linux_submit_')) {
            if (!ticket.collectedScreenshots?.length) { await interaction.reply({ content: '❌ No screenshots.', ephemeral: true }); return; }
            if (ticket.status === 'awaiting_staff') { 
                await interaction.reply({ content: '⏳ Already sent for review. Please wait.', ephemeral: true }); 
                return; 
            }
            
            ticket.status = 'awaiting_staff';
            const game = db.getGame(ticket.gameId);
            const urls = ticket.collectedScreenshots.map(s => s.url);
            
            // Clear all timers - staff will handle from here
            clearTicketTimer(ticket.id, 'screenshot');
            clearTicketTimer(ticket.id, 'inactivity');
            
            // Notify user
            const userEmbed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle('📤 Sent for Manual Review')
                .setDescription('Your Linux/Mac screenshots have been sent to staff for review.\n\n⏳ **Please wait** - A staff member will verify your screenshots and approve your activation.\n\n🚫 **Do not ping or DM staff** - They have been contacted and will assist you when available. Pinging or DM\'ing staff will result in a timeout and your ticket being closed.');
            
            await interaction.update({ embeds: [userEmbed], components: [] });
            
            // Create staff review embed
            const staffEmbed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle('🐧 Linux/Mac Manual Review Required')
                .setDescription(`**User:** <@${ticket.userId}>\n**Platform:** Linux/Mac`)
                .addFields(
                    { name: '🎮 Game', value: game?.game_name || ticket.gameName, inline: true },
                    { name: '📦 Expected Size', value: game?.size_gb ? `${game.size_gb} GB` : 'Unknown', inline: true },
                    { name: '📸 Screenshots', value: `${urls.length} uploaded`, inline: true }
                );
            
            // Add screenshot previews
            for (let i = 0; i < Math.min(urls.length, 4); i++) {
                if (i === 0) staffEmbed.setImage(urls[i]);
            }
            
            const staffButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`staff_approve_${ticket.id}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`staff_reject_${ticket.id}`).setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger)
            );
            
            await interaction.channel.send({ 
                content: getStaffMention(ticket.guildId), 
                embeds: [staffEmbed], 
                components: [staffButtons] 
            });
            
            // Show additional screenshots if more than 1
            for (let i = 1; i < urls.length; i++) {
                await interaction.channel.send({ content: `📸 Screenshot ${i + 1}:`, files: [urls[i]] }).catch(() => {});
            }
            
            await logTicketEvent(ticket, 'step_change', { step: 'Linux/Mac screenshots sent for manual review' });
        }
        else if (id.startsWith('clear_screenshots_')) {
            ticket.collectedScreenshots = [];
            ticket.submitMessageId = null;
            await interaction.update({ embeds: [new EmbedBuilder().setColor(0xFF6600).setTitle('🗑️ Screenshots Cleared')], components: [] });
            startScreenshotTimer(ticketId, interaction.channel);
        }
    } catch (err) {
        console.error('Button error:', err);
        // Try to respond if we haven't already
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
        }
    }
}

// ============================================================================
// SLASH COMMANDS - COMPLETE SET FROM REFERENCE DOCS
// ============================================================================

const commands = [
    // === TICKET MANAGEMENT COMMANDS ===
    new SlashCommandBuilder().setName('approve').setDescription('Skip verification, show "Get Activation" button').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('override').setDescription('Progress stuck ticket to next step').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('staffgenerate').setDescription('Generate NEW token (uses token slot)').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('newtoken').setDescription('Generate NEW token (same as staffgenerate)').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('resend').setDescription('Resend same download link').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('canceltoken').setDescription('Cancel token, make it available again').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('closeticket').setDescription('Close and archive the ticket').addStringOption(o => o.setName('reason').setDescription('Reason for closing')).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('timeoutclose').setDescription('Close ticket + apply 7-day cooldown (user ghosted)').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('cdclose').setDescription('Close ticket + apply 2-day cooldown').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('hdclose').setDescription('Close ticket + apply 2-day cooldown + HD cooldown').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    
    // === COOLDOWN COMMANDS ===
    new SlashCommandBuilder().setName('cooldown7d').setDescription('Apply 7-day cooldown').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('cooldown3d').setDescription('Apply 3-day cooldown & close ticket').addUserOption(o => o.setName('user').setDescription('User (optional, uses ticket owner if not set)')).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('cooldown2d').setDescription('Apply 2-day cooldown').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('cooldown1d').setDescription('Apply 1-day cooldown').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('cooldownhd').setDescription('Apply 7-day HIGH DEMAND cooldown').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('noss').setDescription('3-day timeout & close - No screenshots sent').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('nolx').setDescription('3-day timeout & close - Clicked Linux/Mac on Windows').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('removecooldown').setDescription('Remove ALL cooldowns').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('clearhighdemand').setDescription('Remove only high demand cooldown').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('clearticketcooldown').setDescription('Remove ticket cooldown only').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('viewcooldown').setDescription('View cooldown status').addUserOption(o => o.setName('user').setDescription('User (optional, shows your own if not set)')).setDMPermission(true),
    
    // === SERVER SETUP COMMANDS ===
    new SlashCommandBuilder().setName('setup').setDescription('Create panel + set ticket channel').addStringOption(o => o.setName('type').setDescription('Panel type').setRequired(true).addChoices({ name: 'Free', value: 'free' }, { name: 'Paid', value: 'paid' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('setticketchannel').setDescription('Set current channel as ticket channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('setlogchannel').setDescription('Set current channel as ticket log channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('setactivationlogchannel').setDescription('Set current channel for activation logs').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('setstaffroles').setDescription('Set staff roles for pings').addRoleOption(o => o.setName('role1').setDescription('Staff role 1').setRequired(true)).addRoleOption(o => o.setName('role2').setDescription('Staff role 2')).addRoleOption(o => o.setName('role3').setDescription('Staff role 3')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('viewstaffroles').setDescription('View configured staff roles').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('setpaneltype').setDescription('Change panel type').addStringOption(o => o.setName('type').setDescription('Panel type').setRequired(true).addChoices({ name: 'Free', value: 'free' }, { name: 'Paid', value: 'paid' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('showhighdemand').setDescription('Post auto-updating high demand games list in this channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    
    // === INFO COMMANDS ===
    new SlashCommandBuilder().setName('stats').setDescription('View bot statistics').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('regens').setDescription('View token regeneration timers').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('queue').setDescription('View generation queue').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('listgames').setDescription('List all games with sizes').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('history').setDescription('View activation history').addUserOption(o => o.setName('user').setDescription('User to view (staff only, leave empty for your own)')).setDMPermission(true),
    new SlashCommandBuilder().setName('ticketstats').setDescription('View ticket statistics').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    
    // === USER SELF-SERVICE COMMANDS (these work in DMs) ===
    new SlashCommandBuilder().setName('myhistory').setDescription('View your own past activations').setDMPermission(true),
    new SlashCommandBuilder().setName('mystatus').setDescription('Check your cooldown status').setDMPermission(true),
    new SlashCommandBuilder().setName('gameinfo').setDescription('View game info and token availability').addStringOption(o => o.setName('game').setDescription('Game name to search').setRequired(true).setAutocomplete(true)).setDMPermission(false),
    
    // === GAME MANAGEMENT COMMANDS ===
    new SlashCommandBuilder().setName('syncgames').setDescription('Sync games from database').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('setgamesize').setDescription('Set expected file size').addStringOption(o => o.setName('game').setDescription('Game name').setRequired(true)).addNumberOption(o => o.setName('size').setDescription('Size in GB').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('setfreepanel').setDescription('Add/remove from free panel').addStringOption(o => o.setName('game').setDescription('Game name').setRequired(true)).addBooleanOption(o => o.setName('enabled').setDescription('Show on free panel').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('sethighdemand').setDescription('Set high demand status').addStringOption(o => o.setName('game').setDescription('Game name').setRequired(true)).addBooleanOption(o => o.setName('enabled').setDescription('Is high demand').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    
    // === ADMIN COMMANDS ===
    new SlashCommandBuilder().setName('resetall').setDescription('Reset all tokens to available (DANGEROUS)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('cleanup').setDescription('Clean up orphaned tickets').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('cleartickets').setDescription('Clear all stuck tickets').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('clearusertickets').setDescription('Clear tickets for a user').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('releasereserved').setDescription('Release all reserved tokens').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('clearcommands').setDescription('Clear all old commands and re-register (fixes Tickety Beta)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    
    // === OTHER COMMANDS ===
    new SlashCommandBuilder().setName('redo').setDescription('Reset ticket to specific step').addStringOption(o => o.setName('step').setDescription('Step').setRequired(true).addChoices(
        { name: '[Steam] Refill Choice', value: 'awaiting_refill_choice' },
        { name: '[Steam] Steam ID', value: 'awaiting_steam_id' },
        { name: '[All] Screenshot', value: 'awaiting_screenshot' },
        { name: '[Steam] Linux/Mac Screenshot', value: 'awaiting_linux_screenshot' },
        { name: '[All] Staff Review', value: 'awaiting_staff' },
        { name: '[Steam] Approved (Get Activation)', value: 'screenshot_approved' },
        { name: '[Ubisoft/EA] Token Request', value: 'awaiting_token_request' },
        { name: '[Ubisoft] Approved (Show Instructions)', value: 'ubisoft_approved' }
    )).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('viewstaff').setDescription('View configured staff roles').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    
    // === STAFF MACRO COMMANDS ===
    new SlashCommandBuilder().setName('macro').setDescription('Send a quick response template').addStringOption(o => o.setName('template').setDescription('Template to send').setRequired(true).setAutocomplete(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('listmacros').setDescription('List all available macros').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    
    // === BOT MANAGEMENT COMMANDS (Owner Only) ===
    new SlashCommandBuilder().setName('restart').setDescription('Restart the bot (Owner only)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
    new SlashCommandBuilder().setName('botstatus').setDescription('View bot status, uptime, and memory usage').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    
    // === EA TICKET SYSTEM ===
    new SlashCommandBuilder().setName('ea').setDescription('EA token commands')
        .addSubcommand(sub => sub.setName('setup').setDescription('Setup EA ticket panel')
            .addChannelOption(o => o.setName('channel').setDescription('Channel for EA panel').setRequired(true)))
        .addSubcommand(sub => sub.setName('games').setDescription('List available EA games'))
        .addSubcommand(sub => sub.setName('cooldown').setDescription('Check or manage EA cooldowns')
            .addUserOption(o => o.setName('user').setDescription('User to check/manage'))
            .addStringOption(o => o.setName('action').setDescription('Action').addChoices(
                { name: 'Check', value: 'check' },
                { name: 'Remove', value: 'remove' }
            )))
        .addSubcommand(sub => sub.setName('stats').setDescription('View EA statistics'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    
    // === UBISOFT TICKET SYSTEM ===
    new SlashCommandBuilder()
        .setName('ubisoft-setup')
        .setDescription('Create Ubisoft panel + set ticket channel')
        .addStringOption(o => o.setName('type').setDescription('Panel type').setRequired(true)
            .addChoices({ name: 'Free', value: 'free' }, { name: 'Paid', value: 'paid' }))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    
    new SlashCommandBuilder()
        .setName('ubisoft-panel')
        .setDescription('Create Ubisoft panel in current channel')
        .addStringOption(o => o.setName('type').setDescription('Panel type').setRequired(true)
            .addChoices({ name: 'Free', value: 'free' }, { name: 'Paid', value: 'paid' }))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false),
    
    new SlashCommandBuilder()
        .setName('ubisoft-queue')
        .setDescription('View Ubisoft token generation queue')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads)
        .setDMPermission(false),
		
    new SlashCommandBuilder()
        .setName('ubisoft-clear-queue')
        .setDescription('Clear all pending Ubisoft token generation queue entries')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads)
        .setDMPermission(false),
		
	new SlashCommandBuilder()
        .setName('ubisoft-remove-queue')
        .setDescription('Remove a specific user from the Ubisoft token generation queue')
        .addUserOption(o => o
        .setName('user')
        .setDescription('User to remove from queue')
        .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads)
        .setDMPermission(false),
	
	new SlashCommandBuilder()
        .setName('ubisoft-clear-unknown')
        .setDescription('Remove all "Unknown - Unknown" entries from Ubisoft queue')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('ubisoft-status')
        .setDescription('View Ubisoft token availability')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false),
    
    new SlashCommandBuilder()
        .setName('ubisoft-refresh')
        .setDescription('Force refresh all Ubisoft panels')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false),
    
    new SlashCommandBuilder()
        .setName('ubisoft-sethighdemand')
        .setDescription('Set a Ubisoft game as high demand')
        .addStringOption(o => o.setName('game').setDescription('Game name').setRequired(true))
        .addBooleanOption(o => o.setName('enabled').setDescription('High demand enabled?').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    
    new SlashCommandBuilder()
        .setName('ubisoft-showhighdemand')
        .setDescription('Post auto-updating Ubisoft high demand games list')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    
    new SlashCommandBuilder()
        .setName('ubisoft-setformat')
        .setDescription('Set token format for a Ubisoft game (legacy or normal)')
        .addStringOption(o => o.setName('game').setDescription('Game name').setRequired(true))
        .addStringOption(o => o.setName('format').setDescription('Token format').setRequired(true)
            .addChoices({ name: 'Legacy', value: 'legacy' }, { name: 'Normal', value: 'normal' }))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    
    // === EA TICKET SYSTEM ===
    new SlashCommandBuilder()
        .setName('ea-setup')
        .setDescription('Create EA panel + set ticket channel')
        .addStringOption(o => o.setName('type').setDescription('Panel type').setRequired(true)
            .addChoices({ name: 'Free', value: 'free' }, { name: 'Paid', value: 'paid' }))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    
    new SlashCommandBuilder()
        .setName('ea-panel')
        .setDescription('Create EA panel in current channel')
        .addStringOption(o => o.setName('type').setDescription('Panel type').setRequired(true)
            .addChoices({ name: 'Free', value: 'free' }, { name: 'Paid', value: 'paid' }))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false),
    
    new SlashCommandBuilder()
        .setName('ea-status')
        .setDescription('View EA token availability')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false),
    
    new SlashCommandBuilder()
        .setName('ea-refresh')
        .setDescription('Force refresh all EA panels')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false),
    
    new SlashCommandBuilder()
        .setName('ea-sethighdemand')
        .setDescription('Set an EA game as high demand')
        .addStringOption(o => o.setName('game').setDescription('Game name').setRequired(true))
        .addBooleanOption(o => o.setName('enabled').setDescription('High demand enabled?').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    
    new SlashCommandBuilder()
        .setName('ea-showhighdemand')
        .setDescription('Post EA high demand games list')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(config.token);
    try {
        console.log('📝 Registering slash commands...');
        
        // Validate all commands first
        const commandsJson = [];
        for (let i = 0; i < commands.length; i++) {
            try {
                const json = commands[i].toJSON();
                commandsJson.push(json);
            } catch (cmdErr) {
                console.error(`❌ Command ${i} failed to serialize:`, cmdErr.message);
                console.error(`   Command name: ${commands[i]?.name || 'unknown'}`);
            }
        }
        
        console.log(`📝 Sending ${commandsJson.length} commands to Discord...`);
        
        // This overwrites ALL global commands - removes any old "Tickety Beta" commands
        const result = await rest.put(Routes.applicationCommands(client.user.id), { body: commandsJson });
        console.log(`✅ ${result.length} slash commands registered as "Bartender Bot"!`);
    } catch (err) { 
        console.error('❌ Command registration error:', err.message);
        console.error('   Full error:', err);
    }
}

// ============================================================================
// COMMAND HANDLER - Continued in index_part5.js (commands)
// Due to file size, see index_part5.js for handleCommand function
// ============================================================================
// ============================================================================
// 🍺 PUB'S BARTENDER BOT V2.1 - COMPLETE FIXED VERSION
// Part 5 of 5 - Command Handler and Event Handlers
// ============================================================================

// ============================================================================
// COMMAND HANDLER
// ============================================================================

async function handleCommand(interaction) {
    const { commandName } = interaction;
    
    // =========================================================================
    // SECURITY: Block DM commands (except a few safe ones)
    // =========================================================================
    const dmAllowedCommands = ['myhistory', 'mystatus']; // Only these work in DMs
    
    if (!interaction.guild) {
        if (!dmAllowedCommands.includes(commandName)) {
            return interaction.reply({ 
                content: '❌ This command can only be used in a server, not in DMs.', 
                ephemeral: true 
            });
        }
    }
    
    // =========================================================================
    // PERMISSION CHECKS
    // =========================================================================
    
    // Admin-only commands (require ManageGuild or admin role)
    const adminCommands = [
        'setup', 'setstaffroles', 'setticketchannel', 'setlogchannel', 'setactivationlogchannel',
        'cleartickets', 'clearcommands', 'resetall', 'cleanup', 'restart',
        'ubisoft-setup', 'ea-setup', 'setfreepanel', 'setpaneltype', 'syncgames', 'showhighdemand',
        'releasereserved'
    ];
    
    // Staff-only commands
    const staffCommands = [
        'stats', 'queue', 'regens', 'removecooldown', 'clearhighdemand', 
        'cooldown7d', 'cooldown1d', 'cooldown2d', 'cooldownhd', 
        'closeticket', 'approve', 'override', 'newtoken', 'canceltoken', 
        'sethighdemand', 'clearusertickets', 'viewcooldown', 'viewstaff', 'viewstaffroles',
        'redo', 'ticketstats', 'history', 'staffgenerate', 'resend', 
        'timeoutclose', 'cdclose', 'hdclose', 'listgames', 'syncgames', 
        'setgamesize', 'releasereserved', 'clearticketcooldown',
        'macro', 'listmacros', 'botstatus',
        'ubisoft-queue', 'ubisoft-status', 'ubisoft-refresh', 'ubisoft-sethighdemand', 'ubisoft-showhighdemand', 'ubisoft-setformat',
        'ubisoft-panel', 'ubisoft-clear-queue', 'ubisoft-remove-queue', 'ubisoft-clear-unknown',
        'ea-queue', 'ea-status', 'ea-panel', 'ea-refresh', 'ea-sethighdemand', 'ea-showhighdemand', 'ea'
    ];
    
    // User commands (anyone in server can use)
    const userCommands = ['myhistory', 'mystatus', 'gameinfo', 'viewcooldown', 'history'];
    
    // Check admin permissions
    if (adminCommands.includes(commandName)) {
        const hasAdminPerms = interaction.member?.permissions?.has('ManageGuild') || 
                             interaction.member?.permissions?.has('Administrator');
        if (!hasAdminPerms) {
            return interaction.reply({ 
                content: '❌ You need Administrator or Manage Server permissions to use this command.', 
                ephemeral: true 
            });
        }
    }
    
    // Check staff permissions - DEFAULT to staff-only unless in userCommands
    // This ensures any new/missing commands are staff-only by default
    if (!userCommands.includes(commandName) && !isStaff(interaction)) {
        return interaction.reply({ content: '❌ You need a staff role to use this command.', ephemeral: true });
    }
    
    // Commands that need deferReply (do async work before responding)
    const deferredCommands = [
        'setup', 'showhighdemand', 'stats', 'queue', 'regens', 'removecooldown', 
        'clearhighdemand', 'cooldown7d', 'cooldown1d', 'cooldown2d', 'cooldown3d', 'cooldownhd',
        'noss', 'nolx',  // No screenshots / Wrong Linux selection commands
        'viewcooldown', 'viewstaff', 'closeticket', 'approve', 'override', 
        'newtoken', 'canceltoken', 'history', 'myhistory', 'mystatus', 'gameinfo',
        'sethighdemand', 'cleartickets', 'clearusertickets', 'releasereserved',
        'redo', 'ticketstats', 'clearcommands', 'clearticketcooldown', 'staffgenerate',
        'resend', 'timeoutclose', 'cdclose', 'hdclose', 'listgames', 'syncgames',
        'setgamesize', 'setfreepanel', 'cleanup', 'macro', 'listmacros', 'botstatus', 'restart', 'resetall',
        'ubisoft-setup', 'ubisoft-panel', 'ubisoft-queue', 'ubisoft-status', 'ubisoft-refresh', 'ubisoft-sethighdemand', 'ubisoft-showhighdemand', 'ubisoft-setformat', 'ubisoft-clear-queue', 'ubisoft-remove-queue', 'ubisoft-clear-unknown',
        'ea-setup', 'ea-panel', 'ea-status', 'ea-refresh', 'ea-sethighdemand', 'ea-showhighdemand'
    ];
    
    // Quick commands that don't need defer
    const quickCommands = ['setstaffroles', 'setticketchannel', 'setlogchannel', 'setactivationlogchannel', 'setpaneltype', 'viewstaffroles'];
    
    try {
        // Defer reply for commands that might take time
        if (deferredCommands.includes(commandName)) {
            await interaction.deferReply({ ephemeral: true });
        }
        
        if (commandName === 'setup') {
            const panelType = interaction.options.getString('type') || 'free';
            await interaction.editReply({ content: '📋 Creating panel...' });
            await createPanel(interaction.channel, panelType);
            await interaction.editReply({ content: `✅ ${panelType === 'free' ? 'Free' : 'Premium'} panel created!` });
        }
        else if (commandName === 'setstaffroles') {
            const role1 = interaction.options.getRole('role1');
            const role2 = interaction.options.getRole('role2');
            const role3 = interaction.options.getRole('role3');
            const roles = [role1?.id, role2?.id, role3?.id].filter(Boolean);
            db.setServerStaffRoles(interaction.guild.id, roles);
            await interaction.reply({ content: `✅ Staff roles set: ${roles.map(id => `<@&${id}>`).join(', ')}`, ephemeral: true });
        }
        else if (commandName === 'setticketchannel') {
            db.setServerTicketChannel(interaction.guild.id, interaction.channel.id);
            await interaction.reply({ content: `✅ Ticket channel set to ${interaction.channel}`, ephemeral: true });
        }
        else if (commandName === 'setlogchannel') {
            db.setServerTicketLogChannel(interaction.guild.id, interaction.channel.id);
            await interaction.reply({ content: `✅ Ticket log channel set to ${interaction.channel}`, ephemeral: true });
        }
        else if (commandName === 'setactivationlogchannel') {
            db.setServerActivationLogChannel(interaction.guild.id, interaction.channel.id);
            await interaction.reply({ content: `✅ Activation log channel set to ${interaction.channel}\n\nAll successful game activations will now be logged here.`, ephemeral: true });
        }
        else if (commandName === 'showhighdemand') {
            try {
                // Create and send the high demand embed
                const embed = await createHighDemandEmbed();
                const message = await interaction.channel.send({ embeds: [embed] });
                
                // Save to database for auto-updates
                db.setHighDemandPanel(interaction.guild.id, interaction.channel.id, message.id);
                
                await interaction.editReply({ content: `✅ High demand games list posted!\n\nThis list will automatically update every 10 minutes.` });
            } catch (err) {
                console.error('[HighDemand] Error:', err);
                await interaction.editReply({ content: `❌ Failed to create high demand panel: ${err.message}` });
            }
        }
        else if (commandName === 'stats') {
            const stats = db.getStats();
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📊 Statistics').addFields(
                { name: '🎮 Games', value: `${stats.games}`, inline: true },
                { name: '🎫 Available', value: `${stats.availableTokens}`, inline: true },
                { name: '🔒 Reserved', value: `${stats.reservedTokens || 0}`, inline: true },
                { name: '⏳ Used', value: `${stats.usedTokens}`, inline: true },
                { name: '📂 Open Tickets', value: `${stats.openTickets}`, inline: true },
                { name: '📋 Total Tickets', value: `${stats.totalTickets}`, inline: true }
            )], ephemeral: true });
        }
        else if (commandName === 'queue') {
            const queueStatus = queueHelper ? await queueHelper.getStatus() : { queueLength: 0, processing: 0 };
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📊 Queue Status').addFields(
                { name: '📋 In Queue', value: `${queueStatus.queueLength || 0}`, inline: true },
                { name: '⚡ Processing', value: `${queueStatus.processing || 0}`, inline: true },
                { name: '👷 Workers', value: `${queueStatus.workerCount || 8}`, inline: true }
            )], ephemeral: true });
        }
        else if (commandName === 'regens') {
            const regens = db.getUpcomingRegens(10);
            const list = regens.length > 0 
                ? regens.map(r => `• **${r.game_name}** - <t:${Math.floor(new Date(r.regenerates_at).getTime() / 1000)}:R>`).join('\n')
                : 'No tokens regenerating soon.';
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('♻️ Upcoming Regenerations').setDescription(list)], ephemeral: true });
        }
        else if (commandName === 'removecooldown') {
            const user = interaction.options.getUser('user');
            db.removeAllUserCooldowns(user.id);
            await logCooldownEvent(interaction.guild.id, user.id, user.username, 'removed', 'all', null, interaction.user.username, interaction.user.id);
            await interaction.editReply({ content: `✅ All cooldowns removed for ${user.username}`, ephemeral: true });
        }
        else if (commandName === 'clearhighdemand') {
            const user = interaction.options.getUser('user');
            db.removeCooldown(user.id, interaction.guild.id, 'high_demand');
            await logCooldownEvent(interaction.guild.id, user.id, user.username, 'removed', 'high_demand', null, interaction.user.username, interaction.user.id);
            await interaction.editReply({ content: `✅ High demand cooldown cleared for ${user.username}`, ephemeral: true });
        }
        else if (commandName === 'cooldown7d') {
            const user = interaction.options.getUser('user');
            db.setCooldown(user.id, interaction.guild.id, 'ticket', 168);
            await logCooldownEvent(interaction.guild.id, user.id, user.username, 'applied', 'ticket', 168, interaction.user.username, interaction.user.id);
            await interaction.editReply({ content: `✅ Applied 7-day cooldown to ${user.username}`, ephemeral: true });
        }
        else if (commandName === 'cooldown3d') {
            // Get user from option or from ticket
            let user = interaction.options.getUser('user');
            const ticket = getAnyTicketFromChannel(interaction.channel?.id, interaction.guildId);
            
            if (!user && ticket) {
                try { user = await client.users.fetch(ticket.userId); } catch (e) {}
            }
            
            if (!user) {
                await interaction.editReply({ content: '❌ No user specified and no ticket found in this channel.', ephemeral: true });
                return;
            }
            
            db.setCooldown(user.id, interaction.guild.id, 'ticket', 72);
            await logCooldownEvent(interaction.guild.id, user.id, user.username, 'applied', 'ticket', 72, interaction.user.username, interaction.user.id);
            await interaction.editReply({ content: `✅ Applied 3-day cooldown to ${user.username}`, ephemeral: true });
            
            // Close ticket if in a ticket channel
            if (ticket) {
                if (ticket.platform === 'ubisoft') {
                    await closeUbisoftTicket(ticket.id, '3-day cooldown applied', interaction.channel);
                } else if (ticket.platform === 'ea') {
                    await closeEATicket(ticket.id, '3-day cooldown applied', interaction.channel);
                } else {
                    await closeTicket(ticket.id, '3-day cooldown applied', interaction.channel);
                }
            }
        }
        else if (commandName === 'noss') {
            // No screenshots - 3 day timeout and close
            const ticket = getAnyTicketFromChannel(interaction.channel?.id, interaction.guildId);
            
            if (!ticket) {
                await interaction.editReply({ content: '❌ No ticket found in this channel.', ephemeral: true });
                return;
            }
            
            let user;
            try { user = await client.users.fetch(ticket.userId); } catch (e) {}
            
            if (user) {
                db.setCooldown(user.id, interaction.guild.id, 'ticket', 72);
                await logCooldownEvent(interaction.guild.id, user.id, user.username, 'applied', 'ticket', 72, interaction.user.username, interaction.user.id);
            }
            
            await interaction.editReply({ content: `⚠️ **No Screenshots** - 3-day timeout applied to ${user?.username || 'user'}`, ephemeral: true });
            
            // Send reason message
            await interaction.channel.send({
                embeds: [new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('❌ Ticket Closed - No Screenshots')
                    .setDescription('You clicked "Need Help" without uploading any screenshots.\n\n**Timeout:** 3 days\n\nPlease read the instructions carefully next time.')
                    .setFooter({ text: `Action by ${interaction.user.username}` })
                ]
            }).catch(() => {});
            
            // Close ticket
            if (ticket.platform === 'ubisoft') {
                await closeUbisoftTicket(ticket.id, 'noss - No screenshots sent', interaction.channel);
            } else if (ticket.platform === 'ea') {
                await closeEATicket(ticket.id, 'noss - No screenshots sent', interaction.channel);
            } else {
                await closeTicket(ticket.id, 'noss - No screenshots sent', interaction.channel);
            }
        }
        else if (commandName === 'nolx') {
            // Clicked Linux/Mac on Windows - 3 day timeout and close
            const ticket = getAnyTicketFromChannel(interaction.channel?.id, interaction.guildId);
            
            if (!ticket) {
                await interaction.editReply({ content: '❌ No ticket found in this channel.', ephemeral: true });
                return;
            }
            
            let user;
            try { user = await client.users.fetch(ticket.userId); } catch (e) {}
            
            if (user) {
                db.setCooldown(user.id, interaction.guild.id, 'ticket', 72);
                await logCooldownEvent(interaction.guild.id, user.id, user.username, 'applied', 'ticket', 72, interaction.user.username, interaction.user.id);
            }
            
            await interaction.editReply({ content: `⚠️ **Wrong Platform** - 3-day timeout applied to ${user?.username || 'user'}`, ephemeral: true });
            
            // Send reason message
            await interaction.channel.send({
                embeds: [new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('❌ Ticket Closed - Wrong Platform Selected')
                    .setDescription('You clicked "Linux/Mac" but you are using Windows.\n\n**Timeout:** 3 days\n\nPlease read the options carefully. Linux/Mac is ONLY for actual Linux or macOS users.')
                    .setFooter({ text: `Action by ${interaction.user.username}` })
                ]
            }).catch(() => {});
            
            // Close ticket
            if (ticket.platform === 'ubisoft') {
                await closeUbisoftTicket(ticket.id, 'nolx - Clicked Linux/Mac on Windows', interaction.channel);
            } else if (ticket.platform === 'ea') {
                await closeEATicket(ticket.id, 'nolx - Clicked Linux/Mac on Windows', interaction.channel);
            } else {
                await closeTicket(ticket.id, 'nolx - Clicked Linux/Mac on Windows', interaction.channel);
            }
        }
        else if (commandName === 'cooldown1d') {
            const user = interaction.options.getUser('user');
            db.setCooldown(user.id, interaction.guild.id, 'ticket', 24);
            await logCooldownEvent(interaction.guild.id, user.id, user.username, 'applied', 'ticket', 24, interaction.user.username, interaction.user.id);
            await interaction.editReply({ content: `✅ Applied 1-day cooldown to ${user.username}`, ephemeral: true });
        }
        else if (commandName === 'cooldown2d') {
            const user = interaction.options.getUser('user');
            db.setCooldown(user.id, interaction.guild.id, 'ticket', 48);
            await logCooldownEvent(interaction.guild.id, user.id, user.username, 'applied', 'ticket', 48, interaction.user.username, interaction.user.id);
            await interaction.editReply({ content: `✅ Applied 2-day cooldown to ${user.username}`, ephemeral: true });
        }
        else if (commandName === 'cooldownhd') {
            const user = interaction.options.getUser('user');
            db.setCooldown(user.id, interaction.guild.id, 'high_demand', 168);
            await logCooldownEvent(interaction.guild.id, user.id, user.username, 'applied', 'high_demand', 168, interaction.user.username, interaction.user.id);
            await interaction.editReply({ content: `✅ Applied high demand cooldown to ${user.username}`, ephemeral: true });
        }
        else if (commandName === 'viewcooldown') {
            // User can view their own, staff can view others
            const targetUser = interaction.options.getUser('user') || interaction.user;
            
            // If trying to view someone else, must be staff
            if (targetUser.id !== interaction.user.id && !isStaff(interaction)) {
                await interaction.editReply({ content: '❌ You can only view your own cooldowns.', ephemeral: true });
                return;
            }
            
            const ticketCooldown = db.getUniversalCooldown(targetUser.id, 'ticket');
            const hdCooldown = db.getUniversalCooldown(targetUser.id, 'high_demand');
            let response = `**Cooldowns for ${targetUser.username}:**\n\n`;
            let hasCooldown = false;
            
            if (ticketCooldown) {
                const expiresAt = new Date(ticketCooldown.expires_at);
                if (expiresAt > new Date()) {
                    hasCooldown = true;
                    response += `🎫 **Ticket:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>\n`;
                }
            }
            if (hdCooldown) {
                const expiresAt = new Date(hdCooldown.expires_at);
                if (expiresAt > new Date()) {
                    hasCooldown = true;
                    response += `🔥 **High Demand:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>\n`;
                }
            }
            if (!hasCooldown) response = `✅ **${targetUser.username}** has no active cooldowns`;
            await interaction.editReply({ content: response, ephemeral: true });
        }
        else if (commandName === 'viewstaff') {
            const staffRoles = db.getServerStaffRoles(interaction.guild.id);
            const list = staffRoles.length > 0 ? staffRoles.map(id => `<@&${id}>`).join('\n') : 'None configured';
            await interaction.editReply({ content: `**📋 Staff Roles:**\n\n${list}`, ephemeral: true });
        }
        else if (commandName === 'closeticket') {
            const reason = interaction.options.getString('reason') || 'Closed by staff';
            
            // Try Steam first, then Ubisoft, then EA
            let ticket = getTicketFromChannel(interaction.channel?.id, interaction.guildId);
            let platform = 'steam';
            
            if (!ticket) {
                ticket = getUbisoftTicketFromChannel(interaction.channel?.id, interaction.guildId);
                platform = 'ubisoft';
            }
            
            if (!ticket) {
                ticket = getEATicketFromChannel(interaction.channel?.id, interaction.guildId);
                platform = 'ea';
            }
            
            if (ticket) {
                await interaction.editReply({ content: '✅ Closing...', ephemeral: true });
                await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: `Closed: ${reason}`, platform });
                
                if (platform === 'ubisoft') {
                    await closeUbisoftTicket(ticket.id, reason, interaction.channel);
                } else if (platform === 'ea') {
                    await closeEATicket(ticket.id, reason, interaction.channel);
                } else {
                    await closeTicket(ticket.id, reason, interaction.channel);
                }
            } else {
                await interaction.editReply({ content: '⚠️ No ticket found.', ephemeral: true });
            }
        }
        else if (commandName === 'approve') {
            // Try Steam, Ubisoft, and EA tickets
            let ticket = getTicketFromChannel(interaction.channel?.id, interaction.guildId);
            let platform = 'steam';
            
            if (!ticket) {
                ticket = getUbisoftTicketFromChannel(interaction.channel?.id, interaction.guildId);
                platform = 'ubisoft';
            }
            
            if (!ticket) {
                ticket = getEATicketFromChannel(interaction.channel?.id, interaction.guildId);
                platform = 'ea';
            }
            
            if (!ticket) { 
                await interaction.editReply({ content: '❌ No ticket found.', ephemeral: true }); 
                return; 
            }
            
            if (platform === 'ea') {
                // For EA: Approve screenshots and move to token request phase with instructions
                const game = db.getEAGame(ticket.gameId);
                ticket.status = 'awaiting_token_request';
                if (db.updateEATicketStatus) db.updateEATicketStatus(ticket.id, 'awaiting_token_request');
                
                // Show instructions to user in channel
                const instructionsEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ Screenshots Approved!')
                    .setDescription('**Follow these instructions:**')
                    .addFields({ name: '📋 Instructions', value: EA_INSTRUCTIONS.substring(0, 1024) })
                    .setFooter({ text: `Ticket: ${ticket.id}` });
                
                await interaction.channel.send({ content: `<@${ticket.userId}>`, embeds: [instructionsEmbed] });
                
                const tokenRequestEmbed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('📤 Step 2: Upload Token Request File')
                    .setDescription('Upload the `.txt` file generated by the game.\n\n⏱️ **Time Limit:** 30 minutes')
                    .setFooter({ text: ticket.id });
                
                const buttons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`ea_early_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`ea_close_ticket_${ticket.id}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
                );
                
                await interaction.channel.send({ embeds: [tokenRequestEmbed], components: [buttons] });
                startEATokenRequestTimer(ticket.id, interaction.channel);
                
                await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: 'Manual approval', platform: 'ea' });
                await interaction.editReply({ content: '✅ EA ticket approved! Instructions shown to user.', ephemeral: true });
            } else if (platform === 'ubisoft') {
                // For Ubisoft: Approve screenshots and show instructions/download
                const game = db.getUbisoftGame(ticket.gameId);
                await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: 'Manual approval', platform: 'ubisoft' });
                await showUbisoftInstructionsAndDownload(interaction, ticket, game);
                await interaction.editReply({ content: '✅ Ubisoft ticket approved! Instructions shown to user.', ephemeral: true });
            } else {
                // For Steam: Approve and ping user
                ticket.status = 'screenshot_approved';
                db.markScreenshotVerified(ticket.id);
                await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: 'Manual approval' });
                
                // Send approval message WITH user ping
                await interaction.channel.send({ 
                    content: `<@${ticket.userId}>`, 
                    embeds: [new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('✅ Staff Approved')
                        .setDescription(`Your screenshots have been approved by ${interaction.user.username}!\n\nClick the button below to get your activation.`)
                    ], 
                    components: [new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`get_activation_${ticket.id}`).setLabel('Get Activation').setEmoji('🎮').setStyle(ButtonStyle.Success)
                    )] 
                });
                
                await interaction.editReply({ content: '✅ Steam ticket approved! User has been notified.' });
            }
        }
        // Issue #16 FIX - /override now steps through instead of skipping
        else if (commandName === 'override') {
            // Try Steam, Ubisoft, and EA tickets
            let ticket = getTicketFromChannel(interaction.channel?.id, interaction.guildId);
            let platform = 'steam';
            
            if (!ticket) {
                ticket = getUbisoftTicketFromChannel(interaction.channel?.id, interaction.guildId);
                platform = 'ubisoft';
            }
            
            if (!ticket) {
                ticket = getEATicketFromChannel(interaction.channel?.id, interaction.guildId);
                platform = 'ea';
            }
            
            if (!ticket) { 
                await interaction.editReply({ content: '❌ No ticket found.', ephemeral: true }); 
                return; 
            }
            
            const currentStatus = ticket.status;
            let newStatus = '', message = '';
            
            if (platform === 'ea') {
                // EA flow: awaiting_screenshot → awaiting_token_request → in_queue → token_sent
                switch (currentStatus) {
                    case 'open':
                    case 'awaiting_screenshot':
                        // Skip to instructions - show user what to do
                        try {
                            const game = db.getEAGame(ticket.gameId);
                            ticket.status = 'awaiting_token_request';
                            if (db.updateEATicketStatus) db.updateEATicketStatus(ticket.id, 'awaiting_token_request');
                            
                            // Show instructions to user in channel
                            const instructionsEmbed = new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setTitle('✅ Screenshots Approved by Staff')
                                .setDescription('**Follow these instructions:**')
                                .addFields({ name: '📋 Instructions', value: EA_INSTRUCTIONS.substring(0, 1024) })
                                .setFooter({ text: `Ticket: ${ticket.id}` });
                            
                            await interaction.channel.send({ content: `<@${ticket.userId}>`, embeds: [instructionsEmbed] });
                            
                            const tokenRequestEmbed = new EmbedBuilder()
                                .setColor(0x5865F2)
                                .setTitle('📤 Step 2: Upload Token Request File')
                                .setDescription('Upload the `.txt` file generated by the game.\n\n⏱️ **Time Limit:** 30 minutes')
                                .setFooter({ text: ticket.id });
                            
                            const buttons = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId(`ea_early_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
                                new ButtonBuilder().setCustomId(`ea_close_ticket_${ticket.id}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
                            );
                            
                            await interaction.channel.send({ embeds: [tokenRequestEmbed], components: [buttons] });
                            startEATokenRequestTimer(ticket.id, interaction.channel);
                            
                            await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: 'Override: Skipped screenshot verification', platform: 'ea' });
                            await interaction.editReply({ content: '✅ EA Override: Skipped to token request phase. Instructions shown to user.', ephemeral: true });
                        } catch (err) {
                            console.error('[EA Override] Error:', err);
                            await interaction.editReply({ content: `❌ Override failed: ${err.message}`, ephemeral: true });
                        }
                        return;
                    case 'awaiting_token_request':
                        message = 'Waiting for user to upload token_request.bin';
                        break;
                    case 'in_queue':
                        message = 'Already in queue for processing';
                        break;
                    case 'processing':
                        message = 'Currently processing - please wait';
                        break;
                    case 'token_sent':
                        message = 'Token already sent - waiting for user response';
                        break;
                    default:
                        message = `Cannot override from status: ${currentStatus}`;
                }
                await interaction.editReply({ content: `⏩ EA Override: ${message}`, ephemeral: true });
            } else if (platform === 'ubisoft') {
                // Ubisoft flow: awaiting_screenshot → awaiting_token_request → in_queue → token_sent
                switch (currentStatus) {
                    case 'awaiting_screenshot':
                        // Skip to instructions
                        try {
                            const game = db.getUbisoftGame(ticket.gameId);
                            await showUbisoftInstructionsAndDownload(interaction, ticket, game);
                            await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: 'Override: Skipped screenshot verification', platform: 'ubisoft' });
                            await interaction.editReply({ content: '✅ Override: Skipped to instructions phase.', ephemeral: true });
                        } catch (err) {
                            console.error('[Ubisoft Override] Error:', err);
                            await interaction.editReply({ content: `❌ Override failed: ${err.message}`, ephemeral: true });
                        }
                        return;
                    case 'awaiting_token_request':
                        message = 'Waiting for user to upload token_request.txt';
                        break;
                    case 'in_queue':
                        message = 'Already in queue for processing';
                        break;
                    case 'processing':
                        message = 'Currently processing - please wait';
                        break;
                    case 'token_sent':
                        message = 'Token already sent - waiting for user response';
                        break;
                    default:
                        message = `Cannot override from status: ${currentStatus}`;
                }
                await interaction.editReply({ content: `⏩ Ubisoft Override: ${message}`, ephemeral: true });
            } else {
                // Steam flow (original behavior)
                switch (currentStatus) {
                    case 'awaiting_refill_choice':
                        newStatus = 'awaiting_screenshot';
                        message = 'Progressed to screenshot step';
                        break;
                    case 'awaiting_steam_id':
                        newStatus = 'awaiting_screenshot';
                        message = 'Progressed to screenshot step (skipped Steam ID)';
                        break;
                    case 'awaiting_screenshot':
                        newStatus = 'screenshot_approved';
                        message = 'Progressed to approved status';
                        db.markScreenshotVerified(ticket.id);
                        break;
                    case 'awaiting_staff':
                        newStatus = 'screenshot_approved';
                        message = 'Approved (skipped staff review)';
                        db.markScreenshotVerified(ticket.id);
                        break;
                    case 'screenshot_approved':
                        message = 'Already at approved - user can get activation';
                        break;
                    default:
                        message = `Cannot override from: ${currentStatus}`;
                }
                
                if (newStatus) {
                    ticket.status = newStatus;
                    await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: `Override: ${message}` });
                }
                
                // If progressed to screenshot step, show the screenshot instructions
                if (newStatus === 'awaiting_screenshot') {
                    ticket.collectedScreenshots = [];
                    const game = db.getGame(ticket.gameId);
                    const gameInstr = getGameInstructions(game?.game_id || game?.folder_name || game?.game_name);
                    const expectedFolderName = gameInstr.folderName || game?.folder_name || game?.game_name;
                    
                    const screenshotEmbed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('📸 Screenshot Required')
                        .setDescription('Please upload screenshot(s) showing:')
                        .addFields(
                            { name: '📋 Required', value: '• Game folder properties (showing size)\n• Windows Update Blocker (showing DISABLED - red X icon)', inline: false },
                            { name: '⏱️ Time Limit', value: '10 minutes', inline: true },
                            { name: '📦 Expected Size', value: game?.size_gb ? `~${game.size_gb} GB` : 'Any size', inline: true },
                            { name: '📁 Expected Folder', value: expectedFolderName || 'Unknown', inline: true }
                        );
                    
                    const screenshotButtons = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`early_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId(`close_ticket_${ticket.id}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
                    );
                    
                    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('⏩ Override').setDescription(`**${message}**\n\nPrevious: \`${currentStatus}\`\nNew: \`${newStatus}\``)], ephemeral: true });
                    await interaction.channel.send({ content: `<@${ticket.userId}>`, embeds: [screenshotEmbed], components: [screenshotButtons] });
                    startScreenshotTimer(ticket.id, interaction.channel);
                    return;
                }
                
                // If approved, send visible message with Get Activation button
                if (newStatus === 'screenshot_approved' || currentStatus === 'screenshot_approved') {
                    // Send visible message to channel with user ping
                    await interaction.channel.send({ 
                        content: `<@${ticket.userId}>`, 
                        embeds: [new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('⏩ Override')
                            .setDescription(`**${message}**\n\nYour ticket has been progressed. Click below to get your activation.`)
                        ], 
                        components: [new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`get_activation_${ticket.id}`).setLabel('Get Activation').setEmoji('🎮').setStyle(ButtonStyle.Success)
                        )] 
                    });
                    await interaction.editReply({ content: '✅ Override complete! User has been notified.' });
                } else {
                    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('⏩ Override').setDescription(`**${message}**\n\nPrevious: \`${currentStatus}\`\nNew: \`${newStatus || currentStatus}\``)], components: [] });
                }
            }
        }
        // Issue #6 FIX - /newtoken now queues properly
        else if (commandName === 'newtoken') {
            const ticket = getAnyTicketFromChannel(interaction.channel?.id, interaction.guildId);
            if (!ticket) { await interaction.editReply({ content: '❌ No ticket found.' }); return; }
            
            // EA/Ubisoft don't use the same token system
            if (ticket.platform === 'ea' || ticket.platform === 'ubisoft') {
                await interaction.editReply({ content: `ℹ️ For ${ticket.platform.toUpperCase()} tickets, ask the user to re-upload their token request file.`, ephemeral: true });
                return;
            }
            
            // FIX: Clear any cached download URL from previous generation
            ticket.downloadUrl = null;
            ticket.lastGenerationTimestamp = null;
            
            // FIX: Release any existing reserved token first
            db.releaseReservedToken(ticket.id);
            console.log(`[NewToken] Released old token for ticket ${ticket.id}`);
            
            // Reserve a NEW token
            const reserveResult = db.reserveToken(ticket.gameId, ticket.id);
            if (reserveResult.changes === 0) {
                await interaction.editReply({ content: `❌ No tokens available for ${ticket.gameName}` });
                return;
            }
            console.log(`[NewToken] Reserved new token for ticket ${ticket.id}`);
            
            ticket.tokenReserved = true;
            ticket.activationRequested = true;
            ticket.generationInProgress = true;
            
            try {
                const queueResult = await queueHelper.addToQueue({
                    gameId: ticket.gameId, ticketId: ticket.id, channelId: ticket.threadId,
                    userId: ticket.userId, username: ticket.username, steamId: ticket.steamId || '',
                    forceNewAccount: true,  // Force a different account for /newtoken
                    forceRegenerate: true,  // Force fresh generation, don't use cached result
                    newTokenRequest: true   // Flag this as a /newtoken request
                });
                
                if (!queueResult.success) throw new Error(queueResult.error);
                
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFFF00).setTitle('⏳ New Token Queued').setDescription(`Position: #${queueResult.position}\nETA: ${queueResult.etaFormatted}`).setFooter({ text: `Requested by ${interaction.user.username}` })] });
                
                const gameInfo = db.getGame(ticket.gameId);
                const stopWatching = queueHelper.startWatching({
                    ticketId: ticket.id, channelId: ticket.threadId, userId: ticket.userId,
                    onComplete: async (result) => {
                        activeQueueWatchers.delete(ticket.id);
                        const channel = await client.channels.fetch(ticket.threadId);
                        if (!channel) return;
                        
                        db.useReservedToken(ticket.id, ticket.userId, ticket.username);
                        db.markTokenSent(ticket.id);
                        ticket.status = 'token_sent';
                        ticket.generationInProgress = false;
                        await updatePanel();
                        
                        const game = db.getGame(ticket.gameId);
                        const gameSlug = game?.game_id || game?.folder_name || game?.game_name || ticket.gameId;
                        const instructions = getGameInstructions(gameSlug);
                        let refillNote = ticket.isRefill ? '\n\n⚠️ **REFILL:** Check save data before confirming!' : '';
                        
                        const responseButtons = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`it_works_${ticket.id}`).setLabel('It Works!').setEmoji('✅').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`need_help_${ticket.id}`).setLabel('Need Help').setEmoji('🆘').setStyle(ButtonStyle.Danger),
                            new ButtonBuilder().setLabel('Video Guide').setEmoji('🎬').setStyle(ButtonStyle.Link).setURL(config.videoGuideUrl)
                        );
                        
                        await channel.send({ content: `<@${ticket.userId}> 🎉 **New token generated!**`, embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('🎉 New Token').setDescription(`**Download:** [${result.gameName}](${result.downloadUrl})\n\n${instructions.instructions}${refillNote}`)], components: [responseButtons] });
                        startResponseTimer(ticket.id, channel);
                        await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: 'New token via /newtoken' });
                    },
                    onFailed: async (error) => {
                        activeQueueWatchers.delete(ticket.id);
                        ticket.generationInProgress = false;
                        const channel = await client.channels.fetch(ticket.threadId);
                        if (channel) await channel.send({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Failed').setDescription(error)] });
                    }
                });
                activeQueueWatchers.set(ticket.id, stopWatching);
            } catch (err) {
                ticket.generationInProgress = false;
                await interaction.editReply({ content: `❌ Failed: ${err.message}` });
            }
        }
        else if (commandName === 'canceltoken') {
            const ticket = getAnyTicketFromChannel(interaction.channel?.id, interaction.guildId);
            if (!ticket) { await interaction.editReply({ content: '❌ No ticket found.', ephemeral: true }); return; }
            
            if (ticket.platform === 'ea') {
                // EA cancel token logic
                ticket.status = 'awaiting_token_request';
                if (db.updateEATicketStatus) db.updateEATicketStatus(ticket.id, 'awaiting_token_request');
                await interaction.editReply({ content: '🔄 EA Token cancelled. User can retry uploading token_request.bin', ephemeral: true });
            } else if (ticket.platform === 'ubisoft') {
                // Ubisoft cancel token logic
                ticket.status = 'awaiting_token_request';
                if (db.updateUbisoftTicketStatus) db.updateUbisoftTicketStatus(ticket.id, 'awaiting_token_request');
                await interaction.editReply({ content: '🔄 Ubisoft Token cancelled. User can retry.', ephemeral: true });
            } else {
                // Steam original logic
                const result = db.cancelToken(ticket.id);
                if (result.success) {
                    ticket.status = 'screenshot_approved';
                    ticket.tokenReserved = false;
                    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF6600).setTitle('🔄 Token Cancelled')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`get_activation_${ticket.id}`).setLabel('Try Again').setEmoji('🔄').setStyle(ButtonStyle.Success))] });
                    await updatePanel();
                } else {
                    await interaction.editReply({ content: `❌ ${result.error}`, ephemeral: true });
                }
            }
        }
        else if (commandName === 'history') {
            const targetUser = interaction.options.getUser('user');
            
            // If user specified someone else, they need to be staff
            if (targetUser && targetUser.id !== interaction.user.id && !isStaff(interaction)) {
                await interaction.editReply({ content: '❌ You can only view your own history.', ephemeral: true });
                return;
            }
            
            // Use target user or self
            const userId = targetUser?.id || interaction.user.id;
            const username = targetUser?.username || interaction.user.username;
            
            try {
                // Get combined history from all platforms
                const allHistory = db.getAllUserHistory ? db.getAllUserHistory(userId) : [];
                
                if (allHistory.length === 0) {
                    await interaction.editReply({ embeds: [new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle(`📜 Activation History - ${username}`)
                        .setDescription('No past activations found.')
                        .setFooter({ text: 'Open a ticket to get your first game!' })
                    ]});
                    return;
                }
                
                // Count by platform
                const platformCounts = { steam: 0, ubisoft: 0, ea: 0 };
                allHistory.forEach(a => {
                    platformCounts[a.platform] = (platformCounts[a.platform] || 0) + 1;
                });
                
                // Platform emoji mapping
                const platformEmoji = { steam: '🎮', ubisoft: '🔷', ea: '⚽' };
                
                // Platform summary
                const platformSummary = `🎮 Steam: **${platformCounts.steam}** | 🔷 Ubisoft: **${platformCounts.ubisoft}** | ⚽ EA: **${platformCounts.ea}**`;
                
                // Build dropdown options (max 25)
                const dropdownOptions = allHistory.slice(0, 25).map((item, index) => {
                    const date = new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    const gameName = (item.game_name || 'Unknown Game').substring(0, 50);
                    const emoji = platformEmoji[item.platform] || '🎮';
                    const reason = (item.close_reason || 'completed').substring(0, 30);
                    
                    return {
                        label: gameName.substring(0, 25),
                        description: `${date} • ${reason}`.substring(0, 50),
                        value: `history_${userId}_${index}`,
                        emoji: emoji
                    };
                });
                
                // Store history in cache for selection handling
                if (!global.historyCache) global.historyCache = new Map();
                global.historyCache.set(userId, { history: allHistory, username, expires: Date.now() + 600000 }); // 10 min cache
                
                // Build embed
                const embed = new EmbedBuilder()
                    .setColor(0x00FF88)
                    .setTitle(`📜 Activation History - ${username}`)
                    .setDescription(`**${allHistory.length}** total activations!\n\n${platformSummary}\n\n**Select a ticket below to view details:**`)
                    .setFooter({ text: `User ID: ${userId} • Showing ${Math.min(25, allHistory.length)} most recent` })
                    .setTimestamp();
                
                // Build select menu
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`history_select_${userId}`)
                    .setPlaceholder('📋 Select a ticket to view details...')
                    .addOptions(dropdownOptions);
                
                const row = new ActionRowBuilder().addComponents(selectMenu);
                
                await interaction.editReply({ embeds: [embed], components: [row], ephemeral: true });
            } catch (err) {
                console.error('[History] Error:', err);
                await interaction.editReply({ content: '❌ Failed to load history.', ephemeral: true });
            }
        }
        // === USER SELF-SERVICE COMMANDS ===
        else if (commandName === 'myhistory') {
            try {
                const userId = interaction.user.id;
                const username = interaction.user.username;
                
                // Get combined history from all platforms
                const allHistory = db.getAllUserHistory ? db.getAllUserHistory(userId) : [];
                
                if (allHistory.length === 0) {
                    await interaction.editReply({ embeds: [new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('📜 Your Activation History')
                        .setDescription('You have no past activations yet.')
                        .setFooter({ text: 'Open a ticket to get your first game!' })
                    ]});
                    return;
                }
                
                // Count by platform
                const platformCounts = { steam: 0, ubisoft: 0, ea: 0 };
                allHistory.forEach(a => {
                    platformCounts[a.platform] = (platformCounts[a.platform] || 0) + 1;
                });
                
                // Platform emoji mapping
                const platformEmoji = { steam: '🎮', ubisoft: '🔷', ea: '⚽' };
                
                // Platform summary
                const platformSummary = `🎮 Steam: **${platformCounts.steam}** | 🔷 Ubisoft: **${platformCounts.ubisoft}** | ⚽ EA: **${platformCounts.ea}**`;
                
                // Build dropdown options (max 25)
                const dropdownOptions = allHistory.slice(0, 25).map((item, index) => {
                    const date = new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    const gameName = (item.game_name || 'Unknown Game').substring(0, 50);
                    const emoji = platformEmoji[item.platform] || '🎮';
                    const reason = (item.close_reason || 'completed').substring(0, 30);
                    
                    return {
                        label: gameName.substring(0, 25),
                        description: `${date} • ${reason}`.substring(0, 50),
                        value: `history_${userId}_${index}`,
                        emoji: emoji
                    };
                });
                
                // Store history in cache for selection handling
                if (!global.historyCache) global.historyCache = new Map();
                global.historyCache.set(userId, { history: allHistory, username, expires: Date.now() + 600000 }); // 10 min cache
                
                // Build embed
                const embed = new EmbedBuilder()
                    .setColor(0x00FF88)
                    .setTitle('📜 Your Activation History')
                    .setDescription(`You have **${allHistory.length}** total activations!\n\n${platformSummary}\n\n**Select a ticket below to view details:**`)
                    .setFooter({ text: `Showing ${Math.min(25, allHistory.length)} most recent` })
                    .setTimestamp();
                
                // Build select menu
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`history_select_${userId}`)
                    .setPlaceholder('📋 Select a ticket to view details...')
                    .addOptions(dropdownOptions);
                
                const row = new ActionRowBuilder().addComponents(selectMenu);
                
                await interaction.editReply({ embeds: [embed], components: [row] });
            } catch (err) {
                console.error('[MyHistory] Error:', err);
                await interaction.editReply({ content: '❌ Failed to load history.' });
            }
        }
        else if (commandName === 'mystatus') {
            try {
                const userId = interaction.user.id;
                const guildId = interaction.guild.id;
                
                // Check all cooldown types
                const ticketCooldown = db.checkCooldown(userId, guildId, 'ticket');
                const highDemandCooldown = db.checkCooldown(userId, guildId, 'high_demand');
                const gameCooldowns = db.getDatabase().prepare(`
                    SELECT cooldown_type, expires_at FROM cooldowns 
                    WHERE user_id = ? AND guild_id = ? AND expires_at > datetime('now') AND cooldown_type LIKE 'game_%'
                    ORDER BY expires_at DESC LIMIT 5
                `).all(userId, guildId);
                
                // Check for open tickets
                const openTicket = db.getDatabase().prepare(`
                    SELECT ticket_id, game_id FROM tickets 
                    WHERE user_id = ? AND status = 'open' LIMIT 1
                `).get(userId);
                
                // Get user's activation count
                const activationCount = db.getDatabase().prepare(`
                    SELECT COUNT(*) as count FROM ticket_logs 
                    WHERE user_id = ? AND event_type = 'completed'
                `).get(userId)?.count || 0;
                
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('📊 Your Status')
                    .setDescription(`Here's your current status, ${interaction.user.username}!`);
                
                // Open ticket status
                if (openTicket) {
                    const game = db.getGameById(openTicket.game_id);
                    embed.addFields({ 
                        name: '🎫 Open Ticket', 
                        value: `You have an open ticket for **${game?.game_name || 'Unknown'}**`, 
                        inline: false 
                    });
                } else {
                    embed.addFields({ 
                        name: '🎫 Open Ticket', 
                        value: '✅ No open tickets - you can request a game!', 
                        inline: false 
                    });
                }
                
                // Cooldown status
                let cooldownText = '';
                if (ticketCooldown) {
                    const remaining = Math.ceil((new Date(ticketCooldown.expires_at) - Date.now()) / 60000);
                    cooldownText += `⏰ **Ticket Cooldown:** ${remaining} min remaining\n`;
                }
                if (highDemandCooldown) {
                    const remaining = Math.ceil((new Date(highDemandCooldown.expires_at) - Date.now()) / 60000);
                    cooldownText += `🔥 **High Demand Cooldown:** ${remaining} min remaining\n`;
                }
                if (gameCooldowns.length > 0) {
                    gameCooldowns.forEach(cd => {
                        const gameName = cd.cooldown_type.replace('game_', '').replace(/_/g, ' ');
                        const remaining = Math.ceil((new Date(cd.expires_at) - Date.now()) / 60000);
                        cooldownText += `🎮 **${gameName}:** ${remaining} min remaining\n`;
                    });
                }
                
                embed.addFields({ 
                    name: '⏱️ Cooldowns', 
                    value: cooldownText || '✅ No active cooldowns!', 
                    inline: false 
                });
                
                // Stats
                embed.addFields({ 
                    name: '📈 Your Stats', 
                    value: `Total Activations: **${activationCount}**`, 
                    inline: false 
                });
                
                embed.setFooter({ text: 'Use /myhistory to see your past games' });
                embed.setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error('[MyStatus] Error:', err);
                await interaction.editReply({ content: '❌ Failed to load status.' });
            }
        }
        else if (commandName === 'gameinfo') {
            try {
                const searchTerm = interaction.options.getString('game');
                
                // Search for game
                const games = db.getDatabase().prepare(`
                    SELECT g.*, 
                        (SELECT COUNT(*) FROM tokens t WHERE t.game_id = g.id AND t.status = 'available' AND t.reserved_by_ticket IS NULL) as available_tokens,
                        (SELECT COUNT(*) FROM tokens t WHERE t.game_id = g.id) as total_tokens
                    FROM games g 
                    WHERE g.game_name LIKE ? OR g.id LIKE ?
                    LIMIT 5
                `).all(`%${searchTerm}%`, `%${searchTerm}%`);
                
                if (games.length === 0) {
                    await interaction.editReply({ embeds: [new EmbedBuilder()
                        .setColor(0xFF4444)
                        .setTitle('❌ Game Not Found')
                        .setDescription(`No games found matching "**${searchTerm}**".\n\nTry a different search term or check the game list.`)
                    ]});
                    return;
                }
                
                // If multiple matches, show first one
                const game = games[0];
                const hasTokens = game.available_tokens > 0;
                const isHighDemand = game.high_demand === 1;
                
                const embed = new EmbedBuilder()
                    .setColor(hasTokens ? 0x00FF88 : 0xFF4444)
                    .setTitle(`🎮 ${game.game_name}`)
                    .setDescription(hasTokens 
                        ? '✅ **Tokens Available** - You can request this game!' 
                        : '❌ **No Tokens Available** - Check back later');
                
                // Token availability
                embed.addFields({ 
                    name: '🎫 Token Status', 
                    value: `Available: **${game.available_tokens}** / ${game.total_tokens}`, 
                    inline: true 
                });
                
                // High demand status
                if (isHighDemand) {
                    embed.addFields({ 
                        name: '🔥 High Demand', 
                        value: 'Yes - Longer cooldown after activation', 
                        inline: true 
                    });
                }
                
                // File size
                if (game.expected_size_gb) {
                    embed.addFields({ 
                        name: '💾 Expected Size', 
                        value: `${game.expected_size_gb} GB`, 
                        inline: true 
                    });
                }
                
                // Instructions if available
                if (game.instructions) {
                    const instructions = game.instructions.length > 500 
                        ? game.instructions.substring(0, 500) + '...' 
                        : game.instructions;
                    embed.addFields({ 
                        name: '📋 Instructions', 
                        value: instructions, 
                        inline: false 
                    });
                }
                
                // Cover image
                if (game.cover_url) {
                    embed.setThumbnail(game.cover_url);
                }
                
                // Multiple matches note
                if (games.length > 1) {
                    const otherGames = games.slice(1).map(g => g.game_name).join(', ');
                    embed.setFooter({ text: `Also found: ${otherGames}` });
                } else {
                    embed.setFooter({ text: 'Use the game panel to request this game' });
                }
                
                await interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error('[GameInfo] Error:', err);
                await interaction.editReply({ content: '❌ Failed to load game info.' });
            }
        }
        else if (commandName === 'sethighdemand') {
            const gameName = interaction.options.getString('game');
            const enabled = interaction.options.getBoolean('enabled');
            const result = db.setHighDemand(gameName, enabled);
            if (result?.changes > 0) {
                await interaction.editReply({ content: `✅ **${gameName}** is now ${enabled ? '🔥 HIGH DEMAND' : 'normal'}`, ephemeral: true });
                await updatePanel();
            } else {
                await interaction.editReply({ content: `❌ Game not found`, ephemeral: true });
            }
        }
        else if (commandName === 'cleartickets') {
            let steamCleared = 0;
            let ubisoftCleared = 0;
            let eaCleared = 0;
            
            // Clear Steam tickets
            const openTickets = db.getOpenTickets();
            for (const ticket of openTickets) db.releaseReservedToken(ticket.ticket_id);
            const steamResult = db.getDatabase().prepare("UPDATE tickets SET status='closed', closed_at=datetime('now') WHERE status='open'").run();
            steamCleared = steamResult.changes;
            activeTickets.clear();
            
            // Clear Ubisoft tickets
            for (const [ticketId, ticket] of activeUbisoftTickets) {
                if (db.releaseUbisoftToken) db.releaseUbisoftToken(ticketId);
            }
            activeUbisoftTickets.clear();
			ubisoftTokenQueue.length = 0; // CLEAR THE QUEUE TOO
			isProcessingUbisoftQueue = false; // RESET PROCESSING FLAG
            try {
                const ubisoftResult = db.getDatabase().prepare("UPDATE ubisoft_tickets SET status='closed', closed_at=datetime('now') WHERE status='open'").run();
                ubisoftCleared = ubisoftResult.changes;
            } catch (e) {}
            
            // Clear EA tickets
            for (const [ticketId, ticket] of activeEATickets) {
                if (db.releaseEAToken) db.releaseEAToken(ticketId);
            }
            activeEATickets.clear();
            try {
                const eaResult = db.getDatabase().prepare("UPDATE ea_tickets SET status='closed', closed_at=datetime('now') WHERE status='open'").run();
                eaCleared = eaResult.changes;
            } catch (e) {}
            
            // Update all panels
            await updatePanel();
            if (typeof updateUbisoftPanel === 'function') updateUbisoftPanel();
            if (typeof updateEAPanel === 'function') updateEAPanel();
            
            const total = steamCleared + ubisoftCleared + eaCleared;
            let msg = `✅ Cleared ${total} stuck ticket(s)!`;
            if (total > 0) {
                msg += `\n• Steam: ${steamCleared}\n• Ubisoft: ${ubisoftCleared}\n• EA: ${eaCleared}`;
            }
            await interaction.editReply({ content: msg });
        }
        else if (commandName === 'clearusertickets') {
            const user = interaction.options.getUser('user');
            let steamCleared = 0;
            let ubisoftCleared = 0;
            let eaCleared = 0;
            
            // Clear Steam tickets
            for (const [ticketId, ticket] of activeTickets) {
                if (ticket.userId === user.id) {
                    db.releaseReservedToken(ticketId);
                    activeTickets.delete(ticketId);
                    steamCleared++;
                }
            }
            const steamResult = db.getDatabase().prepare("UPDATE tickets SET status='closed', closed_at=datetime('now') WHERE status='open' AND user_id = ?").run(user.id);
            steamCleared = Math.max(steamCleared, steamResult.changes);
            
            // Clear Ubisoft tickets
            for (const [ticketId, ticket] of activeUbisoftTickets) {
                if (ticket.userId === user.id) {
                    if (db.releaseUbisoftToken) db.releaseUbisoftToken(ticketId);
                    activeUbisoftTickets.delete(ticketId);
                    ubisoftCleared++;
                }
            }
            try {
                const ubisoftResult = db.getDatabase().prepare("UPDATE ubisoft_tickets SET status='closed', closed_at=datetime('now') WHERE status='open' AND user_id = ?").run(user.id);
                ubisoftCleared = Math.max(ubisoftCleared, ubisoftResult.changes);
            } catch (e) {}
            
            // Clear EA tickets
            for (const [ticketId, ticket] of activeEATickets) {
                if (ticket.userId === user.id) {
                    if (db.releaseEAToken) db.releaseEAToken(ticketId);
                    activeEATickets.delete(ticketId);
                    eaCleared++;
                }
            }
            try {
                const eaResult = db.getDatabase().prepare("UPDATE ea_tickets SET status='closed', closed_at=datetime('now') WHERE status='open' AND user_id = ?").run(user.id);
                eaCleared = Math.max(eaCleared, eaResult.changes);
            } catch (e) {}
            
            // Update all panels
            await updatePanel();
            if (typeof updateUbisoftPanel === 'function') updateUbisoftPanel();
            if (typeof updateEAPanel === 'function') updateEAPanel();
            
            const total = steamCleared + ubisoftCleared + eaCleared;
            let msg = `✅ Cleared ${total} ticket(s) for ${user.username}!`;
            if (total > 0) {
                msg += `\n• Steam: ${steamCleared}\n• Ubisoft: ${ubisoftCleared}\n• EA: ${eaCleared}`;
            }
            await interaction.editReply({ content: msg });
        }
        else if (commandName === 'releasereserved') {
            let steamReleased = 0;
            let ubisoftReleased = 0;
            let eaReleased = 0;
            
            // Release Steam reserved tokens
            const steamResult = db.getDatabase().prepare("UPDATE tokens SET reserved_by_ticket = NULL WHERE reserved_by_ticket IS NOT NULL").run();
            steamReleased = steamResult.changes;
            
            // Release Ubisoft reserved tokens
            try {
                const ubisoftResult = db.getDatabase().prepare("UPDATE ubisoft_tokens SET reserved_by_ticket = NULL WHERE reserved_by_ticket IS NOT NULL").run();
                ubisoftReleased = ubisoftResult.changes;
            } catch (e) {}
            
            // Release EA reserved tokens
            try {
                const eaResult = db.getDatabase().prepare("UPDATE ea_tokens SET reserved_by_ticket = NULL WHERE reserved_by_ticket IS NOT NULL").run();
                eaReleased = eaResult.changes;
            } catch (e) {}
            
            // Update all panels
            await updatePanel();
            if (typeof updateUbisoftPanel === 'function') updateUbisoftPanel();
            if (typeof updateEAPanel === 'function') updateEAPanel();
            
            const total = steamReleased + ubisoftReleased + eaReleased;
            let msg = `✅ Released ${total} reserved token(s)!`;
            if (total > 0) {
                msg += `\n• Steam: ${steamReleased}\n• Ubisoft: ${ubisoftReleased}\n• EA: ${eaReleased}`;
            }
            await interaction.editReply({ content: msg });
        }
        // Issue #15 FIX - /redo command
        else if (commandName === 'redo') {
            const ticket = getAnyTicketFromChannel(interaction.channel?.id, interaction.guildId);
            if (!ticket) { await interaction.editReply({ content: '❌ No ticket found.', ephemeral: true }); return; }
            
            const step = interaction.options.getString('step');
            const previousStatus = ticket.status;
            ticket.status = step;
            
            if (ticket.platform === 'ea') {
                // EA platform
                if (step === 'awaiting_token_request') {
                    ticket.collectedScreenshots = [];
                }
                if (db.updateEATicketStatus) db.updateEATicketStatus(ticket.id, step);
                await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: `Reset: ${previousStatus} → ${step}`, platform: 'ea' });
                
                const eaPrompts = {
                    'awaiting_screenshot': 'Upload screenshots.',
                    'awaiting_token_request': 'Upload the token request file.',
                    'awaiting_staff': 'Waiting for staff review.'
                };
                
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF6600).setTitle('🔄 EA Reset').setDescription(`**${step}**\n\n${eaPrompts[step] || ''}`).setFooter({ text: `By ${interaction.user.username}` })] });
                
                if (step === 'awaiting_screenshot') {
                    await interaction.channel.send({ content: `<@${ticket.userId}> Please upload your screenshots.` });
                }
            } else if (ticket.platform === 'ubisoft') {
                // Ubisoft platform
                if (step === 'awaiting_screenshot') {
                    ticket.collectedScreenshots = [];
                } else if (step === 'awaiting_token_request') {
                    // Already verified, waiting for token request
                } else if (step === 'ubisoft_approved') {
                    // Show instructions embed
                    ticket.status = 'awaiting_token_request';
                }
                
                if (db.updateUbisoftTicketStatus) db.updateUbisoftTicketStatus(ticket.id, ticket.status);
                await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: `Reset: ${previousStatus} → ${step}`, platform: 'ubisoft' });
                
                const ubisoftPrompts = {
                    'awaiting_screenshot': 'Upload screenshots.',
                    'awaiting_token_request': 'Upload the `token_req_####.txt` file.',
                    'ubisoft_approved': 'Showing download instructions...',
                    'awaiting_staff': 'Waiting for staff review.'
                };
                
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF6600).setTitle('🔄 Ubisoft Reset').setDescription(`**${step}**\n\n${ubisoftPrompts[step] || ''}`).setFooter({ text: `By ${interaction.user.username}` })] });
                
                // If approved, show the instructions/download embed
                if (step === 'ubisoft_approved') {
                    const game = db.getUbisoftGame ? db.getUbisoftGame(ticket.gameId) : null;
                    if (game) {
                        const downloadLinks = game.download_links || 'No download links configured.';
                        const instructions = game.instructions || getDefaultUbisoftInstructions(game.game_name);
                        
                        const instructionsEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle(`📥 ${game.game_name} - Download & Instructions`)
                            .setDescription(`**Step 2: Download Files & Generate Token Request**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
                            .addFields(
                                { name: '📥 Download Links', value: downloadLinks.substring(0, 1000), inline: false },
                                { name: '📋 Instructions', value: instructions.substring(0, 1000), inline: false },
                                { name: '⏱️ Next Step', value: 'After following the instructions, upload the generated `token_req_####.txt` file here.\n\n**Time Limit: 30 minutes**', inline: false }
                            )
                            .setFooter({ text: `Ticket: ${ticket.id} | Awaiting token_req` })
                            .setTimestamp();
                        
                        if (game.cover_url) instructionsEmbed.setThumbnail(game.cover_url);
                        
                        await interaction.channel.send({ content: `<@${ticket.userId}>`, embeds: [instructionsEmbed] });
                        startUbisoftTokenRequestTimer(ticket.id, interaction.channel);
                    }
                } else if (step === 'awaiting_screenshot') {
                    await interaction.channel.send({ content: `<@${ticket.userId}> Please upload your screenshots.` });
                }
            } else {
                // Steam original logic
                if (step === 'awaiting_refill_choice') { ticket.isRefill = false; ticket.steamId = null; ticket.collectedScreenshots = []; }
                else if (step === 'awaiting_steam_id') { ticket.steamId = null; ticket.collectedScreenshots = []; }
                else if (step === 'awaiting_screenshot') { ticket.collectedScreenshots = []; ticket.isLinuxMac = false; }
                else if (step === 'awaiting_linux_screenshot') { ticket.collectedScreenshots = []; ticket.isLinuxMac = true; }
                
                await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: `Reset: ${previousStatus} → ${step}` });
                
                const stepPrompts = {
                    'awaiting_refill_choice': 'Select refill or new activation.',
                    'awaiting_steam_id': 'Provide Steam ID.',
                    'awaiting_screenshot': 'Upload screenshots.',
                    'awaiting_linux_screenshot': 'Upload Linux/Mac screenshots for manual review.',
                    'awaiting_staff': 'Waiting for staff.',
                    'screenshot_approved': 'Can get activation.'
                };
                
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF6600).setTitle('🔄 Reset').setDescription(`**${step}**\n\n${stepPrompts[step] || ''}`).setFooter({ text: `By ${interaction.user.username}` })] });
                
                if (step === 'awaiting_refill_choice') {
                    await interaction.channel.send({ content: `<@${ticket.userId}>`, components: [new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`refill_no_${ticket.id}`).setLabel('New Activation').setEmoji('🆕').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`refill_yes_${ticket.id}`).setLabel('Refill').setEmoji('🔄').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`close_ticket_${ticket.id}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
                    )] });
                } else if (step === 'screenshot_approved') {
                    await interaction.channel.send({ content: `<@${ticket.userId}> You can now get your activation.`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`get_activation_${ticket.id}`).setLabel('Get Activation').setEmoji('🎮').setStyle(ButtonStyle.Success))] });
                }
            }
        }
        else if (commandName === 'ticketstats') {
            const stats = db.getTicketStats(interaction.guild.id);
            const dailyStats = db.getDailyTicketStats(interaction.guild.id);
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📊 Ticket Statistics').addFields(
                { name: '📈 Today', value: `Opened: ${dailyStats.opened}\nClosed: ${dailyStats.closed}\nSuccessful: ${dailyStats.successful}`, inline: true },
                { name: '📊 All Time', value: `Total: ${stats.total}\nOpen: ${stats.open}\nSuccess: ${stats.successful}`, inline: true },
                { name: '📉 Other', value: `Cancelled: ${stats.cancelled}\nTimed Out: ${stats.timedOut}\nGhosted: ${stats.ghosted}`, inline: true }
            ).setFooter({ text: `Success Rate: ${stats.successRate}%` })], ephemeral: true });
        }
        else if (commandName === 'clearcommands') {
            try {
                const rest = new REST({ version: '10' }).setToken(config.token);
                
                await interaction.editReply({ content: '🔄 Step 1/3: Clearing global commands...' });
                
                // Clear ALL global commands first
                console.log('[ClearCommands] Clearing all global commands...');
                await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
                
                await interaction.editReply({ content: '🔄 Step 2/3: Clearing guild commands...' });
                
                // Also clear guild-specific commands if any
                console.log('[ClearCommands] Clearing guild commands...');
                await rest.put(Routes.applicationGuildCommands(client.user.id, interaction.guild.id), { body: [] });
                
                // Wait a moment
                await new Promise(r => setTimeout(r, 2000));
                
                await interaction.editReply({ content: `🔄 Step 3/3: Re-registering ${commands.length} commands...` });
                
                // Re-register fresh commands
                console.log('[ClearCommands] Re-registering commands...');
                const result = await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
                
                await interaction.editReply({ content: `✅ Success! Registered ${result.length} commands.\n\n⚠️ Commands may take a few minutes to appear. Try restarting Discord (Ctrl+R) to refresh.` });
                console.log(`[ClearCommands] Successfully re-registered ${result.length} commands`);
            } catch (err) {
                console.error('[ClearCommands] Error:', err);
                await interaction.editReply({ content: `❌ Error during command registration: ${err.message}\n\nTry restarting the bot with: pm2 restart bartender-bot` }).catch(() => {});
            }
        }
        // === NEW COMMANDS FROM REFERENCE DOCS ===
        else if (commandName === 'clearticketcooldown') {
            const user = interaction.options.getUser('user');
            db.removeCooldown(user.id, interaction.guild.id, 'ticket');
            await logCooldownEvent(interaction.guild.id, user.id, user.username, 'removed', 'ticket', null, interaction.user.username, interaction.user.id);
            await interaction.editReply({ content: `✅ Ticket cooldown removed for ${user.username}`, ephemeral: true });
        }
        else if (commandName === 'staffgenerate') {
            // Same as newtoken - redirect
            const ticket = getAnyTicketFromChannel(interaction.channel?.id, interaction.guildId);
            if (!ticket) { await interaction.editReply({ content: '❌ No ticket found in this channel.' }); return; }
            if (!ticket.gameId) { await interaction.editReply({ content: '❌ No game selected for this ticket.' }); return; }
            
            // EA/Ubisoft don't use the same token system
            if (ticket.platform === 'ea' || ticket.platform === 'ubisoft') {
                await interaction.editReply({ content: `ℹ️ For ${ticket.platform.toUpperCase()} tickets, ask the user to re-upload their token request file.`, ephemeral: true });
                return;
            }
            
            // Release old token first
            db.releaseReservedToken(ticket.id);
            console.log(`[StaffGenerate] Released old token for ticket ${ticket.id}`);
            
            // Reserve new token
            const newToken = db.reserveToken(ticket.gameId, ticket.id);
            if (!newToken) {
                await interaction.editReply({ content: `❌ No available tokens for ${ticket.gameName}` });
                return;
            }
            
            ticket.reservedToken = newToken;
            console.log(`[StaffGenerate] Reserved new token ${newToken.id} for ticket ${ticket.id}`);
            
            // Add to queue
            if (queueHelper) {
                await queueHelper.addToQueue({
                    ticketId: ticket.id, gameId: ticket.gameId, gameName: ticket.gameName,
                    userId: ticket.userId, username: ticket.username, channelId: ticket.threadId,
                    steamId: ticket.steamId || '', accountName: newToken.account_name,
                    accountNumber: newToken.account_number, isRefill: ticket.isRefill || false
                });
            }
            
            await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: 'Staff generated new token' });
            await interaction.editReply({ content: `✅ New token queued for ${ticket.gameName}!` });
        }
        else if (commandName === 'resend') {
            const ticket = getAnyTicketFromChannel(interaction.channel?.id, interaction.guildId);
            if (!ticket) { await interaction.editReply({ content: '❌ No ticket found.', ephemeral: true }); return; }
            if (!ticket.lastDownloadLink) { await interaction.editReply({ content: '❌ No download link available to resend.', ephemeral: true }); return; }
            
            await interaction.editReply({ content: `📤 Resending download link...`, ephemeral: true });
            await interaction.channel.send({ 
                content: `<@${ticket.userId}>`,
                embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('📥 Download Link (Resent)').setDescription(`[Click here to download](${ticket.lastDownloadLink})\n\n⚠️ Link may have expired. If it doesn't work, ask staff for a new token.`)]
            });
            await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: 'Resent download link', platform: ticket.platform || 'steam' });
        }
        else if (commandName === 'timeoutclose') {
            const ticket = getAnyTicketFromChannel(interaction.channel?.id, interaction.guildId);
            if (!ticket) { await interaction.editReply({ content: '❌ No ticket found.', ephemeral: true }); return; }
            
            db.setCooldown(ticket.userId, ticket.guildId, 'ticket', 168);
            await logCooldownEvent(interaction.guild.id, ticket.userId, ticket.username, 'applied', 'ticket', 168, interaction.user.username, interaction.user.id);
            
            await interaction.editReply({ content: '✅ Applied 7-day cooldown and closing ticket...', ephemeral: true });
            await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: 'Timeout close with cooldown', platform: ticket.platform || 'steam' });
            
            if (ticket.platform === 'ea') {
                await closeEATicket(ticket.id, 'timeout_by_staff', interaction.channel);
            } else if (ticket.platform === 'ubisoft') {
                await closeUbisoftTicket(ticket.id, 'timeout_by_staff', interaction.channel);
            } else {
                await closeTicket(ticket.id, 'timeout_by_staff', interaction.channel);
            }
        }
        else if (commandName === 'cdclose') {
            const ticket = getAnyTicketFromChannel(interaction.channel?.id, interaction.guildId);
            if (!ticket) { await interaction.editReply({ content: '❌ No ticket found.' }); return; }
            
            // Apply 2-day cooldown
            db.setCooldown(ticket.userId, ticket.guildId, 'ticket', 48);
            await logCooldownEvent(interaction.guild.id, ticket.userId, ticket.username, 'applied', 'ticket', 48, interaction.user.username, interaction.user.id);
            
            await interaction.editReply({ content: '✅ Applied 2-day cooldown and closing ticket...' });
            
            // Log to ticket logs
            await logTicketEvent(ticket, 'closed', { 
                staffMember: interaction.user.username, 
                staffId: interaction.user.id,
                reason: 'Closed with 2-day cooldown (cdclose)',
                cooldownApplied: '48h',
                platform: ticket.platform || 'steam'
            });
            
            // Log to activation channel
            await logStaffClose(ticket, interaction.user, 'cdclose', '2-day cooldown applied');
            
            if (ticket.platform === 'ea') {
                await closeEATicket(ticket.id, 'cdclose_by_staff', interaction.channel);
            } else if (ticket.platform === 'ubisoft') {
                await closeUbisoftTicket(ticket.id, 'cdclose_by_staff', interaction.channel);
            } else {
                await closeTicket(ticket.id, 'cdclose_by_staff', interaction.channel);
            }
        }
        else if (commandName === 'hdclose') {
            const ticket = getAnyTicketFromChannel(interaction.channel?.id, interaction.guildId);
            if (!ticket) { await interaction.editReply({ content: '❌ No ticket found.' }); return; }
            
            // Apply 2-day ticket cooldown
            db.setCooldown(ticket.userId, ticket.guildId, 'ticket', 48);
            await logCooldownEvent(interaction.guild.id, ticket.userId, ticket.username, 'applied', 'ticket', 48, interaction.user.username, interaction.user.id);
            
            // Apply 7-day high demand cooldown
            db.setCooldown(ticket.userId, ticket.guildId, 'high_demand', 168);
            await logCooldownEvent(interaction.guild.id, ticket.userId, ticket.username, 'applied', 'high_demand', 168, interaction.user.username, interaction.user.id);
            
            await interaction.editReply({ content: '✅ Applied 2-day cooldown + HD cooldown and closing ticket...' });
            
            // Log to ticket logs
            await logTicketEvent(ticket, 'closed', { 
                staffMember: interaction.user.username, 
                staffId: interaction.user.id,
                reason: 'Closed with 2-day cooldown + HD cooldown (hdclose)',
                cooldownApplied: '48h + 7d HD',
                platform: ticket.platform || 'steam'
            });
            
            // Log to activation channel
            await logStaffClose(ticket, interaction.user, 'hdclose', '2-day cooldown + 7-day HD cooldown applied');
            
            if (ticket.platform === 'ea') {
                await closeEATicket(ticket.id, 'hdclose_by_staff', interaction.channel);
            } else if (ticket.platform === 'ubisoft') {
                await closeUbisoftTicket(ticket.id, 'hdclose_by_staff', interaction.channel);
            } else {
                await closeTicket(ticket.id, 'hdclose_by_staff', interaction.channel);
            }
        }
        else if (commandName === 'listgames') {
            const games = db.getAllGames();
            if (!games || games.length === 0) {
                await interaction.editReply({ content: '❌ No games found.', ephemeral: true });
                return;
            }
            
            const gameList = games.slice(0, 25).map(g => {
                const demand = g.demand_type === 'high' ? '🔥' : '';
                const size = g.size_gb ? `${g.size_gb}GB` : 'N/A';
                return `${demand}**${g.game_name}** - ${size}`;
            }).join('\n');
            
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎮 Games List')
                .setDescription(gameList)
                .setFooter({ text: `Showing ${Math.min(25, games.length)} of ${games.length} games` });
            
            await interaction.editReply({ embeds: [embed], ephemeral: true });
        }
        else if (commandName === 'syncgames') {
            try {
                await updatePanel();
                const games = db.getAllGames();
                await interaction.editReply({ content: `✅ Synced ${games.length} games from database and refreshed panel!` });
            } catch (err) {
                await interaction.editReply({ content: `❌ Sync failed: ${err.message}` });
            }
        }
        else if (commandName === 'setgamesize') {
            const gameName = interaction.options.getString('game');
            const size = interaction.options.getNumber('size');
            
            const game = db.getAllGames().find(g => g.game_name.toLowerCase().includes(gameName.toLowerCase()));
            if (!game) {
                await interaction.editReply({ content: `❌ Game "${gameName}" not found.`, ephemeral: true });
                return;
            }
            
            db.updateGameSize(game.game_id, size);
            await interaction.editReply({ content: `✅ Updated **${game.game_name}** size to ${size}GB`, ephemeral: true });
        }
        else if (commandName === 'setfreepanel') {
            const gameName = interaction.options.getString('game');
            const enabled = interaction.options.getBoolean('enabled');
            
            const game = db.getAllGames().find(g => g.game_name.toLowerCase().includes(gameName.toLowerCase()));
            if (!game) {
                await interaction.editReply({ content: `❌ Game "${gameName}" not found.`, ephemeral: true });
                return;
            }
            
            db.setFreePanel(game.game_id, enabled);
            await updatePanel();
            await interaction.editReply({ content: `✅ **${game.game_name}** ${enabled ? 'added to' : 'removed from'} free panel`, ephemeral: true });
        }
        else if (commandName === 'setpaneltype') {
            const type = interaction.options.getString('type');
            db.setServerPanelType(interaction.guild.id, type);
            await updatePanel();
            await interaction.reply({ content: `✅ Panel type set to **${type}**`, ephemeral: true });
        }
        else if (commandName === 'viewstaffroles') {
            const staffRoles = db.getServerStaffRoles(interaction.guild.id);
            const list = staffRoles.length > 0 ? staffRoles.map(id => `<@&${id}>`).join('\n') : 'None configured';
            await interaction.reply({ content: `**📋 Staff Roles:**\n\n${list}`, ephemeral: true });
        }
        else if (commandName === 'resetall') {
            try {
                const result = db.getDatabase().prepare("UPDATE tokens SET status = 'available', reserved_by_ticket = NULL, used_at = NULL, used_by_user_id = NULL, used_by_username = NULL WHERE status != 'available'").run();
                await updatePanel();
                await interaction.editReply({ content: `⚠️ **RESET COMPLETE**\n\n${result.changes} tokens reset to available.\n\n**Warning:** This is a dangerous action!` });
            } catch (err) {
                await interaction.editReply({ content: `❌ Reset failed: ${err.message}` });
            }
        }
        else if (commandName === 'cleanup') {
            try {
                // Release orphaned reservations
                const orphaned = db.getDatabase().prepare(`
                    UPDATE tokens SET reserved_by_ticket = NULL 
                    WHERE reserved_by_ticket IS NOT NULL 
                    AND reserved_by_ticket NOT IN (SELECT ticket_id FROM tickets WHERE status = 'open')
                `).run();
                
                // Close old open tickets
                const oldTickets = db.getDatabase().prepare(`
                    UPDATE tickets SET status = 'closed', closed_at = datetime('now'), close_reason = 'cleanup'
                    WHERE status = 'open' AND created_at < datetime('now', '-24 hours')
                `).run();
                
                await updatePanel();
                await interaction.editReply({ content: `✅ **Cleanup Complete**\n\n• Released ${orphaned.changes} orphaned reservations\n• Closed ${oldTickets.changes} old tickets` });
            } catch (err) {
                await interaction.editReply({ content: `❌ Cleanup failed: ${err.message}` });
            }
        }
        // === STAFF MACRO COMMANDS ===
        else if (commandName === 'macro') {
            const template = interaction.options.getString('template');
            
            // Get macro from database
            const macro = db.getMacro(template);
            if (!macro) {
                await interaction.editReply({ content: '❌ Unknown macro template. Use `/listmacros` to see available options.', ephemeral: true });
                return;
            }
            
            // Parse color (stored as hex string like '#1B2838')
            const colorInt = parseInt(macro.color.replace('#', ''), 16) || 0x5865F2;
            
            const embed = new EmbedBuilder()
                .setColor(colorInt)
                .setTitle(macro.title)
                .setDescription(macro.content)
                .setFooter({ text: `Sent by ${interaction.user.username}` })
                .setTimestamp();
            
            // Send publicly in the channel
            await interaction.editReply({ embeds: [embed] });
        }
        else if (commandName === 'listmacros') {
            // Get all macros from database
            const macros = db.getAllMacros();
            
            if (macros.length === 0) {
                await interaction.editReply({ content: '❌ No macros configured. Add some via the dashboard!', ephemeral: true });
                return;
            }
            
            const macroList = macros.map(m => `${m.emoji} **${m.name}** - ${m.title.replace(/^[^\s]+\s/, '')}`).join('\n');
            
            await interaction.editReply({ 
                embeds: [new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('📝 Staff Macros')
                    .setDescription(`**📋 Available Macros:**\n\nUse \`/macro [template]\` to send a quick response.\n\n${macroList}\n\n*Tip: Manage macros at the dashboard!*`)
                ],
                ephemeral: true 
            });
        }
        // === BOT MANAGEMENT COMMANDS ===
        else if (commandName === 'botstatus') {
            const botManager = getBotManager();
            const status = botManager.getStatus();
            
            const statusEmbed = new EmbedBuilder()
                .setColor(status.online ? 0x00FF00 : 0xFF0000)
                .setTitle('🤖 Bot Status')
                .addFields(
                    { name: '📡 Status', value: status.online ? '🟢 Online' : '🔴 Offline', inline: true },
                    { name: '⏱️ Uptime', value: status.uptimeFormatted, inline: true },
                    { name: '💾 Memory', value: status.memory.formatted, inline: true },
                    { name: '📦 Node.js', value: status.nodeVersion, inline: true },
                    { name: '🖥️ Platform', value: status.platform, inline: true },
                    { name: '🔢 PID', value: `${status.pid}`, inline: true }
                )
                .setFooter({ text: `Started: ${new Date(status.startTime).toLocaleString()}` })
                .setTimestamp();
            
            // Add last restart info if available
            if (status.lastRestart) {
                statusEmbed.addFields({
                    name: '🔄 Last Restart',
                    value: `By **${status.lastRestart.triggeredBy?.username || 'Unknown'}** via ${status.lastRestart.source}\n<t:${Math.floor(new Date(status.lastRestart.timestamp).getTime() / 1000)}:R>`,
                    inline: false
                });
            }
            
            // Add cooldown info
            if (!status.canRestart) {
                const cooldownRemaining = botManager.getCooldownRemainingFormatted();
                statusEmbed.addFields({
                    name: '⏳ Restart Cooldown',
                    value: `Available in ${cooldownRemaining}`,
                    inline: true
                });
            }
            
            await interaction.editReply({ embeds: [statusEmbed], ephemeral: true });
        }
        else if (commandName === 'restart') {
            const botManager = getBotManager();
            
            // Check if user has admin role in the ADMIN SERVER, not current server
            let canRestart = false;
            
            // Get owner IDs from env
            const ownerIds = (process.env.OWNER_IDS || '864918577563697203').split(',').map(s => s.trim());
            
            // Check owner first
            if (ownerIds.includes(interaction.user.id)) {
                canRestart = true;
                console.log(`[Restart] User ${interaction.user.username} is owner`);
            } else {
                // Fetch member from admin server to check roles
                try {
                    const adminServerId = process.env.PAID_SERVER_ID || '1265271912037089312';
                    const adminGuild = await client.guilds.fetch(adminServerId).catch(() => null);
                    
                    if (adminGuild) {
                        const adminMember = await adminGuild.members.fetch(interaction.user.id).catch(() => null);
                        
                        if (adminMember) {
                            canRestart = botManager.canUserRestart(adminMember, interaction.user.id);
                        } else {
                            console.log(`[Restart] User ${interaction.user.username} not found in admin server`);
                        }
                    } else {
                        console.log(`[Restart] Could not fetch admin server ${adminServerId}`);
                    }
                } catch (err) {
                    console.error(`[Restart] Error checking admin role:`, err.message);
                }
            }
            
            if (!canRestart) {
                await interaction.editReply({ 
                    content: '❌ **Access Denied**\n\nOnly admins can use this command.'
                });
                return;
            }
            
            // Check cooldown
            if (!botManager.canRestart()) {
                const remaining = botManager.getCooldownRemainingFormatted();
                await interaction.editReply({ 
                    content: `⏳ **Restart on Cooldown**\n\nPlease wait **${remaining}** before restarting again.`
                });
                return;
            }
            
            // Show confirmation
            const confirmEmbed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('⚠️ Confirm Restart')
                .setDescription('Are you sure you want to restart the bot?\n\n**This will:**\n• Save all active tickets\n• Finish current operations gracefully\n• Clear all timers\n• Restart the bot process\n\n✅ Active tickets will be **restored** after restart!\n\nThe bot should be back online within 10-30 seconds.')
                .setFooter({ text: 'This action will be logged.' });
            
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_restart')
                    .setLabel('Confirm Restart')
                    .setEmoji('🔄')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('cancel_restart')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );
            
            const reply = await interaction.editReply({ 
                embeds: [confirmEmbed], 
                components: [confirmRow]
            });
            
            // Wait for confirmation
            try {
                const confirmation = await reply.awaitMessageComponent({ 
                    filter: i => i.user.id === interaction.user.id,
                    time: 30000 
                });
                
                if (confirmation.customId === 'confirm_restart') {
                    await confirmation.update({ 
                        embeds: [new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('🔄 Restarting...')
                            .setDescription('Bot is restarting. Please wait 10-30 seconds.')
                        ], 
                        components: [] 
                    });
                    
                    // Execute restart
                    const result = await botManager.restart({
                        userId: interaction.user.id,
                        username: interaction.user.username
                    }, 'discord');
                    
                    if (!result.success) {
                        await interaction.followUp({ 
                            content: `❌ Restart failed: ${result.error}`, 
                            ephemeral: true 
                        });
                    }
                } else {
                    await confirmation.update({ 
                        embeds: [new EmbedBuilder()
                            .setColor(0x888888)
                            .setTitle('❌ Restart Cancelled')
                        ], 
                        components: [] 
                    });
                }
            } catch (err) {
                // Timeout - no response
                await interaction.editReply({ 
                    embeds: [new EmbedBuilder()
                        .setColor(0x888888)
                        .setTitle('⏰ Confirmation Timed Out')
                        .setDescription('Restart cancelled - no response received.')
                    ], 
                    components: [] 
                });
            }
        }
        // ============================================================================
        // UBISOFT COMMANDS
        // ============================================================================
        else if (commandName === 'ubisoft-setup') {
            const panelType = interaction.options.getString('type');
            
            // Set this channel as Ubisoft ticket channel
            if (db.setUbisoftTicketChannel) {
                db.setUbisoftTicketChannel(interaction.guild.id, interaction.channel.id);
            }
            
            // Create the panel
            await createUbisoftPanel(interaction.channel, panelType);
            await interaction.editReply({ content: `✅ Ubisoft ${panelType} panel created!`, ephemeral: true });
        }
        else if (commandName === 'ubisoft-panel') {
            const panelType = interaction.options.getString('type');
            await createUbisoftPanel(interaction.channel, panelType);
            await interaction.editReply({ content: `✅ Ubisoft ${panelType} panel created!`, ephemeral: true });
        }
        else if (commandName === 'ubisoft-queue') {
            const queueLength = ubisoftTokenQueue.length;
            const processing = isProcessingUbisoftQueue ? 1 : 0;
            
            let queueList = 'Queue is empty.';
            if (queueLength > 0) {
                queueList = ubisoftTokenQueue.slice(0, 10).map((entry, i) => {
                    const ticket = activeUbisoftTickets.get(entry.ticketId);
                    return `${i + 1}. ${ticket?.username || 'Unknown'} - ${ticket?.gameName || 'Unknown'}`;
                }).join('\n');
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎯 Ubisoft Queue Status')
                .addFields(
                    { name: '📋 In Queue', value: `${queueLength}`, inline: true },
                    { name: '⚡ Processing', value: `${processing}`, inline: true },
                    { name: '⏱️ Est. Wait', value: `~${queueLength * 2} min`, inline: true }
                )
                .setDescription(queueList);
            
            await interaction.editReply({ embeds: [embed], ephemeral: true });
        }
else if (commandName === 'ubisoft-clear-queue') {
    const beforeCount = ubisoftTokenQueue.length;
    const wasProcessing = isProcessingUbisoftQueue;
    
    if (beforeCount === 0 && !wasProcessing) {
        await interaction.editReply({ 
            content: '✅ Ubisoft queue is already empty.', 
            ephemeral: true 
        });
        return;
    }
    
    // Get info about currently processing ticket (if any) before clearing
    let processingTicketInfo = null;
    if (wasProcessing && ubisoftTokenQueue.length > 0) {
        const currentEntry = ubisoftTokenQueue[0];
        const currentTicket = activeUbisoftTickets.get(currentEntry.ticketId);
        if (currentTicket) {
            processingTicketInfo = {
                username: currentTicket.username || 'Unknown',
                gameName: currentTicket.gameName || 'Unknown',
                ticketId: currentTicket.id,
                userId: currentTicket.userId
            };
        }
    }
    
    // ✅ FORCE CLEAR: Stop processing and clear everything
    isProcessingUbisoftQueue = false; // Stop the processing loop
    
    // Collect all affected users for the staff report
    const affectedUsers = [];
    
    for (const entry of ubisoftTokenQueue) {
        const ticket = activeUbisoftTickets.get(entry.ticketId);
        if (ticket) {
            affectedUsers.push({
                username: ticket.username || 'Unknown',
                userId: ticket.userId,
                gameName: ticket.gameName || 'Unknown',
                ticketId: ticket.id,
                position: ticket.queuePosition || 'Unknown'
            });
        }
    }
    
    ubisoftTokenQueue.length = 0; // Clear the entire queue
    
    // Reset ALL Ubisoft tickets that were in queue or processing
    for (const [ticketId, ticket] of activeUbisoftTickets.entries()) {
        if (ticket.status === 'inqueue' || ticket.status === 'processing') {
            ticket.status = 'awaitingtokenrequest'; // Reset to awaiting token request
            ticket.queuePosition = 0;
        }
    }
    
    // Log the action
    console.log(`[UBISOFT] FULL QUEUE CLEAR by ${interaction.user.username} (${interaction.user.id}). Cleared ${beforeCount} entries. Was processing: ${wasProcessing}`);
    if (processingTicketInfo) {
        console.log(`[UBISOFT] Interrupted processing for: ${processingTicketInfo.username} - ${processingTicketInfo.gameName} (Ticket ${processingTicketInfo.ticketId})`);
    }
    
    // Build detailed staff-only embed
    const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🧹 Ubisoft Queue Fully Cleared')
        .setDescription(`Successfully cleared the entire Ubisoft Panel queue including any active generation.`)
        .addFields(
            { name: '🗑️ Items Removed', value: `${beforeCount}`, inline: true },
            { name: '⚡ Was Processing', value: wasProcessing ? '✅ Yes (Stopped)' : '❌ No', inline: true },
            { name: '📋 Current Queue', value: `0`, inline: true }
        )
        .setFooter({ text: `Cleared by ${interaction.user.username}` })
        .setTimestamp();
    
    // Add processing info if available
    if (processingTicketInfo) {
        embed.addFields({
            name: '🛑 Interrupted Generation',
            value: `**${processingTicketInfo.username}** (<@${processingTicketInfo.userId}>)\n${processingTicketInfo.gameName}\nTicket ID: ${processingTicketInfo.ticketId}`,
            inline: false
        });
    }
    
    // Add affected users list (up to 10 users shown)
    if (affectedUsers.length > 0) {
        const userList = affectedUsers.slice(0, 10).map(u => 
            `\`#${u.position}\` **${u.username}** - ${u.gameName}`
        ).join('\n');
        
        const moreUsers = affectedUsers.length > 10 ? `\n*...and ${affectedUsers.length - 10} more*` : '';
        
        embed.addFields({
            name: `👥 Affected Users (${affectedUsers.length})`,
            value: userList + moreUsers,
            inline: false
        });
    }
    
    await interaction.editReply({ embeds: [embed], ephemeral: true });
}
else if (commandName === 'ubisoft-remove-queue') {
    const targetUser = interaction.options.getUser('user');
    
    if (!targetUser) {
        await interaction.editReply({ 
            content: '❌ Please specify a valid user.', 
            ephemeral: true 
        });
        return;
    }
    
    // ✅ NEW: Check if user is currently being processed AND allow force removal
    let wasProcessing = false;
    let interruptedInfo = null;
    
    if (isProcessingUbisoftQueue && ubisoftTokenQueue.length > 0) {
        const currentEntry = ubisoftTokenQueue[0];
        const currentTicket = activeUbisoftTickets.get(currentEntry.ticketId);
        
        if (currentTicket && currentTicket.userId === targetUser.id) {
            wasProcessing = true;
            interruptedInfo = {
                username: currentTicket.username || 'Unknown',
                gameName: currentTicket.gameName || 'Unknown',
                ticketId: currentTicket.id,
                position: 1
            };
            
            // ✅ FORCE STOP processing for this user
            isProcessingUbisoftQueue = false;
            console.log(`[UBISOFT] Force stopped processing for ${targetUser.username} (${targetUser.id})`);
        }
    }
    
    // Find all queue entries for this user
    const userQueueEntries = [];
    const remainingQueue = [];
    
    for (const entry of ubisoftTokenQueue) {
        const ticket = activeUbisoftTickets.get(entry.ticketId);
        if (ticket && ticket.userId === targetUser.id) {
            userQueueEntries.push(entry);
        } else {
            remainingQueue.push(entry);
        }
    }
    
    if (userQueueEntries.length === 0) {
        await interaction.editReply({ 
            content: `ℹ️ **${targetUser.username}** has no entries in the Ubisoft queue.`, 
            ephemeral: true 
        });
        return;
    }
    
    // Collect detailed info about removed entries for staff report
    const removedEntries = userQueueEntries.map(entry => {
        const ticket = activeUbisoftTickets.get(entry.ticketId);
        return {
            gameName: ticket?.gameName || 'Unknown',
            ticketId: entry.ticketId,
            position: ticket?.queuePosition || 'Unknown',
            addedAt: new Date(entry.addedAt).toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            })
        };
    });
    
    // Replace the queue with entries that don't belong to target user
    ubisoftTokenQueue.length = 0;
    ubisoftTokenQueue.push(...remainingQueue);
    
    // Reset queue positions for removed tickets
    for (const entry of userQueueEntries) {
        const ticket = activeUbisoftTickets.get(entry.ticketId);
        if (ticket) {
            ticket.queuePosition = 0;
            ticket.status = 'awaitingtokenrequest'; // Reset status back to awaiting token request
        }
    }
    
    // Update queue positions for remaining entries
    ubisoftTokenQueue.forEach((e, i) => {
        const t = activeUbisoftTickets.get(e.ticketId);
        if (t) t.queuePosition = i + 1;
    });
    
    // ✅ RESTART PROCESSING if we stopped it and there are still entries in queue
    if (wasProcessing && ubisoftTokenQueue.length > 0) {
        console.log(`[UBISOFT] Restarting queue processing with ${ubisoftTokenQueue.length} remaining entries`);
        
        // Restart the queue processor - it will use the saved tokenRequestContent
        processUbisoftTokenQueue().catch(err => {
            console.error('[UBISOFT] Error restarting queue after removal:', err);
        });
    }
    
    // Log the action
    console.log(`[UBISOFT] ${userQueueEntries.length} queue entry(ies) removed for ${targetUser.username} (${targetUser.id}) by ${interaction.user.username} (${interaction.user.id}). Was processing: ${wasProcessing}`);
    
    // Get game names for removed entries
    const gamesList = removedEntries.map(e => `\`#${e.position}\` ${e.gameName} (Added: ${e.addedAt})`).join('\n');
    
    // Build detailed staff-only embed
    const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('🗑️ User Removed from Ubisoft Queue')
        .setDescription(`Successfully removed **${targetUser.username}** from the queue.`)
        .addFields(
            { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)\nUser ID: ${targetUser.id}`, inline: false },
            { name: '📊 Entries Removed', value: `${userQueueEntries.length}`, inline: true },
            { name: '📋 Remaining in Queue', value: `${ubisoftTokenQueue.length}`, inline: true },
            { name: '⚡ Processing Status', value: wasProcessing ? '🛑 Stopped & Restarted' : '✅ Not Processing', inline: true }
        )
        .setFooter({ text: `Removed by ${interaction.user.username}` })
        .setTimestamp();
    
    // Add interrupted generation info if applicable
    if (interruptedInfo) {
        embed.addFields({
            name: '🛑 Interrupted Generation',
            value: `**${interruptedInfo.username}** - ${interruptedInfo.gameName}\nTicket ID: ${interruptedInfo.ticketId}\nPosition: #${interruptedInfo.position}`,
            inline: false
        });
    }
    
    // Add detailed list of removed games
    if (removedEntries.length > 0) {
        embed.addFields({
            name: `🎮 Removed Requests (${removedEntries.length})`,
            value: gamesList || 'None',
            inline: false
        });
    }
    
    // Show next user who will be processed if queue restarted
    if (wasProcessing && ubisoftTokenQueue.length > 0) {
        const nextEntry = ubisoftTokenQueue[0];
        const nextTicket = activeUbisoftTickets.get(nextEntry.ticketId);
        if (nextTicket) {
            embed.addFields({
                name: '▶️ Now Processing',
                value: `**${nextTicket.username}** - ${nextTicket.gameName}`,
                inline: false
            });
        }
    }
    
    await interaction.editReply({ embeds: [embed], ephemeral: true });
}
else if (commandName === 'ubisoft-clear-unknown') {
    // Find all "Unknown - Unknown" entries in the queue
    const unknownEntries = [];
    const validEntries = [];
    
    for (const entry of ubisoftTokenQueue) {
        const ticket = activeUbisoftTickets.get(entry.ticketId);
        
        // Check if ticket is missing or has Unknown username/gameName
        const isUnknown = !ticket || 
                         !ticket.username || ticket.username === 'Unknown' ||
                         !ticket.gameName || ticket.gameName === 'Unknown';
        
        if (isUnknown) {
            unknownEntries.push({
                entry: entry,
                ticketId: entry.ticketId,
                position: ticket?.queuePosition || 'Unknown',
                username: ticket?.username || 'Unknown',
                gameName: ticket?.gameName || 'Unknown'
            });
        } else {
            validEntries.push(entry);
        }
    }
    
    if (unknownEntries.length === 0) {
        await interaction.editReply({ 
            content: '✅ No Unknown-Unknown entries found in the Ubisoft queue.', 
            ephemeral: true 
        });
        return;
    }
    
    // Check if first entry (currently processing) is Unknown
    const wasProcessingUnknown = isProcessingUbisoftQueue && unknownEntries.length > 0 && 
                                  unknownEntries.some(u => u.position === 1 || u.entry === ubisoftTokenQueue[0]);
    
    let interruptedInfo = null;
    if (wasProcessingUnknown && ubisoftTokenQueue.length > 0) {
        const currentEntry = ubisoftTokenQueue[0];
        const currentTicket = activeUbisoftTickets.get(currentEntry.ticketId);
        interruptedInfo = {
            ticketId: currentEntry.ticketId,
            username: currentTicket?.username || 'Unknown',
            gameName: currentTicket?.gameName || 'Unknown',
            position: currentTicket?.queuePosition || 1
        };
    }
    
    // ✅ FORCE STOP if Unknown is being processed
    if (wasProcessingUnknown) {
        isProcessingUbisoftQueue = false; // Stop the processing loop
        console.log(`[UBISOFT] Stopped processing Unknown ticket: ${interruptedInfo?.ticketId}`);
    }
    
    // Replace queue with only valid (non-Unknown) entries
    ubisoftTokenQueue.length = 0;
    ubisoftTokenQueue.push(...validEntries);
    
    // Reset Unknown tickets
    for (const unknownEntry of unknownEntries) {
        const ticket = activeUbisoftTickets.get(unknownEntry.ticketId);
        if (ticket) {
            ticket.queuePosition = 0;
            ticket.status = 'awaitingtokenrequest';
        }
    }
    
    // Update queue positions for remaining valid entries
    ubisoftTokenQueue.forEach((e, i) => {
        const t = activeUbisoftTickets.get(e.ticketId);
        if (t) t.queuePosition = i + 1;
    });
    
    // ✅ RESTART PROCESSING for valid entries if we stopped it
    if (wasProcessingUnknown && ubisoftTokenQueue.length > 0) {
        console.log(`[UBISOFT] Restarting queue processing with ${ubisoftTokenQueue.length} valid entries`);
        // The processUbisoftTokenQueue function will auto-restart on next file upload
        // Or manually trigger it here:
        processUbisoftTokenQueue().catch(err => {
            console.error('[UBISOFT] Error restarting queue:', err);
        });
    }
    
    // Log the action
    console.log(`[UBISOFT] UNKNOWN CLEAR by ${interaction.user.username} (${interaction.user.id}). Removed ${unknownEntries.length} Unknown entries. Interrupted processing: ${wasProcessingUnknown}`);
    
    // Build detailed staff report
    const unknownList = unknownEntries.slice(0, 10).map(u => 
        `\`#${u.position}\` **${u.username}** - ${u.gameName} (Ticket: ${u.ticketId})`
    ).join('\n');
    const moreUnknowns = unknownEntries.length > 10 ? `\n*...and ${unknownEntries.length - 10} more*` : '';
    
    const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🧹 Unknown Entries Cleared')
        .setDescription(`Successfully removed all Unknown-Unknown entries from the Ubisoft queue.`)
        .addFields(
            { name: '🗑️ Unknown Removed', value: `${unknownEntries.length}`, inline: true },
            { name: '✅ Valid Remaining', value: `${ubisoftTokenQueue.length}`, inline: true },
            { name: '⚡ Processing Status', value: wasProcessingUnknown ? '🛑 Stopped & Restarted' : '✅ Continued', inline: true }
        )
        .setFooter({ text: `Cleared by ${interaction.user.username}` })
        .setTimestamp();
    
    // Add interrupted generation info
    if (interruptedInfo) {
        embed.addFields({
            name: '🛑 Interrupted Unknown Generation',
            value: `Position \`#${interruptedInfo.position}\`: **${interruptedInfo.username}** - ${interruptedInfo.gameName}\nTicket ID: ${interruptedInfo.ticketId}`,
            inline: false
        });
    }
    
    // Add list of removed Unknown entries
    embed.addFields({
        name: `🔍 Removed Unknown Entries (${unknownEntries.length})`,
        value: unknownList + moreUnknowns,
        inline: false
    });
    
    // Show next valid entry that will be processed
    if (ubisoftTokenQueue.length > 0) {
        const nextEntry = ubisoftTokenQueue[0];
        const nextTicket = activeUbisoftTickets.get(nextEntry.ticketId);
        if (nextTicket) {
            embed.addFields({
                name: '▶️ Next in Queue',
                value: `**${nextTicket.username}** - ${nextTicket.gameName}`,
                inline: false
            });
        }
    }
    
    await interaction.editReply({ embeds: [embed], ephemeral: true });
}
        else if (commandName === 'ubisoft-status') {
            const games = db.getAllUbisoftGames ? db.getAllUbisoftGames() : [];
            
            let gamesList = games.map(game => {
                const available = db.getAvailableUbisoftTokenCount(game.id);
                const total = db.getTotalUbisoftTokenCount ? db.getTotalUbisoftTokenCount(game.id) : available;
                const emoji = available >= 10 ? '🟢' : available > 0 ? '🟡' : '🔴';
                return `${emoji} **${game.game_name}** - ${available}/${total}`;
            }).join('\n') || 'No games configured.';
            
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎯 Ubisoft Token Status')
                .setDescription(gamesList)
                .setFooter({ text: '🟢 10+ | 🟡 <10 | 🔴 Empty' })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed], ephemeral: true });
        }
        else if (commandName === 'ubisoft-refresh') {
            await updateUbisoftPanel();
            await interaction.editReply({ content: '✅ Ubisoft panels refreshed!', ephemeral: true });
        }
        else if (commandName === 'ubisoft-sethighdemand') {
            const gameName = interaction.options.getString('game');
            const enabled = interaction.options.getBoolean('enabled');
            const demandType = enabled ? 'high' : 'normal';
            
            // Try to find and update the game
            const database = db.getDatabase();
            const game = database.prepare('SELECT * FROM ubisoft_games WHERE LOWER(game_name) LIKE LOWER(?)').get(`%${gameName}%`);
            
            if (!game) {
                await interaction.editReply({ content: `❌ Game "${gameName}" not found.`, ephemeral: true });
                return;
            }
            
            database.prepare('UPDATE ubisoft_games SET demand_type = ? WHERE id = ?').run(demandType, game.id);
            
            // Refresh panels
            await updateUbisoftPanel();
            
            const emoji = enabled ? '🔥' : '📦';
            await interaction.editReply({ 
                embeds: [new EmbedBuilder()
                    .setColor(enabled ? 0xFF6600 : 0x00FF00)
                    .setTitle(`${emoji} High Demand ${enabled ? 'Enabled' : 'Disabled'}`)
                    .setDescription(`**${game.game_name}** is now ${enabled ? 'high demand (🔥)' : 'normal demand'}`)
                    .setFooter({ text: 'Panels refreshed' })
                ], 
                ephemeral: true 
            });
        }
        else if (commandName === 'ubisoft-showhighdemand') {
            try {
                const highDemandGames = db.getUbisoftHighDemandGames ? db.getUbisoftHighDemandGames() : [];
                
                let description = '';
                if (highDemandGames.length === 0) {
                    description = '*No Ubisoft games are currently marked as high demand.*';
                } else {
                    description = highDemandGames.map(g => {
                        const status = g.available_tokens > 0 ? `🟢 ${g.available_tokens} available` : '🔴 No tokens';
                        return `🔥 **${g.game_name}** - ${status}`;
                    }).join('\n');
                }
                
                const embed = new EmbedBuilder()
                    .setColor(0xFF6600)
                    .setTitle('🔥 Ubisoft High Demand Games')
                    .setDescription(description)
                    .setFooter({ text: 'High demand games have 7-day cooldown' })
                    .setTimestamp();
                
                await interaction.channel.send({ embeds: [embed] });
                await interaction.editReply({ content: '✅ Ubisoft high demand list posted!', ephemeral: true });
            } catch (err) {
                console.error('[Ubisoft] Error posting high demand list:', err);
                await interaction.editReply({ content: `❌ Error: ${err.message}`, ephemeral: true });
            }
        }
        else if (commandName === 'ubisoft-setformat') {
            const gameName = interaction.options.getString('game');
            const format = interaction.options.getString('format');
            
            // Try to find and update the game
            const database = db.getDatabase();
            const game = database.prepare('SELECT * FROM ubisoft_games WHERE LOWER(game_name) LIKE LOWER(?)').get(`%${gameName}%`);
            
            if (!game) {
                await interaction.editReply({ content: `❌ Game "${gameName}" not found.`, ephemeral: true });
                return;
            }
            
            database.prepare('UPDATE ubisoft_games SET token_format = ? WHERE id = ?').run(format, game.id);
            
            const emoji = format === 'normal' ? '🆕' : '📜';
            await interaction.editReply({ 
                embeds: [new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`${emoji} Token Format Updated`)
                    .setDescription(`**${game.game_name}** now uses **${format}** format`)
                    .setFooter({ text: format === 'normal' ? 'Option 1 in exe' : 'Option 2 in exe (Legacy)' })
                ], 
                ephemeral: true 
            });
        }
        // ==================== EA COMMANDS ====================
        else if (commandName === 'ea-setup') {
            const panelType = interaction.options.getString('type');
            
            // Set this channel as ticket channel
            db.saveEAPanelSettings(interaction.guild.id, panelType, interaction.channel.id, null, interaction.channel.id);
            
            // Create panel
            await createEAPanel(interaction.channel, panelType);
            
            await interaction.editReply({ 
                content: `✅ EA ${panelType} panel created! This channel is now the ticket channel.`, 
                ephemeral: true 
            });
        }
        else if (commandName === 'ea-panel') {
            const panelType = interaction.options.getString('type');
            await createEAPanel(interaction.channel, panelType);
            await interaction.editReply({ content: `✅ EA ${panelType} panel created!`, ephemeral: true });
        }
        else if (commandName === 'ea-status') {
            const games = db.getAllEAGames();
            
            let description = '';
            for (const game of games) {
                const available = db.getAvailableEATokenCount(game.id);
                const total = db.getTotalEATokenCount(game.id);
                const status = available > 0 ? '🟢' : '🔴';
                description += `${status} **${game.game_name}**: ${available}/${total}\n`;
            }
            
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🎮 EA Token Status')
                .setDescription(description || 'No games configured')
                .setFooter({ text: `${games.length} games` })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed], ephemeral: true });
        }
        else if (commandName === 'ea-refresh') {
            await updateEAPanel();
            await interaction.editReply({ content: '✅ EA panels refreshed!', ephemeral: true });
        }
        else if (commandName === 'ea-sethighdemand') {
            const gameName = interaction.options.getString('game');
            const enabled = interaction.options.getBoolean('enabled');
            const demandType = enabled ? 'high' : 'normal';
            
            const database = db.getDatabase();
            const game = database.prepare('SELECT * FROM ea_games WHERE LOWER(game_name) LIKE LOWER(?)').get(`%${gameName}%`);
            
            if (!game) {
                await interaction.editReply({ content: `❌ EA game "${gameName}" not found.`, ephemeral: true });
                return;
            }
            
            database.prepare('UPDATE ea_games SET demand_type = ? WHERE id = ?').run(demandType, game.id);
            
            await updateEAPanel();
            
            const emoji = enabled ? '🔥' : '📦';
            await interaction.editReply({ 
                embeds: [new EmbedBuilder()
                    .setColor(enabled ? 0xFF6600 : 0x00FF00)
                    .setTitle(`${emoji} EA High Demand ${enabled ? 'Enabled' : 'Disabled'}`)
                    .setDescription(`**${game.game_name}** is now ${enabled ? 'high demand (🔥)' : 'normal demand'}`)
                    .setFooter({ text: 'Panels refreshed' })
                ], 
                ephemeral: true 
            });
        }
        else if (commandName === 'ea-showhighdemand') {
            try {
                const highDemandGames = db.getEAHighDemandGames ? db.getEAHighDemandGames() : [];
                
                let description = '';
                if (highDemandGames.length === 0) {
                    description = '*No EA games are currently marked as high demand.*';
                } else {
                    description = highDemandGames.map(g => {
                        const status = g.available_tokens > 0 ? `🟢 ${g.available_tokens} available` : '🔴 No tokens';
                        return `🔥 **${g.game_name}** - ${status}`;
                    }).join('\n');
                }
                
                const embed = new EmbedBuilder()
                    .setColor(0xFF6600)
                    .setTitle('🔥 EA High Demand Games')
                    .setDescription(description)
                    .setFooter({ text: 'High demand games have 7-day cooldown' })
                    .setTimestamp();
                
                await interaction.channel.send({ embeds: [embed] });
                await interaction.editReply({ content: '✅ EA high demand list posted!', ephemeral: true });
            } catch (err) {
                console.error('[EA] Error posting high demand list:', err);
                await interaction.editReply({ content: `❌ Error: ${err.message}`, ephemeral: true });
            }
        }
    } catch (err) {
        console.error('Command error:', err);
        await interaction.editReply({ content: '❌ Error occurred.', ephemeral: true }).catch(() => {});
    }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

client.once('ready', async () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🍺 PUB\'S BARTENDER BOT V2.2 - WITH BOT MANAGER');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Logged in as: ${client.user.tag}`);
    
    queueHelper = new BotQueueHelper(client, config.apiBaseUrl);
    console.log('✅ Queue helper initialized');
    
    // Initialize Bot Manager
    const botManager = getBotManager();
    console.log('✅ Bot manager initialized');
    
    // Register graceful shutdown callbacks
    botManager.onShutdown(async () => {
        console.log('[Shutdown] Saving active tickets...');
        const savedCount = botManager.saveActiveTickets(activeTickets);
        console.log(`[Shutdown] Saved ${savedCount} active Steam tickets`);
        
        // Save Ubisoft tickets
        try {
            const dataDir = path.join(__dirname, 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            
            const ubisoftTickets = [];
            for (const [ticketId, ticket] of activeUbisoftTickets) {
                if (ticket.status && !['completed', 'closed', 'closing'].includes(ticket.status)) {
                    ubisoftTickets.push({
                        id: ticket.id, threadId: ticket.threadId, channelId: ticket.channelId,
                        userId: ticket.userId, username: ticket.username, gameId: ticket.gameId,
                        gameName: ticket.gameName, guildId: ticket.guildId, status: ticket.status,
                        helpRequested: ticket.helpRequested || false, tokenReserved: ticket.tokenReserved || false,
                        reservedTokenId: ticket.reservedTokenId, createdAt: ticket.createdAt,
                        platform: 'ubisoft', savedAt: Date.now()
                    });
                }
            }
            fs.writeFileSync(path.join(dataDir, 'active-ubisoft-tickets.json'), JSON.stringify(ubisoftTickets, null, 2));
            console.log(`[Shutdown] Saved ${ubisoftTickets.length} active Ubisoft tickets`);
        } catch (e) { console.error('[Shutdown] Error saving Ubisoft tickets:', e.message); }
        
        // Save EA tickets
        try {
            const dataDir = path.join(__dirname, 'data');
            const eaTickets = [];
            for (const [ticketId, ticket] of activeEATickets) {
                if (ticket.status && !['completed', 'closed', 'closing'].includes(ticket.status)) {
                    eaTickets.push({
                        id: ticket.id, threadId: ticket.threadId, channelId: ticket.channelId,
                        userId: ticket.userId, username: ticket.username, gameId: ticket.gameId,
                        gameName: ticket.gameName, guildId: ticket.guildId, status: ticket.status,
                        helpRequested: ticket.helpRequested || false, tokenReserved: ticket.tokenReserved || false,
                        reservedTokenId: ticket.reservedTokenId, createdAt: ticket.createdAt,
                        platform: 'ea', savedAt: Date.now()
                    });
                }
            }
            fs.writeFileSync(path.join(dataDir, 'active-ea-tickets.json'), JSON.stringify(eaTickets, null, 2));
            console.log(`[Shutdown] Saved ${eaTickets.length} active EA tickets`);
        } catch (e) { console.error('[Shutdown] Error saving EA tickets:', e.message); }
    });
    
    botManager.onShutdown(async () => {
        console.log('[Shutdown] Clearing timers...');
        // Close any timers
        for (const [key, timer] of activeTimers) {
            clearTimeout(timer);
        }
        activeTimers.clear();
        console.log('[Shutdown] Timers cleared');
    });
    
    botManager.onShutdown(async () => {
        console.log('[Shutdown] Stopping queue watchers...');
        for (const [ticketId, stopFn] of activeQueueWatchers) {
            try { stopFn(); } catch (e) {}
        }
        activeQueueWatchers.clear();
        console.log('[Shutdown] Queue watchers stopped');
    });
    
    // Handle Ctrl+C and other termination signals - save tickets before exit
    // Use synchronous operations to ensure completion on Windows
    const gracefulShutdown = (signal) => {
        console.log(`\n[Bot] Received ${signal}, performing graceful shutdown...`);
        try {
            // Save STEAM active tickets SYNCHRONOUSLY
            const tickets = [];
            for (const [ticketId, ticket] of activeTickets) {
                if (ticket.status && !['completed', 'closed', 'closing'].includes(ticket.status)) {
                    tickets.push({
                        id: ticket.id,
                        threadId: ticket.threadId,
                        channelId: ticket.channelId,
                        userId: ticket.userId,
                        username: ticket.username,
                        gameId: ticket.gameId,
                        gameName: ticket.gameName,
                        folderName: ticket.folderName,
                        guildId: ticket.guildId,
                        isRefill: ticket.isRefill,
                        steamId: ticket.steamId,
                        status: ticket.status,
                        isLinuxMac: ticket.isLinuxMac || false,
                        helpRequested: ticket.helpRequested || false,
                        activationRequested: ticket.activationRequested || false,
                        tokenReserved: ticket.tokenReserved || false,
                        createdAt: ticket.createdAt,
                        platform: 'steam',
                        savedAt: Date.now()
                    });
                }
            }
            
            // Save UBISOFT active tickets
            const ubisoftTickets = [];
            for (const [ticketId, ticket] of activeUbisoftTickets) {
                if (ticket.status && !['completed', 'closed', 'closing'].includes(ticket.status)) {
                    ubisoftTickets.push({
                        id: ticket.id,
                        threadId: ticket.threadId,
                        channelId: ticket.channelId,
                        userId: ticket.userId,
                        username: ticket.username,
                        gameId: ticket.gameId,
                        gameName: ticket.gameName,
                        guildId: ticket.guildId,
                        status: ticket.status,
                        helpRequested: ticket.helpRequested || false,
                        tokenReserved: ticket.tokenReserved || false,
                        reservedTokenId: ticket.reservedTokenId,
                        createdAt: ticket.createdAt,
                        platform: 'ubisoft',
                        savedAt: Date.now()
                    });
                }
            }
            
            // Save EA active tickets
            const eaTickets = [];
            for (const [ticketId, ticket] of activeEATickets) {
                if (ticket.status && !['completed', 'closed', 'closing'].includes(ticket.status)) {
                    eaTickets.push({
                        id: ticket.id,
                        threadId: ticket.threadId,
                        channelId: ticket.channelId,
                        userId: ticket.userId,
                        username: ticket.username,
                        gameId: ticket.gameId,
                        gameName: ticket.gameName,
                        guildId: ticket.guildId,
                        status: ticket.status,
                        helpRequested: ticket.helpRequested || false,
                        tokenReserved: ticket.tokenReserved || false,
                        reservedTokenId: ticket.reservedTokenId,
                        createdAt: ticket.createdAt,
                        platform: 'ea',
                        savedAt: Date.now()
                    });
                }
            }
            
            // Ensure data directory exists
            const dataDir = path.join(__dirname, 'data');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            
            // Write synchronously - Steam tickets
            const ticketsFile = path.join(dataDir, 'active-tickets.json');
            fs.writeFileSync(ticketsFile, JSON.stringify(tickets, null, 2));
            console.log(`[Bot] Saved ${tickets.length} active Steam tickets to ${ticketsFile}`);
            
            // Write synchronously - Ubisoft tickets
            const ubisoftFile = path.join(dataDir, 'active-ubisoft-tickets.json');
            fs.writeFileSync(ubisoftFile, JSON.stringify(ubisoftTickets, null, 2));
            console.log(`[Bot] Saved ${ubisoftTickets.length} active Ubisoft tickets to ${ubisoftFile}`);
            
            // Write synchronously - EA tickets
            const eaFile = path.join(dataDir, 'active-ea-tickets.json');
            fs.writeFileSync(eaFile, JSON.stringify(eaTickets, null, 2));
            console.log(`[Bot] Saved ${eaTickets.length} active EA tickets to ${eaFile}`);
            
            // Clear timers
            for (const [key, timer] of activeTimers) {
                clearTimeout(timer);
            }
            activeTimers.clear();
            
            // Stop queue watchers
            for (const [ticketId, stopFn] of activeQueueWatchers) {
                try { stopFn(); } catch (e) {}
            }
            activeQueueWatchers.clear();
            
            console.log('[Bot] Graceful shutdown complete');
        } catch (err) {
            console.error('[Bot] Error during shutdown:', err.message);
        }
        process.exit(0);
    };
    
    // Register signal handlers
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // kill command
    
    // Windows-specific: Handle console close (but NOT when running under PM2)
    // PM2 sets PM2_HOME or pm_id environment variables
    if (process.platform === 'win32' && !process.env.PM2_HOME && !process.env.pm_id) {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.on('SIGINT', () => gracefulShutdown('SIGINT'));
        // Prevent readline from keeping process alive
        rl.unref?.();
    }
    
    try { db.initDatabase(); console.log(`✅ Database ready`); } catch (err) { console.log('⚠️ Database:', err.message); }
    
    // Restore active tickets from previous session
    try {
        const savedTickets = botManager.loadActiveTickets();
        if (savedTickets.length > 0) {
            console.log(`[Restore] Attempting to restore ${savedTickets.length} tickets...`);
            let restored = 0;
            let failed = 0;
            
            for (const ticket of savedTickets) {
                try {
                    // Verify the thread still exists
                    const thread = await client.channels.fetch(ticket.threadId).catch(() => null);
                    if (!thread) {
                        console.log(`[Restore] Thread ${ticket.threadId} not found, skipping ticket ${ticket.id}`);
                        failed++;
                        continue;
                    }
                    
                    // Restore ticket to activeTickets map
                    activeTickets.set(ticket.id, {
                        id: ticket.id,
                        threadId: ticket.threadId,
                        channelId: ticket.channelId || ticket.threadId,
                        userId: ticket.userId,
                        username: ticket.username,
                        gameId: ticket.gameId,
                        gameName: ticket.gameName,
                        folderName: ticket.folderName,
                        guildId: ticket.guildId,
                        isRefill: ticket.isRefill || false,
                        steamId: ticket.steamId,
                        status: ticket.status,
                        isLinuxMac: ticket.isLinuxMac || false,
                        collectedScreenshots: [],
                        helpRequested: ticket.helpRequested || false,
                        activationRequested: ticket.activationRequested || false,
                        generationInProgress: false,
                        tokenReserved: ticket.tokenReserved || false,
                        createdAt: ticket.createdAt || Date.now()
                    });
                    
                    console.log(`[Restore] Added ticket ${ticket.id} to activeTickets map`);
                    console.log(`[Restore] activeTickets now has: ${Array.from(activeTickets.keys()).join(', ')}`);
                    
                    // Restart inactivity timer for this ticket (but NOT if token already sent)
                    if (ticket.status !== 'token_sent' && ticket.status !== 'closing') {
                        startInactivityTimer(ticket.id, thread);
                    }
                    
                    // Notify user that their ticket was restored
                    await thread.send({
                        content: `<@${ticket.userId}>`,
                        embeds: [new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('🔄 Bot Restarted')
                            .setDescription('The bot was restarted. Your ticket has been restored!\n\nPlease continue where you left off.')
                            .addFields(
                                { name: '📊 Status', value: ticket.status.replace(/_/g, ' '), inline: true },
                                { name: '🎮 Game', value: ticket.gameName, inline: true }
                            )
                            .setTimestamp()
                        ]
                    }).catch(err => console.log(`[Restore] Failed to notify user in ticket ${ticket.id}: ${err.message}`));
                    
                    restored++;
                    console.log(`[Restore] ✅ Restored ticket ${ticket.id} for ${ticket.username}`);
                    
                } catch (err) {
                    console.log(`[Restore] Failed to restore ticket ${ticket.id}: ${err.message}`);
                    failed++;
                }
            }
            
            console.log(`[Restore] Completed: ${restored} restored, ${failed} failed`);
        }
    } catch (err) {
        console.log('[Restore] Error restoring tickets:', err.message);
    }
    
    // Restore UBISOFT tickets from previous session
    try {
        const dataDir = path.join(__dirname, 'data');
        const ubisoftFile = path.join(dataDir, 'active-ubisoft-tickets.json');
        
        if (fs.existsSync(ubisoftFile)) {
            const savedUbisoftTickets = JSON.parse(fs.readFileSync(ubisoftFile, 'utf8'));
            if (savedUbisoftTickets.length > 0) {
                console.log(`[Restore] Attempting to restore ${savedUbisoftTickets.length} Ubisoft tickets...`);
                let restored = 0;
                let failed = 0;
                
                for (const ticket of savedUbisoftTickets) {
                    try {
                        const thread = await client.channels.fetch(ticket.threadId).catch(() => null);
                        if (!thread) {
                            console.log(`[Restore] Ubisoft thread ${ticket.threadId} not found, skipping ticket ${ticket.id}`);
                            failed++;
                            continue;
                        }
                        
                        activeUbisoftTickets.set(ticket.id, {
                            id: ticket.id,
                            threadId: ticket.threadId,
                            channelId: ticket.channelId || ticket.threadId,
                            userId: ticket.userId,
                            username: ticket.username,
                            gameId: ticket.gameId,
                            gameName: ticket.gameName,
                            guildId: ticket.guildId,
                            status: ticket.status,
                            platform: 'ubisoft',
                            collectedScreenshots: [],
                            helpRequested: ticket.helpRequested || false,
                            tokenReserved: ticket.tokenReserved || false,
                            reservedTokenId: ticket.reservedTokenId,
                            tokenRequestContent: null,
                            createdAt: ticket.createdAt || Date.now()
                        });
                        
                        // Restart appropriate timer based on status
                        if (ticket.status === 'awaiting_screenshot') {
                            startUbisoftScreenshotTimer(ticket.id, thread);
                        } else if (ticket.status === 'awaiting_token_request') {
                            startUbisoftTokenRequestTimer(ticket.id, thread);
                        }
                        
                        await thread.send({
                            content: `<@${ticket.userId}>`,
                            embeds: [new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setTitle('🔄 Bot Restarted')
                                .setDescription('The bot was restarted. Your Ubisoft ticket has been restored!\n\nPlease continue where you left off.')
                                .addFields(
                                    { name: '📊 Status', value: ticket.status.replace(/_/g, ' '), inline: true },
                                    { name: '🎮 Game', value: ticket.gameName, inline: true }
                                )
                                .setTimestamp()
                            ]
                        }).catch(err => console.log(`[Restore] Failed to notify user in Ubisoft ticket ${ticket.id}: ${err.message}`));
                        
                        restored++;
                        console.log(`[Restore] ✅ Restored Ubisoft ticket ${ticket.id} for ${ticket.username}`);
                        
                    } catch (err) {
                        console.log(`[Restore] Failed to restore Ubisoft ticket ${ticket.id}: ${err.message}`);
                        failed++;
                    }
                }
                
                console.log(`[Restore] Ubisoft Completed: ${restored} restored, ${failed} failed`);
            }
            // Clear the file after restoring
            fs.writeFileSync(ubisoftFile, '[]');
        }
    } catch (err) {
        console.log('[Restore] Error restoring Ubisoft tickets:', err.message);
    }
    
    // Restore EA tickets from previous session
    try {
        const dataDir = path.join(__dirname, 'data');
        const eaFile = path.join(dataDir, 'active-ea-tickets.json');
        
        if (fs.existsSync(eaFile)) {
            const savedEATickets = JSON.parse(fs.readFileSync(eaFile, 'utf8'));
            if (savedEATickets.length > 0) {
                console.log(`[Restore] Attempting to restore ${savedEATickets.length} EA tickets...`);
                let restored = 0;
                let failed = 0;
                
                for (const ticket of savedEATickets) {
                    try {
                        const thread = await client.channels.fetch(ticket.threadId).catch(() => null);
                        if (!thread) {
                            console.log(`[Restore] EA thread ${ticket.threadId} not found, skipping ticket ${ticket.id}`);
                            failed++;
                            continue;
                        }
                        
                        activeEATickets.set(ticket.id, {
                            id: ticket.id,
                            threadId: ticket.threadId,
                            channelId: ticket.channelId || ticket.threadId,
                            userId: ticket.userId,
                            username: ticket.username,
                            gameId: ticket.gameId,
                            gameName: ticket.gameName,
                            guildId: ticket.guildId,
                            status: ticket.status,
                            platform: 'ea',
                            collectedScreenshots: [],
                            helpRequested: ticket.helpRequested || false,
                            tokenReserved: ticket.tokenReserved || false,
                            reservedTokenId: ticket.reservedTokenId,
                            tokenRequestContent: null,
                            createdAt: ticket.createdAt || Date.now()
                        });
                        
                        // Restart appropriate timer based on status
                        if (ticket.status === 'awaiting_screenshot') {
                            startEAScreenshotTimer(ticket.id, thread);
                        } else if (ticket.status === 'awaiting_token_request') {
                            startEATokenRequestTimer(ticket.id, thread);
                        }
                        
                        await thread.send({
                            content: `<@${ticket.userId}>`,
                            embeds: [new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setTitle('🔄 Bot Restarted')
                                .setDescription('The bot was restarted. Your EA ticket has been restored!\n\nPlease continue where you left off.')
                                .addFields(
                                    { name: '📊 Status', value: ticket.status.replace(/_/g, ' '), inline: true },
                                    { name: '🎮 Game', value: ticket.gameName, inline: true }
                                )
                                .setTimestamp()
                            ]
                        }).catch(err => console.log(`[Restore] Failed to notify user in EA ticket ${ticket.id}: ${err.message}`));
                        
                        restored++;
                        console.log(`[Restore] ✅ Restored EA ticket ${ticket.id} for ${ticket.username}`);
                        
                    } catch (err) {
                        console.log(`[Restore] Failed to restore EA ticket ${ticket.id}: ${err.message}`);
                        failed++;
                    }
                }
                
                console.log(`[Restore] EA Completed: ${restored} restored, ${failed} failed`);
            }
            // Clear the file after restoring
            fs.writeFileSync(eaFile, '[]');
        }
    } catch (err) {
        console.log('[Restore] Error restoring EA tickets:', err.message);
    }
    
    // Clean up orphaned reservations (but NOT for restored tickets)
    try {
        // Get list of restored ticket IDs
        const restoredTicketIds = Array.from(activeTickets.keys());
        
        const orphaned = db.getDatabase().prepare(`
            UPDATE tokens SET reserved_by_ticket = NULL 
            WHERE reserved_by_ticket IS NOT NULL 
            AND reserved_by_ticket NOT IN (SELECT ticket_id FROM tickets WHERE status = 'open')
        `).run();
        if (orphaned.changes > 0) console.log(`♻️ Released ${orphaned.changes} orphaned reservations`);
    } catch (e) {}
    
    // Load panels
    try {
        const panels = db.getAllServerPanels();
        console.log(`[Panel] Found ${panels.length} saved panels in database`);
        for (const panel of panels) {
            try {
                // Database columns are panel_channel_id and panel_message_id
                const channelId = panel.panel_channel_id;
                const messageId = panel.panel_message_id;
                console.log(`[Panel] Loading panel for guild ${panel.guild_id}: channel=${channelId}, message=${messageId}`);
                
                if (!channelId || !messageId) {
                    console.log(`⚠️ Panel for ${panel.guild_id} has missing channel or message ID`);
                    continue;
                }
                
                const channel = await client.channels.fetch(channelId);
                await channel.messages.fetch(messageId);
                serverPanels.set(panel.guild_id, { messageId: messageId, channelId: channelId, type: panel.panel_type || 'public' });
                console.log(`✅ Panel loaded: ${panel.guild_id}`);
            } catch (err) {
                console.log(`⚠️ Panel load error for ${panel.guild_id}: ${err.message}`);
            }
        }
    } catch (err) {
        console.log(`⚠️ Panel loading error: ${err.message}`);
    }
    
    if (startTranscriptServer) {
        try { await startTranscriptServer(db.getDatabase(), updatePanel); } catch (err) { console.log('⚠️ Transcript server:', err.message); }
    }
    
    await registerCommands();
    
    // Background tasks
    setInterval(() => { 
        // Steam token regeneration
        const regen = db.regenerateExpiredTokens(); 
        if (regen > 0) console.log(`♻️ Regenerated ${regen} Steam tokens`);
        const expired = db.releaseExpiredReservations(24);
        if (expired > 0) console.log(`🔓 Released ${expired} expired Steam reservation(s)`);
        
        // Ubisoft token regeneration
        if (db.regenerateExpiredUbisoftTokens) {
            const ubisoftRegen = db.regenerateExpiredUbisoftTokens();
            if (ubisoftRegen > 0) console.log(`♻️ Regenerated ${ubisoftRegen} Ubisoft tokens`);
        }
        
        // EA token regeneration
        if (db.regenerateExpiredEATokens) {
            const eaRegen = db.regenerateExpiredEATokens();
            if (eaRegen > 0) console.log(`♻️ Regenerated ${eaRegen} EA tokens`);
        }
    }, 60000);
    setInterval(updatePanel, 60000);
    
    // ============================================================================
    // DASHBOARD QUEUE PROCESSORS - Check for manual generation requests
    // ============================================================================
    
    let isProcessingDashboardEA = false;
    let isProcessingDashboardUbi = false;
    
    console.log('[Dashboard Queue] Initializing EA & Ubisoft queue processors...');
    
    // EA Dashboard Queue Processor
    setInterval(async () => {
        if (isProcessingDashboardEA) return;
        
        try {
            // Try to get pending dashboard request
            let pending = null;
            try {
                pending = db.getDatabase().prepare(`
                    SELECT * FROM ea_requests 
                    WHERE status = 'pending' AND source = 'dashboard'
                    ORDER BY created_at ASC 
                    LIMIT 1
                `).get();
            } catch (queryErr) {
                // If source column doesn't exist, try without it
                console.log('[EA Dashboard] Query error, trying fallback:', queryErr.message);
                return;
            }
            
            if (!pending) return;
            
            isProcessingDashboardEA = true;
            console.log(`[EA Dashboard] Processing request ${pending.id}...`);
            
            // Update status
            db.getDatabase().prepare('UPDATE ea_requests SET status = ? WHERE id = ?')
                .run('processing', pending.id);
            
            // Create temp file with the input data
            const tempFile = path.join(__dirname, 'EA', `dash_ticket_${pending.id}.txt`);
            fs.writeFileSync(tempFile, pending.input_data || '');
            
            // Create mock ticket object for generateEAToken
            const mockTicket = {
                id: `DASH-EA-${pending.id}`,
                gameId: pending.game_id,
                gameName: pending.game_name || 'Dashboard Request',
                tokenRequestFile: tempFile
            };
            
            // Call the existing generation function
            const result = await generateEAToken(mockTicket);
            
            // Clean up temp file
            try { fs.unlinkSync(tempFile); } catch(e) {}
            
            if (result.success) {
                // Read the token output if available
                let tokenContent = result.tokenData || '';
                if (result.tokenFile && fs.existsSync(result.tokenFile)) {
                    tokenContent = fs.readFileSync(result.tokenFile, 'utf8');
                }
                
                db.getDatabase().prepare(`
                    UPDATE ea_requests 
                    SET status = 'completed', output_data = ?, completed_at = datetime('now')
                    WHERE id = ?
                `).run(tokenContent || 'Token generated', pending.id);
                
                console.log(`[EA Dashboard] Request ${pending.id} completed!`);
            } else {
                db.getDatabase().prepare(`
                    UPDATE ea_requests 
                    SET status = 'failed', error_message = ?
                    WHERE id = ?
                `).run(result.error || 'Generation failed', pending.id);
                
                console.log(`[EA Dashboard] Request ${pending.id} failed: ${result.error}`);
            }
            
        } catch (err) {
            console.error('[EA Dashboard] Queue error:', err.message);
        } finally {
            isProcessingDashboardEA = false;
        }
    }, 5000);
    
    // Ubisoft Dashboard Queue Processor
    setInterval(async () => {
        if (isProcessingDashboardUbi) return;
        
        try {
            let pending = null;
            try {
                pending = db.getDatabase().prepare(`
                    SELECT * FROM ubisoft_requests 
                    WHERE status = 'pending' AND source = 'dashboard'
                    ORDER BY created_at ASC 
                    LIMIT 1
                `).get();
            } catch(e) {
                // Table might not exist
                return;
            }
            
            if (!pending) return;
            
            isProcessingDashboardUbi = true;
            console.log(`[Ubisoft Dashboard] Processing request ${pending.id}...`);
            
            // Update status
            db.getDatabase().prepare('UPDATE ubisoft_requests SET status = ? WHERE id = ?')
                .run('processing', pending.id);
            
            // Create mock ticket object for generateUbisoftToken
            const mockTicket = {
                id: `DASH-UBI-${pending.id}`,
                gameId: pending.game_id,
                gameName: pending.game_name || 'Dashboard Request',
                tokenRequestContent: pending.input_data || ''
            };
            
            // Call the existing generation function
            const result = await generateUbisoftToken(mockTicket);
            
            if (result.success) {
                // Read the token output
                let tokenContent = '';
                if (result.tokenFile && fs.existsSync(result.tokenFile)) {
                    tokenContent = fs.readFileSync(result.tokenFile, 'utf8');
                } else if (result.tokenData) {
                    tokenContent = result.tokenData;
                }
                
                db.getDatabase().prepare(`
                    UPDATE ubisoft_requests 
                    SET status = 'completed', output_data = ?, completed_at = datetime('now')
                    WHERE id = ?
                `).run(tokenContent || 'Token generated', pending.id);
                
                console.log(`[Ubisoft Dashboard] Request ${pending.id} completed!`);
            } else {
                db.getDatabase().prepare(`
                    UPDATE ubisoft_requests 
                    SET status = 'failed', error_message = ?
                    WHERE id = ?
                `).run(result.error || 'Generation failed', pending.id);
                
                console.log(`[Ubisoft Dashboard] Request ${pending.id} failed: ${result.error}`);
            }
            
        } catch (err) {
            console.error('[Ubisoft Dashboard] Queue error:', err.message);
        } finally {
            isProcessingDashboardUbi = false;
        }
    }, 5000);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ DASHBOARD QUEUE PROCESSORS STARTED');
    console.log('   EA requests: checking every 5s');
    console.log('   Ubisoft requests: checking every 5s');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Start high demand panel auto-update (24h interval)
    startHighDemandAutoUpdate();
    
    // AUTO-SAVE: Save active tickets every 30 seconds (overwrites same file)
    setInterval(() => {
        if (activeTickets.size === 0) return; // Don't save if no tickets
        
        try {
            const tickets = [];
            for (const [ticketId, ticket] of activeTickets) {
                if (ticket.status && !['completed', 'closed', 'closing'].includes(ticket.status)) {
                    tickets.push({
                        id: ticket.id,
                        threadId: ticket.threadId,
                        channelId: ticket.channelId,
                        userId: ticket.userId,
                        username: ticket.username,
                        gameId: ticket.gameId,
                        gameName: ticket.gameName,
                        folderName: ticket.folderName,
                        guildId: ticket.guildId,
                        isRefill: ticket.isRefill,
                        steamId: ticket.steamId,
                        status: ticket.status,
                        isLinuxMac: ticket.isLinuxMac || false,
                        helpRequested: ticket.helpRequested || false,
                        activationRequested: ticket.activationRequested || false,
                        tokenReserved: ticket.tokenReserved || false,
                        createdAt: ticket.createdAt,
                        savedAt: Date.now()
                    });
                }
            }
            
            if (tickets.length > 0) {
                const dataDir = path.join(__dirname, 'data');
                if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
                fs.writeFileSync(path.join(dataDir, 'active-tickets.json'), JSON.stringify(tickets, null, 2));
                // Only log occasionally to avoid spam
                if (Math.random() < 0.1) console.log(`[AutoSave] ${tickets.length} ticket(s) saved`);
            }
        } catch (err) {
            console.error('[AutoSave] Error:', err.message);
        }
    }, 30000); // Every 30 seconds
    
    // Initialize Local Backups (synced to Google Drive)
    if (LocalBackup) {
        try {
            backupSystem = new LocalBackup({
                botDir: __dirname,
                dbPath: path.join(__dirname, 'database', 'bartender.db'),
                backupDir: 'G:\\My Drive\\Bartender Bot Backups',
                retentionDays: 30,
                maxBackups: 50
            });
            
            backupSystem.initialize();
            backupSystem.startScheduledBackups();
            console.log('✅ Local backup system active (synced to Google Drive)');
        } catch (err) {
            console.error('❌ Backup error:', err.message);
        }
    }
    
    const stats = db.getStats();
    console.log(`📊 Tokens: ${stats.availableTokens} available, ${stats.reservedTokens || 0} reserved`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 BOT READY - ALL 18 ISSUES FIXED + TICKET LOGS!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

client.on('interactionCreate', async (interaction) => {
    try {
        // =========================================================================
        // SECURITY: Block most DM interactions
        // =========================================================================
        if (!interaction.guild) {
            // Only allow certain slash commands in DMs
            if (interaction.isChatInputCommand()) {
                const dmAllowedCommands = ['myhistory', 'mystatus'];
                if (!dmAllowedCommands.includes(interaction.commandName)) {
                    return interaction.reply({ 
                        content: '❌ Bot commands must be used in a server, not in DMs.', 
                        ephemeral: true 
                    }).catch(() => {});
                }
            } else {
                // Block all buttons/menus in DMs
                return interaction.reply({ 
                    content: '❌ This action is not available in DMs.', 
                    ephemeral: true 
                }).catch(() => {});
            }
        }
        
        if (interaction.isAutocomplete()) {
            // Handle autocomplete for gameinfo command
            if (interaction.commandName === 'gameinfo') {
                const focusedValue = interaction.options.getFocused().toLowerCase();
                const games = db.getDatabase().prepare(`
                    SELECT game_name FROM games 
                    WHERE LOWER(game_name) LIKE ? 
                    ORDER BY game_name LIMIT 25
                `).all(`%${focusedValue}%`);
                
                await interaction.respond(
                    games.map(g => ({ name: g.game_name.substring(0, 100), value: g.game_name.substring(0, 100) }))
                );
            }
            // Handle autocomplete for macro command
            else if (interaction.commandName === 'macro') {
                const focusedValue = interaction.options.getFocused().toLowerCase();
                const macros = db.getMacroNames ? db.getMacroNames() : [];
                
                const filtered = macros.filter(m => 
                    m.name.toLowerCase().includes(focusedValue) || 
                    m.title.toLowerCase().includes(focusedValue)
                ).slice(0, 25);
                
                await interaction.respond(
                    filtered.map(m => ({ 
                        name: `${m.emoji} ${m.name} - ${m.title.replace(/^[^\s]+\s/, '').substring(0, 80)}`, 
                        value: m.name 
                    }))
                );
            }
        }
        // ============================================================================
        // UBISOFT INTERACTION HANDLERS
        // ============================================================================
        // Handle Ubisoft panel game selection FIRST (before generic ubisoft_ handler)
        else if (interaction.isStringSelectMenu() && interaction.customId?.startsWith('ubisoft_panel_')) {
            // Ubisoft game selection from panel
            const gameId = interaction.values[0].replace('ubisoft_game_', '');
            await createUbisoftTicket(interaction, parseInt(gameId));
        }
        // Handle other Ubisoft buttons/interactions
        else if (interaction.customId?.startsWith('ubisoft_')) {
            await handleUbisoftInteraction(interaction);
        }
        // ============================================================================
        // EA INTERACTION HANDLERS
        // ============================================================================
        // Handle EA panel game selection
        else if (interaction.isStringSelectMenu() && interaction.customId?.startsWith('ea_panel_')) {
            const gameId = interaction.values[0].replace('ea_game_', '');
            await createEATicket(interaction, parseInt(gameId));
        }
        // Handle other EA buttons/interactions
        else if (interaction.customId?.startsWith('ea_')) {
            await handleEAInteraction(interaction);
        }
        else if (interaction.isChatInputCommand()) {
            await handleCommand(interaction);
        }
        else if (interaction.isButton()) {
            if (interaction.customId.startsWith('history_page_') && handleHistoryPage) {
                const parts = interaction.customId.split('_');
                await handleHistoryPage(interaction, db, parts[2], parseInt(parts[3]));
            } else await handleButton(interaction);
        }
        else if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('history_select_')) {
                // Handle history dropdown selection
                try {
                    await interaction.deferUpdate();
                    const userId = interaction.customId.replace('history_select_', '');
                    const selectedValue = interaction.values[0];
                    const index = parseInt(selectedValue.split('_').pop());
                    
                    // Get from cache
                    const cached = global.historyCache?.get(userId);
                    if (!cached || Date.now() > cached.expires) {
                        await interaction.followUp({ content: '⏳ History expired. Please run /history again.', ephemeral: true });
                        return;
                    }
                    
                    const item = cached.history[index];
                    if (!item) {
                        await interaction.followUp({ content: '❌ Could not find that ticket.', ephemeral: true });
                        return;
                    }
                    
                    // Platform emoji
                    const platformEmoji = { steam: '🎮', ubisoft: '🔷', ea: '⚽' };
                    const platformName = { steam: 'Steam', ubisoft: 'Ubisoft', ea: 'EA' };
                    
                    // Format date nicely
                    const date = new Date(item.created_at);
                    const formattedDate = date.toLocaleDateString('en-GB', { 
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                    
                    // Build detail embed
                    const detailEmbed = new EmbedBuilder()
                        .setColor(item.platform === 'steam' ? 0x1b2838 : item.platform === 'ubisoft' ? 0x0070FF : 0xFF4500)
                        .setTitle(`${platformEmoji[item.platform] || '🎮'} ${item.game_name || 'Unknown Game'}`)
                        .addFields(
                            { name: '📅 Date', value: formattedDate, inline: true },
                            { name: '🎮 Platform', value: platformName[item.platform] || 'Unknown', inline: true },
                            { name: '📋 Status', value: item.close_reason || 'Completed', inline: true }
                        )
                        .setFooter({ text: `Ticket ID: ${item.ticket_id || 'N/A'}` })
                        .setTimestamp(date);
                    
                    if (item.ticket_id) {
                        detailEmbed.addFields({ 
                            name: '📜 Transcript', 
                            value: `[View Transcript](https://pubslounge.xyz/transcripts/${item.ticket_id})`, 
                            inline: false 
                        });
                    }
                    
                    // Add transcript button
                    const components = [];
                    if (item.ticket_id) {
                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setLabel('📜 View Transcript')
                                .setStyle(ButtonStyle.Link)
                                .setURL(`https://pubslounge.xyz/transcripts/${item.ticket_id}`)
                        );
                        components.push(row);
                    }
                    
                    await interaction.followUp({ embeds: [detailEmbed], components, ephemeral: true });
                } catch (err) {
                    console.error('[History Select] Error:', err);
                }
            }
            else if (interaction.customId.startsWith('game_select_')) await createTicket(interaction, interaction.values[0]);
        }
    } catch (err) {
        console.error('Interaction error:', err);
        if (!interaction.replied && !interaction.deferred) interaction.reply({ content: '❌ Error.', ephemeral: true }).catch(() => {});
    }
});

// ============================================================================
// UBISOFT BUTTON/INTERACTION HANDLER
// ============================================================================

async function handleUbisoftInteraction(interaction) {
    const customId = interaction.customId;
    
    // Panel refresh button
    if (customId === 'ubisoft_refresh_panel') {
        try {
            await interaction.deferUpdate();
            await updateUbisoftPanel();
        } catch (e) {}
        return;
    }
    
    // View rules button
    if (customId === 'ubisoft_view_rules') {
        const rulesEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📋 Ubisoft Token Rules')
            .setDescription(`**Please read carefully before requesting:**

1️⃣ **One ticket at a time** - Close your current ticket before opening a new one

2️⃣ **Follow instructions** - Upload the correct files and follow all steps

3️⃣ **Be patient** - Token generation may take a few minutes

4️⃣ **Don't ghost** - Respond within 30 minutes after receiving your token

5️⃣ **Cooldowns apply** - After activation, you'll have a cooldown period

⚠️ **Important:** Never launch games through Ubisoft Connect!`);
        
        await interaction.reply({ embeds: [rulesEmbed], ephemeral: true });
        return;
    }
    
    // Extract ticket ID from customId
    const parts = customId.split('_');
    const ticketId = parts[parts.length - 1];
    let ticket = activeUbisoftTickets.get(ticketId);
    
    // Try to recover ticket from database if not in memory
    if (!ticket && ticketId && ticketId.startsWith('UBI-')) {
        try {
            const savedTicket = db.getUbisoftTicket ? db.getUbisoftTicket(ticketId) : null;
            if (savedTicket && savedTicket.status !== 'closed') {
                console.log(`[Ubisoft] Recovering ticket ${ticketId} from database`);
                const game = db.getUbisoftGame ? db.getUbisoftGame(savedTicket.game_id) : null;
                ticket = {
                    id: ticketId,
                    threadId: savedTicket.thread_id,
                    userId: savedTicket.user_id,
                    username: savedTicket.username,
                    gameId: savedTicket.game_id,
                    gameName: game?.game_name || 'Unknown',
                    guildId: savedTicket.guild_id,
                    status: savedTicket.status || 'active',
                    platform: 'ubisoft',
                    collectedScreenshots: [],
                    helpRequested: false,
                    createdAt: savedTicket.created_at || Date.now()
                };
                activeUbisoftTickets.set(ticketId, ticket);
                console.log(`[Ubisoft] Recovered ticket ${ticketId}, status: ${ticket.status}`);
            }
        } catch (err) {
            console.error('[Ubisoft] Ticket recovery error:', err.message);
        }
    }
    
    // Submit screenshots
    if (customId.startsWith('ubisoft_submit_screenshots_')) {
        if (!ticket) {
            return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        }
        
        try {
            await interaction.deferUpdate();
        } catch (e) {}
        
        // Run AI verification
        if (aiVerifier) {
            const verifyMsg = await interaction.channel.send({
                embeds: [new EmbedBuilder().setColor(0xFFFF00).setTitle('🔍 Verifying Screenshots...').setDescription('Please wait while AI checks your screenshots.')]
            });
            
            const game = db.getUbisoftGame(ticket.gameId);
            const result = await aiVerifier.verifyScreenshots(ticket.collectedScreenshots, {
                gameName: game?.game_name || 'Unknown',
                folderName: game?.folder_name || game?.game_name || 'Unknown',
                expectedSize: game?.size_gb || null
            });
            
            await verifyMsg.delete().catch(() => {});
            
            if (result.decision === 'approve') {
                // Auto-approved - show instructions
                await showUbisoftInstructionsAndDownload(interaction, ticket, game);
                await logTicketEvent(ticket, 'step_change', { step: 'AI approved screenshots', provider: result.provider, platform: 'ubisoft' });
            } else if (result.decision === 'reject') {
                // Rejected - allow retry
                ticket.collectedScreenshots = [];
                await interaction.channel.send({
                    content: `<@${ticket.userId}>`,
                    embeds: [new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('❌ Screenshots Rejected')
                        .setDescription(`**Reason:** ${result.reason}\n\nPlease upload new screenshots.`)
                    ]
                });
                startUbisoftScreenshotTimer(ticketId, interaction.channel);
            } else {
                // Staff review needed
                ticket.status = 'awaiting_staff';
                await interaction.channel.send({
                    content: `${getStaffMention(ticket.guildId)}`,
                    embeds: [new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setTitle('👀 Staff Review Required')
                        .setDescription(`AI couldn't verify automatically.\n**Reason:** ${result.reason}`)
                        .addFields(
                            { name: '🎮 Game', value: game?.game_name || 'Unknown', inline: true },
                            { name: '👤 User', value: `<@${ticket.userId}>`, inline: true }
                        )
                    ],
                    components: [new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`ubisoft_staff_approve_${ticketId}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`ubisoft_staff_reject_${ticketId}`).setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger)
                    )]
                });
            }
        } else {
            // No AI - go straight to staff review
            ticket.status = 'awaiting_staff';
            const game = db.getUbisoftGame(ticket.gameId);
            await interaction.channel.send({
                content: `${getStaffMention(ticket.guildId)}`,
                embeds: [new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('👀 Staff Review Required')
                    .addFields(
                        { name: '🎮 Game', value: game?.game_name || 'Unknown', inline: true },
                        { name: '👤 User', value: `<@${ticket.userId}>`, inline: true }
                    )
                ],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`ubisoft_staff_approve_${ticketId}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`ubisoft_staff_reject_${ticketId}`).setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger)
                )]
            });
        }
        return;
    }
    
    // Clear screenshots
    if (customId.startsWith('ubisoft_clear_screenshots_')) {
        if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        
        ticket.collectedScreenshots = [];
        await interaction.update({
            embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🗑️ Screenshots Cleared').setDescription('Upload new screenshots.')],
            components: []
        });
        startUbisoftScreenshotTimer(ticketId, interaction.channel);
        return;
    }
    
    // Staff approve
    if (customId.startsWith('ubisoft_staff_approve_')) {
        if (!isStaff(interaction)) {
            return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
        }
        if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        
        try {
            await interaction.deferUpdate();
        } catch (e) {}
        
        const game = db.getUbisoftGame(ticket.gameId);
        await showUbisoftInstructionsAndDownload(interaction, ticket, game);
        await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: 'Manual approval', platform: 'ubisoft' });
        
        // Disable the approve/reject buttons
        try {
            await interaction.message.edit({
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('disabled_approve').setLabel(`Approved by ${interaction.user.username}`).setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(true)
                )]
            });
        } catch (e) {}
        return;
    }
    
    // Staff reject
    if (customId.startsWith('ubisoft_staff_reject_')) {
        if (!isStaff(interaction)) {
            return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
        }
        if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        
        ticket.collectedScreenshots = [];
        ticket.status = 'awaiting_screenshot';
        
        await interaction.update({
            embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Rejected by Staff').setDescription(`Rejected by ${interaction.user.username}`)],
            components: []
        });
        
        await interaction.channel.send({
            content: `<@${ticket.userId}>`,
            embeds: [new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Screenshots Rejected')
                .setDescription('A staff member has rejected your screenshots. Please upload new ones.')
            ]
        });
        
        startUbisoftScreenshotTimer(ticketId, interaction.channel);
        await logTicketEvent(ticket, 'staff_action', { staffMember: interaction.user.username, staffId: interaction.user.id, reason: 'Rejected screenshots', platform: 'ubisoft' });
        return;
    }
    
    // It works button
    if (customId.startsWith('ubisoft_it_works_')) {
        if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        if (interaction.user.id !== ticket.userId) return interaction.reply({ content: '❌ Not your ticket.', ephemeral: true });
        
        try {
            await interaction.deferUpdate();
        } catch (e) {}
        
        clearUbisoftTicketTimer(ticketId, 'response');
        
        // Apply cooldown
        const member = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
        const cooldownHours = getCooldownHours(member);
        
        if (cooldownHours > 0) {
            db.setCooldown(ticket.userId, interaction.guild.id, 'ticket', cooldownHours);
            await logCooldownEvent(interaction.guild.id, ticket.userId, ticket.username, 'applied', 'ticket', cooldownHours, 'System (auto)', null);
        }
        
        const game = db.getUbisoftGame(ticket.gameId);
        if (game?.demand_type === 'high' && !isExemptFromHighDemand(member)) {
            db.setCooldown(ticket.userId, interaction.guild.id, 'high_demand', 168);
            await logCooldownEvent(interaction.guild.id, ticket.userId, ticket.username, 'applied', 'high_demand', 168, 'System (auto)', null);
        }
        
        // Show success message with review button (like Steam)
        const successEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎉 Awesome! Enjoy your game!')
            .setDescription('Thanks for using Pub\'s Bartender!\n\n*Ticket will close in 1 minute.*');
        
        const reviewButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Leave a Review').setEmoji('⭐').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${interaction.guild.id}/${config.reviewChannelId}`)
        );
        
        await interaction.editReply({ embeds: [successEmbed], components: [reviewButton] });
        
        const duration = ticket.createdAt ? Math.round((Date.now() - ticket.createdAt) / 60000) : 0;
        await logTicketEvent(ticket, 'completed', { reason: 'User confirmed working', duration: `${duration} minutes`, platform: 'ubisoft' });
        await logActivation(ticket, duration);
        
        // Close after 1 minute
        setTimeout(async () => {
            await closeUbisoftTicket(ticketId, 'completed', interaction.channel);
        }, 60000);
        return;
    }
    
    // Need help button
    if (customId.startsWith('ubisoft_need_help_')) {
        if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        
        try {
            await interaction.deferUpdate();
        } catch (e) {}
        
        clearUbisoftTicketTimer(ticketId, 'response');
        ticket.status = 'needs_help';
        ticket.helpRequested = true;
        
        await interaction.channel.send({
            content: getStaffMention(ticket.guildId),
            embeds: [new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🆘 Help Requested')
                .addFields(
                    { name: '🎮 Game', value: ticket.gameName || 'Unknown', inline: true },
                    { name: '👤 User', value: `<@${ticket.userId}>`, inline: true }
                )
            ]
        });
        
        await interaction.channel.send({
            content: `<@${ticket.userId}>`,
            embeds: [new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('⏳ Staff Notified')
                .setDescription('A staff member has been notified and will help you shortly.\n\n🚫 **Do not ping or DM staff**')
            ]
        });
        
        await logTicketEvent(ticket, 'step_change', { step: 'User requested help', platform: 'ubisoft' });
        return;
    }
    
    // Early help button
    if (customId.startsWith('ubisoft_early_help_')) {
        if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        
        try {
            await interaction.deferUpdate();
        } catch (e) {}
        
        ticket.helpRequested = true;
        
        await interaction.channel.send({
            content: getStaffMention(ticket.guildId),
            embeds: [new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🆘 Help Requested')
                .addFields(
                    { name: '🎮 Game', value: ticket.gameName || 'Unknown', inline: true },
                    { name: '👤 User', value: `<@${ticket.userId}>`, inline: true },
                    { name: '📊 Status', value: ticket.status || 'Unknown', inline: true }
                )
            ]
        });
        return;
    }
    
    // Close ticket button
    if (customId.startsWith('ubisoft_close_ticket_')) {
        if (!ticket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        
        // Allow user or staff to close
        if (interaction.user.id !== ticket.userId && !isStaff(interaction)) {
            return interaction.reply({ content: '❌ You cannot close this ticket.', ephemeral: true });
        }
        
        try {
            await interaction.deferUpdate();
        } catch (e) {}
        
        const reason = interaction.user.id === ticket.userId ? 'Closed by user' : `Closed by staff (${interaction.user.username})`;
        await closeUbisoftTicket(ticketId, reason, interaction.channel);
        return;
    }
}

// ============================================================================
// EA BUTTON/INTERACTION HANDLER
// ============================================================================

async function handleEAInteraction(interaction) {
    const customId = interaction.customId;
    
    // EA Panel Refresh button
    if (customId === 'ea_refresh') {
        try {
            await interaction.deferUpdate();
            await updateEAPanel();
        } catch (e) {
            console.error('[EA] Refresh error:', e.message);
        }
        return;
    }
    
    // EA Panel Selection
    if (customId.startsWith('ea_panel_')) {
        const gameId = interaction.values?.[0]?.replace('ea_game_', '');
        if (gameId) {
            await createEATicket(interaction, parseInt(gameId));
        }
        return;
    }
    
    // EA ticket buttons
    const eaTicketIdMatch = customId.match(/ea_(?:works|early_help|close_ticket|approve|redo|override|staff_approve|staff_reject)_(.+)/);
    const eaTicketId = eaTicketIdMatch ? eaTicketIdMatch[1] : null;
    let eaTicket = eaTicketId ? activeEATickets.get(eaTicketId) : null;
    
    // Try to recover ticket from database if not in memory
    if (!eaTicket && eaTicketId) {
        try {
            const savedTicket = db.getEATicket ? db.getEATicket(eaTicketId) : null;
            if (savedTicket && savedTicket.status !== 'closed') {
                console.log(`[EA] Recovering ticket ${eaTicketId} from database`);
                const game = db.getEAGame ? db.getEAGame(savedTicket.game_id) : null;
                eaTicket = {
                    id: eaTicketId,
                    threadId: savedTicket.thread_id,
                    userId: savedTicket.user_id,
                    username: savedTicket.username,
                    gameId: savedTicket.game_id,
                    gameName: game?.game_name || 'Unknown',
                    guildId: savedTicket.guild_id,
                    status: savedTicket.status || 'active',
                    platform: 'ea',
                    collectedScreenshots: [],
                    helpRequested: false,
                    createdAt: savedTicket.created_at || Date.now()
                };
                activeEATickets.set(eaTicketId, eaTicket);
                console.log(`[EA] Recovered ticket ${eaTicketId}, status: ${eaTicket.status}`);
            }
        } catch (err) {
            console.error('[EA] Ticket recovery error:', err.message);
        }
    }
    
    // It Works button
    if (customId.startsWith('ea_works_')) {
        if (!eaTicket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        if (interaction.user.id !== eaTicket.userId) return interaction.reply({ content: '❌ Only the ticket owner can use this.', ephemeral: true });
        
        try { await interaction.deferUpdate(); } catch (e) {}
        
        // Check if game is high demand
        const game = db.getEAGame ? db.getEAGame(eaTicket.gameId) : null;
        const isHighDemand = game?.demand_type === 'high';
        
        // Apply cooldowns (matching Steam/Ubisoft: 48h base, 168h for high demand)
        const member = await interaction.guild.members.fetch(eaTicket.userId).catch(() => null);
        const cooldownHours = getCooldownHours(member);
        
        if (cooldownHours > 0) {
            db.setCooldown(eaTicket.userId, eaTicket.guildId, 'ticket', cooldownHours);
            await logCooldownEvent(eaTicket.guildId, eaTicket.userId, eaTicket.username, 'applied', 'ticket', cooldownHours, 'System (EA)', null);
        }
        
        if (isHighDemand && !isExemptFromHighDemand(member)) {
            db.setCooldown(eaTicket.userId, eaTicket.guildId, 'high_demand', 168);
            await logCooldownEvent(eaTicket.guildId, eaTicket.userId, eaTicket.username, 'applied', 'high_demand', 168, 'System (EA)', null);
        }
        
        // Log activation
        if (db.logEAActivation) {
            db.logEAActivation(eaTicket.guildId, eaTicket.userId, eaTicket.username, eaTicket.gameId, eaTicket.gameName, eaTicket.reservedTokenId, 'EAgen', eaTicket.id);
        }
        
        // Show success message with review button (like Steam)
        const successEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎉 Awesome! Enjoy your game!')
            .setDescription('Thanks for using Pub\'s Bartender!\n\n*Ticket will close in 1 minute.*');
        
        const reviewButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Leave a Review').setEmoji('⭐').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${interaction.guild.id}/${config.reviewChannelId}`)
        );
        
        await interaction.editReply({ embeds: [successEmbed], components: [reviewButton] });
        
        // Calculate duration
        const duration = eaTicket.createdAt ? Math.round((Date.now() - eaTicket.createdAt) / 60000) : 0;
        await logTicketEvent(eaTicket, 'completed', { reason: 'User confirmed working', duration: `${duration} minutes`, platform: 'ea' });
        await logActivation(eaTicket, duration);
        
        // Update panel
        await updateEAPanel();
        
        // Close after 1 minute
        setTimeout(async () => {
            await closeEATicket(eaTicketId, 'completed', interaction.channel);
        }, 60000);
        
        return;
    }
    
    // Need Help button
    if (customId.startsWith('ea_early_help_')) {
        if (!eaTicket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        
        try { await interaction.deferUpdate(); } catch (e) {}
        
        eaTicket.helpRequested = true;
        eaTicket.status = 'needs_staff';
        
        const helpEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🆘 Help Requested')
            .setDescription(`<@${eaTicket.userId}> needs assistance!`)
            .setFooter({ text: `Ticket: ${eaTicketId}` });
        
        const staffButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ea_approve_${eaTicketId}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ea_redo_${eaTicketId}`).setLabel('Redo').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ea_close_ticket_${eaTicketId}`).setLabel('Close').setEmoji('🚪').setStyle(ButtonStyle.Danger)
        );
        
        await interaction.channel.send({ content: `${getStaffMention(eaTicket.guildId)}`, embeds: [helpEmbed], components: [staffButtons] });
        return;
    }
    
    // Staff Review Channel - Approve button
    if (customId.startsWith('ea_staff_approve_')) {
        if (!eaTicket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        if (!isStaff(interaction)) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
        
        try { await interaction.deferUpdate(); } catch (e) {}
        
        // Update review message
        await interaction.message.edit({
            embeds: [EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0x00FF00)
                .setTitle('✅ EA Approved')
                .setFooter({ text: `Approved by ${interaction.user.username}` })
            ],
            components: []
        });
        
        // Get ticket channel
        const ticketChannel = await client.channels.fetch(eaTicket.threadId).catch(() => null);
        if (!ticketChannel) {
            return interaction.followUp({ content: '❌ Ticket channel not found.', ephemeral: true });
        }
        
        const game = db.getEAGame ? db.getEAGame(eaTicket.gameId) : null;
        await proceedToEATokenRequest(eaTicket, ticketChannel, game);
        
        await interaction.followUp({ content: `✅ EA ticket ${eaTicketId} approved. User can now upload token file.`, ephemeral: true });
        return;
    }
    
    // Staff Review Channel - Reject button
    if (customId.startsWith('ea_staff_reject_')) {
        if (!eaTicket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        if (!isStaff(interaction)) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
        
        try { await interaction.deferUpdate(); } catch (e) {}
        
        // Update review message
        await interaction.message.edit({
            embeds: [EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0xFF0000)
                .setTitle('❌ EA Rejected')
                .setFooter({ text: `Rejected by ${interaction.user.username}` })
            ],
            components: []
        });
        
        // Get ticket channel and ask user to redo
        const ticketChannel = await client.channels.fetch(eaTicket.threadId).catch(() => null);
        if (ticketChannel) {
            eaTicket.status = 'awaiting_screenshot';
            eaTicket.collectedScreenshots = [];
            
            await ticketChannel.send({ 
                content: `<@${eaTicket.userId}>`,
                embeds: [new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('❌ Screenshots Rejected')
                    .setDescription('Staff has rejected your screenshots. Please upload new screenshots.')
                    .setFooter({ text: eaTicket.id })]
            });
            
            startEAScreenshotTimer(eaTicketId, ticketChannel);
        }
        
        await interaction.followUp({ content: `❌ EA ticket ${eaTicketId} rejected. User asked to upload new screenshots.`, ephemeral: true });
        return;
    }
    
    // Approve button (staff) - in ticket channel
    if (customId.startsWith('ea_approve_')) {
        if (!eaTicket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        if (!isStaff(interaction)) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
        
        try { await interaction.deferUpdate(); } catch (e) {}
        
        eaTicket.status = 'awaiting_token_request';
        
        // Show instructions
        const instructionsEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Approved by Staff!')
            .addFields({ name: '📋 Instructions', value: EA_INSTRUCTIONS.substring(0, 1024) });
        
        await interaction.channel.send({ embeds: [instructionsEmbed] });
        
        const tokenRequestEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📤 Upload Token Request File')
            .setDescription('Upload the `.txt` file generated by the game.\n\n⏱️ **Time Limit:** 30 minutes');
        
        await interaction.channel.send({ content: `<@${eaTicket.userId}>`, embeds: [tokenRequestEmbed] });
        startEATokenRequestTimer(eaTicketId, interaction.channel);
        return;
    }
    
    // Redo button (staff)
    if (customId.startsWith('ea_redo_')) {
        if (!eaTicket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        if (!isStaff(interaction)) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
        
        try { await interaction.deferUpdate(); } catch (e) {}
        
        eaTicket.status = 'awaiting_screenshot';
        eaTicket.collectedScreenshots = [];
        
        await interaction.channel.send({ content: `<@${eaTicket.userId}> Please upload new screenshots.` });
        startEAScreenshotTimer(eaTicketId, interaction.channel);
        return;
    }
    
    // Close ticket button
    if (customId.startsWith('ea_close_ticket_')) {
        if (!eaTicket) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
        
        if (interaction.user.id !== eaTicket.userId && !isStaff(interaction)) {
            return interaction.reply({ content: '❌ You cannot close this ticket.', ephemeral: true });
        }
        
        try { await interaction.deferUpdate(); } catch (e) {}
        
        const reason = interaction.user.id === eaTicket.userId ? 'Closed by user' : `Closed by staff (${interaction.user.username})`;
        await closeEATicket(eaTicketId, reason, interaction.channel);
        return;
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    // Check for EA ticket messages first
    const eaTicket = Array.from(activeEATickets.values()).find(t => 
        t.threadId === message.channel.id && message.author.id === t.userId
    );
    
    if (eaTicket) {
        console.log(`[EA] Message in ticket ${eaTicket.id}, status: ${eaTicket.status}, attachments: ${message.attachments.size}`);
        
        // Handle EA screenshot
        if (eaTicket.status === 'awaiting_screenshot' && message.attachments.size > 0) {
            console.log(`[EA] Processing screenshot for ${eaTicket.id}`);
            await handleEAScreenshot(message);
            return;
        }
        // Handle EA token request file
        if (eaTicket.status === 'awaiting_token_request' && message.attachments.size > 0) {
            console.log(`[EA] Processing token request file for ${eaTicket.id}`);
            await handleEATokenRequestFile(message);
            return;
        }
    }
    
    // Check for Ubisoft ticket messages
    const ubisoftTicket = Array.from(activeUbisoftTickets.values()).find(t => 
        t.threadId === message.channel.id && message.author.id === t.userId
    );
    
    if (ubisoftTicket) {
        console.log(`[Ubisoft] Message in ticket ${ubisoftTicket.id}, status: ${ubisoftTicket.status}, attachments: ${message.attachments.size}`);
        
        // Handle Ubisoft screenshot
        if (ubisoftTicket.status === 'awaiting_screenshot' && message.attachments.size > 0) {
            console.log(`[Ubisoft] Processing screenshot for ${ubisoftTicket.id}`);
            await handleUbisoftScreenshot(message);
            return;
        }
        // Handle Ubisoft token request file
        if (ubisoftTicket.status === 'awaiting_token_request' && message.attachments.size > 0) {
            console.log(`[Ubisoft] Processing token request file for ${ubisoftTicket.id}`);
            await handleUbisoftTokenRequestFile(message);
            return;
        }
    }
    
    // Check for Steam ticket messages
    const steamIdTicket = Array.from(activeTickets.values()).find(t => t.threadId === message.channel.id && t.status === 'awaiting_steam_id');
    if (steamIdTicket && message.author.id === steamIdTicket.userId) await handleSteamIdMessage(message);
    else if (message.attachments.size > 0) await handleScreenshot(message);
});

process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

client.login(config.token);
