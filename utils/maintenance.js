/**
 * Bartender Bot - Maintenance Utility
 * Handles scheduled cleanup and maintenance tasks
 */

const path = require('path');

let db;

function init(database) {
    db = database;
    console.log('✅ Maintenance utility initialized');
}

/**
 * Run all maintenance tasks
 */
async function runAllMaintenance() {
    console.log('\n========================================');
    console.log('🔧 Starting Maintenance Tasks...');
    console.log('========================================\n');
    
    const results = {
        startTime: new Date().toISOString(),
        tasks: []
    };
    
    try {
        // 1. Cleanup expired cooldowns
        const cooldownResult = cleanupExpiredCooldowns();
        results.tasks.push({ name: 'Cleanup Expired Cooldowns', ...cooldownResult });
        
        // 2. Cleanup expired per-game cooldowns
        const pgcdResult = cleanupExpiredPerGameCooldowns();
        results.tasks.push({ name: 'Cleanup Per-Game Cooldowns', ...pgcdResult });
        
        // 3. Cleanup old step_change events (older than 7 days)
        const stepChangeResult = cleanupOldStepChanges(7);
        results.tasks.push({ name: 'Cleanup Step Changes (7 days)', ...stepChangeResult });
        
        // 4. Cleanup old ticket logs (older than 90 days - keep as archive option)
        // const ticketLogResult = cleanupOldTicketLogs(90);
        // results.tasks.push({ name: 'Archive Old Ticket Logs', ...ticketLogResult });
        
        // 5. Compress old transcripts (older than 30 days)
        const transcriptResult = compressOldTranscripts(30);
        results.tasks.push({ name: 'Compress Transcripts (30 days)', ...transcriptResult });
        
        // 6. Initialize new tables if needed
        initializeNewTables();
        results.tasks.push({ name: 'Initialize New Tables', success: true, message: 'Tables checked/created' });
        
    } catch (err) {
        console.error('❌ Maintenance error:', err.message);
        results.error = err.message;
    }
    
    results.endTime = new Date().toISOString();
    results.duration = new Date(results.endTime) - new Date(results.startTime);
    
    console.log('\n========================================');
    console.log('✅ Maintenance Complete');
    console.log(`Duration: ${results.duration}ms`);
    console.log('========================================\n');
    
    return results;
}

/**
 * Cleanup expired regular cooldowns
 */
function cleanupExpiredCooldowns() {
    try {
        if (db.cleanupExpiredCooldowns) {
            const result = db.cleanupExpiredCooldowns();
            console.log(`✅ Cleaned up ${result?.changes || 0} expired cooldowns`);
            return { success: true, deleted: result?.changes || 0 };
        }
        return { success: false, message: 'Function not available' };
    } catch (err) {
        console.error('❌ Cooldown cleanup error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Cleanup expired per-game cooldowns
 */
function cleanupExpiredPerGameCooldowns() {
    try {
        if (db.cleanupExpiredPerGameCooldowns) {
            const result = db.cleanupExpiredPerGameCooldowns();
            console.log(`✅ Cleaned up ${result?.changes || 0} expired per-game cooldowns`);
            return { success: true, deleted: result?.changes || 0 };
        }
        return { success: false, message: 'Function not available' };
    } catch (err) {
        console.error('❌ Per-game cooldown cleanup error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Cleanup old step_change events
 */
function cleanupOldStepChanges(daysOld = 7) {
    try {
        if (db.cleanupOldStepChanges) {
            const result = db.cleanupOldStepChanges(daysOld);
            console.log(`✅ Cleaned up ${result?.changes || 0} old step_change events (>${daysOld} days)`);
            return { success: true, deleted: result?.changes || 0 };
        }
        return { success: false, message: 'Function not available' };
    } catch (err) {
        console.error('❌ Step change cleanup error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Cleanup old ticket logs (archive)
 */
function cleanupOldTicketLogs(daysOld = 90) {
    try {
        if (db.cleanupOldTicketLogs) {
            const result = db.cleanupOldTicketLogs(daysOld);
            console.log(`✅ Archived ${result?.changes || 0} old ticket logs (>${daysOld} days)`);
            return { success: true, archived: result?.changes || 0 };
        }
        return { success: false, message: 'Function not available' };
    } catch (err) {
        console.error('❌ Ticket log cleanup error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Compress old transcripts
 */
function compressOldTranscripts(daysOld = 30) {
    try {
        if (db.compressOldTranscripts) {
            const result = db.compressOldTranscripts(daysOld);
            console.log(`✅ Compressed ${result?.changes || 0} old transcripts (>${daysOld} days)`);
            return { success: true, compressed: result?.changes || 0 };
        }
        return { success: false, message: 'Function not available' };
    } catch (err) {
        console.error('❌ Transcript compression error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Initialize new tables (user_notes, etc.)
 */
function initializeNewTables() {
    try {
        if (db.initNewTables) {
            db.initNewTables();
            console.log('✅ New tables initialized');
        }
        if (db.initUserNotesTable) {
            db.initUserNotesTable();
        }
    } catch (err) {
        console.error('❌ Table initialization error:', err.message);
    }
}

/**
 * Get maintenance statistics
 */
function getMaintenanceStats() {
    try {
        if (db.getMaintenanceStats) {
            return db.getMaintenanceStats();
        }
        return null;
    } catch (err) {
        console.error('❌ Stats error:', err.message);
        return null;
    }
}

/**
 * Schedule automatic maintenance
 * Runs every 60 minutes by default
 */
function scheduleAutomaticMaintenance(intervalMinutes = 60) {
    const intervalMs = intervalMinutes * 60 * 1000;
    
    console.log(`📅 Scheduling automatic maintenance every ${intervalMinutes} minutes`);
    
    // Run immediately on start
    setTimeout(() => {
        console.log('🔧 Running initial maintenance...');
        runAllMaintenance().catch(console.error);
    }, 5000); // 5 second delay after bot start
    
    // Then run on interval
    setInterval(() => {
        console.log('🔧 Running scheduled maintenance...');
        runAllMaintenance().catch(console.error);
    }, intervalMs);
}

module.exports = {
    init,
    runAllMaintenance,
    cleanupExpiredCooldowns,
    cleanupExpiredPerGameCooldowns,
    cleanupOldStepChanges,
    cleanupOldTicketLogs,
    compressOldTranscripts,
    initializeNewTables,
    getMaintenanceStats,
    scheduleAutomaticMaintenance
};
