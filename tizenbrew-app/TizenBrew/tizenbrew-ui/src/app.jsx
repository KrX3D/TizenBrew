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
        context.dispatch({
          type: 'SET_ERROR',
          payload: { message: null, disappear: false }
        });
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

// ── Service startup with retry logic ─────────────────────────────────────────
//
// Problem on Tizen 5.5:
//   1. WS connect to 8081 fails → launchAppControl fires
//   2. launchAppControl success callback → immediate reload
//   3. On reload, service may not be fully up yet → WS fails again
//   4. Second launchAppControl attempt → "unknown error" (service already launching)
//
// Fix:
//   - Add a 2s delay before reload so the service has time to bind its WS port
//   - If launchAppControl itself fails, assume the service is already running/launching
//     and retry the WS connection (up to 5 times, 1.5s apart) instead of alerting

function tryConnectWS(context, wsRetry) {
  const testWS = new WebSocket('ws://localhost:8081');

  // Timeout in case the socket neither opens nor errors quickly (Tizen 5.5 quirk)
  const timeout = setTimeout(() => {
    try { testWS.close(); } catch (_) {}
    handleWSFailure(context, wsRetry);
  }, 3000);

  testWS.onerror = () => {
    clearTimeout(timeout);
    handleWSFailure(context, wsRetry);
  };

  testWS.onopen = () => {
    clearTimeout(timeout);
    context.dispatch({ type: 'SET_STATE', payload: 'service.alreadyRunning' });
    context.dispatch({ type: 'SET_CLIENT', payload: new Client(context) });
  };
}

function handleWSFailure(context, wsRetry) {
  if (wsRetry > 0) {
    // Already tried launching — just retry the WS connection, the service
    // is probably still warming up.
    setTimeout(() => tryConnectWS(context, wsRetry - 1), 1500);
    return;
  }

  // First failure — try launching the service.
  const pkgId = tizen.application.getCurrentApplication().appInfo.packageId;
  const serviceId = pkgId + '.StandaloneService';

  tizen.application.launchAppControl(
    new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/service'),
    serviceId,
    function () {
      // Success — give the service 2 s to start its WS server, then reload.
      context.dispatch({ type: 'SET_STATE', payload: 'service.started' });
      setTimeout(() => window.location.reload(), 2000);
    },
    function (e) {
      // launchAppControl failed.
      // "unknown error" on Tizen 5.5 usually means the service is already
      // running or is still in the process of starting up.
      // Retry WS connection up to 5 more times before giving up.
      const msg = (e && e.message) ? e.message.toLowerCase() : '';
      if (msg.includes('unknown') || msg.includes('already') || wsRetry < 5) {
        setTimeout(() => tryConnectWS(context, 5), 1500);
      } else {
        alert('Launch Service failed: ' + e.message);
      }
    }
  );
}

function startService(context) {
  tryConnectWS(context, 0);
}