/** Photo-first report cards, menu interaction and safe mobile header; no live writes. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {waitForAppReady} from './app-ready-qa.mjs';
const liveBase=process.env.QA_BATCH_GALLERY_BASE?new URL(process.env.QA_BATCH_GALLERY_BASE):null;
const target=liveBase?new URL('plate-studio.html',liveBase):pathToFileURL(resolve('plate-studio.html'));
if(liveBase)target.searchParams.set('ps_release',process.env.QA_BATCH_GALLERY_REVISION||'');
const output=resolve(liveBase?'qa-results/batch-gallery/live':'qa-results/batch-gallery');mkdirSync(output,{recursive:true});
const realPhoto='data:image/png;base64,'+readFileSync('assets/demos/mobile-first-keyboard.png').toString('base64');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try{
 for(const [width,height] of [[320,740],[390,844],[430,932],[760,900],[844,390],[1280,900]].filter(([width])=>!process.env.QA_BATCH_GALLERY_WIDTH||width===Number(process.env.QA_BATCH_GALLERY_WIDTH)))for(const theme of ['light','dark']){
  const mobile=width<=844,safeTop=width===430?59:0;
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',serviceWorkers:'block',deviceScaleFactor:width===430?3:1});
  await context.route(/^https?:/,route=>liveBase&&new URL(route.request().url()).origin===liveBase.origin?route.continue():route.abort());
  await context.addInitScript(()=>localStorage.setItem('ps_install_invite_v1',JSON.stringify({until:Date.now()+86400000})));
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(target.href,{waitUntil:'domcontentloaded'});await waitForAppReady(page);
   await page.evaluate(({theme,safeTop,realPhoto})=>{
    document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty('--mws-safe-top',safeTop+'px');document.getElementById('auth-ov').style.display='none';
    canAccess=()=>true;canEditBatchReports=()=>true;canManageBatchReports=()=>true;canDescribeBatchReports=()=>true;batchCloudServerPaged=false;sb=null;cloudReady=false;
    fils=[{id:'qa-gallery-color',brand:'QA',name:'Tên màu dài để kiểm tra trên điện thoại',hex:'#2563eb'}];
    const photo=(w,h,color)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${color}"/><text x="10" y="40" fill="white" font-size="22">QA ${w} x ${h}</text></svg>`);
    batchReports=Array.from({length:25},(_,index)=>({id:'qa-gallery-'+index,createdAt:new Date(Date.UTC(2026,0,25-index)).toISOString(),status:index===2?'done':index===3?'skipped':'pending',image:index===4?'':index===5?'data:image/png;base64,broken':index%3===0?realPhoto:photo(index%2?800:400,index%2?400:800,index%2?'#82523c':'#235a75'),filamentId:index<3?'':'qa-gallery-color',appliedItems:[],manualItems:[],aiAssisted:index===6?{reviewedAt:new Date().toISOString()}:undefined}));
    FILTERS.batches={...FILTERS.batches,search:'',status:'all',sort:'recorded_desc'};batchReportPageSize=24;batchReportCurrentPage=1;batchReportMultiSelect=false;batchReportSelectedIds.clear();
    window.qaGallerySource=JSON.stringify(batchReports);window.qaGalleryOpened=[];window.qaGalleryRecovered=[];window.qaGallerySkipped=[];window.qaGalleryConfirm=0;
    resumeBatchReport=id=>qaGalleryOpened.push(id);viewBatchReport=id=>qaGalleryOpened.push(id);recoverMissingBatchReportMedia=id=>qaGalleryRecovered.push(id);skipBatchReport=id=>qaGallerySkipped.push(id);confirm=()=>{qaGalleryConfirm++;return false;};
    goPage('batches',{historyMode:'none'});renderBatchReportPage();
    window.qaGalleryImage=document.querySelector('.batch-report-media>img');
    const badge=document.getElementById('cam-fab-badge');if(badge){badge.textContent='327';badge.style.display='';}
   },{theme,safeTop,realPhoto});
   await page.locator('.batch-report-media>img').first().evaluate(image=>image.decode());
   await page.locator('[data-batch-report-id="qa-gallery-5"]').scrollIntoViewIfNeeded();
   await page.locator('[data-batch-report-id="qa-gallery-5"] .batch-report-media.is-missing').waitFor();
   assert.equal(await page.locator('.batch-report-card').count(),24,'A full page of real-state cards is exercised');
   if(mobile){
    await page.waitForFunction(()=>document.querySelector('.mws-app-header')?.contains(document.getElementById('page-options-tools')));
    const header=await page.evaluate(()=>{const bar=document.querySelector('.mws-app-header').getBoundingClientRect(),content=document.getElementById('pg-content').getBoundingClientRect();return {bar:bar.toJSON(),content:content.toJSON(),controls:[...document.querySelector('.mws-app-header').children].filter(el=>getComputedStyle(el).display!=='none').map(el=>el.getBoundingClientRect().toJSON())};});
    assert.ok(header.content.top>=header.bar.bottom-1,'The scroll region begins below the real header height');
    assert.ok(header.bar.height>=56+safeTop-1,'Safe-area height is reserved rather than covering content');
    assert.ok(header.controls.every((r,i,a)=>r.top>=safeTop&&r.left>=0&&r.right<=width&&(!i||r.left>=a[i-1].right-1)),'Header controls stay separate inside the safe area');
   }
   if(!mobile){
    const controls=await page.locator('.batch-library-toolbar').evaluate(bar=>['.compact-expand-search','.batch-sort-select','#btn-batch-multi-select','.batch-library-more summary'].map(sel=>{const el=bar.querySelector(sel),r=el.getBoundingClientRect(),style=getComputedStyle(el);return {sel,center:r.y+r.height/2,margin:style.margin,align:style.alignSelf,transform:style.transform};}));
    assert.ok(controls.every(control=>Math.abs(control.center-controls[0].center)<1),JSON.stringify(controls));
   }
   const geometry=await page.evaluate(()=>{
    const cards=[...document.querySelectorAll('.batch-report-card')];return {columns:getComputedStyle(cards[0].parentElement).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth+1,cards:cards.map(card=>{const media=card.querySelector('.batch-report-media'),footer=card.querySelector('.batch-report-footer'),image=media.querySelector('img');return {card:card.getBoundingClientRect().toJSON(),media:media.getBoundingClientRect().toJSON(),footer:footer.getBoundingClientRect().toJSON(),padding:getComputedStyle(card).padding,margin:getComputedStyle(card).margin,fit:image?getComputedStyle(image).objectFit:null};})};
   });
   writeFileSync(resolve(output,`${width}-${theme}-geometry.json`),JSON.stringify(geometry,null,2));
   if(mobile)assert.equal(geometry.columns,2,'Two photographs per mobile row');assert.equal(geometry.overflow,false);
   for(const item of geometry.cards){
    assert.equal(item.padding,'0px');assert.equal(item.margin,'0px');
    assert.ok(Math.abs(item.card.width-item.media.width)<=1&&Math.abs(item.card.top-item.media.top)<=1,'Photo fills the top and side edges');
    assert.ok(item.footer.top>=item.media.bottom-1&&item.media.height/item.card.height>=.6,'Information and actions sit below a photograph that remains the main content');
    if(item.fit)assert.equal(item.fit,'cover');
   }
   assert.ok(Math.abs(geometry.cards[0].card.top-geometry.cards[1].card.top)<1);
   assert.equal(await page.locator('.batch-report-media .batch-report-primary,.batch-report-media .batch-report-more,.batch-report-overlay-actions').count(),0,'Routine action buttons never cover photos');
   const first=page.locator('[data-batch-report-id="qa-gallery-0"]'),primary=first.getByRole('button',{name:'Tiếp tục xử lý',exact:true}),more=first.getByRole('button',{name:'Thao tác báo cáo mẻ',exact:true});
   const controls=await first.locator('.batch-report-footer button').evaluateAll(buttons=>buttons.map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,bottom:r.bottom};}));
   assert.ok(controls.every(r=>r.width>=43.99&&r.height>=43.99)&&Math.max(...controls.map(r=>r.top))<Math.min(...controls.map(r=>r.bottom)),'Caption actions remain 44px on a single row');
   const flat=await first.locator('.batch-report-status-chip').evaluate(el=>({border:getComputedStyle(el).borderTopWidth,shadow:getComputedStyle(el).boxShadow,dotShadow:getComputedStyle(el,'::before').boxShadow}));
   assert.deepEqual(flat,{border:'0px',shadow:'none',dotShadow:'none'},'Status is flat without outlines or glowing dots');
   await primary.click();assert.deepEqual(await page.evaluate(()=>qaGalleryOpened),['qa-gallery-0']);
   await more.click();const menu=page.locator('#batch-report-actions-menu');await menu.waitFor({state:'visible'});
   const box=await menu.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,'Menu is not clipped by the grid or viewport');
   assert.equal(await page.evaluate(()=>qaGalleryOpened.length),1,'Opening tools does not open the report');
   await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'delete');await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'skip');
   await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);assert.equal(await more.evaluate(el=>el===document.activeElement),true,'Escape returns focus to the same card');
   await more.click();await menu.getByRole('menuitem',{name:'Bỏ qua',exact:true}).click();assert.deepEqual(await page.evaluate(()=>qaGallerySkipped),['qa-gallery-0']);
   await more.click();await menu.getByRole('menuitem',{name:'Chuyển vào thùng rác',exact:true}).click();assert.equal(await page.evaluate(()=>qaGalleryConfirm),1,'Delete retains its real confirmation');assert.equal(await first.count(),1,'Cancel never removes a report');
   await more.click();await page.mouse.click(1,1);assert.equal(await menu.isVisible(),false,'Outside click closes the portal');assert.equal(await page.evaluate(()=>curPage),'batches','Outside dismissal does not navigate');
   if(!mobile){
    const photo=first.locator('.batch-report-media img');
    await photo.click({button:'right'});await menu.getByRole('menuitem',{name:'Bỏ qua',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>qaGallerySkipped),['qa-gallery-0','qa-gallery-0']);
    await photo.click({button:'right'});await menu.getByRole('menuitem',{name:'Chuyển vào thùng rác',exact:true}).click();
    assert.equal(await page.evaluate(()=>qaGalleryConfirm),2,'Right click uses the same deletion confirmation');
    await page.locator('[data-batch-report-id="qa-gallery-2"] img').click({button:'right'});
    await menu.waitFor({state:'visible'});assert.equal(await menu.locator('[data-action=skip]').count(),0,'Completed reports cannot be skipped');
    await page.keyboard.press('Escape');
   }
   assert.equal(await page.evaluate(()=>qaGalleryImage===document.querySelector('.batch-report-media>img')),true,'Opening and closing tools never rebuilds the gallery images');
   const recover=page.locator('[data-batch-report-id="qa-gallery-4"]').getByRole('button',{name:'Tìm ảnh trên cloud',exact:true});
   assert.equal(await recover.count(),1,await page.locator('[data-batch-report-id="qa-gallery-4"]').evaluate(el=>el.outerHTML));await recover.click();assert.deepEqual(await page.evaluate(()=>qaGalleryRecovered),['qa-gallery-4']);
   await page.evaluate(()=>{const root=document.getElementById('pg-content'),grid=document.querySelector('.batch-report-grid');root.scrollTo({top:root.scrollTop+grid.getBoundingClientRect().top-root.getBoundingClientRect().top-12,behavior:'instant'});document.activeElement?.blur();});
   await page.waitForTimeout(200);if([320,390,430,844,1280].includes(width))await page.screenshot({path:resolve(output,`${width}-${theme}.png`)});
   await page.evaluate(()=>toggleBatchReportMultiSelect());const select=page.locator('.batch-report-select-box').first();await select.click();assert.equal(await page.evaluate(()=>batchReportSelectedIds.has('qa-gallery-0')),true);assert.equal(await page.locator('.batch-report-more').count(),0);
   if(mobile)assert.equal(await select.evaluate(el=>{const box=el.getBoundingClientRect(),status=el.closest('.batch-report-card').querySelector('.batch-report-status-chip').getBoundingClientRect();return status.right<=box.left||status.bottom<=box.top;}),true);
   await page.evaluate(()=>{document.activeElement?.blur();cancelBatchReportMultiSelect();setBatchReportStatusFilter('done');});assert.equal(await page.locator('.batch-report-card').count(),1);
   assert.equal(await page.evaluate(()=>JSON.stringify(batchReports)===qaGallerySource),true,'Layout, menus and cancelled deletion preserve every record');assert.deepEqual(errors,[]);
   await page.evaluate(()=>{
    batchReports=Array.from({length:130},(_,i)=>({...batchReports[0],id:'qa-page-'+i,createdAt:new Date(Date.UTC(2026,0,1,0,-i)).toISOString()}));
    FILTERS.batches.status='all';batchReportPageSize=12;batchReportCurrentPage=1;
    renderBatchReportPage();
   });
   const pager=page.locator('#batch-library-pagination-top');
   assert.deepEqual(await pager.locator('.batch-library-pages button').allTextContents(),['1','2','3','4','11']);
   assert.equal(await pager.locator('[aria-current="page"]').textContent(),'1');
   assert.equal(await pager.locator('.batch-library-page-gap').count(),1);
   assert.equal(await pager.locator('.batch-library-pages button').evaluateAll(buttons=>buttons.every(button=>{
    const rect=button.getBoundingClientRect();return rect.width>=44&&rect.height>=44&&rect.right<=innerWidth;
   })),true);
   await page.locator('#batch-library-pagination-bottom').getByRole('button',{name:'Trang 11',exact:true}).press('Enter');
   assert.equal(await pager.locator('[aria-current="page"]').textContent(),'11');
   assert.equal(await pager.locator('[aria-current="page"]').evaluate(button=>document.activeElement===button),true);
   assert.equal(await pager.locator('.batch-library-page-range').textContent(),'121–130 / 130');
   assert.equal(await page.locator('.batch-report-card').count(),10);
   await pager.getByRole('combobox',{name:'Số báo cáo mỗi trang'}).selectOption('60');
   assert.equal(await pager.locator('[aria-current="page"]').textContent(),'1');
   assert.equal(await page.locator('.batch-report-card').count(),60);
   if(width===320||width===1280)await pager.screenshot({path:resolve(output,`pager-${width}-${theme}.png`)});
   if(width===1280){
    await page.evaluate(()=>{
     currentUser={id:'qa-pager'};sb={};batchCloudServerPaged=true;batchCloudTotal=130;
     batchReportPageSize=12;batchReports=batchReports.slice(0,12);
     window.qaPageRequests=[];
     loadBatchReportsFromCloud=async ({page,pageSize})=>{
      qaPageRequests.push([page,pageSize]);
      if(page===11)throw new Error('QA cloud unavailable');
      batchReports=batchReports.map((report,index)=>({...report,id:`qa-cloud-${page}-${index}`}));
     };
     renderBatchReportPage();
    });
    await pager.getByRole('button',{name:'Trang 4',exact:true}).click();
    await pager.locator('[aria-current="page"]').filter({hasText:'4'}).waitFor();
    assert.equal(await page.locator('.batch-report-card').first().getAttribute('data-batch-report-id'),'qa-cloud-4-0');
    await pager.getByRole('button',{name:'Trang 11',exact:true}).click();
    await page.waitForFunction(()=>qaPageRequests.length===2&&!batchReportPageLoading);
    assert.deepEqual(await page.evaluate(()=>qaPageRequests),[[4,12],[11,12]]);
    assert.equal(await pager.locator('[aria-current="page"]').textContent(),'4');
    assert.equal(await page.locator('.batch-report-card').first().getAttribute('data-batch-report-id'),'qa-cloud-4-0');
    await page.evaluate(()=>{batchServerPagingAvailable=false;batchCloudServerPaged=false;renderBatchReportPage();});
    await pager.getByRole('button',{name:'Trang 1',exact:true}).click();
    await pager.locator('[aria-current="page"]').filter({hasText:/^1$/}).waitFor();
    assert.deepEqual(await page.evaluate(()=>qaPageRequests.at(-1)),[1,12]);
    assert.equal(await page.locator('.batch-report-card').count(),12);
   }
   results.push({width,height,theme,safeTop,status:'PASS'});console.log(`PASS batch gallery ${width}/${theme}: 24 cards, exposed photos, flat badges, safe header, 44px footer/menu, keyboard, confirmation, selection and unchanged data`);
  }finally{await context.close();}
 }
}finally{await browser.close();}
writeFileSync(resolve(output,'summary.json'),JSON.stringify({status:'PASS',results},null,2));
