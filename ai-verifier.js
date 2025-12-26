// ============================================================================
// AI SCREENSHOT VERIFICATION - MULTI-PROVIDER WITH FALLBACK
// Tries: Gemini → Groq → OpenAI → Together → Cloudflare → Anthropic → Staff Review
// NEVER auto-approves - always staff review as last resort
// ============================================================================

const fetch = require('node-fetch');

class AIVerifier {
    constructor(config = {}) {
        this.geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
        this.groqKey = config.groqApiKey || process.env.GROQ_API_KEY;
        this.cloudflareAccountId = config.cloudflareAccountId || process.env.CF_ACCOUNT_ID;
        this.cloudflareToken = config.cloudflareToken || process.env.CF_API_TOKEN;
        this.openaiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
        this.togetherKey = config.togetherApiKey || process.env.TOGETHER_API_KEY;
        this.anthropicKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
        
        // Callback to check if Gemini should be skipped (high load)
        this.shouldSkipGemini = config.shouldSkipGemini || (() => false);
        
        // Track which providers are available
        this.providers = [];
        if (this.geminiKey) this.providers.push('gemini');
        if (this.groqKey) this.providers.push('groq');
        if (this.openaiKey) this.providers.push('openai');
        if (this.togetherKey) this.providers.push('together');
        if (this.cloudflareAccountId && this.cloudflareToken) this.providers.push('cloudflare');
        if (this.anthropicKey) this.providers.push('anthropic');
        
        console.log(`[AIVerifier] Initialized with providers: ${this.providers.length > 0 ? this.providers.join(', ') : 'NONE (staff review only)'}`);
    }
    
    /**
     * Set the callback to check if Gemini should be skipped
     */
    setShouldSkipGemini(callback) {
        this.shouldSkipGemini = callback;
    }
    
    /**
     * Verify screenshots - tries all providers, falls back to staff review
     */
    async verifyScreenshots(imageUrls, gameInfo) {
        if (this.providers.length === 0) {
            console.log('[AIVerifier] No providers configured - sending to staff review');
            return {
                decision: 'staff_review',
                reason: 'No AI verification configured. Manual review required.',
                staffReview: true
            };
        }
        
        // Convert images to base64 once
        const images = [];
        for (const url of imageUrls.slice(0, 4)) {
            try {
                const imageData = await this.fetchImageAsBase64(url);
                if (imageData && !imageData.tooSmall) {
                    images.push(imageData);
                }
            } catch (err) {
                console.log(`[AIVerifier] Failed to fetch image: ${err.message}`);
            }
        }
        
        if (images.length === 0) {
            return {
                decision: 'staff_review',
                reason: 'Could not load screenshots for verification.',
                staffReview: true
            };
        }
        
        const prompt = this.buildPrompt(gameInfo);
        
        // Build list of providers to try, potentially skipping Gemini under high load
        let providersToTry = [...this.providers];
        if (this.shouldSkipGemini && this.shouldSkipGemini()) {
            providersToTry = providersToTry.filter(p => p !== 'gemini');
            console.log('[AIVerifier] Skipping Gemini (high load mode)');
        }
        
        // Try each provider in order
        for (const provider of providersToTry) {
            try {
                console.log(`[AIVerifier] Trying ${provider}...`);
                
                let result;
                switch (provider) {
                    case 'gemini':
                        result = await this.tryGemini(images, prompt, gameInfo);
                        break;
                    case 'groq':
                        result = await this.tryGroq(images, prompt, gameInfo);
                        break;
                    case 'openai':
                        result = await this.tryOpenAI(images, prompt, gameInfo);
                        break;
                    case 'together':
                        result = await this.tryTogether(images, prompt, gameInfo);
                        break;
                    case 'cloudflare':
                        result = await this.tryCloudflare(images, prompt, gameInfo);
                        break;
                    case 'anthropic':
                        result = await this.tryAnthropic(images, prompt, gameInfo);
                        break;
                }
                
                if (result && result.decision) {
                    console.log(`[AIVerifier] ${provider} succeeded: ${result.decision}`);
                    result.provider = provider;
                    return this.validateAndEnforce(result);
                }
                
            } catch (err) {
                console.log(`[AIVerifier] ${provider} failed: ${err.message}`);
                // Continue to next provider
            }
        }
        
        // All providers failed - staff review (NEVER auto-approve)
        console.log('[AIVerifier] All providers failed - sending to staff review');
        return {
            decision: 'staff_review',
            reason: 'AI verification unavailable. Manual review required.',
            staffReview: true,
            error: 'All providers failed'
        };
    }
    
