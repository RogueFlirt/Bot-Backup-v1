// EA Bot - Token Generation with TCNO Account Switching
// Location: C:\BartenderBot\bot-v2\EA\ea-bot.js

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Paths
const DB_PATH = path.join(__dirname, '..', 'bartender.db');
const TCNO_PATH = 'C:\\Program Files\\TcNo Account Switcher\\TcNo-Acc-Switcher.exe';
const TOKEN_GEN_PATH = path.join(__dirname, 'token_generator.exe');
const TOKEN_DATA_PATH = path.join(__dirname, 'token_data.txt');

// EA Accounts
const EA_ACCOUNTS = {
    'mitch': 'b96496bb-ab9f-49ec-9250-40840c8d64fa',
    'azam': '4add611f-0a41-481b-82b2-cb6671f11026'
};

// State
let currentAccount = null;
let isProcessing = false;
let tokenGenProcess = null;

// Initialize database
function initDatabase() {
    const db = new Database(DB_PATH);
    
    // Create EA games table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ea_games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_name TEXT NOT NULL,
            content_id TEXT,
            account_name TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Create EA requests table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ea_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            username TEXT,
            game_id INTEGER,
            game_name TEXT,
            input_data TEXT,
            output_data TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY (game_id) REFERENCES ea_games(id)
        )
    `);
    
    // Create EA stats table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ea_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            total_generated INTEGER DEFAULT 0,
            last_generated DATETIME
        )
    `);
    
    // Initialize stats if empty
    const stats = db.prepare('SELECT * FROM ea_stats').get();
    if (!stats) {
        db.prepare('INSERT INTO ea_stats (total_generated) VALUES (0)').run();
    }
    
    db.close();
    console.log('[EA Bot] Database initialized');
}

// Switch EA account using TCNO CLI
function switchAccount(accountName) {
    return new Promise((resolve, reject) => {
        const accountId = EA_ACCOUNTS[accountName];
        if (!accountId) {
            return reject(new Error(`Unknown account: ${accountName}`));
        }
        
        if (currentAccount === accountName) {
            console.log(`[EA Bot] Already on account: ${accountName}`);
            return resolve();
        }
        
        console.log(`[EA Bot] Switching to account: ${accountName}`);
        
        // Run TCNO to switch account
        const tcnoProcess = spawn(TCNO_PATH, [`+ea:${accountId}`], {
            shell: true,
            windowsHide: false
        });
        
        tcnoProcess.on('error', (err) => {
            reject(new Error(`TCNO error: ${err.message}`));
        });
        
        tcnoProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`[EA Bot] TCNO switched to ${accountName}`);
                // Wait for EA app to open
                setTimeout(() => {
                    // Now activate the account with token_generator option 2
                    activateAccount()
                        .then(() => {
                            currentAccount = accountName;
                            resolve();
                        })
                        .catch(reject);
                }, 3000);
            } else {
                reject(new Error(`TCNO exited with code ${code}`));
            }
        });
    });
}

// Activate account using token_generator option 2
function activateAccount() {
    return new Promise((resolve, reject) => {
        console.log('[EA Bot] Activating account (option 2)...');
        
        const process = spawn(TOKEN_GEN_PATH, [], {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let resolved = false;
        
        process.stdout.on('data', (data) => {
            output += data.toString();
            console.log('[EA Token Gen]', data.toString().trim());
        });
        
        process.stderr.on('data', (data) => {
            console.error('[EA Token Gen Error]', data.toString());
        });
        
        // Send option 2 after a short delay
        setTimeout(() => {
            process.stdin.write('2\n');
        }, 1000);
        
        process.on('close', (code) => {
            if (!resolved) {
                resolved = true;
                console.log('[EA Bot] Account activated');
                resolve();
            }
        });
        
        // Timeout after 45 seconds
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                process.kill();
                resolve(); // Continue anyway
            }
        }, 45000);
    });
}

// Generate token using token_generator option 1
function generateToken(inputData) {
    return new Promise((resolve, reject) => {
        console.log('[EA Bot] Starting token generation (option 1)...');
        
        const process = spawn(TOKEN_GEN_PATH, [], {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let captureOutput = false;
        let resolved = false;
        
        process.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            console.log('[EA Token Gen]', text.trim());
            
            // Look for the prompt to paste input
            if (text.includes('Enter') || text.includes('paste') || text.includes(':')) {
                if (!captureOutput) {
                    // Send the input data
                    setTimeout(() => {
                        process.stdin.write(inputData + '\n');
                        captureOutput = true;
                    }, 500);
                }
            }
        });
        
        process.stderr.on('data', (data) => {
            console.error('[EA Token Gen Error]', data.toString());
        });
        
        // Send option 1 after a short delay
        setTimeout(() => {
            process.stdin.write('1\n');
        }, 1000);
        
        process.on('close', (code) => {
            if (!resolved) {
                resolved = true;
                // Extract the token from output
                const tokenOutput = extractTokenFromOutput(output);
                if (tokenOutput) {
                    resolve(tokenOutput);
                } else {
                    reject(new Error('Failed to extract token from output'));
                }
            }
        });
        
        // Timeout after 60 seconds
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                process.kill();
                reject(new Error('Token generation timed out'));
            }
        }, 60000);
    });
}

