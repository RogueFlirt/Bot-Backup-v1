// ============================================================================
// QUEUE MANAGER V2 - Dual Queue System
// Separate queues for AI verification and token generation
// ============================================================================

const EventEmitter = require('events');

class QueueManager extends EventEmitter {
    constructor() {
        super();
        
        // ========== VERIFICATION QUEUE ==========
        // Max 3 concurrent AI verifications
        this.verificationQueue = [];
        this.verificationProcessing = 0;
        this.maxConcurrentVerification = 3;
        
        // ========== GENERATION QUEUE ==========
        // Max 3 concurrent token generations
        this.generationQueue = [];
        this.generationProcessing = 0;
        this.maxConcurrentGeneration = 3;
        
        // Stats
        this.completedJobs = 0;
        this.totalDuration = 0;
        
        console.log('[Queue] Manager V2 initialized');
        console.log(`[Queue] Max concurrent verification: ${this.maxConcurrentVerification}`);
        console.log(`[Queue] Max concurrent generation: ${this.maxConcurrentGeneration}`);
    }
    
    // ========== VERIFICATION QUEUE METHODS ==========
    
    canStartVerification() {
        return this.verificationProcessing < this.maxConcurrentVerification;
    }
    
    addToVerificationQueue(ticketId, username) {
        // Check if already in queue
        const existing = this.verificationQueue.find(v => v.ticketId === ticketId);
        if (existing) {
            return this.verificationQueue.indexOf(existing) + 1;
        }
        
        this.verificationQueue.push({
            ticketId,
            username,
            addedAt: Date.now()
        });
        
        const position = this.verificationQueue.length;
        console.log(`[Queue] Verification queued: ${username} (Position #${position})`);
        return position;
    }
    
    isNextInVerificationQueue(ticketId) {
        if (this.verificationQueue.length === 0) return true;
        return this.verificationQueue[0]?.ticketId === ticketId;
    }
    
    removeFromVerificationQueue(ticketId) {
        const index = this.verificationQueue.findIndex(v => v.ticketId === ticketId);
        if (index !== -1) {
            this.verificationQueue.splice(index, 1);
            console.log(`[Queue] Removed from verification queue: ${ticketId}`);
        }
    }
    
    startVerification(ticketId) {
        // Remove from queue if present
        this.removeFromVerificationQueue(ticketId);
        
        this.verificationProcessing++;
        console.log(`[Queue] Verification started: ${ticketId} (${this.verificationProcessing}/${this.maxConcurrentVerification} slots)`);
    }
    
    completeVerification(ticketId) {
        this.verificationProcessing = Math.max(0, this.verificationProcessing - 1);
        console.log(`[Queue] Verification complete: ${ticketId} (${this.verificationProcessing}/${this.maxConcurrentVerification} slots now)`);
        
        // Emit event for anyone waiting
        this.emit('verificationSlotAvailable');
    }
    
    getVerificationQueuePosition(ticketId) {
        const index = this.verificationQueue.findIndex(v => v.ticketId === ticketId);
        return index === -1 ? 0 : index + 1;
    }
    
    // ========== GENERATION QUEUE METHODS ==========
    
    addToQueue(gameName, username, ticketId, callback) {
        const job = {
            gameName,
            username,
            ticketId,
            callback,
            addedAt: Date.now()
        };
        
        this.generationQueue.push(job);
        const position = this.generationQueue.length + this.generationProcessing;
        
        console.log(`[Queue] Generation queued: ${gameName} for ${username} (Position #${position})`);
        
        // Try to process immediately
        this.processNext();
        
        return {
            position,
            estimatedWait: this.getEstimatedWait(position)
        };
    }
    
    processNext() {
        if (this.generationProcessing >= this.maxConcurrentGeneration) {
            return; // At capacity
        }
        
        if (this.generationQueue.length === 0) {
            return; // Nothing to process
        }
        
        const job = this.generationQueue.shift();
        this.generationProcessing++;
        
        console.log(`[Queue] Generation processing: ${job.gameName} for ${job.username} (${this.generationProcessing}/${this.maxConcurrentGeneration} slots)`);
        
        // Execute the callback
        if (job.callback) {
            job.callback(job);
        }
    }
    
    completeJob(ticketId, success = true, duration = 0) {
        this.generationProcessing = Math.max(0, this.generationProcessing - 1);
        
        if (success && duration > 0) {
            this.completedJobs++;
            this.totalDuration += duration;
        }
        
        console.log(`[Queue] Generation ${success ? 'completed' : 'failed'}: ${ticketId} (${this.generationProcessing}/${this.maxConcurrentGeneration} slots now)`);
        
        // Process next job
        this.processNext();
    }
    
    failJob(ticketId, reason) {
        this.completeJob(ticketId, false, 0);
        console.log(`[Queue] Job failed: ${ticketId} - ${reason}`);
    }
    
    removeFromQueue(ticketId) {
        const index = this.generationQueue.findIndex(j => j.ticketId === ticketId);
        if (index !== -1) {
            this.generationQueue.splice(index, 1);
            console.log(`[Queue] Removed from generation queue: ${ticketId}`);
            return true;
        }
        return false;
    }
    
    getPosition(ticketId) {
        const index = this.generationQueue.findIndex(j => j.ticketId === ticketId);
        return index === -1 ? 0 : index + 1;
    }
    
    getEstimatedWait(position) {
        const avgTime = this.completedJobs > 0 
            ? Math.round(this.totalDuration / this.completedJobs / 1000)
            : 22; // Default 22 seconds
        return position * avgTime;
    }
    
    // ========== STATUS METHODS ==========
    
    getStatus() {
        return {
            verification: {
                queued: this.verificationQueue.length,
                processing: this.verificationProcessing,
                maxConcurrent: this.maxConcurrentVerification
            },
            generation: {
                queued: this.generationQueue.length,
                processing: this.generationProcessing,
                maxConcurrent: this.maxConcurrentGeneration,
                completedJobs: this.completedJobs,
                avgDuration: this.completedJobs > 0 
                    ? Math.round(this.totalDuration / this.completedJobs / 1000) 
                    : 0
            }
        };
    }
    
    getQueueInfo() {
        const status = this.getStatus();
        return {
            verificationQueue: status.verification.queued,
            verificationProcessing: status.verification.processing,
            generationQueue: status.generation.queued,
            generationProcessing: status.generation.processing,
            totalPending: status.verification.queued + status.generation.queued,
            totalProcessing: status.verification.processing + status.generation.processing
        };
    }
}

// Singleton instance
const queueManager = new QueueManager();

module.exports = queueManager;
