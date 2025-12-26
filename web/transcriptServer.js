// ============================================================================
// TRANSCRIPT WEB SERVER - DISCORD STYLE
// Beautiful Discord-like transcript viewer
// ============================================================================

const express = require('express');
const path = require('path');
const zlib = require('zlib');

const app = express();
const PORT = process.env.TRANSCRIPT_PORT || 8080;

// DEBUG: Log EVERY single request
app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.originalUrl}`);
    next();
});

// Configure for large file uploads (up to 4GB, 30 min timeout)
app.use((req, res, next) => {
    req.setTimeout(1800000); // 30 minutes
    res.setTimeout(1800000);
    next();
});

// Debug: Log ALL incoming requests
app.use((req, res, next) => {
    if (req.path.includes('/files')) {
        console.log(`[Server] ${req.method} ${req.path} - Content-Length: ${req.headers['content-length'] || 'N/A'}`);
    }
    next();
});

let db = null;

// Compression helper - decompress transcript messages
function decompressMessages(messagesJson) {
    if (!messagesJson) return '[]';
    
    if (messagesJson.startsWith('COMPRESSED:')) {
        try {
            const base64Data = messagesJson.slice(11);
            const compressed = Buffer.from(base64Data, 'base64');
            const decompressed = zlib.inflateSync(compressed);
            return decompressed.toString('utf8');
        } catch (err) {
            console.error('[Transcript] Decompression error:', err.message);
            return '[]';
        }
    }
    
    return messagesJson;
}

// Transcript viewer route
app.get('/transcripts/:ticketId', (req, res) => {
    const { ticketId } = req.params;
    
    try {
        if (!db) {
            return res.status(500).send(generateErrorPage('Error', 'Database not connected'));
        }
        
        let transcript = null;
        try {
            transcript = db.prepare('SELECT * FROM transcripts WHERE ticket_id = ?').get(ticketId);
        } catch (e) {
            console.log('Transcript lookup error:', e.message);
        }
        
        if (!transcript) {
            return res.status(404).send(generateErrorPage('Transcript Not Found', 
                `No transcript found for ticket ${ticketId}.`));
        }
        
        let messages = [];
        try {
            // Decompress if needed
            const messagesJson = decompressMessages(transcript.messages_json || '[]');
            messages = JSON.parse(messagesJson);
        } catch (e) {
            messages = [];
        }
        
        let closeReason = 'Closed';
        try {
            const ticket = db.prepare('SELECT close_reason FROM tickets WHERE ticket_id = ?').get(ticketId);
            if (ticket?.close_reason) closeReason = ticket.close_reason;
        } catch (e) {}
        
        const html = generateTranscriptPage({
            ticketId: transcript.ticket_id,
            gameName: transcript.game_name || 'Unknown Game',
            closeReason,
            createdAt: transcript.created_at,
            messages,
            username: transcript.username,
            userId: transcript.user_id
        });
        
        res.send(html);
    } catch (err) {
        console.error('Transcript error:', err);
        res.status(500).send(generateErrorPage('Error', 'Failed to load transcript: ' + err.message));
    }
});

// List all transcripts - STAFF ONLY (requires ?key=secret)
app.get('/transcripts', (req, res) => {
    // Check for secret key (set in .env as TRANSCRIPT_LIST_KEY)
    const secretKey = process.env.TRANSCRIPT_LIST_KEY || 'staffonly2025';
    
    if (req.query.key !== secretKey) {
        return res.status(404).send(generateErrorPage('Not Found', 'The page you are looking for does not exist.'));
    }
    
    try {
        if (!db) {
            return res.status(500).send('Database not connected');
        }
        
        const transcripts = db.prepare('SELECT ticket_id, username, game_name, created_at FROM transcripts ORDER BY created_at DESC LIMIT 100').all();
        
        res.send(generateTranscriptListPage(transcripts));
    } catch (err) {
        res.status(500).send('Error: ' + err.message);
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', dbConnected: !!db });
});

// ============================================================================
// DISCORD-STYLE TRANSCRIPT PAGE
// ============================================================================

function generateTranscriptPage(data) {
    const { ticketId, gameName, closeReason, createdAt, messages, username, userId } = data;
    
    const createdDate = new Date(createdAt);
    const formattedDate = createdDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    const messagesHtml = messages.map((m, index) => {
        return generateMessageHtml(m, messages[index - 1]);
    }).join('');
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Transcript - ${escapeHtml(ticketId)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        :root {
            --background-primary: #313338;
            --background-secondary: #2b2d31;
            --background-tertiary: #1e1f22;
            --text-normal: #dbdee1;
            --text-muted: #949ba4;
            --text-link: #00a8fc;
            --header-primary: #f2f3f5;
            --brand-color: #5865f2;
            --green: #23a559;
            --yellow: #f0b232;
            --red: #f23f43;
        }
        
        body {
            font-family: 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background: var(--background-tertiary);
            color: var(--text-normal);
            font-size: 16px;
            line-height: 1.375;
        }
        
        /* Header */
        .transcript-header {
            background: var(--background-secondary);
            border-bottom: 1px solid var(--background-tertiary);
            padding: 16px 24px;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .header-content {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            gap: 16px;
        }
        
        .channel-icon {
            width: 24px;
            height: 24px;
            color: var(--text-muted);
        }
        
        .channel-name {
            font-size: 16px;
            font-weight: 600;
            color: var(--header-primary);
        }
        
        .ticket-info {
            margin-left: auto;
            display: flex;
            gap: 24px;
            font-size: 14px;
            color: var(--text-muted);
        }
        
        .ticket-info span {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        /* Info Banner */
        .info-banner {
            background: var(--background-secondary);
            max-width: 1200px;
            margin: 20px auto;
            border-radius: 8px;
            padding: 20px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
        }
        
        .info-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        
        .info-label {
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            color: var(--text-muted);
        }
        
        .info-value {
            font-size: 14px;
            color: var(--header-primary);
            font-weight: 500;
        }
        
        /* Messages Container */
        .messages-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 16px 100px;
        }
        
        /* Message Group */
        .message-group {
            padding: 2px 16px;
            margin-top: 17px;
            display: flex;
            gap: 16px;
        }
        
        .message-group:hover {
            background: rgba(0, 0, 0, 0.1);
        }
        
        .message-group.continued {
            margin-top: 0;
            padding-top: 0;
        }
        
        /* Avatar */
        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: var(--brand-color);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 16px;
            color: white;
            flex-shrink: 0;
        }
        
        .avatar.bot {
            background: var(--brand-color);
        }
        
        .avatar.user {
            background: var(--green);
        }
        
        .avatar img {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            object-fit: cover;
        }
        
        .continued .avatar {
            visibility: hidden;
            width: 40px;
        }
        
        /* Message Content */
        .message-content {
            flex: 1;
            min-width: 0;
        }
        
        .message-header {
            display: flex;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 2px;
        }
        
        .author-name {
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
        }
        
        .author-name:hover {
            text-decoration: underline;
        }
        
        .author-name.bot {
            color: var(--brand-color);
        }
        
        .author-name.user {
            color: var(--green);
        }
        
        .bot-badge {
            background: var(--brand-color);
            color: white;
            font-size: 10px;
            font-weight: 600;
            padding: 1px 5px;
            border-radius: 3px;
            text-transform: uppercase;
            display: inline-flex;
            align-items: center;
            gap: 2px;
            vertical-align: middle;
        }
        
        .bot-badge svg {
            width: 12px;
            height: 12px;
        }
        
        .timestamp {
            font-size: 12px;
            color: var(--text-muted);
            font-weight: 500;
        }
        
        .continued .message-header {
            display: none;
        }
        
        .continued .hover-timestamp {
            display: none;
            position: absolute;
            left: -50px;
            font-size: 11px;
            color: var(--text-muted);
        }
        
        .continued:hover .hover-timestamp {
            display: block;
        }
        
        /* Message Text */
        .message-text {
            color: var(--text-normal);
            word-wrap: break-word;
            white-space: pre-wrap;
        }
        
        .message-text a {
            color: var(--text-link);
            text-decoration: none;
        }
        
        .message-text a:hover {
            text-decoration: underline;
        }
        
        /* Embeds */
        .embed {
            max-width: 520px;
            margin-top: 8px;
            border-radius: 4px;
            background: var(--background-secondary);
            border-left: 4px solid var(--brand-color);
            padding: 8px 16px 16px 12px;
        }
        
        .embed.success { border-left-color: var(--green); }
        .embed.warning { border-left-color: var(--yellow); }
        .embed.error { border-left-color: var(--red); }
        
        .embed-author {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        
        .embed-author-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
        }
        
        .embed-author-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--header-primary);
        }
        
        .embed-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--header-primary);
            margin-bottom: 8px;
        }
        
        .embed-description {
            font-size: 14px;
            color: var(--text-normal);
            margin-bottom: 8px;
            white-space: pre-wrap;
        }
        
        .embed-fields {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 8px;
        }
        
        .embed-field {
            min-width: 0;
        }
        
        .embed-field.inline {
            grid-column: span 1;
        }
        
        .embed-field-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--header-primary);
            margin-bottom: 2px;
        }
        
        .embed-field-value {
            font-size: 14px;
            color: var(--text-normal);
            white-space: pre-wrap;
        }
        
        .embed-image {
            max-width: 100%;
            border-radius: 4px;
            margin-top: 8px;
        }
        
        .embed-footer {
            margin-top: 8px;
            font-size: 12px;
            color: var(--text-muted);
        }
        
        /* Attachments */
        .attachments {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
        }
        
        .attachment {
            max-width: 400px;
            border-radius: 8px;
            overflow: hidden;
            background: var(--background-secondary);
        }
        
        .attachment img {
            max-width: 100%;
            max-height: 350px;
            display: block;
            cursor: pointer;
        }
        
        .attachment-file {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px;
            background: var(--background-secondary);
            border-radius: 8px;
            text-decoration: none;
            color: var(--text-link);
        }
        
        .attachment-file:hover {
            background: var(--background-primary);
        }
        
        .attachment-icon {
            width: 40px;
            height: 40px;
            background: var(--brand-color);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .attachment-info {
            flex: 1;
        }
        
        .attachment-name {
            font-size: 16px;
            font-weight: 500;
            color: var(--text-link);
        }
        
        .attachment-size {
            font-size: 12px;
            color: var(--text-muted);
        }
        
        /* Date Divider */
        .date-divider {
            display: flex;
            align-items: center;
            margin: 24px 16px 8px;
        }
        
        .date-divider::before,
        .date-divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: var(--background-tertiary);
        }
        
        .date-divider span {
            padding: 0 16px;
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
        }
        
        /* Footer */
        .transcript-footer {
            text-align: center;
            padding: 40px 20px;
            color: var(--text-muted);
            font-size: 14px;
            border-top: 1px solid var(--background-secondary);
            margin-top: 40px;
        }
        
        .transcript-footer .brand {
            color: var(--brand-color);
            font-weight: 600;
        }
        
        /* Back Link */
        .back-link {
            color: var(--text-link);
            text-decoration: none;
            font-size: 14px;
        }
        
        .back-link:hover {
            text-decoration: underline;
        }
        
        /* Image Modal */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 1000;
            cursor: zoom-out;
            align-items: center;
            justify-content: center;
        }
        
        .modal.active {
            display: flex;
        }
        
        .modal img {
            max-width: 90%;
            max-height: 90%;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="transcript-header">
        <div class="header-content">
            <svg class="channel-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41045 9L8.35045 15H14.3504L15.4104 9H9.41045Z"/>
            </svg>
            <span class="channel-name">${escapeHtml(ticketId)}</span>
            <div class="ticket-info">
                <span>🎮 ${escapeHtml(gameName)}</span>
                <span>📅 ${formattedDate}</span>
            </div>
        </div>
    </div>
    
    <div class="info-banner">
        <div class="info-item">
            <span class="info-label">Ticket ID</span>
            <span class="info-value">${escapeHtml(ticketId)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">User</span>
            <span class="info-value">👤 ${escapeHtml(username || 'Unknown')}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Game</span>
            <span class="info-value">🎮 ${escapeHtml(gameName)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Status</span>
            <span class="info-value">🔒 ${escapeHtml(closeReason)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Messages</span>
            <span class="info-value">💬 ${messages.length}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Created</span>
            <span class="info-value">📅 ${formattedDate}</span>
        </div>
    </div>
    
    <div class="messages-container">
        <div class="date-divider">
            <span>${formattedDate}</span>
        </div>
        ${messagesHtml || '<div style="text-align: center; padding: 40px; color: var(--text-muted);">No messages in this transcript.</div>'}
    </div>
    
    <div class="transcript-footer">
        <p>This transcript was generated on ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'long' })}</p>
        <p style="margin-top: 8px;">Powered by <span class="brand">Pub's Bartender</span></p>
        <p style="margin-top: 16px;"><a href="/transcripts" class="back-link">← Back to all transcripts</a></p>
    </div>
    
    <div class="modal" onclick="this.classList.remove('active')">
        <img id="modal-image" src="" alt="">
    </div>
    
    <script>
        function openImage(src) {
            document.getElementById('modal-image').src = src;
            document.querySelector('.modal').classList.add('active');
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelector('.modal').classList.remove('active');
            }
        });
    </script>
</body>
</html>`;
}

