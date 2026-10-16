/** Report gallery geometry and interaction regression; isolated data, no cloud writes. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {waitForAppReady} from './app-ready-qa.mjs';
const output=resolve('qa-results/batch-gallery');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try{
 for(const [width,height] of [[320,740],[390,844],[430,932],[760,900],[844,390],[1280,900]])for(const theme of ['light','dark']){
  const mobile=width<=844,context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
  await context.route(/^https?:/,route=>route.abort());
  await context.addInitScript(()=>localStorage.setItem('ps_install_invite_v1',JSON.stringify({until:Date.now()+86400000})));
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});await waitForAppReady(page);
   await page.evaluate(theme=>{
    document.documentElement.dataset.theme=theme;document.getElementById('auth-ov').style.display='none';
    canAccess=()=>true;canEditBatchReports=()=>true;canDescribeBatchReports=()=>true;batchCloudServerPaged=false;
    fils=[{id:'qa-gallery-color',brand:'QA',name:'Tên màu dài để kiểm tra trên điện thoại',hex:'#2563eb'}];
    const photo=(w,h,color)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${color}"/><text x="10" y="40" fill="white" font-size="22">QA ${w} x ${h}</text></svg>`);
    batchReports=Array.from({length:8},(_,index)=>({id:'qa-gallery-'+index,createdAt:new Date(Date.UTC(2026,0,8-index)).toISOString(),status:index===2?'done':index===3?'skipped':'pending',image:index===4?'':index===5?'data:image/png;base64,broken':photo(index%2?800:400,index%2?400:800,index%2?'#82523c':'#235a75'),filamentId:'qa-gallery-color',appliedItems:[],manualItems:[],aiAssisted:index===6?{reviewedAt:new Date().toISOString()}:undefined}));
    FILTERS.batches={...FILTERS.batches,search:'',status:'all',sort:'recorded_desc'};batchReportCurrentPage=1;batchReportMultiSelect=false;batchReportSelectedIds.clear();
    window.qaGallerySource=JSON.stringify(batchReports);window.qaGalleryOpened=[];window.qaGalleryRecovered=[];resumeBatchReport=id=>qaGalleryOpened.push(id);viewBatchReport=id=>qaGalleryOpened.push(id);recoverMissingBatchReportMedia=id=>qaGalleryRecovered.push(id);
    goPage('batches',{historyMode:'none'});renderBatchReportPage();
   },theme);
   await page.waitForFunction(()=>[...document.querySelectorAll('.batch-report-media>img')].every(image=>image.complete));
   await page.locator('[data-batch-report-id="qa-gallery-5"] .batch-report-media.is-missing').waitFor();
   await page.locator('.batch-report-card').first().scrollIntoViewIfNeeded();
   const geometry=await page.evaluate(()=>{
    const cards=[...document.querySelectorAll('.batch-report-card')],grid=cards[0].parentElement;
    return {columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth+1,cards:cards.map(card=>{
     const r=card.getBoundingClientRect(),media=card.querySelector('.batch-report-media'),m=media.getBoundingClientRect(),style=getComputedStyle(card),image=media.querySelector('img');
     return {id:card.dataset.batchReportId,padding:style.padding,margin:style.margin,card:r.toJSON(),media:m.toJSON(),fit:image?getComputedStyle(image).objectFit:null,position:image?getComputedStyle(image).objectPosition:null};
    })};
   });
   writeFileSync(resolve(output,`${width}-${theme}-geometry.json`),JSON.stringify(geometry,null,2));
   if(width<=844)assert.equal(geometry.columns,2,`${width}/${theme}: exactly two photos per mobile row`);
   assert.equal(geometry.overflow,false,'Gallery must stay within the viewport');
   for(const item of geometry.cards){
    assert.equal(item.padding,'0px',`${item.id}: no shared card padding around the photo`);
    assert.equal(item.margin,'0px',`${item.id}: adjacent cards have no extra top margin`);
    assert.ok(Math.abs(item.card.width-item.media.width)<=4&&Math.abs(item.card.height-item.media.height)<=4,'Media reaches the card edge, including AI status');
    if(item.fit){assert.equal(item.fit,'cover');assert.equal(item.position,'50% 50%');}
   }
   assert.ok(Math.abs(geometry.cards[0].card.top-geometry.cards[1].card.top)<1,'Cards in one row align at the top');
   if(mobile)assert.equal(await page.locator('.batch-report-card.ai-assisted').evaluate(card=>{const badge=card.querySelector('.batch-report-ai-mark').getBoundingClientRect(),status=card.querySelector('.batch-report-status-chip').getBoundingClientRect();return badge.top>=status.bottom||badge.left>=status.right||badge.right<=status.left;}),true,'AI and report status remain separate in a narrow card');
   const first=page.locator('.batch-report-card').first();
   if(!mobile)await first.hover();
   const actions=await first.evaluate(card=>{const r=card.getBoundingClientRect();return [...card.querySelectorAll('.batch-report-overlay-actions button')].map(button=>{const b=button.getBoundingClientRect();return {text:button.textContent.trim(),width:b.width,height:b.height,inside:b.left>=r.left&&b.right<=r.right+1&&b.top>=r.top&&b.bottom<=r.bottom+1};});});
   assert.ok(actions.every(action=>action.inside&&action.height>=44),JSON.stringify(actions));
   await first.getByRole('button',{name:'Tiếp tục xử lý',exact:true}).click();assert.deepEqual(await page.evaluate(()=>qaGalleryOpened),['qa-gallery-0']);
   const recover=page.locator('[data-batch-report-id="qa-gallery-4"]').getByRole('button',{name:'Tìm ảnh trên cloud',exact:true});
   await recover.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const recoveryHit=await recover.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {width:r.width,height:r.height,clear:hit===el||el.contains(hit),hit:hit?.outerHTML.slice(0,160)};});
   assert.ok(recoveryHit.width>=44&&recoveryHit.height>=44&&recoveryHit.clear,'Missing-photo recovery remains reachable: '+JSON.stringify(recoveryHit));
   await recover.click();assert.deepEqual(await page.evaluate(()=>qaGalleryRecovered),['qa-gallery-4']);
   await first.scrollIntoViewIfNeeded();
   if([320,390,844,1280].includes(width))await page.screenshot({path:resolve(output,`${width}-${theme}.png`)});
   await page.evaluate(()=>{toggleBatchReportMultiSelect();});
   const select=page.locator('.batch-report-select-box').first();await select.click();
   assert.equal(await select.evaluate(el=>el.getBoundingClientRect().width>=44&&el.getBoundingClientRect().height>=44),true);
   if(mobile)assert.equal(await select.evaluate(el=>{const box=el.getBoundingClientRect(),status=el.closest('.batch-report-card').querySelector('.batch-report-status-chip').getBoundingClientRect();return status.right<=box.left||status.bottom<=box.top;}),true,'Selection does not cover the report status');
   assert.equal(await page.evaluate(()=>batchReportSelectedIds.has('qa-gallery-0')),true);
   await page.evaluate(()=>{document.activeElement?.blur();cancelBatchReportMultiSelect();setBatchReportStatusFilter('done');});
   assert.equal(await page.locator('.batch-report-card').count(),1);assert.equal(await page.locator('.batch-report-card').getAttribute('data-batch-report-id'),'qa-gallery-2');
   assert.equal(await page.evaluate(()=>JSON.stringify(batchReports)===qaGallerySource),true,'Layout and selection never mutate reports');assert.deepEqual(errors,[]);
   results.push({width,height,theme,columns:geometry.columns,status:'PASS'});console.log(`PASS batch gallery ${width}x${height}/${theme}: edge-to-edge photos, two mobile columns, actions, selection, statuses and immutable source`);
  }finally{await context.close();}
 }
}finally{await browser.close();}
writeFileSync(resolve(output,'summary.json'),JSON.stringify({status:'PASS',results},null,2));
