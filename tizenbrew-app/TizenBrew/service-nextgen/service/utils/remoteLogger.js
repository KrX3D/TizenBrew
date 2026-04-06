"use strict";

const http   = require('http');
const logBus = require('./logBus.js');

let _cfg         = { enabled: false, ip: '', port: 3030 };
let _unsubscribe = null;

function sendEntry(entry) {
    if (!_cfg.enabled || !_cfg.ip || !_cfg.port) return;
    const body = JSON.stringify({
        ts:      entry.ts,
        level:   entry.level,
        source:  entry.source,
        message: entry.message
    });
    const req = http.request({
        hostname: _cfg.ip,
        port:     Number(_cfg.port),
        path:     '/log',
        method:   'POST',
        headers: {
            'Content-Type':   'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    }, () => {});
    req.on('error', () => {}); // ignore — TV may be offline
    req.write(body);
    req.end();
}

function start(cfg) {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
    _cfg = Object.assign({ enabled: false, ip: '', port: 3030 }, cfg || {});
    if (_cfg.enabled && _cfg.ip) {
        _unsubscribe = logBus.subscribe(sendEntry);
    }
}

module.exports = { start };
