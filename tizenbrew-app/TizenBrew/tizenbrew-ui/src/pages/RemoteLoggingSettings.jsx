import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'preact-iso';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}

// Action card. onClick is pre-debounced by the page before being passed in,
// so we only need onEnterPress + div onClick (no separate global keydown needed
// here — the page-level global handler calls the same debounced function).
function ItemBasic({ children, onClick, shouldFocus, selected, onFocused, focusKey }) {
    const { ref, focused, focusSelf } = useFocusable({ focusKey, onEnterPress: onClick });
    useEffect(() => {
        if (focused) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            if (onFocused) onFocused(onClick);
        }
    }, [focused]);
    if (shouldFocus) { useEffect(() => { focusSelf(); }, []); }

    return (
        <div ref={ref} onClick={onClick} className={classNames(
            'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw] mb-4',
            focused ? 'focus' : '',
            selected ? 'ring-2 ring-indigo-400' : ''
        )}>
            {children}
        </div>
    );
}

// Input card — read-only by default so spatial nav moves over it freely.
function InputCard({ label, value, onChange, placeholder, onFocused, isEditingRef, focusKey }) {
    const { ref, focused, focusSelf } = useFocusable({ focusKey });
    const inputRef = useRef(null);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        if (focused) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            if (onFocused) onFocused(openKeyboard);
        }
    }, [focused]);

    function openKeyboard() {
        setEditing(true);
        isEditingRef.current = true;
        setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 30);
    }

    function closeKeyboard() {
        setEditing(false);
        isEditingRef.current = false;
        inputRef.current?.blur();
        focusSelf();
    }

    function handleInputKeyDown(e) {
        if (e.keyCode === 37 || e.keyCode === 39) { e.stopPropagation(); return; }
        if (e.keyCode === 13 || e.keyCode === 65376) { e.preventDefault(); closeKeyboard(); return; }
        if (e.keyCode === 10009) { e.preventDefault(); e.stopPropagation(); closeKeyboard(); }
    }

    return (
        <div ref={ref} onClick={openKeyboard} className={classNames(
            'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw] mb-4',
            focused ? 'focus' : ''
        )}>
            <h3 className='text-indigo-400 text-base/7 font-semibold mb-4'>{label}</h3>
            <input
                ref={inputRef}
                type="tel"
                readOnly={!editing}
                value={value}
                placeholder={placeholder}
                className="w-full p-2 rounded-lg bg-gray-800 text-gray-200 text-sm"
                style={{ cursor: editing ? 'text' : 'default' }}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onBlur={() => { if (editing) closeKeyboard(); }}
            />
            {editing && (
                <span className='absolute bottom-3 right-3 text-xs text-gray-500'>Enter to confirm</span>
            )}
        </div>
    );
}

