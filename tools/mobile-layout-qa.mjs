import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {waitForAppReady} from './app-ready-qa.mjs';

const out=resolve('qa-results/mobile-layout');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  for(const width of [320,426,1280])for(const theme of ['light','dark']){
    const mobile=width<861;
    const page=await browser.newPage({viewport:{width,height:668},hasTouch:mobile,reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route(/^https?:/,route=>route.abort());
    await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
    await waitForAppReady(page);
    await page.evaluate(theme=>{
      document.documentElement.dataset.theme=theme;
      document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');
      isWorkspaceOwner=()=>true;canAccess=()=>true;canManageBatchReports=()=>true;
      sb=null;currentUser=null;cloudReady=false;maybeStartPageGuide=()=>{};
      window.PhotoAlbumOwner={...window.PhotoAlbumOwner,canManage:()=>true};
      batchReports=Array.from({length:24},(_,i)=>({id:'qa-mobile-'+i,createdAt:new Date().toISOString(),status:'pending',image:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E',appliedItems:[],manualItems:[]}));
      brAiQueue={running:false,ids:[],states:{}};
    },theme);
    const open=async route=>{
      await page.evaluate(route=>goPage(route,{historyMode:'none'}),route);
      if(mobile)await page.waitForFunction(route=>document.querySelector('.page.active')?.dataset.mobileRoute===route,route);
    };

    await open('packaging');
    const hero=page.locator('.packaging-hero.page-info-card');
    await hero.waitFor();
    await hero.locator('.packaging-summary b').evaluate(el=>{el.textContent='0/141';});
    if(mobile){
      const layout=await hero.evaluate(el=>{
        const rect=selector=>el.querySelector(selector).getBoundingClientRect();
        const count=rect('.packaging-summary b'),label=rect('.packaging-summary span');
        const summary=rect('.packaging-summary'),art=rect('.page-info-art'),button=rect('.page-info-motion');
        return {
          height:el.getBoundingClientRect().height,gap:label.left-count.right,stacked:label.top>=count.bottom+3,
          sharedRow:Math.abs((summary.top+summary.bottom-art.top-art.bottom)/2)<3,
          noOverlap:summary.right<=art.left&&art.right<=button.left&&button.width>=44&&button.height>=44,
        };
      });
      assert.ok(layout.height<205&&(layout.gap>=8||layout.stacked)&&layout.sharedRow&&layout.noOverlap,JSON.stringify(layout));
    }
    if(width===426)await hero.screenshot({path:resolve(out,`packaging-${theme}.png`)});

    await open('batches');
    const toolbar=page.locator('.batch-library-toolbar');
    const queue=toolbar.getByRole('button',{name:'Phân tích 24',exact:true});
    await queue.waitFor();
    const controls=await toolbar.evaluate(el=>{
      const rect=selector=>el.querySelector(selector).getBoundingClientRect().toJSON();
      return {sort:rect('#batch-report-sort'),multi:rect('#btn-batch-multi-select'),more:rect('.batch-library-more summary'),queue:rect('.batch-ai-queue .btn')};
    });
    if(mobile)assert.ok(controls.sort.width<=132,JSON.stringify(controls.sort));
    if(width===426)assert.ok(Math.max(...Object.values(controls).map(r=>r.top))<Math.min(...Object.values(controls).map(r=>r.bottom)),JSON.stringify(controls));
    assert.ok(Object.values(controls).every(r=>r.left>=0&&r.right<=width+1&&r.height>=43.99),JSON.stringify(controls));
    if(width===426)await toolbar.screenshot({path:resolve(out,`batches-${theme}.png`)});

    await open('dashboard');
    await page.evaluate(()=>{
      const host=document.getElementById('dashboard-command');
      if(!host.querySelector('.dashboard-focus-row'))host.insertAdjacentHTML('beforeend','<section class="dashboard-focus"><div class="dashboard-focus-row"><i></i><div>QC part</div><button class="btn btn-ghost btn-xs">Kiểm QC</button></div></section>');
    });
    const action=page.locator('.dashboard-focus-row>.btn-ghost').first();
    assert.equal(await action.evaluate(el=>getComputedStyle(el).backgroundColor!==getComputedStyle(el.parentElement).backgroundColor),true);
    if(mobile){
      const disclosure=page.locator('#dashboard-command .mws-disclosure>summary');
      assert.ok(await disclosure.evaluate(el=>parseFloat(getComputedStyle(el).paddingInlineStart)>=12));
      await disclosure.press('Enter');
      assert.ok(await disclosure.evaluate(el=>el.parentElement.open));
      await open('models');
      const details=page.locator('#page-models .mws-tools:visible').first();
      const tools=details.locator('summary');
      await tools.waitFor({state:'visible'});
      assert.ok(await tools.evaluate(el=>parseFloat(getComputedStyle(el).paddingInlineStart)>=12));
      await tools.focus();
      await page.keyboard.press('Enter');
      await details.locator('xpath=self::*[@open]').waitFor({state:'visible'});
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    assert.deepEqual(errors,[]);
    await page.close();
    console.log(`PASS annotated layouts ${width}/${theme}`);
  }
}finally{await browser.close();}
