const { spawn } = require('child_process');

console.log('Starting Bartender Bot...');

// Start main bot
const bot = spawn('node', ['index.js'], { stdio: 'inherit', shell: true });

// Start transcript server
const server = spawn('node', ['web/transcriptServer.js'], { stdio: 'inherit', shell: true });

bot.on('close', (code) => {
    console.log(`Bot exited with code ${code}`);
    server.kill();
    process.exit(code);
});

server.on('close', (code) => {
    console.log(`Transcript server exited with code ${code}`);
});

process.on('SIGINT', () => {
    bot.kill();
    server.kill();
    process.exit();
});