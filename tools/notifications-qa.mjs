/** Isolated, network-blocked regression for the entire notification family. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdirSync} from 'node:fs';
const out=resolve('qa-results/notifications');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const profiles=[{width:320,height:740,touch:true},{width:390,height:844,touch:true},{width:640,height:360},{width:640,height:900},{width:1280,height:900}];
try{for(const profile of profiles)for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},hasTouch:!!profile.touch,isMobile:!!profile.touch,reducedMotion:'reduce'});
 await context.route(/^https?:/,route=>route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
 await page.evaluate(theme=>{
  document.documentElement.dataset.theme=theme;document.getElementById('auth-ov').style.setProperty('display','none','important');cloudReady=false;currentUser=null;sb=null;
  isWorkspaceOwner=()=>false;notificationUserKey=()=> 'qa-reader';canAccess=permission=>permission==='assembly.qc';
  orders=[];pitems=[];batchReports=[];models=[];operations={products:[],deliveries:[],deliveryBatches:[],qualityIssues:[],events:[
   {id:'print',type:'print_completed',title:'Mẻ in đã hoàn tất',detail:'Flower Coasters · 3 sản phẩm',createdAt:'2026-10-10T08:00:00Z',permissions:['assembly.qc'],readBy:[]},
   {id:'unknown',title:'Thông báo dài để kiểm tra xuống dòng an toàn trên điện thoại',detail:'Ảnh vẫn được giữ trên thiết bị, không cần chụp lại hay xóa dữ liệu trình duyệt.',createdAt:'2026-10-10T07:00:00Z',recipients:['qa-reader'],readBy:[]},
   {id:'private',title:'Không được lộ',permissions:['members.manage'],recipients:['another'],readBy:[]},
   {id:'legacy',title:'Lịch sử đã đọc',readAt:'2026-10-10',createdAt:'2026-10-09'}
  ]};normalizeOperations();goPage('models',{historyMode:'none'});ensureSystemNotificationButton();
  window.keptDialog=document.getElementById('dlg-mv').innerHTML;window.keptModels=models;
 },theme);
 const bell=page.locator('#system-notification-button'),panel=page.locator('#system-notification-panel');
 assert.equal(await bell.locator('b').textContent(),'2');assert.equal(await bell.locator('svg').count(),1);
 assert.ok(await bell.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.right<=innerWidth&&r.top>=0&&r.top<35;}));
 // Every route header leaves its actions reachable next to the fixed bell.
 for(const route of ['models','sales','kiotviet','orders','progress','fulfillment','plates']){
  await page.evaluate(route=>goPage(route,{historyMode:'none'}),route);
  assert.ok(await page.evaluate(()=>{const b=document.getElementById('system-notification-button').getBoundingClientRect();return [...document.querySelectorAll('.page.active .page-heading button')].every(el=>{const r=el.getBoundingClientRect();return !r.width||r.right<=b.left||r.left>=b.right||r.bottom<=b.top||r.top>=b.bottom;});}),`Header overlap: ${route}/${profile.width}`);
 }
 await bell.click();assert.equal(await panel.isVisible(),true);assert.equal(await bell.getAttribute('aria-expanded'),'true');
 assert.equal(await panel.locator('.notification-row').count(),3);assert.equal(await panel.locator('.notification-row.is-unread').count(),2);assert.doesNotMatch(await panel.textContent(),/Không được lộ/);
 if(!profile.touch)assert.equal(await panel.locator('.notification-dismiss').evaluate(el=>getComputedStyle(el).opacity),'0','Mouse-open does not expose X before hover');
 assert.equal(await page.evaluate(()=>document.getElementById('dlg-mv').innerHTML===keptDialog),true,'Opening must not overwrite business dialog');
 assert.ok(await panel.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.height<=480&&getComputedStyle(el).borderTopWidth==='0px';}));
 const first=panel.locator('[data-event-id="print"]');await first.focus();
 await page.evaluate(()=>{document.querySelector('.notification-panel-list').scrollTop=20;window.keptScroll=document.querySelector('.notification-panel-list').scrollTop;window.keptRow=document.querySelector('[data-event-id="print"]');ensureSystemNotificationButton();});
 assert.equal(await page.evaluate(()=>keptRow===document.activeElement&&keptRow===document.querySelector('[data-event-id="print"]')&&keptScroll===document.querySelector('.notification-panel-list').scrollTop),true,'Background refresh preserves row, focus and scroll');
 await page.keyboard.press('Escape');assert.equal(await panel.isVisible(),false);assert.equal(await bell.evaluate(el=>el===document.activeElement),true);
 await bell.click();await page.mouse.click(5,profile.height-6);assert.equal(await panel.isVisible(),false,'Outside click closes');
 await page.evaluate(()=>{document.getElementById('dlg-mv').innerHTML='<div class="dlg"><input id="qa-unsaved" value="Bản chưa lưu"></div>';document.getElementById('dlg-mv').style.display='flex';openSystemNotifications();});
 assert.equal(await page.locator('#qa-unsaved').inputValue(),'Bản chưa lưu');await page.evaluate(()=>{closeSystemNotifications(false);closeDialog('dlg-mv');});
 await bell.click();await panel.locator('[data-event-id="unknown"]').click();assert.equal(await bell.locator('b').textContent(),'1','Click only reads the selected row');assert.equal(await panel.isVisible(),true);
 await panel.getByRole('button',{name:'Đọc hết',exact:true}).click();assert.equal(await bell.locator('b').count(),0);assert.equal(await panel.isVisible(),true);assert.equal(await page.evaluate(()=>operations.events.find(row=>row.id==='private').readBy.length),0);
 assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem(K.operations)).events.find(row=>row.id==='print').readBy.includes('qa-reader')),'Read state persists');
 const sound=panel.locator('.notification-sound');const prior=await sound.getAttribute('aria-pressed');await sound.click();assert.notEqual(await sound.getAttribute('aria-pressed'),prior);assert.equal(await panel.isVisible(),true);
 await page.evaluate(()=>{for(let i=0;i<48;i++)operations.events.push({id:'long-'+i,title:'Model '+i+' với tên dài cần kiểm tra',detail:'Một dòng thông tin vừa đủ để quyết định.',recipients:['qa-reader'],readBy:[]});ensureSystemNotificationButton();});
 if(profile.width<=860)assert.ok(await panel.evaluate(el=>{const nav=document.querySelector('.mnav').getBoundingClientRect();return el.getBoundingClientRect().bottom<nav.top-20;}),'Panel keeps mobile navigation clear');
 assert.equal(await panel.locator('.notification-row').count(),40);await panel.getByRole('button',{name:'Xem thêm',exact:true}).click();assert.equal(await panel.locator('.notification-row').count(),51);
 await page.screenshot({path:resolve(out,`${profile.width}-${profile.height}-${theme}-dropdown.png`)});
 await page.evaluate(()=>closeSystemNotifications());
 await page.mouse.move(1,1);
 // Feedback and events share one top-right rail and never overlap each other.
 await page.evaluate(()=>{window.keptPage=curPage;toast('Đã lưu thay đổi',60000);showSystemNotificationPopup(operations.events[0],{sound:false});showSystemNotificationPopup(operations.events[0],{sound:false});showSystemNotificationPopup(operations.events.find(row=>row.id==='private'),{sound:false});});
 assert.equal(await page.locator('.system-notification-popup').count(),1);
 const card=page.locator('.system-notification-popup'),close=card.locator('.notification-dismiss');
 assert.equal(await close.evaluate(el=>getComputedStyle(el).opacity),profile.touch?'1':'0');
 if(!profile.touch){await card.hover();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.system-notification-popup .notification-dismiss')).opacity==='1');}
 await close.focus();assert.equal(await close.evaluate(el=>getComputedStyle(el).opacity),'1');
 assert.ok(await close.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44;}));
 assert.ok(await card.evaluate(el=>{const copy=el.querySelector('.system-popup-open>span:last-child'),open=el.querySelector('.system-popup-open').getBoundingClientRect(),close=el.querySelector('.notification-dismiss').getBoundingClientRect();return copy.getBoundingClientRect().width>=120&&copy.scrollWidth<=copy.clientWidth+1&&close.left>=open.right-1;}),'Shared popup content remains readable beside its close control');
 assert.ok(await page.evaluate(()=>{const cards=[...document.querySelectorAll('#toast .notification-card')].map(el=>el.getBoundingClientRect());return cards.every(r=>r.left>=0&&r.right<=innerWidth&&r.top>=60)&&cards.every((r,i)=>!i||r.top>=cards[i-1].bottom)&&[...document.querySelectorAll('#toast .notification-card')].every(el=>getComputedStyle(el).borderTopWidth==='0px');}));
 await page.screenshot({path:resolve(out,`${profile.width}-${profile.height}-${theme}-popups.png`)});
 await close.click();await card.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>curPage===keptPage),true,'Dismiss does not navigate');
 // Opening a dropdown suppresses popups, not their data, and pauses deadlines.
 await page.evaluate(()=>{toast('Thông báo có thời gian ngắn',200);openSystemNotifications();});
 await page.waitForTimeout(300);assert.equal(await page.locator('.t-msg').count(),2);assert.equal(await page.locator('#toast').evaluate(el=>getComputedStyle(el).visibility),'hidden');
 await page.evaluate(()=>closeSystemNotifications(false));await page.mouse.move(1,profile.height-1);await page.waitForTimeout(500);assert.equal(await page.locator('.t-msg').count(),1);
 await page.locator('.t-msg .notification-dismiss').focus();await page.keyboard.press('Escape');await page.locator('.t-msg').waitFor({state:'detached'});
 // Hover/focus pause a short toast for actual reading.
 await page.evaluate(()=>toast('Giữ khi đang đọc',180));await page.locator('.t-msg .notification-dismiss').focus();await page.waitForTimeout(300);assert.equal(await page.locator('.t-msg').count(),1);
 await bell.focus();await page.mouse.move(1,profile.height-1);await page.locator('.t-msg').waitFor({state:'detached'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.evaluate(()=>models===keptModels),true,'No business data changed');
 // A dismissed event does not remove it from history. Swiping must not open it.
 await page.evaluate(()=>showSystemNotificationPopup(operations.events[0],{sound:false}));
 const swipe=page.locator('.system-notification-popup');const box=await swipe.boundingBox();
 await page.mouse.move(box.x+65,box.y+25);await page.mouse.down();await page.mouse.move(box.x+180,box.y+25,{steps:8});await page.mouse.up();await swipe.waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>curPage===keptPage),true,'Swipe cannot trigger the destination');
 assert.ok(await page.evaluate(()=>operations.events.some(event=>event.id==='print')));
 // Pointer capture must not swallow a normal click on the event action.
 await page.evaluate(()=>{canAccess=()=>true;const event={id:'activation',type:'print_completed',title:'Bấm mở gia công',recipients:['qa-reader'],readBy:[]};operations.events.unshift(event);showSystemNotificationPopup(event,{sound:false});});
 await page.locator('.system-popup-open').click();await page.locator('.system-notification-popup').waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>curPage),'fulfillment');assert.ok(await page.evaluate(()=>operations.events[0].readBy.includes('qa-reader')));
 await page.evaluate(()=>{const event={id:'keyboard-activation',type:'order_created',title:'Enter mở đơn',recipients:['qa-reader'],readBy:[]};operations.events.unshift(event);showSystemNotificationPopup(event,{sound:false});});
 await page.locator('.system-popup-open').focus();await page.keyboard.press('Enter');await page.locator('.system-notification-popup').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>curPage),'orders');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{document.getElementById('auth-ov').style.setProperty('display','none','important');cloudReady=false;currentUser=null;sb=null;isWorkspaceOwner=()=>false;notificationUserKey=()=> 'qa-reader';canAccess=permission=>permission==='assembly.qc';ensureSystemNotificationButton();openSystemNotifications();});
 assert.equal(await panel.locator('[data-event-id="print"]').getAttribute('class'),'notification-row','Actual reload retains read state');
 await page.evaluate(()=>{operations.events=[];ensureSystemNotificationButton();});assert.equal(await panel.locator('.notification-row').count(),0);assert.match(await panel.textContent(),/Chưa có thông báo/);
 assert.deepEqual(errors,[]);console.log(`PASS notifications ${profile.width}x${profile.height}/${theme}: dropdown, privacy, durable read state, preserved dialog/focus, all popup close paths/timers, shared borderless rail`);
 await context.close();
}}finally{await browser.close();}
