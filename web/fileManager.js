// ============================================================================
// FILE MANAGER - Staff Dashboard Integration
// Allows staff to browse, edit, upload, copy, move files in generator folders
// Updated to work with username/password authentication
// ============================================================================

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Base directories staff can access (relative to bot root)
const ALLOWED_ROOTS = [
    'Steam',
    'EA',
    'Ubisoft',
    'sigma',
    'config',
    'generator',
    'generated'
];

// File extensions that can be edited in browser
const EDITABLE_EXTENSIONS = ['.txt', '.ini', '.cfg', '.config', '.json', '.xml', '.bat', '.cmd', '.ps1', '.sh', '.py', '.js', '.log', '.md', '.vdf', '.acf'];

// Get the project root directory (go up from bot-v2/web/ to bot-v2/)
const BOT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '..');

console.log(`[FileManager] BOT_ROOT set to: ${BOT_ROOT}`);

// Clipboard for copy/paste operations
const clipboard = new Map();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isPathAllowed(requestedPath) {
    const normalizedPath = path.normalize(requestedPath).replace(/\\/g, '/');
    
    for (const root of ALLOWED_ROOTS) {
        if (normalizedPath === root || normalizedPath.startsWith(root + '/')) {
            const fullPath = path.join(BOT_ROOT, normalizedPath);
            const resolvedPath = path.resolve(fullPath);
            const resolvedRoot = path.resolve(BOT_ROOT, root);
            
            if (resolvedPath.startsWith(resolvedRoot)) {
                return true;
            }
        }
    }
    return false;
}

function getFullPath(relativePath) {
    return path.join(BOT_ROOT, relativePath);
}

function isEditable(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return EDITABLE_EXTENSIONS.includes(ext);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================================================
// MIDDLEWARE - Check if user is staff (works with new auth system)
// ============================================================================

function requireStaff(req, res, next) {
    // Check for user from the session auth system (dashboard.js)
    const user = req.user || req.session?.user;
    
    if (user && (user.role === 'admin' || user.role === 'staff')) {
        // Make user available on req for consistency
        req.user = user;
        console.log(`[FileManager] Access granted for: ${user.username} (${user.role})`);
        return next();
    }
    
    // Fallback: check for old passport auth (backwards compatibility)
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        console.log(`[FileManager] Access granted via passport for: ${req.user.username}`);
        return next();
    }
    
    console.log('[FileManager] BLOCKED - Not authenticated or not staff');
    return res.status(401).json({ error: 'Not authenticated' });
}

// ============================================================================
// ROUTES
// ============================================================================

