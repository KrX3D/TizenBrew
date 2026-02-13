"use strict";

var _require = require('./configuration.js'),
  readConfig = _require.readConfig;
var fetch = require('node-fetch');
function loadModules() {
  var config = readConfig();
  var modules = config.modules;
  var modulePromises = modules.map(function (module) {
    // Bypass jsDelivr cache for package.json to detect updates
    var cacheBuster = "?t=".concat(Date.now());
    var url = "https://cdn.jsdelivr.net/".concat(module, "/package.json").concat(cacheBuster);

    // If it's a GitHub module, use raw.githubusercontent.com for instant updates
    if (module.startsWith('gh/')) {
      var parts = module.split('/');
      if (parts.length >= 3) {
        var user = parts[1];
        var repo = parts[2];
        url = "https://raw.githubusercontent.com/".concat(user, "/").concat(repo, "/main/package.json").concat(cacheBuster);
      }
    }
    return fetch(url).then(function (res) {
      return res.json();
    }).then(function (moduleJson) {
      var moduleData;
      var splitData = [module.substring(0, module.indexOf('/')), module.substring(module.indexOf('/') + 1)];
      var moduleMetadata = {
        name: splitData[1],
        type: splitData[0]
      };
      var versionedModule = moduleJson.version ? "".concat(module, "@").concat(moduleJson.version) : module;
      if (moduleJson.packageType === 'app') {
        moduleData = {
          fullName: module,
          versionedFullName: versionedModule,
          appName: moduleJson.appName,
          version: moduleJson.version,
          name: moduleMetadata.name,
          appPath: "http://127.0.0.1:8081/module/".concat(encodeURIComponent(versionedModule), "/").concat(moduleJson.appPath),
          keys: moduleJson.keys ? moduleJson.keys : [],
          moduleType: moduleMetadata.type,
          packageType: moduleJson.packageType,
          description: moduleJson.description,
          serviceFile: moduleJson.serviceFile
        };
      } else if (moduleJson.packageType === 'mods') {
        moduleData = {
          fullName: module,
          versionedFullName: versionedModule,
          appName: moduleJson.appName,
          version: moduleJson.version,
          name: moduleMetadata.name,
          appPath: moduleJson.websiteURL,
          keys: moduleJson.keys ? moduleJson.keys : [],
          moduleType: moduleMetadata.type,
          packageType: moduleJson.packageType,
          description: moduleJson.description,
          serviceFile: moduleJson.serviceFile,
          tizenAppId: moduleJson.tizenAppId,
          mainFile: moduleJson.main,
          evaluateScriptOnDocumentStart: moduleJson.evaluateScriptOnDocumentStart
        };
      } else return {
        appName: 'Unknown Module',
        name: moduleMetadata.name,
        fullName: module,
        appPath: '',
        keys: [],
        moduleType: moduleMetadata.type,
        packageType: 'app',
        description: "Unknown module ".concat(module, ". Please check the module name and try again.")
      };
      return moduleData;
    })["catch"](function (e) {
      console.error(e);
      var splitData = [module.substring(0, module.indexOf('/')), module.substring(module.indexOf('/') + 1)];
      var moduleMetadata = {
        name: splitData[1],
        type: splitData[0]
      };
      return {
        appName: 'Unknown Module',
        name: moduleMetadata.name,
        fullName: module,
        appPath: '',
        keys: [],
        moduleType: moduleMetadata.type,
        packageType: 'app',
        description: "Unknown module ".concat(module, ". Please check the module name and try again.")
      };
    });
  });
  return Promise.all(modulePromises).then(function (modules) {
    return modules;
  });
}
module.exports = loadModules;