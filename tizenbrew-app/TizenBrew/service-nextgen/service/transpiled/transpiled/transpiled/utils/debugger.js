"use strict";

function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
var CDP = require('chrome-remote-interface');
var fetch = require('node-fetch');
var _require = require('./wsCommunication.js'),
  Events = _require.Events;
var _require2 = require('./configuration.js'),
  readConfig = _require2.readConfig;
var WebSocket = require('ws');
var modulesCache = new Map();
function startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts) {
  if (!attempts) attempts = 1;
  if (!isAnotherApp) inDebug.tizenDebug = true;
  try {
    CDP({
      port: port,
      host: ip,
      local: true
    }, function (client) {
      client.Runtime.enable();
      client.Debugger.enable();
      client.on('Runtime.executionContextCreated', function (msg) {
        // [TizenTube Fix] Inject webapis.js content directly for Tizen TV compatibility
        // This bypasses CSP issues with file:// or $WEBAPIS/ URLs.
        var webapisContent = null;
        var fs = require('fs');
        // Extended path list for better compatibility
        var possiblePaths = ['/usr/share/nginx/html/webapis/webapis.js', '/usr/tv/webapis/webapis.js', '/usr/share/webapis/webapis.js', '/usr/bin/webapis/webapis.js', '/opt/share/webapp/webapis/webapis.js', '/usr/lib/wrt-engine/webapis/webapis.js'];
        var foundPath = null;
        for (var _i = 0, _possiblePaths = possiblePaths; _i < _possiblePaths.length; _i++) {
          var p = _possiblePaths[_i];
          try {
            if (fs.existsSync(p)) {
              console.log('[Debugger] Found webapis.js at ' + p);
              webapisContent = fs.readFileSync(p, 'utf8');
              foundPath = p;
              break;
            }
          } catch (e) {
            console.warn('[Debugger] Error checking ' + p + ': ' + e.message);
          }
        }
        if (webapisContent) {
          // Diagnostic alert (TEMPORARY: Remove after fix confirmed)
          var diagScript = "alert(\"TizenTube DEBUG: Found webapis.js at ".concat(foundPath, ". Injecting...\");");
          var _webapisLoader = "\n                        (function() {\n                            if (window.webapis || window.__webapisLoaded) return;\n                            window.__webapisLoaded = true;\n                            console.log('[TizenBrew] Injecting webapis.js content...');\n                            ".concat(webapisContent, "\n                        })();\n                    ");
          if (mdl.evaluateScriptOnDocumentStart) {
            client.Page.addScriptToEvaluateOnNewDocument({
              expression: diagScript
            });
            client.Page.addScriptToEvaluateOnNewDocument({
              expression: _webapisLoader
            });
          } else {
            client.Runtime.evaluate({
              expression: diagScript,
              contextId: msg.context.id
            });
            client.Runtime.evaluate({
              expression: _webapisLoader,
              contextId: msg.context.id
            });
          }
        } else {
          console.warn('[Debugger] webapis.js not found in system paths.');
          var _diagScript = "alert(\"TizenTube DEBUG: FAILED to find webapis.js in system paths! native API will fail.\");";
          if (mdl.evaluateScriptOnDocumentStart) {
            client.Page.addScriptToEvaluateOnNewDocument({
              expression: _diagScript
            });
          } else {
            client.Runtime.evaluate({
              expression: _diagScript,
              contextId: msg.context.id
            });
          }

          // Fallback to script tag injection just in case
          var _webapisLoader2 = "\n                        (function() {\n                            if (window.webapis || window.__webapisLoaded) return;\n                            window.__webapisLoaded = true;\n                            var s = document.createElement('script');\n                            s.src = '$WEBAPIS/webapis/webapis.js';\n                            document.head.appendChild(s);\n                        })();\n                    ";
          if (mdl.evaluateScriptOnDocumentStart) {
            client.Page.addScriptToEvaluateOnNewDocument({
              expression: _webapisLoader2
            });
          } else {
            client.Runtime.evaluate({
              expression: _webapisLoader2,
              contextId: msg.context.id
            });
          }
        }

        // Inject webapis loader appropriately
        if (mdl.evaluateScriptOnDocumentStart) {
          client.Page.addScriptToEvaluateOnNewDocument({
            expression: webapisLoader
          });
        } else {
          client.Runtime.evaluate({
            expression: webapisLoader,
            contextId: msg.context.id
          });
        }
        if (!mdl.evaluateScriptOnDocumentStart && mdl.name !== '') {
          // Use local proxy to handle upstream fetching and correct MIME types
          var proxyModule = encodeURIComponent(mdl.versionedFullName || mdl.fullName);
          var modUrl = 'http://127.0.0.1:8081/module/' + proxyModule + '/' + mdl.mainFile + '?v=' + Date.now();
          var expression = 'var s = document.createElement("script"); s.src = "' + modUrl + '"; (document.head || document.documentElement).appendChild(s);';
          client.Runtime.evaluate({
            expression: expression,
            contextId: msg.context.id
          });
        } else if (mdl.name !== '' && mdl.evaluateScriptOnDocumentStart) {
          // Construct Raw GitHub URL for server-side fetch
          // Strip jsDelivr prefixes (gh/, npm/) to get clean user/repo
          var getGitHubRepo = function getGitHubRepo(name) {
            if (name.startsWith('gh/')) return name.substring(3);
            if (name.startsWith('npm/')) return null; // npm packages can't use raw GitHub
            return name;
          };
          var cacheKey = mdl.versionedFullName || mdl.fullName;
          var clientConnection = clientConn.get('wsConn');
          var fetchUrl;
          var cleanName = mdl.versionedFullName || mdl.fullName;
          if (cleanName.includes('@')) {
            var _cleanName$split = cleanName.split('@'),
              _cleanName$split2 = _slicedToArray(_cleanName$split, 2),
              rawRepo = _cleanName$split2[0],
              tag = _cleanName$split2[1];
            var repo = getGitHubRepo(rawRepo);
            if (repo) {
              fetchUrl = "https://raw.githubusercontent.com/".concat(repo, "/").concat(tag, "/").concat(mdl.mainFile);
            } else {
              fetchUrl = "https://cdn.jsdelivr.net/".concat(cleanName, "/").concat(mdl.mainFile);
            }
          } else {
            var _repo = getGitHubRepo(cleanName);
            if (_repo) {
              fetchUrl = "https://raw.githubusercontent.com/".concat(_repo, "/main/").concat(mdl.mainFile);
            } else {
              fetchUrl = "https://cdn.jsdelivr.net/".concat(cleanName, "/").concat(mdl.mainFile);
            }
          }
          // Append cache buster
          fetchUrl += "?v=".concat(Date.now());
          var cache = modulesCache.get(cacheKey);
          if (cache) {
            client.Page.addScriptToEvaluateOnNewDocument({
              expression: cache
            });
            sendClientInformation(clientConn, clientConnection.Event(Events.LaunchModule, mdl.name));
          } else {
            fetch(fetchUrl).then(function (res) {
              return res.text();
            }).then(function (modFile) {
              modulesCache.set(cacheKey, modFile);
              sendClientInformation(clientConn, clientConnection.Event(Events.LaunchModule, mdl.name));
              client.Page.addScriptToEvaluateOnNewDocument({
                expression: modFile
              });
            })["catch"](function (e) {
              sendClientInformation(clientConn, clientConnection.Event(Events.LaunchModule, mdl.name));
              client.Page.addScriptToEvaluateOnNewDocument({
                expression: "alert(\"Failed to load module: '".concat(mdl.fullName, "'. Please relaunch TizenBrew to try again.\")")
              });
            });
          }
        }
      });
      client.on('disconnect', function () {
        if (isAnotherApp) return;
        inDebug.tizenDebug = false;
        inDebug.webDebug = false;
        inDebug.rwiDebug = false;
        mdl.fullName = '';
        mdl.name = '';
        mdl.appPath = '';
        mdl.moduleType = '';
        mdl.packageType = '';
        mdl.serviceFile = '';
        mdl.mainFile = '';
      });
      if (!isAnotherApp) {
        var clientConnection = clientConn.get('wsConn');
        if (appControlData.module) {
          var data = clientConnection.Event(Events.CanLaunchModules, {
            type: 'appControl',
            module: appControlData.module,
            args: appControlData.args
          });
          sendClientInformation(clientConn, data);
        } else {
          var config = readConfig();
          if (config.autoLaunchModule) {
            var _data = clientConnection.Event(Events.CanLaunchModules, {
              type: 'autolaunch',
              module: config.autoLaunchModule
            });
            sendClientInformation(clientConn, _data);
          } else {
            var _data2 = clientConnection.Event(Events.CanLaunchModules, null);
            sendClientInformation(clientConn, _data2);
          }
        }
      }
      if (!isAnotherApp) inDebug.webDebug = true;
      appControlData = null;
    }).on('error', function (err) {
      if (attempts >= 15) {
        if (!isAnotherApp) {
          clientConn.send(clientConn.Event(Events.Error, 'Failed to connect to the debugger'));
          inDebug.tizenDebug = false;
          return;
        } else return;
      }
      attempts++;
      setTimeout(function () {
        return startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts);
      }, 750);
    });
  } catch (e) {
    if (attempts >= 15) {
      if (!isAnotherApp) {
        clientConn.send(clientConn.Event(Events.Error, 'Failed to connect to the debugger'));
        inDebug.tizenDebug = false;
        return;
      } else return;
    }
    attempts++;
    setTimeout(function () {
      return startDebugging(port, queuedEvents, clientConn, ip, mdl, inDebug, appControlData, isAnotherApp, attempts);
    }, 750);
    return;
  }
}
function sendClientInformation(clientConn, data) {
  var clientConnection = clientConn.get('wsConn');
  if (clientConnection && clientConnection.connection && clientConnection.connection.readyState !== WebSocket.OPEN && !clientConnection.isReady || !clientConnection) {
    return setTimeout(function () {
      return sendClientInformation(clientConn, data);
    }, 50);
  }
  setTimeout(function () {
    clientConnection.send(data);
  }, 500);
}
module.exports = startDebugging;