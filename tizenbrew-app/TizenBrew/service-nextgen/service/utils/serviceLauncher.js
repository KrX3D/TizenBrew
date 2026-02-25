"use strict";

const vm = require('vm');
const fetch = require('node-fetch');

function startService(mdl, services) {
    let sandbox = {};

    Object.getOwnPropertyNames(global).forEach(prop => {
        const disAllowed = ['services', 'module', 'global', 'inDebug', 'currentClient', 'currentModule'];
        // Node.js v4.4.3 does not have Array.prototype.includes...
        if (disAllowed.indexOf(prop) >= 0) return;
        sandbox[prop] = global[prop];
    });

    sandbox['require'] = require;
    sandbox['tizen'] = global.tizen;
    sandbox['module'] = { exports: {} };

    // Fetch service script through local module proxy so URL resolution stays centralized.
    const cleanName = mdl.versionedFullName || mdl.fullName;
    const fetchUrl = `http://127.0.0.1:8081/module/${encodeURIComponent(cleanName)}/${mdl.serviceFile}?v=${Date.now()}`;

    fetch(fetchUrl)
        .then(res => {
            if (!res.ok) {
                throw new Error('Failed to fetch service script: ' + fetchUrl + ' (status ' + res.status + ')');
            }

            return res.text();
        })
        .then(script => {
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
        })
        .catch(e => {
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