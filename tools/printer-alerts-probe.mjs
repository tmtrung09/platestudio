import {waitForAppReady} from './app-ready-qa.mjs';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {assertButtonContentCentered} from './button-content-probe.mjs';

export async function assertPrinterAlerts(page, profile, theme, seed) {
  const alert=page.getByRole('alertdialog');
  const send=(type,serial,options={})=>page.evaluate(({type,serial,options})=>{
    const id=options.device||'machine-0',device=pmFixture.state.devices[id],at=new Date().toISOString();
    if(options.runId)device.run={...device.run,id:options.runId};
    device.phase=options.phase||({printer_finished:'FINISH',printer_failed:'FAILED',printer_stopped:'IDLE',printer_paused:'PAUSE',printer_resumed:'RUNNING',printer_started:'RUNNING'}[type])||device.phase;
    device.run.result=type==='printer_finished'?'finished':type==='printer_failed'?'failed':type==='printer_stopped'?'stopped':'running';
    device.lastReport=at;device.online=true;
    if(options.issues)device.issues=options.issues;
    else if(['printer_paused','printer_failed','printer_stopped','printer_error'].includes(type))device.issues=[{severity:'error',code:'QA-STOP',text:'Lỗi kiểm thử khiến máy ngừng.',episode:'fault-episode'}];
    const issue=device.issues.find(issue=>issue.severity==='error');
    const event={id:id+':smart-'+serial,type,title:(id==='machine-0'?'Mỹ Mỹ':id)+' · '+({printer_finished:'In xong',printer_paused:'Tạm dừng',printer_failed:'Thất bại',printer_stopped:'Dừng in'}[type]||'Trạng thái'),detail:'Flower Coasters · dữ liệu kiểm thử',deviceId:id,jobKey:device.run.id,severity:type==='printer_error'||type==='printer_failed'?'error':'info',code:type==='printer_error'?issue?.code:null,episode:type==='printer_error'?issue?.episode:null,createdAt:at};
    window.pmLastAlertEvent=event;
    PlatePrinterMonitor.receive({...pmFixture,events:[{seq:100+serial,data:event}]});
  },{type,serial,options});
  const update=patch=>page.evaluate(patch=>{const d=pmFixture.state.devices['machine-0'];Object.assign(d,patch,{lastReport:new Date().toISOString()});PlatePrinterMonitor.receive({...pmFixture,events:[]});},patch);
  const noAlert=async message=>{await page.waitForTimeout(150);assert.equal(await alert.count(),0,message);assert.equal(await page.locator('.system-notification-popup[data-event-id^="printer:"]').count(),0,'Printer state updates never leak to timed popups');};
  await page.locator('[data-pm-action="connect"]').click();
  const input=page.getByRole('textbox',{name:'Email Bambu',exact:true});await input.fill('draft@example.invalid');await input.focus();
  await send('printer_finished',1);await page.waitForTimeout(1100);
  assert.equal(await alert.count(),0,'Alert waits behind a form');assert.equal(await input.inputValue(),'draft@example.invalid');assert.equal(await input.evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');await alert.waitFor({state:'visible'});
  for(const button of await alert.locator('footer .btn').all())await assertButtonContentCentered(button,'current printer alert');
  assert.ok(await alert.locator('.pm-alert-icon svg').evaluate(el=>getComputedStyle(el).fill==='none'&&getComputedStyle(el).stroke!=='none'));
  assert.ok(await alert.evaluate(el=>{const r=el.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&Math.abs((r.left+r.right)/2-innerWidth/2)<2&&[...el.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)&&getComputedStyle(el).borderTopWidth==='0px';}),'Centered, compact, borderless and touch-accessible');
  await page.mouse.click(2,2);assert.equal(await alert.isVisible(),true,'Outside click is not acknowledgment');
  await page.evaluate(()=>{window.pmAlertShortcutHits=0;document.addEventListener('keydown',()=>pmAlertShortcutHits++,{capture:true,once:true});});await page.keyboard.press('Delete');assert.equal(await page.evaluate(()=>pmAlertShortcutHits),0,'Delete never reaches background selection');
  await alert.getByRole('button',{name:'Đã biết',exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await alert.evaluate(el=>el.contains(document.activeElement)),true,'Tab remains trapped');
  await page.screenshot({path:resolve('qa-results/printers',profile.width+'-'+profile.height+'-'+theme+'-required-alert.png')});
  await page.keyboard.press('Escape');await alert.waitFor({state:'detached'});
  await send('printer_finished',1);await noAlert('Esc prevents replay of the same completion');
  await send('printer_started',2,{runId:'run-smart'});await noAlert('Starting is passive');
  await send('printer_error',3,{phase:'RUNNING'});await noAlert('Error while printing is not a halted-machine alert');
  await send('printer_paused',4,{issues:[{severity:'warning',code:'QA-WARN',episode:'warning',text:'Cảnh báo, không phải lỗi.'}]});await noAlert('Warning/manual pause is passive');
  await page.locator('[data-pm-action="connect"]').click();await input.fill('kept@example.invalid');await input.focus();
  await send('printer_paused',5);await send('printer_resumed',6);await page.waitForTimeout(1100);
  assert.equal(await input.inputValue(),'kept@example.invalid');assert.equal(await alert.count(),0);
  await page.keyboard.press('Escape');await noAlert('Resume behind a form discards the queued stop');
  await send('printer_paused',7);await alert.waitFor({state:'visible'});
  await send('printer_error',8);await page.waitForTimeout(200);assert.doesNotMatch(await alert.locator('.pm-alert-queue').textContent(),/2 thông báo/,'Pause and error coalesce');
  await update({issues:[]});await alert.waitFor({state:'detached'});await noAlert('Cleared errors dismiss the paused-machine notice');
  await send('printer_paused',9);await alert.waitFor({state:'visible'});
  await page.evaluate(()=>{pmFixture.connected=false;PlatePrinterMonitor.receive({...pmFixture,events:[]});});await alert.waitFor({state:'detached'});await noAlert('Disconnected telemetry cannot keep presenting a stop');
  await page.evaluate(()=>{pmFixture.connected=true;pmFixture.state.devices['machine-0'].lastReport=new Date(Date.now()-121000).toISOString();PlatePrinterMonitor.receive({...pmFixture,events:[]});});await noAlert('A fresh connection with an old snapshot is still insufficient');
  await send('printer_resumed',10);await alert.waitFor({state:'detached'});await noAlert('Resume closes the alert despite lingering codes');
  await send('printer_paused',11);await alert.waitFor({state:'visible'});await page.keyboard.press('Escape');await alert.waitFor({state:'detached'});
  await send('printer_error',12);await noAlert('Another error in a dismissed halt cannot loop');
  await send('printer_resumed',13);await send('printer_paused',14);await alert.waitFor({state:'visible'});
  await update({run:{id:'run-replacement',result:'running'},phase:'RUNNING'});await alert.waitFor({state:'detached'});await noAlert('New run retires previous notice');
  if(profile.width===1280&&theme==='light'){
    await page.reload({waitUntil:'domcontentloaded'});await waitForAppReady(page);await page.waitForFunction(()=>!!window.PlatePrinterMonitor);await seed(page,theme,{'machine-0':{phase:'RUNNING',run:{id:'run-replacement',result:'running'}}});await noAlert('Reload cannot replay retired stops while the printer is running');
  }
  await send('printer_finished',15);await alert.waitFor({state:'visible'});
  if(profile.width===1280&&theme==='light'){await page.waitForTimeout(7500);assert.equal(await alert.isVisible(),true,'Relevant completion has no timeout');}
  await page.reload({waitUntil:'domcontentloaded'});await waitForAppReady(page);await page.waitForFunction(()=>!!window.PlatePrinterMonitor);
  await seed(page,theme,{'machine-0':{phase:'FINISH',run:{id:'run-replacement',result:'finished'}}});await alert.waitFor({state:'visible'});
  assert.match(await alert.locator('h2').textContent(),/In xong/,'Only current completion survives reload');
  await page.evaluate(()=>markSystemNotificationsRead());assert.equal(await alert.isVisible(),true,'Bulk read is not acknowledgment');
  await page.keyboard.press('Escape');await alert.waitFor({state:'detached'});
  await send('printer_paused',16,{runId:'run-next'});await alert.waitFor({state:'visible'});
  await send('printer_failed',17,{device:'machine-1'});await page.waitForTimeout(200);assert.match(await alert.locator('.pm-alert-queue').textContent(),/2 thông báo/,'Different machines remain separate');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.pm-alert-card h2')?.textContent.includes('machine-1'));
  await alert.getByRole('button',{name:'Xem máy',exact:true}).click();await alert.waitFor({state:'detached'});assert.match(await page.locator('.pm-detail h2').textContent(),/Máy 1/);await page.locator('.pm-detail [data-pm-action="close-detail"]').click();
  if(profile.width===1280&&theme==='light'){
    await send('printer_paused',18,{runId:'run-scope'});await alert.waitFor({state:'visible'});
    await page.evaluate(()=>{window.pmOriginalWorkspace=activeWorkspace;activeWorkspace={...activeWorkspace,workspace_id:'33333333-3333-4333-8333-333333333333'};});await alert.waitFor({state:'detached'});
    await page.evaluate(()=>{activeWorkspace=pmOriginalWorkspace;});await alert.waitFor({state:'visible'});await page.keyboard.press('Escape');await alert.waitFor({state:'detached'});
    await send('printer_finished',19,{runId:'run-tabs'});await alert.waitFor({state:'visible'});
    const other=await page.context().newPage();await other.goto(page.url(),{waitUntil:'domcontentloaded'});await waitForAppReady(other);await other.waitForFunction(()=>!!window.PlatePrinterMonitor);await seed(other,theme,{'machine-0':{phase:'FINISH',run:{id:'run-tabs',result:'finished'}}});await other.waitForTimeout(1200);
    const otherAlert=other.getByRole('alertdialog');assert.equal(await alert.count()+await otherAlert.count(),1,'One presenter across tabs');
    const presenter=await alert.count()?page:other;await presenter.keyboard.press('Escape');await page.waitForTimeout(1100);assert.equal(await alert.count()+await otherAlert.count(),0,'Esc propagates across tabs');await other.close();
    await send('printer_paused',20,{runId:'run-quota'});await alert.waitFor({state:'visible'});
    await page.evaluate(()=>{window.pmAlertSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('ps_printer_alerts_v1_'))throw new DOMException('QA quota failure','QuotaExceededError');return pmAlertSet.call(this,key,value);};});
    await alert.getByRole('button',{name:'Đã biết',exact:true}).click();assert.equal(await alert.isVisible(),true);assert.match(await alert.locator('.pm-alert-status').textContent(),/Chưa lưu được xác nhận/);
    await page.keyboard.press('Escape');await alert.waitFor({state:'detached'});await page.evaluate(()=>{Storage.prototype.setItem=pmAlertSet;});await send('printer_error',21);await noAlert('Esc closes in-session even if storage fails');
    await send('printer_paused',22,{runId:'run-access'});await alert.waitFor({state:'visible'});await page.evaluate(()=>{canAccess=()=>false;PlatePrinterMonitor.render();});assert.equal(await alert.count(),0);await page.evaluate(()=>{canAccess=()=>true;PlatePrinterMonitor.render();});await alert.waitFor({state:'visible'});await page.keyboard.press('Escape');await alert.waitFor({state:'detached'});
  }
  await page.evaluate(()=>{pmFixture.state.devices['machine-0'].issues=[{severity:'warning',code:'0300010000030001',text:'Cảnh báo kiểm thử',episode:'2026-10-10T00:00:00Z'}];PlatePrinterMonitor.receive({...pmFixture,events:[]});});
  assert.equal(await page.evaluate(()=>operations.events.length),0,'Filtering and Esc never mutate business records');
}
