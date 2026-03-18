"use strict";

const fs = require('fs');

const TB_CONFIG_PATH = '/home/owner/share/tizenbrewConfig.json';

function readConfig() {
    if (!fs.existsSync(TB_CONFIG_PATH)) {
        return {
            modules: ["npm/@foxreis/tizentube"],
            autoLaunchServiceList: [],
            autoLaunchModule: ''
        };
    }
    return JSON.parse(fs.readFileSync(TB_CONFIG_PATH, 'utf8'));
}

function writeConfig(config) {
    // 0666 so other apps (e.g. TizenBrew Installer) can also read/write this file
    fs.writeFileSync(TB_CONFIG_PATH, JSON.stringify(config, null, 4), { mode: 0o666 });
    try { fs.chmodSync(TB_CONFIG_PATH, 0o666); } catch (_) {}
}

// Normalise a raw module entry (string or object) into { moduleName, sourceMode }
function parseModuleEntry(entry) {
    if (typeof entry === 'string') {
        return { moduleName: entry, sourceMode: 'cdn' };
    }
    if (entry && typeof entry === 'object') {
        return {
            moduleName: entry.name || entry.module || '',
            sourceMode: entry.sourceMode === 'direct' ? 'direct' : 'cdn'
        };
    }
    return { moduleName: '', sourceMode: 'cdn' };
}

module.exports = { readConfig, writeConfig, parseModuleEntry };