function generateMessageHtml(message, prevMessage) {
    const isBot = message.author?.bot || 
                  message.author?.toLowerCase?.().includes('priyanshu') ||
                  message.authorId === 'bot';
    
    const authorName = message.author?.username || message.author || 'Unknown';
    const timestamp = new Date(message.timestamp || message.createdAt || Date.now());
    const timeStr = timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const fullTimeStr = timestamp.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
    
    // Check if this is a continuation of previous message (same author within 7 minutes)
    const isContinued = prevMessage && 
        (prevMessage.author?.username || prevMessage.author) === authorName &&
        (timestamp - new Date(prevMessage.timestamp || prevMessage.createdAt)) < 7 * 60 * 1000;
    
    // Get avatar initial
    const initial = authorName[0]?.toUpperCase() || '?';
    const avatarUrl = message.authorAvatar || message.avatar;
    
    // Build message content
    let contentHtml = '';
    
    // Text content
    if (message.content) {
        contentHtml += `<div class="message-text">${formatMessageContent(message.content)}</div>`;
    }
    
    // Embeds
    if (message.embeds && message.embeds.length > 0) {
        message.embeds.forEach(embed => {
            contentHtml += generateEmbedHtml(embed);
        });
    }
    
    // Attachments
    if (message.attachments && message.attachments.length > 0) {
        contentHtml += '<div class="attachments">';
        message.attachments.forEach(att => {
            contentHtml += generateAttachmentHtml(att);
        });
        contentHtml += '</div>';
    }
    
    // If no content at all
    if (!contentHtml) {
        contentHtml = '<div class="message-text" style="color: var(--text-muted); font-style: italic;">[No content]</div>';
    }
    
    const avatarHtml = avatarUrl 
        ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(authorName)}">`
        : initial;
    
    return `
        <div class="message-group ${isContinued ? 'continued' : ''}">
            <div class="avatar ${isBot ? 'bot' : 'user'}">
                ${avatarHtml}
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="author-name ${isBot ? 'bot' : 'user'}">${escapeHtml(authorName)}</span>
                    ${isBot ? '<span class="bot-badge"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.8 4.2 7.5 7.5 6.3 6.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4a1 1 0 0 0-1.4-1.4Z"/></svg>BOT</span>' : ''}
                    <span class="timestamp" title="${fullTimeStr}">${timeStr}</span>
                </div>
                ${contentHtml}
            </div>
        </div>
    `;
}

