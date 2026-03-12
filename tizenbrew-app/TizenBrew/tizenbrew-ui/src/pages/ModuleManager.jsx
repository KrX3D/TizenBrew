import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useContext, useState, useRef } from 'react';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';
import { useLocation } from 'preact-iso';
import { useTranslation } from 'react-i18next';
import { ToastContainer, useToast } from '../components/Toast.jsx';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

function Item({ children, module, id, state, onRemove }) {
    const { t } = useTranslation();
    const { ref, focused } = useFocusable();
    useEffect(() => {
        if (focused) {
            ref.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center',
            });
        }
    }, [focused, ref]);

    function handleOnClick() {
        const deleteConfirm = confirm(t('moduleManager.confirmDelete', { packageName: module.appName }));
        if (deleteConfirm) {
            state.client.send({
                type: Events.ModuleAction,
                payload: { action: 'remove', module: module.fullName }
            });
            state.client.send({
                type: Events.GetModules,
                payload: true
            });
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
            ref.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center',
            });
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
    const [name, setName] = useState('');
    const loc = useLocation();
    const { state } = useContext(GlobalStateContext);
    const ref = useRef(null);
    const { t } = useTranslation();
    const { toasts, toast } = useToast();

    // Whether we're actively waiting for a GetModules response
    const [waiting, setWaiting] = useState(false);
    const waitingFor = useRef(null);  // full module name, e.g. "npm/tizentube"
    const toastId = useRef(null);
    // Snapshot of the modules array reference at submit time so we can
    // detect when the list has actually been refreshed by the service
    const moduleSnapshot = useRef(null);

    useEffect(() => {
        ref.current?.focus();
    }, [ref]);

    // Watch for the modules list to update AFTER we submitted.
    // We compare by reference: a new array means GetModules responded.
    useEffect(() => {
        if (!waiting || !waitingFor.current) return;
        const modules = state?.sharedData?.modules;
        if (!modules) return;
        // Same reference as before submit → response hasn't arrived yet
        if (modules === moduleSnapshot.current) return;

        const fullName = waitingFor.current;
        const shortName = fullName.split('/').slice(1).join('/');
        const found = modules.find(m => m.fullName === fullName);

        if (found && found.appName !== 'Unknown Module') {
            toast.resolve(toastId.current, 'success',
                `✓ "${found.appName}" (${found.version}) added!`
            );
            setTimeout(() => {
                loc.route('/tizenbrew-ui/dist/index.html/module-manager');
                setFocus('sn:focusable-item-1');
            }, 1500);
        } else if (found && found.appName === 'Unknown Module') {
            // Service fetched but got no valid package.json
            toast.resolve(toastId.current, 'error',
                loc.query.type === 'npm'
                    ? `"${shortName}" not found on jsDelivr. New npm packages can take up to 24h to appear — try the gh/ type instead.`
                    : `"${shortName}" not found on GitHub. Check the user/repo name.`
            );
        } else {
            // Module wasn't saved at all
            toast.resolve(toastId.current, 'error',
                `"${shortName}" could not be added. Check the name and try again.`
            );
        }

        setWaiting(false);
        waitingFor.current = null;
        toastId.current = null;
        moduleSnapshot.current = null;
    }, [state?.sharedData?.modules, waiting]);

    // 15s safety net in case the service never responds
    useEffect(() => {
        if (!waiting) return;
        const timeout = setTimeout(() => {
            if (!waiting) return;
            toast.resolve(toastId.current, 'error',
                'No response from the service after 15s. Is it still running?'
            );
            setWaiting(false);
            waitingFor.current = null;
            toastId.current = null;
            moduleSnapshot.current = null;
        }, 15000);
        return () => clearTimeout(timeout);
    }, [waiting]);

    function handleSubmit() {
        if (waiting) return;

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

        const fullName = `${loc.query.type}/${trimmed}`;

        // Snapshot current modules reference before triggering reload
        moduleSnapshot.current = state?.sharedData?.modules ?? null;

        toastId.current = toast.loading(
            loc.query.type === 'gh'
                ? `Fetching "${trimmed}" from raw.githubusercontent.com…`
                : `Fetching "${trimmed}" from cdn.jsdelivr.net…`
        );

        state.client.send({
            type: Events.ModuleAction,
            payload: { action: 'add', module: fullName }
        });

        state.client.send({
            type: Events.GetModules,
            payload: true
        });

        waitingFor.current = fullName;
        setWaiting(true);
    }

    return (
        <>
            <ToastContainer toasts={toasts} onDismiss={toast.dismiss} />
            <div className="relative isolate lg:px-8">
                <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                    <div className='relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw]'>
                        <p className='text-gray-400 text-xl mb-3'>
                            {t('moduleManager.moduleName', { type: loc.query.type })}
                        </p>
                        <input
                            type="text"
                            ref={ref}
                            value={name}
                            disabled={waiting}
                            className={classNames(
                                'w-full p-2 rounded-lg bg-gray-800 text-gray-200 transition-opacity',
                                waiting ? 'opacity-50 cursor-not-allowed' : ''
                            )}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSubmit();
                                if (e.key === 'Escape' && !waiting) {
                                    loc.route('/tizenbrew-ui/dist/index.html/module-manager');
                                    setFocus('sn:focusable-item-1');
                                }
                            }}
                            onBlur={() => {
                                if (waiting) return;
                                if (name.trim()) {
                                    handleSubmit();
                                } else {
                                    loc.route('/tizenbrew-ui/dist/index.html/module-manager');
                                    setFocus('sn:focusable-item-1');
                                }
                            }}
                            placeholder={t('moduleManager.moduleName', { type: loc.query.type })}
                        />
                        {waiting && (
                            <p className='text-slate-400 text-lg mt-4 animate-pulse'>
                                {loc.query.type === 'gh'
                                    ? 'Checking raw.githubusercontent.com…'
                                    : 'Checking cdn.jsdelivr.net…'
                                }
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

export { AddModule };