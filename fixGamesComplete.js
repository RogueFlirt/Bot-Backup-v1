// fixGamesComplete.js - Fix sizes AND folder names in one script
const Database = require('better-sqlite3');
const db = new Database('./database/bartender.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('COMPLETE GAME FIX - Sizes & Folder Names');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Step 1: Add folder_name column if not exists
console.log('Step 1: Adding folder_name column...');
try {
    db.exec('ALTER TABLE games ADD COLUMN folder_name TEXT');
    console.log('✅ Added folder_name column\n');
} catch (e) {
    if (e.message.includes('duplicate column')) {
        console.log('ℹ️ folder_name column already exists\n');
    } else {
        throw e;
    }
}

// Step 2: Game fixes - both size and folder_name
// Format: 'DB Name': { size: XX.XX, folder: 'Omega Folder Name' }
const gameFixes = {
    'Dead Space': { size: 36.33, folder: 'Dead Space' },
    'F1 25': { size: 84.4, folder: 'F1 25 Iconic Edition' },
    'F1 Manager 2024': { size: 17.49, folder: 'F1 Manager 2024' },
    'Football Manager 2026': { size: 7.14, folder: 'Football Manager 26' },
    'Judgment': { size: 61.59, folder: 'Lost Judgment' },
    'Like A Dragon Gaiden': { size: 87.26, folder: 'Like A Dragon The Man Who Erased His Name' },
    'Marvels Midnight Suns': { size: 57.17, folder: 'Marvels Midnight Suns' },
    'Raidou Remastered': { size: 16.17, folder: 'RAIDOU Remastered The Mystery of the Soulless Army' },
    'Smt Iii Nocturne': { size: 10.65, folder: 'Shin Megami Tensei III Nocturne HD Remaster' },
    'Smt V Vengeance': { size: 30.14, folder: 'Shin Megami Tensei V Vengeance' },
    'Sonic Crossworlds': { size: 15.9, folder: 'Sonic Racing Crossworlds' },
    'Civilization 7': { size: 17.6, folder: 'Sid Meiers Civilization VII' },
    'Demon Slayer Hinokami Chronicles': { size: 24.59, folder: 'Demon Slayer The Hinokami Chronicles' },
    'Demon Slayer Hinokami Chronicles 2': { size: 24.4, folder: 'Demon Slayer The Hinokami Chronicles 2' },
    'Warhammer 40k Chaos Gate': { size: 18.49, folder: 'Warhammer Chaos Gate Daemonhunters' },
    'Warhammer Realms Of Ruin': { size: 14.67, folder: 'Warhammer Age of Sigmar Realms of Ruin' },
};

console.log('Step 2: Updating game sizes and folder names...\n');

let sizeUpdates = 0;
let folderUpdates = 0;

for (const [dbName, fix] of Object.entries(gameFixes)) {
    // Find the game (try exact, then case-insensitive)
    let game = db.prepare('SELECT id, game_name FROM games WHERE game_name = ?').get(dbName);
    if (!game) {
        game = db.prepare('SELECT id, game_name FROM games WHERE LOWER(game_name) = LOWER(?)').get(dbName);
    }
    
    if (game) {
        // Update size
        if (fix.size > 0) {
            db.prepare('UPDATE games SET size_gb = ? WHERE id = ?').run(fix.size, game.id);
            sizeUpdates++;
        }
        
        // Update folder name
        if (fix.folder && fix.folder !== game.game_name) {
            db.prepare('UPDATE games SET folder_name = ? WHERE id = ?').run(fix.folder, game.id);
            folderUpdates++;
            console.log(`✅ ${game.game_name}`);
            console.log(`   Size: ${fix.size} GB`);
            console.log(`   Folder: ${fix.folder}\n`);
        } else {
            console.log(`✅ ${game.game_name}: ${fix.size} GB\n`);
        }
    } else {
        console.log(`⚠️ "${dbName}" not found in database\n`);
    }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✅ Size updates: ${sizeUpdates}`);
console.log(`✅ Folder updates: ${folderUpdates}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Step 3: Verify - show any games still missing sizes
console.log('Step 3: Verification...\n');
const missing = db.prepare('SELECT game_name FROM games WHERE size_gb = 0 OR size_gb IS NULL').all();
if (missing.length === 0) {
    console.log('✅ All games have sizes!');
} else {
    console.log(`⚠️ ${missing.length} games still need sizes:`);
    missing.forEach(g => console.log(`   • ${g.game_name}`));
}

// Show games with folder mappings
const withFolders = db.prepare('SELECT game_name, folder_name FROM games WHERE folder_name IS NOT NULL').all();
console.log(`\n📁 ${withFolders.length} games have custom folder names`);

db.close();
console.log('\n✅ Done! Restart bot to apply changes.');
