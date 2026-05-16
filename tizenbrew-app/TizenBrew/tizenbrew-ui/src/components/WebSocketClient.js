import i18next from 'i18next';

const Events = {
    Ready: -1,
    AppControlData: 0,
    GetDebugStatus: 1,
    CanLaunchInDebug: 2,
    ReLaunchInDebug: 3,
    GetModules: 4,
    LaunchModule: 5,
    StartService: 6,
    GetServiceStatuses: 7,
    Error: 8,
    CanLaunchModules: 9,
    ModuleAction: 10,
    CheckTizenBrewConfig: 11,
    ResetTizenBrewConfig: 12,
    GetRemoteLogging: 13,
    SetRemoteLogging: 14,
    LogEvent: 15,
    WebApisPath: 20,
    WebApisCode: 21
};

// Returns the actual upstream package.json URL that was used to resolve this module.
// This is what we show in toasts — not the proxy URL.
function getResolvedPackageUrl(module) {
    const { fullName, versionedFullName, sourceMode, moduleType } = module;
    const namePart = fullName.substring(fullName.indexOf('/') + 1);

    if (moduleType === 'gh') {
        // Extract branch from versionedFullName: gh/user/repo@branch → branch
        const versionedNamePart = (versionedFullName || fullName).substring(
            (versionedFullName || fullName).indexOf('/') + 1
        );
        const secondSlash = versionedNamePart.indexOf('/');
        const repoAndBranch = secondSlash !== -1
            ? versionedNamePart.substring(secondSlash + 1)
            : versionedNamePart;
        const atIdx = repoAndBranch.indexOf('@');
        const branch = atIdx !== -1 ? repoAndBranch.substring(atIdx + 1) : 'main';

        if (sourceMode === 'direct') {
            return `https://raw.githubusercontent.com/${namePart}/refs/heads/${branch}/package.json`;
        }
        return `https://cdn.jsdelivr.net/gh/${namePart}@${branch}/package.json`;
    }

    // npm
    if (sourceMode === 'direct') {
        return `https://unpkg.com/${namePart}/package.json`;
    }
    return `https://cdn.jsdelivr.net/${fullName}/package.json`;
}

class Client {
    constructor(context) {
        this.context = context;
        this.socket = new WebSocket('ws://localhost:8081');
        this.socket.onopen = this.onOpen.bind(this);
        this.socket.onmessage = this.onMessage.bind(this);
        this.socket.onerror = () => location.reload();
        this.pendingEvents = [];
        this.modulesLoaded = false;
        this.modules = [];
        this.startupToastShown = false;
    }

    shouldRelaunchInDebug(payload) {
        const alreadyDebugging = payload.rwiDebug || payload.webDebug || payload.appDebug || payload.tizenDebug;
        if (alreadyDebugging) return false;

        const relaunchKey = 'tizenbrew_debug_relaunch_attempt';
        const lastAttempt = Number(sessionStorage.getItem(relaunchKey) || 0);
        const now = Date.now();

        if (now - lastAttempt < 15000) return false;

        sessionStorage.setItem(relaunchKey, String(now));
        return true;
    }

    onOpen() {
        // Fetch remote logging config immediately so window.__tbLog works for all subsequent actions.
        this.send({ type: Events.GetRemoteLogging });
        const data = tizen.application.getCurrentApplication().getRequestedAppControl().appControl.data;
        if (data.length > 0 && data[0].value.length > 0) {
            try {
                const parsedData = JSON.parse(data[0].value[0]);
                const moduleName = parsedData.moduleName;
                const moduleType = parsedData.moduleType;
                const args = parsedData.args;

                if (!moduleName || !moduleType) {
                    return this.send({ type: Events.GetDebugStatus });
                }

                this.send({
                    type: Events.AppControlData,
                    payload: { package: `${moduleType}/${moduleName}`, args }
                });
            } catch (e) {
                this.send({ type: Events.GetDebugStatus });
            }
        } else {
            this.send({ type: Events.GetDebugStatus });
        }
    }

