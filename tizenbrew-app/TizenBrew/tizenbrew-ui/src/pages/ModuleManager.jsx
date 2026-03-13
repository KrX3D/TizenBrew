import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useContext, useState, useRef } from 'react';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';
import { useLocation } from 'preact-iso';
import { useTranslation } from 'react-i18next';
import { ToastContainer, useToast } from '../components/Toast.jsx';

const DEFAULTS = {
    npm: '@krx3d/tizentube2',
    gh: 'krx3d/tizentube',
};

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

function Item({ children, module, id, state, onRemove }) {
    const { t } = useTranslation();
    const { ref, focused } = useFocusable();
    useEffect(() => {
        if (focused) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
    }, [focused, ref]);

    function handleOnClick() {
        const deleteConfirm = confirm(t('moduleManager.confirmDelete', { packageName: module.appName }));
        if (deleteConfirm) {
            state.client.send({ type: Events.ModuleAction, payload: { action: 'remove', module: module.fullName } });
            state.client.send({ type: Events.GetModules, payload: true });
            onRemove(module.appName);
            setFocus('sn:focusable-item-1');
        }
    }

    return (
        <div
            key={id}
            ref={ref}
            onClick={handleOnClick}
            className={classNames(
                'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw]',
                focused ? 'focus' : '',
                id === 0 ? 'ml-4' : ''
            )}
        >
            {children}
        </div>
    );
}

function ItemBasic({ children, onClick }) {
    const { ref, focused } = useFocusable();
    useEffect(() => {
        if (focused) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
    }, [focused, ref]);

    return (
        <div
            ref={ref}
            onClick={onClick}
            className={classNames(
                'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw]',
                focused ? 'focus' : '',
            )}
        >
            {children}
        </div>
    );
}

export default function ModuleManager() {
    const { state } = useContext(GlobalStateContext);
    const loc = useLocation();
    const { t } = useTranslation();
    const { toasts, toast } = useToast();

    function handleRemove(appName) {
        toast.info(`"${appName}" removed.`);
    }

    return (
        <>
            <ToastContainer toasts={toasts} onDismiss={toast.dismiss} />
            <div className="relative isolate lg:px-8">
                <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                    {state?.sharedData?.modules?.map((module, moduleIdx) => (
                        <Item module={module} id={moduleIdx} state={state} onRemove={handleRemove}>
                            <h3 className='text-indigo-400 text-base/7 font-semibold'>
                                {module.appName} ({module.version})
                            </h3>
                            <p className='text-gray-300 mt-6 text-base/7'>
                                {module.description}
                            </p>
                        </Item>
                    ))}
                    <ItemBasic onClick={() => loc.route('/tizenbrew-ui/dist/index.html/module-manager/add?type=npm')}>
                        <h3 className='text-indigo-400 text-base/7 font-semibold'>
                            {t('moduleManager.addNPM')}
                        </h3>
                        <p className='text-gray-300 mt-6 text-base/7'>
                            {t('moduleManager.addNPMDesc')}
                        </p>
                    </ItemBasic>
                    <ItemBasic onClick={() => loc.route('/tizenbrew-ui/dist/index.html/module-manager/add?type=gh')}>
                        <h3 className='text-indigo-400 text-base/7 font-semibold'>
                            {t('moduleManager.addGH')}
                        </h3>
                        <p className='text-gray-300 mt-6 text-base/7'>
                            {t('moduleManager.addGHDesc')}
                        </p>
                    </ItemBasic>
                </div>
            </div>
        </>
    );
}

