import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useRef, useContext } from 'react';
import { GlobalStateContext } from './ClientContext.jsx';
import { Events, getResolvedPackageUrl } from './WebSocketClient.js';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

function getModuleTypeLabel(module) {
  if (module?.moduleType) return String(module.moduleType).toUpperCase();
  return module?.fullName?.startsWith('gh/') ? 'GH' : 'NPM';
}

function Item({ children, module, id, state, isDefault, onFocused }) {
  const { ref, focused, focusSelf } = useFocusable();

  useEffect(() => {
    if (focused) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      onFocused(module);
    }
  }, [focused]);

  // Auto-focus this card if it's the default module on first render
  useEffect(() => {
    if (isDefault) focusSelf();
  }, []);

  function handleOnClick() {
    const toast = window.__globalToast;
    const pkgUrl = getResolvedPackageUrl(module);
    const src = (module.sourceMode || 'cdn').toUpperCase();

    if (toast) {
      toast.info(`🚀 ${module.appName} (${module.version || '?'}) [${src}]\n${pkgUrl}`, 8000);
    }

    if (window.__tbLog) {
      const used = module.rateLimited ? 'CDN-FALLBACK' : src;
      window.__tbLog('INFO', 'ui:home',
        'Launch: ' + module.appName + ' ' + (module.version ? 'v' + module.version : '(no version)')
        + ' | configured=' + src + ' used=' + used
        + (module.rateLimited ? ' [rate-limited]' : '')
        + '\n  pkg=' + pkgUrl
        + '\n  app=' + (module.appPath || '(none)')
      );
    }

    for (const key of module.keys) tizen.tvinputdevice.registerKey(key);
    state.client.send({ type: Events.LaunchModule, payload: module });
    if (!module.evaluateScriptOnDocumentStart) location.href = module.appPath;
  }

  return (
    <div
      key={id}
      ref={ref}
      onClick={handleOnClick}
      className={classNames(
        'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw] mb-4',
        focused ? 'focus' : '',
        id === 0 ? 'ml-4' : '',
        isDefault ? 'ring-2 ring-blue-400' : ''
      )}
    >
      {isDefault && (
        <span className='absolute top-3 right-3 text-xs bg-blue-600 text-white px-2 py-1 rounded'>
          Default
        </span>
      )}
      {children}
    </div>
  );
}

export default function Modules() {
  const { state, dispatch } = useContext(GlobalStateContext);
  const focusedModuleRef = useRef(null);
  const defaultModule = state?.sharedData?.defaultModule || '';

  // Register the blue button (ColorF3Blue = 406) and handle default toggling
  useEffect(() => {
    try { tizen.tvinputdevice.registerKey('ColorF3Blue'); } catch (_) {}

    function onKeyDown(e) {
      if (e.keyCode !== 406) return;
      const mod = focusedModuleRef.current;
      if (!mod || !state.client) return;

      if (defaultModule === mod.name) {
        // Blue on already-default → clear
        if (window.__tbLog) window.__tbLog('INFO', 'ui:home', 'Default module cleared: ' + mod.name);
        state.client.send({ type: Events.ModuleAction, payload: { action: 'clearDefault', module: mod.name } });
        dispatch({ type: 'SET_DEFAULT_MODULE', payload: '' });
      } else {
        // Blue on other module → set as default (clears previous automatically in service)
        if (window.__tbLog) window.__tbLog('INFO', 'ui:home', 'Default module set: ' + mod.name);
        state.client.send({ type: Events.ModuleAction, payload: { action: 'setDefault', module: mod.name } });
        dispatch({ type: 'SET_DEFAULT_MODULE', payload: mod.name });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      try { tizen.tvinputdevice.unregisterKey('ColorF3Blue'); } catch (_) {}
    };
  }, [defaultModule, state.client]);

  function handleFocused(module) {
    focusedModuleRef.current = module;
  }

  return (
    <div
      className="relative isolate lg:px-8 pt-6 overflow-y-auto"
      style={{ maxHeight: 'calc(100vh - 8vh)' }}
    >
      <div className="mx-auto flex flex-wrap justify-center gap-x-2 relative pb-6">
        {state?.sharedData?.modules?.map((module, moduleIdx) => (
          <Item
            module={module}
            id={moduleIdx}
            state={state}
            isDefault={defaultModule === module.name}
            onFocused={handleFocused}
          >
            <h3 className='text-indigo-400 text-base/7 font-semibold'>
              {module.appName} ({module.version})
            </h3>
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
      </div>
    </div>
  );
}
