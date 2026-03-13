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
    useEffect(() => {
        if (focused) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
    }, [focused, ref]);

    if (shouldFocus) {
        useEffect(() => { focusSelf(); }, [ref]);
    }

    return (
        <div
            ref={ref}
            onClick={onClick}
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

    // null  = idle
    // -1    = in-flight but no toast (toast unavailable)
    // N > 0 = toast ID currently showing "loading"
    const resetToastRef = useRef(null);
    const resetTimeoutRef = useRef(null);

    // Watch for service response to ResetModules
    useEffect(() => {
        const result = state.sharedData.resetModulesResult;
        if (!result) return;

        // Clear the safety timeout — service responded in time
        if (resetTimeoutRef.current) {
            clearTimeout(resetTimeoutRef.current);
            resetTimeoutRef.current = null;
        }

        const toast = getGlobalToast();

        // Build a concise but informative message
        let msg;
        if (result.success) {
            // Show which file was deleted
            msg = '✓ Config deleted: ' + result.deleted.join(', ');
        } else {
            // Show what was found in the candidate dirs so we know where config actually lives
            const dirLines = Object.keys(result.dirListings || {}).map(function(dir) {
                var files = result.dirListings[dir];
                var shortDir = dir.split('/').slice(-2).join('/');
                var fileStr = Array.isArray(files)
                    ? (files.length > 0 ? files.join(', ') : '(empty)')
                    : files;
                return shortDir + ': ' + fileStr;
            });
            msg = 'No config found. Dirs checked: ' + dirLines.join(' | ');
        }

        // Resolve the loading toast if we have one
        if (toast && resetToastRef.current !== null && resetToastRef.current !== -1) {
            toast.resolve(
                resetToastRef.current,
                result.success ? 'success' : 'info',
                msg,
                8000
            );
        } else if (toast) {
            // Fallback: show a fresh toast if the loading one was lost
            toast[result.success ? 'success' : 'info'](msg, 8000);
        }

        // Mark as idle BEFORE dispatching null (prevents a second useEffect run from acting)
        resetToastRef.current = null;

        // Clear result from state
        dispatch({ type: 'SET_RESET_MODULES_RESULT', payload: null });

        // Reload after the toast has been read
        setTimeout(function() { window.location.reload(); }, 8500);
    }, [state.sharedData.resetModulesResult]);

    function handleResetModules() {
        // ── GUARD: Samsung TV fires double-click (spatial nav + main.jsx Enter handler) ──
        // Ignore any invocation while a reset is already in flight.
        if (resetToastRef.current !== null) return;

        if (!confirm('Reset all module data? This will delete your saved module list and restore defaults. The app will reload afterwards.')) return;

        const toast = getGlobalToast();
        if (toast) {
            resetToastRef.current = toast.loading('Resetting module data…');
        } else {
            resetToastRef.current = -1; // in-flight but no toast handle
        }

        state.client.send({ type: Events.ResetModules, payload: null });

        // 10s safety timeout — fires only if service never responds
        resetTimeoutRef.current = setTimeout(function() {
            const t2 = getGlobalToast();
            if (t2 && resetToastRef.current !== null && resetToastRef.current !== -1) {
                t2.resolve(resetToastRef.current, 'error', 'No response from service after 10s. Is the service still running?');
            }
            resetToastRef.current = null;
            resetTimeoutRef.current = null;
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
                        Deletes your saved module list and resets to defaults. Shows diagnostic info about where config lives on your TV.
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