import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useContext, useState, useRef } from 'react';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';
import { useLocation } from 'preact-iso';
import { useTranslation } from 'react-i18next';
import ConfirmModal from '../components/ConfirmModal.jsx';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

function ItemBasic({ children, onClick, shouldFocus, selected, focusKey }) {
    const { ref, focused, focusSelf } = useFocusable({ focusKey, onEnterPress: onClick });
    useEffect(() => {
        if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, [focused, ref]);
    if (shouldFocus) { useEffect(() => { focusSelf(); }, [ref]); }

    return (
        <div ref={ref} onClick={onClick} className={classNames(
            'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw] mb-4',
            focused ? 'focus' : '',
            selected ? 'ring-2 ring-indigo-400' : ''
        )}>
            {children}
        </div>
    );
}

// ─── Settings overview ────────────────────────────────────────────────────────

export default function Settings() {
    const { state } = useContext(GlobalStateContext);
    const loc = useLocation();
    const { t } = useTranslation();
    const [resetModal, setResetModal] = useState(false);
    const lastCheckTs = useRef(0);
    const lastResetTs = useRef(0);

    function handleCheck() {
        const now = Date.now();
        if (now - lastCheckTs.current < 1000) return;
        lastCheckTs.current = now;
        if (window.__tbLog) window.__tbLog('INFO', 'ui:settings', 'Check config');
        if (state.client) state.client.send({ type: Events.CheckTizenBrewConfig });
    }

    function handleResetRequest() {
        const now = Date.now();
        if (now - lastResetTs.current < 1000) return;
        lastResetTs.current = now;
        setResetModal(true);
    }

    function handleResetConfirm() {
        setResetModal(false);
        if (window.__tbLog) window.__tbLog('WARN', 'ui:settings', 'Config reset confirmed');
        if (state.client) state.client.send({ type: Events.ResetTizenBrewConfig });
        setTimeout(() => setFocus('settings-card-reset'), 80);
    }

    function handleResetCancel() {
        setResetModal(false);
        setTimeout(() => setFocus('settings-card-reset'), 50);
    }

    return (
        <div className="relative isolate lg:px-8 pt-6">
            {resetModal && (
                <ConfirmModal
                    message={t('tizenBrewConfig.resetConfirm')}
                    onConfirm={handleResetConfirm}
                    onCancel={handleResetCancel}
                />
            )}

            <div className="mx-auto flex flex-wrap justify-center gap-x-2 relative pb-6">
                <ItemBasic shouldFocus focusKey="settings-card-autolaunch" onClick={() => {
                    if (state.sharedData.modules?.length === 0) return alert(t('settings.noModules'));
                    if (window.__tbLog) window.__tbLog('INFO', 'ui:settings', 'Open: Autolaunch');
                    loc.route('/tizenbrew-ui/dist/index.html/settings/change?type=autolaunch');
                }}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>{t('settings.autolaunch')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('settings.autolaunchDesc')}</p>
                </ItemBasic>

                <ItemBasic focusKey="settings-card-autolaunchsvc" onClick={() => {
                    if (state.sharedData.modules?.length === 0) return alert(t('settings.noModules'));
                    if (window.__tbLog) window.__tbLog('INFO', 'ui:settings', 'Open: Autolaunch Service');
                    loc.route('/tizenbrew-ui/dist/index.html/settings/change?type=autolaunchService');
                }}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>{t('settings.autolaunchService')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('settings.autolaunchServiceDesc')}</p>
                </ItemBasic>

                <ItemBasic focusKey="settings-card-ua" onClick={() => {
                    if (window.__tbLog) window.__tbLog('INFO', 'ui:settings', 'Open: User-Agent');
                    loc.route('/tizenbrew-ui/dist/index.html/settings/change-ua');
                }}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>{t('settings.useragent')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('settings.useragentDesc')}</p>
                </ItemBasic>

                <ItemBasic focusKey="settings-card-remote-logging" onClick={() => {
                    if (window.__tbLog) window.__tbLog('INFO', 'ui:settings', 'Open: Remote Logging');
                    loc.route('/tizenbrew-ui/dist/index.html/settings/remote-logging');
                }}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>{t('settings.remoteLogging')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('settings.remoteLoggingDesc')}</p>
                </ItemBasic>

                <ItemBasic focusKey="settings-card-check" onClick={handleCheck}>
                    <h3 className='text-sky-400 text-base/7 font-semibold'>{t('tizenBrewConfig.checkButton')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('tizenBrewConfig.checkDesc')}</p>
                </ItemBasic>

                <ItemBasic focusKey="settings-card-reset" onClick={handleResetRequest}>
                    <h3 className='text-red-400 text-base/7 font-semibold'>{t('tizenBrewConfig.resetButton')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('tizenBrewConfig.resetDesc')}</p>
                </ItemBasic>
            </div>
        </div>
    );
}

// ─── Change page ──────────────────────────────────────────────────────────────

function Change() {
    const loc = useLocation();
    const { state, dispatch } = useContext(GlobalStateContext);
    const { t } = useTranslation();
    const [modal, setModal] = useState(null);

    const isServiceType = loc.query.type === 'autolaunchService';
    const activeAutolaunch  = state?.sharedData?.autoLaunchModule      || '';
    const activeServiceList = state?.sharedData?.autoLaunchServiceList || [];

    function isActive(module) {
        if (isServiceType) {
            return Array.isArray(activeServiceList)
                ? activeServiceList.includes(module.fullName)
                : activeServiceList === module.fullName;
        }
        return activeAutolaunch === module.fullName;
    }

    function handleSelect(module, cardKey) {
        setModal({
            message: t('settings.enableAutolaunchPrompt', { packageName: module.appName }),
            returnFocusKey: cardKey,
            onConfirm: () => {
                setModal(null);
                if (window.__tbLog) window.__tbLog('INFO', 'ui:settings', 'Autolaunch set: ' + module.appName + ' (' + loc.query.type + ')');
                state.client.send({ type: Events.ModuleAction, payload: { action: loc.query.type, module: module.fullName } });
                if (loc.query.type === 'autolaunch') {
                    dispatch({ type: 'SET_AUTOLAUNCH', payload: { autoLaunchModule: module.fullName } });
                } else {
                    dispatch({ type: 'SET_AUTOLAUNCH', payload: { autoLaunchServiceList: module.fullName ? [module.fullName] : [] } });
                }
                loc.route('/tizenbrew-ui/dist/index.html/settings');
                setFocus('sn:focusable-item-1');
            }
        });
    }

    function handleDisable(disableKey) {
        setModal({
            message: t('settings.disableAutolaunchPrompt'),
            returnFocusKey: disableKey,
            onConfirm: () => {
                setModal(null);
                if (window.__tbLog) window.__tbLog('INFO', 'ui:settings', 'Autolaunch disabled (' + loc.query.type + ')');
                state.client.send({ type: Events.ModuleAction, payload: { action: loc.query.type, module: '' } });
                if (loc.query.type === 'autolaunch') {
                    dispatch({ type: 'SET_AUTOLAUNCH', payload: { autoLaunchModule: '' } });
                } else {
                    dispatch({ type: 'SET_AUTOLAUNCH', payload: { autoLaunchServiceList: [] } });
                }
                loc.route('/tizenbrew-ui/dist/index.html/settings');
                setFocus('sn:focusable-item-1');
            }
        });
    }

    const disableSelected = isServiceType ? activeServiceList.length === 0 : activeAutolaunch === '';

    return (
        <div className="relative isolate lg:px-8 pt-6">
            {modal && (
                <ConfirmModal
                    message={modal.message}
                    returnFocusKey={modal.returnFocusKey}
                    onConfirm={modal.onConfirm}
                    onCancel={() => setModal(null)}
                />
            )}

            <div className="mx-auto flex flex-wrap justify-center gap-x-2 relative pb-6">
                {state?.sharedData?.modules?.map((module, idx) => {
                    if (isServiceType && !module.serviceFile) return null;
                    const selected = isActive(module);
                    const cardKey = `settings-card-${idx}`;
                    return (
                        <ItemBasic key={idx} focusKey={cardKey} selected={selected} shouldFocus={idx === 0}
                            onClick={() => handleSelect(module, cardKey)}>
                            <h3 className='text-indigo-400 text-base/7 font-semibold'>
                                {module.appName} ({module.version})
                            </h3>
                            <p className='text-gray-300 mt-6 text-base/7'>{module.description}</p>
                            {selected && (
                                <span className='absolute top-3 right-3 text-xs bg-indigo-600 text-white px-2 py-1 rounded'>
                                    {t('settings.selected')}
                                </span>
                            )}
                        </ItemBasic>
                    );
                })}

                <ItemBasic focusKey="settings-disable" selected={disableSelected}
                    shouldFocus={state?.sharedData?.modules?.length === 0}
                    onClick={() => handleDisable('settings-disable')}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>{t('settings.disableAutolaunch')}</h3>
                    {disableSelected && (
                        <span className='absolute top-3 right-3 text-xs bg-indigo-600 text-white px-2 py-1 rounded'>
                            {t('settings.selected')}
                        </span>
                    )}
                </ItemBasic>
            </div>
        </div>
    );
}

export { Change };