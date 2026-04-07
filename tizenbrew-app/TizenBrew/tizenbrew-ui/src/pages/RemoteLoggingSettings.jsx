import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'preact-iso';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}

// Action card — three layers for TV compatibility:
//   1. global window keydown (most reliable on Samsung TVs)
//   2. onEnterPress via spatial nav (works on most firmware)
//   3. onClick on div (works for pointer/touch)
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
// OK / click opens the keyboard. Enter or Back closes it and restores focus.
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
    const { state } = useContext(GlobalStateContext);
    const loc = useLocation();
    const remoteLoggingInState = state?.sharedData?.remoteLogging;

    const [enabled, setEnabled] = useState(() => !!(remoteLoggingInState?.enabled));
    const [ip,      setIp]      = useState(() => remoteLoggingInState?.ip   || '');
    const [port,    setPort]    = useState(() => String(remoteLoggingInState?.port || 3030));

    const isEditingRef     = useRef(false);
    const focusedActionRef = useRef(null);

    // Global Enter handler — Samsung TVs send all key events to window,
    // not to the spatially-focused div element.
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

    function save() {
        if (!state.client) return;
        state.client.send({
            type: Events.SetRemoteLogging,
            payload: { enabled, ip, port: Number(port) || 3030 }
        });
        loc.route('/tizenbrew-ui/dist/index.html/settings');
    }

    // Direct POST from the UI browser to /tv-log — same endpoint as TizenYouTube.
    // Works regardless of whether remote logging is enabled in the service config.
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
            app:     'TizenBrew',
            ts,
            level:   'INFO',
            context: 'ui:test',
            message: msg
        });
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body
            });
            if (toast) {
                if (res.ok || res.status === 204) toast.success('Test sent to ' + url);
                else toast.error('Receiver returned HTTP ' + res.status);
            }
        } catch (e) {
            if (toast) toast.error('Connection failed: ' + (e.message || 'network error'));
        }
    }

    function setFocusedAction(fn) { focusedActionRef.current = fn; }

    return (
        <div className="relative isolate lg:px-8 pt-6">
            <div className="mx-auto flex flex-wrap justify-center gap-x-2 relative pb-6">

                <ItemBasic shouldFocus selected={enabled} focusKey="rl-toggle"
                    onClick={() => setEnabled(e => !e)}
                    onFocused={setFocusedAction}>
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

                <ItemBasic onClick={save} focusKey="rl-save" onFocused={setFocusedAction}>
                    <h3 className='text-green-400 text-base/7 font-semibold'>Save Settings</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>Apply and return to Settings.</p>
                </ItemBasic>

                <ItemBasic onClick={sendTest} focusKey="rl-test" onFocused={setFocusedAction}>
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
