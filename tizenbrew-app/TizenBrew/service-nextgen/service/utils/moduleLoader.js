const { readConfig } = require('./configuration.js');
const fetch = require('node-fetch');

function parseModuleEntry(entry) {
    if (typeof entry === 'string') {
        return {
            name: entry,
            sourceMode: 'cdn'
        };
    }

    if (entry && typeof entry === 'object') {
        return {
            name: entry.name || '',
            sourceMode: entry.sourceMode === 'direct' ? 'direct' : 'cdn'
        };
    }

    return { name: '', sourceMode: 'cdn' };
}

function buildPackageJsonUrl(moduleName, sourceMode) {
    const cacheBuster = `?t=${Date.now()}`;

    if (moduleName.startsWith('gh/')) {
        const repo = moduleName.substring(3);
        if (sourceMode === 'direct') {
            return `https://raw.githubusercontent.com/${repo}/main/package.json${cacheBuster}`;
        }

        return `https://cdn.jsdelivr.net/gh/${repo}/package.json${cacheBuster}`;
    }

    if (moduleName.startsWith('npm/')) {
        const npmName = moduleName.substring(4);
        if (sourceMode === 'direct') {
            return `https://unpkg.com/${npmName}/package.json${cacheBuster}`;
        }

        return `https://cdn.jsdelivr.net/npm/${npmName}/package.json${cacheBuster}`;
    }

    return `https://cdn.jsdelivr.net/${moduleName}/package.json${cacheBuster}`;
}

function loadModules() {
    const config = readConfig();
    const modules = config.modules || [];

    const modulePromises = modules.map(entry => {
        const parsedEntry = parseModuleEntry(entry);
        const module = parsedEntry.name;
        const sourceMode = parsedEntry.sourceMode;
        const url = buildPackageJsonUrl(module, sourceMode);

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
                const versionedModule = module;

                if (moduleJson.packageType === 'app') {
                    moduleData = {
                        fullName: module,
                        versionedFullName: versionedModule,
                        sourceMode,
                        appName: moduleJson.appName,
                        version: moduleJson.version,
                        name: moduleMetadata.name,
                        appPath: `http://127.0.0.1:8081/module/${encodeURIComponent(versionedModule)}/${moduleJson.appPath}?sourceMode=${sourceMode}`,
                        keys: moduleJson.keys ? moduleJson.keys : [],
                        moduleType: moduleMetadata.type,
                        packageType: moduleJson.packageType,
                        description: moduleJson.description,
                        serviceFile: moduleJson.serviceFile
                    }
                } else if (moduleJson.packageType === 'mods') {
                    moduleData = {
                        fullName: module,
                        versionedFullName: versionedModule,
                        sourceMode,
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
                    }
                } else return {
                    appName: 'Unknown Module',
                    name: moduleMetadata.name,
                    fullName: module,
                    sourceMode,
                    appPath: '',
                    keys: [],
                    moduleType: moduleMetadata.type,
                    packageType: 'app',
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
                    sourceMode,
                    appPath: '',
                    keys: [],
                    moduleType: moduleMetadata.type,
                    packageType: 'app',
                    description: `Unknown module ${module}. Please check the module name and try again.`
                }
            });
    });

    return Promise.all(modulePromises)
        .then(modules => {
            return modules;
        });
}

module.exports = loadModules;
