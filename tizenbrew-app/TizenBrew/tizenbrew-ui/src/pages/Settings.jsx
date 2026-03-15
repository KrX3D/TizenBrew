import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useContext, useRef } from 'react';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';
import { useLocation } from 'preact-iso';
import { useTranslation } from 'react-i18next';
import { getGlobalToast } from '../components/Toast.jsx';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

function ItemBasic({ children, onClick, shouldFocus, danger }) {
    const { ref, focused, focusSelf } = useFocusable();
    const lastClickRef = useRef(0);

    useEffect(() => {
        if (focused) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
    }, [focused, ref]);

    if (shouldFocus) {
        useEffect(() => { focusSelf(); }, [ref]);
    }

    function handleClick(e) {
        const now = Date.now();
        if (now - lastClickRef.current < 500) return;
        lastClickRef.current = now;
        onClick && onClick(e);
    }

    return (
        <div
            ref={ref}
            onClick={handleClick}
            className={classNames(
                'relative shadow-2xl rounded-3xl p-8 ring-1 sm:p-10 h-[35vh] w-[20vw]',
                danger
                    ? 'bg-red-950 ring-red-800'
                    : 'bg-gray-900 ring-gray-900/10',
                focused ? 'focus' : '',
            )}
        >
            {children}
        </div>
    );
}

export default function Settings() {
    const { state, dispatch } = useContext(GlobalStateContext);
    const loc = useLocation();
    const { t } = useTranslation();
    const resettingRef = useRef(false);
    const resetToastRef = useRef(null);
    const resetTimeoutRef = useRef(null);

    // Watch for ResetModules response from service
    useEffect(() => {
        const result = state.sharedData.resetModulesResult;
        if (!result || resetToastRef.current === null) return;

        const toast = getGlobalToast();
        if (!toast) return;

        if (resetTimeoutRef.current) {
            clearTimeout(resetTimeoutRef.current);
            resetTimeoutRef.current = null;
        }

        const msg = (result.success ? '✅ Reset complete\n' : '❌ Reset failed\n') + (result.detail || '');

        toast.resolve(resetToastRef.current, result.success ? 'success' : 'error', msg, 10000);
        resetToastRef.current = null;
        resettingRef.current = false;

        dispatch({ type: 'SET_RESET_MODULES_RESULT', payload: null });

        if (result.success) {
            setTimeout(() => window.location.reload(), 5000);
        }
    }, [state.sharedData.resetModulesResult]);

    function handleResetModules() {
        if (resettingRef.current) return;

        if (!confirm(
            'Reset module data?\n\n' +
            'This overwrites tizenbrewConfig.json at /home/owner/share with defaults.\n' +
            'The app will reload afterwards.'
        )) return;

        resettingRef.current = true;

        const toast = getGlobalToast();
        if (!toast) { resettingRef.current = false; return; }

        // Check service is alive
        if (!state.client?.socket || state.client.socket.readyState !== WebSocket.OPEN) {
            resettingRef.current = false;
            toast.error(
                '❌ Service not connected.\n\n' +
                'The service writes the config file — it must be running to reset it.\n' +
                'Try restarting the app first.',
                10000
            );
            return;
        }

        resetToastRef.current = toast.loading(
            '⏳ Sending reset to service…\n' +
            'Target: /home/owner/share/tizenbrewConfig.json'
        );

        state.client.send({ type: Events.ResetModules, payload: null });

        // 10s safety timeout
        resetTimeoutRef.current = setTimeout(() => {
            if (resetToastRef.current !== null && toast) {
                toast.resolve(
                    resetToastRef.current,
                    'error',
                    '❌ No response from service after 10s.\nIs it still running?',
                    8000
                );
                resetToastRef.current = null;
                resettingRef.current = false;
            }
        }, 10000);
    }

    return (
        <div className="relative isolate lg:px-8">
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                <ItemBasic onClick={() => {
                    if (state.sharedData.modules?.length === 0) return alert(t('settings.noModules'));
                    loc.route('/tizenbrew-ui/dist/index.html/settings/change?type=autolaunch');
                }}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>
                        {t('settings.autolaunch')}
                    </h3>
                    <p className='text-gray-300 mt-6 text-base/7'>
                        {t('settings.autolaunchDesc')}
                    </p>
                </ItemBasic>
                <ItemBasic onClick={() => {
                    if (state.sharedData.modules?.length === 0) return alert(t('settings.noModules'));
                    loc.route('/tizenbrew-ui/dist/index.html/settings/change?type=autolaunchService');
                }}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>
                        {t('settings.autolaunchService')}
                    </h3>
                    <p className='text-gray-300 mt-6 text-base/7'>
                        {t('settings.autolaunchServiceDesc')}
                    </p>
                </ItemBasic>
                <ItemBasic onClick={() => loc.route('/tizenbrew-ui/dist/index.html/settings/change-ua')}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>
                        {t('settings.useragent')}
                    </h3>
                    <p className='text-gray-300 mt-6 text-base/7'>
                        {t('settings.useragentDesc')}
                    </p>
                </ItemBasic>
                <ItemBasic onClick={handleResetModules} danger>
                    <h3 className='text-red-400 text-base/7 font-semibold'>
                        Reset Module Data
                    </h3>
                    <p className='text-red-300/70 mt-6 text-base/7'>
                        Overwrites tizenbrewConfig.json with defaults via the service.
                        Shows directory listing so you can see what's on disk.
                    </p>
                </ItemBasic>
            </div>
        </div>
    );
}

function Change() {
    const loc = useLocation();
    const { state } = useContext(GlobalStateContext);
    const { t } = useTranslation();

    return (
        <div className="relative isolate lg:px-8">
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                {state?.sharedData?.modules?.map((module, idx) => {
                    if (loc.query.type === 'autolaunchService' && !module.serviceFile) return null;
                    return (
                        <ItemBasic
                            shouldFocus={idx === 0}
                            key={idx}
                            onClick={() => {
                                if (confirm(t('settings.enableAutolaunchPrompt', { packageName: module.appName }))) {
                                    state.client.send({
                                        type: Events.ModuleAction,
                                        payload: { action: loc.query.type, module: module.fullName }
                                    });
                                    loc.route('/tizenbrew-ui/dist/index.html/settings');
                                    setFocus('sn:focusable-item-1');
                                }
                            }}>
                            <h3 className='text-indigo-400 text-base/7 font-semibold'>
                                {module.appName} ({module.version})
                            </h3>
                            <p className='text-gray-300 mt-6 text-base/7'>
                                {module.description}
                            </p>
                        </ItemBasic>
                    );
                })}
                <ItemBasic
                    shouldFocus={state?.sharedData?.modules?.length === 0}
                    onClick={() => {
                        if (confirm(t('settings.disableAutolaunchPrompt'))) {
                            state.client.send({
                                type: Events.ModuleAction,
                                payload: { action: loc.query.type, module: '' }
                            });
                            loc.route('/tizenbrew-ui/dist/index.html/settings');
                            setFocus('sn:focusable-item-1');
                        }
                    }}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>
                        {t('settings.disableAutolaunch')}
                    </h3>
                </ItemBasic>
            </div>
        </div>
    );
}

export { Change };