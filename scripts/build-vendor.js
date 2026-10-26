// Wraps citeproc-js (CommonJS) as a browser ES module for the formatting worker.
// Run with: npm run vendor (also part of npm run setup)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const pkg = require('citeproc/package.json');
const src = fs.readFileSync(require.resolve('citeproc'), 'utf8');
const out = `// citeproc-js ${pkg.version} (CPAL-1.0 / AGPL-3.0, https://github.com/Juris-M/citeproc-js)
// Wrapped as an ES module by scripts/build-vendor.js — do not edit.
const module = { exports: {} };
${src}
export default module.exports;
`;
fs.mkdirSync(path.join(root, 'public', 'vendor'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'vendor', 'citeproc.js'), out);
console.log(`citeproc ${pkg.version} → public/vendor/citeproc.js (${(out.length / 1024) | 0} KB)`);
