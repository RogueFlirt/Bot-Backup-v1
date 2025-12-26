// ============================================================================
// GEMINI SCREENSHOT VERIFICATION - FIXED VERSION
// Issues #8, #9 resolved - Stricter verification, checks both sizes
// ============================================================================

const fetch = require('node-fetch');

class GeminiVerifier {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
        this.enabled = !!apiKey;
        
        if (!apiKey) {
            console.log('[Gemini] No API key provided - verification disabled');
        } else {
            console.log('[Gemini] Verification enabled');
        }
    }
    
    /**
     * Verify screenshots for game activation
     * @param {Array} imageUrls - Array of image URLs to analyze
     * @param {Object} gameInfo - { gameName, expectedSize, folderName }
     * @returns {Object} - { decision: 'approve'|'reject'|'staff_review', reason, details }
     */
    async verifyScreenshots(imageUrls, gameInfo) {
        // If Gemini not configured, auto-approve
        if (!this.enabled) {
            console.log('[Gemini] Not enabled - auto-approving');
            return {
                decision: 'approve',
                reason: 'Auto-approved (verification not configured)',
                autoApproved: true
            };
        }
        
        try {
            // Convert image URLs to base64
            const imageParts = [];
            let tooSmallCount = 0;
            
            for (const url of imageUrls.slice(0, 4)) { // Max 4 images
                try {
                    const imageData = await this.fetchImageAsBase64(url);
                    if (imageData?.tooSmall) {
                        tooSmallCount++;
                        continue;
                    }
                    if (imageData && imageData.base64) {
                        imageParts.push({
                            inline_data: {
                                mime_type: imageData.mimeType,
                                data: imageData.base64
                            }
                        });
                        console.log(`[Gemini] Loaded image: ${imageData.mimeType}, ${(imageData.size / 1024).toFixed(1)}KB`);
                    }
                } catch (imgErr) {
                    console.log(`[Gemini] Failed to fetch image: ${imgErr.message}`);
                }
            }
            
            // Reject if all images were too small
            if (imageParts.length === 0 && tooSmallCount > 0) {
                console.log('[Gemini] All images too small - rejecting');
                return {
                    decision: 'reject',
                    reason: 'Screenshots are too small or invalid. Please upload actual full-size screenshots.',
                    details: { tooSmall: true }
                };
            }
            
            if (imageParts.length === 0) {
                console.log('[Gemini] No images could be processed - auto-approving');
                return {
                    decision: 'approve',
                    reason: 'Auto-approved (image processing failed)',
                    autoApproved: true
                };
            }
            
            const prompt = this.buildPrompt(gameInfo);
            
            const requestBody = {
                contents: [{
                    parts: [
                        { text: prompt },
                        ...imageParts
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 500
                }
            };
            
            console.log(`[Gemini] Sending request for ${gameInfo.gameName}...`);
            
            const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            console.log(`[Gemini] Response status: ${response.status}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.log(`[Gemini] API error ${response.status}: ${errorText}`);
                
                // Rate limited or error - auto-approve
                return {
                    decision: 'approve',
                    reason: 'Auto-approved (verification unavailable)',
                    autoApproved: true,
                    error: `API ${response.status}`
                };
            }
            
            const data = await response.json();
            
            // Log raw response for debugging
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'NO RESPONSE';
            console.log(`[Gemini] Raw response: ${rawText}`);
            
            const result = this.parseResponse(data);
            
            console.log(`[Gemini] Parsed decision: ${result.decision} - ${result.reason}`);
            if (result.details) {
                console.log(`[Gemini] Details: WUB color=${result.details.wubColor}, disabled=${result.details.wubDisabled}, folder=${result.details.folderName}, sizesMatch=${result.details.sizesMatch}`);
            }
            
            return result;
            
        } catch (error) {
            console.error('[Gemini] Verification error:', error.message);
            console.error('[Gemini] Stack:', error.stack);
            
            // Any error = auto-approve
            return {
                decision: 'approve',
                reason: 'Auto-approved (verification error)',
                autoApproved: true,
                error: error.message
            };
        }
    }
    
    // Simple, clear prompt - let Gemini do what it's good at
    buildPrompt(gameInfo) {
        const { gameName, expectedSize, folderName } = gameInfo;
        
        return `Check these screenshots for a game activation request.

EXPECTED GAME: ${gameName}
EXPECTED FOLDER: ${folderName || gameName}
${expectedSize ? `EXPECTED SIZE: ~${expectedSize} GB (allow ±1GB variance)` : ''}

CHECK 3 THINGS:

1. FOLDER NAME - Does it match "${folderName || gameName}"?
   - 60-70% similarity is OK (minor punctuation/special char differences fine)
   - Completely wrong game name = reject

2. FOLDER SIZE - Look at Properties window for "Size:" and "Size on disk:"
   - Both should be in GB (not MB/KB)
   - Both values should be close to each other (within 5GB)
${expectedSize ? `   - Should be around ${expectedSize} GB (±1GB is acceptable)
   - If more than 1GB off from ${expectedSize} GB = reject` : '   - Should be a reasonable game size (20-200 GB typically)'}
   - If no folder properties visible = staff_review

3. WINDOWS UPDATE BLOCKER - Look for "Service Status" icon on RIGHT side:
   - RED X = GOOD (disabled) → wubDisabled=true, wubColor="red"
   - GREEN CHECKMARK = BAD (enabled) → wubDisabled=false, wubColor="green" → REJECT
   - Ignore the radio button, only the STATUS ICON color matters!
   - If icon not visible = staff_review

DECISION:
- "approve" = Folder name matches, size is correct, WUB shows RED X
- "reject" = Wrong folder OR wrong size OR GREEN checkmark in WUB
- "staff_review" = Something not clearly visible

Respond with JSON only (no markdown):
{"sizeGB":0,"sizeOnDiskGB":0,"sizesMatch":true,"sizeOk":true,"folderName":"name you see","folderNameOk":true,"wubFound":true,"wubStatusVisible":true,"wubDisabled":true,"wubColor":"red","decision":"approve","reason":"explanation"}`;
    }
    
    parseResponse(data) {
        try {
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            // Clean up response - remove markdown code blocks if present
            let cleanText = text.trim();
            cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            cleanText = cleanText.trim();
            
            // Try to parse JSON
            const result = JSON.parse(cleanText);
            
            // Validate decision
            const validDecisions = ['approve', 'reject', 'staff_review'];
            if (!validDecisions.includes(result.decision)) {
                result.decision = 'staff_review';
                result.reason = result.reason || 'Invalid response from verification';
            }
            
            // Issue #8 - Check if sizes match
            if (result.sizesMatch === false) {
                console.log('[Gemini] Size and Size on disk mismatch - forcing reject');
                result.decision = 'reject';
                result.reason = `Size mismatch detected: Size=${result.sizeGB}GB but Size on disk=${result.sizeOnDiskGB}GB. Screenshots may be manipulated.`;
            }
            
            // NEW FIX: If no folder size visible (sizeGB is 0 or null), require staff review
            // This catches cases where only WUB screenshot is sent without folder properties
            if (!result.sizeGB || result.sizeGB === 0) {
                console.log('[Gemini] No folder size visible - forcing staff review');
                result.decision = 'staff_review';
                result.reason = 'Folder properties screenshot not found or size not visible. Please send screenshot of folder Properties showing Size.';
            }
            
            // Check WUB status visibility FIRST
            // If not visible, send to staff review (don't reject)
            if (result.wubStatusVisible === false || result.wubColor === 'not_visible') {
                console.log('[Gemini] WUB status icon not visible - forcing staff review');
                result.decision = 'staff_review';
                result.reason = 'Windows Update Blocker Service Status icon not clearly visible. Please retake screenshot showing full WUB window.';
            }
            // Check for green/enabled - MUST BE RED X TO APPROVE
            // Green checkmark = updates ENABLED = BAD = reject
            else if (result.wubColor === 'green' || result.wubDisabled === false) {
                console.log('[Gemini] WUB shows enabled (green checkmark) - forcing reject');
                result.decision = 'reject';
                result.reason = 'Windows Update Blocker shows ENABLED (green checkmark). You must click "Disable Updates" and "Apply Now" to show a RED X.';
            }
            // Extra check: if wubDisabled is not explicitly true, staff review
            else if (result.wubDisabled !== true) {
                console.log('[Gemini] WUB disabled status unclear - forcing staff review');
                result.decision = 'staff_review';
                result.reason = 'Cannot confirm Windows Update Blocker is disabled. Please ensure the Service Status shows a RED X.';
            }
            
            // Extra safety: if folder name doesn't match, force reject
            if (result.folderNameOk === false) {
                console.log('[Gemini] Folder name mismatch - forcing reject');
                result.decision = 'reject';
                result.reason = result.reason || `Folder name "${result.folderName}" does not match expected game.`;
            }
            
            return {
                decision: result.decision,
                reason: result.reason || 'No reason provided',
                details: {
                    sizeGB: result.sizeGB,
                    sizeOnDiskGB: result.sizeOnDiskGB,
                    sizesMatch: result.sizesMatch,
                    sizeOk: result.sizeOk,
                    folderName: result.folderName,
                    folderNameOk: result.folderNameOk,
                    wubFound: result.wubFound,
                    wubStatusVisible: result.wubStatusVisible,
                    wubDisabled: result.wubDisabled,
                    wubColor: result.wubColor
                }
            };
            
        } catch (parseError) {
            console.log('[Gemini] Failed to parse response:', parseError.message);
            
            // Can't parse = staff review
            return {
                decision: 'staff_review',
                reason: 'Could not parse verification response',
                parseError: true
            };
        }
    }
    
    async fetchImageAsBase64(url) {
        try {
            const response = await fetch(url, { timeout: 10000 });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const contentType = response.headers.get('content-type') || 'image/png';
            const buffer = await response.buffer();
            
            // Check minimum size (10KB) - real screenshots are 100KB+
            if (buffer.length < 10 * 1024) {
                console.log(`[Gemini] Image too small: ${(buffer.length / 1024).toFixed(1)}KB - rejecting`);
                return { tooSmall: true };
            }
            
            // Check max size (20MB limit)
            if (buffer.length > 20 * 1024 * 1024) {
                console.log(`[Gemini] Image too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
                return null;
            }
            
            return {
                base64: buffer.toString('base64'),
                mimeType: contentType.split(';')[0],
                size: buffer.length
            };
            
        } catch (error) {
            console.log(`[Gemini] Image fetch error: ${error.message}`);
            return null;
        }
    }
}

module.exports = GeminiVerifier;
