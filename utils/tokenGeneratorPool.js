// ============================================================================
// TOKEN GENERATOR POOL - Simple FIFO Queue System
// Single global queue - workers pull next job when free
// ============================================================================

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const BASE_DIR = path.join(__dirname, '..');
const GENERATOR_BASE = process.env.GENERATOR_BASE || path.join(BASE_DIR, 'generator');
const GENERATED_BASE = process.env.GENERATED_BASE || path.join(BASE_DIR, 'generated');
const AUTO_DELETE_MINUTES = 60;
const AVG_GENERATION_TIME_MS = 60000;
const WORKER_COUNT = 3;

const scheduledDeletions = new Map();

// ============================================================================
// GLOBAL FIFO QUEUE
// ============================================================================

const globalQueue = [];
let jobCounter = 0;

// ============================================================================
// WORKER CLASS
// ============================================================================

class Worker {
    constructor(id) {
        this.id = id;
        this.name = `Worker-${id}`;
        this.generatorDir = path.join(GENERATOR_BASE, `worker-${id}`);
        this.omegaPath = path.join(this.generatorDir, 'omega.exe');
        this.generatedDir = path.join(GENERATED_BASE, `worker-${id}`);
        
        this.busy = false;
        this.currentJob = null;
        this.jobStartTime = null;
        this.totalProcessed = 0;
        this.errors = 0;
        this.lastError = null;
        
        this.ensureDirectories();
        
        if (!fs.existsSync(this.omegaPath)) {
            console.warn(`[${this.name}] WARNING: omega.exe not found at ${this.omegaPath}`);
            this.available = false;
        } else {
            console.log(`[${this.name}] Ready - Generator: ${this.generatorDir}`);
            this.available = true;
        }
    }
    
    ensureDirectories() {
        if (!fs.existsSync(this.generatedDir)) {
            fs.mkdirSync(this.generatedDir, { recursive: true });
        }
    }
    
    isAvailable() {
        return this.available && !this.busy;
    }
    
    async processJob(job) {
        if (this.busy) return false;
        
        this.busy = true;
        this.currentJob = job;
        this.jobStartTime = Date.now();
        
        console.log(`[${this.name}] Processing #${job.position}: ${job.gameName} for ${job.username || 'user'}`);
        
        try {
            const result = await this.executeOmega(job.accountName, job.gameName, job.steamId);
            this.totalProcessed++;
            job.resolve(result);
        } catch (err) {
            this.errors++;
            this.lastError = err.message;
            console.error(`[${this.name}] Error on #${job.position}: ${err.message}`);
            job.reject(err);
        } finally {
            this.busy = false;
            this.currentJob = null;
            this.jobStartTime = null;
            
            // Cooldown before taking next job - let filesystem settle
            console.log(`[${this.name}] Job complete, cooling down 2s before next...`);
            setTimeout(() => {
                processNextInQueue();
            }, 2000);
        }
        
        return true;
    }
    
    getStatus() {
        return {
            id: this.id,
            name: this.name,
            available: this.available,
            busy: this.busy,
            currentJob: this.currentJob ? {
                position: this.currentJob.position,
                gameName: this.currentJob.gameName,
                username: this.currentJob.username,
                startedAt: this.jobStartTime,
                elapsed: this.jobStartTime ? Math.floor((Date.now() - this.jobStartTime) / 1000) : 0
            } : null,
            totalProcessed: this.totalProcessed,
            errors: this.errors
        };
    }

