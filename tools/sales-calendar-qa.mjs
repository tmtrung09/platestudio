import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('qa-results/sales-calendar');mkdirSync(out,{recursive:true});
const profiles=process.argv.includes('--baseline')?[{width:1600,height:900}]:[{width:320,height:740},{width:390,height:844},{width:640,height:360},{width:1280,height:900},{width:1600,height:900},{width:1920,height:1080}];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const profile of profiles)for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:profile,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await context.route(/^https?:/,route=>route.abort());
 await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
 await page.evaluate(theme=>{
  document.documentElement.dataset.theme=theme;document.getElementById('auth-ov').style.setProperty('display','none','important');cloudReady=false;currentUser={id:'qa-calendar'};canAccess=()=>true;cloudWorkspaceId=()=> 'qa-calendar';
  sb={rpc:async()=>({data:[]})};loadKiotSalesArchiveIndex=async()=>[];kiotSalesArchiveLoaded=true;kiotInventoryLedger.loaded=true;loadKiotInventoryLedger=async()=>{kiotInventoryLedger.loaded=true;return true;};
  kiotViet={catalog:[],mappings:[],sales:[],salesImports:[11,12,13].map((day,index)=>({id:'calendar-'+day,period:{from:'2026-08-'+day,to:'2026-08-'+day},importedAt:'2026-08-14T00:00:00Z',sales:index===2?[]:[{sku:'QA',name:'Model kiểm thử',qty:index+3,revenue:1000}]}))};
  kiotSalesRangeToday=()=> '2026-10-14';refreshKiotSalesRangeAutomation=async()=>{};window.qaCalendarData=JSON.stringify(kiotViet);salesPageReportId='calendar-11';salesPageDatePreset='all';salesPageCalendarOpen=true;salesPageCalendarMonth='2026-08';goPage('sales',{historyMode:'none'});
 },theme);
 const measure=async(selector,mode)=>{
  const calendar=page.locator(selector);await calendar.waitFor({state:'visible'});await page.waitForTimeout(350);
  const box=await calendar.evaluate(el=>{const rect=el.getBoundingClientRect(),grid=el.querySelector('.kiot-sales-calendar-grid'),days=[...el.querySelectorAll('.kiot-sales-calendar-day')];return {width:rect.width,height:rect.height,overflow:el.scrollWidth>el.clientWidth+1,dayHeights:days.map(day=>day.getBoundingClientRect().height),rows:new Set([...grid.children].map(day=>Math.round(day.getBoundingClientRect().top))).size,controls:[...el.querySelectorAll('header button,footer button')].map(button=>({height:button.getBoundingClientRect().height,width:button.getBoundingClientRect().width})),recorded:!!el.querySelector('.is-recorded'),missing:!!el.querySelector('.is-missing')};});
  await calendar.screenshot({path:resolve(out,profile.width+'-'+profile.height+'-'+theme+'-'+mode+'.png')});
  assert.ok(box.width<=380.01&&!box.overflow&&box.height<=430,JSON.stringify({profile,theme,mode,box}));
  assert.ok(box.dayHeights.every(height=>height>=43.99&&height<=44.01),'Day height remains 44px independent of viewport width: '+JSON.stringify({mode,box}));
  assert.equal(box.rows,6,'Six-week month retains every row');assert.ok(box.recorded&&box.missing,'Data markers remain visible');assert.ok(box.controls.every(control=>control.width>=43.99&&control.height>=43.99),'Month/clear actions retain touch targets');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page has no horizontal overflow');
  return calendar;
 };
 let calendar=await measure('#sales-page .kiot-sales-calendar','sales');
 await calendar.locator('time[datetime="2026-08-11"]').click();await page.locator('#sales-page time[datetime="2026-08-12"]').click();
 assert.deepEqual(await page.evaluate(()=>salesPageCustomRange),{from:'2026-08-11',to:'2026-08-12'});assert.equal(await page.locator('.sales-history-button').count(),2);assert.equal(await page.locator('#sales-period').count(),0);assert.equal(await page.locator('.sales-kpi b').first().textContent(),'7');await page.getByRole('button',{name:'Bỏ chọn',exact:true}).click();assert.equal(await page.locator('.sales-history-button').count(),3);
 await page.locator('#sales-page .kiot-sales-calendar').getByRole('button',{name:'Tháng trước',exact:true}).focus();assert.equal(await page.locator('#sales-page .kiot-sales-calendar').getByRole('button',{name:'Tháng trước',exact:true}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>salesPageCalendarMonth),'2026-07');
 await page.locator('#sales-page .kiot-sales-calendar').getByRole('button',{name:'Tháng sau',exact:true}).click();assert.equal(await page.evaluate(()=>salesPageCalendarMonth),'2026-08');
 await page.getByRole('button',{name:'Đóng lịch',exact:true}).click();assert.equal(await page.locator('#sales-page .kiot-sales-calendar').count(),0);
 await page.evaluate(()=>{kiotSalesHistoryCalendarMonth='2026-08';openKiotSalesHistoryManager();});calendar=await measure('#dlg-mv .kiot-sales-calendar','history');await calendar.locator('time[datetime="2026-08-11"]').click();assert.equal(await page.locator('.kiot-sales-history-row').count(),1);await page.getByRole('button',{name:'Đóng',exact:true}).last().click();
 await page.evaluate(async()=>{await openKiotSalesRangeDialog();kiotSalesRangeCalendarMonth='2026-08';renderKiotSalesRangeCalendar();});calendar=await measure('#kiot-sales-range-calendar .kiot-sales-calendar','backfill');await calendar.locator('time[datetime="2026-08-13"]').click();await page.locator('#kiot-sales-range-calendar time[datetime="2026-08-15"]').click();assert.deepEqual(await page.evaluate(()=>kiotSalesMissingDays(document.getElementById('kiot-sales-range-from').value,document.getElementById('kiot-sales-range-to').value)),['2026-08-13','2026-08-14','2026-08-15']);
 await page.evaluate(()=>{kiotSalesRangeCalendarMonth='2026-10';renderKiotSalesRangeCalendar();});assert.equal(await page.locator('time[datetime="2026-10-15"]').evaluate(el=>el.closest('button').disabled),true);assert.equal(await page.evaluate(()=>JSON.stringify(kiotViet)===qaCalendarData),true,'Calendar layout/filtering never modifies source data');
 assert.deepEqual(errors,[]);await context.close();console.log('PASS compact sales calendar '+profile.width+'x'+profile.height+'/'+theme+': sales/history/backfill, six rows, fixed height, range/data markers, keyboard, future and source preservation');
}}finally{await browser.close();}
