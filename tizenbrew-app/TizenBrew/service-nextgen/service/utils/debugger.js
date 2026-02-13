"use strict";

const CDP = require('chrome-remote-interface');
const fetch = require('node-fetch');
const { Events } = require('./wsCommunication.js');
const { readConfig } = require('./configuration.js');
const WebSocket = require('ws');

const modulesCache = new Map();

function startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts) {
    if (!attempts) attempts = 1;
    if (!isAnotherApp) inDebug.tizenDebug = true;
    try {
        CDP({ port, host: ip, local: true }, (client) => {
            client.Runtime.enable();
            client.Debugger.enable();

            client.on('Runtime.executionContextCreated', (msg) => {
                // [TizenTube Fix] Inject webapis.js content directly for Tizen TV compatibility
                // This bypasses CSP issues with file:// or $WEBAPIS/ URLs.
                let webapisContent = null;
                const fs = require('fs');
                const possiblePaths = [
                    '/usr/share/nginx/html/webapis/webapis.js', // Common Tizen 2.4+
                    '/usr/tv/webapis/webapis.js', // Legacy
                    '/usr/share/webapis/webapis.js' // Another variant
                ];

                for (const p of possiblePaths) {
                    try {
                        if (fs.existsSync(p)) {
                            console.log('[Debugger] Found webapis.js at ' + p);
                            webapisContent = fs.readFileSync(p, 'utf8');
                            break;
                        }
                    } catch (e) { }
                }

                if (webapisContent) {
                    // Wrap in idempotent check
                    const webapisLoader = `
                        (function() {
                            if (window.webapis || window.__webapisLoaded) return;
                            window.__webapisLoaded = true;
                            console.log('[TizenBrew] Injecting webapis.js content...');
                            ${webapisContent}
                        })();
                    `;

                    if (mdl.evaluateScriptOnDocumentStart) {
                        client.Page.addScriptToEvaluateOnNewDocument({ expression: webapisLoader });
                    } else {
                        client.Runtime.evaluate({ expression: webapisLoader, contextId: msg.context.id });
                    }
                } else {
                    console.warn('[Debugger] webapis.js not found in system paths. Fallback to script tag injection.');
                    const webapisLoader = `
                        (function() {
                            if (window.webapis || window.__webapisLoaded) return;
                            window.__webapisLoaded = true;
                            var s = document.createElement('script');
                            s.src = '$WEBAPIS/webapis/webapis.js';
                            document.head.appendChild(s);
                        })();
                    `;
                    if (mdl.evaluateScriptOnDocumentStart) {
                        client.Page.addScriptToEvaluateOnNewDocument({ expression: webapisLoader });
                    } else {
                        client.Runtime.evaluate({ expression: webapisLoader, contextId: msg.context.id });
                    }
                }

                // Inject webapis loader appropriately
                if (mdl.evaluateScriptOnDocumentStart) {
                    client.Page.addScriptToEvaluateOnNewDocument({ expression: webapisLoader });
                } else {
                    client.Runtime.evaluate({ expression: webapisLoader, contextId: msg.context.id });
                }

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
                }
            });

            client.on('disconnect', () => {
                if (isAnotherApp) return;

                inDebug.tizenDebug = false;
                inDebug.webDebug = false;
                inDebug.rwiDebug = false;

                mdl.fullName = '';
                mdl.name = '';
                mdl.appPath = '';
                mdl.moduleType = '';
                mdl.packageType = '';
                mdl.serviceFile = '';
                mdl.mainFile = '';
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
            setTimeout(() => startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts), 750)
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
        setTimeout(() => startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts), 750)
        return;
    }
}

function sendClientInformation(clientConn, data) {
    const clientConnection = clientConn.get('wsConn');
    if ((clientConnection && clientConnection.connection && (clientConnection.connection.readyState !== WebSocket.OPEN && !clientConnection.isReady)) || !clientConnection) {
        return setTimeout(() => sendClientInformation(clientConn, data), 50);
    }
    setTimeout(() => {
        clientConnection.send(data);
    }, 500);
}

module.exports = startDebugging;