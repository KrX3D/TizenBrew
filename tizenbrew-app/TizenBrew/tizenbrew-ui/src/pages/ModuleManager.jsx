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

    useEffect(() => {
        if (!focused) return;

        const onKeyDown = (e) => {
            if (e.keyCode !== 403) return;

            const nextMode = module.sourceMode === 'direct' ? 'cdn' : 'direct';
            state.client.send({
                type: Events.ModuleAction,
                payload: {
                    action: 'setSourceMode',
                    module: module.fullName,
                    sourceMode: nextMode
                }
            });
            state.client.send({ type: Events.GetModules, payload: true });
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [focused, module, state]);

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
                        <p className='text-gray-400 mt-2 text-sm'>
                            {`${(module.moduleType || '').toUpperCase()} ${(module.sourceMode || 'cdn').toUpperCase()}`}
                        </p>
                        <p className='text-gray-400 mt-1 text-xs break-all'>
                            {(module.fullName || '').replace(/^(npm|gh)\//, '')}
                        </p>
                        <p className='text-gray-400 mt-1 text-xs'>
                            RED: toggle CDN/DIRECT for this module
                        </p>
                        <p className='text-gray-300 mt-3 text-base/7'>
                            {module.description}
                        </p>
                    </Item>
                ))}
                <ItemBasic onClick={() => loc.route('/tizenbrew-ui/dist/index.html/module-manager/add?type=npm')}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>
                        {t('moduleManager.addNPM')}
                    </h3>
                    <p className='text-gray-300 mt-3 text-base/7'>
                        {`NPM CDN`}
                    </p>
                    <p className='text-gray-300 mt-3 text-base/7'>
                        {t('moduleManager.addNPMDesc')}
                    </p>
                </ItemBasic>
                <ItemBasic onClick={() => loc.route('/tizenbrew-ui/dist/index.html/module-manager/add?type=gh')}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>
                        {t('moduleManager.addGH')}
                    </h3>
                    <p className='text-gray-300 mt-3 text-base/7'>
                        {`GH CDN`}
                    </p>
                    <p className='text-gray-300 mt-3 text-base/7'>
                        {t('moduleManager.addGHDesc')}
                    </p>
                </ItemBasic>

            </div>
        </div>
    )
}

function normalizeGitHubModule(input) {
    let value = (input || '').trim();
    if (!value) return '';

    value = value.replace(/^https?:\/\/github\.com\//i, '');
    value = value.replace(/^gh\//i, '');
    value = value.replace(/\.git$/i, '');
    value = value.replace(/^\/+|\/+$/g, '');

    return value ? `gh/${value}` : '';
}

function normalizeNpmModule(input) {
    let value = (input || '').trim();
    if (!value) return '';

    value = value.replace(/^https?:\/\/(www\.)?npmjs\.com\/package\//i, '');
    value = value.replace(/^npm\//i, '');
    value = value.replace(/^\/+|\/+$/g, '');

    return value ? `npm/${value}` : '';
}

function AddModule() {
    const [name, setName] = useState('');
    const loc = useLocation();
    const { state } = useContext(GlobalStateContext);
    const ref = useRef(null);
    const submittedRef = useRef(false);
    const { t } = useTranslation();

    const moduleType = loc.query.type === 'gh' ? 'gh' : 'npm';

    useEffect(() => {
        ref.current.focus();
    }, [ref]);

    const submit = () => {
        if (submittedRef.current) return;
        submittedRef.current = true;

        const normalized = moduleType === 'gh' ? normalizeGitHubModule(name) : normalizeNpmModule(name);

        if (normalized) {
            state.client.send({
                type: Events.ModuleAction,
                payload: {
                    action: 'add',
                    module: normalized,
                    sourceMode: 'cdn'
                }
            });
        }

        state.client.send({
            type: Events.GetModules,
            payload: true
        });
        loc.route('/tizenbrew-ui/dist/index.html/module-manager');
        setFocus('sn:focusable-item-1');
    };

    const example = moduleType === 'gh' ? 'reisxd/TizenTube' : '@foxreis/tizentube';

    return (
        <div className="relative isolate lg:px-8">
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                <ItemBasic>
                    <h3 className='text-indigo-400 text-base/7 font-semibold mb-2'>
                        {t('moduleManager.addModule')}
                    </h3>
                    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
                        <input
                            type="text"
                            ref={ref}
                            value={name}
                            className="w-full p-2 rounded-lg bg-gray-800 text-gray-200"
                            onChange={(e) => setName(e.target.value)}
                            onBlur={submit}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.keyCode === 13) submit();
                            }}
                            placeholder={t('moduleManager.moduleName', { type: moduleType })}
                        />
                        <button type="submit" className="hidden">submit</button>
                    </form>
                    <p className='text-gray-400 mt-2 text-sm'>
                        {moduleType === 'gh' ? `GH example: ${example}` : `NPM example: ${example}`}
                    </p>
                </ItemBasic>
            </div>
        </div>
    )
}

export {
    AddModule
}
