"use strict";

var vm = require('vm');
var fetch = require('node-fetch');
function startService(mdl, services) {
  var sandbox = {};
  Object.getOwnPropertyNames(global).forEach(function (prop) {
    var disAllowed = ['services', 'module', 'global', 'inDebug', 'currentClient', 'currentModule'];
    // Node.js v4.4.3 does not have Array.prototype.includes...
    if (disAllowed.indexOf(prop) >= 0) return;
    sandbox[prop] = global[prop];
  });
  sandbox['require'] = require;
  sandbox['tizen'] = global.tizen;
  sandbox['module'] = {
    exports: {}
  };
  fetch("https://cdn.jsdelivr.net/".concat(mdl.fullName, "/").concat(mdl.serviceFile)).then(function (res) {
    return res.text();
  }).then(function (script) {
    services.set(mdl.fullName, {
      context: vm.createContext(sandbox),
      hasCrashed: false,
      error: null
    });
    try {
      vm.runInContext(script, services.get(mdl.fullName).context);
    } catch (e) {
      services.get(mdl.fullName).hasCrashed = true;
      services.get(mdl.fullName).error = e;
    }
  })["catch"](function (e) {
    if (services.has(mdl.fullName)) {
      services.get(mdl.fullName).hasCrashed = true;
      services.get(mdl.fullName).error = e;
    } else {
      services.set(mdl.fullName, {
        context: null,
        hasCrashed: true,
        error: e
      });
    }
  });
}
module.exports = startService;