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
import { useToast, ToastContainer, setGlobalToast } from './components/Toast.jsx';

export default function App() {
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const context = useContext(GlobalStateContext);
  const { t } = useTranslation();
  const { toasts, toast } = useToast();

  useEffect(() => {
    setGlobalToast(toast);
  }, [toast]);

  const timeoutRef = useRef(null);

  useEffect(() => {
    const { pendingAdd, modulesVersion, modules } = context.state.sharedData;
    if (!pendingAdd) return;
    if (modulesVersion <= pendingAdd.snapshotVersion) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const shortName = pendingAdd.fullName.split('/').slice(1).join('/');
    const found = modules ? modules.find(m => m.fullName === pendingAdd.fullName) : null;

    if (found && found.appName !== 'Unknown Module') {
      toast.resolve(pendingAdd.toastId, 'success', `✓ "${found.appName}" (${found.version}) added!`);
    } else if (found) {
      const hint = pendingAdd.type === 'npm'
        ? 'Not found on jsDelivr. New npm packages can take up to 24h — use "gh" for instant GitHub access.'
        : 'Not found on GitHub. Double-check the user/repo name.';
      toast.resolve(pendingAdd.toastId, 'error', `"${shortName}" — ${hint}`);
    } else {
      toast.resolve(pendingAdd.toastId, 'error', `"${shortName}" could not be added. Check the name and try again.`);
    }

    context.dispatch({ type: 'SET_PENDING_ADD', payload: null });
  }, [context.state.sharedData.modulesVersion]);

  useEffect(() => {
    const { pendingAdd } = context.state.sharedData;
    if (!pendingAdd) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const p = context.state.sharedData.pendingAdd;
      if (!p) return;
      toast.resolve(p.toastId, 'error', 'No response from service after 15s. Is it still running?');
      context.dispatch({ type: 'SET_PENDING_ADD', payload: null });
      timeoutRef.current = null;
    }, 15000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [context.state.sharedData.pendingAdd]);

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
      startService(context, toast);
      window.setClient = true;
    }
  }, []);

  return (
    <ErrorBoundary>
      <LocationProvider>
        <ToastContainer toasts={toasts} onDismiss={toast.dismiss} />
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
            <Route component={Home} path="/tizenbrew-ui/dist/index.html" />
            <Route component={ModuleManager} path="/tizenbrew-ui/dist/index.html/module-manager" />
            <Route component={AddModule} path="/tizenbrew-ui/dist/index.html/module-manager/add" />
            <Route component={Settings} path="/tizenbrew-ui/dist/index.html/settings" />
            <Route component={Change} path="/tizenbrew-ui/dist/index.html/settings/change" />
            <Route component={UserAgentSettings} path="/tizenbrew-ui/dist/index.html/settings/change-ua" />
            <Route component={About} path="/tizenbrew-ui/dist/index.html/about" />
          </Router>
        </div>
      </LocationProvider>
    </ErrorBoundary>
  );
}

function startService(context, toast) {
  // ── Quick config-file probe via HTTP before WS connects ──────────────────
  // The service exposes an HTTP server on :8081. We use a known route that
  // returns the deviceIP string to confirm the service is up, then show a
  // toast reporting whether the config file exists based on the initial
  // GetModules response. This fires from the frontend side before any WS
  // message, so the diagnostic is available even if the WS handshake stalls.

  const testWS = new WebSocket('ws://localhost:8081');

  testWS.onerror = () => {
    const pkgId = tizen.application.getCurrentApplication().appInfo.packageId;
    const serviceId = pkgId + '.StandaloneService';
    tizen.application.launchAppControl(
      new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/service'),
      serviceId,
      function () {
        context.dispatch({ type: 'SET_STATE', payload: 'service.started' });
        window.location.reload();
      },
      function (e) { alert('Launch Service failed: ' + e.message); }
    );
  };

  testWS.onopen = () => {
    context.dispatch({ type: 'SET_STATE', payload: 'service.alreadyRunning' });

    // ── Show immediate config-probe toast ─────────────────────────────────
    // Ask the service to probe the config path and report back via a
    // one-shot HTTP call to the service's proxy port. We send a custom
    // lightweight WS message and the service replies with ConfigProbe.
    // For now, show a holding toast that gets resolved once GetModules arrives.
    const t = window.__globalToast || toast;
    if (t) {
      const probeId = t.loading('🔍 Probing config file…');
      // Resolved by WebSocketClient when GetModules arrives with diagnostic
      window.__configProbeToastId = probeId;
    }

    context.dispatch({ type: 'SET_CLIENT', payload: new Client(context) });
  };
}