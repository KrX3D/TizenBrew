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

function getModuleTypeLabel(module) {
    if (module?.moduleType) return String(module.moduleType).toUpperCase();
    return module?.fullName?.startsWith('gh/') ? 'GH' : 'NPM';
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

// ─── Cards ────────────────────────────────────────────────────────────────────

function Item({ children, module, id, focusKey, onRemoveRequest }) {
    const { ref, focused } = useFocusable({
        focusKey,
        onEnterPress: onRemoveRequest
    });
    useEffect(() => {
        if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, [focused, ref]);

    return (
        <div
            key={id}
            ref={ref}
            onClick={onRemoveRequest}
            className={classNames(
                'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw] mb-4',
                focused ? 'focus' : '',
                id === 0 ? 'ml-4' : ''
            )}
        >
            {children}
        </div>
    );
}

function ItemBasic({ children, onClick, focusKey }) {
    const { ref, focused } = useFocusable({ focusKey, onEnterPress: onClick });
    useEffect(() => {
        if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, [focused, ref]);

    return (
        <div ref={ref} onClick={onClick} className={classNames(
            'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw] mb-4',
            focused ? 'focus' : ''
        )}>
            {children}
        </div>
    );
}

function ItemAuto({ children }) {
    return (
        <div className="relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 min-h-[20vh] w-[40vw] mb-4">
            {children}
        </div>
    );
}

// ─── Main ModuleManager page ──────────────────────────────────────────────────

export default function ModuleManager() {
    const { state } = useContext(GlobalStateContext);
    const loc = useLocation();
    const { t } = useTranslation();

    // modal state + which card to refocus after close
    const [modal, setModal] = useState(null);

    function requestRemove(module, cardFocusKey) {
        setModal({
            message: t('moduleManager.confirmDelete', { packageName: module.appName }),
            returnFocusKey: cardFocusKey,
            onConfirm: () => {
                setModal(null);
                state.client.send({ type: Events.ModuleAction, payload: { action: 'remove', module: module.fullName } });
                state.client.send({ type: Events.GetModules, payload: true });
                setFocus('sn:focusable-item-1');
            }
        });
    }

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

            <div className="mx-auto flex flex-wrap justify-center gap-x-2 relative">
                {state?.sharedData?.modules?.map((module, moduleIdx) => {
                    const cardKey = `module-card-${moduleIdx}`;
                    return (
                        <Item
                            key={module.fullName}
                            module={module}
                            id={moduleIdx}
                            focusKey={cardKey}
                            onRemoveRequest={() => requestRemove(module, cardKey)}
                        >
                            <h3 className='text-indigo-400 text-base/7 font-semibold'>
                                {module.appName} ({module.version})
                            </h3>
                            <p className='text-gray-400 mt-2 text-sm'>
                                {`${getModuleTypeLabel(module)} [${(module.sourceMode || 'cdn').toUpperCase()}]`}
                            </p>
                            <p className='text-gray-400 mt-1 text-xs break-all'>
                                {(module.fullName || '').replace(/^(npm|gh)\//, '')}
                            </p>
                            <p className='text-gray-300 mt-4 text-base/7'>
                                {module.description}
                            </p>
                        </Item>
                    );
                })}

                <ItemBasic focusKey="mm-add-npm" onClick={() => {
                    const mode = localStorage.getItem('addModuleSourceMode') || 'cdn';
                    loc.route(`/tizenbrew-ui/dist/index.html/module-manager/add?type=npm&sourceMode=${mode}`);
                }}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>{t('moduleManager.addNPM')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('moduleManager.addNPMDesc')}</p>
                </ItemBasic>

                <ItemBasic focusKey="mm-add-gh" onClick={() => {
                    const mode = localStorage.getItem('addModuleSourceMode') || 'cdn';
                    loc.route(`/tizenbrew-ui/dist/index.html/module-manager/add?type=gh&sourceMode=${mode}`);
                }}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>{t('moduleManager.addGH')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('moduleManager.addGHDesc')}</p>
                </ItemBasic>
            </div>
        </div>
    );
}

// ─── AddModule page ───────────────────────────────────────────────────────────

function AddModule() {
    const moduleType = (() => {
        try { return new URL(location.href).searchParams.get('type') === 'gh' ? 'gh' : 'npm'; } catch (_) { return 'npm'; }
    })();

    const exampleValue = moduleType === 'gh' ? 'reisxd/TizenTube' : '@foxreis/tizentube';

    const [name, setName] = useState(exampleValue);
    const [sourceMode, setSourceMode] = useState(() => {
        try {
            return new URL(location.href).searchParams.get('sourceMode') === 'direct' ? 'direct' : 'cdn';
        } catch (_) { return 'cdn'; }
    });

    const loc = useLocation();
    const { state } = useContext(GlobalStateContext);
    const inputRef = useRef(null);
    const confirmedRef = useRef(false);
    const submittedRef = useRef(false);
    const { t } = useTranslation();

    useEffect(() => { localStorage.setItem('addModuleSourceMode', sourceMode); }, [sourceMode]);
    useEffect(() => { inputRef.current?.focus(); }, []);

    useEffect(() => {
        function onKeyDown(e) {
            if (e.keyCode === 405) setSourceMode(prev => prev === 'cdn' ? 'direct' : 'cdn');
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    function submit() {
        if (submittedRef.current) return;
        submittedRef.current = true;
        const normalized = moduleType === 'gh' ? normalizeGitHubModule(name) : normalizeNpmModule(name);
        if (normalized) {
            state.client.send({ type: Events.ModuleAction, payload: { action: 'add', module: normalized, sourceMode } });
        }
        state.client.send({ type: Events.GetModules, payload: true });
        loc.route('/tizenbrew-ui/dist/index.html/module-manager');
        setFocus('sn:focusable-item-1');
    }

    function handleKeyDown(e) {
        if (e.keyCode === 37 || e.keyCode === 39) { e.stopPropagation(); return; }
        if (e.keyCode === 13 || e.keyCode === 65376) {
            e.preventDefault();
            confirmedRef.current = true;
            inputRef.current?.blur();
        }
    }

    function handleBlur() {
        if (confirmedRef.current) { confirmedRef.current = false; submit(); }
    }

    const hint = moduleType === 'gh'
        ? t('moduleManager.hintGH', { example: exampleValue })
        : t('moduleManager.hintNPM', { example: exampleValue });

    const sourceModeLabel = sourceMode === 'direct' ? '[DIRECT]' : '[CDN]';

    return (
        <div className="relative isolate lg:px-8 pt-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 8vh)' }}>
            <div className="mx-auto flex flex-wrap justify-center gap-x-2 relative pb-6">
                <ItemAuto>
                    <h3 className='text-indigo-400 text-base/7 font-semibold mb-3'>
                        {t('moduleManager.addModule')} ({moduleType.toUpperCase()})
                    </h3>
                    <input
                        type="text"
                        ref={inputRef}
                        value={name}
                        className="w-full p-2 rounded-lg bg-gray-800 text-gray-200"
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleBlur}
                        onFocus={(e) => e.target.select()}
                        placeholder={t('moduleManager.moduleName', { type: moduleType })}
                    />
                    <p className='text-gray-400 mt-2 text-sm'>{hint}</p>
                    <p className='text-gray-300 mt-3 text-sm font-semibold'>
                        {t('moduleManager.sourceLabel')}: {sourceModeLabel}
                    </p>
                    <p className='text-gray-500 mt-1 text-xs'>
                        {t('moduleManager.sourceHint')}
                    </p>
                </ItemAuto>
            </div>
        </div>
    );
}

export { AddModule };