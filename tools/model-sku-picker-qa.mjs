import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdirSync} from 'node:fs';
import {waitForAppReady} from './app-ready-qa.mjs';
import {checkSurfaces} from './surface-contract-qa.mjs';

// Ephemeral contexts, blocked external network and an isolated ACK adapter.
// The established kiot-mapping SQL/browser guards separately exercise the real RPC.
const out=resolve('qa-results/model-sku-picker');mkdirSync(out,{recursive:true});
const base=process.env.QA_MODEL_SKU_BASE;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
async function prepare(page,theme){
 await page.evaluate(theme=>{
  document.documentElement.dataset.theme=theme;document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');
  currentUser={id:'sku-picker-user'};activeWorkspace={workspace_id:'sku-picker-workspace',owner_user_id:currentUser.id};cloudReady=false;loadingCloud=false;canAccess=()=>true;
  orders=[];pitems=[];batchReports=[];operations={products:[],deliveries:[],deliveryBatches:[],qualityIssues:[]};normalizeOperations();
  const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#cb92bd"/></svg>');
  models=[{id:'model',name:'Bàn phím tên mẫu thử dài để kiểm tra trên điện thoại',images:[image],parts:[],variants:[{id:'pink',name:'Hồng nhạt'},{id:'blue',name:'Xanh biển'}]},{id:'plain',name:'Model không biến thể',parts:[],images:[],variants:[]}];
  kiotViet={catalog:Array.from({length:151},(_,i)=>({sku:'SKU'+i,name:i===0?'Bàn phím tên':i===1?'Ảnh bị lỗi':'Sản phẩm '+i,category:'Đồ trang trí',stock:i,imageUrl:i===0?image:i===1?'https://qa.invalid/missing.png':''})),mappings:[{sku:'SKU2',id:'keep',modelId:'elsewhere',modelName:'Công thức đã ghép',components:[{id:'keep-component',modelId:'elsewhere',qty:3,mode:'required'}]}],skippedSkus:[],mappingRevisions:{},snapshots:[],sales:[],salesImports:[],aiInsights:[]};
  kiotSalesArchiveLoaded=true;kiotSalesArchiveReadyForSettings=true;kiotInventoryLedger.loaded=true;
  initKiotMappingSync();goPage('models',{historyMode:'none'});viewModel('model');
  window.qaParent=document.querySelector('#dlg-mv .dlg');window.qaPhoto=document.querySelector('#dlg-mv .model-detail-images img');window.qaToasts=[];toast=message=>qaToasts.push(message);
 },theme);
}
try{for(const [width,height] of [[320,740],[390,844],[844,430],[1440,900]])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],remote={mappings:[]};
 await context.route(/^https?:/,route=>base&&new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 await page.exposeFunction('qaCommit',args=>{remote.mappings=remote.mappings.filter(row=>row.sku!==args.p_sku);remote.mappings.push(args.p_mapping);return {data:{mapping:args.p_mapping,skipped:null,revision:'1'}};});
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
 await page.goto(base?new URL('plate-studio.html?sku-qa='+Date.now(),base).href:pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});await waitForAppReady(page);await prepare(page,theme);
 const trigger=page.locator('#dlg-mv').getByRole('button',{name:'Ghép SKU',exact:true});
 await trigger.click();
 assert.equal(await page.evaluate(()=>curPage),'models','Model action must not navigate to Kiot sync');
 assert.equal(await page.locator('#model-sku-search').evaluate(el=>el===document.activeElement),true);
 assert.equal(await page.locator('.model-sku-row').count(),60,'Bounded initial results');
 assert.equal(await page.locator('#model-sku-save').isDisabled(),true,'No implicit SKU or variant');
 await page.waitForFunction(()=>!document.querySelector('[data-sku="SKU1"] img'));
 assert.equal(await page.locator('[data-sku="SKU1"] .kv-row-thumb svg').count(),1,'Broken image keeps fallback');
 assert.equal(await page.locator('[data-sku="SKU2"]').isDisabled(),true,'Existing formula cannot be overwritten');
 await page.locator('#model-sku-more').click();assert.equal(await page.locator('.model-sku-row').count(),120);
 await page.locator('#model-sku-search').fill('ban phim');assert.equal(await page.locator('.model-sku-row').count(),1,'Accent-insensitive name');
 await page.locator('#model-sku-search').evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='Đồ';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
 assert.equal(await page.locator('.model-sku-row').count(),1,'IME does not redraw mid-composition');
 await page.locator('#model-sku-search').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
 assert.equal(await page.locator('.model-sku-row').count(),60,'Category search');
 await page.locator('#model-sku-search').fill('SKU150');assert.equal(await page.locator('[data-sku="SKU150"]').count(),1,'Search covers entire catalog');
 await page.locator('#model-sku-search').fill('no-results');assert.match(await page.locator('#model-sku-results').textContent(),/Không tìm thấy/);
 await page.locator('#model-sku-search').fill('SKU0');await page.locator('[data-sku="SKU0"]').click();
 assert.equal(await page.locator('#model-sku-save').isDisabled(),true,'Variant requires explicit choice');
 await page.locator('#model-sku-variant-search').fill('hong nhat');await page.locator('[data-model-sku-variant="pink"]').click();assert.equal(await page.locator('#model-sku-save').isDisabled(),false);
 await page.evaluate(()=>{window.qaInput=document.getElementById('model-sku-search');qaInput.focus();qaInput.setSelectionRange(2,2);window.qaRow=document.querySelector('[data-sku="SKU0"]');window.qaSkuPhoto=qaRow.querySelector('img');renderModelSkuResults();});
 assert.deepEqual(await page.evaluate(()=>[qaInput===document.activeElement,qaInput.selectionStart,qaInput===document.getElementById('model-sku-search'),qaRow===document.querySelector('[data-sku="SKU0"]'),qaSkuPhoto===qaRow.querySelector('img')]),[true,2,true,true,true],'Search/focus/caret/thumbnail retained');
 await checkSurfaces(page,`${width}/${theme} SKU popup`,'#dlg-model-sku');
 const geometry=await page.locator('#dlg-model-sku').evaluate(ov=>({overflow:ov.scrollWidth>ov.clientWidth+1,small:[...ov.querySelectorAll('button,input')].filter(el=>el.getClientRects().length).map(el=>el.getBoundingClientRect()).filter(r=>r.width<43.9||r.height<43.9).length,actions:ov.querySelector('.dlg-actions').getBoundingClientRect().bottom<=innerHeight}));
 assert.deepEqual(geometry,{overflow:false,small:0,actions:true},'Popup fits viewport, 44px targets and reachable footer');
 if([390,1440].includes(width))await page.screenshot({path:resolve(out,`${width}-${theme}.png`)});
 await page.locator('#model-sku-save').focus();await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'Đóng chọn SKU',exact:true}).evaluate(el=>el===document.activeElement),true,'Tab stays inside popup');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#dlg-model-sku').count(),0);assert.equal(await trigger.evaluate(el=>el===document.activeElement),true,'Escape returns focus');
 await trigger.click();await page.locator('#model-sku-search').fill('SKU0');await page.locator('[data-sku="SKU0"]').click();await page.locator('[data-model-sku-variant="pink"]').click();
 await page.evaluate(()=>{window.qaSave=window.KiotMappingSync.save;window.KiotMappingSync.save=async()=>{throw new Error('Isolated local quota');};});
 await page.locator('#model-sku-save').click();assert.match(await page.locator('#model-sku-error').textContent(),/Chưa lưu/);assert.equal(await page.locator('[data-sku="SKU0"]').getAttribute('aria-pressed'),'true','Save error keeps selection');
 await page.evaluate(()=>{window.KiotMappingSync.save=qaSave;});
 await page.locator('#model-sku-save').click();await page.waitForFunction(()=>!modelSkuDraft);
 assert.equal(await page.evaluate(()=>curPage),'models');assert.deepEqual(await page.evaluate(()=>[qaParent===document.querySelector('#dlg-mv .dlg'),qaPhoto===document.querySelector('#dlg-mv .model-detail-images img'),document.getElementById('dlg-mv').inert]),[true,true,false],'Save retains model DOM and photos');
 assert.equal(await page.evaluate(()=>modelSignalIndex.get('model')?.mapped),true,'Library sales/stock hover reflects the new mapping immediately');
 assert.equal(await page.evaluate(()=>window.KiotMappingSync.status().pending.length),1);assert.match(await page.locator('#model-card-sync-status').textContent(),/ghép chờ/);assert.equal(remote.mappings.length,0,'Local save is not a cloud ACK');
 await page.reload({waitUntil:'domcontentloaded'});await waitForAppReady(page);await prepare(page,theme);await page.evaluate(()=>window.KiotMappingSync.restore());
 assert.equal(await page.evaluate(()=>kiotViet.mappings.find(row=>row.sku==='SKU0')?.variantId),'pink','Durable outbox survives actual reload');
 await page.evaluate(async()=>{sb={rpc:async(name,args)=>qaCommit(args)};cloudReady=true;await window.KiotMappingSync.retry();});
 assert.equal(remote.mappings[0]?.components[0].variantId,'pink');assert.equal(remote.mappings[0]?.components[0].qty,1);assert.equal(await page.evaluate(()=>window.KiotMappingSync.status().pending.length),0);assert.ok(await page.evaluate(()=>qaToasts.some(t=>t.includes('Đã lưu cloud'))));
 await page.evaluate(()=>{cloudReady=false;viewModel('plain');openModelSkuPicker('plain');});await page.locator('#model-sku-search').fill('SKU3');await page.locator('[data-sku="SKU3"]').click();assert.equal(await page.locator('#model-sku-save').isDisabled(),false,'No-variant model needs no artificial variant');
 await page.evaluate(()=>{activeWorkspace={workspace_id:'other',owner_user_id:currentUser.id};});await page.locator('#model-sku-save').click();assert.match(await page.locator('#model-sku-error').textContent(),/Xưởng hoặc tài khoản/);assert.equal(remote.mappings.length,1,'Scope switch cannot save into another workspace');
 await page.keyboard.press('Escape');await page.evaluate(()=>{kiotViet.catalog=[];openModelSkuPicker('plain');});assert.match(await page.locator('#model-sku-results').textContent(),/Chưa có danh mục/);await page.keyboard.press('Escape');
 await page.evaluate(()=>{canAccess=()=>false;openModelSkuPicker('plain');});assert.equal(await page.locator('#dlg-model-sku').count(),0,'Permission enforced at entry');
 assert.deepEqual(errors,[]);console.log(`PASS model SKU picker ${width}/${theme}: in-place, search/IME, pagination, variants, existing formula protection, preserved DOM, keyboard, local failure/reload/cloud ACK and scope`);await context.close();
}}finally{await browser.close();}
