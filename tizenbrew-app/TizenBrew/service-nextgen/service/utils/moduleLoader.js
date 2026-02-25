const { readConfig } = require('./configuration.js');
const fetch = require('node-fetch');

function parseModuleEntry(entry) {
    if (typeof entry === 'string') {
        return {
            moduleName: entry,
            sourceMode: 'cdn'
        };
    }

    if (entry && typeof entry === 'object') {
        return {
            moduleName: entry.name || entry.module || '',
            sourceMode: entry.sourceMode === 'direct' ? 'direct' : 'cdn'
        };
    }

    return {
        moduleName: '',
        sourceMode: 'cdn'
    };
}

function buildPackageUrl(moduleName, sourceMode, cacheBuster) {
    if (moduleName.startsWith('gh/')) {
        const parts = moduleName.split('/');
        if (parts.length >= 3) {
            const user = parts[1];
            const repo = parts[2];
            if (sourceMode === 'direct') {
                return `https://raw.githubusercontent.com/${user}/${repo}/main/package.json${cacheBuster}`;
            }
            return `https://cdn.jsdelivr.net/gh/${user}/${repo}/package.json${cacheBuster}`;
        }
    }

    const npmName = moduleName.replace(/^npm\//, '');
    if (sourceMode === 'direct') {
        return `https://unpkg.com/${npmName}/package.json${cacheBuster}`;
    }
    return `https://cdn.jsdelivr.net/${moduleName}/package.json${cacheBuster}`;
}

function loadModules() {
    const config = readConfig();
    const modules = config.modules;

    const modulePromises = modules.map(entry => {
        const { moduleName: module, sourceMode } = parseModuleEntry(entry);
        if (!module) return null;

        const cacheBuster = `?t=${Date.now()}`;
        const url = buildPackageUrl(module, sourceMode, cacheBuster);

        return fetch(url)
            .then(res => res.json())
            .then(moduleJson => {
                let moduleData;
                const splitData = [
                    module.substring(0, module.indexOf('/')),
                    module.substring(module.indexOf('/') + 1)
                ];
                const moduleMetadata = {
                    name: splitData[1],
                    type: splitData[0]
                }
                // Do not append @version/@main to module identifiers.
                // Some environments and module paths break when version suffixes are used.
                const versionedModule = module;

                const appProxyUrl = `http://127.0.0.1:8081/module/${encodeURIComponent(versionedModule)}/${moduleJson.appPath}?sourceMode=${sourceMode}`;

                if (moduleJson.packageType === 'app') {
                    moduleData = {
                        fullName: module,
                        versionedFullName: versionedModule,
                        appName: moduleJson.appName,
                        version: moduleJson.version,
                        name: moduleMetadata.name,
                        appPath: appProxyUrl,
                        keys: moduleJson.keys ? moduleJson.keys : [],
                        moduleType: moduleMetadata.type,
                        packageType: moduleJson.packageType,
                        description: moduleJson.description,
                        serviceFile: moduleJson.serviceFile,
                        sourceMode
                    }
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
                        evaluateScriptOnDocumentStart: moduleJson.evaluateScriptOnDocumentStart,
                        sourceMode
                    }
                } else return {
                    appName: 'Unknown Module',
                    name: moduleMetadata.name,
                    fullName: module,
                    appPath: '',
                    keys: [],
                    moduleType: moduleMetadata.type,
                    packageType: 'app',
                    sourceMode,
                    description: `Unknown module ${module}. Please check the module name and try again.`
                }

                return moduleData;
            })
            .catch(e => {
                console.error(e);

                const splitData = [
                    module.substring(0, module.indexOf('/')),
                    module.substring(module.indexOf('/') + 1)
                ];

                const moduleMetadata = {
                    name: splitData[1],
                    type: splitData[0]
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
                    description: `Unknown module ${module}. Please check the module name and try again.`
                }
            });
    }).filter(Boolean);

    return Promise.all(modulePromises)
        .then(modules => {
            return modules;
        });
}

module.exports = loadModules;
