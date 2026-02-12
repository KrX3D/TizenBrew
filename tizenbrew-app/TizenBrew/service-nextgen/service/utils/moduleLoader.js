const { readConfig } = require('./configuration.js');
const fetch = require('node-fetch');

function loadModules() {
    const config = readConfig();
    const modules = config.modules;

    const modulePromises = modules.map(module => {
        // Bypass jsDelivr cache for package.json to detect updates
        const cacheBuster = `?t=${Date.now()}`;
        let url = `https://cdn.jsdelivr.net/${module}/package.json${cacheBuster}`;

        const lowerModule = module.toLowerCase();
        // If it's a GitHub module, use raw.githubusercontent.com for instant updates
        if (lowerModule.startsWith('gh/') || lowerModule.startsWith('github/')) {
            const parts = module.split('/');
            if (parts.length >= 3) {
                const user = parts[1];
                const repo = parts[2];
                url = `https://raw.githubusercontent.com/${user}/${repo}/main/package.json${cacheBuster}`;
            }
        }

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
                if (moduleJson.packageType === 'app') {
                    // Use versioned URL for assets to bypass jsDelivr caching on the repo path
                    const versionedModule = moduleJson.version ? `${module}@${moduleJson.version}` : module;
                    moduleData = {
                        fullName: module,
                        appName: moduleJson.appName,
                        version: moduleJson.version,
                        name: moduleMetadata.name,
                        appPath: `http://127.0.0.1:8081/module/${encodeURIComponent(versionedModule)}/${moduleJson.appPath}`,
                        keys: moduleJson.keys ? moduleJson.keys : [],
                        moduleType: moduleMetadata.type,
                        packageType: moduleJson.packageType,
                        description: moduleJson.description,
                        serviceFile: moduleJson.serviceFile
                    }
                } else if (moduleJson.packageType === 'mods') {
                    moduleData = {
                        fullName: module,
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