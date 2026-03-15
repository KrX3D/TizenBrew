"use strict";

const fs = require('fs');

const CONFIG_PATH = '/home/owner/share/tizenbrewConfig.json';
const CONFIG_DIR  = '/home/owner/share';

function diagnoseConfig() {
    const lines = [];
    lines.push('=== Config Diagnostic ===');
    lines.push('Path: ' + CONFIG_PATH);

    // Check directory
    try {
        const dirStat = fs.statSync(CONFIG_DIR);
        const dirMode = '0' + (dirStat.mode & parseInt('777', 8)).toString(8);
        lines.push('Dir exists: YES, mode: ' + dirMode);
    } catch (e) {
        lines.push('Dir exists: NO (' + e.message + ')');
    }

    // Check dir writability
    try {
        fs.accessSync(CONFIG_DIR, fs.constants.W_OK);
        lines.push('Dir writable: YES');
    } catch (e) {
        lines.push('Dir writable: NO (' + e.message + ')');
    }

    // List dir contents
    try {
        const files = fs.readdirSync(CONFIG_DIR);
        lines.push('Dir contents: ' + (files.length ? files.join(', ') : '(empty)'));
    } catch (e) {
        lines.push('Dir listing: FAILED (' + e.message + ')');
    }

    // Check file
    const fileExists = fs.existsSync(CONFIG_PATH);
    lines.push('File exists: ' + (fileExists ? 'YES' : 'NO'));

    if (fileExists) {
        try {
            const stat = fs.statSync(CONFIG_PATH);
            const mode = '0' + (stat.mode & parseInt('777', 8)).toString(8);
            lines.push('File size: ' + stat.size + ' bytes, mode: ' + mode);
        } catch (e) {
            lines.push('File stat: FAILED (' + e.message + ')');
        }

        try {
            fs.accessSync(CONFIG_PATH, fs.constants.R_OK);
            lines.push('File readable: YES');
        } catch (e) {
            lines.push('File readable: NO (' + e.message + ')');
        }

        try {
            fs.accessSync(CONFIG_PATH, fs.constants.W_OK);
            lines.push('File writable: YES');
        } catch (e) {
            lines.push('File writable: NO (' + e.message + ')');
        }

        // Read first 200 chars to spot corruption
        try {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
            lines.push('File content (first 200): ' + raw.substring(0, 200));
        } catch (e) {
            lines.push('File read: FAILED (' + e.message + ')');
        }
    }

    return lines.join('\n');
}

function readConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            return {
                modules: ['npm/@foxreis/tizentube'],
                autoLaunchServiceList: [],
                autoLaunchModule: '',
            };
        }
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        console.log('[configuration] readConfig error: ' + e.message + ' — returning defaults');
        return {
            modules: ['npm/@foxreis/tizentube'],
            autoLaunchServiceList: [],
            autoLaunchModule: '',
        };
    }
}

function writeConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
}

module.exports = {
    readConfig,
    writeConfig,
    diagnoseConfig,
    CONFIG_PATH
};