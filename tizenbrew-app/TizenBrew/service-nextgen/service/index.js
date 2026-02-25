"use strict";

module.exports.onStart = function () {
    console.log('Service started');
    const adbhost = require('adbhost');
    const express = require('express');
    const fetch = require('node-fetch');
    const path = require('path');
    const { readConfig, writeConfig } = require('./utils/configuration.js');
    const loadModules = require('./utils/moduleLoader.js');
    const { startDebugging, setWebApisPath } = require('./utils/debugger.js');
    const startService = require('./utils/serviceLauncher.js');
    const { Connection, Events } = require('./utils/wsCommunication.js');
    let WebSocket;
    if (process.version === 'v4.4.3') {
        WebSocket = require('ws-old');
    } else {
        WebSocket = require('ws-new');
    }


    const app = express();
    let deviceIP;
    const isTizen3 = tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version').startsWith('3.0');

    // HTTP Proxy for modules 
    app.all('*', (req, res) => {
        if (req.url === '/webapis.js') {
            const { getWebApisCode } = require('./utils/debugger.js');
            const code = getWebApisCode();
            if (code) {
                res.setHeader('Content-Type', 'application/javascript');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.send(code);
            } else {
                res.status(404).send('WebAPIs not bridged yet. Open TizenBrew UI first.');
            }
        } else if (req.url.startsWith('/module/')) {
            const url = require('url');
            const parsedUrl = url.parse(req.url, true);
            const splittedPath = parsedUrl.pathname.split('/');
            const encodedModuleName = splittedPath[2];
            const moduleName = decodeURIComponent(encodedModuleName);
            const sourceMode = parsedUrl.query.sourceMode === 'direct' ? 'direct' : 'cdn';

            // Append timestamp to ensure we don't hit any intermediate caches for proxy requests
            const cacheBuster = `?t=${Date.now()}`;

            let upstreamUrl;
            const filePath = parsedUrl.pathname.replace(`/module/${encodedModuleName}/`, '');

            if (moduleName.startsWith('gh/')) {
                const repo = moduleName.substring(3);
                if (sourceMode === 'direct') {
                    upstreamUrl = `https://raw.githubusercontent.com/${repo}/main/${filePath}`;
                } else {
                    upstreamUrl = `https://cdn.jsdelivr.net/gh/${repo}/${filePath}`;
                }
            } else if (moduleName.startsWith('npm/')) {
                const npmName = moduleName.substring(4);
                if (sourceMode === 'direct') {
                    upstreamUrl = `https://unpkg.com/${npmName}/${filePath}`;
                } else {
                    upstreamUrl = `https://cdn.jsdelivr.net/npm/${npmName}/${filePath}`;
                }
            } else {
                upstreamUrl = `https://cdn.jsdelivr.net/${moduleName}/${filePath}`;
            }

            fetch(`${upstreamUrl}${cacheBuster}`)
                .then(fetchRes => {
                    if (!fetchRes.ok) {
                        res.status(fetchRes.status).send(`Proxy fetch failed: ${upstreamUrl}`);
                        return null;
                    }

                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.type(path.basename(filePath).split('.').slice(-1)[0].split('?')[0]);
                    return fetchRes.body.pipe(res);
                })
                .catch(() => {
                    res.status(500).send(`Proxy fetch failed: ${upstreamUrl}`);
                });
        } else {
            res.send(deviceIP);
        }
    });

    const wsServer = new WebSocket.Server({ server: app.listen(8081, "127.0.0.1") });

    let adbClient;
    let canLaunchInDebug = null;
    
    fetch('http://127.0.0.1:8001/api/v2/').then(res => res.json())
        .then(json => {
            canLaunchInDebug = (json.device.developerIP === '127.0.0.1' || json.device.developerIP === '1.0.0.127') && json.device.developerMode === '1';
        });

    const inDebug = {
        tizenDebug: false,
        webDebug: false,
        rwiDebug: false
    };

    const services = new Map();
    const queuedEvents = [];
    let modulesCache = null;

    const currentModule = {
        name: '',
        fullName: '',
        versionedFullName: '',
        appPath: '',
        moduleType: '',
        packageType: '',
        serviceFile: '',
        sourceMode: 'cdn'
    };

    const appControlData = {
        module: null,
        args: null
    };

    loadModules().then(modules => {
        modulesCache = modules;
        const serviceModuleList = readConfig().autoLaunchServiceList;
        if (serviceModuleList.length > 0) {
            serviceModuleList.forEach(module => {
                const service = modules.find(m => m.name === module);
                if (service) startService(service, services);
            });
        }
    });


    function createAdbConnection(ip, mdl) {
        deviceIP = ip;
        if (adbClient) {
            if (!adbClient._stream) {
                adbClient._stream.removeAllListeners('connect');
                adbClient._stream.removeAllListeners('error');
                adbClient._stream.removeAllListeners('close');
            }
        }

        adbClient = adbhost.createConnection({ host: '127.0.0.1', port: 26101 });

        adbClient._stream.on('connect', () => {
            console.log('ADB connection established');
            //Launch app
            const tbPackageId = tizen.application.getAppInfo().packageId;
            const shellCmd = adbClient.createStream(`shell:0 debug ${tbPackageId}.TizenBrewStandalone${isTizen3 ? ' 0' : ''}`);
            shellCmd.on('data', function dataIncoming(data) {
                const dataString = data.toString();
                if (dataString.includes('debug')) {
                    const port = Number(dataString.substr(dataString.indexOf(':') + 1, 6).replace(' ', ''));
                    startDebugging(port, queuedEvents, services, ip, mdl, inDebug, appControlData, false);
                    setTimeout(() => adbClient._stream.end(), 1000);
                }
            });
        });

        adbClient._stream.on('error', (e) => {
            console.log('ADB connection error. ' + e);
        });
        adbClient._stream.on('close', () => {
            console.log('ADB connection closed.');
        });
    }


    wsServer.on('connection', (ws) => {
        const wsConn = new Connection(ws);
        for (const event of queuedEvents) {
            wsConn.send(event);
            queuedEvents.splice(queuedEvents.indexOf(event), 1);
        }
        services.set('wsConn', wsConn);
        ws.on('message', (message) => {
            let msg;
            try {
                msg = JSON.parse(message)
            } catch (e) {
                return wsConn.send(wsConn.Event(Events.Error, `Invalid JSON: ${message}`));
            }

            const { type, payload } = msg;

            switch (type) {
                case Events.AppControlData: {
                    const moduleMetadata = [
                        payload.package.substring(0, payload.package.indexOf('/')),
                        payload.package.substring(payload.package.indexOf('/') + 1)
                    ];
                    const module = modulesCache.find(m => m.name === moduleMetadata[1]);

                    if (!module) {
                        return wsConn.send(wsConn.Event(Events.Error, 'App Control module not found.'));
                    }

                    appControlData.module = module;
                    appControlData.args = payload.args;

                    wsConn.send(wsConn.Event(Events.AppControlData, null));
                    break;
                }
                case Events.GetDebugStatus: {
                    wsConn.send(wsConn.Event(Events.GetDebugStatus, inDebug));
                    break;
                }
                case Events.CanLaunchInDebug: {
                    fetch('http://127.0.0.1:8001/api/v2/').then(res => res.json())
                        .then(json => {
                            canLaunchInDebug = (json.device.developerIP === '127.0.0.1' || json.device.developerIP === '1.0.0.127') && json.device.developerMode === '1';
                        });
                    wsConn.send(wsConn.Event(Events.CanLaunchInDebug, canLaunchInDebug));
                    break;
                }
                case Events.ReLaunchInDebug: {
                    setTimeout(() => {
                        createAdbConnection(payload.tvIP, currentModule);
                    }, 1000);
                    break;
                }
                case Events.GetModules: {
                    wsConn.isReady = true;
                    services.set('wsConn', wsConn);

                    if (payload) {
                        loadModules().then(modules => {
                            modulesCache = modules;
                            wsConn.send(wsConn.Event(Events.GetModules, modules));
                        });
                    } else wsConn.send(wsConn.Event(Events.GetModules, modulesCache));
                    break;
                }
                case Events.LaunchModule: {
                    const mdl = payload;
                    currentModule.fullName = mdl.fullName;
                    currentModule.versionedFullName = mdl.versionedFullName;
                    currentModule.name = mdl.name;
                    currentModule.appPath = mdl.appPath;
                    currentModule.moduleType = mdl.moduleType;
                    currentModule.packageType = mdl.packageType;
                    currentModule.serviceFile = mdl.serviceFile;
                    currentModule.sourceMode = mdl.sourceMode || 'cdn';

                    if (mdl.packageType === 'app') {
                        inDebug.webDebug = false;
                        inDebug.tizenDebug = false;
                    } else {
                        currentModule.mainFile = mdl.mainFile;
                        currentModule.tizenAppId = mdl.tizenAppId;
                        currentModule.evaluateScriptOnDocumentStart = mdl.evaluateScriptOnDocumentStart;
                    }

                    if (mdl.serviceFile) {
                        if (services.has(mdl.fullName)) {
                            if (services.get(mdl.fullName).hasCrashed) {
                                services.delete(mdl.fullName);
                                startService(mdl, services);
                            }
                        } else startService(mdl, services);
                    }
                    break;
                }
                case Events.StartService: {
                    const mdl = payload;
                    if (payload.serviceFile && services.has(mdl.fullName)) {
                        if (services.get(mdl.fullName).hasCrashed) {
                            services.delete(mdl.fullName);
                            startService(mdl, services);
                        }
                    } else startService(mdl, services);
                    break;
                }
                case Events.GetServiceStatuses: {
                    const serviceList = [];
                    for (const map of services) {
                        serviceList.push({
                            name: map[0],
                            hasCrashed: map[1].hasCrashed,
                            error: map[1].error
                        });
                    }
                    wsConn.send(wsConn.Event(Events.GetServiceStatuses, serviceList));
                    break;
                }
                case Events.WebApisPath: {
                    if (payload) {
                        setWebApisPath(payload);
                    }
                    break;
                }
                case Events.WebApisCode: {
                    if (payload) {
                        const { setWebApisCode } = require('./utils/debugger.js');
                        setWebApisCode(payload);
                    }
                    break;
                }
                case Events.ModuleAction: {
                    const { action, module, sourceMode } = payload;

                    const config = readConfig();
                    switch (action) {
                        case 'add': {
                            const index = config.modules.findIndex(m => (typeof m === 'string' ? m : m.name) === module);
                            if (index === -1) {
                                config.modules.push({
                                    name: module,
                                    sourceMode: sourceMode === 'direct' ? 'direct' : 'cdn'
                                });
                                writeConfig(config);
                            }
                            break;
                        }
                        case 'remove': {
                            const index = config.modules.findIndex(m => (typeof m === 'string' ? m : m.name) === module);
                            if (index !== -1) {
                                config.modules.splice(index, 1);
                                writeConfig(config);
                            }
                            break;
                        }
                        case 'setSourceMode': {
                            const index = config.modules.findIndex(m => (typeof m === 'string' ? m : m.name) === module);
                            if (index !== -1) {
                                const name = typeof config.modules[index] === 'string' ? config.modules[index] : config.modules[index].name;
                                config.modules[index] = {
                                    name,
                                    sourceMode: sourceMode === 'direct' ? 'direct' : 'cdn'
                                };
                                writeConfig(config);
                            }
                            break;
                        }
                        case 'autolaunch': {
                            config.autoLaunchModule = module;
                            writeConfig(config);
                            break;
                        }
                        case 'autolaunchService': {
                            config.autoLaunchServiceList = module;
                            writeConfig(config);
                            break;
                        }
                    }
                    break;
                }
                case Events.Ready: {
                    wsConn.isReady = true;
                    services.set('wsConn', wsConn);
                    break;
                }
                default: {
                    wsConn.send(wsConn.Event(Events.Error, 'Invalid event type.'));
                    break;
                }
            }
        });
    });
}