    executeOmega(accountName, gameName, steamId = '') {
        return new Promise((resolve, reject) => {
            this.ensureDirectories();

            if (!fs.existsSync(this.omegaPath)) {
                return reject(new Error(`omega.exe not found at ${this.omegaPath}`));
            }

            const startTime = Date.now();
            console.log(`[${this.name}] Starting omega.exe for ${gameName}...`);

            let state = 'STARTING';
            let outputBuffer = '';
            let archiveMonitorStarted = false;
            let processKilled = false;

            const omegaProcess = spawn(this.omegaPath, [], {
                cwd: this.generatorDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });

            const timeout = setTimeout(() => {
                if (!processKilled) {
                    console.error(`[${this.name}] Timeout - killing process`);
                    processKilled = true;
                    omegaProcess.kill();
                    reject(new Error('Generation timed out after 5 minutes'));
                }
            }, 5 * 60 * 1000);

            const cleanup = () => clearTimeout(timeout);

            omegaProcess.stdout.on('data', (data) => {
                const text = data.toString();
                outputBuffer += text;
                console.log(`[${this.name}] ${text.replace(/\n/g, ' ').trim()}`);
                processOutput();
            });

            omegaProcess.stderr.on('data', (data) => {
                console.error(`[${this.name} error] ${data.toString().trim()}`);
            });

            omegaProcess.on('close', (code) => {
                cleanup();
                console.log(`[${this.name}] omega.exe closed with code ${code} (state: ${state})`);
            });

            omegaProcess.on('error', (err) => {
                cleanup();
                if (!processKilled) {
                    reject(new Error(`omega.exe error: ${err.message}`));
                }
            });

            const processOutput = () => {
                if (state === 'STARTING' && outputBuffer.includes('Use saved account?')) {
                    console.log(`[${this.name}] -> Sending: y`);
                    setTimeout(() => omegaProcess.stdin.write('y\n'), 100);
                    state = 'WAITING_ACCOUNT_LIST';
                    return;
                }

                if (state === 'WAITING_ACCOUNT_LIST' && outputBuffer.includes('Select account')) {
                    const accountList = parseNumberedList(outputBuffer);
                    console.log(`[${this.name}] Found ${accountList.length} accounts`);

                    const accountNum = findItemNumber(accountList, accountName);

                    if (accountNum) {
                        console.log(`[${this.name}] -> Sending account: ${accountNum} (${accountName})`);
                        setTimeout(() => omegaProcess.stdin.write(accountNum + '\n'), 100);
                        state = 'WAITING_GAME_LIST';
                        outputBuffer = '';
                    } else {
                        console.error(`[${this.name}] Account not found: ${accountName}`);
                        omegaProcess.kill();
                        reject(new Error(`Account "${accountName}" not found in omega.exe`));
                    }
                    return;
                }

                if (state === 'WAITING_GAME_LIST' && outputBuffer.includes('Select a game by number')) {
                    const gameList = parseNumberedList(outputBuffer);
                    console.log(`[${this.name}] Found ${gameList.length} games`);

                    const gameNum = findItemNumber(gameList, gameName);

                    if (gameNum) {
                        console.log(`[${this.name}] -> Sending game: ${gameNum} (${gameName})`);
                        setTimeout(() => omegaProcess.stdin.write(gameNum + '\n'), 100);
                        state = 'WAITING_STEAM_ID';
                        outputBuffer = '';
                    } else {
                        console.error(`[${this.name}] Game not found: ${gameName}`);
                        omegaProcess.kill();
                        reject(new Error(`Game "${gameName}" not found in omega.exe. Check folder_name in dashboard.`));
                    }
                    return;
                }

                if (state === 'WAITING_STEAM_ID' && outputBuffer.includes('Enter your old Steam ID')) {
                    if (steamId && steamId.trim()) {
                        console.log(`[${this.name}] -> Sending Steam ID: ${steamId}`);
                        setTimeout(() => omegaProcess.stdin.write(steamId + '\n'), 100);
                    } else {
                        console.log(`[${this.name}] -> Skipping Steam ID (Enter)`);
                        setTimeout(() => omegaProcess.stdin.write('\n'), 100);
                    }
                    state = 'CREATING_ARCHIVE';
                    outputBuffer = '';
                    return;
                }

                if (state === 'CREATING_ARCHIVE') {
                    if (outputBuffer.includes('Creating archive') || outputBuffer.includes('Archive created')) {
                        const archiveMatch = outputBuffer.match(/(?:Creating archive for|Archive created:)\s*([^\n]+)/i);
                        if (archiveMatch && !archiveMonitorStarted) {
                            archiveMonitorStarted = true;
                            let archiveName = archiveMatch[1].trim()
                                .replace('.7z', '')
                                .replace('.zip', '')
                                .replace(/\.+$/, '')
                                .replace(/\s+$/, '');
                            console.log(`[${this.name}] Archive creating: ${archiveName}`);

                            this.monitorForArchive(archiveName, gameName, accountName, startTime)
                                .then(result => {
                                    processKilled = true;
                                    omegaProcess.kill();
                                    resolve(result);
                                })
                                .catch(err => {
                                    processKilled = true;
                                    omegaProcess.kill();
                                    reject(err);
                                });
                        }
                    }
                }
            };
        });
    }
    
