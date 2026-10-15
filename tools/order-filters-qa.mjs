import {waitForAppReady} from './app-ready-qa.mjs';
/* Order filter layout and interactions, ephemeral fixture with no cloud access. */
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Wait for the anchored menu's hit point before Playwright initiates scrolling.
async function clickOrderFilterOption(page){
  const option=page.locator('#order-filter-options [aria-pressed]');
  assert.equal(await option.count(),1);
  await page.waitForFunction(()=>{
    const option=document.querySelector('#order-filter-options [aria-pressed]');if(!option)return false;
    const rect=option.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    if(!hit||!option.contains(hit)){window.qaFilterHit=null;return false;}
    const box=[rect.x,rect.y,rect.width,rect.height].map(value=>Math.round(value*100)).join(':')+option.textContent,now=performance.now();
    if(window.qaFilterHit?.box!==box){window.qaFilterHit={box,since:now};return false;}
    return now-window.qaFilterHit.since>=150;
  },null,{polling:'raf',timeout:5000}).catch(async error=>{
    const geometry=await page.evaluate(()=>{const menu=document.getElementById('order-filter-menu'),host=document.getElementById('order-filter-options'),option=host?.querySelector('[aria-pressed]'),rect=option?.getBoundingClientRect(),hit=rect&&document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return {width:innerWidth,height:innerHeight,theme:document.documentElement.dataset.theme,key:orderFilterMenuKey,menu:menu?.getBoundingClientRect().toJSON(),host:host?.getBoundingClientRect().toJSON(),option:rect?.toJSON(),hit:hit?.outerHTML.slice(0,200),style:menu?.getAttribute('style'),scroll:document.getElementById('pg-content')?.scrollTop};});
    console.error('Order filter hit-test failure:',JSON.stringify(geometry));
    await page.screenshot({path:out+'/hit-test-failure.png'}).catch(()=>{});throw error;
  });
  await option.click();
}
const out=resolve('qa-results/order-filters');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--allow-file-access-from-files']});
let profiles=0;
try {
  for(const [width,height] of [[320,850],[390,850],[640,360],[640,850],[768,850],[1024,850],[1440,850]])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height},hasTouch:width<600,isMobile:width<600,reducedMotion:'reduce'});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**/*',route=>route.abort());
    await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
 await waitForAppReady(page);
    await page.waitForFunction(()=>typeof goPage==='function');
    await page.evaluate(theme=>{
      document.documentElement.dataset.theme=theme;
      document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');
      projects=[{id:'qa-project',name:'Dự án Tết — Bộ trang trí và phụ kiện tên rất dài'}];
      orders=[
        {id:'qa-one',note:'Đơn đèn lồng',status:'processing',orderedBy:'Nguyễn An',projectId:'qa-project',createdAt:'2026-10-15',items:[]},
        {id:'qa-two',note:'Đơn phụ kiện',status:'done',orderedBy:'Trần Bình',createdAt:'2026-10-14',items:[]},
        {id:'qa-three',note:'Đơn mô hình',status:'pending',orderedBy:'Nguyễn An',createdAt:'2026-10-13',items:[]},
      ];pitems=[];models=[];
      FILTERS.orders={status:'all',projectId:'all',orderedBy:'all',search:''};FILTER_HIDDEN.orders=false;
      goPage('orders',{historyMode:'none'});applyFilterVisibility('orders');
      window.qaOrderSnapshot=JSON.stringify(orders);
    },theme);
    const layout=await page.evaluate(()=>{
      const fields=[...document.querySelectorAll('.order-filter-field')].map(el=>el.getBoundingClientRect());
      return {overflow:document.documentElement.scrollWidth>innerWidth+1,height:document.getElementById('filters-orders').getBoundingClientRect().height,
        sameRow:fields.every(rect=>Math.abs(rect.top-fields[0].top)<1),touch:fields.every(rect=>rect.height>=44&&rect.width>=44)};
    });
    assert.equal(layout.overflow,false,`${width}/${theme}: overflow`);
    assert.ok(layout.touch);
    assert.ok(layout.height<=(width<600?125:60),`${width}/${theme}: filter area is too tall: ${layout.height}`);
    if(width>=640)assert.ok(layout.sameRow,'Desktop filters fit on one row');
    if([390,1440].includes(width)){await page.waitForTimeout(350);await page.screenshot({path:`${out}/${width}-${theme}.png`});}
    await page.locator('#order-filter-project').click();
    if([390,1440].includes(width)){
      const audit=await new AxeBuilder({page}).include('.order-library-toolbar').include('.order-filter-workspace').include('#order-filter-menu').analyze();
      assert.deepEqual(audit.violations.map(issue=>issue.id),[],`${width}/${theme}: filter accessibility`);
    }
    await page.locator('#order-filter-query').fill('du an tet');
    assert.equal(await page.locator('#order-filter-options [aria-pressed]').count(),1,'Accent-insensitive project lookup');
    await clickOrderFilterOption(page);
    assert.equal(await page.locator('#order-list .order-card').count(),1);
    assert.equal(await page.locator('#order-filter-result').textContent(),'1 / 3 đơn');
    assert.equal(await page.locator('#order-filter-project').getAttribute('aria-expanded'),'false');
    assert.ok(await page.locator('#order-filter-project').evaluate(el=>el===document.activeElement));
    await page.locator('#order-filter-status').click();
    await page.locator('#order-filter-query').fill('hoan thanh');
    await clickOrderFilterOption(page);
    assert.equal(await page.locator('#order-list .order-card').count(),0,'Filters combine across dimensions');
    assert.equal(await page.locator('#order-filter-result').textContent(),'0 / 3 đơn');
    await page.locator('#ftbtn-orders').click();
    assert.equal(await page.locator('#filters-orders').isVisible(),false);
    assert.equal(await page.locator('#order-filter-badge').textContent(),'2');
    assert.equal(await page.locator('#order-filter-clear').isVisible(),true,'Clear available while filters hidden');
    await page.locator('#order-filter-clear').click();
    assert.equal(await page.locator('#order-list .order-card').count(),3);
    await page.locator('#ftbtn-orders').click();
    await page.locator('#order-filter-orderer').click();
    await page.locator('#order-filter-query').fill('nguyen an');
    await page.locator('#order-filter-query').press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#order-list .order-card').count(),2);
    await page.locator('#order-smart-search').fill('mo hinh');
    assert.equal(await page.locator('#order-list .order-card').count(),1);
    assert.equal(await page.locator('#order-smart-search').inputValue(),'mo hinh');
    assert.ok(await page.locator('#order-smart-search').evaluate(el=>el===document.activeElement));
    await page.locator('#order-filter-orderer').click();
    await page.locator('#order-filter-query').fill('khong khop');
    assert.equal(await page.locator('.order-filter-empty').textContent(),'Không tìm thấy lựa chọn');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#order-filter-menu').isVisible(),false);
    assert.ok(await page.locator('#order-filter-orderer').evaluate(el=>el===document.activeElement));
    await page.locator('#order-filter-project').click();
    const menu=await page.locator('#order-filter-menu').boundingBox();
    assert.ok(menu.x>=0&&menu.x+menu.width<=width&&menu.y>=0&&menu.y+menu.height<=height,'Menu stays in viewport');
    await page.locator('#order-smart-search').click();
    assert.equal(await page.locator('#order-filter-menu').isVisible(),false,'Outside click closes menu');
    assert.ok(await page.evaluate(()=>window.qaOrderSnapshot===JSON.stringify(orders)),'Filtering never changes source orders');
    await page.locator('#order-filter-clear').click();
    // A library larger than the rendered page remains searchable and reachable.
    await page.evaluate(()=>{
      projects=Array.from({length:150},(_,i)=>({id:`qa-${i}`,name:`Dự án ${i} — tên dài có dấu và ký tự ' " < >`}));
      orders=projects.map((project,i)=>({id:`qa-order-${i}`,projectId:project.id,status:'pending',orderedBy:i===149?'Nguyễn "An" <QA>':'QA',createdAt:'2026-10-15',items:[]}));renderOrders();
    });
    await page.locator('#order-filter-project').click();
    assert.equal(await page.locator('#order-filter-options [aria-pressed]').count(),60);
    await page.getByRole('button',{name:'Xem thêm (91)'}).click();
    assert.equal(await page.locator('#order-filter-options [aria-pressed]').count(),120);
    await page.locator('#order-filter-query').fill('du an 149');
    assert.equal(await page.locator('#order-filter-options [aria-pressed]').count(),1);
    await page.locator('#order-filter-options [aria-pressed]').focus();
    await page.evaluate(()=>renderOrders());
    assert.ok(await page.locator('#order-filter-options [aria-pressed]').evaluate(el=>el===document.activeElement),'Background render retains menu focus');
    await page.evaluate(()=>{orders.push({...orders[149],id:'qa-extra'});renderOrders();});
    assert.ok(await page.locator('#order-filter-options [aria-pressed]').evaluate(el=>el===document.activeElement),'Updated counts retain menu focus');
    await page.evaluate(()=>{orders.pop();renderOrders();});
    if([390,1440].includes(width))await page.screenshot({path:`${out}/${width}-${theme}-menu.png`});
    await clickOrderFilterOption(page);
    assert.equal(await page.locator('#order-list .order-card').count(),1);
    await page.locator('#order-filter-orderer').click();
    await page.locator('#order-filter-query').fill('nguyen');
    await clickOrderFilterOption(page);
    assert.equal(await page.locator('#order-list .order-card').count(),1,'Quoted names remain selectable');
    await page.locator('#order-filter-status').click();
    await page.evaluate(()=>goPage('plates',{historyMode:'none'}));
    assert.equal(await page.locator('#order-filter-menu').isVisible(),false,'Route change closes the portal');
    await page.evaluate(()=>{orders=[];goPage('orders',{historyMode:'none'});clearOrderFilters();});
    assert.equal(await page.locator('#order-filter-result').textContent(),'0 đơn');
    if(height===360){
      // A valid anchor in the middle of a short viewport must leave one usable row.
      await page.evaluate(()=>{const trigger=document.getElementById('order-filter-status');window.qaMidpointAnchor=trigger;document.body.append(trigger);Object.assign(trigger.style,{position:'fixed',top:'156px',left:'12px',width:'200px',zIndex:'1100'});});
      await page.locator('#order-filter-status').click();
      await page.locator('#order-filter-query').fill('tat ca');
      const geometry=await page.evaluate(()=>{const menu=document.getElementById('order-filter-menu').getBoundingClientRect(),host=document.getElementById('order-filter-options');window.qaMidpointStatus=host.querySelector('[aria-pressed]').orderFilterValue;return {top:menu.top,bottom:menu.bottom,options:host.clientHeight};});
      assert.ok(geometry.options>=44&&geometry.top>=8&&geometry.bottom<=height-8,'Mid-viewport menu keeps a clickable option inside the viewport: '+JSON.stringify(geometry));
      await page.screenshot({path:out+'/'+width+'-'+height+'-'+theme+'-midpoint.png'});
      await clickOrderFilterOption(page);
      assert.equal(await page.evaluate(()=>FILTERS.orders.status===qaMidpointStatus),true,'The visible option receives a real click');
      assert.equal(await page.locator('#order-filter-menu').isVisible(),false,'The real option handler closes the menu');
      await page.evaluate(()=>qaMidpointAnchor.remove());
    }
    assert.deepEqual(errors,[],`${width}/${theme}: runtime errors`);
    profiles++;await context.close();
  }
}finally{await browser.close();}
console.log(`Order filters QA PASS: ${profiles} viewport/theme profiles; combined filters, search, keyboard, reset, large library, empty state, source preservation.`);
