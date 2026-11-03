/** Shared orders + Dashboard, isolated records and no live business traffic. */
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {waitForAppReady} from './app-ready-qa.mjs';
const root=resolve('.'),out=resolve('qa-results/custom-order-overview'),base='https://custom-order-overview.test/';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
async function seed(page,theme){
 await page.evaluate(theme=>{
  document.documentElement.dataset.theme=theme;
  currentUser={id:'overview-qa',email:'overview@example.test'};sb=null;cloudReady=false;loadingCloud=false;
  activeWorkspace={workspace_id:'isolated-overview',owner_user_id:'another-owner',role:'custom',permissions:['orders.manage']};
  for(const page of ['dashboard','orders'])savePageGuideProgress(page,{status:'completed'});
  const date=offset=>{const day=new Date();day.setDate(day.getDate()+offset);return customOrderDateKey(day);};
  const custom=(id,due,extra={})=>({id,kind:'custom',note:'Đặt bàn phím tên',status:'processing',deliveryDate:due,orderedBy:'Nhân viên An',createdAt:new Date().toISOString(),custom:{customer:'Khách '+id,phone:'0900000000'},items:[{id:id+'-item',modelId:'keyboard',modelName:'Bàn phím tên',variantName:'Năm ký tự',qty:1}],...extra});
  orders=[...Array.from({length:201},(_,i)=>({id:'regular-'+i,note:'Đơn thường '+i,status:i?'done':'processing',createdAt:new Date().toISOString(),items:[]})),
   custom('custom-late',date(-1),{custom:{customer:'Nguyễn Ánh',phone:'0912345678'}}),
   custom('custom-oldest',date(-2),{custom:{customer:'Khách có tên rất dài để kiểm tra bố cục trên điện thoại và màn hình máy tính'}}),
   custom('custom-today',date(0)),custom('custom-future',date(3)),custom('custom-undated',''),custom('custom-invalid','2026-02-30'),
   custom('custom-received',date(-3),{customCustomerCompletedAt:new Date().toISOString()}),
   custom('custom-done',date(-4),{status:'done'}),custom('custom-cancelled',date(-5),{status:'cancelled'})];
  projects=[];pitems=[];plates=[];models=[{id:'keyboard',name:'Bàn phím tên',images:['missing-qa-image.png'],parts:[]}];
  window.qaOverviewSource=JSON.stringify(orders);applyWorkspaceNavigationPermissions();
 },theme);
}
try{
 for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390},{width:1440,height:900}])for(const theme of ['light','dark']){
  const mobile=viewport.width<=860,context=await browser.newContext({viewport,hasTouch:mobile,isMobile:mobile,serviceWorkers:'block',timezoneId:'Asia/Bangkok',reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];let businessRequests=0;
  page.on('pageerror',error=>errors.push(error.message));
  await context.route(/^https?:/,route=>{
   const url=new URL(route.request().url());
   if(/\/rest\/v1\/|\/functions\/v1\//.test(url.pathname))businessRequests++;
   if(url.origin!==new URL(base).origin)return route.abort();
   const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+sep)||!existsSync(path))return route.abort();
   return route.fulfill({body:readFileSync(path),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(path)]||'application/octet-stream'});
  });
  await page.goto(base+'plate-studio.html',{waitUntil:'domcontentloaded'});await waitForAppReady(page);
  await page.addStyleTag({content:'#auth-ov{display:none!important}'});await seed(page,theme);
  await page.evaluate(()=>goPage('dashboard',{historyMode:'none'}));
  await page.locator('.dashboard-custom').waitFor();
  assert.deepEqual(await page.locator('.dashboard-custom-stat b').allTextContents(),['6','2','1'],'Only unfinished custom orders contribute; receipt/done/cancelled excluded');
  assert.equal(await page.locator('.dashboard-role-kpi[aria-label^="Đơn đang xử lý:"] b').textContent(),'7','General Dashboard total also excludes customer-completed custom orders');
  assert.deepEqual(await page.locator('[data-custom-order-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.customOrderId)),['custom-oldest','custom-late','custom-today','custom-future'],'Nearest commitments come before undated work');
  assert.equal(await page.locator('[data-custom-order-id="custom-late"]').getAttribute('href'),'custom-orders.html?order=custom-late');
  assert.ok(await page.locator('.dashboard-custom-row').evaluateAll(nodes=>nodes.every(node=>{const r=node.getBoundingClientRect();return r.height>=44&&r.width>=44;})),'Dashboard links have touch targets');
  const dates=await page.evaluate(()=>{
   const now=new Date(2026,10,3,0,1),order={kind:'custom',status:'processing'};
   return {today:customOrderDue({...order,deliveryDate:'2026-11-03'},now).state,yesterday:customOrderDue({...order,deliveryDate:'2026-11-02'},now).state,invalid:customOrderDateKey('2026-02-30'),timestamp:customOrderDateKey('2026-11-02T18:00:00Z'),cancel:customOrderDue({...order,status:'cancelled',customCustomerCompletedAt:'stamp',deliveryDate:'2026-11-02'},now).state};
  });
  assert.deepEqual(dates,{today:'today',yesterday:'overdue',invalid:'',timestamp:'2026-11-03',cancel:'closed'},'Local midnight and invalid calendar days');
  assert.equal(await page.evaluate(()=>JSON.stringify(orders)===window.qaOverviewSource),true,'Summary never rewrites source records');
  const audit=await new AxeBuilder({page}).include('.dashboard-custom').analyze();assert.deepEqual(audit.violations.map(issue=>issue.id),[],`${viewport.width}/${theme}: Dashboard accessibility`);
  if([390,1440].includes(viewport.width))await page.locator('.dashboard-custom').screenshot({path:resolve(out,`${viewport.width}-${theme}-dashboard.png`)});
  await page.locator('.dashboard-custom-head button').click();
  assert.equal(await page.locator('[data-order-kind="custom"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#order-list .order-card').count(),9);
  assert.equal(await page.locator('#order-filter-result').textContent(),'9 đơn');
  assert.match(page.url(),/kind=custom/);
  const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,targets:[...document.querySelectorAll('[data-order-kind]')].map(node=>({kind:node.dataset.orderKind,...node.getBoundingClientRect().toJSON()})),borders:[...document.querySelectorAll('[data-order-kind]')].map(node=>getComputedStyle(node).borderWidth)}));
  // Chromium may return 43.99997 for a CSS 44px target after fractional layout.
  assert.equal(geometry.overflow,false,`${viewport.width}/${theme}: overflow`);assert.ok(geometry.targets.every(rect=>rect.height>=43.99&&rect.width>=43.99),JSON.stringify({viewport,theme,geometry}));assert.ok(geometry.borders.every(value=>value==='0px'));
  const input=page.locator('#order-smart-search');await input.fill('nguyen anh');assert.equal(await page.locator('#order-list .order-card').count(),1,'Vietnamese customer search');
  await input.fill('0912345678');assert.equal(await page.locator('#order-list .order-card').count(),1,'Phone search');
  await page.evaluate(()=>{orders.push({id:'new-confirmed-custom',kind:'custom',note:'Đơn mới',status:'processing',items:[],createdAt:new Date().toISOString()});renderOrders();});
  assert.equal(await input.inputValue(),'0912345678');assert.ok(await input.evaluate(node=>node===document.activeElement),'Background refresh retains search focus');
  assert.equal(await page.locator('[data-order-kind="custom"] small').textContent(),'10');
  await input.fill('ban phim ten');assert.equal(await page.locator('#order-list .order-card').count(),9,'Model search combines with custom scope');
  await input.fill('');await page.evaluate(()=>setOrderFilterStatus('done'));assert.equal(await page.locator('#order-list .order-card').count(),2,'Customer receipt is completed in the shared status filter');
  await page.locator('#order-filter-clear').click();assert.equal(await page.locator('#order-list .order-card').count(),10,'Clear keeps the chosen library');
  await page.locator('[data-order-kind="regular"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#order-list .order-card').count(),201,'Keyboard selects the ordinary library');
  await page.goBack();await page.waitForFunction(()=>FILTERS.orders.kind==='custom');assert.equal(await page.locator('#order-list .order-card').count(),10,'Back restores custom scope');
  await input.fill('nguyen anh');await page.reload({waitUntil:'domcontentloaded'});await waitForAppReady(page);await page.addStyleTag({content:'#auth-ov{display:none!important}'});await seed(page,theme);
  await page.evaluate(()=>goPage(pageFromLocation(),{historyMode:'none'}));
  assert.equal(await input.inputValue(),'nguyen anh');assert.equal(await page.locator('#order-list .order-card').count(),1,'Reload restores custom scope and search');
  await page.locator('#order-filter-clear').click();
  if([390,1440].includes(viewport.width))await page.screenshot({path:resolve(out,`${viewport.width}-${theme}-orders.png`)});
  const pickerAudit=await new AxeBuilder({page}).include('.order-kind-picker').analyze();assert.deepEqual(pickerAudit.violations,[],`${viewport.width}/${theme}: picker accessibility`);
  await context.setOffline(true);await page.evaluate(()=>goPage('dashboard'));
  assert.match(await page.locator('.dashboard-custom p').textContent(),/Ngoại tuyến/);assert.deepEqual(await page.locator('.dashboard-custom-stat b').allTextContents(),['6','2','1']);
  await page.evaluate(()=>{orders=[];renderDashboard();});assert.match(await page.locator('.dashboard-custom-empty').textContent(),/Chưa có dữ liệu/,'No false empty claim while offline');
  await context.setOffline(false);await page.evaluate(()=>{cloudReady=true;renderDashboard();});assert.match(await page.locator('.dashboard-custom-empty').textContent(),/Không có đơn/);
  for(const permissions of [['models.manage'],['custom_orders.view'],[]]){
   await page.evaluate(permissions=>{activeWorkspace.permissions=permissions;renderDashboard();},permissions);
   assert.equal(await page.locator('.dashboard-custom').count(),0,'Native Orders permission bounds the shared overview');
   const url=page.url();await page.evaluate(()=>setOrderKind('custom'));assert.equal(page.url(),url,'Stale action cannot bypass revoked permission');
  }
  await page.evaluate(()=>{activeWorkspace.owner_user_id=currentUser.id;renderDashboard();});assert.equal(await page.locator('.dashboard-custom').count(),1,'Workspace owner sees custom overview');
  await page.evaluate(()=>{currentUser=null;renderDashboard();});assert.equal(await page.locator('.dashboard-custom').count(),0,'Sign-out removes custom overview');
  assert.equal(businessRequests,0,'New surfaces add no Supabase reads or writes');assert.deepEqual(errors,[]);
  results.push({viewport,theme,status:'PASS'});await context.close();
 }
 writeFileSync(resolve(out,'result.json'),JSON.stringify({status:'PASS',profiles:results.length,results},null,2));
 console.log(`PASS custom order overview: ${results.length} profiles, shared kind/search/status, receipt completion, local dates, Dashboard links/priority, reload/Back, permissions, offline/cache, 200+ records, no extra business traffic.`);
}finally{await browser.close();}
