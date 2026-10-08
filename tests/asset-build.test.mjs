import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintAssets, rewritePageAssets } from '../scripts/asset-build.mjs';
const sources = () => new Map([
  ['app.js', "import { t } from './language.js';\nimport './theme.js';\nconsole.log(t('Results'));"],
  ['language.js', "import { words } from './translations.js';\nexport const t = key => words[key];"],
  ['translations.js', "export const words = { Results: 'Sonuçlar' };"],
  ['theme.js', "document.documentElement.dataset.theme = 'dark';"],
  ['style.css', '.ranked-artwork-grid{display:grid}'],
]);
test('changing a translation invalidates the complete import chain but leaves unrelated assets stable', () => {
  const before = fingerprintAssets(sources());
  const changed = sources(); changed.set('translations.js', "export const words = { Results: 'Results' };");
  const after = fingerprintAssets(changed);
  for (const name of ['translations.js', 'language.js', 'app.js']) assert.notEqual(before.get(name).filename, after.get(name).filename);
  for (const name of ['theme.js', 'style.css']) assert.equal(before.get(name).filename, after.get(name).filename);
  assert.ok(after.get('app.js').content.toString().includes(`'./${after.get('language.js').filename}'`));
  assert.ok(after.get('app.js').content.toString().includes(`'./${after.get('theme.js').filename}'`));
});
test('page references and every import resolve to emitted, deterministic assets under a Pages subdirectory', () => {
  const assets = fingerprintAssets(sources());
  assert.deepEqual(fingerprintAssets(sources()), assets);
  const html = rewritePageAssets('<script type="module" src="assets/app.js"></script><link href="assets/style.css" rel="stylesheet"><a href="gallery.html">Gallery</a>', assets);
  assert.ok(html.includes(`src="assets/${assets.get('app.js').filename}"`));
  assert.ok(html.includes(`href="assets/${assets.get('style.css').filename}"`));
  assert.ok(html.includes('href="gallery.html"'));
  const emitted = new Set([...assets.values()].map(({ filename }) => filename));
  for (const asset of assets.values()) for (const match of asset.content.toString().matchAll(/from '\.\/([^']+)'/g)) assert.ok(emitted.has(match[1]));
  assert.ok(new URL(`assets/${assets.get('app.js').filename}`, 'https://user.github.io/repo/').pathname.startsWith('/repo/assets/'));
});
test('missing modules and circular imports fail the build instead of shipping incomplete scripts', () => {
  assert.throws(() => fingerprintAssets(new Map([['app.js', "import './missing.js';"]])), /Missing imported asset/);
  assert.throws(() => fingerprintAssets(new Map([['a.js', "import './b.js';"], ['b.js', "import './a.js';"]])), /Circular asset imports/);
  assert.throws(() => rewritePageAssets('<script src="assets/missing.js"></script>', new Map()), /Unknown page asset/);
});
test('module-worker URLs are fingerprinted with their complete dependency chain', () => {
  const source = new Map([['app.js', "new Worker(new URL('./worker.js', import.meta.url), {type:'module'}); const data = new URL('../results/index.json', import.meta.url);"], ['worker.js', "import { fit } from './model.js'; self.onmessage=fit;"], ['model.js', 'export const fit=()=>1;']]);
  const before=fingerprintAssets(source);source.set('model.js','export const fit=()=>2;');const after=fingerprintAssets(source);
  for (const name of source.keys()) assert.notEqual(before.get(name).filename,after.get(name).filename);
  assert.ok(after.get('app.js').content.toString().includes(`new URL('./${after.get('worker.js').filename}', import.meta.url)`));
  assert.ok(after.get('app.js').content.toString().includes("new URL('../results/index.json', import.meta.url)"));
});
