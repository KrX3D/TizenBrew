import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useContext } from 'react';
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

// ─── Config reset ─────────────────────────────────────────────────────────────
// configuration.js hardcodes this single path — no need to guess.
const CONFIG_PATH = 'documents/tizenbrewConfig.json'; // Tizen virtual path for /home/owner/share
const CONFIG_FILENAME = 'tizenbrewConfig.json';

const DEFAULT_CONFIG = JSON.stringify({
    modules: ['npm/@foxreis/tizentube'],
    autoLaunchServiceList: [],
    autoLaunchModule: '',
}, null, 4);

function fsResolve(path, mode) {
    return new Promise((resolve, reject) => {
        try {
            tizen.filesystem.resolve(path, resolve, reject, mode);
        } catch (e) { reject(e); }
    });
}

function fsList(dir) {
    return new Promise((resolve) => {
        try {
            dir.listFiles(
                (files) => resolve(files.map(f => f.name)),
                () => resolve([])
            );
        } catch (e) { resolve([]); }
    });
}

function fsWriteFile(dir, filename, content) {
    return new Promise((resolve) => {
        try {
            let fileObj;
            try {
                fileObj = dir.createFile(filename);
            } catch (e) {
                // Already exists — resolve it
                try { fileObj = dir.resolve(filename); }
                catch (e2) { return resolve({ ok: false, err: 'Cannot create or resolve file: ' + e2.message }); }
            }
            fileObj.openStream('w', (stream) => {
                try {
                    stream.write(content);
                    stream.close();
                    resolve({ ok: true });
                } catch (e) { resolve({ ok: false, err: 'stream.write: ' + e.message }); }
            }, (e) => resolve({ ok: false, err: 'openStream: ' + e.message }), 'UTF-8');
        } catch (e) { resolve({ ok: false, err: 'fsWriteFile threw: ' + e.message }); }
    });
}

// Tizen virtual filesystem paths for /home/owner/share
// 'documents' is the standard Tizen virtual root that maps to /home/owner/share
const VIRTUAL_ROOTS_TO_TRY = [
    'documents',    // → /home/owner/share  (standard Tizen)
    'wgt-private',  // → app's private storage (fallback)
];

async function doDirectReset(toastId, toast) {
    const log = [];
    function step(msg) {
        log.push(msg);
        toast.update(toastId, log.join('\n'));
    }

    step('📋 Target: /home/owner/share/tizenbrewConfig.json');
    step('🔍 Resolving Tizen virtual path...');

    let resetDone = false;

    for (const virtualRoot of VIRTUAL_ROOTS_TO_TRY) {
        let dir;
        try {
            dir = await fsResolve(virtualRoot, 'rw');
            step(`✓ Resolved "${virtualRoot}"`);
        } catch (e) {
            step(`✗ "${virtualRoot}" not accessible: ${e.message || e}`);
            continue;
        }

        // List so we can confirm the config file is there
        const files = await fsList(dir);
        step(`  Contents: ${files.length > 0 ? files.join(', ') : '(empty or listing unavailable)'}`);

        const hasConfig = files.includes(CONFIG_FILENAME);
        step(hasConfig ? `  ⚠️ ${CONFIG_FILENAME} found` : `  ℹ️ ${CONFIG_FILENAME} not present — will create fresh`);

        step(`  ✏️ Writing default config...`);
        const result = await fsWriteFile(dir, CONFIG_FILENAME, DEFAULT_CONFIG);

        if (result.ok) {
            step(`  ✅ Write succeeded!`);
            resetDone = true;
            break;
        } else {
            step(`  ❌ Write failed: ${result.err}`);
        }
    }

    return { resetDone, log };
}

function tryServiceReset(state) {
    try {
        if (state.client && state.client.socket && state.client.socket.readyState === WebSocket.OPEN) {
            state.client.send({ type: Events.ResetModules, payload: null });
            return true;
        }
    } catch (e) { /* service dead, fine */ }
    return false;
}

export default function Settings() {
    const { state } = useContext(GlobalStateContext);
    const loc = useLocation();
    const { t } = useTranslation();

    async function handleResetModules() {
        if (!confirm(
            'Reset module data?\n\n' +
            'This overwrites tizenbrewConfig.json with the default and reloads the app.'
        )) return;

        const toast = getGlobalToast();
        if (!toast) return alert('Toast not ready, try again.');

        const toastId = toast.loading('Starting reset…');

        const { resetDone, log } = await doDirectReset(toastId, toast);

        const sentToService = tryServiceReset(state);
        if (sentToService) {
            toast.update(toastId, log.join('\n') + '\n📡 Service also notified');
        }

        if (resetDone) {
            toast.resolve(
                toastId,
                'success',
                log.join('\n') + '\n\n✅ Done — reloading in 5s',
                10000
            );
            setTimeout(() => window.location.reload(), 5000);
        } else {
            toast.resolve(
                toastId,
                'error',
                log.join('\n') + '\n\n❌ Could not write config.\nTry reinstalling the app.',
                15000
            );
        }
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
                        Rewrites tizenbrewConfig.json to defaults. Works even if the service is broken.
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