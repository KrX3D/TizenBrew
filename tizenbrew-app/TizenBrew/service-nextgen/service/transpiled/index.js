"use strict";

function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
module.exports.onStart = function () {
  console.log('Service started');
  var adbhost = require('adbhost');
  var express = require('express');
  var fetch = require('node-fetch');
  var path = require('path');
  var _require = require('./utils/configuration.js'),
    readConfig = _require.readConfig,
    writeConfig = _require.writeConfig;
  var loadModules = require('./utils/moduleLoader.js');
  var startDebugging = require('./utils/debugger.js');
  var startService = require('./utils/serviceLauncher.js');
  var _require2 = require('./utils/wsCommunication.js'),
    Connection = _require2.Connection,
    Events = _require2.Events;
  var WebSocket;
  if (process.version === 'v4.4.3') {
    WebSocket = require('ws-old');
  } else {
    WebSocket = require('ws-new');
  }
  var app = express();
  var deviceIP;
  var isTizen3 = tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version').startsWith('3.0');

  // HTTP Proxy for modules 
  app.all('*', function (req, res) {
    if (req.url.startsWith('/module/')) {
      var splittedUrl = req.url.split('/');
      var encodedModuleName = splittedUrl[2];
      var moduleName = decodeURIComponent(encodedModuleName);
      // Append timestamp to ensure we don't hit any intermediate caches for proxy requests
      var cacheBuster = "?t=".concat(Date.now());
      fetch("https://cdn.jsdelivr.net/".concat(moduleName, "/").concat(req.url.replace("/module/".concat(encodedModuleName, "/"), '')).concat(cacheBuster)).then(function (fetchRes) {
        return fetchRes.body.pipe(res);
      }).then(function () {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.type(path.basename(req.url.replace("/module/".concat(encodedModuleName, "/"), '')).split('.').slice(-1)[0].split('?')[0]);
      });
    } else {
      res.send(deviceIP);
    }
  });
  var wsServer = new WebSocket.Server({
    server: app.listen(8081, "127.0.0.1")
  });
  var adbClient;
  var canLaunchInDebug = null;
  fetch('http://127.0.0.1:8001/api/v2/').then(function (res) {
    return res.json();
  }).then(function (json) {
    canLaunchInDebug = (json.device.developerIP === '127.0.0.1' || json.device.developerIP === '1.0.0.127') && json.device.developerMode === '1';
  });
  var inDebug = {
    tizenDebug: false,
    webDebug: false,
    rwiDebug: false
  };
  var services = new Map();
  var queuedEvents = [];
  var modulesCache = null;
  var currentModule = {
    name: '',
    appPath: '',
    moduleType: '',
    packageType: '',
    serviceFile: ''
  };
  var appControlData = {
    module: null,
    args: null
  };
  loadModules().then(function (modules) {
    modulesCache = modules;
    var serviceModuleList = readConfig().autoLaunchServiceList;
    if (serviceModuleList.length > 0) {
      serviceModuleList.forEach(function (module) {
        var service = modules.find(function (m) {
          return m.name === module;
        });
        if (service) startService(service, services);
      });
    }
  });
  function createAdbConnection(ip, mdl) {
    deviceIP = ip;
    if (adbClient) {
      if (!adbClient._stream) {
        adbClient._stream.removeAllListeners('connect');
        adbClient._stream.removeAllListeners('error');
        adbClient._stream.removeAllListeners('close');
      }
    }
    adbClient = adbhost.createConnection({
      host: '127.0.0.1',
      port: 26101
    });
    adbClient._stream.on('connect', function () {
      console.log('ADB connection established');
      //Launch app
      var tbPackageId = tizen.application.getAppInfo().packageId;
      var shellCmd = adbClient.createStream("shell:0 debug ".concat(tbPackageId, ".TizenBrewStandalone").concat(isTizen3 ? ' 0' : ''));
      shellCmd.on('data', function dataIncoming(data) {
        var dataString = data.toString();
        if (dataString.includes('debug')) {
          var port = Number(dataString.substr(dataString.indexOf(':') + 1, 6).replace(' ', ''));
          startDebugging(port, queuedEvents, services, ip, mdl, inDebug, appControlData, false);
          setTimeout(function () {
            return adbClient._stream.end();
          }, 1000);
        }
      });
    });
    adbClient._stream.on('error', function (e) {
      console.log('ADB connection error. ' + e);
    });
    adbClient._stream.on('close', function () {
      console.log('ADB connection closed.');
    });
  }
  wsServer.on('connection', function (ws) {
    var wsConn = new Connection(ws);
    for (var _i = 0, _queuedEvents = queuedEvents; _i < _queuedEvents.length; _i++) {
      var event = _queuedEvents[_i];
      wsConn.send(event);
      queuedEvents.splice(queuedEvents.indexOf(event), 1);
    }
    services.set('wsConn', wsConn);
    ws.on('message', function (message) {
      var msg;
      try {
        msg = JSON.parse(message);
      } catch (e) {
        return wsConn.send(wsConn.Event(Events.Error, "Invalid JSON: ".concat(message)));
      }
      var _msg = msg,
        type = _msg.type,
        payload = _msg.payload;
      switch (type) {
        case Events.AppControlData:
          {
            var moduleMetadata = [payload["package"].substring(0, payload["package"].indexOf('/')), payload["package"].substring(payload["package"].indexOf('/') + 1)];
            var _module = modulesCache.find(function (m) {
              return m.name === moduleMetadata[1];
            });
            if (!_module) {
              return wsConn.send(wsConn.Event(Events.Error, 'App Control module not found.'));
            }
            appControlData.module = _module;
            appControlData.args = payload.args;
            wsConn.send(wsConn.Event(Events.AppControlData, null));
            break;
          }
        case Events.GetDebugStatus:
          {
            wsConn.send(wsConn.Event(Events.GetDebugStatus, inDebug));
            break;
          }
        case Events.CanLaunchInDebug:
          {
            fetch('http://127.0.0.1:8001/api/v2/').then(function (res) {
              return res.json();
            }).then(function (json) {
              canLaunchInDebug = (json.device.developerIP === '127.0.0.1' || json.device.developerIP === '1.0.0.127') && json.device.developerMode === '1';
            });
            wsConn.send(wsConn.Event(Events.CanLaunchInDebug, canLaunchInDebug));
            break;
          }
        case Events.ReLaunchInDebug:
          {
            setTimeout(function () {
              createAdbConnection(payload.tvIP, currentModule);
            }, 1000);
            break;
          }
        case Events.GetModules:
          {
            wsConn.isReady = true;
            services.set('wsConn', wsConn);
            if (payload) {
              loadModules().then(function (modules) {
                modulesCache = modules;
                wsConn.send(wsConn.Event(Events.GetModules, modules));
              });
            } else wsConn.send(wsConn.Event(Events.GetModules, modulesCache));
            break;
          }
        case Events.LaunchModule:
          {
            var mdl = payload;
            currentModule.fullName = mdl.fullName;
            currentModule.name = mdl.name;
            currentModule.appPath = mdl.appPath;
            currentModule.moduleType = mdl.moduleType;
            currentModule.packageType = mdl.packageType;
            currentModule.serviceFile = mdl.serviceFile;
            if (mdl.packageType === 'app') {
              inDebug.webDebug = false;
              inDebug.tizenDebug = false;
            } else {
              currentModule.mainFile = mdl.mainFile;
              currentModule.tizenAppId = mdl.tizenAppId;
              currentModule.evaluateScriptOnDocumentStart = mdl.evaluateScriptOnDocumentStart;
            }
            if (mdl.serviceFile) {
              if (services.has(mdl.fullName)) {
                if (services.get(mdl.fullName).hasCrashed) {
                  services["delete"](mdl.fullName);
                  startService(mdl, services);
                }
              } else startService(mdl, services);
            }
            break;
          }
        case Events.StartService:
          {
            var _mdl = payload;
            if (payload.serviceFile && services.has(_mdl.fullName)) {
              if (services.get(_mdl.fullName).hasCrashed) {
                services["delete"](_mdl.fullName);
                startService(_mdl, services);
              }
            } else startService(_mdl, services);
            break;
          }
        case Events.GetServiceStatuses:
          {
            var serviceList = [];
            var _iterator = _createForOfIteratorHelper(services),
              _step;
            try {
              for (_iterator.s(); !(_step = _iterator.n()).done;) {
                var map = _step.value;
                serviceList.push({
                  name: map[0],
                  hasCrashed: map[1].hasCrashed,
                  error: map[1].error
                });
              }
            } catch (err) {
              _iterator.e(err);
            } finally {
              _iterator.f();
            }
            wsConn.send(wsConn.Event(Events.GetServiceStatuses, serviceList));
            break;
          }
        case Events.ModuleAction:
          {
            var action = payload.action,
              _module2 = payload.module;
            var config = readConfig();
            switch (action) {
              case 'add':
                {
                  var index = config.modules.findIndex(function (m) {
                    return m === _module2;
                  });
                  if (index === -1) {
                    config.modules.push(_module2);
                    writeConfig(config);
                  }
                  break;
                }
              case 'remove':
                {
                  var _index = config.modules.findIndex(function (m) {
                    return m === _module2;
                  });
                  if (_index !== -1) {
                    config.modules.splice(_index, 1);
                    writeConfig(config);
                  }
                  break;
                }
              case 'autolaunch':
                {
                  config.autoLaunchModule = _module2;
                  writeConfig(config);
                  break;
                }
              case 'autolaunchService':
                {
                  config.autoLaunchServiceList = _module2;
                  writeConfig(config);
                  break;
                }
            }
            break;
          }
        case Events.Ready:
          {
            wsConn.isReady = true;
            services.set('wsConn', wsConn);
            break;
          }
        default:
          {
            wsConn.send(wsConn.Event(Events.Error, 'Invalid event type.'));
            break;
          }
      }
    });
  });
};