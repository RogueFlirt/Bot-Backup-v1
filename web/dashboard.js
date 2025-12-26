// ============================================================================
// BARTENDER BOT - UNIFIED DASHBOARD V3 (SECURED)
// Complete revamp - Steam + Ubisoft + EA + Sigma
// Security: Rate limiting, API keys, Helmet, Input validation, CSRF
// ============================================================================

const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const db = require('../database/db');
const router = express.Router();

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

// API Keys - Store in environment variable in production!
const API_KEYS = (process.env.DASHBOARD_API_KEYS || 'f6fc858c57b246f4e326e6c9775aacd9fa22681165c3be83df13beccb80a18c4').split(',');

// Rate limiting storage (in-memory, use Redis for production clusters)
const rateLimitStore = new Map();
const loginAttempts = new Map();

// Rate limit configuration
const RATE_LIMITS = {
    api: { windowMs: 15 * 60 * 1000, max: 100 },
    login: { windowMs: 60 * 60 * 1000, max: 5 },
    general: { windowMs: 60 * 1000, max: 60 }
};

// Blocked IPs (auto-populated on suspicious activity)
const blockedIPs = new Set();

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (now - data.windowStart > data.windowMs) {
            rateLimitStore.delete(key);
        }
    }
    for (const [key, data] of loginAttempts.entries()) {
        if (now - data.windowStart > RATE_LIMITS.login.windowMs) {
            loginAttempts.delete(key);
        }
    }
}, 5 * 60 * 1000);

function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           req.ip || 
           'unknown';
}

function checkBlockedIP(req, res, next) {
    const ip = getClientIP(req);
    if (blockedIPs.has(ip)) {
        console.log(`[Security] Blocked IP attempted access: ${ip}`);
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
}

function createRateLimiter(type) {
    const config = RATE_LIMITS[type] || RATE_LIMITS.general;
    
    return (req, res, next) => {
        const ip = getClientIP(req);
        const key = `${type}:${ip}`;
        const now = Date.now();
        
        let record = rateLimitStore.get(key);
        
        if (!record || now - record.windowStart > config.windowMs) {
            record = { count: 0, windowStart: now, windowMs: config.windowMs };
        }
        
        record.count++;
        rateLimitStore.set(key, record);
        
        res.setHeader('X-RateLimit-Limit', config.max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, config.max - record.count));
        res.setHeader('X-RateLimit-Reset', new Date(record.windowStart + config.windowMs).toISOString());
        
        if (record.count > config.max) {
            console.log(`[Security] Rate limit exceeded for ${ip} on ${type}`);
            
            if (record.count > config.max * 3) {
                blockedIPs.add(ip);
                console.log(`[Security] IP ${ip} auto-blocked for excessive requests`);
                setTimeout(() => blockedIPs.delete(ip), 24 * 60 * 60 * 1000);
            }
            
            return res.status(429).json({ 
                error: 'Too many requests', 
                retryAfter: Math.ceil((record.windowStart + config.windowMs - now) / 1000) 
            });
        }
        
        next();
    };
}

function loginRateLimiter(req, res, next) {
    const ip = getClientIP(req);
    const now = Date.now();
    
    let record = loginAttempts.get(ip);
    
    if (!record || now - record.windowStart > RATE_LIMITS.login.windowMs) {
        record = { count: 0, windowStart: now };
    }
    
    record.count++;
    loginAttempts.set(ip, record);
    
    if (record.count > RATE_LIMITS.login.max) {
        console.log(`[Security] Login rate limit exceeded for ${ip}`);
        return res.status(429).render('dashboard-v3/login', {
            title: 'Login',
            error: 'Too many login attempts. Please try again later.',
            user: null
        });
    }
    
    next();
}

function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
    }
    
    if (!API_KEYS.includes(apiKey)) {
        const ip = getClientIP(req);
        console.log(`[Security] Invalid API key attempt from ${ip}`);
        return res.status(401).json({ error: 'Invalid API key' });
    }
    
    next();
}

function securityHeaders(req, res, next) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self'");
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
}

function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .trim()
        .substring(0, 10000);
}

function sanitizeBody(req, res, next) {
    if (req.body && typeof req.body === 'object') {
        for (const key in req.body) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = sanitizeInput(req.body[key]);
            }
        }
    }
    next();
}

function generateCSRFToken() {
    return crypto.randomBytes(32).toString('hex');
}

function validateCSRF(req, res, next) {
    if (req.method === 'GET' || req.headers['x-api-key']) {
        return next();
    }
    
    const token = req.body._csrf || req.headers['x-csrf-token'];
    
    if (!token || token !== req.session?.csrfToken) {
        console.log(`[Security] CSRF validation failed for ${getClientIP(req)}`);
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    
    next();
}

const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024,
        files: 5
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.txt', '.json', '.zip', '.rar', '.7z', '.png', '.jpg', '.jpeg', '.gif'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('File type not allowed'));
        }
    }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function hashPassword(password) {
    return crypto.createHash('sha256').update(password + 'bartender_salt').digest('hex');
}

function verifyPassword(password, storedHash) {
    console.log('[Dashboard V3] verifyPassword called');
    console.log('[Dashboard V3] Hash format:', storedHash.includes(':') ? 'salt:hash' : 'simple');
    
    if (!storedHash.includes(':')) {
        const result = storedHash === hashPassword(password);
        console.log('[Dashboard V3] Simple hash match:', result);
        return result;
    }
    
    const [salt, hash] = storedHash.split(':');
    if (salt && hash) {
        const testHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
        const result = testHash === hash;
        console.log('[Dashboard V3] PBKDF2 match:', result);
        return result;
    }
    
    return false;
}

function safeLogAudit(data) {
    try { 
        if (db.logAudit) {
            if (!data.category) data.category = 'dashboard';
            if (!data.username) data.username = 'system';
            db.logAudit(data); 
        }
    } catch (e) { 
        console.error('Audit log error:', e.message); 
    }
}

function formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleString();
}

function safeDbCall(fn, defaultValue = null) {
    try {
        return fn() ?? defaultValue;
    } catch (e) {
        console.error('DB Error:', e.message);
        return defaultValue;
    }
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/dashboard/login');
}

function isAdmin(req, res, next) {
    if (req.session?.user?.role === 'admin') return next();
    res.status(403).render('dashboard-v3/error', { 
        title: 'Access Denied', 
        message: 'Admin access required',
        user: req.session?.user 
    });
}

function isStaff(req, res, next) {
    if (req.session?.user && ['admin', 'staff'].includes(req.session.user.role)) return next();
    res.status(403).render('dashboard-v3/error', { 
        title: 'Access Denied', 
        message: 'Staff access required',
        user: req.session?.user 
    });
}

function canGenerate(req, res, next) {
    if (req.session?.user && ['admin', 'staff', 'bartender'].includes(req.session.user.role)) return next();
    res.status(403).render('dashboard-v3/error', { 
        title: 'Access Denied', 
        message: 'Access denied',
        user: req.session?.user 
    });
}

function addLocals(req, res, next) {
    res.locals.user = req.session?.user || null;
    res.locals.path = req.path;
    res.locals.formatDate = formatDate;
    res.locals.csrfToken = req.session?.csrfToken || '';
    next();
}

router.use(addLocals);

// ============================================================================
// AUTH ROUTES
// ============================================================================

