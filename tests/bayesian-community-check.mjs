// Read-only browser checks against local files and an intercepted results service.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validCommunityResult } from '../assets/bayesian-community-data.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8000/_site';
const index=JSON.parse(await readFile(new URL('../results/index.json',import.meta.url),'utf8'));
const records=new Map(await Promise.all(index.map(async item=>[item.id,JSON.parse(await readFile(new URL(`../results/${item.id}.json`,import.meta.url),'utf8'))])));
const out='/tmp/ars-bayesian-check';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const errors=[];
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'});
 let fail=true, detailReads=0, workers=0, data=index;
 await context.route('**/config.json',route=>route.fulfill({json:{resultsApiUrl:'https://bayes.test'}}));
 await context.route('https://bayes.test/results',route=>route.fulfill({json:data}));
 await context.route('https://bayes.test/results/*',route=>{
  detailReads++;const id=route.request().url().split('/').at(-1);
  return route.fulfill(fail&&id===index[0].id?{status:503,json:{error:'Test outage'}}:{json:records.get(id)});
 });
 async function openForest(page) { if (!await page.locator('.leaderboard-plot').evaluate(n=>n.open)) await page.locator('.leaderboard-plot > summary').click(); }
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('worker',()=>workers++);
 await page.goto(`${base}/results.html?preview=bayesian#leaderboard`);
 await page.locator('.leaderboard-table').waitFor();
 assert.equal(await page.locator('.leaderboard-plot').evaluate(n=>n.open),false);
 assert.equal(detailReads,0);assert.equal(workers,0);
 assert.equal(await page.locator('#results-browser > #bayesian-community').count(),0);
 assert.equal(await page.locator('#global-leaderboard .leaderboard-plot #bayesian-community').count(),1);
 await openForest(page);
 await page.locator('.bayesian-retry').waitFor();assert.equal(await page.locator('.bayesian-plot svg').count(),0);assert.equal(await page.locator('#global-leaderboard .leaderboard-table tbody tr').count(),17);
 fail=false;await page.locator('.bayesian-retry').click();
 await page.waitForFunction(()=>document.querySelector('.bayesian-status[aria-busy]'));
 // Main thread and participant navigation remain responsive during fitting.
 await page.locator('#results-search').fill('no such nickname');assert.equal(await page.locator('.result-card').count(),0);await page.locator('#results-search').fill('');
 await page.locator(`.result-card[href="#${index[0].id}"]`).click();await page.locator('#public-ranking-detail').waitFor();
 await page.locator('.all-results-link').click();await openForest(page);
 await page.locator('.bayesian-table tbody tr').first().waitFor({state:'attached',timeout:120000});
 assert.equal(await page.locator('.bayesian-table tbody tr').count(),17);assert.equal(workers,1);
 const cache=await page.evaluate(()=>JSON.parse(localStorage.getItem('ars-bayesian-community-v1')));
 assert.ok(validCommunityResult(cache.result,index.length));assert.equal(cache.result.comparisonCount,index.length*136);
 assert.equal(await page.locator('.bayesian-plot .plot-value line').count(),51);
 assert.equal(await page.locator('#global-leaderboard svg').count(),1);
 assert.equal(await page.locator('.confidence-table').count(),0);
 assert.equal(await page.locator('.bayesian-method').evaluate(n=>n.open),false);
 assert.ok((await page.locator('.bayesian-plot desc').textContent()).includes('Bayesçi'));
 assert.equal(await page.locator('.bayesian-plot svg').evaluate(n=>/NaN|Infinity/.test(n.outerHTML)),false);
 await page.locator('.bayesian-table-details summary').click();await page.locator('.bayesian-method summary').click();
 await page.locator('.leaderboard-plot').screenshot({path:`${out}/dark-desktop-tr.png`});
 await page.locator('[data-language-picker]').selectOption('en');
 assert.equal(await page.locator('#bayesian-title').textContent(),'Global rating comparison');
 assert.ok((await page.locator('.bayesian-plot desc').textContent()).includes('95% credible'));
 assert.equal(await page.locator('.bayesian-table-details').getAttribute('open'),'');
 const before=detailReads;await page.reload();await page.locator('.leaderboard-table').waitFor();await openForest(page);await page.locator('.bayesian-table tbody tr').first().waitFor({state:'attached'});assert.equal(detailReads,before);assert.equal(workers,1);
 for (const width of [390,320]) {
  await page.setViewportSize({width,height:844});await page.reload();await page.locator('.leaderboard-table').waitFor();await openForest(page);await page.locator('.bayesian-table tbody tr').first().waitFor({state:'attached'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.locator('.bayesian-plot svg').getAttribute('viewBox'),'0 0 360 773');
  await page.locator('#bayesian-community').screenshot({path:`${out}/dark-mobile-${width}-en.png`});
 }
 await page.locator('.leaderboard-plot > summary').click();assert.equal(await page.locator('.bayesian-plot svg').isVisible(),false);await openForest(page);assert.equal(workers,1);
 // A new immutable result invalidates the cohort cache, without a Pages rebuild.
 const newId='deadbeef-abcd-4321-8abc-001122334455', newSummary={...index[0],id:newId,username:'New test participant'};
 records.set(newId,{...records.get(index[0].id),id:newId,username:newSummary.username});data=[...index,newSummary];
 await page.getByRole('button',{name:'Refresh',exact:false}).click();
 await page.waitForFunction(count=>document.querySelectorAll('.public-result-grid .result-card').length===count,index.length+1);await openForest(page);
 await page.locator('.bayesian-table tbody tr').first().waitFor({state:'attached',timeout:120000});
 const next=await page.evaluate(()=>JSON.parse(localStorage.getItem('ars-bayesian-community-v1')));assert.ok(validCommunityResult(next.result,index.length+1));assert.notEqual(next.key,cache.key);
 assert.equal(detailReads,before+index.length+1);assert.equal(workers,2);
 // Broken cache cannot supply fabricated scores; unavailable histories show Retry.
 await page.evaluate(()=>{const c=JSON.parse(localStorage.getItem('ars-bayesian-community-v1'));c.result.rankings[0].mean=null;localStorage.setItem('ars-bayesian-community-v1',JSON.stringify(c));});fail=true;await page.reload();await page.locator('.leaderboard-table').waitFor();await openForest(page);await page.locator('.bayesian-retry').waitFor();
 assert.equal(await page.locator('.bayesian-plot svg').count(),0);
 const small=await browser.newContext();await small.route('**/config.json',r=>r.fulfill({json:{resultsApiUrl:''}}));await small.route('**/results/index.json',r=>r.fulfill({json:[index[0]]}));const single=await small.newPage();
 await single.goto(`${base}/results.html`);await single.locator('.leaderboard-table').waitFor();await openForest(single);assert.equal(await single.locator('.bayesian-plot svg').count(),0);assert.ok((await single.locator('.bayesian-status').textContent()).includes('en az iki'));
 const refused=await browser.newContext();await refused.route('**/config.json',r=>r.fulfill({json:{resultsApiUrl:''}}));await refused.addInitScript(()=>{window.Worker=class{postMessage(){setTimeout(()=>this.onmessage({data:{type:'result',result:{converged:false}}}),0);}terminate(){}};});const bad=await refused.newPage();
 await bad.goto(`${base}/results.html#bayesian-community`);await bad.locator('.bayesian-retry').waitFor();assert.ok((await bad.locator('.bayesian-status').textContent()).includes('yakınsama'));assert.equal(await bad.locator('.bayesian-plot svg').count(),0);
 assert.deepEqual(errors,[]);console.log('Single expandable Bayesian forest browser checks passed: real module worker, responsive navigation, history retry, both languages, mobile, cache, new participants, convergence gate.');
} finally { await browser.close(); }
