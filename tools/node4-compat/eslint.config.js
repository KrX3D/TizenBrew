// Flags runtime APIs that do not exist in Node 4.4.3, the Node version of the
// TizenBrew service on the TV. Babel only rewrites syntax, so calls like
// Buffer.from, TextDecoder, Object.hasOwn or String#padEnd survive the build
// and only throw on the TV. Syntax rules are left off on purpose.
'use strict';

const n = require('eslint-plugin-n');
const esx = require('eslint-plugin-es-x');

const NODE_VERSION = '4.4.3';

// es-x rules for built-ins added in ES2016 and later (no syntax rules).
const ES_BUILTIN_RULES = [
    // ES2016
    'no-array-prototype-includes',
    // ES2017
    'no-atomics', 'no-object-entries', 'no-object-getownpropertydescriptors',
    'no-object-values', 'no-shared-array-buffer', 'no-string-prototype-padstart-padend',
    // ES2018
    'no-promise-prototype-finally', 'no-regexp-lookbehind-assertions',
    'no-regexp-named-capture-groups', 'no-regexp-unicode-property-escapes',
    // ES2019
    'no-array-prototype-flat', 'no-object-fromentries',
    'no-string-prototype-trimstart-trimend', 'no-symbol-prototype-description',
    // ES2020
    'no-bigint', 'no-global-this', 'no-promise-all-settled', 'no-string-prototype-matchall',
    // ES2021
    'no-promise-any', 'no-string-prototype-replaceall', 'no-weakrefs',
    // ES2022
    'no-array-string-prototype-at', 'no-error-cause', 'no-object-hasown',
    // ES2023
    'no-array-prototype-findlast-findlastindex', 'no-array-prototype-toreversed',
    'no-array-prototype-tosorted', 'no-array-prototype-tospliced', 'no-array-prototype-with',
    // ES2024 and later
    'no-arraybuffer-prototype-transfer', 'no-atomics-waitasync', 'no-object-map-groupby',
    'no-promise-withresolvers', 'no-resizable-and-growable-arraybuffers',
    'no-string-prototype-iswellformed-towellformed', 'no-set-prototype-difference',
    'no-set-prototype-intersection', 'no-set-prototype-isdisjointfrom',
    'no-set-prototype-issubsetof', 'no-set-prototype-issupersetof',
    'no-set-prototype-symmetricdifference', 'no-set-prototype-union'
];

const esRules = {};
for (const rule of ES_BUILTIN_RULES) {
    esRules['es-x/' + rule] = 'error';
}
// "aggressive" reports x.padEnd() etc. without type info. Array#includes is the
// exception: String#includes is ES2015 and fine on Node 4, and the two cannot
// be told apart without types, so only provable array cases are reported.
esRules['es-x/no-array-prototype-includes'] = ['error', { aggressive: false }];
// Same for Symbol#description: plain objects with a "description" key are common.
esRules['es-x/no-symbol-prototype-description'] = ['error', { aggressive: false }];

module.exports = [
    {
        files: ['**/*.js'],
        ignores: ['**/node_modules/**', '**/dist/**', '**/transpiled/**'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            // Node globals must be declared, otherwise Buffer, TextDecoder,
            // URL etc. are not tracked by the n rules.
            globals: n.configs['flat/recommended-script'].languageOptions.globals
        },
        linterOptions: {
            reportUnusedDisableDirectives: 'off'
        },
        plugins: { n, 'es-x': esx },
        settings: {
            node: { version: NODE_VERSION },
            'es-x': { aggressive: true }
        },
        rules: Object.assign({
            // Node APIs: Buffer.from/alloc, TextDecoder, URL, fs.promises, ...
            'n/no-unsupported-features/node-builtins': ['error', {
                version: NODE_VERSION,
                allowExperimental: false
            }],
            // ES globals and statics: Reflect, Proxy, Object.values, ...
            'n/no-unsupported-features/es-builtins': ['error', { version: NODE_VERSION }]
        }, esRules)
    }
];
