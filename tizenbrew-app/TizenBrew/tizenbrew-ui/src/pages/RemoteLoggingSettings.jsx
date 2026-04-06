import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'preact-iso';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}

// Generic card — handles Enter/OK via both onEnterPress (spatial nav)
// and a direct onKeyDown on the div, since some TV builds don't propagate
// the spatial-nav callback reliably.
function ItemBasic({ children, onClick, shouldFocus, selected }) {
    const { ref, focused, focusSelf } = useFocusable({ onEnterPress: onClick });
    useEffect(() => {
        if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, [focused, ref]);
    if (shouldFocus) { useEffect(() => { focusSelf(); }, []); }

    function handleKeyDown(e) {
        if (e.keyCode === 13 || e.keyCode === 65376) {
            e.preventDefault();
            onClick && onClick();
        }
    }

    return (
        <div
            ref={ref}
            tabIndex={-1}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            className={classNames(
                'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw] mb-4',
                focused ? 'focus' : '',
                selected ? 'ring-2 ring-indigo-400' : ''
            )}
        >
            {children}
        </div>
    );
}

function InputCard({ label, value, onChange, placeholder }) {
    const { ref, focused, focusSelf } = useFocusable();
    const inputRef = useRef(null);

    useEffect(() => {
        if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, [focused, ref]);

    function closeKeyboard() {
        inputRef.current?.blur();
        // Return spatial-nav focus to this card so left/right navigation works again
        focusSelf();
    }

    function handleKeyDown(e) {
        // Let cursor move inside the input without triggering spatial nav
        if (e.keyCode === 37 || e.keyCode === 39) { e.stopPropagation(); return; }
        // Enter / Samsung confirm key
        if (e.keyCode === 13 || e.keyCode === 65376) { e.preventDefault(); closeKeyboard(); return; }
        // Back button (Samsung TV keyCode 10009) — dismiss keyboard, don't navigate away
        if (e.keyCode === 10009) { e.preventDefault(); e.stopPropagation(); closeKeyboard(); }
    }

    function handleClick() {
        inputRef.current?.focus();
        inputRef.current?.select();
    }

    return (
        <div
            ref={ref}
            onClick={handleClick}
            className={classNames(
                'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw] mb-4',
                focused ? 'focus' : ''
            )}
        >
            <h3 className='text-indigo-400 text-base/7 font-semibold mb-4'>{label}</h3>
            <input
                ref={inputRef}
                type="tel"
                value={value}
                placeholder={placeholder}
                className="w-full p-2 rounded-lg bg-gray-800 text-gray-200 text-sm"
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={(e) => e.target.select()}
            />
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

    function sendTest() {
        if (!state.client) return;
        state.client.send({
            type: Events.LogEvent,
            payload: { level: 'INFO', source: 'ui:test', message: 'Remote logging test message from TizenBrew UI' }
        });
        const toast = window.__globalToast;
        if (toast) toast.info('Test log sent — check your receiver', 5000);
    }

    return (
        <div className="relative isolate lg:px-8 pt-6">
            <div className="mx-auto flex flex-wrap justify-center gap-x-2 relative pb-6">

                <ItemBasic shouldFocus selected={enabled} onClick={() => setEnabled(e => !e)}>
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

                <InputCard
                    label="Receiver IP Address"
                    value={ip}
                    placeholder="192.168.1.100"
                    onChange={setIp}
                />

                <InputCard
                    label="Receiver Port"
                    value={port}
                    placeholder="3030"
                    onChange={setPort}
                />

                <ItemBasic onClick={save}>
                    <h3 className='text-green-400 text-base/7 font-semibold'>Save Settings</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>
                        Apply and return to Settings.
                    </p>
                </ItemBasic>

                <ItemBasic onClick={sendTest}>
                    <h3 className='text-yellow-400 text-base/7 font-semibold'>Send Test Log</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>
                        Sends a test entry to the receiver to verify the connection works.
                    </p>
                </ItemBasic>

            </div>
        </div>
    );
}
