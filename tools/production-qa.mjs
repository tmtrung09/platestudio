import {chromium} from 'playwright-core';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const out=resolve('qa-results/production');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 for(const width of [390,1440])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*.supabase.co/**',route=>route.abort());
  await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof goPage==='function');
  await page.evaluate(theme=>{
   document.documentElement.dataset.theme=theme;
   document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');
   cloudReady=false;currentUser=null;batchReports=[];fulfillmentCloudManualReports=[];
   fils=[{id:'red',name:'Đỏ',hex:'#c44'},{id:'blue',name:'Xanh',hex:'#48c'}];
   models=[{id:'m',name:'Hộp khăn giấy — Tên model dài để kiểm tra bố cục',images:['https://qa.invalid/missing.jpg'],parts:[{id:'body',name:'Thân',qtyPerModel:1,filamentIds:['red']}],variants:[{id:'s',name:'Nhỏ'},{id:'l',name:'Lớn'}]}];
   orders=['a','b','cancelled'].map(id=>({id,note:`Đơn ${id}`,status:id==='cancelled'?'cancelled':'waiting',items:[{id:'item-'+id,modelId:'m',qty:10,variantId:id==='b'?'l':'s'}]}));
   pitems=[{id:'p1',orderId:'a',orderItemId:'item-a',modelId:'m',variantId:'s',partId:'body',partName:'Thân',filamentId:'red',qty:10,qtyDone:2},{id:'p2',orderId:'b',orderItemId:'item-b',modelId:'m',variantId:'l',partId:'body',partName:'Thân',filamentId:'blue',qty:4,qtyDone:0},{id:'bad',orderId:'cancelled',modelId:'m',variantId:'s',partId:'body',filamentId:'red',qty:99,qtyDone:0}];
   operations={qualityIssues:[{id:'issue',partId:'p1',orderId:'a',modelId:'m',qty:3,status:'open'}],printPlans:[]};normalizeOperations();
   const machine=PRINT_MACHINES[0].id;
   operations.printPlans=[{id:'plan',date:localPlanDate(),shift:'night',machines:{[machine]:{plate:{id:'planned',items:[{modelId:'m',variantId:'s',partId:'body',filamentId:'red',qty:3}]}}}}];
   kiotViet={...kiotViet,catalog:Array.from({length:80},(_,i)=>({id:'sku-'+i,sku:'SKU-'+i,name:'Sản phẩm '+i,stock:0,minStock:2})),mappings:[{sku:'SKU-0',modelId:'m'}],salesImports:[{id:'report',period:{from:'2026-10-08',to:'2026-10-08'},sales:[{sku:'SKU-0',name:'Sản phẩm 0',qty:5,revenue:50000}]}]};
   productionNeedsState.source='all';productionNeedsState.status='all';productionNeedsState.query='';
   goPage('reminders',{historyMode:'none'});
  },theme);
  const data=await page.evaluate(()=>{
   const rows=getProductionNeedRows(),small=rows.find(r=>r.id==='order:m:s'),large=rows.find(r=>r.id==='order:m:l'),stock=rows.filter(r=>r.sku==='SKU-0');
   return {small:small?.parts.map(p=>({qty:p.qty,unplanned:p.unplanned,planned:p.planned,qc:p.qc,refs:p.references})),large:large?.parts[0],stocks:stock.length,stockQty:productionRestockQty(stock[0]),candidate:getAllOutstandingPrintNeeds().map(p=>({qty:p.qty,variant:p.variantId})),total:rows.length};
  });
  assert.equal(data.small[0].qty,8,'QC is a reason for the same order gap, not extra qty');
  assert.equal(data.small[0].planned,3);assert.equal(data.small[0].unplanned,5);assert.equal(data.small[0].qc,true);
  assert.equal(data.small[0].refs[0].pitemId,'p1');assert.equal(data.large.qty,4,'Unstarted order included');
  assert.equal(data.stocks,1,'Sales and snapshot SKU appear once');assert.equal(data.stockQty,5,'Policies never add their quantities');
  assert.deepEqual(data.candidate.map(p=>p.qty).sort(),[4,5],'Cancelled demand excluded and reservations deducted once');
  assert.deepEqual(await page.evaluate(()=>mergePrintNeedRows([1,2].map(n=>({modelId:'m',partId:'body',qty:n,references:[{pitemId:'p'+n}]})))[0].references.map(r=>r.pitemId)),['p1','p2'],'Merged planner rows retain every source identity');
  assert.equal(await page.evaluate(()=>pageLayoutItems('reminders').length),0,'Legacy layout preferences cannot hide unified queue controls');
  assert.equal(await page.locator('.page.active .page-layout-btn').isVisible(),false);
  const edge=await page.evaluate(()=>{
   const retryFn=getPlanRetryNeeds,externalFn=fulfillmentWorkshopRows,savedParts=pitems,savedPlans=operations.printPlans;
   try{
    pitems=[];operations.printPlans=[];
    getPlanRetryNeeds=()=>[2,3].map(qty=>({modelId:'m',variantId:'s',partId:'body',filamentId:'red',qty,source:'plan-retry'}));
    const retries=getProductionNeedRows({},false).flatMap(row=>row.parts).reduce((n,p)=>n+p.unplanned,0);
    getPlanRetryNeeds=()=>[];
    fulfillmentWorkshopRows=()=>[{source:'external',externalKey:'legacy-qc',m:models[0],it:{modelId:'m',qty:2},reports:[{manualItems:[{modelId:'m',partId:'body',partName:'Thân',qty:2}]}],handover:{qcStatus:'rejected',reprintQty:2}}];
    const reviewRows=getProductionNeedRows(),blocked=reviewRows.find(row=>row.externalKey==='legacy-qc'),orphan=reviewRows.find(row=>row.id==='qc-review:issue');
    productionNeedsState.policies.test='sales';const fromStock=productionRestockPolicy({sku:'test',alert:{}});
    productionNeedsState.policies.test='stock';const fromSales=productionRestockPolicy({sku:'test',sale:{}});
    return {retries,blocked:blocked?.blockedQcQty,guessable:blocked?.parts.length,orphan:orphan?.blockedQcQty,fromStock,fromSales};
   }finally{getPlanRetryNeeds=retryFn;fulfillmentWorkshopRows=externalFn;pitems=savedParts;operations.printPlans=savedPlans;}
  });
  assert.equal(edge.retries,5,'Independent failed plates must sum before comparing against order gap');
  assert.equal(edge.blocked,2,'Old QC without part ID remains visible');assert.equal(edge.guessable,0,'Never guess part for legacy QC');
  assert.equal(edge.orphan,3,'Order QC with missing pitem stays in the review queue');
  assert.equal(edge.fromStock,'stock');assert.equal(edge.fromSales,'sales');
  assert.equal(await page.evaluate(async()=>{const original=refreshPageFromCloud;let destination;try{refreshPageFromCloud=async page=>{destination=page;return true;};await refreshProductionNeeds();return destination;}finally{refreshPageFromCloud=original;}}),'inventory','Unified refresh also refreshes archived sales index');
  await page.evaluate(()=>planProductionNeed(encodeURIComponent('order:m:l')));
  assert.ok(await page.evaluate(()=>printPlanSuggestionState.entries.some(r=>r.variantId==='l'&&r.qty===4)),'Plan keeps variant and actual remainder');
  await page.evaluate(()=>closeDialog('dlg-mv'));
  await page.locator('.page.active .production-source-filter').selectOption('stock');
  assert.equal(await page.locator('.page.active [data-production-need="stock:SKU-0"]').count(),1);
  await page.locator('.page.active [data-production-need="stock:SKU-0"] select').selectOption('stock');
  assert.equal(await page.evaluate(()=>productionRestockQty(getProductionNeedRows().find(r=>r.sku==='SKU-0'))),4);
  await page.locator('.page.active .production-needs-more').click();
  assert.equal(await page.locator('.page.active .production-need-card').count(),80,'All rows reachable beyond previous 36-SKU limit');
  const search=page.getByRole('searchbox',{name:'Tìm việc cần in'});
  await search.fill('san pham 7');assert.ok(await search.evaluate(el=>el===document.activeElement),'Search preserves focus');
  assert.equal(await page.locator('.page.active .production-need-card').count(),11,'Accent insensitive shared search');
  await search.fill('');
  await page.evaluate(()=>{productionNeedsState.source='all';renderRemindersPage();});
  await page.evaluate(()=>document.getElementById('pg-content').scrollTo(0,0));
  await page.waitForTimeout(400);
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,cards:[...document.querySelectorAll('.page.active .production-need-card')].every(el=>el.getBoundingClientRect().right<=innerWidth+1),touch:[...document.querySelectorAll('.page.active .production-mode,.page.active .production-needs-toolbar select')].every(el=>el.getBoundingClientRect().height>=43.99)}));
  assert.equal(layout.overflow,false);assert.equal(layout.cards,true);assert.equal(layout.touch,true);
  await page.screenshot({path:`${out}/${width}-${theme}-needs.png`});
  for(const route of ['plates','print-plans','progress','inventory']){
   await page.evaluate(route=>goPage(route,{historyMode:'none'}),route);
   await page.waitForTimeout(400);
   assert.equal(await page.locator('.page.active .production-mode').count(),3,'Three workspace modes on every legacy route');
   assert.equal(await page.locator('#sidebar [data-sidebar-page="production"].active').count(),1);
   if(width>=1000)assert.ok(await page.evaluate(()=>{const root=document.querySelector('.page.active'),nav=root.querySelector('.production-navigation-slot'),tabs=[...nav.querySelectorAll('.production-mode')],style=getComputedStyle(root),contentWidth=root.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);return nav.getBoundingClientRect().width>=contentWidth-2&&tabs.every(tab=>Math.abs(tab.getBoundingClientRect().top-tabs[0].getBoundingClientRect().top)<2);}), `Workspace nav spans grid columns on ${route} instead of fragmenting into filter sidebar`);
   if(route==='progress')await page.screenshot({path:`${out}/${width}-${theme}-progress.png`});
   if(route==='plates')await page.screenshot({path:`${out}/${width}-${theme}-plates.png`});
  }
  // Per-origin authorization: store-only accounts cannot see order/QC records.
  const role=await page.evaluate(()=>{currentUser={id:'qa-store'};canAccess=permission=>permission==='kiot.import';const rows=getProductionNeedRows();goPage('production',{historyMode:'none'});return {types:rows.map(r=>r.type),mode:productionMode(curPage),tabs:document.querySelectorAll('.page.active .production-mode').length};});
  assert.ok(role.types.every(t=>t==='stock'));assert.equal(role.mode,'needs');assert.equal(role.tabs,1);
  assert.equal(await page.locator('#more-sheet-ov [data-sidebar-page="production"]').count(),1,'One production entry in More menu');
  assert.equal(await page.locator('#more-sheet-ov [data-sidebar-page="plates"],#more-sheet-ov [data-sidebar-page="reminders"],#more-sheet-ov [data-sidebar-page="inventory"]').count(),0,'Legacy pages no longer fragment navigation');
  await page.evaluate(()=>{currentUser=null;setProductionNeedsFilter('source','stock');setProductionNeedsQuery('san pham 7');goPage('plates');});
  await page.goBack();await page.waitForTimeout(300);
  assert.equal(await page.locator('.page.active input[aria-label="Tìm việc cần in"]').inputValue(),'san pham 7','Back restores search and source');
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof goPage==='function');
  assert.equal(await page.evaluate(()=>productionNeedsState.query),'san pham 7','Initial route restores query before auth bootstrap');
  // Activate the destination just as authenticated bootstrap does in the app.
  await page.evaluate(()=>{document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');goPage(curPage,{historyMode:'replace'});});
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.page.active input[aria-label="Tìm việc cần in"]').inputValue(),'san pham 7','Reload restores view without rewriting records');
  assert.deepEqual(errors,[]);
  console.log(`PASS production ${width}/${theme}: consolidation, QC/stock dedupe, unstarted/cancelled, variants, schedule, search, 80 SKU, aliases, permissions, layout`);
  await context.close();
 }
}finally{await browser.close();}
