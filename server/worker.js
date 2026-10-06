import { resultCode } from '../assets/result-identity.js';
import { validateSubmission, summaryFrom } from '../assets/ranking.js';
import { normalizeResult } from '../assets/results-data.js';

const MAX_BODY_BYTES = 64 * 1024;
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function base64Encode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64Decode(text) {
  const binary = atob(text.replaceAll('\n', ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}
async function readBody(request) {
  if (!request.body) throw new HttpError(400, 'A completed comparison session is required.');
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new HttpError(413, 'This submission is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'Send a valid JSON comparison session.'); }
}
function checkEnvironment(env) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO || !env.GITHUB_BRANCH || !env.ALLOWED_ORIGIN) throw new HttpError(503, 'The site owner has not configured repository saving yet.');
  if (!/^[\w.-]+$/.test(env.GITHUB_OWNER) || !/^[\w.-]+$/.test(env.GITHUB_REPO)) throw new HttpError(503, 'The repository configuration is invalid.');
}
async function github(env, path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}${path}`, {
    ...options,
    headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'showcase-image-ranker', 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(15000),
  });
  return response;
}
async function readFile(env, path) {
  const response = await github(env, `/contents/${path}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new HttpError(503, 'The repository could not be read. The site owner should check the service configuration or GitHub API limits.');
  const metadata = await response.json();
  if (!metadata.sha || metadata.type !== 'file') throw new HttpError(503, 'The repository results path is not a file.');
  let content;
  try {
    if (metadata.encoding === 'base64' && metadata.content) content = JSON.parse(base64Decode(metadata.content));
    else {
      // GitHub omits inline content above 1 MB. Read the exact blob SHA as raw.
      const raw = await github(env, `/git/blobs/${metadata.sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
      if (!raw.ok) throw new Error('Unreadable blob');
      content = await raw.json();
    }
  } catch { throw new HttpError(503, 'The repository contains an unreadable results file.'); }
  return { sha: metadata.sha, content };
}
async function writeFile(env, path, data, sha, message) {
  const response = await github(env, `/contents/${path}`, {
    method: 'PUT', body: JSON.stringify({ message, content: base64Encode(`${JSON.stringify(data, null, 2)}\n`), branch: env.GITHUB_BRANCH, ...(sha ? { sha } : {}) }),
  });
  if ([409, 422].includes(response.status)) return null;
  if (!response.ok) throw new HttpError(503, 'GitHub could not save this result. The site owner should check repository write permissions, branch rules, or API limits.');
  const result = await response.json();
  return { sha: result.commit.sha, url: result.commit.html_url };
}
function sameSubmission(a, b) {
  return a.id === b.id && a.username === b.username && a.model === b.model && a.catalogVersion === b.catalogVersion && JSON.stringify(a.comparisons) === JSON.stringify(b.comparisons);
}
function validateIndex(file) {
  if (file && !Array.isArray(file.content)) throw new HttpError(503, 'The repository results index is invalid.');
  return file?.content || [];
}
export async function saveResult(env, submission) {
  const path = `results/${submission.id.toLowerCase()}.json`;
  let stored = await readFile(env, path), record, resultCommit;
  if (stored) {
    if (!sameSubmission(stored.content, submission)) throw new HttpError(409, 'This session ID already belongs to a different result.');
    record = stored.content;
  } else {
    record = { ...submission, ...summaryFrom(submission) };
    for (let attempt = 0; attempt < 5; attempt++) {
      resultCommit = await writeFile(env, path, record, undefined, `Save showcase ranking ${submission.id}`);
      if (resultCommit) break;
      stored = await readFile(env, path);
      if (stored) {
        if (!sameSubmission(stored.content, submission)) throw new HttpError(409, 'This session ID already belongs to a different result.');
        record = stored.content; break;
      }
    }
    if (!resultCommit && !stored) throw new HttpError(503, 'The repository is busy. Your session is safe to retry.');
  }
  // One immutable record per session, plus a public summary index. SHA-based
  // retries preserve concurrent participants and repair a partially saved result.
  for (let attempt = 0; attempt < 6; attempt++) {
    const file = await readFile(env, 'results/index.json');
    const index = validateIndex(file);
    if (index.some((item) => item.id === record.id)) {
      return { saved: true, id: record.id, completedAt: record.completedAt, ...(resultCommit ? { commitUrl: resultCommit.url } : {}) };
    }
    const summary = { id: record.id, resultCode: resultCode(record.id), username: record.username, completedAt: record.completedAt, model: record.model, catalogVersion: record.catalogVersion, comparisonCount: record.comparisonCount, rankings: record.rankings };
    const updated = [summary, ...index].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    const commit = await writeFile(env, 'results/index.json', updated, file?.sha, `Index showcase ranking ${record.id}`);
    if (commit) return { saved: true, id: record.id, completedAt: record.completedAt, commitUrl: commit.url };
  }
  throw new HttpError(503, 'Your ranking file was saved, but the shared list is busy. Retry to finish adding it to the list.');
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const origins = (env.ALLOWED_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean);
    const allowed = origin && origins.includes(origin);
    const cors = { 'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(allowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'Retry-After' } : {}) };
    const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', ...headers } });
    if (origin && !allowed) return json({ error: 'This website is not allowed to use the results service.' }, 403);
    if (request.method === 'OPTIONS') {
      if (!allowed) return json({ error: 'An allowed website origin is required.' }, 403);
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    }
    const url = new URL(request.url);
    const recordPath = /^\/results\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(url.pathname);
    if (url.pathname !== '/results' && !recordPath) return json({ error: 'Not found.' }, 404);
    try {
      checkEnvironment(env);
      if (recordPath) {
        if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405, { Allow: 'GET, OPTIONS' });
        const id = recordPath[1].toLowerCase();
        const file = await readFile(env, `results/${id}.json`);
        if (!file) return json({ error: 'This result could not be found.' }, 404);
        const summary = normalizeResult(file.content);
        if (!summary || summary.id.toLowerCase() !== id) throw new HttpError(503, 'The saved result is invalid.');
        // Serve only public result fields and validated choices, never arbitrary
        // repository metadata. Screenshot imports have no recovered choices.
        const rankings = summary.rankings.map(({ id, name, elo, uncertainty, wins, count, estimatedInterval }) =>
          ({ id, name, elo, uncertainty, wins, count, ...(estimatedInterval ? { estimatedInterval } : {}) }));
        if (summary.provenance) return json({ ...summary, rankings });
        let submission;
        try { submission = validateSubmission(file.content); }
        catch { throw new HttpError(503, 'The saved comparison history is invalid.'); }
        return json({ ...summary, rankings, comparisons: submission.comparisons });
      }
      if (request.method === 'GET') {
        const index = validateIndex(await readFile(env, 'results/index.json'));
        return json(index);
      }
      if (request.method !== 'POST') return json({ error: 'Use GET or POST.' }, 405);
      if (!allowed) return json({ error: 'An allowed website origin is required.' }, 403);
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Use application/json.' }, 415);
      // Optional Workers native rate limit. Its short-lived key is never written
      // to GitHub, and this application never logs requests or IP addresses.
      if (env.SUBMISSIONS_LIMITER) {
        const { success } = await env.SUBMISSIONS_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
        if (!success) return json({ error: 'Too many save attempts. Wait a minute and retry.' }, 429, { 'Retry-After': '60' });
      }
      let data;
      try { data = validateSubmission(await readBody(request)); } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, error.message);
      }
      return json(await saveResult(env, data), 201);
    } catch (error) {
      // Do not expose GitHub responses, tokens, network metadata, or stacks.
      return json({ error: error instanceof HttpError ? error.message : 'The results service is temporarily unavailable. Retry shortly.' }, error instanceof HttpError ? error.status : 503);
    }
  },
};
