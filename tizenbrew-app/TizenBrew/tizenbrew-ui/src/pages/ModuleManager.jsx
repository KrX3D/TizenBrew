import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useContext, useState, useRef } from 'react';
import { GlobalStateContext } from '../components/ClientContext.jsx';
import { Events } from '../components/WebSocketClient.js';
import { useLocation } from 'preact-iso';
import { useTranslation } from 'react-i18next';
import { ToastContainer, useToast } from '../components/Toast.jsx';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

function Item({ children, module, id, state, onRemove }) {
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
        const deleteConfirm = confirm(t('moduleManager.confirmDelete', { packageName: module.appName }));
        if (deleteConfirm) {
            state.client.send({
                type: Events.ModuleAction,
                payload: {
                    action: 'remove',
                    module: module.fullName
                }
            });

            state.client.send({
                type: Events.GetModules,
                payload: true
            });

            onRemove(module.appName);
            setFocus('sn:focusable-item-1');
        }
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
    const { toasts, toast } = useToast();

    // When navigating back from AddModule, a `?added=npm/foo` param signals
    // we should watch the next module reload and report success or failure.
    const pendingAdd = loc.query.added ? decodeURIComponent(loc.query.added) : null;
    const pendingAddHandled = useRef(false);
    const pendingToastId = useRef(null);

    useEffect(() => {
        if (!pendingAdd || pendingAddHandled.current) return;
        if (!state?.sharedData?.modules) return;

        pendingAddHandled.current = true;

        // Dismiss the "adding" loading toast if it's still showing
        if (pendingToastId.current !== null) {
            toast.dismiss(pendingToastId.current);
            pendingToastId.current = null;
        }

        const shortName = pendingAdd.split('/').slice(1).join('/');
        const found = state.sharedData.modules.find(m => m.fullName === pendingAdd);

        if (found && found.appName !== 'Unknown Module') {
            toast.success(`✓ "${found.appName}" added successfully!`);
        } else if (found && found.appName === 'Unknown Module') {
            toast.error(`Could not find module "${shortName}". Check the name and try again.`);
        } else {
            // Module list refreshed but module isn't there — add didn't persist
            toast.error(`Failed to add "${shortName}". It may not exist.`);
        }

        // Clean up query param from URL without re-render loop
        loc.route('/tizenbrew-ui/dist/index.html/module-manager', true);
    }, [state?.sharedData?.modules, pendingAdd]);

    // Show a persistent loading toast while waiting for modules to reload
    // after navigating back from AddModule
    useEffect(() => {
        if (!pendingAdd || pendingAddHandled.current) return;
        const shortName = pendingAdd.split('/').slice(1).join('/');
        pendingToastId.current = toast.loading(`Adding "${shortName}"…`);
        return () => {
            if (pendingToastId.current !== null) toast.dismiss(pendingToastId.current);
        };
    }, [pendingAdd]);

    function handleRemove(appName) {
        toast.info(`"${appName}" removed.`);
    }

    return (
        <>
            <ToastContainer toasts={toasts} onDismiss={toast.dismiss} />
            <div className="relative isolate lg:px-8">
                <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                    {state?.sharedData?.modules?.map((module, moduleIdx) => (
                        <Item module={module} id={moduleIdx} state={state} onRemove={handleRemove}>
                            <h3 className='text-indigo-400 text-base/7 font-semibold'>
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
            </div>
        </>
    );
}

function AddModule() {
    const [name, setName] = useState('');
    const loc = useLocation();
    const { state } = useContext(GlobalStateContext);
    const ref = useRef(null);
    const { t } = useTranslation();
    const { toasts, toast } = useToast();
    const submitted = useRef(false);

    useEffect(() => {
        ref.current.focus();
    }, [ref]);

    function handleSubmit() {
        if (submitted.current) return;

        const trimmed = name.trim();
        if (!trimmed) {
            // Empty — just go back quietly
            loc.route('/tizenbrew-ui/dist/index.html/module-manager');
            setFocus('sn:focusable-item-1');
            return;
        }

        submitted.current = true;
        const fullName = `${loc.query.type}/${trimmed}`;

        // Validate basic format
        if (!trimmed.match(/^[a-zA-Z0-9@._/-]+$/)) {
            toast.error('Invalid module name. Use letters, numbers, @, ., -, / only.');
            submitted.current = false;
            return;
        }

        toast.loading(`Adding "${trimmed}"…`);

        state.client.send({
            type: Events.ModuleAction,
            payload: {
                action: 'add',
                module: fullName
            }
        });

        state.client.send({
            type: Events.GetModules,
            payload: true
        });

        // Navigate back; ModuleManager will watch for the result via ?added=
        setTimeout(() => {
            loc.route(
                `/tizenbrew-ui/dist/index.html/module-manager?added=${encodeURIComponent(fullName)}`,
                true
            );
            setFocus('sn:focusable-item-1');
        }, 200);
    }

    return (
        <>
            <ToastContainer toasts={toasts} onDismiss={toast.dismiss} />
            <div className="relative isolate lg:px-8">
                <div className="mx-auto flex flex-wrap justify-center gap-4 top-4 relative">
                    <div className='relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw]'>
                        <p className='text-gray-400 text-xl mb-3'>
                            {t('moduleManager.moduleName', { type: loc.query.type })}
                        </p>
                        <input
                            type="text"
                            ref={ref}
                            value={name}
                            className="w-full p-2 rounded-lg bg-gray-800 text-gray-200"
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSubmit();
                                if (e.key === 'Escape') {
                                    loc.route('/tizenbrew-ui/dist/index.html/module-manager');
                                    setFocus('sn:focusable-item-1');
                                }
                            }}
                            onBlur={handleSubmit}
                            placeholder={t('moduleManager.moduleName', { type: loc.query.type })}
                        />
                    </div>
                </div>
            </div>
        </>
    );
}

export { AddModule };