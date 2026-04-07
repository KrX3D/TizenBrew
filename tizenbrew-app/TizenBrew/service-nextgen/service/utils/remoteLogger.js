"use strict";

const http   = require('http');
const logBus = require('./logBus.js');

let _cfg         = { enabled: false, ip: '', port: 3030 };
let _unsubscribe = null;

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function pad3(n) { return n < 100 ? (n < 10 ? '00' : '0') + n : '' + n; }

function fmtTs(epochMs) {
    var d = new Date(epochMs);
    return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate())
        + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
        + '.' + pad3(d.getMilliseconds());
}

// Build a pre-formatted string matching TizenYouTube's formatForRemote()
// so the PS1 receiver displays it identically.
function buildFormatted(entry) {
    var ts  = fmtTs(entry.ts);
    var ctx = entry.source || 'service';
    var lines = [
        '',
        '─────────────────────────────────────────────────────────────────────',
        '[' + ts + '] ▶ ' + ctx.toUpperCase(),
        '─────────────────────────────────────────────────────────────────────',
        '  [' + (entry.level || 'INFO').padEnd(5) + '] ' + ts.slice(11) + '  ' + (entry.message || '')
    ];
    return lines.join('\n');
}

function sendEntry(entry) {
    if (!_cfg.enabled || !_cfg.ip || !_cfg.port) return;
    var ts = fmtTs(entry.ts);
    var body = JSON.stringify({
        _formatted: buildFormatted(entry),
        app:        'TizenBrew',
        ts:         ts,
        level:      entry.level,
        context:    entry.source,   // receiver field is 'context'
        message:    entry.message,
        uptime:     entry.ts
    });
    var req = http.request({
        hostname: _cfg.ip,
        port:     Number(_cfg.port),
        path:     '/tv-log',
        method:   'POST',
        headers: {
            'Content-Type':   'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    }, function() {});
    req.on('error', function() {}); // ignore — receiver may be offline
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