router.get('/login', (req, res) => {
    if (req.session?.user) return res.redirect('/dashboard');
    res.render('dashboard-v3/login', { title: 'Login', error: null, user: null });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    console.log('[Dashboard V3] Login attempt:', username);
    
    try {
        const user = db.getDashboardUser ? db.getDashboardUser(username) : null;
        console.log('[Dashboard V3] User found:', user ? 'YES' : 'NO');
        
        if (!user) {
            console.log('[Dashboard V3] User not found in database');
            return res.render('dashboard-v3/login', { 
                title: 'Login', 
                error: 'Invalid username or password',
                user: null 
            });
        }
        
        const passwordValid = verifyPassword(password, user.password_hash);
        console.log('[Dashboard V3] Password valid:', passwordValid ? 'YES' : 'NO');
        
        if (!passwordValid) {
            return res.render('dashboard-v3/login', { 
                title: 'Login', 
                error: 'Invalid username or password',
                user: null 
            });
        }
        
        if (db.updateDashboardUser) {
            db.updateDashboardUser(user.id, { last_login: new Date().toISOString() });
        }
        
        req.session.user = { id: user.id, username: user.username, role: user.role };
        console.log('[Dashboard V3] Session created, redirecting...');
        req.session.save((err) => {
            if (err) console.error('[Dashboard V3] Session save error:', err);
            res.redirect('/dashboard');
        });
    } catch (e) {
        console.error('Login error:', e);
        res.render('dashboard-v3/login', { 
            title: 'Login', 
            error: 'Login failed. Please try again.',
            user: null 
        });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/dashboard/login');
});

router.get('/change-password', isAuthenticated, (req, res) => {
    res.render('dashboard-v3/change-password', { 
        title: 'Change Password',
        success: null,
        error: null 
    });
});

router.post('/change-password', isAuthenticated, (req, res) => {
    const { current_password, new_password, confirm_password } = req.body;
    
    if (new_password !== confirm_password) {
        return res.render('dashboard-v3/change-password', { 
            title: 'Change Password',
            error: 'New passwords do not match',
            success: null 
        });
    }
    
    try {
        const user = db.getDashboardUserById ? db.getDashboardUserById(req.session.user.id) : null;
        if (!user || !verifyPassword(current_password, user.password_hash)) {
            return res.render('dashboard-v3/change-password', { 
                title: 'Change Password',
                error: 'Current password is incorrect',
                success: null 
            });
        }
        
        if (db.updateDashboardUser) {
            db.updateDashboardUser(user.id, { password_hash: hashPassword(new_password) });
        }
        
        res.render('dashboard-v3/change-password', { 
            title: 'Change Password',
            success: 'Password changed successfully!',
            error: null 
        });
    } catch (e) {
        res.render('dashboard-v3/change-password', { 
            title: 'Change Password',
            error: 'Failed to change password',
            success: null 
        });
    }
});

// ============================================================================
// BOT STATUS & RESTART API
// ============================================================================

const apiRateLimiter = createRateLimiter('api');

router.get('/api/bot-status', apiRateLimiter, isAuthenticated, isStaff, (req, res) => {
    try {
        const { getBotManager } = require('../utils/botManager');
        const botManager = getBotManager();
        const status = botManager.getStatus();
        
        const mem = status.memoryUsage || process.memoryUsage();
        res.json({
            success: true,
            status: {
                online: status.online,
                uptimeFormatted: status.uptimeFormatted,
                memoryFormatted: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
                nodeVersion: status.nodeVersion || process.version,
                platform: status.platform || process.platform,
                pid: process.pid,
                startTime: botManager.startTime,
                canRestart: botManager.canRestart(),
                isRestarting: status.isRestarting
            }
        });
    } catch (e) {
        const mem = process.memoryUsage();
        res.json({
            success: true,
            status: {
                online: true,
                uptimeFormatted: 'N/A',
                memoryFormatted: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
                nodeVersion: process.version,
                platform: process.platform,
                pid: process.pid,
                startTime: Date.now()
            }
        });
    }
});

router.post('/api/bot-restart', apiRateLimiter, validateCSRF, isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { getBotManager } = require('../utils/botManager');
        const botManager = getBotManager();
        
        if (!botManager.canRestart()) {
            return res.json({
                success: false,
                error: `Restart on cooldown. Try again in ${botManager.getCooldownRemainingFormatted()}`
            });
        }
        
        const result = await botManager.restart({
            username: req.session.user.username,
            userId: req.session.user.id
        }, 'dashboard');
        
        safeLogAudit({
            action: 'bot_restart',
            userId: req.session.user.id,
            username: req.session.user.username,
            details: 'Bot restart initiated from dashboard'
        });
        
        res.json(result);
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ============================================================================
// DASHBOARD HOME
// ============================================================================

router.get('/', isAuthenticated, (req, res) => {
    if (req.session.user.role === 'bartender') {
        return res.render('dashboard-v3/bartender-home', {
            title: 'Token Generator'
        });
    }
    
    const stats = {
        steam: { games: 0, available: 0, total: 0 },
        ubisoft: { games: 0, available: 0, total: 0 },
        ea: { games: 0, available: 0, total: 0 },
        sigma: { games: 0 },
        tickets: { open: 0 },
        activations: 0
    };
    
    try {
        const steamGames = db.getAllGames ? db.getAllGames() : [];
        stats.steam.games = steamGames.length;
        steamGames.forEach(g => {
            const avail = db.getAvailableTokenCount ? db.getAvailableTokenCount(g.id) : 0;
            const total = db.getTotalTokenCount ? db.getTotalTokenCount(g.id) : 0;
            stats.steam.available += avail;
            stats.steam.total += total;
        });
        
        const ubiGames = db.getAllUbisoftGames ? db.getAllUbisoftGames() : [];
        stats.ubisoft.games = ubiGames.length;
        ubiGames.forEach(g => {
            const avail = db.getAvailableUbisoftTokenCount ? db.getAvailableUbisoftTokenCount(g.id) : 0;
            const total = db.getTotalUbisoftTokenCount ? db.getTotalUbisoftTokenCount(g.id) : 0;
            stats.ubisoft.available += avail;
            stats.ubisoft.total += total;
        });
        
        const eaGames = db.getAllEAGames ? db.getAllEAGames() : [];
        stats.ea.games = eaGames.length;
        eaGames.forEach(g => {
            const avail = db.getAvailableEATokenCount ? db.getAvailableEATokenCount(g.id) : 0;
            stats.ea.available += avail;
        });
        
        const sigmaGames = db.getSigmaGames ? db.getSigmaGames() : [];
        stats.sigma.games = sigmaGames.length;
        
    } catch (e) {
        console.error('Stats error:', e.message);
    }
    
    let openTickets = [];
    try {
        openTickets = db.getOpenTickets ? db.getOpenTickets() : [];
    } catch (e) {
        console.error('Open tickets error:', e.message);
    }
    stats.tickets.open = openTickets.length;
    
    let recentActivations = [];
    try {
        recentActivations = db.getActivations ? db.getActivations({ limit: 10 }) : [];
    } catch (e) {
        console.error('Activations error:', e.message);
    }
    
    let botStatus = null;
    try {
        const { getBotManager } = require('../utils/botManager');
        const botManager = getBotManager();
        const status = botManager.getStatus();
        
        const mem = status.memoryUsage || process.memoryUsage();
        botStatus = {
            online: status.online,
            uptimeFormatted: status.uptimeFormatted,
            memoryFormatted: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
            nodeVersion: status.nodeVersion || process.version,
            platform: status.platform || process.platform,
            pid: process.pid,
            startTime: botManager.startTime
        };
    } catch (e) {
        console.error('Bot status error:', e.message);
        const mem = process.memoryUsage();
        botStatus = {
            online: true,
            uptimeFormatted: 'N/A',
            memoryFormatted: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
            nodeVersion: process.version,
            platform: process.platform,
            pid: process.pid,
            startTime: Date.now()
        };
    }
    
    res.render('dashboard-v3/home', {
        title: 'Dashboard',
        stats,
        openTickets: openTickets.slice(0, 10),
        recentActivations,
        botStatus
    });
});

// ============================================================================
// LIVE TICKETS
// ============================================================================

router.get('/tickets', isAuthenticated, isStaff, (req, res) => {
    const platform = req.query.platform || 'all';
    const status = req.query.status || 'open';
    
    let tickets = [];
    try {
        if (db.getOpenTickets) {
            tickets = db.getOpenTickets(platform === 'all' ? null : platform);
        }
    } catch (e) {
        console.error('Tickets error:', e.message);
    }
    
    const counts = {
        all: tickets.length,
        steam: tickets.filter(t => t.platform === 'steam').length,
        ubisoft: tickets.filter(t => t.platform === 'ubisoft').length,
        ea: tickets.filter(t => t.platform === 'ea').length
    };
    
    res.render('dashboard-v3/tickets', {
        title: 'Live Tickets',
        tickets,
        counts,
        currentPlatform: platform,
        currentStatus: status
    });
});

// ============================================================================
// STEAM ROUTES
// ============================================================================

router.get('/steam/games', isAuthenticated, isStaff, (req, res) => {
    let games = [];
    try {
        games = db.getAllGames ? db.getAllGames() : [];
        games = games.map(g => ({
            ...g,
            available: db.getAvailableTokenCount ? db.getAvailableTokenCount(g.id) : 0,
            total: db.getTotalTokenCount ? db.getTotalTokenCount(g.id) : 0
        }));
    } catch (e) {
        console.error('Steam games error:', e.message);
    }
    
    res.render('dashboard-v3/steam/games', { title: 'Steam Games', games });
});

router.get('/steam/games/add', isAuthenticated, isStaff, (req, res) => {
    res.render('dashboard-v3/steam/game-form', { title: 'Add Steam Game', game: null, accounts: [] });
});

router.post('/steam/games/add', isAuthenticated, isStaff, (req, res) => {
    try {
        const { game_name, app_id, folder_name, size_gb, panel_type, demand_type, download_links, instructions, cover_url } = req.body;
        if (db.addGame) {
            db.addGame({ game_name, app_id, folder_name, size_gb: parseFloat(size_gb) || null, panel_type, demand_type, download_links, instructions, cover_url });
        }
        safeLogAudit({ action: 'game_add', userId: req.session.user.id, details: `Added Steam game: ${game_name}` });
        res.redirect('/dashboard/steam/games');
    } catch (e) {
        res.render('dashboard-v3/steam/game-form', { title: 'Add Steam Game', game: req.body, accounts: [], error: e.message });
    }
});

router.get('/steam/games/:id/edit', isAuthenticated, isStaff, (req, res) => {
    const game = db.getGame ? db.getGame(req.params.id) : null;
    if (!game) return res.redirect('/dashboard/steam/games');
    res.render('dashboard-v3/steam/game-form', { title: 'Edit Steam Game', game, accounts: [] });
});

router.post('/steam/games/:id/edit', isAuthenticated, isStaff, (req, res) => {
    try {
        const { game_name, app_id, folder_name, size_gb, panel_type, demand_type, download_links, instructions, cover_url, enabled } = req.body;
        if (db.updateGame) {
            db.updateGame(req.params.id, { game_name, app_id, folder_name, size_gb: parseFloat(size_gb) || null, panel_type, demand_type, download_links, instructions, cover_url, enabled: enabled === 'on' ? 1 : 0 });
        }
        res.redirect('/dashboard/steam/games');
    } catch (e) {
        res.redirect('/dashboard/steam/games');
    }
});

router.post('/steam/games/:id/delete', isAuthenticated, isAdmin, (req, res) => {
    try {
        if (db.deleteGame) db.deleteGame(req.params.id);
        safeLogAudit({ action: 'game_delete', userId: req.session.user.id, details: `Deleted Steam game ID: ${req.params.id}` });
    } catch (e) {}
    res.redirect('/dashboard/steam/games');
});

router.get('/steam/accounts', isAuthenticated, isStaff, (req, res) => {
    let accounts = [];
    try {
        accounts = db.getAllAccounts ? db.getAllAccounts() : [];
    } catch (e) {}
    res.render('dashboard-v3/steam/accounts', { title: 'Steam Accounts', accounts });
});

router.post('/steam/accounts/add', isAuthenticated, isStaff, (req, res) => {
    try {
        if (db.addAccount) db.addAccount(req.body);
    } catch (e) {}
    res.redirect('/dashboard/steam/accounts');
});

router.post('/steam/accounts/:id/edit', isAuthenticated, isStaff, (req, res) => {
    try {
        if (db.updateAccount) db.updateAccount(req.params.id, req.body);
    } catch (e) {}
    res.redirect('/dashboard/steam/accounts');
});

router.post('/steam/accounts/:id/delete', isAuthenticated, isAdmin, (req, res) => {
    try {
        if (db.deleteAccount) db.deleteAccount(req.params.id);
    } catch (e) {}
    res.redirect('/dashboard/steam/accounts');
});

router.get('/steam/tokens', isAuthenticated, isStaff, (req, res) => {
    const filters = {
        game: req.query.game || '',
        account: req.query.account || '',
        status: req.query.status || ''
    };
    const page = parseInt(req.query.page) || 1;
    const limit = 100;
    
    let tokens = [];
    let games = [];
    let accounts = [];
    let regenStats = { available: 0, reserved: 0, regenerating: 0, within1h: 0, within6h: 0 };
    let pagination = { page, totalPages: 1, totalCount: 0 };
    
    try {
        games = db.getAllGames ? db.getAllGames() : [];
        accounts = db.getAllAccounts ? db.getAllAccounts() : [];
        console.log(`[Steam Tokens] Loaded ${games.length} games, ${accounts.length} accounts`);
        
        if (db.getTokensFiltered) {
            const result = db.getTokensFiltered(filters, page, limit);
            tokens = result.tokens || [];
            pagination = result.pagination || pagination;
            console.log(`[Steam Tokens] getTokensFiltered returned ${tokens.length} tokens, total: ${pagination.totalCount}`);
        } else if (filters.game && db.getTokensByGame) {
            tokens = db.getTokensByGame(filters.game);
            console.log(`[Steam Tokens] getTokensByGame returned ${tokens.length} tokens`);
        } else if (db.getAllTokens) {
            tokens = db.getAllTokens();
            console.log(`[Steam Tokens] getAllTokens returned ${tokens.length} tokens`);
        }
        
        if (db.getTokenRegenStats) {
            regenStats = db.getTokenRegenStats();
            console.log(`[Steam Tokens] regenStats:`, regenStats);
        } else {
            const now = Date.now();
            tokens.forEach(t => {
                if (t.reserved_by_ticket) {
                    regenStats.reserved++;
                } else if (!t.last_used_at || t.status === 'available') {
                    regenStats.available++;
                } else {
                    regenStats.regenerating++;
                    if (t.regenerates_at) {
                        const diff = new Date(t.regenerates_at).getTime() - now;
                        if (diff <= 60 * 60 * 1000) regenStats.within1h++;
                        else if (diff <= 6 * 60 * 60 * 1000) regenStats.within6h++;
                    }
                }
            });
        }
    } catch (e) { console.error('[Steam Tokens] Error:', e); }
    
    res.render('dashboard-v3/steam/tokens', { 
        title: 'Steam Tokens', 
        tokens, 
        games, 
        accounts,
        filters,
        regenStats,
        pagination,
        selectedGame: filters.game,
        selectedAccount: filters.account,
        selectedStatus: filters.status
    });
});

router.get('/steam/tokens/add', isAuthenticated, isStaff, (req, res) => {
    let games = [];
    let accounts = [];
    try {
        games = db.getAllGames ? db.getAllGames() : [];
        accounts = db.getAllAccounts ? db.getAllAccounts() : [];
    } catch (e) {}
    res.render('dashboard-v3/steam/tokens-add', { title: 'Add Steam Tokens', games, accounts });
});

router.post('/steam/tokens/reset-all', isAuthenticated, isStaff, (req, res) => {
    try {
        if (db.resetAllTokens) db.resetAllTokens();
        safeLogAudit({ action: 'tokens_reset', userId: req.session.user.id, details: 'Reset all Steam tokens' });
    } catch (e) {}
    const { game, status, account } = req.body;
    res.redirect('/dashboard/steam/tokens?success=reset-all&game=' + (game || '') + '&status=' + (status || '') + '&account=' + (account || ''));
});

router.post('/steam/tokens/reset-filtered', isAuthenticated, isStaff, (req, res) => {
    const { game, status, account } = req.body;
    try {
        if (db.resetFilteredTokens) {
            db.resetFilteredTokens({ game, status, account });
        } else if (db.resetAllTokens) {
            db.resetAllTokens();
        }
        safeLogAudit({ action: 'tokens_reset_filtered', userId: req.session.user.id, details: `Filters: game=${game}, status=${status}, account=${account}` });
    } catch (e) {}
    res.redirect('/dashboard/steam/tokens?success=reset-filtered&game=' + (game || '') + '&status=' + (status || '') + '&account=' + (account || ''));
});

router.post('/steam/tokens/use-all', isAuthenticated, isStaff, (req, res) => {
    const { game, status, account } = req.body;
    try {
        if (db.useAllTokens) db.useAllTokens({ game, status, account });
        safeLogAudit({ action: 'tokens_use_all', userId: req.session.user.id, details: 'Marked all tokens as used' });
    } catch (e) {}
    res.redirect('/dashboard/steam/tokens?success=used-all&game=' + (game || '') + '&status=' + (status || '') + '&account=' + (account || ''));
});

router.post('/steam/tokens/release-reserved', isAuthenticated, isStaff, (req, res) => {
    try {
        if (db.releaseReservedTokens) db.releaseReservedTokens();
        safeLogAudit({ action: 'tokens_release_reserved', userId: req.session.user.id, details: 'Released all reserved tokens' });
    } catch (e) {}
    res.redirect('/dashboard/steam/tokens?success=released-reserved');
});

router.post('/steam/tokens/:id/reset', isAuthenticated, isStaff, (req, res) => {
    const { game, status, account } = req.body;
    const tokenId = req.params.id;
    try {
        if (db.resetToken) db.resetToken(tokenId);
    } catch (e) {}
    res.redirect('/dashboard/steam/tokens?success=reset&game=' + (game || '') + '&status=' + (status || '') + '&account=' + (account || ''));
});

router.post('/steam/tokens/:id/use', isAuthenticated, isStaff, (req, res) => {
    const { game, status, account } = req.body;
    const tokenId = req.params.id;
    try {
        if (db.useToken) db.useToken(tokenId);
    } catch (e) {}
    res.redirect('/dashboard/steam/tokens?success=used&game=' + (game || '') + '&status=' + (status || '') + '&account=' + (account || ''));
});

router.post('/steam/tokens/:id/delete', isAuthenticated, isStaff, (req, res) => {
    const { game, status, account } = req.body;
    const tokenId = req.params.id;
    try {
        if (db.deleteToken) db.deleteToken(tokenId);
    } catch (e) {}
    res.redirect('/dashboard/steam/tokens?success=deleted&game=' + (game || '') + '&status=' + (status || '') + '&account=' + (account || ''));
});

router.post('/steam/tokens/add-single-ajax', isAuthenticated, isStaff, (req, res) => {
    const { game_id, account_id, quantity } = req.body;
    
    if (!game_id || !account_id) {
        return res.json({ success: false, error: 'Game and account required' });
    }
    
    let added = 0;
    try {
        const count = parseInt(quantity) || 1;
        for (let i = 0; i < count; i++) {
            if (db.addToken) {
                const result = db.addToken(game_id, null, account_id);
                if (result) added++;
            }
        }
        safeLogAudit({ action: 'tokens_add', userId: req.session.user.id, details: `Added ${added} tokens for game ${game_id} to account ${account_id}` });
    } catch (e) {
        return res.json({ success: false, error: e.message });
    }
    res.json({ success: true, added });
});

router.post('/steam/tokens/bulk-add-game-ajax', isAuthenticated, isStaff, (req, res) => {
    const { game_id, token_count } = req.body;
    if (!game_id) {
        return res.json({ success: false, error: 'Game required' });
    }
    
    let added = 0;
    let accountCount = 0;
    try {
        const accounts = db.getAllAccounts ? db.getAllAccounts() : [];
        const count = parseInt(token_count) || 1;
        
        accounts.forEach(account => {
            for (let i = 0; i < count; i++) {
                if (db.addToken) {
                    db.addToken(game_id, null, account.id);
                    added++;
                }
            }
            accountCount++;
        });
        safeLogAudit({ action: 'tokens_bulk_add_game', userId: req.session.user.id, details: `Added ${added} tokens for game ${game_id} to ${accountCount} accounts` });
    } catch (e) {
        return res.json({ success: false, error: e.message });
    }
    res.json({ success: true, added, accounts: accountCount });
});

router.post('/steam/tokens/bulk-add-account-ajax', isAuthenticated, isStaff, (req, res) => {
    const { account_id } = req.body;
    if (!account_id) {
        return res.json({ success: false, error: 'Account required' });
    }
    
    let added = 0;
    let gameCount = 0;
    try {
        const games = db.getAllGames ? db.getAllGames() : [];
        
        games.forEach(game => {
            if (db.addToken) {
                db.addToken(game.id, null, account_id);
                added++;
                gameCount++;
            }
        });
        safeLogAudit({ action: 'tokens_bulk_add_account', userId: req.session.user.id, details: `Added ${added} tokens for ${gameCount} games to account ${account_id}` });
    } catch (e) {
        return res.json({ success: false, error: e.message });
    }
    res.json({ success: true, added, games: gameCount });
});

router.post('/steam/tokens/delete-game-account-ajax', isAuthenticated, isStaff, (req, res) => {
    const { game_id, account_id } = req.body;
    if (!game_id || !account_id) {
        return res.json({ success: false, error: 'Game and account required' });
    }
    
    let deleted = 0;
    try {
        if (db.deleteTokensByGameAccount) {
            deleted = db.deleteTokensByGameAccount(game_id, account_id);
        }
        safeLogAudit({ action: 'tokens_delete', userId: req.session.user.id, details: `Deleted ${deleted} tokens for game ${game_id} from account ${account_id}` });
    } catch (e) {
        return res.json({ success: false, error: e.message });
    }
    res.json({ success: true, deleted });
});

router.get('/steam/transcripts', isAuthenticated, isStaff, (req, res) => {
    let transcripts = [];
    const search = req.query.search || '';
    try {
        const filters = {};
        if (search) filters.username = search;
        transcripts = db.getTranscripts ? db.getTranscripts(filters) : [];
    } catch (e) {}
    res.render('dashboard-v3/steam/transcripts', { title: 'Steam Transcripts', transcripts, search });
});

router.get('/transcripts/:ticketId', isAuthenticated, isStaff, (req, res) => {
    let transcript = null;
    try {
        transcript = db.getTranscript ? db.getTranscript(req.params.ticketId) : null;
    } catch (e) {}
    
    if (!transcript) {
        return res.render('dashboard-v3/error', { 
            title: 'Transcript Not Found', 
            error: `Transcript for ticket ${req.params.ticketId} not found` 
        });
    }
    
    let messages = [];
    try {
        if (transcript.messages) {
            messages = typeof transcript.messages === 'string' 
                ? JSON.parse(transcript.messages) 
                : transcript.messages;
        }
    } catch (e) {
        messages = [];
    }
    
    res.render('dashboard-v3/transcript-view', { 
        title: `Transcript - ${req.params.ticketId}`, 
        transcript,
        messages
    });
});

router.get('/steam/activations', isAuthenticated, isStaff, (req, res) => {
    let activations = [];
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    try {
        const filters = { platform: 'steam', limit: limit, offset: offset };
        if (search) filters.username = search;
        activations = db.getActivations ? db.getActivations(filters) : [];
    } catch (e) {}
    
    const topGames = db.getTopGames ? db.getTopGames(10) : [];
    const topUsers = db.getTopUsers ? db.getTopUsers(10) : [];
    const totalCount = db.getTotalActivationCount ? db.getTotalActivationCount('steam') : 0;
    const totalPages = Math.ceil(totalCount / limit);
    
    res.render('dashboard-v3/steam/activations', { 
        title: 'Steam Activations', 
        activations, 
        search,
        topGames,
        topUsers,
        totalCount,
        page,
        limit,
        totalPages
    });
});

router.get('/steam/generate', isAuthenticated, canGenerate, (req, res) => {
    let games = [];
    let accounts = [];
    let tokensByGameAccount = {};
    try {
        games = db.getAllGames ? db.getAllGames() : [];
        accounts = db.getAllAccounts ? db.getAllAccounts() : [];
        
        const database = db.getDatabase ? db.getDatabase() : null;
        if (database) {
            games.forEach(g => {
                tokensByGameAccount[g.id] = {};
                accounts.forEach(a => {
                    try {
                        const count = database.prepare(`
                            SELECT COUNT(*) as count FROM tokens 
                            WHERE (game_id = ? OR game_id = ? OR game_id = ?)
                            AND account_id = ? 
                            AND status = 'available' 
                            AND (reserved_by_ticket IS NULL OR reserved_by_ticket = '')
                        `).get(g.id, String(g.id), g.game_id || '', a.id)?.count || 0;
                        tokensByGameAccount[g.id][a.id] = count;
                    } catch (e) {
                        tokensByGameAccount[g.id][a.id] = 0;
                    }
                });
            });
        }
    } catch (e) {}
    res.render('dashboard-v3/steam/generate', { 
        title: 'Generate Steam Tokens', 
        games, 
        accounts, 
        tokensByGameAccount,
        result: null 
    });
});

router.post('/steam/generate', isAuthenticated, canGenerate, async (req, res) => {
    let { game_id, account_id, steam_id } = req.body;
    let result = { success: false, message: 'Failed to generate token' };
    
    try {
        const database = db.getDatabase ? db.getDatabase() : null;
        if (!database) throw new Error('Database not available');
        
        const game = db.getGame ? db.getGame(game_id) : null;
        if (!game) throw new Error('Game not found');
        
        if (account_id === 'any') {
            const token = database.prepare(`
                SELECT t.id, t.account_id FROM tokens t
                WHERE (t.game_id = ? OR t.game_id = ? OR t.game_id = ?)
                AND t.status = 'available' 
                AND (t.reserved_by_ticket IS NULL OR t.reserved_by_ticket = '')
                LIMIT 1
            `).get(game_id, String(game_id), game?.game_id || '');
            
            if (token) {
                account_id = token.account_id;
            } else {
                result = { success: false, message: 'No available tokens for this game' };
                throw new Error('No available tokens');
            }
        }
        
        const token = database.prepare(`
            SELECT t.id, t.account_id, a.account_name, a.account_number FROM tokens t
            LEFT JOIN accounts a ON t.account_id = a.id
            WHERE (t.game_id = ? OR t.game_id = ? OR t.game_id = ?)
            AND t.account_id = ?
            AND t.status = 'available' 
            AND (t.reserved_by_ticket IS NULL OR t.reserved_by_ticket = '')
            LIMIT 1
        `).get(game_id, String(game_id), game?.game_id || '', account_id);
        
        if (!token) {
            result = { success: false, message: 'No available tokens for this game/account combination' };
            throw new Error('No available tokens');
        }
        
        const regenAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const ticketId = steam_id ? `REFILL-${steam_id}` : `MANUAL-${Date.now()}`;
        
        database.prepare(`
            UPDATE tokens 
            SET status = 'used', 
                used_at = datetime('now'), 
                regenerates_at = ?,
                ticket_id = ?,
                used_by_user_id = ?,
                used_by_username = ?
            WHERE id = ?
        `).run(regenAt, ticketId, req.session.user.id, req.session.user.username, token.id);
        
        const accountLabel = token.account_number 
            ? `#${token.account_number} - ${token.account_name}` 
            : token.account_name;
        
        result = { 
            success: true, 
            message: `Token generated from ${accountLabel} for ${game.game_name}${steam_id ? ` (Refill: ${steam_id})` : ''}` 
        };
        
        safeLogAudit({ 
            action: 'token_generate', 
            userId: req.session.user.id, 
            username: req.session.user.username,
            details: `Generated token for ${game.game_name} from account ${accountLabel}${steam_id ? ` (Steam ID: ${steam_id})` : ''}` 
        });
        
    } catch (e) {
        if (!result.message || result.message === 'Failed to generate token') {
            result = { success: false, message: e.message };
        }
    }
    
    let games = [];
    let accounts = [];
    let tokensByGameAccount = {};
    try {
        games = db.getAllGames ? db.getAllGames() : [];
        accounts = db.getAllAccounts ? db.getAllAccounts() : [];
        
        const database = db.getDatabase ? db.getDatabase() : null;
        if (database) {
            games.forEach(g => {
                tokensByGameAccount[g.id] = {};
                accounts.forEach(a => {
                    try {
                        const count = database.prepare(`
                            SELECT COUNT(*) as count FROM tokens 
                            WHERE (game_id = ? OR game_id = ? OR game_id = ?)
                            AND account_id = ? 
                            AND status = 'available' 
                            AND (reserved_by_ticket IS NULL OR reserved_by_ticket = '')
                        `).get(g.id, String(g.id), g.game_id || '', a.id)?.count || 0;
                        tokensByGameAccount[g.id][a.id] = count;
                    } catch (e) {
                        tokensByGameAccount[g.id][a.id] = 0;
                    }
                });
            });
        }
    } catch (e) {}
    
    res.render('dashboard-v3/steam/generate', { 
        title: 'Generate Steam Tokens', 
        games, 
        accounts, 
        tokensByGameAccount,
        result 
    });
});

// ============================================================================
// STEAM TOKEN GENERATION API
// ============================================================================

const steamGenerationJobs = new Map();
let jobIdCounter = 0;

let tokenGeneratorPool = null;
try {
    tokenGeneratorPool = require('../utils/tokenGeneratorPool');
    console.log('[Dashboard] Token generator pool loaded');
} catch (e) {
    console.warn('[Dashboard] Token generator pool not available:', e.message);
}

router.get('/api/steam/generator-status', isAuthenticated, canGenerate, (req, res) => {
    try {
        if (!tokenGeneratorPool) {
            return res.json({ queueLength: 0, workersActive: 0, etaMinutes: 0, available: false });
        }
        const status = tokenGeneratorPool.getQueueStatus();
        res.json({
            queueLength: status.queueLength || 0,
            workersActive: status.workersActive || status.activeWorkers || 0,
            etaMinutes: status.etaMinutes || Math.ceil((status.queueLength || 0) * 1),
            available: true
        });
    } catch (e) {
        res.json({ queueLength: 0, workersActive: 0, etaMinutes: 0, available: false, error: e.message });
    }
});

router.post('/api/steam/generate', isAuthenticated, canGenerate, async (req, res) => {
    let { game_id, game_name, account_id, account_name, steam_id } = req.body;
    
    if (!game_name) return res.json({ success: false, error: 'Game name required' });
    if (!tokenGeneratorPool) return res.json({ success: false, error: 'Token generator not available on this server' });
    
    if (account_id === 'any' || account_name === 'any') {
        try {
            const database = db.getDatabase ? db.getDatabase() : null;
            if (database && game_id) {
                const token = database.prepare(`
                    SELECT t.account_id, a.account_name 
                    FROM tokens t
                    LEFT JOIN accounts a ON t.account_id = a.id
                    WHERE (t.game_id = ? OR t.game_id = ?)
                    AND t.status = 'available' 
                    AND (t.reserved_by_ticket IS NULL OR t.reserved_by_ticket = '')
                    LIMIT 1
                `).get(game_id, String(game_id));
                
                if (token) {
                    account_id = token.account_id;
                    account_name = token.account_name;
                } else {
                    const accounts = db.getAllAccounts ? db.getAllAccounts() : [];
                    if (accounts.length > 0) {
                        account_id = accounts[0].id;
                        account_name = accounts[0].account_name;
                    } else {
                        return res.json({ success: false, error: 'No accounts available' });
                    }
                }
            }
        } catch (e) {
            return res.json({ success: false, error: 'Failed to find available account' });
        }
    }
    
    if (!account_name) return res.json({ success: false, error: 'Account name required' });
    
    const jobId = ++jobIdCounter;
    const job = {
        id: jobId,
        gameName: game_name,
        accountName: account_name,
        steamId: steam_id || '',
        username: req.session.user.username,
        status: 'queued',
        createdAt: Date.now(),
        result: null,
        error: null
    };
    
    steamGenerationJobs.set(jobId, job);
    
    tokenGeneratorPool.generateToken(account_name, game_name, steam_id || '', req.session.user.username, `DASH-${jobId}`)
        .then(result => {
            job.status = 'complete';
            job.result = {
                success: true,
                zipName: result.fileName,
                zipPath: result.zipPath,
                zipSize: result.zipPath && fs.existsSync(result.zipPath) ? fs.statSync(result.zipPath).size : 0,
                workerId: result.workerId,
                generationTime: Math.round((result.duration || 0) / 1000),
                game: game_name,
                account: account_name
            };
            safeLogAudit({
                action: 'steam_token_generate',
                userId: req.session.user.id,
                username: req.session.user.username,
                details: `Generated Steam token for ${game_name} on ${account_name}`
            });
        })
        .catch(err => {
            job.status = 'failed';
            job.error = err.message;
        });
    
    res.json({ success: true, jobId });
});

router.get('/api/steam/job-status/:jobId', isAuthenticated, canGenerate, (req, res) => {
    const jobId = parseInt(req.params.jobId);
    const job = steamGenerationJobs.get(jobId);
    
    if (!job) return res.json({ status: 'not_found' });
    
    if (job.status === 'queued' && tokenGeneratorPool) {
        const queueStatus = tokenGeneratorPool.getQueueStatus();
        const position = tokenGeneratorPool.getPositionForTicket ? 
            tokenGeneratorPool.getPositionForTicket(`DASH-${jobId}`) : null;
        
        if (queueStatus.workers) {
            for (const worker of queueStatus.workers) {
                if (worker.currentJob && worker.currentJob.ticketId === `DASH-${jobId}`) {
                    job.status = 'processing';
                    break;
                }
            }
        }
        
        return res.json({
            status: job.status,
            position: position || queueStatus.queueLength,
            eta: Math.ceil((position || queueStatus.queueLength) * 1)
        });
    }
    
    if (job.status === 'complete') return res.json({ status: 'complete', result: job.result });
    if (job.status === 'failed') return res.json({ status: 'failed', error: job.error });
    res.json({ status: job.status });
});

router.post('/api/steam/cancel-job/:jobId', isAuthenticated, canGenerate, (req, res) => {
    steamGenerationJobs.delete(parseInt(req.params.jobId));
    res.json({ success: true });
});

router.get('/api/steam/generated-files', isAuthenticated, canGenerate, (req, res) => {
    try {
        if (!tokenGeneratorPool) return res.json({ files: [] });
        
        const files = tokenGeneratorPool.getGeneratedFiles();
        const now = Date.now();
        const AUTO_DELETE_MINUTES = 60;
        
        const filesWithMeta = files.map(f => ({
            fileName: f.fileName,
            size: f.size,
            createdAt: f.createdAt,
            autoDeleteMin: Math.max(0, Math.ceil((AUTO_DELETE_MINUTES * 60 * 1000 - (now - new Date(f.createdAt).getTime())) / 60000))
        }));
        
        res.json({ files: filesWithMeta });
    } catch (e) {
        res.json({ files: [], error: e.message });
    }
});

router.get('/api/steam/download/:fileName', isAuthenticated, canGenerate, (req, res) => {
    try {
        if (!tokenGeneratorPool) return res.status(404).send('Generator not available');
        
        const fileName = decodeURIComponent(req.params.fileName);
        const filePath = tokenGeneratorPool.getGeneratedFilePath(fileName);
        
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }
        
        res.download(filePath, fileName);
    } catch (e) {
        res.status(500).send('Download failed: ' + e.message);
    }
});

router.post('/api/steam/delete-file/:fileName', isAuthenticated, isStaff, (req, res) => {
    try {
        if (!tokenGeneratorPool) return res.json({ success: false, error: 'Generator not available' });
        const deleted = tokenGeneratorPool.deleteZip(req.params.fileName);
        res.json({ success: deleted });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

setInterval(() => {
    const cutoff = Date.now() - (30 * 60 * 1000);
    for (const [jobId, job] of steamGenerationJobs.entries()) {
        if (job.createdAt < cutoff && (job.status === 'complete' || job.status === 'failed')) {
            steamGenerationJobs.delete(jobId);
        }
    }
}, 5 * 60 * 1000);

// ============================================================================
// UBISOFT ROUTES
// ============================================================================

router.get('/ubisoft/games', isAuthenticated, isStaff, (req, res) => {
    let games = [];
    try {
        games = db.getAllUbisoftGames ? db.getAllUbisoftGames() : [];
        games = games.map(g => ({
            ...g,
            available: db.getAvailableUbisoftTokenCount ? db.getAvailableUbisoftTokenCount(g.id) : 0,
            total: db.getTotalUbisoftTokenCount ? db.getTotalUbisoftTokenCount(g.id) : 0
        }));
    } catch (e) {}
    res.render('dashboard-v3/ubisoft/games', { title: 'Ubisoft Games', games });
});

router.get('/ubisoft/games/add', isAuthenticated, isStaff, (req, res) => {
    res.render('dashboard-v3/ubisoft/game-form', { title: 'Add Ubisoft Game', game: null });
});

router.post('/ubisoft/games/add', isAuthenticated, isStaff, (req, res) => {
    try { if (db.addUbisoftGame) db.addUbisoftGame(req.body); } catch (e) {}
    res.redirect('/dashboard/ubisoft/games');
});

router.get('/ubisoft/games/:id/edit', isAuthenticated, isStaff, (req, res) => {
    const game = db.getUbisoftGame ? db.getUbisoftGame(req.params.id) : null;
    if (!game) return res.redirect('/dashboard/ubisoft/games');
    res.render('dashboard-v3/ubisoft/game-form', { title: 'Edit Ubisoft Game', game });
});

router.post('/ubisoft/games/:id/edit', isAuthenticated, isStaff, (req, res) => {
    try { if (db.updateUbisoftGame) db.updateUbisoftGame(req.params.id, req.body); } catch (e) {}
    res.redirect('/dashboard/ubisoft/games');
});

router.post('/ubisoft/games/:id/delete', isAuthenticated, isAdmin, (req, res) => {
    try { if (db.deleteUbisoftGame) db.deleteUbisoftGame(req.params.id); } catch (e) {}
    res.redirect('/dashboard/ubisoft/games');
});

router.post('/ubisoft/games/:id/highdemand', isAuthenticated, isStaff, (req, res) => {
    try { 
        if (db.toggleUbisoftGameHighDemand) {
            db.toggleUbisoftGameHighDemand(req.params.id);
        } else {
            // Inline toggle
            const dbInstance = db.getDb ? db.getDb() : null;
            if (dbInstance) {
                const game = dbInstance.prepare('SELECT demand_type FROM ubisoft_games WHERE id = ?').get(req.params.id);
                const newDemand = game?.demand_type === 'high' ? 'normal' : 'high';
                dbInstance.prepare('UPDATE ubisoft_games SET demand_type = ? WHERE id = ?').run(newDemand, req.params.id);
            }
        }
    } catch (e) {
        console.error('[Ubisoft] Error toggling high demand:', e.message);
    }
    res.redirect('/dashboard/ubisoft/games');
});

router.get('/ubisoft/accounts', isAuthenticated, isStaff, (req, res) => {
    let accounts = [];
    try { accounts = db.getAllUbisoftAccounts ? db.getAllUbisoftAccounts() : []; } catch (e) {}
    res.render('dashboard-v3/ubisoft/accounts', { title: 'Ubisoft Accounts', accounts });
});

router.post('/ubisoft/accounts/add', isAuthenticated, isStaff, (req, res) => {
    try { 
        const { account_name, email, password } = req.body;
        if (db.addUbisoftAccount) db.addUbisoftAccount(account_name, email, password); 
    } catch (e) {
        console.error('[Ubisoft] Error adding account:', e.message);
    }
    res.redirect('/dashboard/ubisoft/accounts');
});

router.post('/ubisoft/accounts/:id/edit', isAuthenticated, isStaff, (req, res) => {
    try { if (db.updateUbisoftAccount) db.updateUbisoftAccount(req.params.id, req.body); } catch (e) {}
    res.redirect('/dashboard/ubisoft/accounts');
});

router.post('/ubisoft/accounts/:id/delete', isAuthenticated, isAdmin, (req, res) => {
    try { if (db.deleteUbisoftAccount) db.deleteUbisoftAccount(req.params.id); } catch (e) {}
    res.redirect('/dashboard/ubisoft/accounts');
});

router.get('/ubisoft/tokens', isAuthenticated, isStaff, (req, res) => {
    const gameId = req.query.game || '';
    let tokens = [];
    let games = [];
    try {
        games = db.getAllUbisoftGames ? db.getAllUbisoftGames() : [];
        tokens = db.getAllUbisoftTokens ? db.getAllUbisoftTokens() : [];
        if (gameId) tokens = tokens.filter(t => t.game_id == gameId);
    } catch (e) {}
    res.render('dashboard-v3/ubisoft/tokens', { title: 'Ubisoft Tokens', tokens, games, selectedGame: gameId });
});

router.get('/ubisoft/tokens/add', isAuthenticated, isStaff, (req, res) => {
    let games = [];
    let accounts = [];
    try { 
        games = db.getAllUbisoftGames ? db.getAllUbisoftGames() : []; 
        accounts = db.getAllUbisoftAccounts ? db.getAllUbisoftAccounts() : [];
    } catch (e) {}
    res.render('dashboard-v3/ubisoft/tokens-add', { title: 'Add Ubisoft Tokens', games, accounts });
});

router.post('/ubisoft/tokens/add', isAuthenticated, isStaff, (req, res) => {
    try {
        const { game, account, quantity } = req.body;
        
        if (!game || !account || !quantity) {
            return res.json({ success: false, error: 'Missing required fields' });
        }
        
        const count = parseInt(quantity) || 1;
        
        // Use bulk add if available, otherwise add one by one
        if (db.addUbisoftTokensBulk) {
            db.addUbisoftTokensBulk(account, game, count);
        } else if (db.addUbisoftToken) {
            for (let i = 0; i < count; i++) {
                db.addUbisoftToken(account, game);
            }
        }
        
        res.json({ success: true, count });
    } catch (e) {
        console.error('[Ubisoft] Error adding tokens:', e.message);
        res.json({ success: false, error: e.message });
    }
});

router.post('/ubisoft/tokens/:id/reset', isAuthenticated, isStaff, (req, res) => {
    try { 
        if (db.resetUbisoftToken) {
            db.resetUbisoftToken(req.params.id);
        } else {
            // Inline reset if db function doesn't exist
            const dbInstance = db.getDb ? db.getDb() : null;
            if (dbInstance) {
                dbInstance.prepare(`
                    UPDATE ubisoft_tokens 
                    SET reserved_by_ticket = NULL, 
                        last_used_at = NULL, 
                        used_by_user_id = NULL, 
                        used_by_username = NULL,
                        used_in_ticket = NULL
                    WHERE id = ?
                `).run(req.params.id);
            }
        }
    } catch (e) {
        console.error('[Ubisoft] Token reset error:', e.message);
    }
    res.redirect('/dashboard/ubisoft/tokens');
});

router.post('/ubisoft/tokens/:id/use', isAuthenticated, isStaff, (req, res) => {
    try { 
        if (db.markUbisoftTokenUsedManually) {
            db.markUbisoftTokenUsedManually(req.params.id);
        } else {
            // Inline mark as used
            const dbInstance = db.getDb ? db.getDb() : null;
            if (dbInstance) {
                dbInstance.prepare(`
                    UPDATE ubisoft_tokens 
                    SET last_used_at = datetime('now'),
                        reserved_by_ticket = NULL,
                        used_by_username = 'Manual (Dashboard)'
                    WHERE id = ?
                `).run(req.params.id);
            }
        }
    } catch (e) {
        console.error('[Ubisoft] Token use error:', e.message);
    }
    res.redirect('/dashboard/ubisoft/tokens');
});

router.post('/ubisoft/tokens/:id/delete', isAuthenticated, isStaff, (req, res) => {
    try { if (db.deleteUbisoftToken) db.deleteUbisoftToken(req.params.id); } catch (e) {}
    res.redirect('/dashboard/ubisoft/tokens');
});

router.get('/ubisoft/transcripts', isAuthenticated, isStaff, (req, res) => {
    let transcripts = [];
    try { transcripts = db.getUbisoftTranscripts ? db.getUbisoftTranscripts({ limit: 100 }) : []; } catch (e) {}
    res.render('dashboard-v3/ubisoft/transcripts', { title: 'Ubisoft Transcripts', transcripts });
});

router.get('/ubisoft/activations', isAuthenticated, isStaff, (req, res) => {
    let activations = [];
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    try {
        const filters = {};
        if (search) filters.username = search;
        activations = db.getUbisoftActivations ? db.getUbisoftActivations(limit, offset, filters) : [];
    } catch (e) {}
    
    const topGames = db.getTopUbisoftGames ? db.getTopUbisoftGames(10) : [];
    const topUsers = db.getTopUbisoftUsers ? db.getTopUbisoftUsers(10) : [];
    const totalCount = db.getTotalActivationCount ? db.getTotalActivationCount('ubisoft') : 0;
    const totalPages = Math.ceil(totalCount / limit);
    
    res.render('dashboard-v3/ubisoft/activations', { 
        title: 'Ubisoft Activations', 
        activations, search, topGames, topUsers, totalCount, page, limit, totalPages
    });
});

router.get('/ubisoft/generate', isAuthenticated, isStaff, (req, res) => {
    let games = [];
    let accounts = [];
    try {
        games = db.getAllUbisoftGames ? db.getAllUbisoftGames() : [];
        accounts = db.getAllUbisoftAccounts ? db.getAllUbisoftAccounts() : [];
    } catch (e) {}
    res.render('dashboard-v3/ubisoft/generate', { title: 'Generate Ubisoft Tokens', games, accounts, result: null });
});

router.post('/ubisoft/generate', isAuthenticated, isStaff, async (req, res) => {
    const { game_id, account_id, token_content } = req.body;
    let games = [];
    let accounts = [];
    
    try {
        games = db.getAllUbisoftGames ? db.getAllUbisoftGames() : [];
        accounts = db.getAllUbisoftAccounts ? db.getAllUbisoftAccounts() : [];
    } catch (e) {}
    
    if (!game_id || !account_id || !token_content) {
        return res.render('dashboard-v3/ubisoft/generate', { 
            title: 'Generate Ubisoft Tokens', games, accounts, 
            result: { success: false, error: 'Missing required fields' }
        });
    }
    
    try {
        const account = db.getUbisoftAccount ? db.getUbisoftAccount(account_id) : null;
        const game = db.getUbisoftGame ? db.getUbisoftGame(game_id) : null;
        
        if (!account) {
            return res.render('dashboard-v3/ubisoft/generate', { 
                title: 'Generate Ubisoft Tokens', games, accounts, 
                result: { success: false, error: 'Account not found' }
            });
        }
        
        const { spawn } = require('child_process');
        const exePath = process.env.DENUVO_EXE_PATH || path.join(__dirname, '..', 'ubisoft', 'DenuvoTicket.exe');
        const exeDir = path.dirname(exePath);
        
        if (!fs.existsSync(exePath)) {
            return res.render('dashboard-v3/ubisoft/generate', { 
                title: 'Generate Ubisoft Tokens', games, accounts, 
                result: { success: false, error: 'DenuvoTicket.exe not found at ' + exePath }
            });
        }
        
        // Clean old output files
        const filesToClean = [
            path.join(exeDir, 'token.txt'),
            path.join(exeDir, 'dbdata.json')
        ];
        for (const f of filesToClean) {
            try { fs.unlinkSync(f); } catch (e) {}
        }
        
        // Run exe with credentials
        const args = ['-l', account.email, '-p', account.password, '-t', token_content.trim()];
        
        console.log(`[Dashboard] Ubisoft generate: game=${game?.game_name}, account=${account.account_name}`);
        
        const result = await new Promise((resolve) => {
            const child = spawn(exePath, args, { cwd: exeDir, windowsHide: true });
            let stdout = '';
            let stderr = '';
            
            child.stdout.on('data', (d) => { stdout += d.toString(); });
            child.stderr.on('data', (d) => { stderr += d.toString(); });
            
            const timeout = setTimeout(() => {
                child.kill();
                resolve({ success: false, error: 'Process timed out (2 minutes)' });
            }, 120000);
            
            child.on('error', (err) => {
                clearTimeout(timeout);
                resolve({ success: false, error: err.message });
            });
            
            child.on('close', (code) => {
                clearTimeout(timeout);
                console.log(`[Dashboard] Ubisoft exe exited code=${code}`);
                
                // Wait for file to be written
                setTimeout(() => {
                    const possibleFiles = [
                        path.join(exeDir, 'dbdata.json'),
                        path.join(exeDir, 'token.txt')
                    ];
                    
                    let tokenContent = null;
                    let tokenFile = null;
                    
                    for (const filePath of possibleFiles) {
                        if (fs.existsSync(filePath)) {
                            tokenContent = fs.readFileSync(filePath, 'utf8');
                            tokenFile = path.basename(filePath);
                            break;
                        }
                    }
                    
                    if (tokenContent && tokenContent.length > 10) {
                        resolve({ 
                            success: true, 
                            tokenContent, 
                            tokenFile,
                            game: game?.game_name,
                            account: account.account_name
                        });
                    } else {
                        let error = 'No token file generated';
                        if (stdout.includes('You do not own')) error = 'Account does not own this game';
                        else if (stdout.includes('daily limit')) error = 'Daily token limit reached';
                        else if (stdout.includes('failed')) error = 'Token generation failed';
                        resolve({ success: false, error, stdout: stdout.substring(0, 500) });
                    }
                }, 2000);
            });
        });
        
        return res.render('dashboard-v3/ubisoft/generate', { 
            title: 'Generate Ubisoft Tokens', games, accounts, result 
        });
        
    } catch (err) {
        console.error('[Dashboard] Ubisoft generate error:', err);
        return res.render('dashboard-v3/ubisoft/generate', { 
            title: 'Generate Ubisoft Tokens', games, accounts, 
            result: { success: false, error: err.message }
        });
    }
});

// ============================================================================
// EA ROUTES
// ============================================================================

router.get('/ea/games', isAuthenticated, isStaff, (req, res) => {
    let games = [];
    try {
        games = db.getAllEAGames ? db.getAllEAGames() : [];
        games = games.map(g => ({
            ...g,
            available: db.getAvailableEATokenCount ? db.getAvailableEATokenCount(g.id) : 0,
            total: db.getTotalEATokenCount ? db.getTotalEATokenCount(g.id) : 0
        }));
    } catch (e) {}
    res.render('dashboard-v3/ea/games', { title: 'EA Games', games });
});

router.get('/ea/games/add', isAuthenticated, isStaff, (req, res) => {
    res.render('dashboard-v3/ea/game-form', { title: 'Add EA Game', game: null });
});

router.post('/ea/games/add', isAuthenticated, isStaff, (req, res) => {
    console.log('[Dashboard] EA game add - req.body:', JSON.stringify(req.body));
    try { 
        if (db.addEAGame) {
            const result = db.addEAGame(req.body);
            console.log('[Dashboard] EA game add result:', result);
        }
    } catch (e) {
        console.error('[Dashboard] EA game add error:', e.message);
    }
    res.redirect('/dashboard/ea/games');
});

router.get('/ea/games/:id/edit', isAuthenticated, isStaff, (req, res) => {
    const game = db.getEAGame ? db.getEAGame(req.params.id) : null;
    console.log('[Dashboard] EA game edit - loaded game:', JSON.stringify(game));
    if (!game) return res.redirect('/dashboard/ea/games');
    res.render('dashboard-v3/ea/game-form', { title: 'Edit EA Game', game });
});

router.post('/ea/games/:id/edit', isAuthenticated, isStaff, (req, res) => {
    console.log('[Dashboard] EA game update - id:', req.params.id, 'req.body:', JSON.stringify(req.body));
    try { 
        if (db.updateEAGame) {
            const result = db.updateEAGame(req.params.id, req.body);
            console.log('[Dashboard] EA game update result:', result);
        }
    } catch (e) {
        console.error('[Dashboard] EA game update error:', e.message);
    }
    res.redirect('/dashboard/ea/games');
});

router.post('/ea/games/:id/delete', isAuthenticated, isAdmin, (req, res) => {
    try { if (db.deleteEAGame) db.deleteEAGame(req.params.id); } catch (e) {}
    res.redirect('/dashboard/ea/games');
});

router.post('/ea/games/:id/highdemand', isAuthenticated, isStaff, (req, res) => {
    try { 
        if (db.toggleEAGameHighDemand) {
            db.toggleEAGameHighDemand(req.params.id);
        } else {
            // Inline toggle
            const dbInstance = db.getDb ? db.getDb() : null;
            if (dbInstance) {
                const game = dbInstance.prepare('SELECT demand_type FROM ea_games WHERE id = ?').get(req.params.id);
                const newDemand = game?.demand_type === 'high' ? 'normal' : 'high';
                dbInstance.prepare('UPDATE ea_games SET demand_type = ? WHERE id = ?').run(newDemand, req.params.id);
            }
        }
    } catch (e) {
        console.error('[EA] Error toggling high demand:', e.message);
    }
    res.redirect('/dashboard/ea/games');
});

router.get('/ea/accounts', isAuthenticated, isStaff, (req, res) => {
    let accounts = [];
    try { accounts = db.getAllEAAccounts ? db.getAllEAAccounts() : []; } catch (e) {}
    res.render('dashboard-v3/ea/accounts', { title: 'EA Accounts', accounts });
});

router.post('/ea/accounts/add', isAuthenticated, isStaff, (req, res) => {
    try { 
        const { account_name, tcno_id } = req.body;
        if (db.addEAAccount) db.addEAAccount(account_name, tcno_id || null); 
    } catch (e) {
        console.error('[EA] Error adding account:', e.message);
    }
    res.redirect('/dashboard/ea/accounts');
});

router.post('/ea/accounts/:id/delete', isAuthenticated, isAdmin, (req, res) => {
    try { if (db.deleteEAAccount) db.deleteEAAccount(req.params.id); } catch (e) {}
    res.redirect('/dashboard/ea/accounts');
});

router.get('/ea/tokens', isAuthenticated, isStaff, (req, res) => {
    let tokens = [];
    let games = [];
    try {
        games = db.getAllEAGames ? db.getAllEAGames() : [];
        tokens = db.getAllEATokens ? db.getAllEATokens() : [];
    } catch (e) {}
    res.render('dashboard-v3/ea/tokens', { title: 'EA Tokens', tokens, games });
});

router.get('/ea/tokens/add', isAuthenticated, isStaff, (req, res) => {
    let games = [];
    let accounts = [];
    try { 
        games = db.getAllEAGames ? db.getAllEAGames() : []; 
        accounts = db.getAllEAAccounts ? db.getAllEAAccounts() : [];
    } catch (e) {}
    res.render('dashboard-v3/ea/tokens-add', { title: 'Add EA Tokens', games, accounts });
});

router.post('/ea/tokens/add', isAuthenticated, isStaff, (req, res) => {
    try {
        const { game, account, quantity } = req.body;
        
        if (!game || !account || !quantity) {
            return res.json({ success: false, error: 'Missing required fields' });
        }
        
        const count = parseInt(quantity) || 1;
        
        // Use bulk add if available, otherwise add one by one
        if (db.addEATokensBulk) {
            db.addEATokensBulk(account, game, count);
        } else if (db.addEAToken) {
            for (let i = 0; i < count; i++) {
                db.addEAToken(account, game);
            }
        }
        
        res.json({ success: true, count });
    } catch (e) {
        console.error('[EA] Error adding tokens:', e.message);
        res.json({ success: false, error: e.message });
    }
});

router.post('/ea/tokens/:id/reset', isAuthenticated, isStaff, (req, res) => {
    try { 
        if (db.resetEAToken) {
            db.resetEAToken(req.params.id);
        } else {
            // Inline reset if db function doesn't exist
            const dbInstance = db.getDb ? db.getDb() : null;
            if (dbInstance) {
                dbInstance.prepare(`
                    UPDATE ea_tokens 
                    SET reserved_by_ticket = NULL, 
                        last_used_at = NULL, 
                        used_by_user_id = NULL, 
                        used_by_username = NULL,
                        used_in_ticket = NULL
                    WHERE id = ?
                `).run(req.params.id);
            }
        }
    } catch (e) {
        console.error('[EA] Token reset error:', e.message);
    }
    res.redirect('/dashboard/ea/tokens');
});

router.post('/ea/tokens/:id/use', isAuthenticated, isStaff, (req, res) => {
    try { 
        if (db.markEATokenUsedManually) {
            db.markEATokenUsedManually(req.params.id);
        } else {
            // Inline mark as used
            const dbInstance = db.getDb ? db.getDb() : null;
            if (dbInstance) {
                dbInstance.prepare(`
                    UPDATE ea_tokens 
                    SET last_used_at = datetime('now'),
                        reserved_by_ticket = NULL,
                        used_by_username = 'Manual (Dashboard)'
                    WHERE id = ?
                `).run(req.params.id);
            }
        }
    } catch (e) {
        console.error('[EA] Token use error:', e.message);
    }
    res.redirect('/dashboard/ea/tokens');
});

router.post('/ea/tokens/:id/delete', isAuthenticated, isStaff, (req, res) => {
    try { if (db.deleteEAToken) db.deleteEAToken(req.params.id); } catch (e) {}
    res.redirect('/dashboard/ea/tokens');
});

router.get('/ea/transcripts', isAuthenticated, isStaff, (req, res) => {
    let transcripts = [];
    try { transcripts = db.getEATranscripts ? db.getEATranscripts({ limit: 100 }) : []; } catch (e) {}
    res.render('dashboard-v3/ea/transcripts', { title: 'EA Transcripts', transcripts });
});

router.get('/ea/activations', isAuthenticated, isStaff, (req, res) => {
    let activations = [];
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    try {
        const filters = {};
        if (search) filters.username = search;
        activations = db.getEAActivations ? db.getEAActivations(limit, offset, filters) : [];
    } catch (e) {}
    
    const topGames = db.getTopEAGames ? db.getTopEAGames(10) : [];
    const topUsers = db.getTopEAUsers ? db.getTopEAUsers(10) : [];
    const totalCount = db.getTotalActivationCount ? db.getTotalActivationCount('ea') : 0;
    const totalPages = Math.ceil(totalCount / limit);
    
    res.render('dashboard-v3/ea/activations', { 
        title: 'EA Activations', 
        activations, search, topGames, topUsers, totalCount, page, limit, totalPages
    });
});

router.get('/ea/generate', isAuthenticated, isStaff, (req, res) => {
    let games = [];
    let accounts = [];
    try {
        games = db.getAllEAGames ? db.getAllEAGames() : [];
        accounts = db.getAllEAAccounts ? db.getAllEAAccounts() : [];
    } catch (e) {}
    res.render('dashboard-v3/ea/generate', { title: 'Generate EA Tokens', games, accounts, result: null });
});

router.post('/ea/generate', isAuthenticated, isStaff, async (req, res) => {
    const { game_id, token_content } = req.body;
    let games = [];
    let accounts = [];
    
    try {
        games = db.getAllEAGames ? db.getAllEAGames() : [];
        accounts = db.getAllEAAccounts ? db.getAllEAAccounts() : [];
    } catch (e) {}
    
    if (!game_id || !token_content) {
        return res.render('dashboard-v3/ea/generate', { 
            title: 'Generate EA Tokens', games, accounts, 
            result: { success: false, error: 'Missing required fields' }
        });
    }
    
    try {
        const game = db.getEAGame ? db.getEAGame(game_id) : null;
        
        const { spawn } = require('child_process');
        const exePath = process.env.EA_TOKEN_GEN_PATH || path.join(__dirname, '..', 'EA', 'EAgen.exe');
        const exeDir = path.dirname(exePath);
        const tokenOutputPath = path.join(__dirname, '..', 'EA', 'tokens', 'EA_Token.txt');
        
        if (!fs.existsSync(exePath)) {
            return res.render('dashboard-v3/ea/generate', { 
                title: 'Generate EA Tokens', games, accounts, 
                result: { success: false, error: 'EAgen.exe not found at ' + exePath }
            });
        }
        
        // Parse the ticket line from content
        const lines = token_content.split(/\r?\n/);
        let ticketLine = null;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('|0|') && trimmed.split('|').length === 3) {
                ticketLine = trimmed;
                break;
            }
        }
        
        if (!ticketLine) {
            return res.render('dashboard-v3/ea/generate', { 
                title: 'Generate EA Tokens', games, accounts, 
                result: { success: false, error: 'Could not find valid ticket format (ticket|0|contentID) in content' }
            });
        }
        
        // Clean old token file
        try { fs.unlinkSync(tokenOutputPath); } catch (e) {}
        
        console.log(`[Dashboard] EA generate: game=${game?.game_name}, ticket=${ticketLine.substring(0, 50)}...`);
        
        const result = await new Promise((resolve) => {
            const child = spawn(exePath, ['-t', ticketLine], { cwd: exeDir, windowsHide: true });
            let stdout = '';
            let stderr = '';
            
            child.stdout.on('data', (d) => { stdout += d.toString(); });
            child.stderr.on('data', (d) => { stderr += d.toString(); });
            
            const timeout = setTimeout(() => {
                child.kill();
                resolve({ success: false, error: 'Process timed out (2 minutes)' });
            }, 120000);
            
            child.on('error', (err) => {
                clearTimeout(timeout);
                resolve({ success: false, error: err.message });
            });
            
            child.on('close', (code) => {
                clearTimeout(timeout);
                console.log(`[Dashboard] EA exe exited code=${code}`);
                
                // Wait for file to be written
                setTimeout(() => {
                    if (fs.existsSync(tokenOutputPath)) {
                        const tokenContent = fs.readFileSync(tokenOutputPath, 'utf8');
                        if (tokenContent && tokenContent.length > 100) {
                            resolve({ 
                                success: true, 
                                tokenContent, 
                                tokenFile: 'EA_Token.txt',
                                game: game?.game_name
                            });
                        } else {
                            resolve({ success: false, error: 'Token file generated but appears invalid', stdout });
                        }
                    } else {
                        let error = 'No token file generated';
                        if (stdout.toLowerCase().includes('conflict')) error = 'Conflict error';
                        else if (stdout.toLowerCase().includes('failed')) error = 'Token generation failed';
                        resolve({ success: false, error, stdout: stdout.substring(0, 500) });
                    }
                }, 2000);
            });
        });
        
        return res.render('dashboard-v3/ea/generate', { 
            title: 'Generate EA Tokens', games, accounts, result 
        });
        
    } catch (err) {
        console.error('[Dashboard] EA generate error:', err);
        return res.render('dashboard-v3/ea/generate', { 
            title: 'Generate EA Tokens', games, accounts, 
            result: { success: false, error: err.message }
        });
    }
});

// ============================================================================
// SIGMA CONFIG MANAGER ROUTES
// ============================================================================

const SIGMA_DIR = path.join(__dirname, '..', 'sigma');

try {
    if (!fs.existsSync(SIGMA_DIR)) {
        fs.mkdirSync(SIGMA_DIR, { recursive: true });
    }
} catch (e) {}

function getSigmaAppIds() {
    try {
        if (!fs.existsSync(SIGMA_DIR)) return [];
        const items = fs.readdirSync(SIGMA_DIR, { withFileTypes: true });
        return items
            .filter(item => item.isDirectory())
            .map(item => {
                try {
                    const files = fs.readdirSync(path.join(SIGMA_DIR, item.name));
                    return { id: item.name, files: files.length };
                } catch (e) {
                    return { id: item.name, files: 0 };
                }
            })
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    } catch (e) {
        return [];
    }
}

router.get('/sigma', isAuthenticated, isStaff, (req, res) => {
    const appids = getSigmaAppIds();
    res.render('dashboard-v3/sigma/index', { title: 'Sigma Config Manager', appids });
});

// ============================================================================
// ANALYTICS & REPORTS
// ============================================================================

router.get('/analytics', isAuthenticated, isStaff, (req, res) => {
    let data = {
        dailyActivations: [],
        platformBreakdown: { steam: 0, ubisoft: 0, ea: 0 },
        topGames: []
    };
    
    try {
        const activations = db.getActivations ? db.getActivations({ limit: 1000 }) : [];
        activations.forEach(a => {
            if (a.platform === 'steam') data.platformBreakdown.steam++;
            else if (a.platform === 'ubisoft') data.platformBreakdown.ubisoft++;
            else if (a.platform === 'ea') data.platformBreakdown.ea++;
        });
    } catch (e) {}
    
    res.render('dashboard-v3/analytics', { title: 'Analytics', data });
});

router.get('/staff-activity', isAuthenticated, isStaff, (req, res) => {
    let activity = [];
    try { activity = db.getStaffActivity ? db.getStaffActivity({ limit: 100 }) : []; } catch (e) {}
    res.render('dashboard-v3/staff-activity', { title: 'Staff Activity', activity });
});

router.get('/audit-logs', isAuthenticated, isAdmin, (req, res) => {
    let logs = [];
    try { logs = db.getAuditLogs ? db.getAuditLogs({ limit: 100 }) : []; } catch (e) {}
    res.render('dashboard-v3/audit-logs', { title: 'Audit Logs', logs });
});

// ============================================================================
// SETTINGS
// ============================================================================

router.get('/cooldowns', isAuthenticated, isStaff, (req, res) => {
    let cooldowns = [];
    try { cooldowns = db.getAllCooldowns ? db.getAllCooldowns() : []; } catch (e) {}
    res.render('dashboard-v3/cooldowns', { title: 'Cooldowns', cooldowns });
});

router.post('/cooldowns/:id/clear', isAuthenticated, isStaff, (req, res) => {
    try { if (db.clearCooldown) db.clearCooldown(req.params.id); } catch (e) {}
    res.redirect('/dashboard/cooldowns');
});

router.get('/macros', isAuthenticated, isStaff, (req, res) => {
    let macros = [];
    try { macros = db.getAllMacros ? db.getAllMacros() : []; } catch (e) {}
    res.render('dashboard-v3/macros', { title: 'Macros', macros });
});

router.post('/macros/add', isAuthenticated, isStaff, (req, res) => {
    try { if (db.addMacro) db.addMacro(req.body); } catch (e) {}
    res.redirect('/dashboard/macros');
});

router.post('/macros/:id/delete', isAuthenticated, isStaff, (req, res) => {
    try { if (db.deleteMacro) db.deleteMacro(req.params.id); } catch (e) {}
    res.redirect('/dashboard/macros');
});

// File Manager Route
router.get('/file-manager', isAuthenticated, isStaff, (req, res) => {
    res.render('dashboard-v3/file-manager', { title: 'File Manager' });
});

// File Manager API Routes
const fileManagerBase = path.join(__dirname, '..');

function sanitizePath(userPath) {
    // Prevent directory traversal
    const normalized = path.normalize(userPath).replace(/^(\.\.(\/|\\|$))+/, '');
    return normalized;
}

function getFullPath(userPath) {
    const safePath = sanitizePath(userPath);
    const fullPath = path.join(fileManagerBase, safePath);
    // Ensure the path is still within the base
    if (!fullPath.startsWith(fileManagerBase)) {
        return null;
    }
    return fullPath;
}

router.get('/files/browse', isAuthenticated, isStaff, (req, res) => {
    try {
        const userPath = req.query.path || '';
        const fullPath = getFullPath(userPath);
        
        if (!fullPath || !fs.existsSync(fullPath)) {
            return res.json({ success: false, error: 'Path not found' });
        }
        
        const stats = fs.statSync(fullPath);
        if (!stats.isDirectory()) {
            return res.json({ success: false, error: 'Not a directory' });
        }
        
        const editableExtensions = ['json', 'txt', 'ini', 'cfg', 'config', 'bat', 'cmd', 'sh', 'ps1', 'log', 'xml', 'md', 'js', 'py', 'html', 'css', 'ejs'];
        
        const items = fs.readdirSync(fullPath).map(name => {
            const itemFullPath = path.join(fullPath, name);
            const itemRelativePath = userPath ? userPath + '/' + name : name;
            try {
                const itemStats = fs.statSync(itemFullPath);
                const ext = name.split('.').pop().toLowerCase();
                return {
                    name,
                    path: itemRelativePath,
                    type: itemStats.isDirectory() ? 'directory' : 'file',
                    size: itemStats.size,
                    modified: itemStats.mtime,
                    editable: editableExtensions.includes(ext)
                };
            } catch (e) {
                return { name, path: itemRelativePath, type: 'file', size: 0, modified: null, editable: false };
            }
        });
        
        res.json({ success: true, items });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

router.get('/files/read', isAuthenticated, isStaff, (req, res) => {
    try {
        const userPath = req.query.path || '';
        const fullPath = getFullPath(userPath);
        
        if (!fullPath || !fs.existsSync(fullPath)) {
            return res.json({ success: false, error: 'File not found' });
        }
        
        const content = fs.readFileSync(fullPath, 'utf8');
        res.json({ success: true, content });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

router.post('/files/write', isAuthenticated, isStaff, (req, res) => {
    try {
        const { path: userPath, content } = req.body;
        const fullPath = getFullPath(userPath);
        
        if (!fullPath) {
            return res.json({ success: false, error: 'Invalid path' });
        }
        
        fs.writeFileSync(fullPath, content, 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

router.get('/files/download', isAuthenticated, isStaff, (req, res) => {
    try {
        const userPath = req.query.path || '';
        const fullPath = getFullPath(userPath);
        
        if (!fullPath || !fs.existsSync(fullPath)) {
            return res.status(404).send('File not found');
        }
        
        res.download(fullPath);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

router.post('/files/delete', isAuthenticated, isAdmin, (req, res) => {
    try {
        const { path: userPath, type } = req.body;
        const fullPath = getFullPath(userPath);
        
        if (!fullPath || !fs.existsSync(fullPath)) {
            return res.json({ success: false, error: 'Path not found' });
        }
        
        if (type === 'directory') {
            fs.rmSync(fullPath, { recursive: true });
        } else {
            fs.unlinkSync(fullPath);
        }
        
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

router.post('/files/mkdir', isAuthenticated, isStaff, (req, res) => {
    try {
        const { path: userPath } = req.body;
        const fullPath = getFullPath(userPath);
        
        if (!fullPath) {
            return res.json({ success: false, error: 'Invalid path' });
        }
        
        fs.mkdirSync(fullPath, { recursive: true });
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

const fileUpload = multer({ dest: path.join(__dirname, '..', 'uploads') });
router.post('/files/upload', isAuthenticated, isStaff, fileUpload.array('files'), (req, res) => {
    try {
        const targetPath = req.body.path || '';
        const fullTargetPath = getFullPath(targetPath);
        
        if (!fullTargetPath) {
            return res.json({ success: false, error: 'Invalid path' });
        }
        
        if (!fs.existsSync(fullTargetPath)) {
            fs.mkdirSync(fullTargetPath, { recursive: true });
        }
        
        req.files.forEach(file => {
            const destPath = path.join(fullTargetPath, file.originalname);
            fs.renameSync(file.path, destPath);
        });
        
        res.json({ success: true, count: req.files.length });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

router.get('/users', isAuthenticated, isAdmin, (req, res) => {
    let users = [];
    try { users = db.getAllDashboardUsers ? db.getAllDashboardUsers() : []; } catch (e) {}
    res.render('dashboard-v3/users', { title: 'Dashboard Users', users });
});

router.get('/users/add', isAuthenticated, isAdmin, (req, res) => {
    res.render('dashboard-v3/user-form', { title: 'Add User', editUser: null });
});

router.post('/users/add', isAuthenticated, isAdmin, (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (db.addDashboardUser) {
            db.addDashboardUser({ username, password_hash: hashPassword(password), role });
        }
    } catch (e) {}
    res.redirect('/dashboard/users');
});

router.post('/users/:id/delete', isAuthenticated, isAdmin, (req, res) => {
    try { if (db.deleteDashboardUser) db.deleteDashboardUser(req.params.id); } catch (e) {}
    res.redirect('/dashboard/users');
});

// ============================================================================
// API ENDPOINTS
// ============================================================================

router.get('/api/stats', isAuthenticated, (req, res) => {
    const stats = {
        steam: { games: 0, available: 0 },
        ubisoft: { games: 0, available: 0 },
        ea: { games: 0, available: 0 }
    };
    
    try {
        const steamGames = db.getAllGames ? db.getAllGames() : [];
        stats.steam.games = steamGames.length;
        steamGames.forEach(g => {
            stats.steam.available += db.getAvailableTokenCount ? db.getAvailableTokenCount(g.id) : 0;
        });
        
        const ubiGames = db.getAllUbisoftGames ? db.getAllUbisoftGames() : [];
        stats.ubisoft.games = ubiGames.length;
        ubiGames.forEach(g => {
            stats.ubisoft.available += db.getAvailableUbisoftTokenCount ? db.getAvailableUbisoftTokenCount(g.id) : 0;
        });
        
        const eaGames = db.getAllEAGames ? db.getAllEAGames() : [];
        stats.ea.games = eaGames.length;
        eaGames.forEach(g => {
            stats.ea.available += db.getAvailableEATokenCount ? db.getAvailableEATokenCount(g.id) : 0;
        });
    } catch (e) {}
    
    res.json(stats);
});

// ============================================================================
// ERROR HANDLER
// ============================================================================

router.use((err, req, res, next) => {
    console.error('Dashboard error:', err);
    res.status(500).render('dashboard-v3/error', {
        title: 'Error',
        message: 'Something went wrong. Please try again.',
        user: req.session?.user
    });
});

// ============================================================================
// INIT FUNCTION - WITH FIXED SESSION SETTINGS
// ============================================================================

function init(app, database, refreshCallback) {
    // FIXED: Simple session that works - no restrictive cookie settings
    app.use(session({
        secret: process.env.SESSION_SECRET || 'bartender_secret_key_2024',
        name: 'bartender.sid',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false,      // FIXED: Allow HTTP
            httpOnly: true,
            maxAge: 86400000 * 7, // 7 days
            sameSite: 'lax'     // FIXED: Less restrictive
            // NO path restriction - cookie works site-wide
        }
    }));
    console.log('✅ Session store initialized (simple memory mode)');
    
    // Setup view engine
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    
    // Parse form data
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(express.json({ limit: '10mb' }));
    
    // Serve static files
    app.use('/dashboard/public', express.static(path.join(__dirname, 'public')));
    
    // =========================================================================
    // SIGMA API ROUTES (for downloader and dashboard)
    // =========================================================================
    const sigmaDir = path.join(__dirname, '..', 'sigma');
    
    try {
        if (!fs.existsSync(sigmaDir)) {
            fs.mkdirSync(sigmaDir, { recursive: true });
        }
    } catch (e) {}
    
    // Dashboard VDF parser save endpoint
    app.post('/api/sigma/save', (req, res) => {
        const { appid, depots, targetFolder } = req.body;
        
        if (!appid) return res.json({ success: false, error: 'Invalid AppID' });
        if (!depots || !Array.isArray(depots) || depots.length === 0) {
            return res.json({ success: false, error: 'No depots provided' });
        }
        
        try {
            const config = depots.length === 1 ? depots[0] : depots;
            
            if (targetFolder && (targetFolder === 'sigmaui' || targetFolder === 'sigmastaff')) {
                const targetDir = path.join(sigmaDir, targetFolder);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                fs.writeFileSync(
                    path.join(targetDir, `${appid}.json`),
                    JSON.stringify(config, null, 2)
                );
                console.log(`[Sigma] Saved ${appid}.json to ${targetFolder}`);
            } else {
                const appidDir = path.join(sigmaDir, appid);
                if (!fs.existsSync(appidDir)) {
                    fs.mkdirSync(appidDir, { recursive: true });
                }
                fs.writeFileSync(
                    path.join(appidDir, 'config.json'),
                    JSON.stringify(config, null, 2)
                );
                console.log(`[Sigma] Saved config for AppID ${appid}`);
            }
            
            res.json({ success: true });
        } catch (e) {
            res.json({ success: false, error: e.message });
        }
    });
    
    // =========================================================================
    // DOWNLOADER API ROUTES - /api/sigmastaff and /api/sigmaui
    // Returns appids only, download file via /api/sigmaui/:appid
    // =========================================================================
    
    // List all appids in sigmastaff folder (returns array of appids only)
    app.get('/api/sigmastaff', (req, res) => {
        const staffDir = path.join(sigmaDir, 'sigmastaff');
        try {
            if (!fs.existsSync(staffDir)) {
                return res.json([]);
            }
            
            const files = fs.readdirSync(staffDir).filter(f => f.endsWith('.lua') || f.endsWith('.json'));
            const appids = files.map(f => f.replace('.lua', '').replace('.json', ''));
            
            console.log(`[Sigma] /api/sigmastaff returning ${appids.length} appids`);
            res.json(appids);
        } catch (e) {
            console.error('[Sigma] Error listing sigmastaff:', e.message);
            res.json([]);
        }
    });
    
    // Download file from sigmastaff (tries .lua first, then .json)
    app.get('/api/sigmastaff/:appid', (req, res) => {
        const { appid } = req.params;
        let filePath = path.join(sigmaDir, 'sigmastaff', `${appid}.lua`);
        let filename = `${appid}.lua`;
        
        if (!fs.existsSync(filePath)) {
            filePath = path.join(sigmaDir, 'sigmastaff', `${appid}.json`);
            filename = `${appid}.json`;
        }
        
        try {
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found' });
            }
            res.download(filePath, filename);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    
    // List all appids in sigmaui folder (returns array of appids only)
    app.get('/api/sigmaui', (req, res) => {
        const uiDir = path.join(sigmaDir, 'sigmaui');
        try {
            if (!fs.existsSync(uiDir)) {
                return res.json([]);
            }
            
            const files = fs.readdirSync(uiDir).filter(f => f.endsWith('.lua') || f.endsWith('.json'));
            const appids = files.map(f => f.replace('.lua', '').replace('.json', ''));
            
            console.log(`[Sigma] /api/sigmaui returning ${appids.length} appids`);
            res.json(appids);
        } catch (e) {
            console.error('[Sigma] Error listing sigmaui:', e.message);
            res.json([]);
        }
    });
    
    // Download file from sigmaui (tries .lua first, then .json)
    app.get('/api/sigmaui/:appid', (req, res) => {
        const { appid } = req.params;
        let filePath = path.join(sigmaDir, 'sigmaui', `${appid}.lua`);
        let filename = `${appid}.lua`;
        
        if (!fs.existsSync(filePath)) {
            filePath = path.join(sigmaDir, 'sigmaui', `${appid}.json`);
            filename = `${appid}.json`;
        }
        
        try {
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found' });
            }
            res.download(filePath, filename);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ============================================================================
    // EXTERNAL API ENDPOINTS
    // ============================================================================
    
    app.get('/api/external/status', requireApiKey, apiRateLimiter, (req, res) => {
        try {
            const steamGames = db.getGames?.() || [];
            const ubisoftGames = db.getUbisoftGames?.() || [];
            const eaGames = db.getEAGames?.() || [];
            
            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                status: {
                    online: true,
                    uptime: process.uptime(),
                    memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
                },
                counts: {
                    steamGames: steamGames.length,
                    ubisoftGames: ubisoftGames.length,
                    eaGames: eaGames.length
                }
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    app.get('/api/external/tokens/availability', requireApiKey, apiRateLimiter, (req, res) => {
        try {
            const steamGames = db.getGames?.() || [];
            const ubisoftGames = db.getUbisoftGames?.() || [];
            const eaGames = db.getEAGames?.() || [];
            
            const availability = {
                steam: steamGames.map(g => ({
                    id: g.id,
                    name: g.game_name,
                    available: db.getAvailableTokenCount?.(g.id) || 0,
                    total: db.getTotalTokenCount?.(g.id) || 0
                })),
                ubisoft: ubisoftGames.map(g => ({
                    id: g.id,
                    name: g.game_name,
                    available: db.getAvailableUbisoftTokenCount?.(g.id) || 0,
                    total: db.getTotalUbisoftTokenCount?.(g.id) || 0
                })),
                ea: eaGames.map(g => ({
                    id: g.id,
                    name: g.game_name,
                    available: db.getAvailableEATokenCount?.(g.id) || 0,
                    total: db.getTotalEATokenCount?.(g.id) || 0
                }))
            };
            
            res.json({ success: true, timestamp: new Date().toISOString(), availability });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    app.get('/api/external/activations/recent', requireApiKey, apiRateLimiter, (req, res) => {
        try {
            const limit = Math.min(parseInt(req.query.limit) || 10, 100);
            
            const activations = {
                steam: db.getRecentActivations?.(limit) || [],
                ubisoft: db.getUbisoftActivations?.(limit) || [],
                ea: db.getEAActivations?.(limit) || []
            };
            
            res.json({ success: true, timestamp: new Date().toISOString(), activations });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    app.get('/api/health', apiRateLimiter, (req, res) => {
        res.json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    });
    
    app.use('/api/external', (req, res, next) => {
        const ip = getClientIP(req);
        console.log(`[API] External request to ${req.path} from ${ip}`);
        safeLogAudit({
            action: 'api_access',
            username: 'API',
            details: `External API access to ${req.path} from ${ip}`,
            category: 'api'
        });
        next();
    });
    
    // Mount dashboard router
    app.use('/dashboard', router);
    
    console.log('✅ Dashboard V3 initialized at /dashboard');
    console.log('✅ Sigma API initialized at /api/sigma');
    console.log('✅ External API initialized at /api/external (API key required)');
}

module.exports = { init, router };

// ============================================================================
// LEGACY SIGMA API ROUTES (for downloader compatibility)
// These endpoints provide direct access to sigmaui/sigmastaff folders
// ============================================================================

// Add these routes BEFORE module.exports in the init function
