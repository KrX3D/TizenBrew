"use strict";

function parseModule(fullName) {
    const firstSlash = fullName.indexOf('/');
    if (firstSlash === -1) {
        return { type: '', name: fullName };
    }

    return {
        type: fullName.substring(0, firstSlash),
        name: fullName.substring(firstSlash + 1)
    };
}

function normalizeModulePath(path) {
    if (!path) return '';
    return path.replace(/^\/+/, '');
}

function getPackageJsonUrls(fullName, sourceMode, branch) {
    const moduleMeta = parseModule(fullName);

    if (sourceMode !== 'direct') {
        return [`https://cdn.jsdelivr.net/${fullName}/package.json`];
    }

    if (moduleMeta.type === 'gh') {
        const targetBranch = branch || 'main';
        return [
            `https://raw.githubusercontent.com/${moduleMeta.name}/${targetBranch}/package.json`,
            `https://raw.githubusercontent.com/${moduleMeta.name}/master/package.json`
        ];
    }

    if (moduleMeta.type === 'npm') {
        return [
            `https://unpkg.com/${moduleMeta.name}/package.json`
        ];
    }

    return [`https://cdn.jsdelivr.net/${fullName}/package.json`];
}

function buildModuleFileUrl(fullName, sourceMode, filePath, branch) {
    const moduleMeta = parseModule(fullName);
    const normalizedPath = normalizeModulePath(filePath);

    if (sourceMode === 'direct') {
        if (moduleMeta.type === 'gh') {
            return `https://raw.githubusercontent.com/${moduleMeta.name}/${branch || 'main'}/${normalizedPath}`;
        }

        if (moduleMeta.type === 'npm') {
            return `https://unpkg.com/${moduleMeta.name}/${normalizedPath}`;
        }
    }

    return `https://cdn.jsdelivr.net/${fullName}/${normalizedPath}`;
}

module.exports = {
    parseModule,
    getPackageJsonUrls,
    buildModuleFileUrl
};