    onMessage(event) {
        const data = JSON.parse(event.data);
        const { type, payload } = data;
        const toast = window.__globalToast;

        switch (type) {
            case Events.AppControlData: {
                this.send({ type: Events.GetDebugStatus });
                break;
            }

            case Events.GetDebugStatus: {
                this.context.dispatch({ type: 'SET_DEBUG_STATUS', payload });

                if (this.shouldRelaunchInDebug(payload)) {
                    this.send({ type: Events.CanLaunchInDebug });
                } else {
                    this.send({ type: Events.GetModules });
                }
                break;
            }

            case Events.CanLaunchInDebug: {
                if (payload) {
                    const tvIP = webapis.network.getIp();
                    this.send({ type: Events.ReLaunchInDebug, payload: { tvIP } });
                    tizen.application.getCurrentApplication().exit();
                } else if (payload === null) {
                    this.send({ type: Events.CanLaunchInDebug });
                } else {
                    this.context.dispatch({
                        type: 'SET_ERROR',
                        payload: { message: 'errors.debuggingNotEnabled', disappear: false }
                    });
                }
                break;
            }

            case Events.GetModules: {
                if (payload === null) {
                    return setTimeout(() => this.send({ type: Events.GetModules }), 500);
                }

                // Payload is now { modules, defaultModule, rateLimitedModules }
                // but service may send a plain array for backwards compat
                const modules = Array.isArray(payload) ? payload : (payload.modules || []);
                const defaultModule = Array.isArray(payload) ? '' : (payload.defaultModule || '');
                const rateLimitedModules = Array.isArray(payload) ? [] : (payload.rateLimitedModules || []);

                this.context.dispatch({ type: 'SET_MODULES', payload: modules });
                this.context.dispatch({ type: 'SET_DEFAULT_MODULE', payload: defaultModule });
                this.modules = modules;
                const wasFirstLoad = !this.modulesLoaded;
                this.modulesLoaded = true;
                this.send({ type: Events.Ready });

                window.__tbLog && window.__tbLog('INFO', 'modules', (wasFirstLoad ? 'Startup' : 'Reload') + ': ' + modules.length + ' module(s)' + (defaultModule ? ' | default=' + defaultModule : '') + (rateLimitedModules.length > 0 ? ' | rateLimited=' + rateLimitedModules.join(', ') : ''));

                // Per-module detail logs — deferred 2 s so all WS startup
                // messages are processed before fetch() calls fire.
                var _mods = modules, _wasFirst = wasFirstLoad;
                setTimeout(function() {
                    if (!window.__tbLog) return;
                    _mods.forEach(function(m) {
                        var pkgUrl = getResolvedPackageUrl(m);
                        var configured = (m.sourceMode || 'cdn').toUpperCase();
                        var used = m.rateLimited ? 'CDN-FALLBACK' : configured;
                        var ok = m.appName && m.appName !== 'Unknown Module';
                        window.__tbLog(ok ? 'INFO' : 'WARN', 'modules',
                            (ok ? '' : '[UNKNOWN] ') + (m.appName || m.fullName) + ' ' + (m.version ? 'v' + m.version : '(no version)')
                            + ' | configured=' + configured + ' used=' + used
                            + (m.rateLimited ? ' [rate-limited]' : '')
                            + '\n  pkg=' + pkgUrl
                            + '\n  app=' + (m.appPath || '(none)')
                        );
                    });
                }, 2000);

                if (window.TIZEN_WEBAPIS_PATH) {
                    this.send({ type: Events.WebApisPath, payload: window.TIZEN_WEBAPIS_PATH });
                    fetch(window.TIZEN_WEBAPIS_PATH)
                        .then(res => res.text())
                        .then(code => { this.send({ type: Events.WebApisCode, payload: code }); })
                        .catch(err => console.error('[WebSocketClient] Failed to fetch webapis code:', err));
                }

                // Startup toasts — delay 800ms to ensure __globalToast is registered
                // by the time we try to use it (race condition on first render).
                if (!this.startupToastShown && modules.length > 0) {
                    this.startupToastShown = true;
                    setTimeout(() => {
                        const t = window.__globalToast;
                        if (!t) return;

                        // Rate-limit warning first
                        if (rateLimitedModules.length > 0) {
                            t.error(`⚠️ GitHub rate limit hit — ${rateLimitedModules.join(', ')} loaded from CDN fallback`, 12000);
                        }

                        modules.forEach((module, idx) => {
                            setTimeout(() => {
                                const pkgUrl = getResolvedPackageUrl(module);
                                const label = module.appName && module.appName !== 'Unknown Module'
                                    ? `${module.appName} (${module.version || '?'})`
                                    : module.fullName;
                                const status = module.appName === 'Unknown Module' ? '❌' : '✅';
                                const src = (module.sourceMode || 'cdn').toUpperCase();
                                const rl = module.rateLimited ? ' ⚠️RL' : '';
                                t.info(`${status} ${label} [${src}${rl}]\n${pkgUrl}`, 10000);
                            }, idx * 500);
                        });
                    }, 800);
                }

                this.processPendingEvents();
                break;
            }

            case Events.CanLaunchModules: {
                this.context.dispatch({ type: 'SET_STATE', payload: 'service.connected' });
                if (payload && payload.type === 'autolaunch') {
                    this.context.dispatch({
                        type: 'SET_AUTOLAUNCH',
                        payload: { autoLaunchModule: payload.module }
                    });
                }

                if (!this.modulesLoaded) {
                    this.pendingEvents.push({ type, payload });
                } else {
                    this.handleCanLaunchModules(payload);
                }
                break;
            }

            case Events.LaunchModule: {
                const module = this.modules.find(mdl => mdl.fullName === payload);
                if (module) {
                    for (const key of module.keys) tizen.tvinputdevice.registerKey(key);
                    location.href = module.appPath;
                }
                break;
            }

            case Events.CheckTizenBrewConfig: {
                if (!toast) break;
                if (!payload.exists) {
                    toast.info(i18next.t('tizenBrewConfig.notFound'));
                    break;
                }
                if (payload.error) {
                    toast.error(i18next.t('tizenBrewConfig.statError', { error: payload.error }));
                    break;
                }

                const sizeKb = (payload.size / 1024).toFixed(1);
                const mtime  = new Date(payload.mtime).toLocaleString();
                const permStr = [
                    payload.readable ? i18next.t('tizenBrewConfig.readable') : null,
                    payload.writable ? i18next.t('tizenBrewConfig.writable') : null,
                ].filter(Boolean).join(', ') || i18next.t('tizenBrewConfig.noPermissions');
                const modeStr = payload.mode ? ` (0${payload.mode})` : '';

                let msg = i18next.t('tizenBrewConfig.fileInfo', {
                    sizeKb,
                    mtime,
                    permStr: `${permStr}${modeStr}`
                });

                if (payload.parseError) {
                    msg += '\n\n⚠️ ' + payload.parseError;
                } else if (payload.config !== null && payload.config !== undefined) {
                    msg += '\n\n' + JSON.stringify(payload.config, null, 2);
                }

                if (payload.attemptedPermissionFix) {
                    if (payload.permissionFixApplied) {
                        if (payload.modeBefore === payload.mode) {
                            msg += '\n\n' + i18next.t('tizenBrewConfig.permFix.noChange', { mode: payload.mode });
                        } else {
                            msg += '\n\n' + i18next.t('tizenBrewConfig.permFix.applied', {
                                before: payload.modeBefore,
                                after:  payload.mode
                            });
                        }
                    } else {
                        msg += '\n\n' + i18next.t('tizenBrewConfig.permFix.failed');
                    }
                }

                toast.info(msg, 12000);

                if (payload.config !== null && payload.config !== undefined) {
                    window.__tbLog && window.__tbLog('INFO', 'config-check', 'Full config: ' + JSON.stringify(payload.config));
                }
                break;
            }

            case Events.ResetTizenBrewConfig: {
                if (!toast) break;
                const msgs = {
                    success: () => {
                        toast.success(i18next.t('tizenBrewConfig.resetSuccess'));
                        this.send({ type: Events.GetModules, payload: true });
                    },
                    notFound:         () => toast.info(i18next.t('tizenBrewConfig.notFound')),
                    permissionDenied: () => toast.error(i18next.t('tizenBrewConfig.permissionDenied'), 8000),
                    error:            () => toast.error(i18next.t('tizenBrewConfig.resetError', { error: payload.message }), 8000),
                };
                (msgs[payload.status] ?? (() => {}))();
                break;
            }

            case Events.GetRemoteLogging: {
                this.context.dispatch({ type: 'SET_REMOTE_LOGGING', payload });
                // Log startup message now that remoteLogging state is known.
                // Use setTimeout so the dispatch above has flushed into logStateRef.
                if (payload && payload.enabled) {
                    var _rl = payload;
                    setTimeout(function() {
                        window.__tbLog && window.__tbLog('INFO', 'startup', 'TizenBrew UI connected | remote logging active | receiver=' + _rl.ip + ':' + (_rl.port || 3030));
                    }, 0);
                }
                break;
            }

            case Events.SetRemoteLogging: {
                if (toast && payload && payload.ok) toast.success('Remote logging settings saved');
                break;
            }
        }
    }

