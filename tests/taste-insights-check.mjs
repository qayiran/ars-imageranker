// Optional browser verification. All service writes are mocked.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { darkHorseFavorites, ratingFingerprint, circularPreferenceExamples } from '../assets/taste-insights.js';
import { IMAGES, CATALOG_VERSION } from '../assets/catalog.js';
import { MODEL, createQueue } from '../assets/ranking.js';
const { chromium }=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base=process.env.PREVIEW_URL||'http://127.0.0.1:8000', artifacts='/tmp/ars-taste-insights'; await mkdir(artifacts,{recursive:true});
const records=JSON.parse(await readFile(new URL('../results/index.json',import.meta.url)));
const own=records.find(({username})=>username==='qayiran'), manual=records.find(({provenance})=>provenance);
const record=JSON.parse(await readFile(new URL(`../results/${own.id}.json`,import.meta.url)));
const expected=circularPreferenceExamples(record.comparisons,own.rankings);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const errors=[], writes=[];
let mode='ready';
async function context() {
 const c=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
 c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await c.route('**/config.json',r=>r.fulfill({json:{resultsApiUrl:'https://taste.test'}}));
 await c.route('https://taste.test/**',r=>{
  const req=r.request(),headers={'Access-Control-Allow-Origin':new URL(base).origin};
  if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Content-Type'}});
  if(req.method()==='POST'){writes.push(req.postDataJSON().id);return r.fulfill({json:{saved:true,id:req.postDataJSON().id},headers});}
  return r.fulfill({status:mode==='error'?503:200,json:mode==='error'?{error:'Unavailable'}:mode==='solo'?[own]:records,headers});
 });
 return c;
}
const c=await context(), page=await c.newPage();
async function assertSectionOrder() {
 const actual = await page.locator('#public-ranking-detail, #results-content').evaluate(root => {
  const selectors=['.results-layout','.result-share-control','.ranked-artwork','.group-preferences','.dark-horse-favorites','.closest-matches','.preference-consistency','.ranking-divergence','.rating-fingerprint'];
  const nodes=selectors.map(selector=>root.querySelector(selector));
  return nodes.every(Boolean) && nodes.every((node,i)=>{
   if(!i) return true;
   if(!(nodes[i-1].compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)) return false;
   const previous=nodes[i-1].getBoundingClientRect(), current=node.getBoundingClientRect();
   if(innerWidth>1000 && (i===5 || i===7)) return Math.abs(previous.top-current.top)<2 && previous.right<current.left;
   return previous.bottom<=current.top+2;
  });
 });
 assert.equal(actual,true,'Result sections follow the requested DOM order and responsive paired layout');
}
async function assertFingerprint(rankings) {
 const data=ratingFingerprint(rankings); await page.locator('[data-fingerprint-mean]').waitFor(); await assertSectionOrder();
 assert.equal(Number(await page.locator('[data-fingerprint-mean]').getAttribute('data-fingerprint-mean')),data.mean);
 assert.deepEqual(await page.locator('[data-fingerprint-id]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.fingerprintId,Number(n.dataset.fingerprintDifference)])),data.rows.map(r=>[r.id,r.difference]));
}
async function assertHorses(item) {
 const expected=darkHorseFavorites(item.rankings,records,item);
 assert.deepEqual(await page.locator('[data-dark-horse]').evaluateAll(nodes=>nodes.map(n=>n.dataset.darkHorse)),expected.favorites.map(r=>r.id));
}
try{
 for(const prefix of ['', '/_site']){
  await page.goto(`${base}${prefix}/results.html#${own.id}`); await page.locator('.dark-horse-list').waitFor();
  await assertFingerprint(own.rankings); await assertHorses(own);
  assert.equal(await page.locator('.dark-horse-slot .circular-examples').count(),0);
  assert.equal(await page.locator('[data-consistency-panel=summary]').isVisible(),true);
  await page.locator('[data-consistency-page=examples]').click(); await page.locator('[data-cycle-ids]').waitFor();
  assert.equal(await page.locator('[data-load-cycles]').count(),0);
  assert.equal(await page.locator('[data-cycle-ids]').getAttribute('data-cycle-ids'),expected[0].map(r=>r.id).join('|'));
  await page.locator('[data-cycle-next]').click(); assert.equal(await page.locator('[data-cycle-ids]').getAttribute('data-cycle-ids'),expected[1].map(r=>r.id).join('|'));
  assert.equal(await page.locator('[data-cycle-next]').isDisabled(),true); await page.locator('[data-cycle-previous]').click();
  await page.locator('.cycle-art').first().click(); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
  await page.locator('.dark-horse-art').first().click(); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
  await page.locator('.rating-fingerprint details summary').click(); assert.equal(await page.locator('.rating-fingerprint tbody tr').count(),17);
  await page.locator('[data-language-picker]').selectOption('en');
  await page.getByRole('heading',{name:'Rating fingerprint',exact:true}).waitFor(); await page.getByRole('heading',{name:'Circular preference examples',exact:true}).waitFor();
  assert.equal(await page.locator('.rating-fingerprint details').getAttribute('open'),'');
  await page.locator('.rating-fingerprint svg a').first().click(); await page.waitForURL('**/character.html#connecticut'); await page.locator('.profile-stats').waitFor();
  await page.goto(`${base}${prefix}/results.html#${manual.id}`); await assertFingerprint(manual.rankings); await assertHorses(manual);
  await page.locator('[data-consistency-page=examples]').click();
  await page.getByText('Examples are unavailable for screenshot-recovered results because the comparison choices were not recovered.',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-load-cycles]').count(),0);
 }
 for(const language of ['tr','en'])for(const theme of ['light','dark'])for(const width of [1440,1024,1000,390,320]){
  await page.setViewportSize({width,height:1100}); await page.goto(`${base}/_site/results.html#${own.id}`); await page.locator('.rating-fingerprint').waitFor(); await page.locator('[data-consistency-page=examples]').click(); await page.locator('[data-cycle-ids]').waitFor();
  await page.locator('[data-language-picker]').selectOption(language); await page.locator('[data-theme-picker]').selectOption(theme);
  await assertSectionOrder();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${language}/${theme}/${width} overflow`);
  await page.locator('.result-insights-grid').screenshot({path:`${artifacts}/${language}-${theme}-${width}-consistency.png`});
  await page.locator('.rating-fingerprint').screenshot({path:`${artifacts}/${language}-${theme}-${width}.png`});
  await page.locator('[data-consistency-page=examples]').focus(); await page.keyboard.press('Home');
  assert.equal(await page.locator('[data-consistency-panel=summary]').isVisible(),true);
  await page.keyboard.press('End'); assert.equal(await page.locator('[data-consistency-panel=examples]').isVisible(),true);
 }
 // Personal completed results use their browser history immediately, without a history-file request.
 await page.setViewportSize({width:1440,height:1100}); await page.goto(`${base}/_site/`);
 const personal={id:'00112233-4455-4677-8899-aabbccddeeaa',username:'Yerel deneme',catalogVersion:CATALOG_VERSION,model:MODEL,history:record.comparisons,queue:[],published:false};
 await page.evaluate(({key,value})=>{localStorage.setItem(key,JSON.stringify(value));localStorage.setItem('ars-language','tr');},{key:`showcase-session:${CATALOG_VERSION}`,value:personal});
 await page.reload(); await page.getByRole('button',{name:'Sonuçlarını gör'}).click(); await page.locator('[data-consistency-page=examples]').click(); await page.locator('[data-cycle-ids]').waitFor();
 assert.equal(await page.locator('[data-load-cycles]').count(),0); await assertSectionOrder();
 await page.locator('[data-dark-horse]').first().waitFor();
 await page.getByRole('tab',{name:'Diğer sıralamalar'}).click(); await page.locator('.participant').filter({hasText:'qayiran'}).click();
 await page.locator('[data-consistency-page=examples]').click();
 await page.locator('[data-cycle-ids]').waitFor(); await assertFingerprint(own.rankings);
 // Network/invalid histories do not fabricate examples; retry succeeds.
 const retry=await context(), p=await retry.newPage(); let historyMode='failure';
 await retry.route(`**/results/${own.id}.json`,r=>r.fulfill({status:historyMode==='failure'?503:200,json:historyMode==='invalid'?{...record,comparisons:record.comparisons.slice(1)}:historyMode==='failure'?{error:'Unavailable'}:record}));
 await p.goto(`${base}/_site/results.html#${own.id}`); await p.locator('[data-consistency-page=examples]').click();
 await p.getByText('Kayıtlı seçimler yüklenemedi. Yeni kaydedilen bir sonuç, sonraki site güncellemesinden sonra erişilebilir olabilir. Daha sonra yeniden deneyin.',{exact:true}).waitFor();
 assert.equal(await p.locator('[data-cycle-ids]').count(),0);
 historyMode='invalid'; await p.locator('[data-retry-cycles]').click(); await p.locator('[data-retry-cycles]').waitFor(); assert.equal(await p.locator('[data-cycle-ids]').count(),0);
 historyMode='ready'; await p.locator('[data-retry-cycles]').click(); await p.locator('[data-cycle-ids]').waitFor(); await retry.close();
 // A delayed history load survives a language change through the cached validated result.
 const delayed=await context(), d=await delayed.newPage(); let release;
 await delayed.route(`**/results/${own.id}.json`,async r=>{await new Promise(resolve=>release=resolve);await r.fulfill({json:record});});
 await d.goto(`${base}/results.html#${own.id}`); await d.locator('[data-consistency-page=examples]').click(); await d.locator('[data-language-picker]').selectOption('en');
 release(); await d.locator('[data-cycle-ids]').waitFor(); await delayed.close();
 // Empty references keep the fingerprint and history usable; service errors do the same.
 mode='solo'; await page.goto(`${base}/_site/results.html#${own.id}`); await page.locator('.rating-fingerprint').waitFor();
 await page.getByText('Sıra dışı favorileri bulmak için en az bir başka kayıtlı sıralama gerekiyor.',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-dark-horse]').count(),0);
 mode='error'; await page.goto(`${base}/_site/`); await page.getByRole('button',{name:'Sonuçlarını gör'}).click(); await page.locator('.divergence-retry').waitFor();
 await page.getByText('Diğer sıralamalar yüklenemedi. Sıra dışı favorileri görmek için genel karşılaştırmayı yeniden deneyin.',{exact:true}).waitFor();
 await page.locator('[data-consistency-page=examples]').click(); await page.locator('[data-cycle-ids]').waitFor(); await page.locator('[data-fingerprint-mean]').waitFor();
 mode='ready'; await page.locator('.divergence-retry').click(); await page.locator('[data-dark-horse]').first().waitFor();
 assert.ok(writes.every(id=>id===personal.id)); assert.deepEqual(errors,[]);
 console.log('PASS: dark horses/self-exclusion, full centered fingerprint/profile links, two-page consistency panel, automatic history loading, actual cycle enumeration/navigation/zoom, normal/manual/personal/community views, source/Pages, Turkish/English, light/dark 320–1440px, unavailable/invalid/delayed histories and reference retry; no real writes.');
}finally{await browser.close();}
