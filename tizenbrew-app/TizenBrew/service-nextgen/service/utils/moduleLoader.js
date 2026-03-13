const { readConfig } = require('./configuration.js');
const fetch = require('node-fetch');

// Samsung TV network requests can hang indefinitely.
// This wrapper rejects after `ms` milliseconds so Promise.all never blocks forever.
function fetchWithTimeout(url, ms) {
    return new Promise(function(resolve, reject) {
        var done = false;
        var timer = setTimeout(function() {
            if (done) return;
            done = true;
            reject(new Error('fetch timeout after ' + ms + 'ms: ' + url));
        }, ms);
        fetch(url).then(function(res) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(res);
        }).catch(function(err) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(err);
        });
    });
}

function loadModules() {
    var config = readConfig();
    var modules = config.modules;

    var modulePromises = modules.map(function(module) {
        // Bypass jsDelivr cache for package.json to detect updates
        var cacheBuster = '?t=' + Date.now();
        var url = 'https://cdn.jsdelivr.net/' + module + '/package.json' + cacheBuster;

        // If it's a GitHub module, use raw.githubusercontent.com for instant updates
        if (module.startsWith('gh/')) {
            var parts = module.split('/');
            if (parts.length >= 3) {
                var user = parts[1];
                var repo = parts[2];
                url = 'https://raw.githubusercontent.com/' + user + '/' + repo + '/main/package.json' + cacheBuster;
            }
        }

        return fetchWithTimeout(url, 8000)
            .then(function(res) { return res.json(); })
            .then(function(moduleJson) {

                var moduleData;
                var splitData = [
                    module.substring(0, module.indexOf('/')),
                    module.substring(module.indexOf('/') + 1)
                ];
                var moduleMetadata = {
                    name: splitData[1],
                    type: splitData[0]
                };
                var versionedModule = module;
                if (module.startsWith('gh/')) {
                    versionedModule = module + '@main';
                } else if (moduleJson.version) {
                    versionedModule = module + '@' + moduleJson.version;
                }

                if (moduleJson.packageType === 'app') {
                    moduleData = {
                        fullName: module,
                        versionedFullName: versionedModule,
                        appName: moduleJson.appName,
                        version: moduleJson.version,
                        name: moduleMetadata.name,
                        appPath: 'http://127.0.0.1:8081/module/' + encodeURIComponent(versionedModule) + '/' + moduleJson.appPath,
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
                } else {
                    return {
                        appName: 'Unknown Module',
                        name: moduleMetadata.name,
                        fullName: module,
                        appPath: '',
                        keys: [],
                        moduleType: moduleMetadata.type,
                        packageType: 'app',
                        description: 'Unknown module ' + module + '. Please check the module name and try again.'
                    };
                }

                return moduleData;
            })
            .catch(function(e) {
                console.error('[loadModules] Failed for ' + module + ': ' + e.message);

                var splitData = [
                    module.substring(0, module.indexOf('/')),
                    module.substring(module.indexOf('/') + 1)
                ];
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
                    description: 'Unknown module ' + module + '. Check the name and try again. (' + e.message + ')'
                };
            });
    });

    return Promise.all(modulePromises);
}

module.exports = loadModules;