"use strict";

function parseModule(fullName) {
    const firstSlash = fullName.indexOf('/');
    if (firstSlash === -1) return { type: '', name: fullName, branch: null };
    const type = fullName.substring(0, firstSlash);
    let name = fullName.substring(firstSlash + 1);
    let branch = null;

    if (type === 'gh') {
        const secondSlash = name.indexOf('/');
        if (secondSlash !== -1) {
            const repoAndBranch = name.substring(secondSlash + 1);
            const atIdx = repoAndBranch.indexOf('@');
            if (atIdx !== -1) {
                branch = repoAndBranch.substring(atIdx + 1);
                name = name.substring(0, secondSlash + 1 + atIdx);
            }
        }
    }

    return { type, name, branch };
}

function normalizeModulePath(path) {
    if (!path) return '';
    return path.replace(/^\/+/, '');
}

function getPackageJsonUrls(fullName, sourceMode) {
    const meta = parseModule(fullName);

    if (sourceMode === 'direct') {
        if (meta.type === 'gh') {
            if (meta.branch) {
                return [
                    `https://raw.githubusercontent.com/${meta.name}/refs/heads/${meta.branch}/package.json`,
                    `https://raw.githubusercontent.com/${meta.name}/${meta.branch}/package.json`,
                    // CDN fallback in case raw.githubusercontent.com TLS fails (e.g. Node.js v4.4.3)
                    `https://cdn.jsdelivr.net/gh/${meta.name}@${meta.branch}/package.json`
                ];
            }
            return [
                `https://raw.githubusercontent.com/${meta.name}/refs/heads/main/package.json`,
                `https://raw.githubusercontent.com/${meta.name}/main/package.json`,
                `https://raw.githubusercontent.com/${meta.name}/refs/heads/master/package.json`,
                `https://raw.githubusercontent.com/${meta.name}/master/package.json`,
                // CDN fallbacks in case raw.githubusercontent.com TLS fails (e.g. Node.js v4.4.3)
                `https://cdn.jsdelivr.net/gh/${meta.name}@main/package.json`,
                `https://cdn.jsdelivr.net/gh/${meta.name}@master/package.json`
            ];
        }
        if (meta.type === 'npm') {
            return [
                `https://unpkg.com/${meta.name}/package.json`,
                // CDN fallback
                `https://cdn.jsdelivr.net/npm/${meta.name}/package.json`
            ];
        }
    }

    // CDN (default)
    if (meta.type === 'gh') {
        if (meta.branch) {
            return [`https://cdn.jsdelivr.net/gh/${meta.name}@${meta.branch}/package.json`];
        }
        return [
            `https://cdn.jsdelivr.net/gh/${meta.name}@main/package.json`,
            `https://cdn.jsdelivr.net/gh/${meta.name}@master/package.json`
        ];
    }
    return [`https://cdn.jsdelivr.net/${fullName}/package.json`];
}

function buildModuleFileUrl(fullName, sourceMode, filePath, branch) {
    const meta = parseModule(fullName);
    const normalizedPath = normalizeModulePath(filePath);
    const effectiveBranch = branch || meta.branch || 'main';

    if (sourceMode === 'direct') {
        if (meta.type === 'gh') {
            return `https://raw.githubusercontent.com/${meta.name}/refs/heads/${effectiveBranch}/${normalizedPath}`;
        }
        if (meta.type === 'npm') {
            return `https://unpkg.com/${meta.name}/${normalizedPath}`;
        }
    }

    if (meta.type === 'gh') {
        return `https://cdn.jsdelivr.net/gh/${meta.name}@${effectiveBranch}/${normalizedPath}`;
    }
    return `https://cdn.jsdelivr.net/${fullName}/${normalizedPath}`;
}

module.exports = { parseModule, getPackageJsonUrls, buildModuleFileUrl };