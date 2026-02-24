"use strict";

function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
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

  // Strip jsDelivr prefixes to get clean GitHub user/repo
  function getGitHubRepo(name) {
    if (name.startsWith('gh/')) return name.substring(3);
    if (name.startsWith('npm/')) return null;
    return name;
  }

  // Construct Raw GitHub fetch URL
  var fetchUrl;
  var cleanName = mdl.versionedFullName || mdl.fullName;
  if (cleanName.includes('@')) {
    var _cleanName$split = cleanName.split('@'),
      _cleanName$split2 = _slicedToArray(_cleanName$split, 2),
      rawRepo = _cleanName$split2[0],
      tag = _cleanName$split2[1];
    var repo = getGitHubRepo(rawRepo);
    if (repo) {
      fetchUrl = "https://raw.githubusercontent.com/".concat(repo, "/").concat(tag, "/").concat(mdl.serviceFile);
    } else {
      fetchUrl = "https://cdn.jsdelivr.net/".concat(cleanName, "/").concat(mdl.serviceFile);
    }
  } else {
    var _repo = getGitHubRepo(cleanName);
    if (_repo) {
      fetchUrl = "https://raw.githubusercontent.com/".concat(_repo, "/main/").concat(mdl.serviceFile);
    } else {
      fetchUrl = "https://cdn.jsdelivr.net/".concat(cleanName, "/").concat(mdl.serviceFile);
    }
  }
  // Append cache buster
  fetchUrl += "?v=".concat(Date.now());
  fetch(fetchUrl).then(function (res) {
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