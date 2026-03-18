"use strict";

// Splits "gh/user/repo" or "npm/@scope/pkg" into { type, name }
function parseModule(fullName) {
    const firstSlash = fullName.indexOf('/');
    if (firstSlash === -1) return { type: '', name: fullName };
    return {
        type: fullName.substring(0, firstSlash),
        name: fullName.substring(firstSlash + 1)
    };
}

function normalizeModulePath(path) {
    if (!path) return '';
    return path.replace(/^\/+/, '');
}

// Returns the URL(s) to try for package.json
function getPackageJsonUrls(fullName, sourceMode) {
    const meta = parseModule(fullName);

    if (sourceMode === 'direct') {
        if (meta.type === 'gh') {
            return [
                `https://raw.githubusercontent.com/${meta.name}/main/package.json`,
                `https://raw.githubusercontent.com/${meta.name}/master/package.json`
            ];
        }
        if (meta.type === 'npm') {
            return [`https://unpkg.com/${meta.name}/package.json`];
        }
    }

    // CDN (default)
    return [`https://cdn.jsdelivr.net/${fullName}/package.json`];
}

// Returns the URL for a specific file inside a module
function buildModuleFileUrl(fullName, sourceMode, filePath, branch) {
    const meta = parseModule(fullName);
    const normalizedPath = normalizeModulePath(filePath);

    if (sourceMode === 'direct') {
        if (meta.type === 'gh') {
            return `https://raw.githubusercontent.com/${meta.name}/${branch || 'main'}/${normalizedPath}`;
        }
        if (meta.type === 'npm') {
            return `https://unpkg.com/${meta.name}/${normalizedPath}`;
        }
    }

    return `https://cdn.jsdelivr.net/${fullName}/${normalizedPath}`;
}

module.exports = { parseModule, getPackageJsonUrls, buildModuleFileUrl };