    handleCanLaunchModules(payload) {
        const debugStatus = this.context.state.sharedData.debugStatus;
        debugStatus.webDebug = true;
        this.context.dispatch({ type: 'SET_DEBUG_STATUS', payload: debugStatus });

        if (payload) {
            if (payload.type === 'autolaunch' && !window.shouldDisableAutoLaunch) {
                const module = this.modules.find(mdl => mdl.fullName === payload.module);
                if (!module) {
                    this.context.dispatch({
                        type: 'SET_ERROR',
                        payload: { message: 'errors.moduleNotFound', args: { moduleName: payload.module }, disappear: true }
                    });
                    return;
                }
                for (const key of module.keys) tizen.tvinputdevice.registerKey(key);
                this.send({ type: Events.LaunchModule, payload: module });
                if (!module.evaluateScriptOnDocumentStart) location.href = module.appPath;
            } else if (payload.type === 'appControl') {
                const module = payload.module;
                for (const key of module.keys) tizen.tvinputdevice.registerKey(key);
                this.send({ type: Events.LaunchModule, payload: module });
                module.appPath.includes('?')
                    ? location.href = `${module.appPath}&${payload.args}`
                    : location.href = `${module.appPath}?${payload.args}`;
            }
        }
    }

    processPendingEvents() {
        while (this.pendingEvents.length > 0) {
            const event = this.pendingEvents.shift();
            if (event.type === Events.CanLaunchModules) {
                this.handleCanLaunchModules(event.payload);
            }
        }
    }

    send(data) {
        this.socket.send(JSON.stringify(data));
    }
}

export { Events, getResolvedPackageUrl };
export default Client;