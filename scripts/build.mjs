import { mkdir, rm, cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { fingerprintAssets, rewritePageAssets } from './asset-build.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = new URL('../_site/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(new URL('assets/', out), { recursive: true });
for (const path of ['config.json', '.nojekyll', 'showcase', 'results']) {
  await cp(new URL(`../${path}`, import.meta.url), new URL(path, out), { recursive: true });
}
const sources = new Map();
for (const file of await readdir(new URL('../assets/', import.meta.url), { withFileTypes: true })) {
  if (!file.isFile()) throw new Error(`Assets must be files: ${file.name}`);
  sources.set(file.name, await readFile(new URL(`../assets/${file.name}`, import.meta.url)));
}
const assets = fingerprintAssets(sources);
for (const { filename, content } of assets.values()) await writeFile(new URL(`assets/${filename}`, out), content);
const revision = createHash('sha256');
for (const page of ['index.html', 'gallery.html', 'results.html']) {
  const html = rewritePageAssets(await readFile(new URL(`../${page}`, import.meta.url), 'utf8'), assets);
  revision.update(html);
  await writeFile(new URL(page, out), html);
}
const manifest = Object.fromEntries([...assets].sort(([a], [b]) => a.localeCompare(b)).map(([name, asset]) => [name, `assets/${asset.filename}`]));
revision.update(JSON.stringify(manifest));
await writeFile(new URL('asset-manifest.json', out), `${JSON.stringify({ version: revision.digest('hex').slice(0, 12), assets: manifest }, null, 2)}\n`);
await writeFile(new URL('robots.txt', out), 'User-agent: *\nDisallow: /results/\n');
console.log(`Static Pages artifact ready: ${root}_site (${assets.size} versioned assets)`);
