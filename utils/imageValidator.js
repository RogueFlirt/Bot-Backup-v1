// ============================================================================
// IMAGE VALIDATOR v6 - FIXED LOGIC + UNIVERSAL
// ============================================================================

const Tesseract = require('tesseract.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function validateScreenshot(imageUrl, expectedSizeGB) {
    console.log('🔍 Starting image validation...');
    console.log(`   Expected size: ${expectedSizeGB} GB`);
    
    const result = {
        success: false,
        sizeDetected: null,
        sizeValid: false,
        wubDetected: false,
        wubEnabled: false,
        confidence: 'low',
        rawText: '',
        message: '',
        needsStaffReview: false
    };
    
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);
        
        const buffer = await response.buffer();
        const tempPath = path.join(__dirname, '../temp_screenshot.png');
        fs.writeFileSync(tempPath, buffer);
        
        console.log('🔍 Running OCR...');
        
        const { data: { text } } = await Tesseract.recognize(tempPath, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    process.stdout.write(`\r   OCR Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });
        
        console.log('\n✅ OCR Complete');
        try { fs.unlinkSync(tempPath); } catch(e) {}
        
        result.rawText = text;
        const analysis = analyzeText(text, expectedSizeGB);
        
        result.sizeDetected = analysis.detectedSize;
        result.sizeValid = analysis.sizeValid;
        result.wubDetected = analysis.wubDetected;
        result.wubEnabled = analysis.wubEnabled;
        result.confidence = analysis.confidence;
        
        // ========================================
        // DECISION LOGIC - FIXED
        // ========================================
        
        // BEST CASE: Size valid AND WUB confirmed enabled
        if (result.sizeValid && result.wubEnabled) {
            result.success = true;
            result.message = `✅ **Verified!**\n📦 Detected: ${result.sizeDetected} GB\n📋 Required: ${expectedSizeGB} GB (±1GB)\n🛡️ Windows Update Blocker: Enabled\n📊 Status: **Good to go!**`;
        }
        // Size valid, WUB detected but not confirmed enabled
        else if (result.sizeValid && result.wubDetected && !result.wubEnabled) {
            result.success = true; // Allow it - WUB is visible
            result.message = `✅ **Verified!**\n📦 Detected: ${result.sizeDetected} GB\n📋 Required: ${expectedSizeGB} GB (±1GB)\n🛡️ Windows Update Blocker: Detected\n📊 Status: **Good to go!**`;
        }
        // Size valid, no WUB visible at all
        else if (result.sizeValid && !result.wubDetected) {
            result.needsStaffReview = true;
            result.message = `⚠️ **Needs Review**\n📦 Detected: ${result.sizeDetected} GB ✅\n🛡️ Windows Update Blocker: **Not visible in screenshot**\n📊 Status: Staff review required`;
        }
        // Size detected but doesn't match
        else if (result.sizeDetected && !result.sizeValid) {
            result.needsStaffReview = true;
            result.message = `❌ **Size Mismatch**\n📦 Detected: ${result.sizeDetected} GB\n📋 Required: ${expectedSizeGB} GB (±1GB)\n📊 Status: Staff review required`;
        }
        // Couldn't detect size at all
        else {
            result.needsStaffReview = true;
            result.message = `⚠️ **Could not verify**\nUnable to detect file size from screenshot.\n📊 Status: Staff review required`;
        }
        
        return result;
    } catch (error) {
        console.error('❌ Error:', error.message);
        result.needsStaffReview = true;
        result.message = `❌ **Validation Error**\n📊 Status: Staff review required`;
        return result;
    }
}

function analyzeText(text, expectedSizeGB) {
    const result = {
        detectedSize: null,
        sizeValid: false,
        wubDetected: false,
        wubEnabled: false,
        confidence: 'low'
    };
    
    const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    const lowerText = cleanText.toLowerCase();
    
    console.log('🔍 Analyzing...');
    
    let detectedSizes = [];
    
    // ========================================
    // METHOD 1: Find large digit sequences (bytes)
    // ========================================
    
    const digitSequences = cleanText.match(/\d[\d\s.,]{8,20}\d/g) || [];
    
    for (const seq of digitSequences) {
        const digitsOnly = seq.replace(/\D/g, '');
        if (digitsOnly.length >= 9 && digitsOnly.length <= 15) {
            const bytes = parseInt(digitsOnly);
            const gb = bytes / (1024 * 1024 * 1024);
            if (gb >= 0.5 && gb <= 500) {
                const rounded = Math.round(gb * 100) / 100;
                console.log(`   Found byte sequence: "${seq}" -> ${rounded} GB`);
                detectedSizes.push({ size: rounded, priority: 1 });
            }
        }
    }
    
    // ========================================
    // METHOD 2: Decimal GB patterns
    // ========================================
    
    const decimalGB = cleanText.match(/(\d{1,3})[.,](\d{1,2})\s*(?:gb|go|гб)/gi) || [];
    for (const match of decimalGB) {
        const nums = match.match(/(\d{1,3})[.,](\d{1,2})/);
        if (nums) {
            const size = parseFloat(`${nums[1]}.${nums[2]}`);
            if (size >= 0.5 && size <= 500) {
                console.log(`   Found decimal GB: "${match}" -> ${size} GB`);
                detectedSizes.push({ size, priority: 2 });
            }
        }
    }
    
    // ========================================
    // METHOD 3: Whole GB (skip small numbers)
    // ========================================
    
    const wholeGB = cleanText.match(/(?<![a-z])(\d{1,3})\s*(?:gb|go|гб)(?![a-z])/gi) || [];
    for (const match of wholeGB) {
        const num = match.match(/(\d{1,3})/);
        if (num) {
            const size = parseInt(num[1]);
            if (size >= 5 && size <= 500) {
                const isDupe = detectedSizes.some(s => Math.abs(s.size - size) < 1);
                if (!isDupe) {
                    console.log(`   Found whole GB: "${match}" -> ${size} GB`);
                    detectedSizes.push({ size, priority: 3 });
                }
            }
        }
    }
    
    // ========================================
    // SELECT BEST SIZE
    // ========================================
    
    if (detectedSizes.length > 0) {
        const unique = [];
        for (const s of detectedSizes) {
            if (!unique.some(u => Math.abs(u.size - s.size) < 0.5)) {
                unique.push(s);
            }
        }
        
        unique.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return Math.abs(a.size - expectedSizeGB) - Math.abs(b.size - expectedSizeGB);
        });
        
        result.detectedSize = unique[0].size;
        
        // If expected size is 0 or not set, skip size validation (approve any detected size)
        if (!expectedSizeGB || expectedSizeGB === 0) {
            result.sizeValid = true; // Can't validate, assume OK
            console.log(`   Best: ${result.detectedSize} GB | Expected: NOT SET | Skipping size validation`);
        } else {
            const margin = Math.max(1.5, expectedSizeGB * 0.15);
            const diff = Math.abs(result.detectedSize - expectedSizeGB);
            result.sizeValid = diff <= margin;
            console.log(`   Best: ${result.detectedSize} GB | Expected: ${expectedSizeGB} GB | Diff: ${diff.toFixed(2)} | Valid: ${result.sizeValid}`);
        }
    }
    
    // ========================================
    // WUB DETECTION
    // ========================================
    
    const wubPatterns = [
        'windows update blocker', 'update blocker', 'wub v',
        'disable updates', 'enable updates', 'service status',
        'protect service', 'bloqueador', 'blocker v1', 'blocker v2',
        'apply now', 'aplicar agora'
    ];
    
    for (const pattern of wubPatterns) {
        if (lowerText.includes(pattern)) {
            result.wubDetected = true;
            console.log(`   WUB detected: "${pattern}"`);
            break;
        }
    }
    
    if (result.wubDetected) {
        const disabledPatterns = ['disable', 'disabled', 'desativ', 'stopped', 'bloqueado'];
        for (const pattern of disabledPatterns) {
            if (lowerText.includes(pattern)) {
                result.wubEnabled = true;
                console.log(`   WUB: Updates DISABLED`);
                break;
            }
        }
    }
    
    // Confidence
    if (result.sizeValid && result.wubDetected) result.confidence = 'high';
    else if (result.sizeDetected && result.wubDetected) result.confidence = 'medium';
    else if (result.sizeDetected) result.confidence = 'low';
    else result.confidence = 'none';
    
    console.log(`   Confidence: ${result.confidence}`);
    return result;
}

module.exports = { validateScreenshot };
