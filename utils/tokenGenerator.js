// ============================================================================
// TOKEN GENERATOR - Interactive omega.exe Integration
// Handles interactive console prompts from omega.exe
// NOTE: This is the SINGLE generator fallback. Use tokenGeneratorPool for multi-worker
// ============================================================================

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration - Single generator uses worker-1 as fallback
const OMEGA_PATH = process.env.OMEGA_PATH || path.join(__dirname, '..', 'generator', 'worker-1', 'omega.exe');
const OMEGA_DIR = path.dirname(OMEGA_PATH);
const GENERATED_DIR = process.env.GENERATED_DIR || path.join(__dirname, '..', 'generated', 'worker-1');
const AUTO_DELETE_MINUTES = 20;
const AVG_GENERATION_TIME_MS = 30000; // 30 seconds average per generation

// Queue system
const generationQueue = [];
let isProcessing = false;
let currentGeneration = null;
let generationStartTime = null;

// Track files scheduled for deletion
const scheduledDeletions = new Map();

// ============================================================================
// QUEUE STATUS & ETA
// ============================================================================

function getQueueStatus() {
    const queueLength = generationQueue.length;
    const eta = calculateETA(queueLength + (isProcessing ? 1 : 0));
    
    return {
        queueLength,
        isProcessing,
        currentGeneration: currentGeneration ? {
            accountName: currentGeneration.accountName,
            gameName: currentGeneration.gameName,
            startedAt: generationStartTime
        } : null,
        etaMinutes: eta,
        etaText: eta > 0 ? `~${eta} min` : 'Ready'
    };
}

function calculateETA(position) {
    if (position === 0) return 0;
    return Math.ceil((position * AVG_GENERATION_TIME_MS) / 60000);
}

function getQueuePosition() {
    return generationQueue.length + (isProcessing ? 1 : 0);
}

// ============================================================================
// AUTO-DELETE SYSTEM
// ============================================================================

function ensureDirectories() {
    if (!fs.existsSync(GENERATED_DIR)) {
        fs.mkdirSync(GENERATED_DIR, { recursive: true });
    }
}

function scheduleFileDeletion(filePath, minutes = AUTO_DELETE_MINUTES) {
    const deleteTime = minutes * 60 * 1000;
    
    console.log(`[Generator] Scheduling deletion of ${path.basename(filePath)} in ${minutes} minutes`);
    
    const timeout = setTimeout(() => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[Generator] Auto-deleted: ${path.basename(filePath)}`);
            }
            scheduledDeletions.delete(filePath);
        } catch (err) {
            console.error(`[Generator] Auto-delete failed: ${err.message}`);
        }
    }, deleteTime);
    
    scheduledDeletions.set(filePath, timeout);
}

function cancelScheduledDeletion(filePath) {
    if (scheduledDeletions.has(filePath)) {
        clearTimeout(scheduledDeletions.get(filePath));
        scheduledDeletions.delete(filePath);
    }
}

function cleanupOldFiles() {
    ensureDirectories();
    try {
        const files = fs.readdirSync(GENERATED_DIR);
        const now = Date.now();
        const maxAge = AUTO_DELETE_MINUTES * 60 * 1000;
        let deleted = 0;
        
        for (const fileName of files) {
            if (!fileName.endsWith('.7z')) continue;
            
            const filePath = path.join(GENERATED_DIR, fileName);
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
            console.log(`[Generator] Startup cleanup: removed ${deleted} old files`);
        }
    } catch (err) {
        console.error(`[Generator] Cleanup error: ${err.message}`);
    }
}

// Run cleanup on module load
cleanupOldFiles();

// ============================================================================
// QUEUE PROCESSING
// ============================================================================

function processQueue() {
    if (isProcessing || generationQueue.length === 0) return;
    
    isProcessing = true;
    const job = generationQueue.shift();
    currentGeneration = {
        accountName: job.accountName,
        gameName: job.gameName
    };
    generationStartTime = Date.now();
    
    console.log(`[Generator] Processing: ${job.gameName} on ${job.accountName} (${generationQueue.length} remaining in queue)`);
    
    executeOmega(job.accountName, job.gameName, job.steamId)
        .then(result => {
            job.resolve(result);
        })
        .catch(err => {
            job.reject(err);
        })
        .finally(() => {
            isProcessing = false;
            currentGeneration = null;
            generationStartTime = null;
            // Process next in queue after short delay
            setTimeout(processQueue, 1000);
        });
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

function generateToken(accountName, gameName, steamId = '') {
    return new Promise((resolve, reject) => {
        const position = getQueuePosition() + 1;
        const eta = calculateETA(position);
        
        console.log(`[Generator] Queuing: ${gameName} on ${accountName} (Position #${position}, ETA ~${eta}min)`);
        
        generationQueue.push({
            accountName,
            gameName,
            steamId,
            resolve,
            reject,
            queuedAt: Date.now(),
            position
        });
        
        processQueue();
    });
}

