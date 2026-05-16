import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}

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

export default function SourceModeSettings() {
    const { t } = useTranslation();
    const { state } = useContext(GlobalStateContext);
    const [sourceMode, setSourceMode] = useState('cdn');
    const focusedActionRef = useRef(null);
    const lastActionTs = useRef(0);

    function debounce(fn) {
        return function () {
            const now = Date.now();
            if (now - lastActionTs.current < 300) return;
            lastActionTs.current = now;
            fn.apply(this, arguments);
        };
    }

    useEffect(() => {
        function onKeyDown(e) {
            if (e.keyCode === 13 && focusedActionRef.current) {
                focusedActionRef.current();
            }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    useEffect(() => {
        if (state.client) {
            state.client.send({ type: Events.GetGlobalSourceMode });
        }
    }, []);

    // Listen for the response from the service
    useEffect(() => {
        if (!state.client) return;
        const originalOnMessage = state.client.socket.onmessage;
        state.client.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === Events.GetGlobalSourceMode) {
                setSourceMode(data.payload);
            } else if (data.type === Events.SetGlobalSourceMode) {
                if (data.payload.ok) {
                    setSourceMode(data.payload.mode);
                    window.__globalToast?.success(t('sourceModePage.saved'));
                }
            }
            if (originalOnMessage) originalOnMessage(event);
        };
        return () => { state.client.socket.onmessage = originalOnMessage; };
    }, [state.client]);

    const setMode = (mode) => debounce(() => {
        if (state.client) {
            state.client.send({ type: Events.SetGlobalSourceMode, payload: mode });
        }
    })();

    const saveAndExit = debounce(() => {
        history.back();
    });

    function setFocusedAction(fn) { focusedActionRef.current = fn; }

    return (
        <div className="relative isolate lg:px-8 pt-6">
            <div className="mx-auto flex flex-wrap justify-center gap-x-2 relative pb-6">
                
                <ItemBasic shouldFocus selected={sourceMode === 'cdn'} focusKey="sm-cdn"
                    onClick={() => setMode('cdn')} onFocused={setFocusedAction}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>{t('sourceModePage.cdn')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('sourceModePage.cdnDesc')}</p>
                    {sourceMode === 'cdn' && (
                        <span className='absolute top-3 right-3 text-xs bg-indigo-600 text-white px-2 py-1 rounded'>
                            {t('settings.selected')}
                        </span>
                    )}
                </ItemBasic>

                <ItemBasic selected={sourceMode === 'direct'} focusKey="sm-direct"
                    onClick={() => setMode('direct')} onFocused={setFocusedAction}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>{t('sourceModePage.direct')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('sourceModePage.directDesc')}</p>
                    {sourceMode === 'direct' && (
                        <span className='absolute top-3 right-3 text-xs bg-indigo-600 text-white px-2 py-1 rounded'>
                            {t('settings.selected')}
                        </span>
                    )}
                </ItemBasic>

                <ItemBasic onClick={saveAndExit} focusKey="sm-save" onFocused={setFocusedAction}>
                    <h3 className='text-green-400 text-base/7 font-semibold'>{t('sourceModePage.saveTitle')}</h3>
                    <p className='text-gray-300 mt-6 text-base/7'>{t('sourceModePage.saveDesc')}</p>
                </ItemBasic>

            </div>
        </div>
    );
}
