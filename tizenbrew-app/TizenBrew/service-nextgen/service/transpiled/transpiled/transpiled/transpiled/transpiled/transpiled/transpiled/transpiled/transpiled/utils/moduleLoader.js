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
    return fetch("https://cdn.jsdelivr.net/".concat(module, "/package.json").concat(cacheBuster)).then(function (res) {
      return res.json();
    }).then(function (moduleJson) {
      console;
      var moduleData;
      var splitData = [module.substring(0, module.indexOf('/')), module.substring(module.indexOf('/') + 1)];
      var moduleMetadata = {
        name: splitData[1],
        type: splitData[0]
      };
      if (moduleJson.packageType === 'app') {
        // Use versioned URL for assets to bypass jsDelivr caching on the repo path
        var versionedModule = moduleJson.version ? "".concat(module, "@").concat(moduleJson.version) : module;
        moduleData = {
          fullName: module,
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