// ============================================================================
// INTERACTIVE OMEGA.EXE EXECUTION
// ============================================================================

function executeOmega(accountName, gameName, steamId = '') {
    return new Promise((resolve, reject) => {
        ensureDirectories();
        
        if (!fs.existsSync(OMEGA_PATH)) {
            return reject(new Error(`omega.exe not found at ${OMEGA_PATH}`));
        }
        
        const startTime = Date.now();
        console.log(`[Generator] Starting omega.exe for ${gameName}...`);
        
        // Track state machine
        let state = 'STARTING';
        let outputBuffer = '';
        let zipMonitorStarted = false;
        let processKilled = false;
        
        // Spawn omega.exe
        const omegaProcess = spawn(OMEGA_PATH, [], {
            cwd: OMEGA_DIR,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
        });
        
        // Handle stdout
        omegaProcess.stdout.on('data', (data) => {
            const text = data.toString();
            outputBuffer += text;
            console.log(`[omega] ${text.replace(/\n/g, ' ').trim()}`);
            
            processOutput();
        });
        
        // Handle stderr
        omegaProcess.stderr.on('data', (data) => {
            console.error(`[omega error] ${data.toString().trim()}`);
        });
        
        // Process omega output and respond
        function processOutput() {
            // State: Waiting for "Use saved account?"
            if (state === 'STARTING' && outputBuffer.includes('Use saved account?')) {
                console.log('[Generator] -> Sending: y');
                setTimeout(() => omegaProcess.stdin.write('y\n'), 100);
                state = 'WAITING_ACCOUNT_LIST';
                return;
            }
            
            // State: Parse account list and select
            if (state === 'WAITING_ACCOUNT_LIST' && outputBuffer.includes('Select account')) {
                // Parse account list from buffer
                const accountList = parseNumberedList(outputBuffer);
                console.log(`[Generator] Found ${accountList.length} accounts`);
                
                // Find account by name
                const accountNum = findItemNumber(accountList, accountName);
                
                if (accountNum) {
                    console.log(`[Generator] -> Sending account: ${accountNum} (${accountName})`);
                    setTimeout(() => omegaProcess.stdin.write(accountNum + '\n'), 100);
                    state = 'WAITING_GAME_LIST';
                    outputBuffer = '';
                } else {
                    console.error(`[Generator] Account not found: ${accountName}`);
                    console.log('[Generator] Available accounts:', accountList.map(a => a.name).join(', '));
                    omegaProcess.kill();
                    reject(new Error(`Account "${accountName}" not found in omega.exe`));
                }
                return;
            }
            
            // State: Parse game list and select
            if (state === 'WAITING_GAME_LIST' && outputBuffer.includes('Select a game by number')) {
                // Parse game list from buffer
                const gameList = parseNumberedList(outputBuffer);
                console.log(`[Generator] Found ${gameList.length} games`);
                
                // Find game by name
                const gameNum = findItemNumber(gameList, gameName);
                
                if (gameNum) {
                    console.log(`[Generator] -> Sending game: ${gameNum} (${gameName})`);
                    setTimeout(() => omegaProcess.stdin.write(gameNum + '\n'), 100);
                    state = 'WAITING_STEAM_ID';
                    outputBuffer = '';
                } else {
                    console.error(`[Generator] Game not found: ${gameName}`);
                    // Find similar games to suggest
                    const searchLower = gameName.toLowerCase();
                    const similar = gameList.filter(g => {
                        const gLower = g.name.toLowerCase();
                        return gLower.includes('warhammer') || gLower.includes(searchLower.split(' ')[0]);
                    }).slice(0, 5);
                    console.log('[Generator] Available games sample:', gameList.slice(0, 15).map(g => g.name).join(' | '));
                    if (similar.length > 0) {
                        console.log('[Generator] Similar games:', similar.map(g => g.name).join(' | '));
                    }
                    omegaProcess.kill();
                    reject(new Error(`Game "${gameName}" not found in omega.exe. Check folder_name in dashboard.`));
                }
                return;
            }
            
            // State: Enter Steam ID (or skip)
            if (state === 'WAITING_STEAM_ID' && outputBuffer.includes('Enter your old Steam ID')) {
                if (steamId && steamId.trim()) {
                    console.log(`[Generator] -> Sending Steam ID: ${steamId}`);
                    setTimeout(() => omegaProcess.stdin.write(steamId + '\n'), 100);
                } else {
                    console.log('[Generator] -> Skipping Steam ID (Enter)');
                    setTimeout(() => omegaProcess.stdin.write('\n'), 100);
                }
                state = 'WAITING_ARCHIVE';
                outputBuffer = '';
                return;
            }
            
            // State: Creating archive - start monitoring for ZIP
            if (state === 'WAITING_ARCHIVE' && outputBuffer.includes('Creating archive for') && !zipMonitorStarted) {
                zipMonitorStarted = true;
                
                // Extract archive name from "Creating archive for Stellar Blade 3489700..."
                const match = outputBuffer.match(/Creating archive for (.+?)\.\.\./);
                const archiveName = match ? match[1].trim() : gameName;
                console.log(`[Generator] Archive creating: ${archiveName}`);
                
                state = 'CREATING_ARCHIVE';
                
                // Start monitoring for ZIP file
                waitForZipComplete(archiveName, gameName)
                    .then(zipPath => {
                        console.log(`[Generator] ZIP complete: ${zipPath}`);
                        
                        // Kill omega.exe
                        if (!processKilled) {
                            processKilled = true;
                            omegaProcess.kill();
                        }
                        
                        // Move to generated folder
                        const timestamp = Date.now();
                        const safeGameName = gameName.replace(/[^a-zA-Z0-9-_]/g, '_');
                        const safeAccountName = accountName.replace(/[^a-zA-Z0-9-_]/g, '_');
                        const newFileName = `${safeGameName}_${safeAccountName}_${timestamp}.7z`;
                        const newPath = path.join(GENERATED_DIR, newFileName);
                        
                        try {
                            fs.copyFileSync(zipPath, newPath);
                            // Delete original from omega folder
                            try { fs.unlinkSync(zipPath); } catch (e) {}
                            console.log(`[Generator] Moved to: ${newPath}`);
                            
                            // Schedule auto-deletion
                            scheduleFileDeletion(newPath);
                            
                            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                            
                            resolve({
                                success: true,
                                zipPath: newPath,
                                fileName: newFileName,
                                accountName,
                                gameName,
                                steamId,
                                duration: parseFloat(duration)
                            });
                        } catch (err) {
                            reject(new Error(`Failed to move ZIP: ${err.message}`));
                        }
                    })
                    .catch(err => {
                        if (!processKilled) {
                            processKilled = true;
                            omegaProcess.kill();
                        }
                        reject(err);
                    });
            }
        }
        
        omegaProcess.on('error', (err) => {
            console.error(`[Generator] Process error: ${err.message}`);
            reject(err);
        });
        
        omegaProcess.on('close', (code) => {
            console.log(`[Generator] omega.exe closed with code ${code} (state: ${state})`);
        });
        
        // Timeout after 5 minutes
        setTimeout(() => {
            if (state !== 'CREATING_ARCHIVE' && !processKilled) {
                console.error('[Generator] Timeout - killing process');
                processKilled = true;
                omegaProcess.kill();
                reject(new Error('Generation timed out after 5 minutes'));
            }
        }, 5 * 60 * 1000);
    });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Parse numbered list from omega output
function parseNumberedList(text) {
    const items = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
        // Match lines like "1. Game Name" or "40. Stellar Blade™" or "1. account (type)"
        const match = line.match(/^(\d+)\.\s+(.+)/);
        if (match) {
            const num = match[1];
            let name = match[2].trim();
            // Clean up - extract just the name part (before parentheses)
            const parenMatch = name.match(/^([^(]+)/);
            if (parenMatch) {
                name = parenMatch[1].trim();
            }
            items.push({ number: num, name: name });
        }
    }
    
    return items;
}

// Find item number by name (case-insensitive, supports partial match)
function findItemNumber(items, searchName) {
    const searchLower = searchName.toLowerCase().trim();
    const searchClean = cleanString(searchLower);
    
    // Try exact match first
    for (const item of items) {
        if (item.name.toLowerCase() === searchLower) {
            return item.number;
        }
    }
    
    // Try cleaned exact match
    for (const item of items) {
        if (cleanString(item.name.toLowerCase()) === searchClean) {
            return item.number;
        }
    }
    
    // Try partial match (search name contains item name or vice versa)
    for (const item of items) {
        const itemLower = item.name.toLowerCase();
        const itemClean = cleanString(itemLower);
        if (itemLower.includes(searchLower) || searchLower.includes(itemLower)) {
            return item.number;
        }
        if (itemClean.includes(searchClean) || searchClean.includes(itemClean)) {
            return item.number;
        }
    }
    
    return null;
}

function cleanString(str) {
    return str.replace(/[™®©:'\-]/g, '').replace(/\s+/g, ' ').trim();
}

// Wait for ZIP file to finish writing (size stops changing)
function waitForZipComplete(archiveName, gameName) {
    return new Promise((resolve, reject) => {
        let checkCount = 0;
        let lastSize = -1;
        let stableCount = 0;
        let targetZip = null;
        const maxChecks = 180; // 3 minutes max
        
        console.log(`[Generator] Monitoring for ZIP in: ${OMEGA_DIR}`);
        
        const checkInterval = setInterval(() => {
            checkCount++;
            
            try {
                const files = fs.readdirSync(OMEGA_DIR);
                const zipFiles = files.filter(f => f.endsWith('.7z'));
                
                // Find newest ZIP or one matching game name
                let newestTime = 0;
                
                for (const zipFile of zipFiles) {
                    const zipPath = path.join(OMEGA_DIR, zipFile);
                    const stats = fs.statSync(zipPath);
                    
                    // Check if this ZIP was created recently (within last 5 minutes)
                    const age = Date.now() - stats.mtime.getTime();
                    if (age < 5 * 60 * 1000 && stats.mtime.getTime() > newestTime) {
                        newestTime = stats.mtime.getTime();
                        targetZip = zipPath;
                    }
                }
                
                if (targetZip) {
                    const stats = fs.statSync(targetZip);
                    const currentSize = stats.size;
                    
                    if (checkCount % 5 === 0) { // Log every 5 seconds
                        console.log(`[Generator] ZIP: ${path.basename(targetZip)} = ${(currentSize / 1024 / 1024).toFixed(2)} MB`);
                    }
                    
                    if (currentSize === lastSize && currentSize > 1000) { // At least 1KB
                        stableCount++;
                        // If size hasn't changed for 3 seconds, consider it done
                        if (stableCount >= 3) {
                            clearInterval(checkInterval);
                            resolve(targetZip);
                            return;
                        }
                    } else {
                        stableCount = 0;
                        lastSize = currentSize;
                    }
                }
                
                if (checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                    if (targetZip) {
                        resolve(targetZip);
                    } else {
                        reject(new Error('ZIP file not found after timeout'));
                    }
                }
                
            } catch (err) {
                console.error(`[Generator] ZIP check error: ${err.message}`);
            }
            
        }, 1000);
    });
}

// ============================================================================
// FILE MANAGEMENT
// ============================================================================

function deleteZip(zipPath) {
    try {
        cancelScheduledDeletion(zipPath);
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
            console.log(`[Generator] Deleted: ${zipPath}`);
        }
    } catch (err) {
        console.error(`[Generator] Failed to delete: ${err.message}`);
    }
}

function getGeneratedFiles() {
    ensureDirectories();
    try {
        const files = fs.readdirSync(GENERATED_DIR);
        const now = Date.now();
        const maxAge = AUTO_DELETE_MINUTES * 60 * 1000;
        
        return files.filter(f => f.endsWith('.7z')).map(fileName => {
            const filePath = path.join(GENERATED_DIR, fileName);
            const stats = fs.statSync(filePath);
            const age = now - stats.mtime.getTime();
            const remainingMs = maxAge - age;
            const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
            
            return {
                fileName,
                filePath,
                size: stats.size,
                sizeFormatted: formatBytes(stats.size),
                createdAt: stats.mtime,
                createdAtFormatted: stats.mtime.toLocaleString(),
                autoDeleteIn: remainingMinutes,
                autoDeleteText: remainingMinutes > 0 ? `${remainingMinutes}min` : 'Soon'
            };
        }).sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
        console.error(`[Generator] Error listing files: ${err.message}`);
        return [];
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getGeneratedFilePath(fileName) {
    const filePath = path.join(GENERATED_DIR, fileName);
    if (fs.existsSync(filePath)) {
        return filePath;
    }
    return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    generateToken,
    getQueueStatus,
    getQueuePosition,
    calculateETA,
    deleteZip,
    getGeneratedFiles,
    getGeneratedFilePath,
    OMEGA_PATH,
    OMEGA_DIR,
    GENERATED_DIR
};
