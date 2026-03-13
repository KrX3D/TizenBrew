import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useContext, useState, useRef } from 'react';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';
import { useLocation } from 'preact-iso';
import { useTranslation } from 'react-i18next';
import { getGlobalToast } from '../components/Toast.jsx';

const DEFAULTS = {
    npm: '@krx3d/tizentube2',
    gh: 'krx3d/tizentube',
};

// Module-level — survives route changes within the same session.
// AddModule writes here before navigating away; ModuleManager reads on mount.
let pendingAdd = null; // { fullName, type, toastId, snapshot }

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

function Item({ children, module, id, state }) {
    const { t } = useTranslation();
    const { ref, focused } = useFocusable();
    useEffect(() => {
        if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, [focused, ref]);

    function handleOnClick() {
        const deleteConfirm = confirm(t('moduleManager.confirmDelete', { packageName: module.appName }));
        if (deleteConfirm) {
            state.client.send({ type: Events.ModuleAction, payload: { action: 'remove', module: module.fullName } });
            state.client.send({ type: Events.GetModules, payload: true });
            const toast = getGlobalToast();
            if (toast) toast.info(`"${module.appName}" removed.`);
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
        if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
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
    const pendingRef = useRef(pendingAdd);

    // Watch for module list to refresh after a pending add
    useEffect(() => {
        const p = pendingRef.current;
        if (!p) return;
        const modules = state?.sharedData?.modules;
        if (!modules || modules === p.snapshot) return;

        const toast = getGlobalToast();
        const shortName = p.fullName.split('/').slice(1).join('/');
        const found = modules.find(m => m.fullName === p.fullName);

        if (found && found.appName !== 'Unknown Module') {
            if (toast) toast.resolve(p.toastId, 'success', `✓ "${found.appName}" (${found.version}) added!`);
        } else if (found) {
            const hint = p.type === 'npm'
                ? 'Not found on jsDelivr. New npm packages can take up to 24h — use "gh" for instant GitHub access.'
                : 'Not found on GitHub. Double-check the user/repo name.';
            if (toast) toast.resolve(p.toastId, 'error', `"${shortName}" — ${hint}`);
        } else {
            if (toast) toast.resolve(p.toastId, 'error', `"${shortName}" could not be added. Check the name and try again.`);
        }

        pendingAdd = null;
        pendingRef.current = null;
    }, [state?.sharedData?.modules]);

    // 15s timeout if we arrived with a pending add
    useEffect(() => {
        const p = pendingRef.current;
        if (!p) return;
        const timer = setTimeout(() => {
            if (!pendingRef.current) return;
            const toast = getGlobalToast();
            if (toast) toast.resolve(p.toastId, 'error', 'No response from service after 15s. Is it still running?');
            pendingAdd = null;
            pendingRef.current = null;
        }, 15000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="relative isolate lg:px-8">
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                {state?.sharedData?.modules?.map((module, moduleIdx) => (
                    <Item module={module} id={moduleIdx} state={state}>
                        <h3 className='text-indigo-400 text-base/7 font-semibold'>
                            {module.appName} ({module.version})
                        </h3>
                        <p className='text-gray-300 mt-6 text-base/7'>
                            {module.description}
                        </p>
                    </Item>
                ))}
                <ItemBasic onClick={() => loc.route('/tizenbrew-ui/dist/index.html/module-manager/add?type=npm')}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>{t('moduleManager.addNPM')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('moduleManager.addNPMDesc')}</p>
                </ItemBasic>
                <ItemBasic onClick={() => loc.route('/tizenbrew-ui/dist/index.html/module-manager/add?type=gh')}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>{t('moduleManager.addGH')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('moduleManager.addGHDesc')}</p>
                </ItemBasic>
            </div>
        </div>
    );
}

function AddModule() {
    const loc = useLocation();
    const { state } = useContext(GlobalStateContext);
    const { t } = useTranslation();

    const type = loc.query.type || 'npm';
    const [name, setName] = useState(DEFAULTS[type] || '');

    const inputRef = useRef(null);
    const didSubmitRef = useRef(false);
    // Time-based guard: ignore any blur that fires within 400ms of mount.
    // This covers the Samsung TV / spatial nav focus-steal on mount.
    // Does NOT require the user to type anything — works with pre-filled defaults too.
    const blurReadyRef = useRef(false);

    useEffect(() => {
        inputRef.current?.focus();
        const t = setTimeout(() => { blurReadyRef.current = true; }, 400);
        return () => clearTimeout(t);
    }, []);

    function handleSubmit() {
        if (didSubmitRef.current) return;
        didSubmitRef.current = true;

        const trimmed = name.trim();

        if (!trimmed) {
            // Empty — just go back
            loc.route('/tizenbrew-ui/dist/index.html/module-manager');
            setFocus('sn:focusable-item-1');
            return;
        }

        const fullName = `${type}/${trimmed}`;
        const snapshot = state?.sharedData?.modules ?? null;

        const toast = getGlobalToast();
        const toastId = toast
            ? toast.loading(type === 'gh'
                ? `Fetching "${trimmed}" from GitHub…`
                : `Fetching "${trimmed}" from jsDelivr CDN…`)
            : null;

        state.client.send({ type: Events.ModuleAction, payload: { action: 'add', module: fullName } });
        state.client.send({ type: Events.GetModules, payload: true });

        // Hand off to ModuleManager via module-level variable before navigating
        pendingAdd = { fullName, type, toastId, snapshot };

        loc.route('/tizenbrew-ui/dist/index.html/module-manager');
        setFocus('sn:focusable-item-1');
    }

    function handleBlur() {
        if (!blurReadyRef.current) return; // too soon after mount, ignore
        handleSubmit();
    }

    function handleKeyDown(e) {
        // Prevent spatial nav from eating arrow keys inside the input
        if (e.keyCode === 37 || e.keyCode === 38 || e.keyCode === 39 || e.keyCode === 40) {
            e.stopPropagation();
        }
        // Remote "OK" / keyboard Enter
        if (e.keyCode === 13) {
            e.stopPropagation();
            handleSubmit();
        }
    }

    return (
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
                        className="w-full p-2 rounded-lg bg-gray-800 text-gray-200"
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleBlur}
                        placeholder={DEFAULTS[type] || ''}
                    />
                </div>
            </div>
        </div>
    );
}

export { AddModule };