function AddModule() {
    const loc = useLocation();
    const { state } = useContext(GlobalStateContext);
    const { t } = useTranslation();
    const { toasts, toast } = useToast();

    const type = loc.query.type || 'npm';
    const [name, setName] = useState(DEFAULTS[type] || '');

    const inputRef = useRef(null);
    // Use a ref for the in-flight guard so it's synchronous — no closure stale-value issues
    const submittingRef = useRef(false);
    const waitingFor = useRef(null);
    const toastId = useRef(null);
    const moduleSnapshot = useRef(null);
    const [waiting, setWaiting] = useState(false);

    useEffect(() => {
        // Small delay so spatial navigation doesn't immediately steal focus back
        const t = setTimeout(() => inputRef.current?.focus(), 100);
        return () => clearTimeout(t);
    }, []);

    // Watch for modules list to change reference (= service responded to GetModules)
    useEffect(() => {
        if (!submittingRef.current) return;
        const modules = state?.sharedData?.modules;
        if (!modules) return;
        // Not changed yet — wait for the real response
        if (modules === moduleSnapshot.current) return;

        const fullName = waitingFor.current;
        const shortName = fullName.split('/').slice(1).join('/');
        const found = modules.find(m => m.fullName === fullName);

        if (found && found.appName !== 'Unknown Module') {
            toast.resolve(toastId.current, 'success', `✓ "${found.appName}" (${found.version}) added!`);
            setTimeout(() => {
                loc.route('/tizenbrew-ui/dist/index.html/module-manager');
                setFocus('sn:focusable-item-1');
            }, 1500);
        } else if (found) {
            // Came back as Unknown Module — CDN miss
            const hint = type === 'npm'
                ? `Not found on jsDelivr. New npm packages can take up to 24h — try "gh" type for instant GitHub access.`
                : `Not found on GitHub. Double-check the user/repo name.`;
            toast.resolve(toastId.current, 'error', `"${shortName}" — ${hint}`);
        } else {
            toast.resolve(toastId.current, 'error', `"${shortName}" could not be added. Check the name and try again.`);
        }

        submittingRef.current = false;
        waitingFor.current = null;
        toastId.current = null;
        moduleSnapshot.current = null;
        setWaiting(false);
    }, [state?.sharedData?.modules]);

    // 15s timeout safety net
    useEffect(() => {
        if (!waiting) return;
        const timer = setTimeout(() => {
            if (!submittingRef.current) return;
            toast.resolve(toastId.current, 'error', 'No response from service after 15s. Is it still running?');
            submittingRef.current = false;
            waitingFor.current = null;
            toastId.current = null;
            moduleSnapshot.current = null;
            setWaiting(false);
        }, 15000);
        return () => clearTimeout(timer);
    }, [waiting]);

    function handleSubmit() {
        // Synchronous guard — prevents double-fire from Enter + blur both triggering
        if (submittingRef.current) return;

        const trimmed = name.trim();
        if (!trimmed) {
            loc.route('/tizenbrew-ui/dist/index.html/module-manager');
            setFocus('sn:focusable-item-1');
            return;
        }

        if (!trimmed.match(/^[a-zA-Z0-9@._\-\/]+$/)) {
            toast.error('Invalid module name — use letters, numbers, @, ., -, / only.');
            return;
        }

        const fullName = `${type}/${trimmed}`;

        submittingRef.current = true;
        moduleSnapshot.current = state?.sharedData?.modules ?? null;

        toastId.current = toast.loading(
            type === 'gh'
                ? `Fetching "${trimmed}" from raw.githubusercontent.com…`
                : `Fetching "${trimmed}" from cdn.jsdelivr.net…`
        );

        state.client.send({ type: Events.ModuleAction, payload: { action: 'add', module: fullName } });
        state.client.send({ type: Events.GetModules, payload: true });

        waitingFor.current = fullName;
        setWaiting(true);
    }

    function handleCancel() {
        if (submittingRef.current) return;
        loc.route('/tizenbrew-ui/dist/index.html/module-manager');
        setFocus('sn:focusable-item-1');
    }

    return (
        <>
            <ToastContainer toasts={toasts} onDismiss={toast.dismiss} />
            <div className="relative isolate lg:px-8">
                <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                    <div className='relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 w-[30vw]'>
                        <p className='text-gray-400 text-xl mb-3'>
                            {t('moduleManager.moduleName', { type })}
                        </p>
                        <input
                            type="text"
                            ref={inputRef}
                            value={name}
                            disabled={waiting}
                            className={classNames(
                                'w-full p-2 rounded-lg bg-gray-800 text-gray-200 transition-opacity',
                                waiting ? 'opacity-50 cursor-not-allowed' : ''
                            )}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSubmit();
                                if (e.key === 'Escape') handleCancel();
                            }}
                            placeholder={DEFAULTS[type] || ''}
                        />

                        {waiting ? (
                            <p className='text-slate-400 text-lg mt-4 animate-pulse'>
                                {type === 'gh'
                                    ? 'Checking raw.githubusercontent.com…'
                                    : 'Checking cdn.jsdelivr.net…'
                                }
                            </p>
                        ) : (
                            <div className='flex gap-3 mt-4'>
                                <button
                                    onClick={handleSubmit}
                                    className='flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xl font-semibold transition-colors'
                                >
                                    {t('moduleManager.addModule')}
                                </button>
                                <button
                                    onClick={handleCancel}
                                    className='py-2 px-4 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-xl transition-colors'
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

export { AddModule };