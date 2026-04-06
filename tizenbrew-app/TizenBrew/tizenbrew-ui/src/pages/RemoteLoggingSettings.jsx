import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useContext, useEffect, useRef, useState } from 'react';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}

function ItemBasic({ children, onClick, shouldFocus, selected }) {
    const { ref, focused, focusSelf } = useFocusable({ onEnterPress: onClick });
    useEffect(() => {
        if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, [focused, ref]);
    if (shouldFocus) { useEffect(() => { focusSelf(); }, []); }

    return (
        <div
            ref={ref}
            onClick={onClick}
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

function InputCard({ label, value, onChange, placeholder, inputType }) {
    const { ref, focused, focusSelf } = useFocusable();
    const inputRef = useRef(null);

    useEffect(() => {
        if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, [focused, ref]);

    function handleKeyDown(e) {
        // Let left/right move the cursor inside the input, not spatial nav
        if (e.keyCode === 37 || e.keyCode === 39) { e.stopPropagation(); return; }
        if (e.keyCode === 13 || e.keyCode === 65376) {
            e.preventDefault();
            inputRef.current?.blur();
        }
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
                type={inputType || 'tel'}
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
    const remoteLoggingInState = state?.sharedData?.remoteLogging;

    // Initialise directly from whatever is already in state so fields
    // are populated immediately on mount without waiting for WS round-trip.
    const [enabled, setEnabled] = useState(() => !!(remoteLoggingInState?.enabled));
    const [ip,      setIp]      = useState(() => remoteLoggingInState?.ip   || '');
    const [port,    setPort]    = useState(() => String(remoteLoggingInState?.port || 3030));

    // If state didn't have the config yet (first ever visit), request it.
    // When the response arrives it updates state; we sync local fields below.
    useEffect(() => {
        if (!remoteLoggingInState && state.client) {
            state.client.send({ type: Events.GetRemoteLogging });
        }
    }, []);

    // Sync local fields whenever the state value changes (WS response arrived).
    // Only sync if the user hasn't started editing (i.e. fields are still at defaults).
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
                    inputType="tel"
                />

                <InputCard
                    label="Receiver Port"
                    value={port}
                    placeholder="3030"
                    onChange={setPort}
                    inputType="tel"
                />

                <ItemBasic onClick={save}>
                    <h3 className='text-green-400 text-base/7 font-semibold'>Save Settings</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>
                        Apply IP, port and enable/disable. Logs ship via HTTP POST to <code>/log</code>.
                    </p>
                </ItemBasic>

            </div>
        </div>
    );
}