    // ========================================================================
    // GEMINI PROVIDER
    // ========================================================================
    async tryGemini(images, prompt, gameInfo) {
        const imageParts = images.map(img => ({
            inline_data: { mime_type: img.mimeType, data: img.base64 }
        }));
        
        const response = await this.fetchWithRetry(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }, ...imageParts] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
                })
            },
            'Gemini'
        );
        
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log(`[Gemini] Response: ${text.substring(0, 200)}...`);
        
        return this.parseResponse(text);
    }
    
    // ========================================================================
    // GROQ PROVIDER (Llama 4 Scout Vision)
    // ========================================================================
    async tryGroq(images, prompt, gameInfo) {
        // Groq uses OpenAI-compatible format
        const imageContent = images.map(img => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
        }));
        
        const requestBody = {
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [{
                role: 'user',
                content: [{ type: 'text', text: prompt }, ...imageContent]
            }],
            temperature: 0.1,
            max_completion_tokens: 1000
        };
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.groqKey}`
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log(`[Groq] Error ${response.status}: ${errorText}`);
            throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }
        
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        console.log(`[Groq] Response: ${text.substring(0, 200)}...`);
        
        return this.parseResponse(text);
    }
    
    // ========================================================================
    // OPENAI PROVIDER (GPT-4o-mini Vision)
    // ========================================================================
    async tryOpenAI(images, prompt, gameInfo) {
        const imageContent = images.map(img => ({
            type: 'image_url',
            image_url: { 
                url: `data:${img.mimeType};base64,${img.base64}`,
                detail: 'high'
            }
        }));
        
        const requestBody = {
            model: 'gpt-4o-mini', // Cost-effective vision model
            messages: [{
                role: 'user',
                content: [{ type: 'text', text: prompt }, ...imageContent]
            }],
            temperature: 0.1,
            max_tokens: 500
        };
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.openaiKey}`
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log(`[OpenAI] Error ${response.status}: ${errorText}`);
            throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }
        
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        console.log(`[OpenAI] Response: ${text.substring(0, 200)}...`);
        
        return this.parseResponse(text);
    }
    
    // ========================================================================
    // TOGETHER AI PROVIDER (Free tier available)
    // ========================================================================
    async tryTogether(images, prompt, gameInfo) {
        // Together AI supports Llama vision models
        const imageContent = images.slice(0, 1).map(img => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
        }));
        
        const requestBody = {
            model: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',
            messages: [{
                role: 'user',
                content: [{ type: 'text', text: prompt }, ...imageContent]
            }],
            temperature: 0.1,
            max_tokens: 500
        };
        
        const response = await fetch('https://api.together.xyz/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.togetherKey}`
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log(`[Together] Error ${response.status}: ${errorText}`);
            throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }
        
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        console.log(`[Together] Response: ${text.substring(0, 200)}...`);
        
        return this.parseResponse(text);
    }
    
    // ========================================================================
    // CLOUDFLARE WORKERS AI PROVIDER (FIXED)
    // ========================================================================
    async tryCloudflare(images, prompt, gameInfo) {
        const image = images[0]; // CF only supports 1 image at a time
        
        // Cloudflare expects raw base64 (without data URL prefix)
        let base64Data = image.base64;
        if (base64Data.includes(',')) {
            base64Data = base64Data.split(',')[1]; // Remove "data:image/png;base64," prefix
        }
        
        // Use LLaVA model first (no license agreement needed)
        try {
            const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.cloudflareAccountId}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.cloudflareToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        prompt: prompt,
                        image: Array.from(Buffer.from(base64Data, 'base64')), // Convert to byte array
                        max_tokens: 500
                    })
                }
            );
            
            if (!response.ok) {
                const errorText = await response.text();
                console.log(`[Cloudflare-LLaVA] Error ${response.status}: ${errorText.substring(0, 200)}`);
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            const text = data.result?.description || data.result?.response || data.result?.output || '';
            console.log(`[Cloudflare-LLaVA] Response: ${text.substring(0, 200)}...`);
            
            return this.parseResponse(text);
        } catch (err) {
            console.log(`[Cloudflare-LLaVA] Failed: ${err.message}, trying Uform...`);
            // Try Uform model as backup
            return await this.tryCloudflareUform(images, prompt, gameInfo);
        }
    }
    
    // Alternative Cloudflare model - Uform (also no license needed)
    async tryCloudflareUform(images, prompt, gameInfo) {
        const image = images[0];
        
        // Cloudflare expects raw base64 (without data URL prefix)
        let base64Data = image.base64;
        if (base64Data.includes(',')) {
            base64Data = base64Data.split(',')[1];
        }
        
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.cloudflareAccountId}/ai/run/@cf/unum/uform-gen2-qwen-500m`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.cloudflareToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: prompt,
                    image: Array.from(Buffer.from(base64Data, 'base64')), // Convert to byte array
                    max_tokens: 500
                })
            }
        );
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log(`[Cloudflare-Uform] Error ${response.status}: ${errorText.substring(0, 200)}`);
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const text = data.result?.description || data.result?.response || data.result?.output || '';
        console.log(`[Cloudflare-Uform] Response: ${text.substring(0, 200)}...`);
        
        return this.parseResponse(text);
    }
    
    // Keep old alt method for reference but renamed
    async tryCloudflareAlt(images, prompt, gameInfo) {
        return this.tryCloudflareUform(images, prompt, gameInfo);
    }
    
    // ========================================================================
    // ANTHROPIC CLAUDE PROVIDER
    // ========================================================================
    async tryAnthropic(images, prompt, gameInfo) {
        const imageContent = images.map(img => ({
            type: 'image',
            source: {
                type: 'base64',
                media_type: img.mimeType,
                data: img.base64
            }
        }));
        
        const requestBody = {
            model: 'claude-3-haiku-20240307', // Fast and cheap vision model
            max_tokens: 500,
            messages: [{
                role: 'user',
                content: [
                    ...imageContent,
                    { type: 'text', text: prompt }
                ]
            }]
        };
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.anthropicKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log(`[Anthropic] Error ${response.status}: ${errorText}`);
            throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }
        
        const data = await response.json();
        const text = data.content?.[0]?.text || '';
        console.log(`[Anthropic] Response: ${text.substring(0, 200)}...`);
        
        return this.parseResponse(text);
    }
    
    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================
    
    async fetchWithRetry(url, options, providerName, maxRetries = 3) {
        let lastError;
        
        for (let i = 0; i <= maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                
                if (response.status === 429) {
                    // Rate limited - wait and retry
                    const waitTime = Math.pow(2, i) * 2000; // 2s, 4s, 8s
                    console.log(`[${providerName}] Rate limited, waiting ${waitTime/1000}s...`);
                    await new Promise(r => setTimeout(r, waitTime));
                    
                    // If this was the last retry, throw
                    if (i === maxRetries) {
                        throw new Error('Rate limit exceeded after retries');
                    }
                    continue;
                }
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                return response;
                
            } catch (err) {
                lastError = err;
                if (i < maxRetries) {
                    console.log(`[${providerName}] Retry ${i + 1}/${maxRetries}: ${err.message}`);
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }
        
        throw lastError;
    }
    
    async fetchImageAsBase64(url) {
        try {
            const response = await fetch(url, { timeout: 10000 });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const contentType = response.headers.get('content-type') || 'image/png';
            const buffer = await response.buffer();
            
            // Check size (10KB min, 20MB max)
            if (buffer.length < 10 * 1024) {
                return { tooSmall: true };
            }
            if (buffer.length > 20 * 1024 * 1024) {
                return { tooLarge: true };
            }
            
            // Normalize mime type
            let mimeType = contentType.split(';')[0].trim();
            if (!mimeType.startsWith('image/')) {
                mimeType = 'image/png';
            }
            // Convert webp to png for better compatibility
            if (mimeType === 'image/webp') {
                mimeType = 'image/png';
            }
            
            return {
                base64: buffer.toString('base64'),
                mimeType: mimeType,
                size: buffer.length
            };
            
        } catch (err) {
            console.log(`[AIVerifier] Image fetch error: ${err.message}`);
            return null;
        }
    }
    
    buildPrompt(gameInfo) {
        const { gameName, expectedSize, folderName } = gameInfo;
        
        return `Check these screenshots for a game activation request.

