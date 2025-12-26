// ============================================================================
// LOCAL BACKUP - Database backup utilities
// ============================================================================

const fs = require('fs');
const path = require('path');

class LocalBackup {
    constructor(options = {}) {
        this.backupDir = options.backupDir || path.join(__dirname, '../../backups');
        this.maxBackups = options.maxBackups || 10;
        
        // Ensure backup directory exists
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }
    
    /**
     * Create a backup of the database
     */
    async createBackup(dbPath, label = '') {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = label 
                ? `backup-${label}-${timestamp}.db`
                : `backup-${timestamp}.db`;
            const backupPath = path.join(this.backupDir, backupName);
            
            // Copy database file
            fs.copyFileSync(dbPath, backupPath);
            
            console.log(`[Backup] Created: ${backupName}`);
            
            // Cleanup old backups
            this.cleanupOldBackups();
            
            return {
                success: true,
                path: backupPath,
                name: backupName
            };
        } catch (error) {
            console.error('[Backup] Failed to create backup:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Restore database from backup
     */
    async restoreBackup(backupPath, dbPath) {
        try {
            // Create a backup of current db before restore
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const preRestoreBackup = path.join(this.backupDir, `pre-restore-${timestamp}.db`);
            fs.copyFileSync(dbPath, preRestoreBackup);
            
            // Restore from backup
            fs.copyFileSync(backupPath, dbPath);
            
            console.log(`[Backup] Restored from: ${path.basename(backupPath)}`);
            
            return {
                success: true,
                restoredFrom: backupPath
            };
        } catch (error) {
            console.error('[Backup] Failed to restore:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * List available backups
     */
    listBackups() {
        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(f => f.endsWith('.db'))
                .map(f => {
                    const fullPath = path.join(this.backupDir, f);
                    const stats = fs.statSync(fullPath);
                    return {
                        name: f,
                        path: fullPath,
                        size: stats.size,
                        created: stats.mtime
                    };
                })
                .sort((a, b) => b.created - a.created);
            
            return files;
        } catch (error) {
            return [];
        }
    }
    
    /**
     * Cleanup old backups, keeping only maxBackups
     */
    cleanupOldBackups() {
        try {
            const backups = this.listBackups();
            
            if (backups.length > this.maxBackups) {
                const toDelete = backups.slice(this.maxBackups);
                for (const backup of toDelete) {
                    fs.unlinkSync(backup.path);
                    console.log(`[Backup] Deleted old backup: ${backup.name}`);
                }
            }
        } catch (error) {
            console.error('[Backup] Cleanup error:', error.message);
        }
    }
    
    /**
     * Delete a specific backup
     */
    deleteBackup(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);
            if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath);
                return { success: true };
            }
            return { success: false, error: 'Backup not found' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Initialize the backup system
     */
    initialize() {
        console.log(`[Backup] Initialized. Backup directory: ${this.backupDir}`);
        console.log(`[Backup] Max backups to keep: ${this.maxBackups}`);
        return true;
    }
    
    /**
     * Start scheduled backups
     */
    startScheduledBackups(intervalHours = 6) {
        this.backupInterval = setInterval(() => {
            const dbPath = path.join(__dirname, '../database/bartender.db');
            if (fs.existsSync(dbPath)) {
                this.createBackup(dbPath, 'scheduled');
            }
        }, intervalHours * 60 * 60 * 1000);
        
        console.log(`[Backup] Scheduled backups started (every ${intervalHours} hours)`);
        
        // Create initial backup
        const dbPath = path.join(__dirname, '../database/bartender.db');
        if (fs.existsSync(dbPath)) {
            this.createBackup(dbPath, 'startup');
        }
    }
    
    /**
     * Stop scheduled backups
     */
    stopScheduledBackups() {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
            this.backupInterval = null;
            console.log('[Backup] Scheduled backups stopped');
        }
    }
}

module.exports = LocalBackup;
