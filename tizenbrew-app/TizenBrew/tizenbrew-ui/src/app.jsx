import { LocationProvider, ErrorBoundary, Router, Route } from 'preact-iso';
import Home from './pages/Home.jsx';
import ModuleManager, { AddModule } from './pages/ModuleManager.jsx';
import Header from './components/Header.jsx';
import { GlobalStateContext } from './components/ClientContext.jsx';
import { useRef } from 'preact/hooks';
import { useEffect, useState, useContext } from 'react';
import Client from './components/WebSocketClient.js';
import Settings, { Change } from './pages/Settings.jsx';
import About from './pages/About.jsx';
import './components/i18n.js';
import UserAgentSettings from './pages/UserAgentSettings.jsx';
import { ExclamationCircleIcon } from '@heroicons/react/16/solid';
import { useTranslation } from 'react-i18next';

export default function App() {
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const context = useContext(GlobalStateContext);
  const { t } = useTranslation();
  window.dispatch = context.dispatch;
  window.state = context.state;

  useEffect(() => {
    if (context.state.sharedData.error.disappear) {
      setTimeout(() => {
        context.dispatch({ type: 'SET_ERROR', payload: { message: null, disappear: false } });
      }, 5000);
    }
  }, [context.state.sharedData.error.disappear]);

  useEffect(() => {
    setHeaderHeight(headerRef.current.base.clientHeight);
  }, [headerRef]);

  useEffect(() => {
    if (!window.setClient) {
      startService(context);
      window.setClient = true;
    }
  }, []);

  return (
    <ErrorBoundary>
      <LocationProvider>
        <Header ref={headerRef} />
        <div className="bg-slate-800 text-white overflow-hidden" style={{ height: `calc(100vh - ${headerHeight}px)` }}>
          <div className={`flex justify-center ${!context.state.sharedData.error.message ? 'hidden' : ''}`}>
            <div class="flex items-center p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50 bg-slate-900 mt-8 w-[95vw] text-red-400" role="alert">
              <ExclamationCircleIcon className="h-[4vw] w-[2vw] mr-2" />
              <div>
                <span class="text-2xl">{t(context.state.sharedData.error.message, context.state.sharedData.error.args)}</span>
              </div>
            </div>
          </div>
          <Router>
            <Route component={Home}             path="/tizenbrew-ui/dist/index.html" />
            <Route component={ModuleManager}    path="/tizenbrew-ui/dist/index.html/module-manager" />
            <Route component={AddModule}        path="/tizenbrew-ui/dist/index.html/module-manager/add" />
            <Route component={Settings}         path="/tizenbrew-ui/dist/index.html/settings" />
            <Route component={Change}           path="/tizenbrew-ui/dist/index.html/settings/change" />
            <Route component={UserAgentSettings} path="/tizenbrew-ui/dist/index.html/settings/change-ua" />
            <Route component={About}            path="/tizenbrew-ui/dist/index.html/about" />
          </Router>
        </div>
      </LocationProvider>
    </ErrorBoundary>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Service startup
//
// Root cause of the Tizen 5.5 loop:
//   Every reload resets all JS state → wsRetry always starts at 0 → WS fails
//   → launches service again → service already running → "unknown error" or
//   new instance → reload → repeat forever.
//
// Fix: use sessionStorage as a reload-surviving flag.
//   - First run (no flag)  → try WS once; if it fails → launch service,
//                            set flag, reload.
//   - After reload (flag set) → service was just launched; retry WS up to
//                               10 times (15 s) WITHOUT launching again.
//   - On successful connect → clear the flag.
// ─────────────────────────────────────────────────────────────────────────────

const SS_KEY = 'tbServiceLaunched';

function startService(context) {
  const alreadyLaunched = sessionStorage.getItem(SS_KEY) === '1';

  if (alreadyLaunched) {
    // We already launched in a previous load — just wait for the WS to come up.
    retryWS(context, 10);
  } else {
    // First attempt: try to connect; if that fails, launch the service.
    tryWS(context, /*canLaunch=*/true);
  }
}

function tryWS(context, canLaunch) {
  const ws = new WebSocket('ws://localhost:8081');

  // 2 s hard timeout — Tizen 5.5 can be slow to report ECONNREFUSED
  const timeout = setTimeout(() => {
    try { ws.close(); } catch (_) {}
    onWSFail(context, canLaunch);
  }, 2000);

  ws.onerror = () => {
    clearTimeout(timeout);
    onWSFail(context, canLaunch);
  };

  ws.onopen = () => {
    clearTimeout(timeout);
    // Connected — service is running.
    sessionStorage.removeItem(SS_KEY);
    context.dispatch({ type: 'SET_STATE', payload: 'service.alreadyRunning' });
    context.dispatch({ type: 'SET_CLIENT', payload: new Client(context) });
  };
}

function onWSFail(context, canLaunch) {
  if (!canLaunch) return; // Should not reach here through retryWS path

  // Try launching the service.
  const pkgId = tizen.application.getCurrentApplication().appInfo.packageId;
  const serviceId = pkgId + '.StandaloneService';

  tizen.application.launchAppControl(
    new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/service'),
    serviceId,
    function () {
      // Launched successfully. Set the flag, wait 1.5 s, reload.
      // The flag tells the next load NOT to launch again — just retry WS.
      sessionStorage.setItem(SS_KEY, '1');
      context.dispatch({ type: 'SET_STATE', payload: 'service.started' });
      setTimeout(() => window.location.reload(), 1500);
    },
    function (e) {
      // Launch failed — service might already be running from a previous crash
      // or a parallel attempt. Don't loop: just retry WS several times.
      sessionStorage.setItem(SS_KEY, '1');
      retryWS(context, 8);
    }
  );
}

function retryWS(context, attemptsLeft) {
  if (attemptsLeft <= 0) {
    // Gave up — show error but clear the flag so the user can try again
    sessionStorage.removeItem(SS_KEY);
    context.dispatch({
      type: 'SET_ERROR',
      payload: { message: 'errors.serviceDidntConnectYet', disappear: false }
    });
    return;
  }

  const ws = new WebSocket('ws://localhost:8081');

  const timeout = setTimeout(() => {
    try { ws.close(); } catch (_) {}
    setTimeout(() => retryWS(context, attemptsLeft - 1), 1500);
  }, 2000);

  ws.onerror = () => {
    clearTimeout(timeout);
    setTimeout(() => retryWS(context, attemptsLeft - 1), 1500);
  };

  ws.onopen = () => {
    clearTimeout(timeout);
    sessionStorage.removeItem(SS_KEY);
    context.dispatch({ type: 'SET_STATE', payload: 'service.alreadyRunning' });
    context.dispatch({ type: 'SET_CLIENT', payload: new Client(context) });
  };
}