function generateEmbedHtml(embed) {
    let color = embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : 'var(--brand-color)';
    
    // Detect embed type for styling
    let embedClass = '';
    if (color.includes('00ff00') || color.includes('23a559') || embed.title?.includes('✅')) {
        embedClass = 'success';
    } else if (color.includes('ff0000') || color.includes('f23f43') || embed.title?.includes('❌')) {
        embedClass = 'error';
    } else if (color.includes('ffff00') || color.includes('f0b232') || embed.title?.includes('⚠️')) {
        embedClass = 'warning';
    }
    
    let html = `<div class="embed ${embedClass}" style="border-left-color: ${color};">`;
    
    // Author
    if (embed.author) {
        html += `<div class="embed-author">`;
        if (embed.author.icon_url) {
            html += `<img class="embed-author-icon" src="${escapeHtml(embed.author.icon_url)}" alt="">`;
        }
        html += `<span class="embed-author-name">${escapeHtml(embed.author.name || '')}</span>`;
        html += `</div>`;
    }
    
    // Title
    if (embed.title) {
        html += `<div class="embed-title">${escapeHtml(embed.title)}</div>`;
    }
    
    // Description
    if (embed.description) {
        html += `<div class="embed-description">${formatMessageContent(embed.description)}</div>`;
    }
    
    // Fields
    if (embed.fields && embed.fields.length > 0) {
        html += '<div class="embed-fields">';
        embed.fields.forEach(field => {
            html += `
                <div class="embed-field ${field.inline ? 'inline' : ''}">
                    <div class="embed-field-name">${escapeHtml(field.name || '')}</div>
                    <div class="embed-field-value">${formatMessageContent(field.value || '')}</div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    // Image
    if (embed.image?.url) {
        html += `<img class="embed-image" src="${escapeHtml(embed.image.url)}" alt="" onclick="openImage(this.src)" style="cursor: zoom-in;">`;
    }
    
    // Thumbnail
    if (embed.thumbnail?.url) {
        html += `<img class="embed-image" src="${escapeHtml(embed.thumbnail.url)}" alt="" onclick="openImage(this.src)" style="cursor: zoom-in; max-width: 80px; float: right;">`;
    }
    
    // Footer
    if (embed.footer?.text) {
        html += `<div class="embed-footer">${escapeHtml(embed.footer.text)}</div>`;
    }
    
    html += '</div>';
    return html;
}

function generateAttachmentHtml(attachment) {
    const url = attachment.url || attachment.proxyURL || attachment;
    const name = attachment.name || attachment.filename || 'attachment';
    const size = attachment.size ? formatBytes(attachment.size) : '';
    
    // Check if it's an image
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(name) || 
                    attachment.contentType?.startsWith('image/') ||
                    (typeof url === 'string' && /\.(jpg|jpeg|png|gif|webp)/i.test(url));
    
    if (isImage && typeof url === 'string') {
        return `
            <div class="attachment">
                <img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" onclick="openImage(this.src)" loading="lazy">
            </div>
        `;
    }
    
    // File attachment
    return `
        <a href="${escapeHtml(url)}" class="attachment-file" target="_blank" download>
            <div class="attachment-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                </svg>
            </div>
            <div class="attachment-info">
                <div class="attachment-name">${escapeHtml(name)}</div>
                ${size ? `<div class="attachment-size">${size}</div>` : ''}
            </div>
        </a>
    `;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatMessageContent(content) {
    if (!content) return '';
    
    let html = escapeHtml(content);
    
    // Convert URLs to links
    html = html.replace(
        /(https?:\/\/[^\s<]+)/g, 
        '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
    
    // Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic: *text* or _text_
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Code: `text`
    html = html.replace(/`([^`]+)`/g, '<code style="background: var(--background-tertiary); padding: 2px 6px; border-radius: 4px;">$1</code>');
    
    // User mentions: <@123456789>
    html = html.replace(/&lt;@!?(\d+)&gt;/g, '<span style="background: rgba(88,101,242,0.3); color: var(--brand-color); padding: 0 4px; border-radius: 4px;">@user</span>');
    
    // Channel mentions: <#123456789>
    html = html.replace(/&lt;#(\d+)&gt;/g, '<span style="background: rgba(88,101,242,0.3); color: var(--brand-color); padding: 0 4px; border-radius: 4px;">#channel</span>');
    
    // Emoji: :emoji_name:
    html = html.replace(/:([a-zA-Z0-9_]+):/g, '😊');
    
    return html;
}

// ============================================================================
// TRANSCRIPT LIST PAGE
// ============================================================================

function generateTranscriptListPage(transcripts) {
    const rows = transcripts.map(t => {
        const date = new Date(t.created_at).toLocaleString('en-US', { 
            dateStyle: 'medium', 
            timeStyle: 'short' 
        });
        return `
            <tr>
                <td><a href="/transcripts/${encodeURIComponent(t.ticket_id)}">${escapeHtml(t.ticket_id)}</a></td>
                <td>${escapeHtml(t.username || 'Unknown')}</td>
                <td>${escapeHtml(t.game_name || 'Unknown')}</td>
                <td>${date}</td>
            </tr>
        `;
    }).join('');
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>All Transcripts - Pub's Bartender</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Noto Sans', Arial, sans-serif;
            background: #1e1f22;
            color: #dbdee1;
            min-height: 100vh;
            padding: 40px 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #f2f3f5;
            margin-bottom: 8px;
            font-size: 28px;
        }
        .subtitle {
            color: #949ba4;
            margin-bottom: 24px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: #2b2d31;
            border-radius: 8px;
            overflow: hidden;
        }
        th, td {
            padding: 16px;
            text-align: left;
            border-bottom: 1px solid #1e1f22;
        }
        th {
            background: #313338;
            font-weight: 600;
            color: #f2f3f5;
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 0.5px;
        }
        tr:hover {
            background: #313338;
        }
        a {
            color: #00a8fc;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .brand {
            text-align: center;
            margin-top: 40px;
            color: #949ba4;
        }
        .brand span {
            color: #5865f2;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📜 All Transcripts</h1>
        <p class="subtitle">${transcripts.length} transcripts found</p>
        <table>
            <thead>
                <tr>
                    <th>Ticket ID</th>
                    <th>User</th>
                    <th>Game</th>
                    <th>Created</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="4" style="text-align: center; padding: 40px;">No transcripts found.</td></tr>'}
            </tbody>
        </table>
        <div class="brand">
            <p>Powered by <span>Pub's Bartender</span></p>
        </div>
    </div>
</body>
</html>`;
}

// ============================================================================
// ERROR PAGE
// ============================================================================

function generateErrorPage(title, message) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} - Pub's Bartender</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background: #1e1f22;
            color: #dbdee1;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .error-container {
            text-align: center;
            padding: 40px;
        }
        .error-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        h1 {
            color: #f23f43;
            margin-bottom: 16px;
        }
        p {
            color: #949ba4;
            margin-bottom: 24px;
        }
        a {
            color: #00a8fc;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">❌</div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        <a href="/transcripts">← Back to all transcripts</a>
    </div>
</body>
</html>`;
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function startServer(database, panelRefreshCallback = null) {
    db = database;
    
    console.log(`[TranscriptServer] Starting with panelRefreshCallback: ${panelRefreshCallback ? 'PROVIDED ✅' : 'NOT PROVIDED ❌'}`);
    
    // PUBLIC DOWNLOAD ROUTE - Users can download their tokens without login
    // This must be before dashboard/api routes
    app.get('/api/download/:filename', (req, res) => {
        try {
            const fileName = decodeURIComponent(req.params.filename);
            console.log(`[Download] Request for: ${fileName}`);
            
            // Try to get file from token generator pool
            let tokenGenerator;
            try {
                tokenGenerator = require('../utils/tokenGeneratorPool');
            } catch (e) {
                try {
                    tokenGenerator = require('../utils/tokenGenerator');
                } catch (e2) {
                    return res.status(500).send('Token generator not available');
                }
            }
            
            const filePath = tokenGenerator.getGeneratedFilePath(fileName);
            if (!filePath) {
                console.log(`[Download] File not found: ${fileName}`);
                return res.status(404).send('File not found or expired');
            }
            
            console.log(`[Download] Serving: ${filePath}`);
            res.download(filePath, fileName);
        } catch (err) {
            console.error('[Download] Error:', err.message);
            res.status(500).send('Download failed: ' + err.message);
        }
    });
    
    // Initialize dashboard with panel refresh callback
    try {
        const dashboard = require('./dashboard-v3');
        dashboard.init(app, database, panelRefreshCallback);
        console.log('✅ Dashboard V3 module loaded');
    } catch (err) {
        console.log('⚠️ Dashboard V3 not loaded:', err.message);
        // Fallback to old dashboard
        try {
            const dashboard = require('./dashboard');
            dashboard.init(app, database, panelRefreshCallback);
            console.log('✅ Dashboard (legacy) module loaded');
        } catch (err2) {
            console.log('⚠️ Dashboard not loaded:', err2.message);
        }
    }
    
    // Initialize API routes (for bot to call)
    try {
        // Use the dual-worker pool for 2x throughput
        let tokenGenerator;
        try {
            tokenGenerator = require('../utils/tokenGeneratorPool');
            console.log('✅ Token Generator Pool loaded (2 workers)');
        } catch (poolErr) {
            // Fallback to single generator if pool not available
            tokenGenerator = require('../utils/tokenGenerator');
            console.log('✅ Token Generator loaded (single worker)');
        }
        const api = require('./api');
        app.use('/api', api.init(database, tokenGenerator, panelRefreshCallback));
        console.log('✅ API module loaded');
    } catch (err) {
        console.log('⚠️ API not loaded:', err.message);
    }
    
    // Initialize compression maintenance (runs daily at 3 AM)
    try {
        const compression = require('../utils/compression');
        const path = require('path');
        
        // Schedule daily compression at 3 AM
        const scheduleCompression = () => {
            const now = new Date();
            const nextRun = new Date();
            nextRun.setHours(3, 0, 0, 0);
            if (nextRun <= now) {
                nextRun.setDate(nextRun.getDate() + 1);
            }
            const delay = nextRun - now;
            
            setTimeout(async () => {
                console.log('[Compression] Running scheduled maintenance...');
                try {
                    await compression.runMaintenance({
                        transcriptsDir: path.join(__dirname, '../transcripts'),
                        logsDir: path.join(__dirname, '../logs'),
                        db: database
                    });
                } catch (err) {
                    console.error('[Compression] Maintenance error:', err.message);
                }
                scheduleCompression(); // Schedule next run
            }, delay);
            
            console.log(`✅ Compression scheduled for ${nextRun.toLocaleString()}`);
        };
        
        scheduleCompression();
        
        // Also add manual compression endpoint
        app.post('/api/compress', async (req, res) => {
            try {
                const results = await compression.runMaintenance({
                    transcriptsDir: path.join(__dirname, '../transcripts'),
                    logsDir: path.join(__dirname, '../logs'),
                    db: database
                });
                res.json({ success: true, saved: compression.formatBytes(results.totalSaved) });
            } catch (err) {
                res.json({ success: false, error: err.message });
            }
        });
        
        // Compression stats endpoint
        app.get('/api/compression-stats', (req, res) => {
            const transcriptStats = compression.getCompressionStats(path.join(__dirname, '../transcripts'));
            const logStats = compression.getCompressionStats(path.join(__dirname, '../logs'));
            res.json({
                transcripts: transcriptStats,
                logs: logStats,
                formatBytes: (bytes) => compression.formatBytes(bytes)
            });
        });
        
        console.log('✅ Compression module loaded');
    } catch (err) {
        console.log('⚠️ Compression not loaded:', err.message);
    }
    
    return new Promise((resolve, reject) => {
        const server = app.listen(PORT, () => {
            console.log(`✅ Web server running on port ${PORT}`);
            console.log(`   Transcripts: http://localhost:${PORT}/transcripts`);
            console.log(`   Dashboard: http://localhost:${PORT}/dashboard`);
            console.log(`   API: http://localhost:${PORT}/api`);
            resolve(PORT);
        });
        
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`⚠️ Port ${PORT} already in use - server may be running in another process`);
                console.log(`   This is normal during restarts. The existing server will be used.`);
                resolve(PORT);
            } else {
                console.error('Server error:', err);
                reject(err);
            }
        });
    });
}

module.exports = { app, startServer, PORT };
