import { useContext, useEffect, useState, useRef } from 'preact/hooks';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { useFocusable, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { TrashIcon, CubeIcon, PlusIcon } from '@heroicons/react/16/solid';
import { useTranslation } from 'react-i18next';
import { Events } from '../components/WebSocketClient.js';

// ─── Module row ───────────────────────────────────────────────────────────────
function ModuleRow({ mod, focusKey, onRemove }) {
    const { ref, focused } = useFocusable({
        focusKey,
        onEnterPress: onRemove,
    });

    useEffect(() => {
        if (focused) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [focused]);

    const parts = mod.split('/');
    const type = parts[0];
    const name = parts.slice(1).join('/');

    return (
        <div
            ref={ref}
            className={[
                'flex items-center gap-3 rounded-xl px-3 border-2 transition-colors h-16',
                focused ? 'border-indigo-400 bg-slate-800' : 'border-slate-700 bg-slate-900'
            ].join(' ')}
        >
            <CubeIcon className="h-5 w-5 text-indigo-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-slate-100 font-mono text-base truncate">{name}</p>
                <p className="text-slate-500 text-xs">{type}</p>
            </div>
            <div
                onClick={onRemove}
                className={[
                    'flex items-center justify-center w-10 h-10 rounded-lg bg-red-800 text-white flex-shrink-0 cursor-pointer',
                    focused ? 'ring-2 ring-red-400' : ''
                ].join(' ')}
            >
                <TrashIcon className="h-5 w-5" />
            </div>
        </div>
    );
}

// ─── Add row ──────────────────────────────────────────────────────────────────
function AddRow({ onAdd, inputRef: externalInputRef, onSubmitRef, keyboardOpenRef }) {
    const exampleModule = 'npm/@foxreis/tizentube';
    const [value, setValue] = useState(exampleModule);
    const inputRef = externalInputRef;
    const confirmedRef = useRef(false);
    const { t } = useTranslation();

    const { ref: wrapRef, focused } = useFocusable({
        focusKey: 'add-module-input',
        onEnterPress: () => {
            inputRef.current?.focus();
        },
    });

    function submit() {
        const trimmed = value.trim();
        if (!trimmed) return;
        onAdd(trimmed);
        setValue('');
    }

    // Expose submit to the page-level green handler
    if (onSubmitRef) onSubmitRef.current = submit;

    function handleKeyDown(e) {
        if (e.keyCode === 37 || e.keyCode === 39) e.stopPropagation();

        if (e.keyCode === 38 || e.keyCode === 40) {
            inputRef.current?.blur();
            return;
        }

        // OK (13), Fertig (65376), or Green (404) inside the input — confirm
        if (e.keyCode === 13 || e.keyCode === 65376 || e.keyCode === 404) {
            e.preventDefault?.();
            e.stopPropagation?.();
            confirmedRef.current = true;
            inputRef.current?.blur();
        }
    }

    function handleBlur() {
        if (keyboardOpenRef) keyboardOpenRef.current = false;
        if (confirmedRef.current) {
            confirmedRef.current = false;
            submit();
        }
    }

    function handleFocus(e) {
        // Track that the keyboard is (or was recently) open.
        // This survives on Tizen 5.5 where the virtual keyboard steals
        // document.activeElement so we can't rely on that check.
        if (keyboardOpenRef) keyboardOpenRef.current = true;
        e.target.select();
    }

    return (
        <div className="flex flex-col gap-2 rounded-xl border-2 border-indigo-700 bg-slate-900 px-4 py-3 mt-2">
            <p className="text-indigo-300 font-semibold text-sm">{t('tbModules.addTitle')}</p>
            <p className="text-slate-500 text-xs">{t('tbModules.addHint')}</p>

            <div
                ref={wrapRef}
                className={[
                    'flex items-center gap-2 rounded-lg border-2 px-3 py-2 bg-slate-800 cursor-pointer transition-all',
                    focused ? 'border-indigo-400 ring-2 ring-indigo-300' : 'border-slate-600'
                ].join(' ')}
                onClick={() => inputRef.current?.focus()}
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    placeholder={`${t('tbModules.inputPlaceholder')} (e.g. ${exampleModule})`}
                    className="flex-1 bg-transparent text-slate-100 text-sm font-mono outline-none"
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    onFocus={handleFocus}
                />
            </div>

            {value.trim() && (
                <p className="text-slate-500 text-xs font-mono">
                    → <span className="text-indigo-300">{value.trim()}</span>
                </p>
            )}

            <AddButton onSubmit={submit} label={t('tbModules.addButton')} />
        </div>
    );
}

function AddButton({ onSubmit, label }) {
    const { ref, focused } = useFocusable({
        focusKey: 'add-module-btn',
        onEnterPress: onSubmit,
    });
    return (
        <div
            ref={ref}
            onClick={onSubmit}
            className={[
                'flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
                'bg-indigo-600 text-white font-semibold text-sm cursor-pointer',
                focused ? 'ring-2 ring-white' : ''
            ].join(' ')}
        >
            <PlusIcon className="h-5 w-5" />
            {label}
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ManageModules() {
    const { state } = useContext(GlobalStateContext);
    const { t } = useTranslation();
    const modules = state.sharedData.tbModules ?? [];

    const addInputRef    = useRef(null);
    const addSubmitRef   = useRef(null);
    // Tracks whether the virtual keyboard is open.
    // We use this instead of document.activeElement because Tizen 5.5's
    // virtual keyboard can steal activeElement while the input is logically active.
    const keyboardOpenRef = useRef(false);

    useEffect(() => {
        state.client.send({ type: Events.GetTBModules });
        setTimeout(() => {
            setFocus(modules.length > 0 ? 'module-row-0' : 'add-module-input');
        }, 100);
    }, []);

    useEffect(() => {
        if (modules.length > 0) {
            setTimeout(() => setFocus('module-row-0'), 50);
        } else {
            setTimeout(() => setFocus('add-module-input'), 50);
        }
    }, [modules.length]);

    // ── Page-level green button (404) handler ─────────────────────────────────
    // First green press  → focus input (opens keyboard)
    // Second green press → keyboard is open (keyboardOpenRef = true) → submit
    //
    // We check keyboardOpenRef instead of document.activeElement because on
    // Tizen 5.5 the virtual keyboard overlay steals activeElement from the input.
    useEffect(() => {
        function onKeyDown(e) {
            if (e.keyCode !== 404) return;
            e.preventDefault();
            e.stopPropagation();

            if (keyboardOpenRef.current) {
                // Keyboard is open → confirm the entry
                addSubmitRef.current?.();
                // keyboardOpenRef will be reset in handleBlur after submit
            } else {
                // Keyboard is closed → open it
                setFocus('add-module-input');
                setTimeout(() => addInputRef.current?.focus(), 50);
                // keyboardOpenRef will be set to true in handleFocus
            }
        }

        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, []);

    function addModule(moduleStr) {
        state.client.send({ type: Events.AddTBModule, payload: { module: moduleStr } });
    }

    function removeModule(moduleStr) {
        state.client.send({ type: Events.RemoveTBModule, payload: { module: moduleStr } });
    }

    return (
        <div
            className="flex flex-col items-center px-4 pt-4 overflow-y-auto"
            style={{ maxHeight: 'calc(92vh - 8vh)' }}
        >
            <h1 className="text-2xl font-bold text-indigo-400 mb-1 text-center w-full">
                {t('tbModules.pageTitle')}
            </h1>
            <p className="text-slate-400 text-sm mb-1 text-center">
                {t('tbModules.pageDesc')}
            </p>
            <p className="text-slate-600 text-xs mb-3 text-center">
                🟢 {t('tbModules.greenHint')}
            </p>

            <div className="w-full max-w-2xl flex flex-col gap-2">
                {modules.length === 0 ? (
                    <p className="text-slate-500 text-center py-6 text-base">
                        {t('tbModules.empty')}
                    </p>
                ) : (
                    modules.map((mod, i) => (
                        <ModuleRow
                            key={mod}
                            mod={mod}
                            focusKey={`module-row-${i}`}
                            onRemove={() => removeModule(mod)}
                        />
                    ))
                )}

                <AddRow
                    onAdd={addModule}
                    inputRef={addInputRef}
                    onSubmitRef={addSubmitRef}
                    keyboardOpenRef={keyboardOpenRef}
                />
            </div>

            <p className="mt-4 mb-2 text-slate-500 text-xs text-center">
                {t('tbModules.hint')}
            </p>
        </div>
    );
}