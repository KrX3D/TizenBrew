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

function InputCard({ label, value, onChange, placeholder, shouldFocus }) {
    const { ref, focused, focusSelf } = useFocusable();
    const inputRef = useRef(null);
    const confirmedRef = useRef(false);

    useEffect(() => {
        if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, [focused, ref]);
    if (shouldFocus) { useEffect(() => { focusSelf(); }, []); }

    function handleKeyDown(e) {
        if (e.keyCode === 37 || e.keyCode === 39) { e.stopPropagation(); return; }
        if (e.keyCode === 13 || e.keyCode === 65376) {
            e.preventDefault();
            confirmedRef.current = true;
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
                type="email"
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
    const remoteLogging = state?.sharedData?.remoteLogging;

    const [enabled, setEnabled] = useState(false);
    const [ip, setIp] = useState('');
    const [port, setPort] = useState('3030');
    const loaded = useRef(false);

    // Request current config from service on mount
    useEffect(() => {
        if (state.client) state.client.send({ type: Events.GetRemoteLogging });
    }, []);

    // Populate fields once service responds
    useEffect(() => {
        if (remoteLogging && !loaded.current) {
            loaded.current = true;
            setEnabled(!!remoteLogging.enabled);
            setIp(remoteLogging.ip || '');
            setPort(String(remoteLogging.port || 3030));
        }
    }, [remoteLogging]);

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

                {/* Enable / Disable toggle */}
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

                {/* IP address input */}
                <InputCard
                    label="Receiver IP Address"
                    value={ip}
                    placeholder="192.168.1.100"
                    onChange={setIp}
                />

                {/* Port input */}
                <InputCard
                    label="Receiver Port"
                    value={port}
                    placeholder="3030"
                    onChange={setPort}
                />

                {/* Save button */}
                <ItemBasic onClick={save}>
                    <h3 className='text-green-400 text-base/7 font-semibold'>Save Settings</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>
                        Apply the IP, port and enable/disable settings. Logs will be sent via HTTP POST to <code>/log</code>.
                    </p>
                </ItemBasic>

            </div>
        </div>
    );
}
