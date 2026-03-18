import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useContext, useState, useRef } from 'react';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';
import { useLocation } from 'preact-iso';
import { useTranslation } from 'react-i18next';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

function getModuleTypeLabel(module) {
    if (module?.moduleType) return String(module.moduleType).toUpperCase();
    return module?.fullName?.startsWith('gh/') ? 'GH' : 'NPM';
}

// ─── Normalisation helpers ────────────────────────────────────────────────────

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

// ─── Shared Item components ───────────────────────────────────────────────────

function Item({ children, module, id, state }) {
    const { t } = useTranslation();
    const { ref, focused } = useFocusable();
    useEffect(() => {
        if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, [focused, ref]);

    function handleOnClick() {
        if (confirm(t('moduleManager.confirmDelete', { packageName: module.appName }))) {
            state.client.send({ type: Events.ModuleAction, payload: { action: 'remove', module: module.fullName } });
            state.client.send({ type: Events.GetModules, payload: true });
            setFocus('sn:focusable-item-1');
        }
    }

    return (
        <div key={id} ref={ref} onClick={handleOnClick} className={classNames(
            'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw]',
            focused ? 'focus' : '',
            id === 0 ? 'ml-4' : ''
        )}>
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
        <div ref={ref} onClick={onClick} className={classNames(
            'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw]',
            focused ? 'focus' : ''
        )}>
            {children}
        </div>
    );
}

// ─── Main ModuleManager page ──────────────────────────────────────────────────
// Fix 6: No CDN/Direct toggle here — it lives on the AddModule page only.

export default function ModuleManager() {
    const { state } = useContext(GlobalStateContext);
    const loc = useLocation();
    const { t } = useTranslation();

    return (
        <div className="relative isolate lg:px-8">
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">

                {/* Installed modules — click to remove */}
                {state?.sharedData?.modules?.map((module, moduleIdx) => (
                    <Item module={module} id={moduleIdx} state={state}>
                        <h3 className='text-indigo-400 text-base/7 font-semibold'>
                            {module.appName} ({module.version})
                        </h3>
                        {/* Fix 7: text labels instead of emoji (emoji render as [] on Tizen 5.5) */}
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
                ))}

                {/* Add NPM — goes straight to add page with last-used sourceMode */}
                <ItemBasic onClick={() => {
                    const mode = localStorage.getItem('addModuleSourceMode') || 'cdn';
                    loc.route(`/tizenbrew-ui/dist/index.html/module-manager/add?type=npm&sourceMode=${mode}`);
                }}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>{t('moduleManager.addNPM')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('moduleManager.addNPMDesc')}</p>
                </ItemBasic>

                {/* Add GitHub */}
                <ItemBasic onClick={() => {
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

    // Fix 1: Pre-fill the input with a sensible example for the module type
    const exampleValue = moduleType === 'gh' ? 'reisxd/TizenTube' : '@foxreis/tizentube';

    const [name, setName] = useState(exampleValue);
    const [sourceMode, setSourceMode] = useState(() => {
        try { return new URL(location.href).searchParams.get('sourceMode') === 'direct' ? 'direct' : 'cdn'; } catch (_) { return 'cdn'; }
    });

    const loc = useLocation();
    const { state } = useContext(GlobalStateContext);
    const inputRef = useRef(null);

    // Fix 5: Only submit when user explicitly confirms — not on bare blur (e.g. Back button)
    const confirmedRef = useRef(false);
    // Fix 5: Track whether we already submitted so double-fire can't happen
    const submittedRef = useRef(false);
    const { t } = useTranslation();

    // Persist source mode choice
    useEffect(() => { localStorage.setItem('addModuleSourceMode', sourceMode); }, [sourceMode]);

    useEffect(() => { inputRef.current?.focus(); }, []);

    function submit() {
        if (submittedRef.current) return;
        submittedRef.current = true;

        const normalized = moduleType === 'gh'
            ? normalizeGitHubModule(name)
            : normalizeNpmModule(name);

        if (normalized) {
            state.client.send({
                type: Events.ModuleAction,
                payload: { action: 'add', module: normalized, sourceMode }
            });
        }
        state.client.send({ type: Events.GetModules, payload: true });
        loc.route('/tizenbrew-ui/dist/index.html/module-manager');
        setFocus('sn:focusable-item-1');
    }

    function handleKeyDown(e) {
        // Fix 4: Stop spatial nav stealing left/right arrow keys while typing
        if (e.keyCode === 37 || e.keyCode === 39) {
            e.stopPropagation();
            return; // let the browser move the cursor normally
        }

        // Fix 11: Fertig (65376) or Enter (13) → confirm and navigate
        if (e.keyCode === 13 || e.keyCode === 65376) {
            e.preventDefault();
            confirmedRef.current = true;
            inputRef.current?.blur(); // triggers onBlur → submit
        }
    }

    function handleBlur() {
        // Fix 5: Only submit if the user explicitly pressed Enter / Fertig
        if (confirmedRef.current) {
            confirmedRef.current = false;
            submit();
        }
        // Otherwise (Back button, focus moved elsewhere) → do nothing, abort silently
    }

    // Fix 3: Single toggle button for CDN / Direct
    function toggleSourceMode() {
        setSourceMode(prev => prev === 'cdn' ? 'direct' : 'cdn');
    }

    // Fix 7: Text label, no emoji
    const sourceModeLabel = sourceMode === 'direct' ? '[DIRECT]' : '[CDN]';

    // Fix 2: Hint only shows user/repo format, no URL
    const hint = moduleType === 'gh'
        ? `Format: user/repo  e.g. ${exampleValue}`
        : `Format: @scope/package  e.g. ${exampleValue}`;

    return (
        <div className="relative isolate lg:px-8">
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                <ItemBasic>
                    <h3 className='text-indigo-400 text-base/7 font-semibold mb-3'>
                        {t('moduleManager.addModule')} ({moduleType.toUpperCase()})
                    </h3>

                    {/* Fix 1: Input pre-filled with example value */}
                    <input
                        type="text"
                        ref={inputRef}
                        value={name}
                        className="w-full p-2 rounded-lg bg-gray-800 text-gray-200"
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleBlur}
                        onFocus={(e) => {
                            // Select all on focus so the user can immediately overtype the example
                            e.target.select();
                        }}
                        placeholder={t('moduleManager.moduleName', { type: moduleType })}
                    />

                    {/* Fix 2: Short format hint only */}
                    <p className='text-gray-400 mt-2 text-sm'>{hint}</p>

                    {/* Fix 3: Single toggle button for source mode */}
                    <button
                        className='mt-3 px-4 py-2 rounded-lg bg-slate-700 text-gray-200 text-sm font-semibold w-full'
                        onClick={toggleSourceMode}
                    >
                        {/* Fix 7: Text only, no emoji */}
                        Source: {sourceModeLabel} — tap to toggle
                    </button>

                    <p className='text-gray-500 mt-2 text-xs'>
                        CDN = jsDelivr (cached) &nbsp;|&nbsp; DIRECT = GitHub/unpkg (latest)
                    </p>
                </ItemBasic>
            </div>
        </div>
    );
}

export { AddModule };