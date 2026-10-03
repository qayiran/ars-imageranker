import { mkdir, rm, cp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = new URL('../_site/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const path of ['index.html', 'gallery.html', 'results.html', 'config.json', '.nojekyll', 'assets', 'showcase', 'results']) {
  await cp(new URL(`../${path}`, import.meta.url), new URL(path, out), { recursive: true });
}
await writeFile(new URL('robots.txt', out), 'User-agent: *\nDisallow: /results/\n');
console.log(`Static Pages artifact ready: ${root}_site`);
