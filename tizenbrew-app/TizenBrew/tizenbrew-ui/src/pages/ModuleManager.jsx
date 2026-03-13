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
    // Prevent onBlur from firing as a submit on initial mount —
    // the Samsung keyboard / spatial nav can blur the input right away
    const blurGuard = useRef(false);

    const submittingRef = useRef(false);
    const waitingFor = useRef(null);
    const toastId = useRef(null);
    const moduleSnapshot = useRef(null);
    const [waiting, setWaiting] = useState(false);

    useEffect(() => {
        // Focus the input so the Samsung keyboard opens automatically
        inputRef.current?.focus();
        // Allow onBlur to submit only after a short settle period
        const t = setTimeout(() => { blurGuard.current = true; }, 600);
        return () => clearTimeout(t);
    }, []);

    // Watch for modules list reference to change = service responded
    useEffect(() => {
        if (!submittingRef.current) return;
        const modules = state?.sharedData?.modules;
        if (!modules || modules === moduleSnapshot.current) return;

        const fullName = waitingFor.current;
        const shortName = fullName.split('/').slice(1).join('/');
        const found = modules.find(m => m.fullName === fullName);

        if (found && found.appName !== 'Unknown Module') {
            toast.resolve(toastId.current, 'success', `✓ "${found.appName}" (${found.version}) added!`);
        } else if (found) {
            const hint = type === 'npm'
                ? 'Not found on jsDelivr. New npm packages can take up to 24h — use "gh" type for instant GitHub access.'
                : 'Not found on GitHub. Double-check the user/repo name.';
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
        if (submittingRef.current) return;

        const trimmed = name.trim();
        if (!trimmed) return;

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

    function handleBlur() {
        // Skip the blur that fires immediately on mount before the user has done anything
        if (!blurGuard.current) return;
        // Skip if we're already waiting for a result
        if (submittingRef.current) return;
        handleSubmit();
    }

    function handleKeyDown(e) {
        // Stop arrow keys from being swallowed by spatial navigation —
        // the TV remote and Samsung keyboard both need left/right to move
        // the text cursor inside the input field.
        if (e.keyCode === 37 || e.keyCode === 38 || e.keyCode === 39 || e.keyCode === 40) {
            e.stopPropagation();
        }
        if (e.key === 'Enter') {
            handleSubmit();
        }
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
                            onKeyDown={handleKeyDown}
                            onBlur={handleBlur}
                            placeholder={DEFAULTS[type] || ''}
                        />
                        {waiting && (
                            <p className='text-slate-400 text-lg mt-4 animate-pulse'>
                                {type === 'gh'
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