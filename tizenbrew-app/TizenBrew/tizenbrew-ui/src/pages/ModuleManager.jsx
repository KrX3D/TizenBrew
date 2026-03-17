import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useContext, useRef, useState } from 'react';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';
import { useLocation } from 'preact-iso';
import { useTranslation } from 'react-i18next';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

function Item({ children, module, id, state }) {
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
                payload: {
                    action: 'remove',
                    module: module.fullName
                }
            });

            state.client.send({
                type: Events.GetModules,
                payload: true
            });

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
    )
}

function normalizeInput(raw, type) {
    const value = raw.trim();
    if (!value) return '';

    if (type === 'gh') {
        const isSimpleRepoPath = /^[^/\s]+\/[^/\s]+$/.test(value);
        return isSimpleRepoPath ? value : '';
    }

    if (type === 'npm') {
        return value;
    }

    return value;
}


function AddModule() {
    const [name, setName] = useState('');
    const [sourceMode, setSourceMode] = useState('cdn');
    const loc = useLocation();
    const { state } = useContext(GlobalStateContext);
    const { t } = useTranslation();
    const ref = useRef(null);

    const type = loc.query.type;
    const example = type === 'gh' ? 'reisxd/TizenTube' : '@foxreis/tizentube';

    useEffect(() => {
        const focusTimer = setTimeout(() => {
            ref.current?.focus();
        }, 0);

        return () => clearTimeout(focusTimer);
    }, []);

    useEffect(() => {
        if (!state?.client) return;

        const onKeyDown = (e) => {
            // TV color keys: Red toggles source mode, Green submits.
            if (e.keyCode === 403) {
                setSourceMode((prev) => prev === 'cdn' ? 'direct' : 'cdn');
                e.preventDefault();
            } else if (e.keyCode === 404) {
                submitModule();
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [name, sourceMode, type, state?.client]);

    function submitModule() {
        if (!state?.client) return;

        const inputValue = ref.current?.value ?? name;
        const normalized = normalizeInput(inputValue, type);
        if (!normalized) {
            loc.route('/tizenbrew-ui/dist/index.html/module-manager');
            setFocus('sn:focusable-item-1');
            return;
        }

        state.client.send({
            type: Events.ModuleAction,
            payload: {
                action: 'add',
                module: `${type}/${normalized}`,
                sourceMode
            }
        });

        state.client.send({
            type: Events.GetModules,
            payload: true
        });

        loc.route('/tizenbrew-ui/dist/index.html/module-manager');
        setFocus('sn:focusable-item-1');
    }

    return (
        <div className="relative isolate lg:px-8">
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                <div className="relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 min-h-[35vh] w-[20vw]">
                    <h3 className='text-indigo-400 text-base/7 font-semibold mb-2'>
                        {t('moduleManager.addModule')}
                    </h3>
                    <p className='text-gray-300 mb-4 text-sm'>
                        {t('moduleManager.moduleName', { type })}
                    </p>
                    <p className='text-slate-400 mb-4 text-sm'>
                        Example: {example}
                    </p>

                    <div className='flex gap-2 mb-3'>
                        <button className={`px-3 py-2 rounded ${sourceMode === 'cdn' ? 'bg-indigo-600' : 'bg-gray-700'}`} onClick={() => setSourceMode('cdn')}>CDN</button>
                        <button className={`px-3 py-2 rounded ${sourceMode === 'direct' ? 'bg-indigo-600' : 'bg-gray-700'}`} onClick={() => setSourceMode('direct')}>Direct</button>
                    </div>

                    <input
                        type="text"
                        inputMode="url"
                        ref={ref}
                        value={name}
                        className="w-full p-2 rounded-lg bg-gray-800 text-gray-200"
                        onInput={(e) => setName(e.target.value)}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                submitModule();
                            }
                        }}
                        placeholder={type === 'gh' ? 'owner/repo' : t('moduleManager.moduleName', { type })}
                    />

                    <p className='text-slate-400 mt-3 text-sm'>
                        TV shortcut: Red = toggle CDN/Direct
                        <br />
                        Green = Done
                    </p>

                </div>
            </div>
        </div>
    )
}

export {
    AddModule
}
