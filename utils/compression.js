// ============================================================================
// COMPRESSION UTILITY
// Save this file as: bot/utils/compression.js
// ============================================================================

const zlib = require('zlib');

/**
 * Compress a string using gzip
 */
function compress(data) {
    if (!data) return null;
    try {
        const buffer = Buffer.from(data, 'utf8');
        return zlib.gzipSync(buffer);
    } catch (err) {
        console.error('[Compression] Error compressing:', err.message);
        return null;
    }
}

/**
 * Decompress gzipped data back to string
 */
function decompress(data) {
    if (!data) return null;
    try {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        return zlib.gunzipSync(buffer).toString('utf8');
    } catch (err) {
        console.error('[Compression] Error decompressing:', err.message);
        return null;
    }
}

/**
 * Compress JSON object
 */
function compressJSON(obj) {
    if (!obj) return null;
    try {
        const json = JSON.stringify(obj);
        return compress(json);
    } catch (err) {
        console.error('[Compression] Error compressing JSON:', err.message);
        return null;
    }
}

/**
 * Decompress to JSON object
 */
function decompressJSON(data) {
    if (!data) return null;
    try {
        const json = decompress(data);
        return json ? JSON.parse(json) : null;
    } catch (err) {
        console.error('[Compression] Error decompressing JSON:', err.message);
        return null;
    }
}

module.exports = {
    compress,
    decompress,
    compressJSON,
    decompressJSON
};




