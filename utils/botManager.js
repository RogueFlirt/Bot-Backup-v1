// ============================================================================
// BOT MANAGER - Handles bot lifecycle, restarts, and status
// ============================================================================

const { spawn, exec } = require('child_process');
const path = require('path');

class BotManager {
    constructor() {
        this.startTime = Date.now();
        this.restartLogs = [];
        this.lastRestart = 0;
        this.restartCooldown = 60000; // 1 minute cooldown
        this.isRestarting = false;
    }
    
    /**
     * Get bot status information
     */
    getStatus() {
        const uptime = Date.now() - this.startTime;
        const client = global.discordClient;
        
        return {
            online: client?.isReady() || false,
            uptime: uptime,
            uptimeFormatted: this.formatUptime(uptime),
            memoryUsage: process.memoryUsage(),
            nodeVersion: process.version,
            platform: process.platform,
            lastRestart: this.lastRestart,
            isRestarting: this.isRestarting
        };
    }
    
    /**
     * Format uptime in human readable format
     */
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    /**
     * Check if restart is allowed (cooldown check)
     */
    canRestart() {
        return !this.isRestarting && (Date.now() - this.lastRestart) > this.restartCooldown;
    }
    
    /**
     * Get remaining cooldown time formatted
     */
    getCooldownRemainingFormatted() {
        const remaining = Math.max(0, this.restartCooldown - (Date.now() - this.lastRestart));
        return `${Math.ceil(remaining / 1000)} seconds`;
    }
    
    /**
     * Get restart logs
     */
    getRestartLogs(limit = 10) {
        return this.restartLogs.slice(-limit);
    }
    
    /**
     * Log a restart event
     */
    logRestart(info, source) {
        this.restartLogs.push({
            timestamp: new Date().toISOString(),
            source: source || 'unknown',
            triggeredBy: info?.username || 'system',
            userId: info?.userId || null
        });
        
        // Keep only last 50 logs
        if (this.restartLogs.length > 50) {
            this.restartLogs = this.restartLogs.slice(-50);
        }
    }
    
    /**
     * Restart the bot using PM2
     */
    async restart(userInfo, source = 'api') {
        if (!this.canRestart()) {
            return {
                success: false,
                error: 'Restart on cooldown',
                cooldownRemaining: this.getCooldownRemainingFormatted()
            };
        }
        
        this.isRestarting = true;
        this.lastRestart = Date.now();
        this.logRestart(userInfo, source);
        
        console.log(`[BotManager] Restart initiated by ${userInfo?.username || 'system'} via ${source}`);
        
        return new Promise((resolve) => {
            exec('pm2 restart bartender-bot', (error, stdout, stderr) => {
                this.isRestarting = false;
                
                if (error) {
                    console.error('[BotManager] Restart failed:', error.message);
                    resolve({
                        success: false,
                        error: error.message
                    });
                } else {
                    console.log('[BotManager] Restart command executed');
                    resolve({
                        success: true,
                        message: 'Bot restart initiated'
                    });
                }
            });
        });
    }
    
    /**
     * Reset start time (called when bot reconnects)
     */
    resetStartTime() {
        this.startTime = Date.now();
    }
    
    /**
     * Handle shutdown cleanup
     */
    onShutdown(callback) {
        process.on('SIGINT', () => {
            console.log('[BotManager] Received SIGINT, shutting down...');
            if (callback) callback();
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            console.log('[BotManager] Received SIGTERM, shutting down...');
            if (callback) callback();
            process.exit(0);
        });
    }
}

// Singleton instance
let instance = null;

function getBotManager() {
    if (!instance) {
        instance = new BotManager();
    }
    return instance;
}

module.exports = { getBotManager, BotManager };
