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

  useEffect(() => { setHeaderHeight(headerRef.current.base.clientHeight); }, [headerRef]);

  useEffect(() => {
    if (!window.setClient) { startService(context); window.setClient = true; }
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
            <Route component={Home}              path="/tizenbrew-ui/dist/index.html" />
            <Route component={ModuleManager}     path="/tizenbrew-ui/dist/index.html/module-manager" />
            <Route component={AddModule}         path="/tizenbrew-ui/dist/index.html/module-manager/add" />
            <Route component={Settings}          path="/tizenbrew-ui/dist/index.html/settings" />
            <Route component={Change}            path="/tizenbrew-ui/dist/index.html/settings/change" />
            <Route component={UserAgentSettings} path="/tizenbrew-ui/dist/index.html/settings/change-ua" />
            <Route component={About}             path="/tizenbrew-ui/dist/index.html/about" />
          </Router>
        </div>
      </LocationProvider>
    </ErrorBoundary>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Service startup — sessionStorage flag prevents re-launching on every reload
//
// Flow:
//   First load  → try WS → fails → launchAppControl → set flag → wait 3 s → reload
//   After reload → flag is set → skip launch, retry WS up to 15 times (30 s total)
//   On connect  → clear flag, set client
//   On give-up  → clear flag, show error
//
// The 3 s pre-reload wait gives Tizen 5.5's slower service process enough
// time to actually bind port 8081 before the next WS attempt.
// ─────────────────────────────────────────────────────────────────────────────

const SS_KEY = 'tbServiceLaunched';

function startService(context) {
  if (sessionStorage.getItem(SS_KEY) === '1') {
    // Already launched — just keep trying to connect
    retryWS(context, 15);
  } else {
    tryWS(context);
  }
}

function tryWS(context) {
  const ws = new WebSocket('ws://localhost:8081');

  const timeout = setTimeout(() => {
    try { ws.close(); } catch (_) {}
    launchService(context);
  }, 3000);

  ws.onerror = () => { clearTimeout(timeout); launchService(context); };

  ws.onopen = () => {
    clearTimeout(timeout);
    sessionStorage.removeItem(SS_KEY);
    context.dispatch({ type: 'SET_STATE', payload: 'service.alreadyRunning' });
    context.dispatch({ type: 'SET_CLIENT', payload: new Client(context) });
  };
}

function launchService(context) {
  const pkgId    = tizen.application.getCurrentApplication().appInfo.packageId;
  const serviceId = pkgId + '.StandaloneService';

  tizen.application.launchAppControl(
    new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/service'),
    serviceId,
    function () {
      // Success callback fires when the service process has been created,
      // but on Tizen 5.5 the WS port may not be bound yet. Wait 3 s then reload.
      sessionStorage.setItem(SS_KEY, '1');
      context.dispatch({ type: 'SET_STATE', payload: 'service.started' });
      setTimeout(() => window.location.reload(), 3000);
    },
    function () {
      // Error — service may already be running. Set flag and retry WS.
      sessionStorage.setItem(SS_KEY, '1');
      retryWS(context, 15);
    }
  );
}

function retryWS(context, attemptsLeft) {
  if (attemptsLeft <= 0) {
    sessionStorage.removeItem(SS_KEY);
    context.dispatch({
      type: 'SET_ERROR',
      payload: { message: 'errors.serviceDidntConnectYet', disappear: false }
    });
    return;
  }
a
  const ws = new WebSocket('ws://localhost:8081');

  const timeout = setTimeout(() => {
    try { ws.close(); } catch (_) {}
    setTimeout(() => retryWS(context, attemptsLeft - 1), 2000);
  }, 2000);

  ws.onerror = () => {
    clearTimeout(timeout);
    setTimeout(() => retryWS(context, attemptsLeft - 1), 2000);
  };

  ws.onopen = () => {
    clearTimeout(timeout);
    sessionStorage.removeItem(SS_KEY);
    context.dispatch({ type: 'SET_STATE', payload: 'service.alreadyRunning' });
    context.dispatch({ type: 'SET_CLIENT', payload: new Client(context) });
  };
}