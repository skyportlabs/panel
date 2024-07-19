const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEST_DIR = path.join(os.tmpdir(), 'skyport');

if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
}

const itemsToMove = fs.readdirSync('.').filter(item => 
    !['.', '.git', 'move_files.js'].includes(item)
);

// Helper function to copy directories and their contents recursively
function copyRecursiveSync(source, destination) {
    const exists = fs.existsSync(source);
    const stats = exists && fs.lstatSync(source);
    const isDirectory = exists && stats.isDirectory();

    if (isDirectory) {
        if (!fs.existsSync(destination)) {
            fs.mkdirSync(destination, { recursive: true });
        }
        fs.readdirSync(source).forEach(childItemName => {
            copyRecursiveSync(path.join(source, childItemName), path.join(destination, childItemName));
        });
    } else {
        fs.copyFileSync(source, destination);
    }
}

itemsToMove.forEach(item => {
    const sourcePath = path.join('.', item);
    const destPath = path.join(DEST_DIR, item);

    copyRecursiveSync(sourcePath, destPath);

    if (fs.lstatSync(sourcePath).isDirectory()) {
        fs.rmdirSync(sourcePath, { recursive: true });
    } else {
        fs.unlinkSync(sourcePath);
    }
});

console.log(`Backup created at ${DEST_DIR}`);

execSync('git fetch origin');
execSync('git reset --hard origin/main');

fs.copyFileSync(path.join(DEST_DIR, 'skyport.db'), './skyport.db');
fs.copyFileSync(path.join(DEST_DIR, 'config.json'), './config.old.json');

execSync('npm install', { stdio: 'inherit' });

console.log("Update process completed successfully");