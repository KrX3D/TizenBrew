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
    const context = useContext(GlobalStateContext);
    const { state } = context;
    const { t } = useTranslation();

    const type = loc.query.type || 'npm';
    const [name, setName] = useState(DEFAULTS[type] || '');

    const inputRef = useRef(null);
    const didSubmitRef = useRef(false);

    // Refs so the window keydown closure always reads the freshest values
    const nameRef = useRef(name);
    useEffect(() => { nameRef.current = name; }, [name]);

    const contextRef = useRef(context);
    useEffect(() => { contextRef.current = context; }, [context]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        function onBackKey(e) {
            if (e.keyCode !== 10009) return;

            // Take control of Back — stop main.jsx from calling history.back()
            e.stopImmediatePropagation();

            if (didSubmitRef.current) return;
            didSubmitRef.current = true;

            const trimmed = nameRef.current.trim();
            const ctx = contextRef.current;
            const toast = getGlobalToast();

            if (!trimmed) {
                loc.route('/tizenbrew-ui/dist/index.html/module-manager');
                setFocus('sn:focusable-item-1');
                return;
            }

            const fullName = `${type}/${trimmed}`;

            // Snapshot the version NUMBER at this exact moment
            const snapshotVersion = ctx.state.sharedData.modulesVersion;

            const toastId = toast
                ? toast.loading(type === 'gh'
                    ? `Fetching "${trimmed}" from GitHub…`
                    : `Fetching "${trimmed}" from jsDelivr CDN…`)
                : null;

            // Write pendingAdd into context — App.jsx watcher reads it from there.
            // No module-scope variables, no bundler splitting risk.
            ctx.dispatch({
                type: 'SET_PENDING_ADD',
                payload: { fullName, type, toastId, snapshotVersion }
            });

            ctx.state.client.send({ type: Events.ModuleAction, payload: { action: 'add', module: fullName } });
            ctx.state.client.send({ type: Events.GetModules, payload: true });

            loc.route('/tizenbrew-ui/dist/index.html/module-manager');
            setFocus('sn:focusable-item-1');
        }

        window.addEventListener('keydown', onBackKey, { capture: true });
        return () => window.removeEventListener('keydown', onBackKey, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type]);

    function handleInputKeyDown(e) {
        // Keep arrow keys for cursor movement, stop spatial nav eating them
        if (e.keyCode === 37 || e.keyCode === 38 || e.keyCode === 39 || e.keyCode === 40) {
            e.stopPropagation();
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
                        onKeyDown={handleInputKeyDown}
                        placeholder={DEFAULTS[type] || ''}
                    />
                    <p className='text-slate-500 text-lg mt-3'>
                        Press Fertig to close keyboard, then Back to add
                    </p>
                </div>
            </div>
        </div>
    );
}

export { AddModule };