import assert from 'node:assert/strict';
import {resolve} from 'node:path';

export async function assertPrinterAlerts(page, profile, theme, seed) {
  const alert = page.getByRole('alertdialog');
  const send = (type, serial) => page.evaluate(({type,serial}) => {
    const event={id:'machine-0:alert-'+serial,type,title:'Mỹ Mỹ · '+({printer_finished:'In xong',printer_paused:'Tạm dừng',printer_failed:'Thất bại',printer_stopped:'Dừng in'}[type]),detail:'Flower Coasters · Trạng thái do máy báo, không suy đoán nguyên nhân.',deviceId:'machine-0',jobKey:'run-0',severity:type==='printer_failed'?'error':'info',createdAt:new Date().toISOString()};
    PlatePrinterMonitor.receive({...pmFixture,events:[{seq:10+serial,data:event}]});
  }, {type,serial});
  // An existing form must retain its input, caret and modal, then release the queue.
  await page.locator('[data-pm-action="connect"]').click();
  const input=page.getByRole('textbox',{name:'Email Bambu',exact:true});await input.fill('draft@example.invalid');await input.focus();
  await send('printer_finished',1);await page.waitForTimeout(1100);
  assert.equal(await alert.count(),0,'Printer alert waits behind an existing form');
  assert.equal(await input.inputValue(),'draft@example.invalid');assert.equal(await input.evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');await alert.waitFor({state:'visible'});
  assert.equal(await page.locator('.system-notification-popup[data-event-id="printer:machine-0:alert-1"]').count(),0,'Critical transition never uses a timed corner popup');
  assert.equal(await alert.locator('.notification-dismiss').count(),0,'Required alert has no dismiss X');
  assert.ok(await alert.locator('.pm-alert-icon svg').evaluate(el=>getComputedStyle(el).fill==='none'&&getComputedStyle(el).stroke!=='none'),'SVG primitive retains its stroke outside the printer page');
  assert.ok(await alert.evaluate(el=>{const r=el.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&Math.abs((r.left+r.right)/2-innerWidth/2)<2&&[...el.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)&&getComputedStyle(el).borderTopWidth==='0px';}),'Centered, borderless dialog fits all viewports with touch targets');
  await page.keyboard.press('Escape');await page.mouse.click(2,2);assert.equal(await alert.isVisible(),true,'Escape and outside click cannot acknowledge');
  await page.evaluate(()=>{window.pmAlertShortcutHits=0;document.addEventListener('keydown',()=>pmAlertShortcutHits++,{capture:true,once:true});});await page.keyboard.press('Delete');assert.equal(await page.evaluate(()=>pmAlertShortcutHits),0,'Background selection shortcuts cannot delete behind a required alert');
  await alert.getByRole('button',{name:'Đã biết',exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await alert.evaluate(el=>el.contains(document.activeElement)),true,'Tab stays in the alert');
  await page.screenshot({path:resolve('qa-results/printers',`${profile.width}-${profile.height}-${theme}-required-alert.png`)});
  await send('printer_paused',2);await send('printer_finished',1);
  assert.match(await alert.locator('.pm-alert-queue').textContent(),/2 thông báo/,'Distinct events queue; duplicate telemetry does not add another');
  if(profile.width===1280&&theme==='light') {await page.waitForTimeout(7500);assert.equal(await alert.isVisible(),true,'Required alert has no seven-second timer');}
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.PlatePrinterMonitor);await seed(page,theme);await alert.waitFor({state:'visible'});
  assert.match(await alert.locator('h2').textContent(),/In xong/,'Unacknowledged alert survives reload');
  await page.evaluate(()=>markSystemNotificationsRead());assert.equal(await alert.isVisible(),true,'Bulk read does not acknowledge a required printer alert');
  await alert.getByRole('button',{name:'Đã biết',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.pm-alert-card h2')?.textContent.includes('Tạm dừng'));
  await alert.getByRole('button',{name:'Xem máy',exact:true}).click();await alert.waitFor({state:'detached'});
  assert.match(await page.locator('.pm-detail h2').textContent(),/Mỹ Mỹ/,'View action selects the exact machine');await page.locator('.pm-detail [data-pm-action="close-detail"]').click();
  await send('printer_finished',1);await page.waitForTimeout(300);assert.equal(await alert.count(),0,'Acknowledged event never reopens on replay');
  for(const [type,serial] of [['printer_failed',3],['printer_stopped',4]]) {await send(type,serial);await alert.waitFor({state:'visible'});assert.equal(await alert.getByRole('button',{name:'Bỏ qua cảnh báo'}).count(),0);assert.ok(await alert.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth+1;}),'Halted-machine issues fit a short landscape viewport');await alert.getByRole('button',{name:'Đã biết',exact:true}).focus();await page.keyboard.press('Enter');await alert.waitFor({state:'detached'});}
  if(profile.width===1280&&theme==='light') {
    await send('printer_paused',5);await alert.waitFor({state:'visible'});
    await page.evaluate(()=>{window.pmOriginalWorkspace=activeWorkspace;activeWorkspace={...activeWorkspace,workspace_id:'33333333-3333-4333-8333-333333333333'};});await alert.waitFor({state:'detached'});
    await page.evaluate(()=>{activeWorkspace=pmOriginalWorkspace;});await alert.waitFor({state:'visible'});assert.match(await alert.locator('h2').textContent(),/Tạm dừng/,'Pending alerts remain scoped to workspace and user');
    await alert.getByRole('button',{name:'Đã biết',exact:true}).click();await alert.waitFor({state:'detached'});
    // A second tab shares pending records and acknowledgments, not two modal stacks.
    await send('printer_finished',6);await alert.waitFor({state:'visible'});
    const other=await page.context().newPage();await other.goto(page.url(),{waitUntil:'domcontentloaded'});await other.waitForFunction(()=>!!window.PlatePrinterMonitor);await seed(other,theme);await other.waitForTimeout(1200);
    const otherAlert=other.getByRole('alertdialog');assert.equal(await alert.count()+await otherAlert.count(),1,'Web Locks allow only one presenter across tabs');
    const presenter=await alert.count()?alert:otherAlert;await presenter.getByRole('button',{name:'Đã biết',exact:true}).click();await page.waitForTimeout(1100);
    assert.equal(await alert.count()+await otherAlert.count(),0,'Acknowledgment propagates to another tab without reopening');await other.close();
    // Failed local acknowledgment must leave the notice and a truthful retry path.
    await send('printer_paused',7);await alert.waitFor({state:'visible'});
    await page.evaluate(()=>{window.pmAlertSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('ps_printer_alerts_v1_'))throw new DOMException('QA quota failure','QuotaExceededError');return pmAlertSet.call(this,key,value);};});
    await alert.getByRole('button',{name:'Đã biết',exact:true}).click();assert.equal(await alert.isVisible(),true);assert.match(await alert.locator('.pm-alert-status').textContent(),/Chưa lưu được xác nhận/);
    await page.evaluate(()=>{Storage.prototype.setItem=pmAlertSet;});await alert.getByRole('button',{name:'Đã biết',exact:true}).click();await alert.waitFor({state:'detached'});
    await send('printer_paused',8);await alert.waitFor({state:'visible'});await page.evaluate(()=>{canAccess=()=>false;PlatePrinterMonitor.render();});assert.equal(await alert.count(),0,'Revoked printer permissions immediately hide required alerts');await page.evaluate(()=>{canAccess=()=>true;PlatePrinterMonitor.render();});await alert.waitFor({state:'visible'});await alert.getByRole('button',{name:'Đã biết',exact:true}).click();await alert.waitFor({state:'detached'});
  }
  assert.equal(await page.evaluate(()=>operations.events.length),0,'Alert acknowledgment does not mutate business data');
}
