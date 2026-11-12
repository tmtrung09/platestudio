import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdirSync} from 'node:fs';
import {waitForAppReady} from './app-ready-qa.mjs';

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const screenshots=resolve('qa-results/cloud-activity');
mkdirSync(screenshots,{recursive:true});
try{
  for(const [width,theme,reduced] of [[320,'dark','reduce'],[1280,'light','no-preference']]){
    const page=await browser.newPage({viewport:{width,height:760},hasTouch:true,reducedMotion:reduced});
    await page.route(/^https?:/,route=>route.abort());
    await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
    await waitForAppReady(page);
    await page.locator('#auth-ov').waitFor({state:'visible'});
    await page.evaluate(theme=>{
      document.documentElement.dataset.theme=theme;
      document.getElementById('auth-ov').style.display='none';
      currentUser={id:'qa-cloud-activity'};activeWorkspace={workspace_id:'qa-one'};cloudReady=true;loadingCloud=false;
      cloudOutbox=[{},{}];
      setSyncState('Đang đồng bộ...');
      const requests={models:Promise.withResolvers(),orders:Promise.withResolvers()};
      sb={from:key=>({select:()=>({eq:()=>({order:()=>requests[key].promise})})})};
      window.qaRequests=requests;
      void readCloudActivityCollection('models','qa-one');
      void readCloudActivityCollection('orders','qa-one');
    },theme);
    const trigger=page.locator('#cloud-activity-trigger'),panel=page.locator('#cloud-activity-details');
    await trigger.waitFor({state:'visible'});
    await trigger.press('Enter');
    await panel.waitFor({state:'visible'});
    assert.equal(await trigger.getAttribute('aria-expanded'),'true');
    assert.deepEqual(await panel.locator('li').allTextContents(),['Tải model','Tải đơn hàng','2 thay đổi đang chờ xác nhận']);
    const bounds=await panel.boundingBox();
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
    await panel.screenshot({path:resolve(screenshots,`tasks-${width}-${theme}.png`)});
    await page.evaluate(()=>qaRequests.models.resolve({data:[]}));
    await page.waitForFunction(()=>!document.getElementById('cloud-activity-tasks').textContent.includes('Tải model'));
    await page.keyboard.press('Escape');
    assert.ok(await panel.isHidden());
    assert.equal(await trigger.evaluate(button=>document.activeElement===button),true);
    await trigger.click();
    await page.evaluate(()=>{activeWorkspace={workspace_id:'qa-two'};cloudOutbox=[];setSyncState('Đã đồng bộ','ok');qaRequests.orders.resolve({data:[]});});
    assert.ok(await panel.isHidden());
    await trigger.waitFor({state:'hidden'});

    await page.evaluate(()=>{
      const scroller=document.getElementById('pg-content');
      scroller.style.setProperty('overflow-y','auto','important');
      scroller.style.maxHeight='350px';scroller.scrollTop=0;
      const target=document.createElement('div');target.id='qa-pull-target';target.style.minHeight='1400px';scroller.prepend(target);
      window.qaRefreshCalls=0;
      refreshPageFromCloud=async ()=>{qaRefreshCalls++;return true;};
      window.qaTouch=(type,x,y,count=1)=>{
        const target=document.getElementById('qa-pull-target');
        const touches=type==='touchend'||type==='touchcancel'?[]:Array.from({length:count},(_,i)=>new Touch({identifier:i,target,clientX:x+i*20,clientY:y}));
        target.dispatchEvent(new TouchEvent(type,{touches,bubbles:true,cancelable:true}));
      };
    });
    const pull=page.locator('#pull-refresh');
    await page.evaluate(()=>{qaTouch('touchstart',80,120);qaTouch('touchmove',82,150);});
    assert.equal(await pull.textContent(),'Kéo xuống để làm mới');
    assert.ok(await pull.isVisible());
    await page.evaluate(()=>qaTouch('touchend',82,150));
    assert.equal(await page.evaluate(()=>qaRefreshCalls),0);
    await page.evaluate(()=>{qaTouch('touchstart',80,120);qaTouch('touchmove',81,240);});
    assert.equal(await pull.textContent(),'Thả để làm mới');
    assert.equal(await pull.evaluate(el=>getComputedStyle(el).getPropertyValue('--pull-offset')),reduced==='reduce'?'0px':'10px');
    await pull.screenshot({path:resolve(screenshots,`pull-${width}-${theme}.png`)});
    await page.evaluate(()=>qaTouch('touchend',81,240));
    assert.equal(await page.evaluate(()=>qaRefreshCalls),1);
    assert.ok(await pull.isHidden());
    await page.evaluate(()=>{
      qaTouch('touchstart',80,120);qaTouch('touchmove',205,220);qaTouch('touchend',205,220);
      qaTouch('touchstart',80,120,2);qaTouch('touchmove',80,240,2);qaTouch('touchend',80,240);
    });
    const scrollPosition=await page.locator('#pg-content').evaluate(scroller=>{
      scroller.scrollTo({top:80,behavior:'instant'});
      return {top:scroller.scrollTop,height:scroller.scrollHeight,viewport:scroller.clientHeight};
    });
    assert.ok(scrollPosition.top>0,JSON.stringify(scrollPosition));
    await page.evaluate(()=>{
      qaTouch('touchstart',80,120);qaTouch('touchmove',80,240);qaTouch('touchend',80,240);
    });
    assert.equal(await page.evaluate(()=>qaRefreshCalls),1);
    assert.ok(await pull.isHidden());
    await page.evaluate(()=>{document.getElementById('pg-content').scrollTo({top:0,behavior:'instant'});});
    const area=await page.locator('#pg-content').boundingBox();
    const cdp=await page.context().newCDPSession(page);
    const x=Math.round(area.x+area.width/2),y=Math.round(area.y+30);
    for(const [type,touchPoints] of [
      ['touchStart',[{x,y}]],['touchMove',[{x,y:y+48}]],['touchMove',[{x,y:y+125}]],['touchEnd',[]]
    ])await cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
    assert.equal(await page.evaluate(()=>qaRefreshCalls),2,'A real Chromium touch gesture refreshes once');
    await page.close();
    console.log(`PASS cloud activity and pull to refresh ${width}/${theme}: live tasks, scope, keyboard, threshold, scroll and reduced motion`);
  }
}finally{await browser.close();}
