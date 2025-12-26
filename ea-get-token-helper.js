// EA Token Refresh Helper
// Location: EA/ea-get-token-helper.js
// 
// This helps extract access tokens from EA Desktop
// Run when you need to refresh tokens

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const EXE_PATH = path.join(__dirname, 'token_generator.exe');
const TCNO_PATH = 'C:\\Program Files\\TcNo Account Switcher\\TcNo-Acc-Switcher.exe';

/**
 * Get access token using the exe
 * @returns {Promise<{success: boolean, token?: string, error?: string}>}
 */
async function getAccessToken() {
    return new Promise((resolve) => {
        if (!fs.existsSync(EXE_PATH)) {
            return resolve({ success: false, error: 'token_generator.exe not found' });
        }
        
        console.log('[EA Token Helper] Starting token_generator.exe...');
        
        const child = spawn(EXE_PATH, [], {
            cwd: path.dirname(EXE_PATH),
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let menuSent = false;
        
        child.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            console.log(text);
            
            // Select option 2 (Force get access token)
            if (!menuSent && text.includes('Your choice:')) {
                menuSent = true;
                setTimeout(() => {
                    child.stdin.write('2\n');
                }, 500);
            }
        });
        
        child.stderr.on('data', (data) => {
            console.error(data.toString());
        });
        
        const timeout = setTimeout(() => {
            child.kill();
            resolve({ success: false, error: 'Timeout' });
        }, 120000);
        
        child.on('close', () => {
            clearTimeout(timeout);
            
            // Look for access token in output
            // It's usually a long JWT-like string starting with eyJ
            const tokenMatch = output.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
            
            if (tokenMatch) {
                resolve({ success: true, token: tokenMatch[0] });
            } else {
                // Try to find any long string that could be a token
                const longMatch = output.match(/[A-Za-z0-9_-]{100,}/g);
                if (longMatch && longMatch.length > 0) {
                    // Return the longest one
                    const longest = longMatch.reduce((a, b) => a.length > b.length ? a : b);
                    resolve({ success: true, token: longest });
                } else {
                    resolve({ success: false, error: 'Could not find token in output' });
                }
            }
        });
    });
}

/**
 * Switch to a different EA account using TCNO
 * @param {string} tcnoId - The TCNO account ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function switchAccount(tcnoId) {
    return new Promise((resolve) => {
        if (!fs.existsSync(TCNO_PATH)) {
            return resolve({ success: false, error: 'TCNO Account Switcher not found' });
        }
        
        console.log(`[EA Token Helper] Switching to account: ${tcnoId}`);
        
        const child = spawn(TCNO_PATH, [`+ea:${tcnoId}`], {
            windowsHide: true
        });
        
        child.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });
        
        child.on('close', (code) => {
            if (code === 0 || code === null) {
                console.log('[EA Token Helper] Account switched, waiting for EA Desktop...');
                // Wait for EA Desktop to switch
                setTimeout(() => {
                    resolve({ success: true });
                }, 10000);
            } else {
                resolve({ success: false, error: `TCNO exited with code ${code}` });
            }
        });
    });
}

/**
 * Get token for a specific account
 * @param {string} accountName - Account name for display
 * @param {string} tcnoId - TCNO ID for switching (optional if already on that account)
 * @returns {Promise<{success: boolean, token?: string, error?: string}>}
 */
async function getTokenForAccount(accountName, tcnoId = null) {
    console.log(`\n========================================`);
    console.log(`Getting token for: ${accountName}`);
    console.log(`========================================\n`);
    
    // Switch account if TCNO ID provided
    if (tcnoId) {
        const switchResult = await switchAccount(tcnoId);
        if (!switchResult.success) {
            return { success: false, error: `Failed to switch account: ${switchResult.error}` };
        }
    }
    
    // Get the token
    const tokenResult = await getAccessToken();
    
    if (tokenResult.success) {
        console.log(`\n✅ Token obtained for ${accountName}!`);
        console.log(`Token (first 50 chars): ${tokenResult.token.substring(0, 50)}...`);
        console.log(`\nUse this command in Discord:`);
        console.log(`/ea-updatetoken ${accountName} "${tokenResult.token}"`);
    }
    
    return tokenResult;
}

// If run directly
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node ea-get-token-helper.js [accountName] [tcnoId]');
        console.log('');
        console.log('Examples:');
        console.log('  node ea-get-token-helper.js mitch');
        console.log('  node ea-get-token-helper.js mitch b96496bb-ab9f-49ec-9250-40840c8d64fa');
        console.log('');
        console.log('If no TCNO ID provided, assumes EA Desktop is already logged into that account.');
        process.exit(0);
    }
    
    const accountName = args[0];
    const tcnoId = args[1] || null;
    
    getTokenForAccount(accountName, tcnoId)
        .then(result => {
            if (!result.success) {
                console.error(`\n❌ Failed: ${result.error}`);
                process.exit(1);
            }
            process.exit(0);
        })
        .catch(err => {
            console.error(`\n❌ Error: ${err.message}`);
            process.exit(1);
        });
}

module.exports = {
    getAccessToken,
    switchAccount,
    getTokenForAccount
};
