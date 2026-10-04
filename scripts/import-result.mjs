// Owner-only import. Public POSTs always require a full comparison history.
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { IMAGES, CATALOG_VERSION, TOTAL_PAIRS } from '../assets/catalog.js';
import { MODEL, normalizeUsername } from '../assets/ranking.js';
import { normalizeResult, normalizeResults } from '../assets/results-data.js';

export function makeScreenshotResult(input) {
  if (!/T\d\d:\d\d.*(?:Z|[+-]\d\d:\d\d)$/.test(input.completedAt || '') || !Number.isFinite(Date.parse(input.completedAt))) throw new Error('Use an ISO completion time with a timezone.');
  const record = normalizeResult({
    id: input.id || randomUUID(), username: normalizeUsername(input.username),
    completedAt: new Date(input.completedAt).toISOString(), catalogVersion: CATALOG_VERSION, model: MODEL,
    comparisonCount: TOTAL_PAIRS, provenance: { kind: 'manual', source: 'screenshot',
      ...(input.endpointAccuracy !== undefined ? { intervals: 'estimated-from-screenshot', endpointAccuracy: input.endpointAccuracy } : {}) },
    rankings: input.rankings?.map((row) => ({ id: row.id, elo: row.elo, uncertainty: null,
      wins: row.wins ?? null, count: row.count ?? null, ...(row.estimatedInterval ? { estimatedInterval: row.estimatedInterval } : {}) })),
  });
  if (!record || record.rankings.length !== IMAGES.length) throw new Error('Supply all 17 unique character IDs and integer screenshot scores. Leave unshown statistics blank.');
  return record;
}
export async function importScreenshotResult(input, directory) {
  const record = makeScreenshotResult(input), indexPath = resolve(directory, 'index.json');
  const raw = JSON.parse(await readFile(indexPath, 'utf8'));
  if (!Array.isArray(raw) || raw.some((row) => !normalizeResult(row))) throw new Error('Repair the results index before importing.');
  const existing = raw.find((row) => row.id.toLowerCase() === record.id.toLowerCase());
  if (existing && JSON.stringify(normalizeResult(existing)) !== JSON.stringify(record)) throw new Error('This result ID already exists with different data.');
  const recordPath = resolve(directory, `${record.id.toLowerCase()}.json`);
  try {
    const saved = JSON.parse(await readFile(recordPath, 'utf8'));
    if (JSON.stringify(saved) !== JSON.stringify(record)) throw new Error('This result file already exists with different data.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(directory, { recursive: true });
  async function atomicWrite(path, value) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, path);
  }
  await atomicWrite(recordPath, record);
  await atomicWrite(indexPath, normalizeResults([...raw, record]));
  return record;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/import-result.mjs input.json [results-directory]');
  const input = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'));
  const directory = process.argv[3] ? resolve(process.argv[3]) : fileURLToPath(new URL('../results/', import.meta.url));
  const record = await importScreenshotResult(input, directory);
  console.log(`Prepared ${record.username}, result code ${record.resultCode}. Review locally before committing.`);
}
