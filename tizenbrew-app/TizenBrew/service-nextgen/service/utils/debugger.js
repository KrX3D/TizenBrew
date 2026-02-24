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
                        var s = document.createElement("script");
                        s.src = "http://127.0.0.1:8081/webapis.js";
                        document.head.appendChild(s);
                        console.log("[TizenBrew] WebAPI Injected via Script Tag.");
                        `}
                    }
                })();
                `;

                client.Runtime.evaluate({ expression: injectionCode, contextId: msg.context.id });
                client.Page.addScriptToEvaluateOnNewDocument({ expression: injectionCode });

                // Module Injection
                if (mdl.name !== '') {
                    const proxyModule = encodeURIComponent(mdl.versionedFullName || mdl.fullName);
                    const modUrl = 'http://127.0.0.1:8081/module/' + proxyModule + '/' + mdl.mainFile + '?v=' + Date.now();
                    const modExpression = 'var s = document.createElement("script"); s.src = "' + modUrl + '"; (document.head || document.documentElement).appendChild(s);';
                    client.Runtime.evaluate({ expression: modExpression, contextId: msg.context.id });
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