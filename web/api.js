// ============================================================================
// DASHBOARD API - Token Generation & File Serving
// Bot calls these endpoints, all token tracking happens here
// ============================================================================

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Import db module for audit logging
const dbModule = require('../database/db');

// Import queue manager
const queueManager = require('../utils/queueManager');

// Will be set during init
let db = null;
let tokenGenerator = null;
let triggerPanelRefresh = null;

// Middleware to ensure all API responses are JSON (except file downloads)
router.use((req, res, next) => {
    // Don't set JSON header for file downloads
    if (!req.path.startsWith('/download/')) {
        res.setHeader('Content-Type', 'application/json');
    }
    next();
});

// ============================================================================
// DOWNLOAD TOKEN SYSTEM
// Tracks generated files with expiring download links
// ============================================================================

const downloadTokens = new Map();
const DOWNLOAD_EXPIRY_MINUTES = 15;

// Generate a unique download token
function generateDownloadToken() {
    return crypto.randomBytes(16).toString('hex');
}

// Store a file with download token
function storeDownload(filePath, fileName, gameName, gameId, accountId, tokenId, ticketId = null) {
    const downloadToken = generateDownloadToken();
    const expiresAt = Date.now() + (DOWNLOAD_EXPIRY_MINUTES * 60 * 1000);
    
    downloadTokens.set(downloadToken, {
        filePath,
        fileName,
        gameName,
        gameId,
        accountId,
        tokenId,
        ticketId,
        createdAt: Date.now(),
        expiresAt
    });
    
    console.log(`[API] Download token created: ${downloadToken} (expires in ${DOWNLOAD_EXPIRY_MINUTES}min)`);
    
    // Schedule cleanup
    setTimeout(() => {
        if (downloadTokens.has(downloadToken)) {
            const data = downloadTokens.get(downloadToken);
            downloadTokens.delete(downloadToken);
            console.log(`[API] Download token expired: ${downloadToken}`);
            
            // Delete file after token expires (give extra 5 min buffer)
            setTimeout(() => {
                try {
                    if (fs.existsSync(data.filePath)) {
                        fs.unlinkSync(data.filePath);
                        console.log(`[API] Expired file deleted: ${data.fileName}`);
                    }
                } catch (e) {}
            }, 5 * 60 * 1000);
        }
    }, DOWNLOAD_EXPIRY_MINUTES * 60 * 1000);
    
    return downloadToken;
}

// Get download data by token
function getDownload(downloadToken) {
    const data = downloadTokens.get(downloadToken);
    if (!data) return null;
    if (Date.now() > data.expiresAt) {
        downloadTokens.delete(downloadToken);
        return null;
    }
    return data;
}

// ============================================================================
// PROBLEM ACCOUNT TRACKING
// Temporarily skip accounts that fail, auto-retry with different account
// ============================================================================

const problemAccounts = new Map(); // accountId → { failedAt, reason, gameName }
const PROBLEM_ACCOUNT_TIMEOUT = 60 * 60 * 1000; // 1 hour

function markAccountProblem(accountId, accountName, reason, gameName) {
    console.log(`[API] Marking account #${accountId} ${accountName} as problematic: ${reason}`);
    problemAccounts.set(accountId, {
        failedAt: Date.now(),
        reason,
        accountName,
        gameName
    });
    
    // Auto-clear after 1 hour
    setTimeout(() => {
        if (problemAccounts.has(accountId)) {
            console.log(`[API] Clearing problem status for account #${accountId} ${accountName}`);
            problemAccounts.delete(accountId);
        }
    }, PROBLEM_ACCOUNT_TIMEOUT);
}

function getProblemAccountIds() {
    const now = Date.now();
    const ids = [];
    for (const [accountId, info] of problemAccounts) {
        // Double-check it hasn't expired
        if (now - info.failedAt < PROBLEM_ACCOUNT_TIMEOUT) {
            ids.push(accountId);
        }
    }
    return ids;
}

// ============================================================================
// API: Generate Token
// Bot calls this when user needs a token
// ============================================================================

const MAX_RETRY_ATTEMPTS = 3;

