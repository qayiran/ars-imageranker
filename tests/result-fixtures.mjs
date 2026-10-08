// Test-only recovered scores. Never copied into the public Pages artifact.
import { readFileSync } from 'node:fs';
export const manualFixture = JSON.parse(readFileSync(new URL('./fixtures/manual-result.json', import.meta.url), 'utf8'));
export function testResults() {
  return [...JSON.parse(readFileSync(new URL('../results/index.json', import.meta.url), 'utf8')), structuredClone(manualFixture)];
}
export async function mockStaticResults(context) {
  await context.route('**/config.json', route => route.fulfill({ json: { resultsApiUrl: '' } }));
  await context.route('**/results/index.json', route => route.fulfill({ json: testResults() }));
  await context.route(`**/results/${manualFixture.id}.json`, route => route.fulfill({ json: manualFixture }));
}
