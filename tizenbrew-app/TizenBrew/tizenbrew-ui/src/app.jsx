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
import { useToast, ToastContainer, setGlobalToast, getPendingAdd, clearPendingAdd } from './components/Toast.jsx';

export default function App() {
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const context = useContext(GlobalStateContext);
  const { t } = useTranslation();
  const { toasts, toast } = useToast();

  // Register toast globally so any component can use it across navigations
  useEffect(() => {
    setGlobalToast(toast);
  }, [toast]);

  // ── Global pending-add watcher ──────────────────────────────────────────
  // Lives here so it NEVER unmounts regardless of which route the user is on.
  // AddModule writes a pending record via setPendingAdd() before navigating away;
  // this effect detects the GetModules response and resolves the toast.
  const prevModulesRef = useRef(null);
  useEffect(() => {
    const modules = context.state.sharedData.modules;
    const p = getPendingAdd();

    if (!p || !modules) {
      prevModulesRef.current = modules;
      return;
    }

    // Only act when the list reference actually changed (= server responded)
    if (modules === prevModulesRef.current) return;
    prevModulesRef.current = modules;

    const shortName = p.fullName.split('/').slice(1).join('/');
    const found = modules.find(m => m.fullName === p.fullName);

    if (found && found.appName !== 'Unknown Module') {
      toast.resolve(p.toastId, 'success', `✓ "${found.appName}" (${found.version}) added!`);
    } else if (found) {
      const hint = p.type === 'npm'
        ? 'Not found on jsDelivr. New npm packages can take up to 24h — use "gh" for instant GitHub access.'
        : 'Not found on GitHub. Double-check the user/repo name.';
      toast.resolve(p.toastId, 'error', `"${shortName}" — ${hint}`);
    } else {
      toast.resolve(p.toastId, 'error', `"${shortName}" could not be added. Check the name and try again.`);
    }

    clearPendingAdd();
  }, [context.state.sharedData.modules]);

  // 15s timeout for pending add
  useEffect(() => {
    const p = getPendingAdd();
    if (!p) return;
    const timer = setTimeout(() => {
      const stillPending = getPendingAdd();
      if (!stillPending) return;
      toast.resolve(stillPending.toastId, 'error', 'No response from service after 15s. Is it still running?');
      clearPendingAdd();
    }, 15000);
    return () => clearTimeout(timer);
  }, [context.state.sharedData.modules]);

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
        {/* Global toast container — always visible regardless of route */}
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

function startService(context) {
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
    context.dispatch({ type: 'SET_CLIENT', payload: new Client(context) });
  };
}