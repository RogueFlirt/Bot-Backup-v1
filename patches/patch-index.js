/**
 * BARTENDER BOT - INDEX.JS PATCHES
 * 
 * This script patches index.js to fix the following issues:
 * 1. Platform logging - adds platform parameter to logTicketEvent calls
 * 2. Adds /removepgcd command to remove per-game cooldowns
 * 3. Adds scheduled maintenance for cooldown cleanup
 * 
 * Run from bot directory: node patches/patch-index.js
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.js');

console.log('='.repeat(60));
console.log('BARTENDER BOT - INDEX.JS PATCHER');
console.log('='.repeat(60));

// Check if index.js exists
if (!fs.existsSync(indexPath)) {
    console.error('ERROR: index.js not found at', indexPath);
    process.exit(1);
}

// Backup the file
const backupPath = indexPath + '.backup.' + Date.now();
fs.copyFileSync(indexPath, backupPath);
console.log('✅ Backup created:', backupPath);

let content = fs.readFileSync(indexPath, 'utf8');
let patchCount = 0;

// =============================================================================
// PATCH 1: Fix Steam logTicketEvent calls to include platform parameter
// =============================================================================

// Find the Steam logTicketEvent call in logTicketEvent function
const steamLogPattern = /db\.logTicketEvent\(\s*ticket\.id,\s*ticket\.guildId,\s*null,\s*ticket\.userId,\s*ticket\.username,\s*ticket\.gameId,\s*ticket\.gameName,\s*eventType,\s*JSON\.stringify\(details\),\s*details\.staffMember,\s*details\.staffId,\s*details\.durationMinutes\s*\)/g;

const steamLogReplacement = `db.logTicketEvent(
                ticket.id, ticket.guildId, null, ticket.userId, ticket.username,
                ticket.gameId, ticket.gameName, eventType, 
                JSON.stringify(details), details.staffMember, details.staffId, details.durationMinutes,
                ticket.platform || 'steam'
            )`;

if (steamLogPattern.test(content)) {
    content = content.replace(steamLogPattern, steamLogReplacement);
    patchCount++;
    console.log('✅ PATCH 1: Fixed Steam logTicketEvent to include platform');
} else {
    console.log('⚠️  PATCH 1: Steam logTicketEvent pattern not found (may already be patched)');
}

// =============================================================================
// PATCH 2: Add /removepgcd slash command definition
// =============================================================================

// Find the slash commands array and add removepgcd
const slashCmdPattern = /new SlashCommandBuilder\(\)\.setName\('viewcooldown'\)/;

if (slashCmdPattern.test(content) && !content.includes("setName('removepgcd')")) {
    const removepgcdCmd = `new SlashCommandBuilder().setName('removepgcd').setDescription('Remove per-game cooldown for a user')
        .addUserOption(o => o.setName('user').setDescription('User to remove cooldown from').setRequired(true))
        .addStringOption(o => o.setName('game').setDescription('Game name or ID').setRequired(true))
        .addStringOption(o => o.setName('platform').setDescription('Platform').setRequired(false).addChoices(
            { name: 'Steam', value: 'steam' },
            { name: 'Ubisoft', value: 'ubisoft' },
            { name: 'EA', value: 'ea' }
        ))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads).setDMPermission(false),
    new SlashCommandBuilder().setName('viewcooldown')`;
    
    content = content.replace(slashCmdPattern, removepgcdCmd);
    patchCount++;
    console.log('✅ PATCH 2: Added /removepgcd slash command definition');
} else {
    console.log('⚠️  PATCH 2: /removepgcd already exists or pattern not found');
}

// =============================================================================
// PATCH 3: Add /removepgcd command handler
// =============================================================================

// Find viewcooldown handler and add removepgcd handler before it
const viewCooldownHandler = /else if \(commandName === 'viewcooldown'\)/;

if (viewCooldownHandler.test(content) && !content.includes("commandName === 'removepgcd'")) {
    const removepgcdHandler = `else if (commandName === 'removepgcd') {
            await interaction.deferReply({ ephemeral: true });
            
            const targetUser = interaction.options.getUser('user');
            const gameInput = interaction.options.getString('game');
            const platform = interaction.options.getString('platform') || 'steam';
            
            try {
                // Find the game
                let game = null;
                let gameId = null;
                
                if (platform === 'steam') {
                    game = db.getGame(gameInput) || db.getGameBySlug(gameInput) || db.getGameById(parseInt(gameInput));
                    gameId = game?.id || game?.game_id;
                } else if (platform === 'ubisoft') {
                    game = db.getUbisoftGame(parseInt(gameInput));
                    gameId = game?.id;
                } else if (platform === 'ea') {
                    game = db.getEAGame(parseInt(gameInput));
                    gameId = game?.id;
                }
                
                if (!game) {
                    return interaction.editReply({ content: \`❌ Game not found: \${gameInput}\` });
                }
                
                // Remove the per-game cooldown
                const cooldownType = \`game_\${platform}_\${gameId}\`;
                const removed = db.removeCooldown(targetUser.id, interaction.guild.id, cooldownType);
                
                // Also try universal cooldown
                const removedUniversal = db.removeCooldown(targetUser.id, null, cooldownType);
                
                if (removed || removedUniversal) {
                    await interaction.editReply({ 
                        content: \`✅ Removed \${platform} per-game cooldown for <@\${targetUser.id}> on **\${game.game_name}**\` 
                    });
                    
                    // Log the action
                    db.logTicketEvent(null, interaction.guild.id, null, targetUser.id, targetUser.username,
                        gameId, game.game_name, 'cooldown_removed',
                        JSON.stringify({ type: 'per_game', platform, removedBy: interaction.user.username }),
                        interaction.user.username, interaction.user.id, null, platform);
                } else {
                    await interaction.editReply({ 
                        content: \`⚠️ No per-game cooldown found for <@\${targetUser.id}> on **\${game.game_name}** (\${platform})\` 
                    });
                }
            } catch (err) {
                console.error('[RemovePGCD] Error:', err.message);
                await interaction.editReply({ content: \`❌ Error: \${err.message}\` });
            }
        }
        
        else if (commandName === 'viewcooldown')`;
    
    content = content.replace(viewCooldownHandler, removepgcdHandler);
    patchCount++;
    console.log('✅ PATCH 3: Added /removepgcd command handler');
} else {
    console.log('⚠️  PATCH 3: /removepgcd handler already exists or pattern not found');
}

// =============================================================================
// PATCH 4: Add scheduled maintenance for cooldown cleanup
// =============================================================================

// Find the client.once('ready') block and add maintenance scheduler
const readyPattern = /client\.once\('ready',\s*(?:async\s*)?\(\)\s*=>\s*\{/;

if (readyPattern.test(content) && !content.includes('// MAINTENANCE: Clear expired cooldowns')) {
    const maintenanceCode = `client.once('ready', async () => {
    // MAINTENANCE: Clear expired cooldowns every hour
    setInterval(() => {
        try {
            const cleared = db.clearExpiredCooldowns();
            if (cleared > 0) {
                console.log(\`[Maintenance] Cleared \${cleared} expired cooldowns\`);
            }
        } catch (e) {
            console.error('[Maintenance] Cooldown cleanup error:', e.message);
        }
    }, 60 * 60 * 1000); // Every hour
    
    // Run once on startup
    try {
        const cleared = db.clearExpiredCooldowns();
        console.log(\`[Maintenance] Startup cleanup: \${cleared} expired cooldowns cleared\`);
    } catch (e) {}
    `;
    
    content = content.replace(readyPattern, maintenanceCode);
    patchCount++;
    console.log('✅ PATCH 4: Added scheduled maintenance for cooldown cleanup');
} else {
    console.log('⚠️  PATCH 4: Maintenance already exists or pattern not found');
}

// =============================================================================
// PATCH 5: Add 'removepgcd' to staff command list
// =============================================================================

const staffCmdListPattern = /'sethighdemand',\s*'clearusertickets',\s*'viewcooldown'/;

if (staffCmdListPattern.test(content) && !content.includes("'removepgcd'")) {
    content = content.replace(
        staffCmdListPattern,
        "'sethighdemand', 'clearusertickets', 'viewcooldown', 'removepgcd'"
    );
    patchCount++;
    console.log('✅ PATCH 5: Added removepgcd to staff command list');
} else {
    console.log('⚠️  PATCH 5: Staff command list already patched or pattern not found');
}

// =============================================================================
// Save the patched file
// =============================================================================

fs.writeFileSync(indexPath, content, 'utf8');

console.log('');
console.log('='.repeat(60));
console.log(`✅ PATCHING COMPLETE - ${patchCount} patches applied`);
console.log('='.repeat(60));
console.log('');
console.log('Next steps:');
console.log('1. Run: pm2 restart bartender-bot');
console.log('2. Run: node . deploy (to register new slash commands)');
console.log('');
