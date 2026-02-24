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

    // Strip jsDelivr prefixes to get clean GitHub user/repo
    function getGitHubRepo(name) {
        if (name.startsWith('gh/')) return name.substring(3);
        if (name.startsWith('npm/')) return null;
        return name;
    }

    // Construct Raw GitHub fetch URL
    let fetchUrl;
    const cleanName = mdl.versionedFullName || mdl.fullName;
    if (cleanName.includes('@')) {
        const [rawRepo, tag] = cleanName.split('@');
        const repo = getGitHubRepo(rawRepo);
        if (repo) {
            fetchUrl = `https://raw.githubusercontent.com/${repo}/${tag}/${mdl.serviceFile}`;
        } else {
            fetchUrl = `https://cdn.jsdelivr.net/${cleanName}/${mdl.serviceFile}`;
        }
    } else {
        const repo = getGitHubRepo(cleanName);
        if (repo) {
            fetchUrl = `https://raw.githubusercontent.com/${repo}/main/${mdl.serviceFile}`;
        } else {
            fetchUrl = `https://cdn.jsdelivr.net/${cleanName}/${mdl.serviceFile}`;
        }
    }
    // Append cache buster
    fetchUrl += `?v=${Date.now()}`;

    fetch(fetchUrl)
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