router.post('/generate', async (req, res) => {
    try {
        const { game_id, steam_id, ticket_id } = req.body;
        
        // Validate
        if (!game_id) {
            return res.json({ success: false, error: 'game_id is required' });
        }
        
        // Get game details
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(game_id);
        if (!game) {
            return res.json({ success: false, error: 'Game not found' });
        }
        
        const folderName = game.folder_name || game.game_name;
        const steamId = steam_id || '';
        
        // Try up to MAX_RETRY_ATTEMPTS times with different accounts
        const triedAccounts = [];
        let lastError = null;
        
        for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
            // Get problem account IDs to exclude
            const problemIds = [...getProblemAccountIds(), ...triedAccounts];
            
            // Build exclusion clause
            let excludeClause = '';
            const params = [game_id];
            if (problemIds.length > 0) {
                excludeClause = ` AND a.id NOT IN (${problemIds.map(() => '?').join(',')})`;
                params.push(...problemIds);
            }
            
            // Find available token, excluding problem accounts
            const token = db.prepare(`
                SELECT t.*, a.account_name, a.account_number, a.id as acc_id
                FROM tokens t
                JOIN accounts a ON t.account_id = a.id
                WHERE t.game_id = ? AND t.status = 'available' AND a.status = 'active'${excludeClause}
                ORDER BY RANDOM()
                LIMIT 1
            `).get(...params);
            
            if (!token) {
                if (attempt === 1 && triedAccounts.length === 0) {
                    return res.json({ 
                        success: false, 
                        error: `No available tokens for ${game.game_name}`,
                        noTokens: true
                    });
                }
                // No more accounts to try
                break;
            }
            
            triedAccounts.push(token.acc_id);
            
            console.log(`[API] Attempt ${attempt}/${MAX_RETRY_ATTEMPTS}: ${game.game_name} using account #${token.account_number} ${token.account_name} (token ${token.id})`);
            
            try {
                // Generate the file via omega.exe
                const result = await tokenGenerator.generateToken(token.account_name, folderName, steamId, token.account_number);
                
                if (result.success) {
                    // SUCCESS! Mark token as used and return
                    const now = new Date().toISOString();
                    const regenTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                    
                    db.prepare(`
                        UPDATE tokens 
                        SET status = 'used', 
                            used_at = ?, 
                            regenerates_at = ?,
                            used_by_user_id = ?,
                            used_by_username = ?,
                            ticket_id = ?
                        WHERE id = ?
                    `).run(now, regenTime, 'bot', 'Bot Request', ticket_id || null, token.id);
                    
                    console.log(`[API] Token ${token.id} marked USED, regenerates at ${regenTime}`);
                    
                    // Audit log
                    dbModule.logAudit({
                        action: 'generate',
                        category: 'generate',
                        targetType: 'token',
                        targetId: token.id.toString(),
                        targetName: game.game_name,
                        details: JSON.stringify({ 
                            account: token.account_name, 
                            ticket_id, 
                            source: 'bot_api',
                            attempt,
                            retriedAccounts: triedAccounts.length > 1 ? triedAccounts.slice(0, -1) : null
                        }),
                        username: 'Bot Request'
                    });
                    
                    // Create download token
                    const downloadToken = storeDownload(
                        result.zipPath,
                        result.fileName,
                        game.game_name,
                        game.id,
                        token.account_id,
                        token.id,
                        ticket_id
                    );
                    
                    const baseUrl = process.env.DASHBOARD_URL || 'https://pubslounge.xyz';
                    const downloadUrl = `${baseUrl}/api/download/${downloadToken}`;
                    
                    // Trigger panel refresh
                    if (triggerPanelRefresh) {
                        triggerPanelRefresh().catch(err => console.error('[API] Panel refresh failed:', err.message));
                    }
                    
                    return res.json({
                        success: true,
                        downloadUrl,
                        downloadToken,
                        fileName: result.fileName,
                        gameName: game.game_name,
                        accountUsed: token.account_name,
                        tokenId: token.id,
                        expiresIn: DOWNLOAD_EXPIRY_MINUTES,
                        attempts: attempt
                    });
                } else {
                    // Generation failed - mark account as problem and retry
                    lastError = result.error || 'Generation failed';
                    markAccountProblem(token.acc_id, token.account_name, lastError, game.game_name);
                    console.log(`[API] Attempt ${attempt} failed: ${lastError}, trying next account...`);
                }
            } catch (err) {
                // Exception - mark account as problem and retry
                lastError = err.message;
                markAccountProblem(token.acc_id, token.account_name, lastError, game.game_name);
                console.log(`[API] Attempt ${attempt} error: ${lastError}, trying next account...`);
            }
        }
        
        // All attempts failed
        console.log(`[API] All ${MAX_RETRY_ATTEMPTS} attempts failed for ${game.game_name}`);
        return res.json({ 
            success: false, 
            error: lastError || 'All generation attempts failed',
            triedAccounts: triedAccounts.length
        });
        
    } catch (err) {
        console.error('[API] Generate error:', err);
        res.json({ success: false, error: err.message });
    }
});

