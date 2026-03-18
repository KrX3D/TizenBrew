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
    WebApisPath: 20,
    WebApisCode: 21
};

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
                const state = this.context.state;
                state.sharedData.debugStatus = payload;
                this.context.dispatch({ type: 'SET_SHARED_DATA', payload: state.sharedData });

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

                this.context.dispatch({ type: 'SET_MODULES', payload });
                this.modules = payload;
                this.modulesLoaded = true;
                this.send({ type: Events.Ready });

                if (window.TIZEN_WEBAPIS_PATH) {
                    this.send({ type: Events.WebApisPath, payload: window.TIZEN_WEBAPIS_PATH });
                    fetch(window.TIZEN_WEBAPIS_PATH)
                        .then(res => res.text())
                        .then(code => { this.send({ type: Events.WebApisCode, payload: code }); })
                        .catch(err => console.error('[WebSocketClient] Failed to fetch webapis code:', err));
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
                break;
            }

            case Events.ResetTizenBrewConfig: {
                if (!toast) break;
                const msgs = {
                    success:          () => toast.success(i18next.t('tizenBrewConfig.resetSuccess')),
                    notFound:         () => toast.info(i18next.t('tizenBrewConfig.notFound')),
                    permissionDenied: () => toast.error(i18next.t('tizenBrewConfig.permissionDenied')),
                    error:            () => toast.error(i18next.t('tizenBrewConfig.resetError', { error: payload.message })),
                };
                (msgs[payload.status] ?? (() => {}))();
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

export { Events };
export default Client;