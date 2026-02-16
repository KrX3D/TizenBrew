"use strict";

const vm = require('vm');
const fetch = require('node-fetch');
const { log } = require('./logBus.js');

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

    sandbox['console'] = {
        log: function () {
            log.apply(null, ['info', `module-service:${mdl.fullName}`].concat(Array.prototype.slice.call(arguments)));
        },
        warn: function () {
            log.apply(null, ['warn', `module-service:${mdl.fullName}`].concat(Array.prototype.slice.call(arguments)));
        },
        error: function () {
            log.apply(null, ['error', `module-service:${mdl.fullName}`].concat(Array.prototype.slice.call(arguments)));
        }
    };

    fetch(`https://cdn.jsdelivr.net/${mdl.fullName}/${mdl.serviceFile}`)
        .then(res => res.text())
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
                log('error', `module-service:${mdl.fullName}`, 'Service script crashed', e);
            }
        })
        .catch(e => {
            if (services.has(mdl.fullName)) {
                services.get(mdl.fullName).hasCrashed = true;
                services.get(mdl.fullName).error = e;
                log('error', `module-service:${mdl.fullName}`, 'Service script crashed', e);
            } else {
                services.set(mdl.fullName, {
                    context: null,
                    hasCrashed: true,
                    error: e
                });
                log('error', `module-service:${mdl.fullName}`, 'Failed to fetch service script', e);
            }
        });
}

module.exports = startService;