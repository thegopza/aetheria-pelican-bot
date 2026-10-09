// manager/installer.js — Game Patcher, Script Installer & Auto-Updater Module
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const https = require('https');

const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const ROOT_DIR = path.resolve(__dirname, '..');
const BOT_SRC = path.join(ROOT_DIR, 'bot.js');
const LOADER_SRC = path.join(ROOT_DIR, 'main.js');

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        }
    } catch (e) {
        console.warn('[Installer] Failed to read settings.json:', e.message);
    }
    return {};
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('[Installer] Failed to save settings.json:', e.message);
        return false;
    }
}

function getDefaultGamePath() {
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local');
    return path.join(localAppData, 'Programs', 'Aetheria Online');
}

function getEffectiveGamePath(overridePath) {
    if (overridePath && typeof overridePath === 'string' && overridePath.trim()) {
        return overridePath.trim();
    }
    const settings = loadSettings();
    if (settings.gamePath && typeof settings.gamePath === 'string' && settings.gamePath.trim()) {
        return settings.gamePath.trim();
    }
    return getDefaultGamePath();
}

function getFileHash(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const buffer = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(buffer).digest('hex');
    } catch (e) {
        return null;
    }
}

function checkStatus(overridePath) {
    const gamePath = getEffectiveGamePath(overridePath);
    const exePath = path.join(gamePath, 'Aetheria Online.exe');
    const resourcesPath = path.join(gamePath, 'resources');
    const appDir = path.join(resourcesPath, 'app');
    const loaderPath = path.join(appDir, 'main.js');
    const installedBotPath = path.join(resourcesPath, 'bot.js');
    const originalAsar = path.join(resourcesPath, 'app.asar.original');
    const disabledAsar = path.join(resourcesPath, 'app.asar.disabled');

    const hasExe = fs.existsSync(exePath);
    const hasResources = fs.existsSync(resourcesPath);
    const isValidFolder = hasExe || hasResources;

    const hasLoader = fs.existsSync(loaderPath);
    const hasBotScript = fs.existsSync(installedBotPath);
    const isInstalled = hasLoader && hasBotScript;

    const hasBackup = fs.existsSync(originalAsar) || fs.existsSync(disabledAsar);

    // Hash check for bot.js
    const srcHash = getFileHash(BOT_SRC);
    const installedHash = getFileHash(installedBotPath);
    const isUpToDate = isInstalled && (srcHash !== null) && (installedHash === srcHash);

    // Read installed package.json version if available
    let loaderVersion = '1.0.0';
    try {
        const pkgPath = path.join(appDir, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkg.version) loaderVersion = pkg.version;
        }
    } catch (e) {}

    return {
        gamePath,
        defaultPath: getDefaultGamePath(),
        isValidFolder,
        hasExe,
        hasResources,
        isInstalled,
        isUpToDate,
        hasBackup,
        loaderVersion,
        botModifiedTime: fs.existsSync(installedBotPath) ? fs.statSync(installedBotPath).mtime : null,
        sourceBotModifiedTime: fs.existsSync(BOT_SRC) ? fs.statSync(BOT_SRC).mtime : null
    };
}

