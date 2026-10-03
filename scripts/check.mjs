import { access, readFile } from 'node:fs/promises';
import { IMAGES, TOTAL_PAIRS } from '../assets/catalog.js';
import { normalizeResult } from '../assets/results-data.js';
for (const page of ['index.html', 'gallery.html', 'results.html']) await access(new URL(`../${page}`, import.meta.url));
for (const image of IMAGES) await access(new URL(`../showcase/${image.file}`, import.meta.url));
const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
if (config.resultsApiUrl) {
  const url = new URL(config.resultsApiUrl);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Use HTTPS for the results API.');
}
const index = JSON.parse(await readFile(new URL('../results/index.json', import.meta.url), 'utf8'));
if (!Array.isArray(index)) throw new Error('Results index must be an array.');
if (index.some((item) => !normalizeResult(item))) throw new Error('Participant rankings must have valid session IDs and complete ratings.');
console.log(`Checked 3 public pages, ${IMAGES.length} showcase assets, ${TOTAL_PAIRS} pairs, configuration and participant results index.`);