    monitorForArchive(archiveName, gameName, accountName, startTime) {
        return new Promise((resolve, reject) => {
            console.log(`[${this.name}] Monitoring: ${this.generatorDir}`);

            let attempts = 0;
            const maxAttempts = 180;
            let lastSize = 0;
            let stableCount = 0;
            let targetFile = null;
            
            const archiveClean = archiveName.replace(/\.+$/, '').trim();
            const archiveLower = archiveClean.toLowerCase();

            const checkForArchive = () => {
                attempts++;

                try {
                    const files = fs.readdirSync(this.generatorDir);
                    const archiveFiles = files.filter(f => f.endsWith('.7z') || f.endsWith('.zip'));
                    
                    let newestTime = 0;
                    
                    for (const archiveFile of archiveFiles) {
                        const archivePath = path.join(this.generatorDir, archiveFile);
                        const stats = fs.statSync(archivePath);
                        
                        const fileLower = archiveFile.toLowerCase();
                        const archiveWords = archiveLower.split(/\s+/);
                        const matchesArchive = archiveWords.some(word => word.length > 2 && fileLower.includes(word));
                        
                        if (!matchesArchive) continue;
                        
                        const age = Date.now() - stats.mtime.getTime();
                        if (age < 5 * 60 * 1000 && stats.mtime.getTime() > newestTime) {
                            newestTime = stats.mtime.getTime();
                            targetFile = archivePath;
                        }
                    }
                    
                    if (targetFile) {
                        const stats = fs.statSync(targetFile);
                        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                        
                        if (attempts % 5 === 0) {
                            console.log(`[${this.name}] Archive: ${path.basename(targetFile)} = ${sizeMB} MB`);
                        }

                        if (stats.size === lastSize && stats.size > 1000) {
                            stableCount++;
                            if (stableCount >= 8) {
                                console.log(`[${this.name}] Archive stable, waiting before move...`);
                                
                                // Wait 3 seconds after file is stable before trying to move
                                setTimeout(() => {
                                    console.log(`[${this.name}] Moving archive: ${targetFile}`);

                                    const timestamp = Date.now();
                                    const safeGameName = gameName.replace(/[^a-zA-Z0-9]/g, '_');
                                    const ext = path.extname(targetFile);
                                    const newFileName = `${safeGameName}_${accountName}_w${this.id}_${timestamp}${ext}`;
                                    const newPath = path.join(this.generatedDir, newFileName);

                                    this.moveWithRetry(targetFile, newPath)
                                        .then(() => {
                                            scheduleFileDeletion(newPath);
                                            resolve({
                                                success: true,
                                                zipPath: newPath,
                                                fileName: newFileName,
                                                workerId: this.id,
                                                duration: Date.now() - startTime
                                            });
                                        })
                                        .catch(err => {
                                            reject(new Error(`Failed to move archive: ${err.message}`));
                                        });
                                }, 3000);
                                return;
                            }
                        } else {
                            stableCount = 0;
                            lastSize = stats.size;
                        }
                    }

                    if (attempts >= maxAttempts) {
                        if (targetFile) {
                            console.log(`[${this.name}] Timeout but archive found, waiting 3s before move...`);
                            
                            setTimeout(() => {
                                const timestamp = Date.now();
                                const safeGameName = gameName.replace(/[^a-zA-Z0-9]/g, '_');
                                const ext = path.extname(targetFile);
                                const newFileName = `${safeGameName}_${accountName}_w${this.id}_${timestamp}${ext}`;
                                const newPath = path.join(this.generatedDir, newFileName);
                                
                                this.moveWithRetry(targetFile, newPath)
                                    .then(() => {
                                        scheduleFileDeletion(newPath);
                                        resolve({
                                            success: true,
                                            zipPath: newPath,
                                            fileName: newFileName,
                                            workerId: this.id,
                                            duration: Date.now() - startTime
                                        });
                                    })
                                    .catch(err => {
                                        reject(new Error(`Failed to move archive: ${err.message}`));
                                    });
                            }, 3000);
                        } else {
                            reject(new Error('Archive file not created within timeout'));
                        }
                        return;
                    }

                    setTimeout(checkForArchive, 1000);
                } catch (err) {
                    if (attempts >= maxAttempts) {
                        reject(new Error(`Archive monitoring error: ${err.message}`));
                    } else {
                        setTimeout(checkForArchive, 1000);
                    }
                }
            };

            setTimeout(checkForArchive, 2000);
        });
    }
    