// ============================================================================
// QUEUE-BASED GENERATION SYSTEM
// Adds requests to queue, processes in order, notifies when complete
// ============================================================================

// Store completed results for retrieval
const completedResults = new Map(); // ticketId → result

// Set up queue event handlers
queueManager.on('process', async ({ queueItem, workerId, workerName }) => {
    console.log(`[Queue] Processing ${queueItem.gameName} for ${queueItem.username}`);
    
    try {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(queueItem.gameId);
        if (!game) {
            queueManager.failJob(queueItem.queueId, 'Game not found');
            return;
        }
        
        const folderName = game.folder_name || game.game_name;
        const steamId = queueItem.steamId || '';
        
        // First, try to find the RESERVED token for this ticket
        let token = db.prepare(`
            SELECT t.*, a.account_name, a.account_number, a.id as acc_id
            FROM tokens t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.reserved_by_ticket = ? AND a.status = 'active'
            LIMIT 1
        `).get(queueItem.ticketId);
        
        // If no reserved token found, find an available one (fallback)
        if (!token) {
            console.log(`[Queue] No reserved token found for ${queueItem.ticketId}, finding available one...`);
            
            // Find available token (exclude problem accounts)
            const problemIds = getProblemAccountIds();
            let excludeClause = '';
            const params = [queueItem.gameId];
            if (problemIds.length > 0) {
                excludeClause = ` AND a.id NOT IN (${problemIds.map(() => '?').join(',')})`;
                params.push(...problemIds);
            }
            
            token = db.prepare(`
                SELECT t.*, a.account_name, a.account_number, a.id as acc_id
                FROM tokens t
                JOIN accounts a ON t.account_id = a.id
                WHERE t.game_id = ? AND t.status = 'available' AND t.reserved_by_ticket IS NULL AND a.status = 'active'${excludeClause}
                ORDER BY RANDOM()
                LIMIT 1
            `).get(...params);
        } else {
            console.log(`[Queue] Using reserved token for ${queueItem.ticketId}`);
        }
        
        if (!token) {
            queueManager.failJob(queueItem.queueId, `No available tokens for ${game.game_name}`);
            return;
        }
        
        console.log(`[Queue] Using account #${token.account_number} ${token.account_name}`);
        
        // Generate the token
        const result = await tokenGenerator.generateToken(
            token.account_name, 
            folderName, 
            steamId, 
            token.account_number
        );
        
        if (!result.success) {
            markAccountProblem(token.acc_id, token.account_name, result.error, game.game_name);
            queueManager.failJob(queueItem.queueId, result.error);
            return;
        }
        
        // Mark token as used
        const now = new Date().toISOString();
        const regenTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        db.prepare(`
            UPDATE tokens 
            SET status = 'used', 
                used_at = ?, 
                regenerates_at = ?,
                used_by_user_id = ?,
                used_by_username = ?,
                ticket_id = ?
            WHERE id = ?
        `).run(now, regenTime, 'bot', 'Bot Request', queueItem.ticketId, token.id);
        
        // Create download token
        const downloadToken = storeDownload(
            result.zipPath,
            result.fileName,
            game.game_name,
            game.id,
            token.account_id,
            token.id,
            queueItem.ticketId
        );
        
        const baseUrl = process.env.DASHBOARD_URL || 'https://pubslounge.xyz';
        const downloadUrl = `${baseUrl}/api/download/${downloadToken}`;
        
        // Store completed result
        completedResults.set(queueItem.ticketId, {
            success: true,
            downloadUrl,
            downloadToken,
            fileName: result.fileName,
            gameName: game.game_name,
            accountUsed: token.account_name,
            tokenId: token.id,
            completedAt: Date.now()
        });
        
        // Clean up old results after 30 minutes
        setTimeout(() => completedResults.delete(queueItem.ticketId), 30 * 60 * 1000);
        
        // Trigger panel refresh
        if (triggerPanelRefresh) {
            triggerPanelRefresh().catch(err => console.error('[API] Panel refresh failed:', err.message));
        }
        
        // Mark job complete
        queueManager.completeJob(queueItem.queueId, completedResults.get(queueItem.ticketId));
        
    } catch (err) {
        console.error(`[Queue] Processing error:`, err);
        queueManager.failJob(queueItem.queueId, err.message);
    }
});

