"use strict";

const CDP = require('chrome-remote-interface');
const fetch = require('node-fetch');
const { Events } = require('./wsCommunication.js');
const { readConfig } = require('./configuration.js');
const WebSocket = require('ws');

const modulesCache = new Map();

let cachedWebApisPath = null;
let bridgedWebApisCode = null;

function setWebApisPath(path) {
    if (!path) return;
    console.log('[Debugger] Caching webapis.js path:', path);
    if (path.startsWith('file://')) {
        cachedWebApisPath = path.replace('file://', '');
    } else {
        cachedWebApisPath = path;
    }
}

function setWebApisCode(code) {
    if (!code) return;
    console.log('[Debugger] Caching bridged webapis.js code (length: ' + code.length + ')');
    bridgedWebApisCode = code;
}

function getWebApisCode() {
    return bridgedWebApisCode;
}

function startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts) {
    if (!attempts) attempts = 1;
    if (!isAnotherApp) inDebug.tizenDebug = true;
    try {
        CDP({ port, host: ip, local: true }, (client) => {
            client.Runtime.enable();
            client.Page.enable();

            client.on('Runtime.executionContextCreated', (msg) => {
                // Ensure we only inject into the main YouTube TV frame, not iframes or workers
                const origin = msg.context.origin || '';
                const isMainFrame = (origin.includes('youtube.com') || origin.includes('googlevideo.com')) && !msg.context.name;
                if (!isMainFrame) return;

                let webapisContent = bridgedWebApisCode;
                const fs = require('fs');

                if (!webapisContent) {
                    const possiblePaths = [
                        cachedWebApisPath,
                        '/usr/share/nginx/html/webapis/webapis.js',
                        '/usr/tv/webapis/webapis.js',
                        '/usr/share/webapis/webapis.js',
                        '/usr/bin/webapis/webapis.js',
                        '/opt/share/webapp/webapis/webapis.js',
                        '/usr/lib/tizen-webapis/webapis.js'
                    ].filter(p => p);

                    for (const p of possiblePaths) {
                        try {
                            if (fs.existsSync(p)) {
                                console.log('[Debugger] Found webapis.js at ' + p);
                                webapisContent = fs.readFileSync(p, 'utf8');
                                break;
                            }
                        } catch (e) { }
                    }
                }

                // THE INJECTION
                const injectionCode = `
                (function() {
                    if (window.__tizentube_injected) return;
                    window.__tizentube_injected = true;
                    console.log("[TizenBrew] Starting API Injection...");
                    
                    // 1. Try to restore window.tizen if missing
                    if (!window.tizen && window.parent && window.parent.tizen) {
                        window.tizen = window.parent.tizen;
                    }

                    // 2. Inject WebAPIs
                    if (!window.webapis || !window.webapis.avplay) {
                        ${webapisContent ? `
                        try {
                            ${webapisContent}
                            console.log("[TizenBrew] WebAPI Injected via Code.");
                        } catch(e) { console.error("Injection Error:", e); }
                        ` : `
                        console.warn("[TizenBrew] WebAPIs not available on disk, bridged code not ready. Cannot inject WebAPIs without a valid script source.");
                        `}
                    }
                })();
                `;

                if (!mdl.evaluateScriptOnDocumentStart && mdl.name !== '') {
                    const cache = modulesCache.get(mdl.fullName);
                    if (cache) {
                        client.Runtime.evaluate({ expression: cache, contextId: msg.context.id });
                    } else {
                        fetch(`https://cdn.jsdelivr.net/${mdl.fullName}/${mdl.mainFile}`).then(res => res.text()).then(modFile => {
                            modulesCache.set(mdl.fullName, modFile);
                            client.Runtime.evaluate({ expression: modFile, contextId: msg.context.id });
                        }).catch(e => {
                            client.Runtime.evaluate({ expression: `alert("Failed to load module: '${mdl.fullName}'. Please relaunch TizenBrew to try again.")`, contextId: msg.context.id });
                        });
                    }
                } else if (mdl.name !== '' && mdl.evaluateScriptOnDocumentStart) {
                    const cacheKey = mdl.versionedFullName || mdl.fullName;
                    const clientConnection = clientConn.get('wsConn');

                    // Construct Raw GitHub URL for server-side fetch
                    // Strip jsDelivr prefixes (gh/, npm/) to get clean user/repo
                    function getGitHubRepo(name) {
                        if (name.startsWith('gh/')) return name.substring(3);
                        if (name.startsWith('npm/')) return null; // npm packages can't use raw GitHub
                        return name;
                    }

                    let fetchUrl;
                    const cleanName = mdl.versionedFullName || mdl.fullName;
                    if (cleanName.includes('@')) {
                        const [rawRepo, tag] = cleanName.split('@');
                        const repo = getGitHubRepo(rawRepo);
                        if (repo) {
                            fetchUrl = `https://raw.githubusercontent.com/${repo}/${tag}/${mdl.mainFile}`;
                        } else {
                            fetchUrl = `https://cdn.jsdelivr.net/${cleanName}/${mdl.mainFile}`;
                        }
                    } else {
                        const repo = getGitHubRepo(cleanName);
                        if (repo) {
                            fetchUrl = `https://raw.githubusercontent.com/${repo}/main/${mdl.mainFile}`;
                        } else {
                            fetchUrl = `https://cdn.jsdelivr.net/${cleanName}/${mdl.mainFile}`;
                        }
                    }
                    // Append cache buster
                    fetchUrl += `?v=${Date.now()}`;

                    const cache = modulesCache.get(cacheKey);

                    if (cache) {
                        client.Page.addScriptToEvaluateOnNewDocument({ expression: cache });
                        sendClientInformation(clientConn, clientConnection.Event(Events.LaunchModule, mdl.name));
                    } else {
                        fetch(fetchUrl).then(res => res.text()).then(modFile => {
                            modulesCache.set(cacheKey, modFile);
                            sendClientInformation(clientConn, clientConnection.Event(Events.LaunchModule, mdl.name));
                            client.Page.addScriptToEvaluateOnNewDocument({ expression: modFile });
                        }).catch(e => {
                            sendClientInformation(clientConn, clientConnection.Event(Events.LaunchModule, mdl.name));
                            client.Page.addScriptToEvaluateOnNewDocument({ expression: `alert("Failed to load module: '${mdl.fullName}'. Please relaunch TizenBrew to try again.")` });
                        });
                    }

                    // 2. Inject WebAPIs
                    if (!window.webapis || !window.webapis.avplay) {
                        ${webapisContent ? `
                        try {
                            ${webapisContent}
                            console.log("[TizenBrew] WebAPI Injected via Code.");
                        } catch(e) { console.error("Injection Error:", e); }
                        ` : `
                        console.warn("[TizenBrew] WebAPIs not available on disk, bridged code not ready. Cannot inject WebAPIs without a valid script source.");
                        `}
                    }
                })();
                `;

                client.Runtime.evaluate({ expression: injectionCode, contextId: msg.context.id });
                client.Page.addScriptToEvaluateOnNewDocument({ source: injectionCode });

                // Module Injection
                if (mdl.name !== '') {
                    const proxyModule = encodeURIComponent(mdl.versionedFullName || mdl.fullName);
                    const modUrl = 'http://127.0.0.1:8081/module/' + proxyModule + '/' + mdl.mainFile + '?v=' + Date.now();
                    fetch(modUrl).then(res => res.text()).then(scriptContent => {
                        client.Runtime.evaluate({ expression: scriptContent, contextId: msg.context.id });
                        console.log("[Debugger] Module Injected via Code.");
                    }).catch(err => {
                        console.log('[Debugger] Failed to fetch module script: ' + err);
                    });
                }
            });

            client.on('disconnect', () => {
                if (!isAnotherApp) inDebug.tizenDebug = false;
            });

            // Signal Ready
            const clientConnection = clientConn.get('wsConn');
            if (clientConnection) {
                const data = clientConnection.Event(Events.CanLaunchModules, appControlData.module ? {
                    type: 'appControl',
                    module: appControlData.module,
                    args: appControlData.args
                } : null);
                clientConnection.send(data);
            }

        }).on('error', (err) => {
            if (attempts < 20) setTimeout(() => startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts + 1), 1000);
        });
    } catch (e) { }
}

module.exports = { startDebugging, setWebApisPath, setWebApisCode, getWebApisCode };