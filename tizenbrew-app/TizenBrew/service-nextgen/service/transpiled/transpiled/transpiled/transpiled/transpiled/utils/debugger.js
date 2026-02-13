"use strict";

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
        if (!mdl.evaluateScriptOnDocumentStart && mdl.name !== '') {
          var modUrl = 'https://cdn.jsdelivr.net/' + (mdl.versionedFullName || mdl.fullName) + '/' + mdl.mainFile + '?v=' + Date.now();
          var expression = 'const script = document.createElement("script"); script.src = "' + modUrl + '"; document.head.appendChild(script);';
          client.Runtime.evaluate({
            expression: expression,
            contextId: msg.context.id
          });
        } else if (mdl.name !== '' && mdl.evaluateScriptOnDocumentStart) {
          var cacheKey = mdl.versionedFullName || mdl.fullName;
          var cache = modulesCache.get(cacheKey);
          var clientConnection = clientConn.get('wsConn');
          if (cache) {
            client.Page.addScriptToEvaluateOnNewDocument({
              expression: cache
            });
            sendClientInformation(clientConn, clientConnection.Event(Events.LaunchModule, mdl.name));
          } else {
            fetch("https://cdn.jsdelivr.net/".concat(cacheKey, "/").concat(mdl.mainFile)).then(function (res) {
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