// Store failed results too
queueManager.on('failed', ({ queueItem, error }) => {
    completedResults.set(queueItem.ticketId, {
        success: false,
        error: error,
        completedAt: Date.now()
    });
    // Clean up after 30 minutes
    setTimeout(() => completedResults.delete(queueItem.ticketId), 30 * 60 * 1000);
});

// ============================================================================
// API: Queue Add
// Bot calls this to add a request to the queue
// ============================================================================

router.post('/queue/add', (req, res) => {
    try {
        const { game_id, steam_id, ticket_id, channel_id, user_id, username } = req.body;
        
        if (!game_id || !ticket_id) {
            return res.json({ success: false, error: 'game_id and ticket_id are required' });
        }
        
        // Get game details
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(game_id);
        if (!game) {
            return res.json({ success: false, error: 'Game not found' });
        }
        
        // FIX: Clear any cached completed result for this ticket (for /newtoken)
        if (completedResults.has(ticket_id)) {
            completedResults.delete(ticket_id);
            console.log(`[API] Cleared cached result for ticket ${ticket_id} (re-queue)`);
        }
        
        // Check if already in queue
        const existing = queueManager.getByTicketId(ticket_id);
        if (existing) {
            const position = queueManager.getPosition(existing.queueId);
            const eta = queueManager.calculateEta(position);
            return res.json({
                success: true,
                alreadyQueued: true,
                position,
                eta,
                etaFormatted: queueManager.formatEta(eta),
                queueId: existing.queueId,
                status: existing.status
            });
        }
        
        // Add to queue
        const { position, eta, queueId } = queueManager.addToQueue({
            ticketId: ticket_id,
            channelId: channel_id,
            userId: user_id,
            username: username || 'User',
            gameId: game_id,
            gameName: game.game_name,
            steamId: steam_id || null
        });
        
        console.log(`[API] Added to queue: ${game.game_name} for ${username} (Position #${position})`);
        
        res.json({
            success: true,
            queued: true,
            position,
            eta,
            etaFormatted: queueManager.formatEta(eta),
            queueId,
            gameName: game.game_name,
            queueStatus: queueManager.getStatus()
        });
        
    } catch (err) {
        console.error('[API] Queue add error:', err);
        res.json({ success: false, error: err.message });
    }
});

// ============================================================================
// API: Queue Status
// Bot polls this to check status and get results
// ============================================================================

router.get('/queue/status/:ticketId', (req, res) => {
    try {
        const { ticketId } = req.params;
        
        // Check if completed
        const completed = completedResults.get(ticketId);
        if (completed) {
            return res.json({
                success: true,
                status: completed.success ? 'completed' : 'failed',
                result: completed
            });
        }
        
        // Check if in queue
        const queueItem = queueManager.getByTicketId(ticketId);
        if (!queueItem) {
            return res.json({
                success: true,
                status: 'not_found',
                message: 'Not in queue'
            });
        }
        
        const position = queueManager.getPosition(queueItem.queueId);
        const eta = queueManager.calculateEta(position);
        
        return res.json({
            success: true,
            status: queueItem.status,
            position,
            eta,
            etaFormatted: queueManager.formatEta(eta),
            gameName: queueItem.gameName,
            queueId: queueItem.queueId,
            waitTime: Math.round((Date.now() - queueItem.addedAt) / 1000)
        });
        
    } catch (err) {
        console.error('[API] Queue status error:', err);
        res.json({ success: false, error: err.message });
    }
});

