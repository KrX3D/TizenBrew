"use strict";

const fs = require('fs');

const TB_CONFIG_PATH = '/home/owner/share/tizenbrewConfig.json';

function readConfig() {
    if (!fs.existsSync(TB_CONFIG_PATH)) {
        return {
            modules: ["npm/@foxreis/tizentube"],
            autoLaunchServiceList: [],
            autoLaunchModule: '',
        };
    }
    return JSON.parse(fs.readFileSync(TB_CONFIG_PATH, 'utf8'));
}

function writeConfig(config) {
    // Write with 0666 so other apps (e.g. TizenBrew Installer running under a
    // different package UID) can also read and modify this file.
    fs.writeFileSync(TB_CONFIG_PATH, JSON.stringify(config, null, 4), { mode: 0o666 });
    // Belt-and-suspenders: chmod in case the file already existed as 0644
    try { fs.chmodSync(TB_CONFIG_PATH, 0o666); } catch (_) {}
}

module.exports = {
    readConfig,
    writeConfig
};