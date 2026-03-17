"use strict";

const MAX_LOGS = 300;
const logs = [];
const subscribers = new Set();

function normalizeArg(arg) {
    if (arg instanceof Error) {
        return arg.stack || arg.message || String(arg);
    }

    if (typeof arg === 'string') {
        return arg;
    }

    try {
        return JSON.stringify(arg);
    } catch (e) {
        return String(arg);
    }
}

function emit(entry) {
    logs.push(entry);
    if (logs.length > MAX_LOGS) {
        logs.shift();
    }

    subscribers.forEach(cb => {
        try {
            cb(entry);
        } catch (e) {
            // ignore subscriber errors
        }
    });
}

function log(level, source) {
    const args = Array.prototype.slice.call(arguments, 2);
    emit({
        ts: Date.now(),
        level,
        source,
        message: args.map(normalizeArg).join(' ')
    });
}

function getLogs() {
    return logs.slice();
}

function subscribe(cb) {
    subscribers.add(cb);
    return function unsubscribe() {
        subscribers.delete(cb);
    };
}

module.exports = {
    log,
    getLogs,
    subscribe
};
