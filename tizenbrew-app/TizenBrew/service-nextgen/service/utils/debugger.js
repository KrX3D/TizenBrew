"use strict";

const CDP = require('chrome-remote-interface');
const fetch = require('node-fetch');
const { Events } = require('./wsCommunication.js');
const { readConfig } = require('./configuration.js');
const WebSocket = require('ws');
const logBus = require('./logBus.js');

const modulesCache = new Map();

function buildOverlayExpression(safeName, safeUrl, safeError) {
    const errLine = safeError
        ? `+'<p style="color:#f66;font-size:0.9em;margin:0 0 15px;word-break:break-all">Error: ${safeError}</p>'`
        : '';
    return `(function(){
    var d=document.createElement('div');
    d.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:#1a1a1a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;font-family:sans-serif;text-align:center;padding:60px;box-sizing:border-box;';
    d.innerHTML='<h2 style="font-size:2em;margin:0 0 20px">TizenBrew: Module Load Failed</h2>'
        +'<p style="font-size:1.3em;margin:0 0 10px">Could not load <b>${safeName}</b></p>'
        +'<code style="display:block;word-break:break-all;color:#f90;margin:0 0 20px;font-size:0.9em">${safeUrl}</code>'
        ${errLine}
        +'<p style="color:#aaa;font-size:1em;margin:0 0 15px">Check your network connection or switch to CDN mode, then relaunch.</p>'
        +'<p style="color:#888;font-size:0.9em">Press [BACK] to return to TizenBrew.</p>';
    document.addEventListener('keydown',function(e){if(e.keyCode===10009||e.keyCode===461||e.keyCode===10182){history.back();}},true);
    function attach(){(document.body||document.documentElement).appendChild(d);}
    if(document.body)attach();else window.addEventListener('load',attach);
})();`;
}

function injectErrorOverlay(client, moduleName, url, errorMsg) {
    logBus.log('ERROR', 'cdp', 'injecting error overlay for ' + moduleName + ' — ' + url + (errorMsg ? ' (' + errorMsg + ')' : ''));
    const safeUrl   = String(url).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/'/g, "\\'");
    const safeName  = String(moduleName).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/'/g, "\\'");
    const safeError = errorMsg ? String(errorMsg).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/'/g, "\\'") : '';
    client.Runtime.evaluate({
        expression: buildOverlayExpression(safeName, safeUrl, safeError),
        returnByValue: false
    }).catch(function() {});
}

// Monotonically increasing counter. Bumped each time a new non-isAnotherApp
// startDebugging call arrives. Old retry loops compare their captured sessionId
// against this and abort if they've been superseded, preventing multiple
// concurrent CDP clients from all injecting when Cobalt finally accepts connections.
let _activeSessionId = 0;

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

function startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts, sessionId) {
    if (!attempts) attempts = 1;
    if (!isAnotherApp) {
        if (!sessionId) {
            // New top-level call: assign a fresh session, superseding any prior retry loops.
            _activeSessionId++;
            sessionId = _activeSessionId;
            logBus.log('DEBUG', 'cdp', 'startDebugging new session ' + sessionId + ' on port ' + port);
        } else if (sessionId !== _activeSessionId) {
            // This retry belongs to a superseded session; abort silently.
            logBus.log('DEBUG', 'cdp', 'startDebugging session ' + sessionId + ' superseded by ' + _activeSessionId + ', aborting retry');
            return;
        }
        inDebug.tizenDebug = true;
    }
    logBus.log('DEBUG', 'cdp', 'startDebugging called on port ' + port + ' for ' + (mdl.name || '(none)'));
    try {
        CDP({ port, host: ip, local: true }, (client) => {
            // By the time CDP calls back, a newer session may have been started.
            // Close this stale client immediately so it doesn't inject.
            if (!isAnotherApp && sessionId !== _activeSessionId) {
                logBus.log('DEBUG', 'cdp', 'CDP connected for superseded session ' + sessionId + ', closing');
                client.close();
                return;
            }
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
                        if (entries.length > 0) logBus.log('DEBUG', 'cdp', 'draining ' + entries.length + ' TizenTube log entr' + (entries.length === 1 ? 'y' : 'ies'));
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
            // contextHasBeenInjected: set only AFTER injection is confirmed successful.
            // scriptTagAttempted: set synchronously when the script-tag path starts, cleared
            // on failure so the fallback can take over (needed on Tizen 6.5 Trusted Types).
            // YouTube TV creates two default contexts (initial load + post-DIAL navigation).
            // These two flags together prevent any second context or the fallback from
            // injecting again after one path has already committed.
            var contextHasBeenInjected = false;
            var scriptTagAttempted = false;

            var fallbackInterval = setInterval(function () {
                if (!mdl.name || mdl.evaluateScriptOnDocumentStart) return;
                if (contextHasBeenInjected) { clearInterval(fallbackInterval); return; }
                var cacheKey = (mdl.versionedFullName || mdl.fullName) + ':' + (mdl.sourceMode || 'cdn');
                var scriptUrl = buildScriptUrl(mdl);
                var directMode = (mdl.sourceMode || '') === 'direct';

                client.Runtime.evaluate({
                    expression: '(function(){try{if(!document.head)return "no-head";if(window.__tbScriptLoaded)return "loaded";if(window.__tbScriptPending)return "pending";if(window.__tbScriptError)return "error:"+window.__tbScriptError;if(window.__tbInjected)return "already";return "ready";}catch(e){return "err:"+String(e);}})()',
                    returnByValue: true
                }).then(function (res) {
                    var val = res && res.result && res.result.value;
                    if (!val || val === 'no-head' || val === 'pending') return;

                    if (val === 'loaded' || val === 'already') {
                        logBus.log('DEBUG', 'cdp', 'fallback: script ' + val);
                        contextHasBeenInjected = true;
                        clearInterval(fallbackInterval);
                        return;
                    }

                    // Script-tag failed or page never got a tag — proceed to eval injection.
                    // In direct mode a script-tag error means the URL is blocked by CSP in Cobalt;
                    // the Node.js fetch below bypasses that, so we still try eval. Only if the
                    // fetch itself fails do we surface an error to the user.
                    if (val.startsWith('error:')) {
                        logBus.log('WARN', 'cdp', 'script tag load failed (' + val.substring(6) + '), falling back to eval injection');
                        scriptTagAttempted = false;
                    }

                    if (scriptTagAttempted) return; // still waiting on script-tag result

                    function doEval(code) {
                        client.Runtime.evaluate({
                            expression: '(function(){if(window.__tbInjected)return;window.__tbInjected=true;window.__tbScriptLoaded=true;' + code + '})()',
                            returnByValue: false
                        }).then(function () {
                            logBus.log('DEBUG', 'cdp', 'fallback injection: injected via eval');
                            contextHasBeenInjected = true;
                            clearInterval(fallbackInterval);
                        }).catch(function (err) {
                            logBus.log('ERROR', 'cdp', 'fallback eval error: ' + err);
                            clearInterval(fallbackInterval);
                        });
                    }

                    var cached = modulesCache.get(cacheKey);
                    if (cached) {
                        logBus.log('DEBUG', 'cdp', 'fallback injection: using cached userscript');
                        doEval(cached);
                    } else {
                        logBus.log('DEBUG', 'cdp', 'fallback injection: fetching from ' + scriptUrl.split('?')[0]);
                        fetch(scriptUrl)
                            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
                            .then(function (code) {
                                modulesCache.set(cacheKey, code);
                                doEval(code);
                            })
                            .catch(function (e) {
                                logBus.log('ERROR', 'cdp', 'fallback fetch error: ' + e);
                                injectErrorOverlay(client, mdl.fullName || mdl.name, scriptUrl, e.message || String(e));
                                clearInterval(fallbackInterval);
                            });
                    }
                }).catch(function () {});
            }, 1000);

            client.on('Runtime.executionContextCreated', (msg) => {
                const auxData = msg.context.auxData || {};
                logBus.log('DEBUG', 'cdp', 'executionContextCreated contextId=' + msg.context.id + ' type=' + (auxData.type || '?') + ' isDefault=' + auxData.isDefault + ' name=' + (mdl.name || '(none)'));
                // Only inject into the main frame context — skip workers, iframes, isolated worlds
                if (!auxData.isDefault) return;
                if (!mdl.evaluateScriptOnDocumentStart && mdl.name !== '') {
                    if (contextHasBeenInjected || scriptTagAttempted) {
                        logBus.log('DEBUG', 'cdp', 'executionContextCreated contextId=' + msg.context.id + ': skipping, already injected/attempting this session');
                        return;
                    }
                    scriptTagAttempted = true;
                    const scriptUrl = buildScriptUrl(mdl);
                    logBus.log('DEBUG', 'cdp', 'injecting userscript via script tag: ' + scriptUrl);
                    const ts = Date.now();
                    const expression = `
                    (function(){
                        if (window.__tbInjected || window.__tbScriptPending) return;
                        window.__tbScriptPending = true;
                        var s = document.createElement('script');
                        s.src = '${scriptUrl}?v=${ts}';
                        s.onload = function() { window.__tbScriptPending = false; window.__tbScriptLoaded = true; window.__tbInjected = true; };
                        s.onerror = function() { window.__tbScriptPending = false; window.__tbScriptError = s.src; };
                        document.head.appendChild(s);
                    })();
                    `;
                    client.Runtime.evaluate({ expression, contextId: msg.context.id })
                    .then(function(result) {
                        if (result && result.exceptionDetails) {
                            // Script-tag blocked (Trusted Types on Tizen 6.5). Reset so fallback can inject via eval.
                            logBus.log('DEBUG', 'cdp', 'script tag blocked (Trusted Types?), fallback will inject via eval');
                            scriptTagAttempted = false;
                        }
                        // else: script tag is in flight — fallback interval polls __tbScriptLoaded / __tbScriptError
                    })
                    .catch(function(err) {
                        logBus.log('DEBUG', 'cdp', 'script tag eval error: ' + err + ', fallback will inject');
                        scriptTagAttempted = false;
                    });
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
                        logBus.log('DEBUG', 'cdp', 'fetching userscript (evaluateOnDocStart): ' + scriptUrl);
                        // Fallback CDN URL in case direct fetch fails (TLS issues on old Node.js)
                        const fallbackUrl = `https://cdn.jsdelivr.net/gh/${
                            (() => {
                                const n = (mdl.versionedFullName || mdl.fullName);
                                const parts = n.substring(n.indexOf('/') + 1);
                                return parts;
                            })()
                        }/${mdl.mainFile}`;

                        const directMode = (mdl.sourceMode || '') === 'direct';
                        const primaryFetch = fetch(scriptUrl)
                            .then(res => {
                                if (!res.ok) throw new Error('HTTP ' + res.status);
                                return res.text();
                            });
                        // In direct mode never fall back to CDN — respect the user's choice.
                        const fetchChain = directMode
                            ? primaryFetch
                            : primaryFetch.catch(() => fetch(fallbackUrl).then(res => {
                                if (!res.ok) throw new Error('HTTP ' + res.status);
                                return res.text();
                              }));
                        fetchChain
                            .then(modFile => {
                                modulesCache.set(cacheKey, modFile);
                                sendClientInformation(clientConn, clientConnection.Event(Events.LaunchModule, mdl.name));
                                client.Page.addScriptToEvaluateOnNewDocument({ expression: modFile });
                            })
                            .catch(e => {
                                logBus.log('ERROR', 'cdp', 'failed to load module ' + mdl.fullName + ' from ' + scriptUrl + ': ' + e);
                                logBus.log('ERROR', 'cdp', 'injecting error overlay — ' + (directMode ? 'direct mode, no CDN fallback' : 'all fetch attempts failed'));
                                const safeUrl   = String(scriptUrl).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/'/g, "\\'");
                                const safeName  = String(mdl.fullName || mdl.name).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/'/g, "\\'");
                                const safeError = e ? String(e.message || e).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/'/g, "\\'") : '';
                                sendClientInformation(clientConn, clientConnection.Event(Events.LaunchModule, mdl.name));
                                client.Page.addScriptToEvaluateOnNewDocument({
                                    expression: buildOverlayExpression(safeName, safeUrl, safeError)
                                });
                            });
                    }
                }
            });

            client.on('disconnect', () => {
                clearInterval(logPollInterval);
                clearInterval(fallbackInterval);
                contextHasBeenInjected = false;
                scriptTagAttempted = false;
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
                mdl.sourceMode    = '';
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
            setTimeout(() => startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts, sessionId), 750);
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
        setTimeout(() => startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts, sessionId), 750);
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