// Extract token from console output
function extractTokenFromOutput(output) {
    // The output format may vary - adjust based on actual token_generator output
    // Look for the token data after sending input
    const lines = output.split('\n');
    let tokenLines = [];
    let capturing = false;
    
    for (const line of lines) {
        // Adjust these patterns based on actual output format
        if (line.includes('Token:') || line.includes('Result:') || capturing) {
            capturing = true;
            tokenLines.push(line);
        }
    }
    
    if (tokenLines.length > 0) {
        return tokenLines.join('\n').trim();
    }
    
    // If no specific markers found, return everything after the menu
    const menuEnd = output.lastIndexOf('1.');
    if (menuEnd > -1) {
        return output.substring(menuEnd).trim();
    }
    
    return output.trim();
}

// Process a token request
async function processRequest(request) {
    const db = new Database(DB_PATH);
    
    try {
        isProcessing = true;
        
        // Update status to processing
        db.prepare('UPDATE ea_requests SET status = ? WHERE id = ?')
            .run('processing', request.id);
        
        // Get game info
        const game = db.prepare('SELECT * FROM ea_games WHERE id = ?').get(request.game_id);
        if (!game) {
            throw new Error('Game not found');
        }
        
        // Switch to correct account
        await switchAccount(game.account_name);
        
        // Generate token
        const tokenOutput = await generateToken(request.input_data);
        
        // Update request with result
        db.prepare(`
            UPDATE ea_requests 
            SET status = 'completed', output_data = ?, completed_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).run(tokenOutput, request.id);
        
        // Update stats
        db.prepare(`
            UPDATE ea_stats 
            SET total_generated = total_generated + 1, last_generated = CURRENT_TIMESTAMP
        `).run();
        
        console.log(`[EA Bot] Request ${request.id} completed`);
        
        return {
            success: true,
            output: tokenOutput
        };
        
    } catch (error) {
        console.error(`[EA Bot] Request ${request.id} failed:`, error);
        
        db.prepare('UPDATE ea_requests SET status = ?, output_data = ? WHERE id = ?')
            .run('failed', error.message, request.id);
        
        return {
            success: false,
            error: error.message
        };
        
    } finally {
        isProcessing = false;
        db.close();
    }
}

// Queue processor
async function processQueue() {
    if (isProcessing) return;
    
    const db = new Database(DB_PATH);
    const pending = db.prepare(`
        SELECT * FROM ea_requests 
        WHERE status = 'pending' 
        ORDER BY created_at ASC 
        LIMIT 1
    `).get();
    db.close();
    
    if (pending) {
        await processRequest(pending);
    }
}

// Add request to queue
function addRequest(userId, username, gameId, gameName, inputData) {
    const db = new Database(DB_PATH);
    
    const result = db.prepare(`
        INSERT INTO ea_requests (user_id, username, game_id, game_name, input_data, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(userId, username, gameId, gameName, inputData);
    
    const position = db.prepare(`
        SELECT COUNT(*) as count FROM ea_requests WHERE status = 'pending'
    `).get().count;
    
    db.close();
    
    return {
        requestId: result.lastInsertRowid,
        position: position
    };
}

// Get request status
function getRequestStatus(requestId) {
    const db = new Database(DB_PATH);
    const request = db.prepare('SELECT * FROM ea_requests WHERE id = ?').get(requestId);
    db.close();
    return request;
}

// Get all games
function getGames() {
    const db = new Database(DB_PATH);
    const games = db.prepare('SELECT * FROM ea_games WHERE enabled = 1 ORDER BY game_name').all();
    db.close();
    return games;
}

// Get stats
function getStats() {
    const db = new Database(DB_PATH);
    const stats = db.prepare('SELECT * FROM ea_stats').get();
    const pending = db.prepare(`SELECT COUNT(*) as count FROM ea_requests WHERE status = 'pending'`).get();
    const games = db.prepare('SELECT COUNT(*) as count FROM ea_games WHERE enabled = 1').get();
    db.close();
    
    return {
        totalGenerated: stats?.total_generated || 0,
        lastGenerated: stats?.last_generated,
        pendingRequests: pending?.count || 0,
        totalGames: games?.count || 0,
        currentAccount: currentAccount,
        isProcessing: isProcessing
    };
}

// Export for use by main bot
module.exports = {
    initDatabase,
    switchAccount,
    generateToken,
    processRequest,
    processQueue,
    addRequest,
    getRequestStatus,
    getGames,
    getStats,
    EA_ACCOUNTS
};

// Run standalone if executed directly
if (require.main === module) {
    console.log('[EA Bot] Starting standalone mode...');
    initDatabase();
    
    // Start queue processor
    setInterval(processQueue, 5000);
    
    console.log('[EA Bot] Ready. Queue processor running.');
}
