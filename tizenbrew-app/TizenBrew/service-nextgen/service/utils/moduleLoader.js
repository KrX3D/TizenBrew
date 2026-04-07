const { readConfig, parseModuleEntry } = require('./configuration.js');
const { getPackageJsonUrls } = require('./moduleSource.js');
const logBus = require('./logBus.js');
const fetch = require('node-fetch');

function fetchFirstUrl(urls, state) {
    state = state || { rateLimited: false };
    if (urls.length === 0) {
        const err = new Error('No URLs to try');
        err.rateLimited = state.rateLimited;
        return Promise.reject(err);
    }
    const currentUrl = urls[0];
    return fetch(currentUrl)
        .then(res => {
            const isGitHub = currentUrl.includes('githubusercontent.com');
            const isRateLimit = res.status === 429 || (res.status === 403 && isGitHub);
            if (isRateLimit) {
                logBus.log('WARN', 'moduleLoader', 'GitHub rate limit — trying fallback', { url: currentUrl });
                state.rateLimited = true;
                if (urls.length > 1) return fetchFirstUrl(urls.slice(1), state);
                const err = new Error('GitHub rate limit exceeded');
                err.rateLimited = true;
                throw err;
            }
            if (!res.ok) {
                if (urls.length > 1) return fetchFirstUrl(urls.slice(1), state);
                throw new Error('HTTP ' + res.status);
            }
            return res.json().then(data => ({ data, rateLimited: state.rateLimited, resolvedUrl: currentUrl }));
        })
        .catch(err => {
            if (err.rateLimited !== undefined) throw err;
            if (urls.length > 1) return fetchFirstUrl(urls.slice(1), state);
            throw err;
        });
}

function loadModules() {
    const config = readConfig();
    const modules = config.modules;

    const modulePromises = modules.map(entry => {
        const { moduleName: module, sourceMode } = parseModuleEntry(entry);
        if (!module) return null;

        const urls = getPackageJsonUrls(module, sourceMode);

        return fetchFirstUrl(urls)
            .then(({ data: moduleJson, rateLimited, resolvedUrl }) => {
                const splitData = [
                    module.substring(0, module.indexOf('/')),
                    module.substring(module.indexOf('/') + 1)
                ];
                const moduleMetadata = { name: splitData[1], type: splitData[0] };

                const usedMode = rateLimited ? 'cdn-fallback' : sourceMode;
                logBus.log('INFO', 'moduleLoader', 'Package.json resolved', {
                    module: module,
                    configuredMode: sourceMode,
                    usedMode: usedMode,
                    rateLimited: rateLimited || false,
                    packageJsonUrl: resolvedUrl
                });

                let versionedModule = module;
                if (moduleMetadata.type === 'gh') {
                    versionedModule = module.includes('@') ? module : module + '@main';
                } else if (moduleJson.version) {
                    versionedModule = module + '@' + moduleJson.version;
                }

                const proxyBase = 'http://127.0.0.1:8081/module/' + encodeURIComponent(versionedModule);
                const appProxyUrl = proxyBase + '/' + moduleJson.appPath + '?sourceMode=' + sourceMode;

                logBus.log('INFO', 'moduleLoader', 'Module app URL resolved', {
                    module: module,
                    appPath: appProxyUrl,
                    packageType: moduleJson.packageType || 'app'
                });

                const base = {
                    fullName: module,
                    versionedFullName: versionedModule,
                    appName: moduleJson.appName,
                    version: moduleJson.version,
                    name: moduleMetadata.name,
                    keys: moduleJson.keys || [],
                    moduleType: moduleMetadata.type,
                    description: moduleJson.description,
                    serviceFile: moduleJson.serviceFile,
                    sourceMode,
                    rateLimited: rateLimited || false
                };

                if (moduleJson.packageType === 'app') {
                    return Object.assign({}, base, { appPath: appProxyUrl, packageType: 'app' });
                }

                if (moduleJson.packageType === 'mods') {
                    return Object.assign({}, base, {
                        appPath: moduleJson.websiteURL,
                        packageType: 'mods',
                        tizenAppId: moduleJson.tizenAppId,
                        mainFile: moduleJson.main,
                        evaluateScriptOnDocumentStart: moduleJson.evaluateScriptOnDocumentStart
                    });
                }

                return {
                    appName: 'Unknown Module',
                    name: moduleMetadata.name,
                    fullName: module,
                    appPath: '',
                    keys: [],
                    moduleType: moduleMetadata.type,
                    packageType: 'app',
                    sourceMode,
                    rateLimited: false,
                    description: 'Unknown module ' + module + '. Please check the module name and try again.'
                };
            })
            .catch(function(e) {
                logBus.log('ERROR', 'moduleLoader', 'Failed to load module', { module: module, error: e.message });
                const splitData = [
                    module.substring(0, module.indexOf('/')),
                    module.substring(module.indexOf('/') + 1)
                ];
                return {
                    appName: 'Unknown Module',
                    name: splitData[1],
                    fullName: module,
                    appPath: '',
                    keys: [],
                    moduleType: splitData[0],
                    packageType: 'app',
                    sourceMode,
                    rateLimited: !!e.rateLimited,
                    description: e.rateLimited
                        ? 'GitHub rate limit hit for ' + module + '. Try again later or switch to CDN mode.'
                        : 'Unknown module ' + module + '. Please check the module name and try again.'
                };
            });
    }).filter(Boolean);

    return Promise.all(modulePromises);
}

module.exports = loadModules;
