"use strict";

const fs = require('fs');

const TB_CONFIG_PATH = '/home/owner/share/tizenbrewConfig.json';

const REMOTE_LOGGING_DEFAULTS = { enabled: false, ip: '', port: 3030 };

function readConfig() {
    const defaults = {
        modules: [],
        autoLaunchServiceList: [],
        autoLaunchModule: '',
        defaultModule: '',
        remoteLogging: Object.assign({}, REMOTE_LOGGING_DEFAULTS)
    };
    if (!fs.existsSync(TB_CONFIG_PATH)) return defaults;
    const cfg = JSON.parse(fs.readFileSync(TB_CONFIG_PATH, 'utf8'));
    // Back-fill fields missing from older config files
    if (!cfg.remoteLogging) cfg.remoteLogging = Object.assign({}, REMOTE_LOGGING_DEFAULTS);
    if (cfg.defaultModule === undefined) cfg.defaultModule = '';
    return cfg;
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