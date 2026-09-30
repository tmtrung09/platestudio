import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const executablePath=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try {
  for(const width of [320,390,1024,1440])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.route(/^https?:/,route=>route.abort());
    const page=await context.newPage();
    await page.goto(pathToFileURL(resolve('plate-studio.html')).href);
    await page.evaluate(theme=>{
      document.documentElement.dataset.theme=theme;
      document.getElementById('auth-ov').style.setProperty('display','none','important');
      models=[{id:'a',name:'Model A',parts:[],variants:[{id:'aa',name:'Biến thể aa'}],cats:[]},{id:'b',name:'Model B',parts:[],variants:[],cats:[]}];
      operations.products=[];
      goPage('models');
    },theme);
    // Both tabs share the same selected, hover and keyboard-focus styles.
    for(const view of ['models','products']){
      const tab=page.locator(`[data-model-library="${view}"]`);
      await tab.click();
      await tab.hover();
      await tab.focus();
      const contrast=await new AxeBuilder({page}).include('.model-library-switch').withRules(['color-contrast']).analyze();
      assert.deepEqual(contrast.violations,[],`${width}/${theme}/${view}: tab contrast`);
      assert.equal(await tab.getAttribute('aria-pressed'),'true');
      assert.ok(await tab.evaluate(el=>el===document.activeElement));
    }
    await page.locator('[data-model-library="products"]').click();
    await page.locator('#model-products-panel').waitFor({state:'visible'});
    assert.match(await page.locator('#product-library-list').innerText(),/Chưa có sản phẩm/);
    assert.equal(await page.locator('#model-grid').isVisible(),false);
    await page.locator('#model-products-panel button').click();
    await page.locator('#product-name').fill('Sản phẩm C');
    await page.locator('.product-editor button').filter({hasText:'+ Thêm model'}).click();
    await page.locator('.product-component-row input').nth(1).fill('2');
    await page.locator('.product-component-row input').nth(1).press('Tab');
    const layout=await page.locator('.product-editor').evaluate(dialog=>{
      const rect=dialog.getBoundingClientRect();
      return {fits:rect.left>=0&&rect.right<=innerWidth+1&&dialog.scrollWidth<=dialog.clientWidth+1,smallControls:[...dialog.querySelectorAll('select,input,button')].flatMap(el=>{const r=el.getBoundingClientRect();return r.width>=24&&r.height>=32&&r.right<=rect.right+1?[]:[{tag:el.tagName,text:el.textContent,label:el.getAttribute('aria-label'),width:r.width,height:r.height,right:r.right,dialogRight:rect.right}];})};
    });
    assert.ok(layout.fits&&!layout.smallControls.length,JSON.stringify({width,theme,layout}));
    await page.locator('.product-editor button').filter({hasText:'Lưu sản phẩm'}).click();
    assert.equal(await page.locator('#dlg-mv').isVisible(),false);
    assert.match(await page.locator('#product-library-list').innerText(),/Sản phẩm C[\s\S]*Biến thể aa[\s\S]*Model B[\s\S]*×2/);
    await page.locator('#product-library-search').fill('aa');
    assert.equal(await page.locator('.product-library-card').count(),1);
    await page.locator('#product-library-search').fill('không tồn tại');
    assert.equal(await page.locator('.product-library-card').count(),0);
    await page.locator('#product-library-search').fill('');
    await page.locator('.product-library-actions button').first().click();
    assert.equal(await page.locator('#product-name').inputValue(),'Sản phẩm C');
    assert.equal(await page.locator('.product-component-row input').nth(1).inputValue(),'2');
    await page.locator('#product-name').fill('Bộ C mới');
    await page.locator('.product-editor button').filter({hasText:'Lưu sản phẩm'}).click();
    await page.locator('[data-model-library="models"]').click();
    assert.equal(await page.locator('#model-products-panel').isVisible(),false);
    assert.equal(await page.locator('#model-grid').isVisible(),true);
    await page.locator('[data-model-library="products"]').click();
    assert.match(await page.locator('#product-library-list').innerText(),/Bộ C mới/);
    // Reload reads the same recipe from the existing operations persistence.
    await page.reload();
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.getElementById('auth-ov').style.setProperty('display','none','important');goPage('models');setModelLibraryView('products');},theme);
    assert.match(await page.locator('#product-library-list').innerText(),/Bộ C mới/);
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('.product-library-actions button').filter({hasText:'Xóa'}).click();
    assert.equal(await page.locator('.product-library-card').count(),0);
    assert.equal(await page.evaluate(()=>productCatalog().length),0);
    console.log(`PASS product library ${width}/${theme}: page tabs, empty/search, create/edit/delete, quantities, reload, controls and layout`);
    await context.close();
  }
} finally {await browser.close();}
