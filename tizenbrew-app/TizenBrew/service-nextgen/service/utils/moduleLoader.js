const { readConfig } = require('./configuration.js');
const fetch = require('node-fetch');
const { parseModule, getPackageJsonUrls } = require('./moduleSource.js');

function fetchJsonWithFallback(urls) {
    let lastError = null;

    function attempt(idx) {
        if (idx >= urls.length) {
            return Promise.reject(lastError || new Error('No URLs to fetch'));
        }

        return fetch(urls[idx])
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status} for ${urls[idx]}`);
                }
                return res.json().then(json => ({ json, url: urls[idx] }));
            })
            .catch(err => {
                lastError = err;
                return attempt(idx + 1);
            });
    }

    return attempt(0);
}

function loadModules() {
    const config = readConfig();
    const modules = config.modules || [];
    const moduleSources = config.moduleSources || {};

    const modulePromises = modules.map(fullName => {
        const moduleMetadata = parseModule(fullName);
        const sourceMode = moduleSources[fullName] === 'direct' ? 'direct' : 'cdn';
        const urls = getPackageJsonUrls(fullName, sourceMode);

        return fetchJsonWithFallback(urls)
            .then(result => {
                const moduleJson = result.json;
                const resolvedBranch = result.url.includes('/master/') ? 'master' : 'main';
                let moduleData;
                if (moduleJson.packageType === 'app') {
                    moduleData = {
                        fullName,
                        appName: moduleJson.appName,
                        version: moduleJson.version,
                        name: moduleMetadata.name,
                        appPath: `http://127.0.0.1:8081/module/${encodeURIComponent(fullName)}/${moduleJson.appPath}`,
                        keys: moduleJson.keys ? moduleJson.keys : [],
                        moduleType: moduleMetadata.type,
                        packageType: moduleJson.packageType,
                        description: moduleJson.description,
                        serviceFile: moduleJson.serviceFile,
                        sourceMode,
                        sourceBranch: moduleSources[`${fullName}:branch`] || resolvedBranch
                    };
                } else if (moduleJson.packageType === 'mods') {
                    moduleData = {
                        fullName,
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
                        evaluateScriptOnDocumentStart: moduleJson.evaluateScriptOnDocumentStart,
                        sourceMode,
                        sourceBranch: moduleSources[`${fullName}:branch`] || resolvedBranch
                    };
                } else {
                    return {
                        appName: 'Unknown Module',
                        name: moduleMetadata.name,
                        fullName,
                        appPath: '',
                        keys: [],
                        moduleType: moduleMetadata.type,
                        packageType: 'app',
                        description: `Unknown module ${fullName}. Please check the module name and try again.`
                    };
                }

                return moduleData;
            })
            .catch(() => {
                return {
                    appName: 'Unknown Module',
                    name: moduleMetadata.name,
                    fullName,
                    appPath: '',
                    keys: [],
                    moduleType: moduleMetadata.type,
                    packageType: 'app',
                    description: `Unknown module ${fullName}. Please check the module name and try again.`
                };
            });
    });

    return Promise.all(modulePromises)
        .then(loadedModules => loadedModules);
}

module.exports = loadModules;