    async moveWithRetry(source, dest, retries = 10) {
        for (let i = 0; i < retries; i++) {
            try {
                if (i > 0) {
                    // Exponential backoff: 2s, 3s, 4s, 5s, etc.
                    const waitTime = 2000 + (i * 1000);
                    console.log(`[${this.name}] Retry ${i}/${retries} in ${waitTime/1000}s...`);
                    await new Promise(r => setTimeout(r, waitTime));
                }
                fs.renameSync(source, dest);
                console.log(`[${this.name}] Moved to: ${dest}`);
                return true;
            } catch (err) {
                if ((err.code === 'EBUSY' || err.code === 'EPERM') && i < retries - 1) {
                    console.log(`[${this.name}] File busy (${err.code}), will retry...`);
                    continue;
                }
                throw err;
            }
        }
        return false;
    }
}

// ============================================================================
// WORKER POOL
// ============================================================================

class WorkerPool {
    constructor() {
        this.workers = [];
        
        for (let i = 1; i <= WORKER_COUNT; i++) {
            this.workers.push(new Worker(i));
        }
        
        const available = this.workers.filter(w => w.available).length;
        console.log(`[Pool] Initialized ${available}/${WORKER_COUNT} workers ready`);
    }
    
    addToQueue(job) {
        jobCounter++;
        job.position = jobCounter;
        job.queuedAt = Date.now();
        
        globalQueue.push(job);
        
        console.log(`[Queue] Added #${job.position}: ${job.gameName} for ${job.username || 'user'} (Queue: ${globalQueue.length})`);
        
        processNextInQueue();
        
        return job.position;
    }
    
    generateToken(accountName, gameName, steamId = '', username = '', ticketId = '') {
        return new Promise((resolve, reject) => {
            if (!accountName || typeof accountName !== 'string') {
                return reject(new Error('Invalid account name'));
            }
            if (!gameName || typeof gameName !== 'string') {
                return reject(new Error('Invalid game name'));
            }
            
            const job = {
                accountName,
                gameName,
                steamId: steamId || '',
                username: username || '',
                ticketId: ticketId || '',
                resolve,
                reject
            };
            
            this.addToQueue(job);
        });
    }
    
    getAvailableWorker() {
        for (const worker of this.workers) {
            if (worker.isAvailable()) {
                return worker;
            }
        }
        return null;
    }
    
    getQueueStatus() {
        const busyWorkers = this.workers.filter(w => w.busy);
        const availableWorkers = this.workers.filter(w => w.available);
        const freeWorkers = this.workers.filter(w => w.isAvailable());
        
        return {
            queueLength: globalQueue.length,
            processing: busyWorkers.length,
            workersTotal: WORKER_COUNT,
            workersAvailable: availableWorkers.length,
            workersFree: freeWorkers.length,
            workers: this.workers.map(w => w.getStatus()),
            queuePreview: globalQueue.slice(0, 10).map(j => ({
                position: j.position,
                gameName: j.gameName,
                username: j.username,
                waitTime: Math.floor((Date.now() - j.queuedAt) / 1000)
            })),
            etaMinutes: this.calculateETA(globalQueue.length),
            etaText: this.getETAText()
        };
    }
    
    calculateETA(queuePosition) {
        if (queuePosition === 0) return 0;
        const activeWorkers = this.workers.filter(w => w.available).length;
        if (activeWorkers === 0) return 999;
        return Math.ceil((queuePosition * AVG_GENERATION_TIME_MS) / 60000 / activeWorkers);
    }
    
    getETAText() {
        const queueLen = globalQueue.length;
        const processing = this.workers.filter(w => w.busy).length;
        
        if (queueLen === 0 && processing === 0) return 'Ready';
        if (queueLen === 0) return `${processing} processing`;
        
        const eta = this.calculateETA(queueLen);
        return `~${eta} min (${queueLen} in queue, ${processing} processing)`;
    }
    