EXPECTED GAME: ${gameName}
EXPECTED FOLDER: ${folderName || gameName}
${expectedSize ? `EXPECTED SIZE: ~${expectedSize} GB (allow ±1GB variance)` : ''}

CHECK 3 THINGS:

1. FOLDER PROPERTIES WINDOW - Look for a Windows Properties dialog box
   - MUST show "Size:" and "Size on disk:" values in GB
   - If no Properties window visible = REJECT (not staff_review)
   - If Properties shows MB or KB instead of GB = REJECT
   - Set propertiesVisible=true ONLY if you clearly see the Properties dialog

2. FOLDER SIZE - From the Properties window:
   - Both Size and Size on disk should be in GB
   - Both values should be close (within 5GB of each other)
${expectedSize ? `   - Should be around ${expectedSize} GB (±1GB acceptable)
   - If more than 2GB off from ${expectedSize} GB = reject` : '   - Should be reasonable game size (20-200 GB typically)'}

3. WINDOWS UPDATE BLOCKER - Look for WUB window with "Service Status" icon:
   - RED X = GOOD (disabled) → wubDisabled=true, wubColor="red"
   - GREEN CHECKMARK = BAD (enabled) → REJECT immediately
   - If WUB not visible = staff_review
   - Only the STATUS ICON color matters, not any buttons

