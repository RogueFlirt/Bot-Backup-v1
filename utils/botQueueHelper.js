// ============================================================================
// BOT QUEUE HELPER - Handles token generation queue for Discord bot
// Jobs enter the FIFO queue immediately when addToQueue is called
// ============================================================================

const tokenGeneratorPool = require('./tokenGeneratorPool');
const db = require('../database/db');

class BotQueueHelper {
    constructor(client, apiBaseUrl) {
        this.client = client;
        this.apiBaseUrl = apiBaseUrl;
        this.activeJobs = new Map();  // ticketId -> { promise, callbacks, positionInterval }
        
        console.log('[BotQueueHelper] Initialized with FIFO queue (3 workers)');
    }
    
    /**
     * Add a job to the queue - job enters queue IMMEDIATELY
     */
    async addToQueue(jobData) {
        try {
            const { ticketId, gameId, steamId, channelId, userId, username } = jobData;
            
            // Look up game info
            const gameInfo = db.getGame(gameId);
            if (!gameInfo) {
                console.error(`[BotQueueHelper] Game not found: ${gameId}`);
                return { success: false, error: 'Game not found' };
            }
            
            const gameName = gameInfo.folder_name || gameInfo.game_name;
            
            // Get reserved token to find account
            const reservedToken = db.getReservedToken(ticketId);
            if (!reservedToken) {
                console.error(`[BotQueueHelper] No reserved token for ticket: ${ticketId}`);
                return { success: false, error: 'No reserved token found' };
            }
            
            // Get account info
            const accountInfo = db.getAccount(reservedToken.account_id);
            if (!accountInfo) {
                console.error(`[BotQueueHelper] Account not found: ${reservedToken.account_id}`);
                return { success: false, error: 'Account not found' };
            }
            
            const accountName = accountInfo.account_name;
            
            console.log(`[BotQueueHelper] Adding to queue: ${gameName} for ${username} (Account: ${accountName})`);
            
            // Get position BEFORE adding (this will be their position)
            const statusBefore = tokenGeneratorPool.getQueueStatus();
            const position = statusBefore.queueLength + statusBefore.processing + 1;
            
            // Start generation immediately - this adds to the FIFO queue
            const generationPromise = tokenGeneratorPool.generateToken(
                accountName,
                gameName,
                steamId || '',
                username || '',
                ticketId
            );
            
            // Store the promise and job info
            this.activeJobs.set(ticketId, {
                promise: generationPromise,
                gameName,
                accountName,
                username,
                channelId,
                userId,
                addedAt: Date.now(),
                initialPosition: position
            });
            
            // Calculate real ETA based on queue depth
            const busyWorkers = statusBefore.processing || 0;
            const availableWorkers = Math.max(1, 3 - busyWorkers); // Workers that will become free
            const etaMinutes = Math.max(1, Math.ceil(position / 3)); // ~1 min per position with 3 workers
            
            return {
                success: true,
                position: position,
                etaFormatted: `~${etaMinutes} min`,
                queued: true
            };
            
        } catch (error) {
            console.error('[BotQueueHelper] Error adding to queue:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Start watching a job - wait for the generation promise to complete
     * Now includes position update polling!
     */
    startWatching(options) {
        const { ticketId, onPositionUpdate, onProcessing, onComplete, onFailed } = options;
        
        const job = this.activeJobs.get(ticketId);
        if (!job) {
            console.error(`[BotQueueHelper] Job not found for watching: ${ticketId}`);
            if (onFailed) onFailed('Job not found');
            return () => {};
        }
        
        let cancelled = false;
        let lastPosition = job.initialPosition;
        
        // Send initial position
        if (onPositionUpdate) {
            const eta = Math.max(1, Math.ceil(job.initialPosition / 3));
            onPositionUpdate({ 
                position: job.initialPosition, 
                etaFormatted: `~${eta} min`,
                shouldPing: job.initialPosition <= 3
            });
        }
        
        // Poll for position updates every 15 seconds
        const positionInterval = setInterval(() => {
            if (cancelled) return;
            
            const posInfo = tokenGeneratorPool.getPositionForTicket(ticketId);
            
            if (posInfo.status === 'processing') {
                // Job is now being processed
                if (lastPosition !== 0) {
                    lastPosition = 0;
                    if (onPositionUpdate) {
                        onPositionUpdate({ 
                            position: 0, 
                            etaFormatted: 'Processing now...',
                            shouldPing: true,
                            isProcessing: true
                        });
                    }
                    if (onProcessing) {
                        onProcessing();
                    }
                }
            } else if (posInfo.status === 'queued' && posInfo.position !== lastPosition) {
                // Position changed
                lastPosition = posInfo.position;
                const eta = Math.max(1, Math.ceil(posInfo.position / 3));
                if (onPositionUpdate) {
                    onPositionUpdate({ 
                        position: posInfo.position, 
                        etaFormatted: `~${eta} min`,
                        shouldPing: posInfo.position <= 3
                    });
                }
            }
        }, 15000);
        
        job.positionInterval = positionInterval;
        
        // Wait for the generation to complete
        job.promise
            .then(result => {
                if (cancelled) return;
                
                clearInterval(positionInterval);
                
                if (result.success) {
                    // Use filename-based download URL (works with transcriptServer.js route)
                    const baseUrl = process.env.BASE_URL || process.env.DASHBOARD_URL || 'https://pubslounge.xyz';
                    const downloadUrl = `${baseUrl}/api/download/${encodeURIComponent(result.fileName)}`;
                    
                    console.log(`[BotQueueHelper] Download URL: ${downloadUrl}`);
                    
                    this.activeJobs.delete(ticketId);
                    
                    if (onComplete) {
                        onComplete({
                            success: true,
                            fileName: result.fileName,
                            filePath: result.zipPath,
                            downloadUrl: downloadUrl,
                            gameName: job.gameName,
                            duration: result.duration,
                            expiresIn: 60 // Files auto-delete after 60 min
                        });
                    }
                } else {
                    this.activeJobs.delete(ticketId);
                    if (onFailed) onFailed(result.error || 'Generation failed');
                }
            })
            .catch(error => {
                if (cancelled) return;
                
                clearInterval(positionInterval);
                this.activeJobs.delete(ticketId);
                console.error(`[BotQueueHelper] Generation error for ${ticketId}:`, error.message);
                if (onFailed) onFailed(error.message);
            });
        
        // Return cancel function
        return () => {
            cancelled = true;
            clearInterval(positionInterval);
            this.activeJobs.delete(ticketId);
        };
    }
    
    /**
     * Get current queue status
     */
    getQueueStatus() {
        return tokenGeneratorPool.getQueueStatus();
    }
    
    async getStatus() {
        return this.getQueueStatus();
    }
    
    getQueuePosition(ticketId) {
        const posInfo = tokenGeneratorPool.getPositionForTicket(ticketId);
        return posInfo.position;
    }
    
    isJobPending(ticketId) {
        return this.activeJobs.has(ticketId);
    }
    
    cancelJob(ticketId) {
        const job = this.activeJobs.get(ticketId);
        if (job) {
            if (job.positionInterval) {
                clearInterval(job.positionInterval);
            }
            this.activeJobs.delete(ticketId);
            return true;
        }
        return false;
    }
    
    getGeneratedFiles() {
        return tokenGeneratorPool.getGeneratedFiles();
    }
    
    getGeneratedFilePath(fileName) {
        return tokenGeneratorPool.getGeneratedFilePath(fileName);
    }
}

module.exports = BotQueueHelper;
