import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useContext } from 'react';
import { GlobalStateContext } from './ClientContext.jsx';
import { Events } from './WebSocketClient.js';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

function getModuleTypeLabel(module) {
  if (module?.moduleType) return String(module.moduleType).toUpperCase();
  return module?.fullName?.startsWith('gh/') ? 'GH' : 'NPM';
}

function Item({ children, module, id, state }) {
  const { ref, focused } = useFocusable();
  useEffect(() => {
    if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [focused, ref]);

  function handleOnClick() {
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
        // mb-4 provides the vertical row gap on ALL Tizen versions.
        // The flexbox-gap-polyfill skips flex-wrap containers so we can't
        // rely on gap for row spacing on Tizen 5.5 (Chrome 47).
        'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw] mb-4',
        focused ? 'focus' : '',
        id === 0 ? 'ml-4' : ''
      )}
    >
      {children}
    </div>
  );
}

export default function Modules() {
  const { state } = useContext(GlobalStateContext);

  return (
    <div
      className="relative isolate lg:px-8 pt-6 overflow-y-auto"
      style={{ maxHeight: 'calc(100vh - 8vh)' }}
    >
      {/* gap-x-2: half the previous horizontal gap between cards in the same row */}
      <div className="mx-auto flex flex-wrap justify-center gap-x-2 relative pb-6">
        {state?.sharedData?.modules?.map((module, moduleIdx) => (
          <Item module={module} id={moduleIdx} state={state}>
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