function installScript(overridePath) {
    const status = checkStatus(overridePath);
    const gamePath = status.gamePath;
    const resourcesPath = path.join(gamePath, 'resources');

    if (!fs.existsSync(resourcesPath)) {
        try {
            fs.mkdirSync(resourcesPath, { recursive: true });
        } catch (e) {
            return { success: false, error: 'ไม่พบโฟลเดอร์ resources หรือไม่มีสิทธิ์สร้างโฟลเดอร์: ' + e.message };
        }
    }

    // 1. Backup app.asar if not already backed up
    const asarPath = path.join(resourcesPath, 'app.asar');
    const originalAsar = path.join(resourcesPath, 'app.asar.original');
    if (fs.existsSync(asarPath) && !fs.existsSync(originalAsar)) {
        try {
            fs.copyFileSync(asarPath, originalAsar);
            console.log('[Installer] Backed up original app.asar -> app.asar.original');
        } catch (e) {
            console.warn('[Installer] Warning backing up app.asar:', e.message);
        }
    }

    // 2. Create resources/app directory
    const appDir = path.join(resourcesPath, 'app');
    if (!fs.existsSync(appDir)) {
        fs.mkdirSync(appDir, { recursive: true });
    }

    // 3. Write package.json
    const packageJsonPath = path.join(appDir, 'package.json');
    const pkgContent = {
        name: 'aetheria-launcher',
        productName: 'Aetheria Online',
        version: '1.0.2',
        description: 'Aetheria Online for Windows + Pelican Auto-Injector',
        main: 'main.js',
        private: true
    };
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkgContent, null, 2), 'utf8');

    // 4. Copy loader main.js
    const targetLoaderPath = path.join(appDir, 'main.js');
    if (fs.existsSync(LOADER_SRC)) {
        fs.copyFileSync(LOADER_SRC, targetLoaderPath);
    } else {
        return { success: false, error: 'ไม่พบไฟล์ต้นฉบับ main.js ในโฟลเดอร์โปรเจกต์' };
    }

    // 5. Copy bot.js
    const targetBotPath = path.join(resourcesPath, 'bot.js');
    if (fs.existsSync(BOT_SRC)) {
        fs.copyFileSync(BOT_SRC, targetBotPath);
    } else {
        return { success: false, error: 'ไม่พบไฟล์ต้นฉบับ bot.js ในโฟลเดอร์โปรเจกต์' };
    }

    // Save game path to settings
    const settings = loadSettings();
    settings.gamePath = gamePath;
    saveSettings(settings);

    return {
        success: true,
        message: 'ติดตั้งและอัปเดตสคริปต์ Pelican ลงในเกมเรียบร้อยแล้ว!',
        gamePath,
        installedFiles: [
            targetLoaderPath,
            targetBotPath,
            packageJsonPath
        ]
    };
}

function restoreOriginal(overridePath) {
    const status = checkStatus(overridePath);
    const gamePath = status.gamePath;
    const resourcesPath = path.join(gamePath, 'resources');
    const originalAsar = path.join(resourcesPath, 'app.asar.original');
    const asarPath = path.join(resourcesPath, 'app.asar');
    const appDir = path.join(resourcesPath, 'app');

    if (fs.existsSync(originalAsar)) {
        try {
            fs.copyFileSync(originalAsar, asarPath);
        } catch (e) {
            return { success: false, error: 'กู้คืน app.asar ไม่สำเร็จ: ' + e.message };
        }
    }

    if (fs.existsSync(appDir)) {
        try {
            fs.rmSync(appDir, { recursive: true, force: true });
        } catch (e) {
            console.warn('[Installer] Could not remove app dir:', e.message);
        }
    }

    return {
        success: true,
        message: 'กู้คืนไฟล์เกมต้นฉบับเรียบร้อยแล้ว'
    };
}

function browseFolder() {
    return new Promise((resolve) => {
        const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Aetheria Online Game Folder'; $f.ShowNewFolderButton = $false; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }"`;
        exec(psCmd, { windowsHide: false }, (err, stdout) => {
            if (err || !stdout) {
                return resolve({ success: false, path: null });
            }
            const selected = stdout.trim();
            if (selected) {
                return resolve({ success: true, path: selected });
            }
            resolve({ success: false, path: null });
        });
    });
}

function checkManagerOnlineUpdate() {
    return new Promise((resolve) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/thegopza/aetheria-pelican-bot/commits/main',
            headers: {
                'User-Agent': 'Pelican-Manager-Updater'
            },
            timeout: 5000
        };

        const req = https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.sha) {
                        return resolve({
                            success: true,
                            latestCommit: json.sha.substring(0, 7),
                            commitMessage: json.commit?.message || '',
                            commitDate: json.commit?.committer?.date || '',
                            htmlUrl: json.html_url || ''
                        });
                    }
                    resolve({ success: false, error: 'Invalid response from GitHub' });
                } catch (e) {
                    resolve({ success: false, error: e.message });
                }
            });
        });

        req.on('error', (err) => resolve({ success: false, error: err.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: 'Connection timed out' });
        });
    });
}

module.exports = {
    getDefaultGamePath,
    getEffectiveGamePath,
    checkStatus,
    installScript,
    restoreOriginal,
    browseFolder,
    saveSettings,
    checkManagerOnlineUpdate
};