    getPositionForTicket(ticketId) {
        for (const worker of this.workers) {
            if (worker.currentJob && worker.currentJob.ticketId === ticketId) {
                return { position: 0, status: 'processing', worker: worker.name };
            }
        }
        
        const index = globalQueue.findIndex(j => j.ticketId === ticketId);
        if (index >= 0) {
            return { 
                position: index + 1, 
                status: 'queued',
                eta: this.calculateETA(index + 1)
            };
        }
        
        return { position: -1, status: 'not_found' };
    }
}

// ============================================================================
// QUEUE PROCESSOR
// ============================================================================

function processNextInQueue() {
    if (globalQueue.length === 0) return;
    
    const worker = pool ? pool.getAvailableWorker() : null;
    if (!worker) return;
    
    const job = globalQueue.shift();
    
    console.log(`[Queue] Assigning #${job.position} to ${worker.name} (${globalQueue.length} remaining)`);
    
    worker.processJob(job);
    
    if (globalQueue.length > 0) {
        setTimeout(processNextInQueue, 100);
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseNumberedList(buffer) {
    const list = [];
    const lines = buffer.split('\n').join(' ').split(/\s+/);
    let currentNum = null;
    let currentName = [];

    for (const part of lines) {
        const numMatch = part.match(/^(\d+)\.$/);
        if (numMatch) {
            if (currentNum !== null && currentName.length > 0) {
                list.push({ num: currentNum, name: currentName.join(' ').trim() });
            }
            currentNum = parseInt(numMatch[1]);
            currentName = [];
        } else if (currentNum !== null) {
            if (part.match(/^\d+\.$/)) {
                if (currentName.length > 0) {
                    list.push({ num: currentNum, name: currentName.join(' ').trim() });
                }
                currentNum = parseInt(part);
                currentName = [];
            } else if (part && part !== '>' && !part.includes('Select')) {
                currentName.push(part);
            }
        }
    }
    if (currentNum !== null && currentName.length > 0) {
        list.push({ num: currentNum, name: currentName.join(' ').trim() });
    }

    return list;
}

function findItemNumber(list, targetName) {
    if (!targetName || typeof targetName !== 'string') {
        console.error('[TokenGenerator] findItemNumber called with invalid targetName:', targetName);
        return null;
    }
    
    const targetLower = targetName.toLowerCase()
        .replace(/[:\-_™®©]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // PASS 1: Exact match (highest priority)
    for (const item of list) {
        const itemLower = item.name.toLowerCase()
            .replace(/[:\-_™®©]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (itemLower === targetLower) {
            console.log(`[TokenGenerator] Exact match: "${item.name}" for "${targetName}"`);
            return item.num.toString();
        }
    }
    
    // PASS 2: Target contains item name - find LONGEST match
    // This prevents "Judgment" matching when looking for "Lost Judgment"
    let bestMatch = null;
    let bestMatchLength = 0;
    
    for (const item of list) {
        const itemLower = item.name.toLowerCase()
            .replace(/[:\-_™®©]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        // Only match if item name is contained in target AND it's the longest match so far
        if (targetLower.includes(itemLower) && itemLower.length > bestMatchLength) {
            bestMatch = item;
            bestMatchLength = itemLower.length;
        }
    }
    
    if (bestMatch) {
        console.log(`[TokenGenerator] Best substring match: "${bestMatch.name}" (len ${bestMatchLength}) for "${targetName}"`);
        return bestMatch.num.toString();
    }
    
    // PASS 3: Item contains target name (target is substring of item)
    for (const item of list) {
        const itemLower = item.name.toLowerCase()
            .replace(/[:\-_™®©]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        if (itemLower.includes(targetLower)) {
            console.log(`[TokenGenerator] Item contains target: "${item.name}" for "${targetName}"`);
            return item.num.toString();
        }
    }

    // PASS 4: Word-based fuzzy match (last resort)
    const targetWords = targetLower.split(' ').filter(w => w.length > 2);
    for (const item of list) {
        const itemLower = item.name.toLowerCase();
        const matchCount = targetWords.filter(w => itemLower.includes(w)).length;
        if (matchCount >= targetWords.length * 0.7) {
            console.log(`[TokenGenerator] Fuzzy match (${matchCount}/${targetWords.length} words): "${item.name}" for "${targetName}"`);
            return item.num.toString();
        }
    }

    console.log(`[TokenGenerator] No match found for "${targetName}"`);
    return null;
}

function scheduleFileDeletion(filePath, minutes = AUTO_DELETE_MINUTES) {
    console.log(`[Pool] Scheduling deletion of ${path.basename(filePath)} in ${minutes} minutes`);

    const timeout = setTimeout(() => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[Pool] Auto-deleted: ${path.basename(filePath)}`);
            }
            scheduledDeletions.delete(filePath);
        } catch (err) {
            console.error(`[Pool] Auto-delete failed: ${err.message}`);
        }
    }, minutes * 60 * 1000);

    scheduledDeletions.set(filePath, timeout);
}

function cleanupOldFiles() {
    try {
        for (let i = 1; i <= WORKER_COUNT; i++) {
            const workerDir = path.join(GENERATED_BASE, `worker-${i}`);
            if (!fs.existsSync(workerDir)) continue;
            
            const files = fs.readdirSync(workerDir);
            const now = Date.now();
            const maxAge = AUTO_DELETE_MINUTES * 60 * 1000;
            let deleted = 0;

            for (const fileName of files) {
                if (!fileName.endsWith('.7z') && !fileName.endsWith('.zip')) continue;

                const filePath = path.join(workerDir, fileName);
                const stats = fs.statSync(filePath);
                const age = now - stats.mtime.getTime();

                if (age > maxAge) {
                    fs.unlinkSync(filePath);
                    deleted++;
                } else {
                    const remainingMinutes = Math.ceil((maxAge - age) / 60000);
                    scheduleFileDeletion(filePath, remainingMinutes);
                }
            }

            if (deleted > 0) {
                console.log(`[Pool] Worker-${i} cleanup: removed ${deleted} old files`);
            }
        }
    } catch (err) {
        console.error(`[Pool] Cleanup error: ${err.message}`);
    }
}

function deleteZip(fileName) {
    for (let i = 1; i <= WORKER_COUNT; i++) {
        const filePath = path.join(GENERATED_BASE, `worker-${i}`, fileName);
        if (fs.existsSync(filePath)) {
            if (scheduledDeletions.has(filePath)) {
                clearTimeout(scheduledDeletions.get(filePath));
                scheduledDeletions.delete(filePath);
            }
            fs.unlinkSync(filePath);
            console.log(`[Pool] Deleted: ${fileName}`);
            return true;
        }
    }
    return false;
}

function getGeneratedFiles() {
    const allFiles = [];
    
    for (let i = 1; i <= WORKER_COUNT; i++) {
        const workerDir = path.join(GENERATED_BASE, `worker-${i}`);
        if (!fs.existsSync(workerDir)) continue;
        
        const files = fs.readdirSync(workerDir);
        for (const fileName of files) {
            if (!fileName.endsWith('.7z') && !fileName.endsWith('.zip')) continue;
            
            const filePath = path.join(workerDir, fileName);
            const stats = fs.statSync(filePath);
            allFiles.push({
                fileName,
                filePath,
                workerId: i,
                size: stats.size,
                createdAt: stats.mtime
            });
        }
    }
    
    return allFiles;
}

function getGeneratedFilePath(fileName) {
    for (let i = 1; i <= WORKER_COUNT; i++) {
        const filePath = path.join(GENERATED_BASE, `worker-${i}`, fileName);
        if (fs.existsSync(filePath)) {
            return filePath;
        }
    }
    return null;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

cleanupOldFiles();
const pool = new WorkerPool();

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    generateToken: (accountName, gameName, steamId = '', username = '', ticketId = '') => {
        return pool.generateToken(accountName, gameName, steamId, username, ticketId);
    },
    
    getQueueStatus: () => pool.getQueueStatus(),
    getQueueLength: () => globalQueue.length,
    getPositionForTicket: (ticketId) => pool.getPositionForTicket(ticketId),
    
    getQueuePosition: () => globalQueue.length + pool.workers.filter(w => w.busy).length,
    calculateETA: (position) => pool.calculateETA(position),
    
    deleteZip,
    getGeneratedFiles,
    getGeneratedFilePath,
    
    GENERATOR_BASE,
    GENERATED_BASE,
    WORKER_COUNT,
    
    pool,
    get workers() { return pool.workers; },
    get queue() { return globalQueue; }
};
