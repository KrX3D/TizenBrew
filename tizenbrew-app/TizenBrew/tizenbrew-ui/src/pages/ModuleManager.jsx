import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useContext, useState, useRef } from 'react';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';
import { useLocation } from 'preact-iso';
import { useTranslation } from 'react-i18next';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

function Item({ children, module, id, onRequestDelete }) {
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

    function handleOnClick() {
        onRequestDelete(module);
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
    const [pendingDelete, setPendingDelete] = useState(null);

    function confirmDelete() {
        if (!pendingDelete) return;
        state.client.send({
            type: Events.ModuleAction,
            payload: {
                action: 'remove',
                module: pendingDelete.fullName
            }
        });

        state.client.send({
            type: Events.GetModules,
            payload: true
        });

        setPendingDelete(null);
        setFocus('sn:focusable-item-1');
    }

    return (
        <div className="relative isolate lg:px-8">
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                {state?.sharedData?.modules?.map((module, moduleIdx) => (
                    <Item module={module} id={moduleIdx} onRequestDelete={setPendingDelete}>
                        <h3
                            className='text-indigo-400 text-base/7 font-semibold'
                        >
                            {module.appName} ({module.version})
                        </h3>
                        <p className='text-gray-300 mt-6 text-base/7'>
                            {module.description}
                        </p>
                    </Item>
                ))}
                <ItemBasic onClick={() => loc.route('/tizenbrew-ui/dist/index.html/module-manager/add?type=npm')}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>
                        {t('moduleManager.addNPM')}
                    </h3>
                    <p className='text-gray-300 mt-6 text-base/7'>
                        {t('moduleManager.addNPMDesc')}
                    </p>
                </ItemBasic>
                <ItemBasic onClick={() => loc.route('/tizenbrew-ui/dist/index.html/module-manager/add?type=gh')}>
                    <h3 className='text-indigo-400 text-base/7 font-semibold'>
                        {t('moduleManager.addGH')}
                    </h3>
                    <p className='text-gray-300 mt-6 text-base/7'>
                        {t('moduleManager.addGHDesc')}
                    </p>
                </ItemBasic>

            </div>

            {pendingDelete ? (
                <div className='fixed inset-0 bg-black/70 flex items-center justify-center z-50'>
                    <div className='bg-gray-900 rounded-3xl p-8 w-[50vw] text-center'>
                        <h3 className='text-indigo-400 text-base/7 font-semibold'>
                            {pendingDelete.appName}
                        </h3>
                        <p className='text-gray-300 mt-4 text-base/7'>
                            {t('moduleManager.confirmDelete', { packageName: pendingDelete.appName })}
                        </p>
                        <div className='mt-6 flex justify-center gap-4'>
                            <ItemBasic onClick={() => setPendingDelete(null)}>
                                <h3 className='text-indigo-400 text-base/7 font-semibold'>Cancel</h3>
                            </ItemBasic>
                            <ItemBasic onClick={confirmDelete}>
                                <h3 className='text-red-400 text-base/7 font-semibold'>Remove</h3>
                            </ItemBasic>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    )
}

function AddModule() {
    const [name, setName] = useState('');
    const loc = useLocation();
    const { state } = useContext(GlobalStateContext);
    const ref = useRef(null);
    const { t } = useTranslation();

    useEffect(() => {
        ref.current.focus();
    }, [ref]);
    return (
        <div className="relative isolate lg:px-8">
            <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                <ItemBasic>
                    <input
                        type="text"
                        ref={ref}
                        value={name}
                        className="w-full p-2 rounded-lg bg-gray-800 text-gray-200"
                        onChange={(e) => setName(e.target.value)}
                        onBlur={(e) => {
                            if (name) {
                                state.client.send({
                                    type: Events.ModuleAction,
                                    payload: {
                                        action: 'add',
                                        module: `${loc.query.type}/${name}`
                                    }
                                });
                            }
                            state.client.send({
                                type: Events.GetModules,
                                payload: true
                            });
                            loc.route('/tizenbrew-ui/dist/index.html/module-manager');
                            setFocus('sn:focusable-item-1');
                        }}
                        placeholder={t('moduleManager.moduleName', { type: loc.query.type })}
                    />
                </ItemBasic>
            </div>
        </div>
    )
}

export {
    AddModule
}