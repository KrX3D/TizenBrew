import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useContext, useState, useRef } from 'react';
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
        const cleaned = value
            .replace(/^https?:\/\/github\.com\//i, '')
            .replace(/\.git$/i, '')
            .replace(/^gh\//i, '')
            .replace(/^\/+|\/+$/g, '');
        return cleaned;
    }

    if (type === 'npm') {
        if (value.includes('npmjs.com/package/')) {
            const parsed = value.split('npmjs.com/package/')[1] || '';
            return decodeURIComponent(parsed.replace(/^\/+|\/+$/g, ''));
        }

        return value.replace(/^npm\//i, '').replace(/^\/+|\/+$/g, '');
    }

    return value;
}

function AddModule() {
    const [name, setName] = useState('');
    const [sourceMode, setSourceMode] = useState('cdn');
    const loc = useLocation();
    const { state } = useContext(GlobalStateContext);
    const ref = useRef(null);
    const { t } = useTranslation();

    useEffect(() => {
        ref.current.focus();
    }, [ref]);

    const type = loc.query.type;
    const example = type === 'gh' ? 'reisxd/TizenTube or https://github.com/reisxd/TizenTube' : '@foxreis/tizentube or https://www.npmjs.com/package/@foxreis/tizentube';

    function submitModule() {
        const normalized = normalizeInput(name, type);
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
                <ItemBasic>
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
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                submitModule();
                            }
                        }}
                        placeholder={t('moduleManager.moduleName', { type })}
                    />

                    <div className='flex gap-2 mt-3'>
                        <button className='px-3 py-1 rounded bg-gray-700' onClick={() => setName(prev => prev + '@')}>@</button>
                        <button className='px-3 py-1 rounded bg-gray-700' onClick={() => setName(prev => prev + '/')}>/</button>
                        <button className='px-3 py-1 rounded bg-gray-700' onClick={() => setName(prev => prev + '_')}>_</button>
                    </div>

                    <div className='flex gap-2 mt-4'>
                        <button className='px-4 py-2 rounded bg-indigo-600' onClick={submitModule}>Done</button>
                        <button className='px-4 py-2 rounded bg-gray-700' onClick={() => {
                            loc.route('/tizenbrew-ui/dist/index.html/module-manager');
                            setFocus('sn:focusable-item-1');
                        }}>Cancel</button>
                    </div>
                </ItemBasic>
            </div>
        </div>
    )
}

export {
    AddModule
}