DECISION RULES:
- "approve" = Properties window visible with GB sizes + correct size + WUB shows RED X
- "reject" = No properties window OR wrong size OR green WUB OR MB/KB sizes
- "staff_review" = WUB not clearly visible but properties OK

CRITICAL: If you cannot see a Properties dialog box showing Size in GB, you MUST reject.

Respond with JSON only (no markdown):
{"propertiesVisible":true,"sizeGB":0,"sizeOnDiskGB":0,"sizesMatch":true,"sizeOk":true,"folderName":"name","folderNameOk":true,"wubFound":true,"wubStatusVisible":true,"wubDisabled":true,"wubColor":"red","decision":"approve","reason":"explanation"}`;
    }
    
    parseResponse(text) {
        try {
            // Clean up response
            let cleanText = text.trim();
            cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            cleanText = cleanText.trim();
            
            // Find JSON in response
            const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            
            const result = JSON.parse(jsonMatch[0]);
            
            // Validate decision
            const validDecisions = ['approve', 'reject', 'staff_review'];
            if (!validDecisions.includes(result.decision)) {
                result.decision = 'staff_review';
                result.reason = result.reason || 'Invalid AI response';
            }
            
            return {
                decision: result.decision,
                reason: result.reason || 'No reason provided',
                details: {
                    propertiesVisible: result.propertiesVisible,
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
            
        } catch (err) {
            console.log(`[AIVerifier] Parse error: ${err.message}`);
            return {
                decision: 'staff_review',
                reason: 'Could not parse AI response',
                parseError: true
            };
        }
    }
    
    /**
     * Enforce strict rules - NEVER auto-approve suspicious cases
     */
    validateAndEnforce(result) {
        if (!result.details) return result;
        
        const d = result.details;
        
        // Rule 0: No properties window visible = REJECT (most important!)
        if (d.propertiesVisible === false) {
            console.log('[AIVerifier] No properties window visible - forcing reject');
            result.decision = 'reject';
            result.reason = 'No folder Properties window visible. Please right-click the game folder → Properties and screenshot it.';
            return result;
        }
        
        // Rule 1: No folder size = reject (properties window required)
        if (!d.sizeGB || d.sizeGB === 0) {
            console.log('[AIVerifier] No folder size visible - forcing reject');
            result.decision = 'reject';
            result.reason = 'Folder size not visible. Please show folder Properties with Size in GB.';
            return result;
        }
        
        // Rule 2: Size mismatch = reject
        if (d.sizesMatch === false) {
            console.log('[AIVerifier] Size mismatch - forcing reject');
            result.decision = 'reject';
            result.reason = `Size mismatch: ${d.sizeGB}GB vs ${d.sizeOnDiskGB}GB on disk. May be manipulated.`;
            return result;
        }
        
        // Rule 3: WUB not visible = staff review
        if (d.wubStatusVisible === false || d.wubColor === 'not_visible') {
            console.log('[AIVerifier] WUB not visible - forcing staff review');
            result.decision = 'staff_review';
            result.reason = 'WUB Service Status not visible. Please show full WUB window.';
            return result;
        }
        
        // Rule 4: Green WUB = REJECT (critical!)
        if (d.wubColor === 'green' || d.wubDisabled === false) {
            console.log('[AIVerifier] Green WUB detected - forcing reject');
            result.decision = 'reject';
            result.reason = 'Windows Update Blocker shows ENABLED (green). Must show RED X (disabled).';
            return result;
        }
        
        // Rule 5: Wrong folder = reject
        if (d.folderNameOk === false) {
            console.log('[AIVerifier] Wrong folder name - forcing reject');
            result.decision = 'reject';
            result.reason = `Wrong folder: "${d.folderName}". Expected the correct game folder.`;
            return result;
        }
        
        return result;
    }
}

module.exports = AIVerifier;