// ============================================================================
// API: Queue Cancel
// Bot calls this to cancel a queued request
// ============================================================================

router.post('/queue/cancel/:ticketId', (req, res) => {
    try {
        const { ticketId } = req.params;
        
        const result = queueManager.cancelByTicketId(ticketId);
        
        res.json({
            success: result.success,
            error: result.error || null
        });
        
    } catch (err) {
        console.error('[API] Queue cancel error:', err);
        res.json({ success: false, error: err.message });
    }
});

// ============================================================================
// API: Queue List
// Dashboard/debug - see full queue
// ============================================================================

router.get('/queue/list', (req, res) => {
    try {
        res.json({
            success: true,
            queue: queueManager.getQueueList(),
            status: queueManager.getStatus()
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ============================================================================
// API: Download File
// Serves the generated file
// ============================================================================

router.get('/download/:downloadToken', (req, res) => {
    try {
        const { downloadToken } = req.params;
        
        const data = getDownload(downloadToken);
        
        if (!data) {
            return res.status(404).send(`
                <html>
                <head><title>Link Expired</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1b1e; color: #fff;">
                    <h1>⏰ Download Link Expired</h1>
                    <p>This download link has expired (valid for ${DOWNLOAD_EXPIRY_MINUTES} minutes).</p>
                    <p>Please request a new token from the Discord ticket.</p>
                </body>
                </html>
            `);
        }
        
        if (!fs.existsSync(data.filePath)) {
            return res.status(404).send('File not found');
        }
        
        console.log(`[API] Download: ${data.fileName}`);
        res.download(data.filePath, data.fileName);
        
    } catch (err) {
        console.error('[API] Download error:', err);
        res.status(500).send('Download failed');
    }
});

// ============================================================================
// API: Resend Same Token
// Staff command - returns same download link (no new generation, no count changes)
// ============================================================================

router.post('/resend', (req, res) => {
    try {
        const { ticket_id, download_token } = req.body;
        
        // Try to find existing download by ticket_id or download_token
        let existingData = null;
        
        if (download_token) {
            existingData = getDownload(download_token);
        }
        
        if (!existingData && ticket_id) {
            // Search by ticket_id
            for (const [token, data] of downloadTokens.entries()) {
                if (data.ticketId === ticket_id) {
                    existingData = data;
                    existingData._token = token;
                    break;
                }
            }
        }
        
        if (!existingData) {
            return res.json({ 
                success: false, 
                error: 'No active download found. The link may have expired. Use /newtoken to generate a fresh one.'
            });
        }
        
        // Return the same download URL
        const baseUrl = process.env.DASHBOARD_URL || 'https://pubslounge.xyz';
        const downloadUrl = `${baseUrl}/api/download/${existingData._token || download_token}`;
        
        // Calculate remaining time
        const remainingMs = existingData.expiresAt - Date.now();
        const remainingMin = Math.max(0, Math.ceil(remainingMs / 60000));
        
        res.json({
            success: true,
            downloadUrl,
            fileName: existingData.fileName,
            gameName: existingData.gameName,
            expiresIn: remainingMin,
            message: 'Same download link (no new token used)'
        });
        
    } catch (err) {
        console.error('[API] Resend error:', err);
        res.json({ success: false, error: err.message });
    }
});

// ============================================================================
// API: New Token
// Staff command - generates completely new token (marks another one used)
// ============================================================================

router.post('/newtoken', async (req, res) => {
    try {
        const { game_id, steam_id, ticket_id, requested_by } = req.body;
        
        // Validate
        if (!game_id) {
            return res.json({ success: false, error: 'game_id is required' });
        }
        
        // Get game details
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(game_id);
        if (!game) {
            return res.json({ success: false, error: 'Game not found' });
        }
        
        // Find ANY available token for this game (any account)
        // Include account_number for worker routing
        const token = db.prepare(`
            SELECT t.*, a.account_name, a.account_number 
            FROM tokens t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.game_id = ? AND t.status = 'available' AND a.status = 'active'
            ORDER BY RANDOM()
            LIMIT 1
        `).get(game_id);
        
        if (!token) {
            return res.json({ 
                success: false, 
                error: `No available tokens for ${game.game_name}`,
                noTokens: true
            });
        }
        
        console.log(`[API] New token requested by ${requested_by || 'staff'}: ${game.game_name} using account #${token.account_number} ${token.account_name}`);
        
        // Use folder_name if set, otherwise game_name
        const folderName = game.folder_name || game.game_name;
        const steamId = steam_id || '';
        
        // Generate the file via omega.exe (pass account_number for worker routing)
        const result = await tokenGenerator.generateToken(token.account_name, folderName, steamId, token.account_number);
        
        if (!result.success) {
            return res.json({ success: false, error: result.error || 'Generation failed' });
        }
        
        // Mark token as USED
        const now = new Date().toISOString();
        const regenTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        console.log(`[API] Updating token ${token.id} with ticket_id: "${ticket_id}" (type: ${typeof ticket_id})`);
        
        db.prepare(`
            UPDATE tokens 
            SET status = 'used', 
                used_at = ?, 
                regenerates_at = ?,
                used_by_user_id = ?,
                used_by_username = ?,
                ticket_id = ?
            WHERE id = ?
        `).run(now, regenTime, requested_by || 'staff', `Staff: ${requested_by || 'unknown'}`, ticket_id || null, token.id);
        
        // Verify the update worked
        const verifyToken = db.prepare('SELECT ticket_id FROM tokens WHERE id = ?').get(token.id);
        console.log(`[API] Verified token ${token.id} ticket_id is now: "${verifyToken?.ticket_id}"`);
        
        console.log(`[API] Token ${token.id} marked USED (new token request)`);
        
        // Create download token
        const downloadToken = storeDownload(
            result.zipPath,
            result.fileName,
            game.game_name,
            game.id,
            token.account_id,
            token.id,
            ticket_id
        );
        
        // Build download URL
        const baseUrl = process.env.DASHBOARD_URL || 'https://pubslounge.xyz';
        const downloadUrl = `${baseUrl}/api/download/${downloadToken}`;
        
        // Trigger panel refresh
        if (triggerPanelRefresh) {
            console.log('[API] Triggering panel refresh from /newtoken...');
            try {
                await triggerPanelRefresh();
                console.log('[API] Panel refresh complete');
            } catch (refreshErr) {
                console.error('[API] Panel refresh failed:', refreshErr.message);
            }
        }
        
        res.json({
            success: true,
            downloadUrl,
            downloadToken,
            fileName: result.fileName,
            gameName: game.game_name,
            accountName: token.account_name,
            tokenId: token.id,
            expiresIn: DOWNLOAD_EXPIRY_MINUTES,
            message: 'New token generated and marked as used'
        });
        
    } catch (err) {
        console.error('[API] New token error:', err);
        res.json({ success: false, error: err.message });
    }
});

// ============================================================================
// API: Queue Status
// Bot can check generation queue
// ============================================================================

router.get('/status', (req, res) => {
    try {
        const queueStatus = tokenGenerator ? tokenGenerator.getQueueStatus() : { queueLength: 0, isProcessing: false };
        res.json(queueStatus);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ============================================================================
// API: Token Availability
// Bot can check if tokens available for a game
// ============================================================================

router.get('/available/:game_id', (req, res) => {
    try {
        const { game_id } = req.params;
        
        const count = db.prepare(`
            SELECT COUNT(*) as count 
            FROM tokens t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.game_id = ? AND t.status = 'available' AND a.status = 'active'
        `).get(game_id);
        
        res.json({
            gameId: game_id,
            available: count?.count || 0
        });
        
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ============================================================================
// INITIALIZATION
// ============================================================================

function init(database, generator, panelRefreshCallback) {
    db = database;
    tokenGenerator = generator;
    triggerPanelRefresh = panelRefreshCallback;
    
    // Link queue manager with token generator
    queueManager.setTokenGenerator(tokenGenerator);
    
    console.log('[API] Token API initialized');
    return router;
}

// Global error handler for API routes - ensures JSON response
router.use((err, req, res, next) => {
    console.error('[API] Unhandled error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

module.exports = { router, init, storeDownload, getDownload, DOWNLOAD_EXPIRY_MINUTES };