export default function RemoteLoggingSettings() {
    const { state, dispatch } = useContext(GlobalStateContext);
    const loc = useLocation();
    const remoteLoggingInState = state?.sharedData?.remoteLogging;

    const [enabled, setEnabled] = useState(() => !!(remoteLoggingInState?.enabled));
    const [ip,      setIp]      = useState(() => remoteLoggingInState?.ip   || '');
    const [port,    setPort]    = useState(() => String(remoteLoggingInState?.port || 3030));

    const isEditingRef     = useRef(false);
    const focusedActionRef = useRef(null);

    // Debounce: prevents multi-fire when global keydown + onEnterPress + onClick
    // all trigger on the same remote-control OK press (especially on Tizen 6.x
    // which simulates a DOM click on the focused element in addition to keydown).
    const lastActionTs = useRef(0);
    function debounce(fn) {
        return function () {
            const now = Date.now();
            if (now - lastActionTs.current < 300) return;
            lastActionTs.current = now;
            fn.apply(this, arguments);
        };
    }

    // Global Enter handler — catches keydowns the spatial nav lib might miss.
    useEffect(() => {
        function onKeyDown(e) {
            if (e.keyCode === 13 && !isEditingRef.current && focusedActionRef.current) {
                focusedActionRef.current();
            }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    useEffect(() => {
        if (!remoteLoggingInState && state.client) {
            state.client.send({ type: Events.GetRemoteLogging });
        }
    }, []);

    const syncedRef = useRef(!!remoteLoggingInState);
    useEffect(() => {
        if (remoteLoggingInState && !syncedRef.current) {
            syncedRef.current = true;
            setEnabled(!!remoteLoggingInState.enabled);
            setIp(remoteLoggingInState.ip || '');
            setPort(String(remoteLoggingInState.port || 3030));
        }
    }, [remoteLoggingInState]);

    // Debounced actions — shared debounce ref so any layer that fires first
    // wins and the other layers are silently ignored within the 300ms window.
    const doToggle = debounce(() => setEnabled(e => {
        const next = !e;
        if (window.__tbLog) window.__tbLog('INFO', 'ui:remote-log', 'Toggle: ' + (next ? 'enabled' : 'disabled'));
        return next;
    }));

    function save() {
        if (!state.client) return;
        const p = Number(port) || 3030;
        const newCfg = { enabled, ip, port: p };
        // Update global synchronously so window.__tbLog can fire immediately after save.
        window.__tbRemoteLogging = newCfg;
        if (window.__tbLog) window.__tbLog('INFO', 'ui:remote-log', 'Saved: enabled=' + enabled + ' ip=' + ip + ' port=' + p);
        state.client.send({ type: Events.SetRemoteLogging, payload: newCfg });
        dispatch({ type: 'SET_REMOTE_LOGGING', payload: newCfg });
        history.back();
    }
    const doSave = debounce(save);

    async function sendTest() {
        const toast = window.__globalToast;
        if (!ip) { if (toast) toast.error('Enter an IP address first'); return; }
        const targetPort = Number(port) || 3030;
        const url = 'http://' + ip + ':' + targetPort + '/tv-log';
        const now = new Date();
        const ts = now.getFullYear() + '-'
            + String(now.getMonth()+1).padStart(2,'0') + '-'
            + String(now.getDate()).padStart(2,'0') + ' '
            + String(now.getHours()).padStart(2,'0') + ':'
            + String(now.getMinutes()).padStart(2,'0') + ':'
            + String(now.getSeconds()).padStart(2,'0') + '.'
            + String(now.getMilliseconds()).padStart(3,'0');
        const msg = 'Remote logging test from TizenBrew UI';
        const body = JSON.stringify({
            _formatted: '\n─────────────────────────────────────────────────────────────────────\n'
                + '[' + ts + '] ▶ UI:TEST\n'
                + '─────────────────────────────────────────────────────────────────────\n'
                + '  [INFO ] ' + ts.slice(11) + '  ' + msg,
            app: 'TizenBrew', ts, level: 'INFO', context: 'ui:test', message: msg
        });
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body
            });
            if (toast) {
                if (res.ok || res.status === 204) {
                    toast.success('Test sent to ' + url);
                    if (window.__tbLog) window.__tbLog('INFO', 'ui:remote-log', 'Test log sent to ' + url);
                } else {
                    toast.error('Receiver returned HTTP ' + res.status);
                }
            }
        } catch (e) {
            if (toast) toast.error('Connection failed: ' + (e.message || 'network error'));
        }
    }
    const doTest = debounce(sendTest);

    function setFocusedAction(fn) { focusedActionRef.current = fn; }

    return (
        <div className="relative isolate lg:px-8 pt-6">
            <div className="mx-auto flex flex-wrap justify-center gap-x-2 relative pb-6">

                <ItemBasic shouldFocus selected={enabled} focusKey="rl-toggle"
                    onClick={doToggle} onFocused={setFocusedAction}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>Enable Remote Logging</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>
                        {enabled ? 'Enabled — logs are sent to the receiver.' : 'Disabled — no logs are sent.'}
                    </p>
                    {enabled && (
                        <span className='absolute top-3 right-3 text-xs bg-indigo-600 text-white px-2 py-1 rounded'>
                            ON
                        </span>
                    )}
                </ItemBasic>

                <InputCard label="Receiver IP Address" value={ip} placeholder="192.168.1.100"
                    onChange={setIp} isEditingRef={isEditingRef}
                    onFocused={setFocusedAction} focusKey="rl-ip" />

                <InputCard label="Receiver Port" value={port} placeholder="3030"
                    onChange={setPort} isEditingRef={isEditingRef}
                    onFocused={setFocusedAction} focusKey="rl-port" />

                <ItemBasic onClick={doSave} focusKey="rl-save" onFocused={setFocusedAction}>
                    <h3 className='text-green-400 text-base/7 font-semibold'>Save Settings</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>Apply and return to Settings.</p>
                </ItemBasic>

                <ItemBasic onClick={doTest} focusKey="rl-test" onFocused={setFocusedAction}>
                    <h3 className='text-yellow-400 text-base/7 font-semibold'>Send Test Log</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>
                        POSTs directly to the receiver to verify the connection.
                        Works even when logging is disabled.
                    </p>
                </ItemBasic>

            </div>
        </div>
    );
}
