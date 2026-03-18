const { readConfig, parseModuleEntry } = require('./configuration.js');
const { getPackageJsonUrls } = require('./moduleSource.js');
const fetch = require('node-fetch');

function fetchFirstUrl(urls) {
    if (urls.length === 0) return Promise.reject(new Error('No URLs to try'));
    return fetch(urls[0])
        .then(res => {
            if (!res.ok && urls.length > 1) return fetchFirstUrl(urls.slice(1));
            return res.json();
        })
        .catch(err => {
            if (urls.length > 1) return fetchFirstUrl(urls.slice(1));
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
            .then(moduleJson => {
                const splitData = [
                    module.substring(0, module.indexOf('/')),
                    module.substring(module.indexOf('/') + 1)
                ];
                const moduleMetadata = { name: splitData[1], type: splitData[0] };

                // For versioned name: if user specified a branch (gh/user/repo@branch),
                // keep the full string as-is. For npm use package version. For plain
                // gh/ with no branch, tag with @main for cache-busting.
                let versionedModule = module;
                if (moduleMetadata.type === 'gh') {
                    versionedModule = module.includes('@') ? module : `${module}@main`;
                } else if (moduleJson.version) {
                    versionedModule = `${module}@${moduleJson.version}`;
                }

                // Proxy URL — passes sourceMode so the service proxy picks the right upstream
                const proxyBase = `http://127.0.0.1:8081/module/${encodeURIComponent(versionedModule)}`;
                const appProxyUrl = `${proxyBase}/${moduleJson.appPath}?sourceMode=${sourceMode}`;

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
                    sourceMode
                };

                if (moduleJson.packageType === 'app') {
                    return { ...base, appPath: appProxyUrl, packageType: 'app' };
                }

                if (moduleJson.packageType === 'mods') {
                    return {
                        ...base,
                        appPath: moduleJson.websiteURL,
                        packageType: 'mods',
                        tizenAppId: moduleJson.tizenAppId,
                        mainFile: moduleJson.main,
                        evaluateScriptOnDocumentStart: moduleJson.evaluateScriptOnDocumentStart
                    };
                }

                // Unknown package type — show as error card
                return {
                    appName: 'Unknown Module',
                    name: moduleMetadata.name,
                    fullName: module,
                    appPath: '',
                    keys: [],
                    moduleType: moduleMetadata.type,
                    packageType: 'app',
                    sourceMode,
                    description: `Unknown module ${module}. Please check the module name and try again.`
                };
            })
            .catch(e => {
                console.error(e);
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
                    description: `Unknown module ${module}. Please check the module name and try again.`
                };
            });
    }).filter(Boolean);

    return Promise.all(modulePromises);
}

module.exports = loadModules;