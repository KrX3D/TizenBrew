"use strict";

const CDP = require('chrome-remote-interface');
const fetch = require('node-fetch');
const { Events } = require('./wsCommunication.js');
const { readConfig } = require('./configuration.js');
const WebSocket = require('ws');
const logBus = require('./logBus.js');

const modulesCache = new Map();

// Build the URL to fetch the userscript, respecting sourceMode.
// Mirrors the logic in moduleSource.js / the proxy.
function buildScriptUrl(mdl) {
    const fullName    = mdl.versionedFullName || mdl.fullName;
    const sourceMode  = mdl.sourceMode || 'cdn';
    const mainFile    = mdl.mainFile || '';

    // Parse "gh/user/repo@branch" or "npm/@scope/pkg@version"
    const firstSlash  = fullName.indexOf('/');
    const type        = firstSlash !== -1 ? fullName.substring(0, firstSlash) : '';
    const nameAndTag  = firstSlash !== -1 ? fullName.substring(firstSlash + 1) : fullName;

    if (type === 'gh') {
        // nameAndTag is "user/repo@branch"
        const secondSlash   = nameAndTag.indexOf('/');
        const repoAndBranch = secondSlash !== -1 ? nameAndTag.substring(secondSlash + 1) : nameAndTag;
        const atIdx         = repoAndBranch.indexOf('@');
        const branch        = atIdx !== -1 ? repoAndBranch.substring(atIdx + 1) : 'main';
        const repoName      = atIdx !== -1
            ? nameAndTag.substring(0, secondSlash + 1 + atIdx)
            : nameAndTag;

        if (sourceMode === 'direct') {
            return `https://raw.githubusercontent.com/${repoName}/refs/heads/${branch}/${mainFile}`;
        }
        return `https://cdn.jsdelivr.net/gh/${repoName}@${branch}/${mainFile}`;
    }

    if (type === 'npm') {
        // nameAndTag is "@scope/pkg@version" or "pkg@version"
        const atIdx  = nameAndTag.lastIndexOf('@');
        // only strip version if there's an @ after position 0 (scoped packages start with @)
        const pkgName = (atIdx > 0) ? nameAndTag.substring(0, atIdx) : nameAndTag;

        if (sourceMode === 'direct') {
            return `https://unpkg.com/${pkgName}/${mainFile}`;
        }
        return `https://cdn.jsdelivr.net/npm/${pkgName}/${mainFile}`;
    }

    // Fallback — original behaviour
    return `https://cdn.jsdelivr.net/${fullName}/${mainFile}`;
}

function startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts) {
    if (!attempts) attempts = 1;
    if (!isAnotherApp) inDebug.tizenDebug = true;
    logBus.log('DEBUG', 'cdp', 'startDebugging called on port ' + port + ' for ' + (mdl.name || '(none)'));
    try {
        CDP({ port, host: ip, local: true }, (client) => {
            client.Runtime.enable();
            client.Debugger.enable();

            // Poll window.__ttLogQueue every second to drain TizenTube log entries.
            // Cobalt blocks XHR/WS from the HTTPS YouTube TV context to localhost,
            // so TizenTube pushes entries into this queue and we read them via CDP.
            logBus.log('DEBUG', 'cdp', 'log poll starting');
            var pollCount = 0;
            var logPollInterval = setInterval(function () {
                pollCount++;
                // Log first 3 ticks to confirm the poll is running
                if (pollCount <= 3) logBus.log('DEBUG', 'cdp', 'poll tick ' + pollCount);
                client.Runtime.evaluate({
                    expression: '(function(){ try { var q=window.__ttLogQueue; if(!Array.isArray(q)||q.length===0) return null; return JSON.stringify(q.splice(0)); } catch(e) { return "err:"+String(e); } })()',
                    returnByValue: true
                }).then(function (res) {
                    var val = res && res.result && res.result.value;
                    if (!val) return;
                    if (String(val).startsWith('err:')) {
                        logBus.log('ERROR', 'cdp', 'queue eval error: ' + val);
                        return;
                    }
                    try {
                        var entries = JSON.parse(val);
                        for (var i = 0; i < entries.length; i++) {
                            var e = entries[i];
                            if (e && typeof e === 'object') {
                                logBus.log(e.level || 'INFO', e.context || 'TizenTube', e._formatted || e.message || '');
                            }
                        }
                    } catch (_) {}
                }).catch(function () {});
            }, 1000);

            // Fallback: if CDP connected after the page was already loaded,
            // executionContextCreated was missed and the script was never injected.
            // mdl.name is empty at CDP-connect time and only set when LaunchModule fires
            // (~3s later), so we poll until it's populated then inject if needed.
            // We eval the script source directly instead of creating a <script> tag
            // because Tizen 6.5 Cobalt enforces Trusted Types (blocks script.src assignment).
            var fallbackInterval = setInterval(function () {
                if (!mdl.name || mdl.evaluateScriptOnDocumentStart) return;
                var cacheKey = (mdl.versionedFullName || mdl.fullName) + ':' + (mdl.sourceMode || 'cdn');
                var scriptUrl = buildScriptUrl(mdl);

                client.Runtime.evaluate({
                    expression: '(function(){try{if(!document.head)return "no-head";if(window.__tbInjected)return "already";return "ready";}catch(e){return "err:"+String(e);}})()',
                    returnByValue: true
                }).then(function (res) {
                    var val = res && res.result && res.result.value;
                    if (!val || val === 'no-head') return;
                    if (val === 'already') {
                        logBus.log('DEBUG', 'cdp', 'fallback injection: already');
                        clearInterval(fallbackInterval);
                        return;
                    }
                    function doEval(code) {
                        client.Runtime.evaluate({
                            expression: '(function(){window.__tbInjected=true;' + code + '})()',
                            returnByValue: false
                        }).then(function () {
                            logBus.log('DEBUG', 'cdp', 'fallback injection: injected');
                            clearInterval(fallbackInterval);
                        }).catch(function (err) {
                            logBus.log('ERROR', 'cdp', 'fallback eval error: ' + err);
                            clearInterval(fallbackInterval);
                        });
                    }
                    var cached = modulesCache.get(cacheKey);
                    if (cached) {
                        doEval(cached);
                    } else {
                        fetch(scriptUrl)
                            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
                            .then(function (code) {
                                modulesCache.set(cacheKey, code);
                                doEval(code);
                            })
                            .catch(function (e) {
                                logBus.log('ERROR', 'cdp', 'fallback fetch error: ' + e);
                            });
                    }
                }).catch(function () {});
            }, 1000);

            client.on('Runtime.executionContextCreated', (msg) => {
                if (!mdl.evaluateScriptOnDocumentStart && mdl.name !== '') {
                    const expression = `
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/${mdl.fullName}/${mdl.mainFile}?v=${Date.now()}';
                    document.head.appendChild(script);
                    `;
                    client.Runtime.evaluate({ expression, contextId: msg.context.id });
                } else if (mdl.name !== '' && mdl.evaluateScriptOnDocumentStart) {
                    // Cache key includes sourceMode so cdn and direct don't share a stale entry
                    const cacheKey = (mdl.versionedFullName || mdl.fullName) + ':' + (mdl.sourceMode || 'cdn');
                    const cache = modulesCache.get(cacheKey);
                    const clientConnection = clientConn.get('wsConn');

                    if (cache) {
                        client.Page.addScriptToEvaluateOnNewDocument({ expression: cache });
                        sendClientInformation(clientConn, clientConnection.Event(Events.LaunchModule, mdl.name));
                    } else {
                        const scriptUrl = buildScriptUrl(mdl);
                        // Fallback CDN URL in case direct fetch fails (TLS issues on old Node.js)
                        const fallbackUrl = `https://cdn.jsdelivr.net/gh/${
                            (() => {
                                const n = (mdl.versionedFullName || mdl.fullName);
                                const parts = n.substring(n.indexOf('/') + 1);
                                return parts;
                            })()
                        }/${mdl.mainFile}`;

                        fetch(scriptUrl)
                            .then(res => {
                                if (!res.ok) throw new Error('HTTP ' + res.status);
                                return res.text();
                            })
                            .catch(() => fetch(fallbackUrl).then(res => res.text()))
                            .then(modFile => {
                                modulesCache.set(cacheKey, modFile);
                                sendClientInformation(clientConn, clientConnection.Event(Events.LaunchModule, mdl.name));
                                client.Page.addScriptToEvaluateOnNewDocument({ expression: modFile });
                            })
                            .catch(e => {
                                sendClientInformation(clientConn, clientConnection.Event(Events.LaunchModule, mdl.name));
                                client.Page.addScriptToEvaluateOnNewDocument({
                                    expression: `alert("Failed to load module: '${mdl.fullName}' from ${scriptUrl}. Please relaunch TizenBrew to try again.")`
                                });
                            });
                    }
                }
            });

            client.on('disconnect', () => {
                clearInterval(logPollInterval);
                clearInterval(fallbackInterval);
                if (isAnotherApp) return;

                inDebug.tizenDebug = false;
                inDebug.webDebug   = false;
                inDebug.rwiDebug   = false;

                mdl.fullName      = '';
                mdl.name          = '';
                mdl.appPath       = '';
                mdl.moduleType    = '';
                mdl.packageType   = '';
                mdl.serviceFile   = '';
                mdl.mainFile      = '';
            });

            if (!isAnotherApp) {
                const clientConnection = clientConn.get('wsConn');
                if (appControlData.module) {
                    const data = clientConnection.Event(Events.CanLaunchModules, {
                        type: 'appControl',
                        module: appControlData.module,
                        args: appControlData.args
                    });
                    sendClientInformation(clientConn, data);
                } else {
                    const config = readConfig();
                    if (config.autoLaunchModule) {
                        const data = clientConnection.Event(Events.CanLaunchModules, {
                            type: 'autolaunch',
                            module: config.autoLaunchModule
                        });
                        sendClientInformation(clientConn, data);
                    } else {
                        const data = clientConnection.Event(Events.CanLaunchModules, null);
                        sendClientInformation(clientConn, data);
                    }
                }
            }
            if (!isAnotherApp) inDebug.webDebug = true;
            appControlData = null;
        }).on('error', (err) => {
            if (attempts >= 15) {
                if (!isAnotherApp) {
                    clientConn.send(clientConn.Event(Events.Error, 'Failed to connect to the debugger'));
                    inDebug.tizenDebug = false;
                    return;
                } else return;
            }
            attempts++;
            setTimeout(() => startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts), 750);
        });
    } catch (e) {
        if (attempts >= 15) {
            if (!isAnotherApp) {
                clientConn.send(clientConn.Event(Events.Error, 'Failed to connect to the debugger'));
                inDebug.tizenDebug = false;
                return;
            } else return;
        }
        attempts++;
        setTimeout(() => startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts), 750);
        return;
    }
}

function sendClientInformation(clientConn, data) {
    const clientConnection = clientConn.get('wsConn');
    // Require the connection to be open AND marked ready (isReady is set only after
    // the client sends GetModules/Ready). This prevents sending to a closed old
    // connection that still has isReady=true from a previous session, which would
    // silently drop the message and leave the UI hung.
    if (!clientConnection ||
        !clientConnection.connection ||
        clientConnection.connection.readyState !== WebSocket.OPEN ||
        !clientConnection.isReady) {
        return setTimeout(() => sendClientInformation(clientConn, data), 50);
    }
    clientConnection.send(data);
}

function setWebApisPath() {}
function setWebApisCode() {}
function getWebApisCode() { return null; }

module.exports = { startDebugging, setWebApisPath, setWebApisCode, getWebApisCode };