// GET /files/browse?path=generator/worker-1
router.get('/browse', requireStaff, (req, res) => {
    try {
        let requestedPath = req.query.path || '';
        requestedPath = requestedPath.replace(/\\/g, '/').replace(/^\/+/, '');
        
        // Root listing
        if (!requestedPath) {
            return res.json({
                success: true,
                path: '',
                parent: null,
                items: ALLOWED_ROOTS.map(root => ({
                    name: root,
                    type: 'directory',
                    path: root
                }))
            });
        }
        
        if (!isPathAllowed(requestedPath)) {
            return res.status(403).json({ error: 'Access denied to this path' });
        }
        
        const fullPath = getFullPath(requestedPath);
        
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'Path not found' });
        }
        
        const stats = fs.statSync(fullPath);
        
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }
        
        const items = fs.readdirSync(fullPath).map(name => {
            const itemPath = path.join(fullPath, name);
            const itemRelativePath = path.join(requestedPath, name).replace(/\\/g, '/');
            
            try {
                const itemStats = fs.statSync(itemPath);
                return {
                    name,
                    type: itemStats.isDirectory() ? 'directory' : 'file',
                    path: itemRelativePath,
                    size: itemStats.isFile() ? formatFileSize(itemStats.size) : null,
                    sizeBytes: itemStats.isFile() ? itemStats.size : null,
                    modified: itemStats.mtime,
                    editable: itemStats.isFile() ? isEditable(name) : false
                };
            } catch (err) {
                return {
                    name,
                    type: 'unknown',
                    path: itemRelativePath,
                    error: err.message
                };
            }
        });
        
        // Sort: directories first, then files
        items.sort((a, b) => {
            if (a.type === 'directory' && b.type !== 'directory') return -1;
            if (a.type !== 'directory' && b.type === 'directory') return 1;
            return a.name.localeCompare(b.name);
        });
        
        // Calculate parent path
        const pathParts = requestedPath.split('/').filter(Boolean);
        const parent = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
        
        res.json({
            success: true,
            path: requestedPath,
            parent,
            items
        });
        
    } catch (err) {
        console.error('[FileManager] Browse error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /files/read?path=generator/worker-1/config.ini
router.get('/read', requireStaff, (req, res) => {
    try {
        const requestedPath = (req.query.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
        
        if (!requestedPath || !isPathAllowed(requestedPath)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const fullPath = getFullPath(requestedPath);
        
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
            return res.status(400).json({ error: 'Cannot read directory' });
        }
        
        if (stats.size > 10 * 1024 * 1024) {
            return res.status(400).json({ error: 'File too large to view (max 10MB)' });
        }
        
        const content = fs.readFileSync(fullPath, 'utf8');
        
        res.json({
            success: true,
            path: requestedPath,
            name: path.basename(requestedPath),
            content,
            size: formatFileSize(stats.size),
            editable: isEditable(requestedPath),
            modified: stats.mtime
        });
        
    } catch (err) {
        console.error('[FileManager] Read error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /files/write - Save file content
router.post('/write', requireStaff, express.json({ limit: '10mb' }), (req, res) => {
    try {
        const { path: filePath, content } = req.body;
        const requestedPath = (filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
        
        if (!requestedPath || !isPathAllowed(requestedPath)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const fullPath = getFullPath(requestedPath);
        
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(fullPath, content, 'utf8');
        
        console.log(`[FileManager] File saved: ${requestedPath} by ${req.user?.username || 'unknown'}`);
        
        res.json({ success: true, message: 'File saved' });
        
    } catch (err) {
        console.error('[FileManager] Write error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /files/create-folder
router.post('/create-folder', requireStaff, express.json(), (req, res) => {
    try {
        const { path: folderPath } = req.body;
        const requestedPath = (folderPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
        
        if (!requestedPath || !isPathAllowed(requestedPath)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const fullPath = getFullPath(requestedPath);
        
        if (fs.existsSync(fullPath)) {
            return res.status(400).json({ error: 'Folder already exists' });
        }
        
        fs.mkdirSync(fullPath, { recursive: true });
        
        console.log(`[FileManager] Folder created: ${requestedPath} by ${req.user?.username || 'unknown'}`);
        
        res.json({ success: true, message: 'Folder created' });
        
    } catch (err) {
        console.error('[FileManager] Create folder error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /files/delete
router.post('/delete', requireStaff, express.json(), (req, res) => {
    try {
        const { paths } = req.body;
        
        if (!Array.isArray(paths) || paths.length === 0) {
            return res.status(400).json({ error: 'No paths provided' });
        }
        
        const deleted = [];
        const errors = [];
        
        for (const filePath of paths) {
            const requestedPath = (filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
            
            if (!requestedPath || !isPathAllowed(requestedPath)) {
                errors.push({ path: filePath, error: 'Access denied' });
                continue;
            }
            
            const fullPath = getFullPath(requestedPath);
            
            if (!fs.existsSync(fullPath)) {
                errors.push({ path: filePath, error: 'Not found' });
                continue;
            }
            
            try {
                const stats = fs.statSync(fullPath);
                if (stats.isDirectory()) {
                    fs.rmSync(fullPath, { recursive: true });
                } else {
                    fs.unlinkSync(fullPath);
                }
                deleted.push(requestedPath);
                console.log(`[FileManager] Deleted: ${requestedPath} by ${req.user?.username || 'unknown'}`);
            } catch (err) {
                errors.push({ path: filePath, error: err.message });
            }
        }
        
        res.json({ success: true, deleted, errors });
        
    } catch (err) {
        console.error('[FileManager] Delete error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /files/copy
router.post('/copy', requireStaff, express.json(), (req, res) => {
    try {
        const { paths } = req.body;
        const sessionId = req.sessionID || 'default';
        
        if (!Array.isArray(paths) || paths.length === 0) {
            return res.status(400).json({ error: 'No paths provided' });
        }
        
        for (const p of paths) {
            const requestedPath = (p || '').replace(/\\/g, '/').replace(/^\/+/, '');
            if (!isPathAllowed(requestedPath)) {
                return res.status(403).json({ error: `Access denied: ${p}` });
            }
        }
        
        clipboard.set(sessionId, { type: 'copy', paths });
        
        res.json({ success: true, message: `${paths.length} item(s) copied to clipboard` });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /files/cut
router.post('/cut', requireStaff, express.json(), (req, res) => {
    try {
        const { paths } = req.body;
        const sessionId = req.sessionID || 'default';
        
        if (!Array.isArray(paths) || paths.length === 0) {
            return res.status(400).json({ error: 'No paths provided' });
        }
        
        for (const p of paths) {
            const requestedPath = (p || '').replace(/\\/g, '/').replace(/^\/+/, '');
            if (!isPathAllowed(requestedPath)) {
                return res.status(403).json({ error: `Access denied: ${p}` });
            }
        }
        
        clipboard.set(sessionId, { type: 'cut', paths });
        
        res.json({ success: true, message: `${paths.length} item(s) cut to clipboard` });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /files/paste
router.post('/paste', requireStaff, express.json(), (req, res) => {
    try {
        const { destination } = req.body;
        const sessionId = req.sessionID || 'default';
        
        const destPath = (destination || '').replace(/\\/g, '/').replace(/^\/+/, '');
        
        if (!isPathAllowed(destPath)) {
            return res.status(403).json({ error: 'Access denied to destination' });
        }
        
        const clipboardData = clipboard.get(sessionId);
        if (!clipboardData || !clipboardData.paths || clipboardData.paths.length === 0) {
            return res.status(400).json({ error: 'Clipboard is empty' });
        }
        
        const destFullPath = getFullPath(destPath);
        if (!fs.existsSync(destFullPath) || !fs.statSync(destFullPath).isDirectory()) {
            return res.status(400).json({ error: 'Destination must be a directory' });
        }
        
        const results = [];
        
        for (const srcRelPath of clipboardData.paths) {
            const srcPath = (srcRelPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
            const srcFullPath = getFullPath(srcPath);
            const itemName = path.basename(srcPath);
            const targetFullPath = path.join(destFullPath, itemName);
            
            try {
                if (!fs.existsSync(srcFullPath)) {
                    results.push({ path: srcPath, error: 'Source not found' });
                    continue;
                }
                
                const copyRecursive = (src, dest) => {
                    const stats = fs.statSync(src);
                    if (stats.isDirectory()) {
                        if (!fs.existsSync(dest)) {
                            fs.mkdirSync(dest, { recursive: true });
                        }
                        for (const item of fs.readdirSync(src)) {
                            copyRecursive(path.join(src, item), path.join(dest, item));
                        }
                    } else {
                        fs.copyFileSync(src, dest);
                    }
                };
                
                copyRecursive(srcFullPath, targetFullPath);
                
                if (clipboardData.type === 'cut') {
                    if (fs.statSync(srcFullPath).isDirectory()) {
                        fs.rmSync(srcFullPath, { recursive: true });
                    } else {
                        fs.unlinkSync(srcFullPath);
                    }
                }
                
                results.push({ path: srcPath, success: true });
                console.log(`[FileManager] ${clipboardData.type === 'cut' ? 'Moved' : 'Copied'}: ${srcPath} → ${destPath} by ${req.user?.username || 'unknown'}`);
                
            } catch (err) {
                results.push({ path: srcPath, error: err.message });
            }
        }
        
        if (clipboardData.type === 'cut') {
            clipboard.delete(sessionId);
        }
        
        res.json({ success: true, results });
        
    } catch (err) {
        console.error('[FileManager] Paste error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /files/rename
router.post('/rename', requireStaff, express.json(), (req, res) => {
    try {
        const { oldPath, newName } = req.body;
        const requestedPath = (oldPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
        
        if (!requestedPath || !isPathAllowed(requestedPath)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (!newName || newName.includes('/') || newName.includes('\\')) {
            return res.status(400).json({ error: 'Invalid new name' });
        }
        
        const fullPath = getFullPath(requestedPath);
        const newFullPath = path.join(path.dirname(fullPath), newName);
        const newRelativePath = path.join(path.dirname(requestedPath), newName).replace(/\\/g, '/');
        
        if (!isPathAllowed(newRelativePath)) {
            return res.status(403).json({ error: 'Access denied to new path' });
        }
        
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        if (fs.existsSync(newFullPath)) {
            return res.status(400).json({ error: 'A file with that name already exists' });
        }
        
        fs.renameSync(fullPath, newFullPath);
        
        console.log(`[FileManager] Renamed: ${requestedPath} → ${newRelativePath} by ${req.user?.username || 'unknown'}`);
        
        res.json({ success: true, newPath: newRelativePath });
        
    } catch (err) {
        console.error('[FileManager] Rename error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /files/download
router.get('/download', requireStaff, (req, res) => {
    try {
        const requestedPath = (req.query.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
        
        if (!requestedPath || !isPathAllowed(requestedPath)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const fullPath = getFullPath(requestedPath);
        
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
            return res.status(400).json({ error: 'Cannot download directory' });
        }
        
        res.download(fullPath);
        
    } catch (err) {
        console.error('[FileManager] Download error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Setup multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let destPath = (req.body.destination || req.query.destination || '').replace(/\\/g, '/').replace(/^\/+/, '');
        
        if (!destPath) {
            destPath = 'generator';
        }
        
        if (!isPathAllowed(destPath)) {
            return cb(new Error('Access denied to path: ' + destPath));
        }
        
        const fullPath = getFullPath(destPath);
        
        try {
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
            }
            cb(null, fullPath);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 4 * 1024 * 1024 * 1024 }
});

// POST /files/upload
router.post('/upload', requireStaff, (req, res) => {
    upload.any()(req, res, (err) => {
        if (err) {
            console.error('[FileManager] Upload error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        try {
            const files = req.files || [];
            const destination = req.body.destination || req.query.destination || 'generator';
            
            if (files.length === 0) {
                return res.status(400).json({ error: 'No files received' });
            }
            
            console.log(`[FileManager] Uploaded ${files.length} file(s) to ${destination} by ${req.user?.username || 'unknown'}`);
            
            res.json({
                success: true,
                message: `${files.length} file(s) uploaded successfully`,
                files: files.map(f => ({
                    name: f.originalname,
                    size: formatFileSize(f.size),
                    path: f.path
                }))
            });
            
        } catch (err) {
            console.error('[FileManager] Upload processing error:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// GET /files/clipboard
router.get('/clipboard', requireStaff, (req, res) => {
    const sessionId = req.sessionID || 'default';
    const clipboardData = clipboard.get(sessionId);
    
    res.json({
        success: true,
        hasItems: !!(clipboardData && clipboardData.paths && clipboardData.paths.length > 0),
        type: clipboardData?.type || null,
        count: clipboardData?.paths?.length || 0
    });
});

module.exports = router;
