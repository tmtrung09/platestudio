import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const executablePath=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
mkdirSync(resolve('qa-results/product-library'),{recursive:true});
try {
  for(const width of [320,390,1024,1440])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.route(/^https?:/,route=>route.abort());
    const page=await context.newPage();
    await page.goto(pathToFileURL(resolve('plate-studio.html')).href);
    await page.evaluate(theme=>{
      document.documentElement.dataset.theme=theme;
      document.getElementById('auth-ov').style.setProperty('display','none','important');
      models=[{id:'a',name:'Model A',images:['https://qa.invalid/missing.jpg'],parts:[],variants:[{id:'aa',name:'Biến thể aa'}],cats:['QA']},{id:'b',name:'Model B',parts:[],variants:[],cats:[]}];
      operations.products=[];
      FILTERS.models={...FILTERS.models,cat:'all',search:'',sort:'created_desc'};
      saveLocalValue(K.models,models);
      goPage('models');
    },theme);
    const category=async value=>{
      const button=page.locator(`[data-model-category="${value}"]`);
      if(width<=860){
        const toggle=page.locator('#model-category-toggle');
        if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
      }else if(!await button.isVisible())await page.locator('#ftbtn-models').click();
      await button.click();
      assert.equal(await button.getAttribute('aria-pressed'),'true');
    };
    assert.equal(await page.locator('.model-library-switch,#model-products-panel,#product-library-search').count(),0,'No split library or duplicate search');
    assert.equal(await page.locator('#model-grid [data-model-id]').count(),2);
    await category('__composite_products__');
    assert.match(await page.locator('#model-grid').innerText(),/Chưa có sản phẩm/);
    assert.equal(await page.locator('#model-smart-search').isVisible(),true);
    assert.equal(await page.locator('#model-sort').isVisible(),true);
    assert.equal(await page.locator('#btn-add-to-model-category').isVisible(),false);
    assert.equal(await page.locator('[data-model-category="__composite_products__"] .category-drop-actions').count(),0);
    await category('all');
    await page.locator('#btn-add-product').click();
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
    assert.match(await page.locator('.product-library-card').innerText(),/Sản phẩm C[\s\S]*Biến thể aa[\s\S]*Model B[\s\S]*×2/);
    assert.equal(await page.locator('#model-grid > .model-card').count(),3,'Products and models share one grid');
    assert.equal(await page.locator('#cnt-models').textContent(),'3');
    assert.equal(await page.locator('.product-kind-mark').innerText(),'Ghép','Mark survives failed thumbnail');
    assert.ok(await page.locator('.product-kind-mark').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)<=12&&el.getBoundingClientRect().height<28),'Mark stays compact instead of inheriting the photo placeholder size');
    const edit=page.locator('.product-library-actions button').first();
    await edit.hover();await edit.focus();
    assert.ok(await edit.evaluate(el=>el===document.activeElement&&el.getBoundingClientRect().height>=44));
    const contrast=await new AxeBuilder({page}).include('.product-library-card').withRules(['color-contrast']).analyze();
    assert.deepEqual(contrast.violations,[],`${width}/${theme}: product card contrast`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}/${theme}: page overflow`);
    await page.screenshot({path:resolve(`qa-results/product-library/${width}-${theme}.png`),fullPage:true});
    await page.locator('#model-sort').selectOption('name_desc');
    assert.ok(await page.locator('#model-grid > .model-card').first().getAttribute('data-product-id'),'Common name sort includes products');
    await category('QA');
    assert.equal(await page.locator('#model-grid > .model-card').count(),1);
    assert.equal(await page.locator('.product-library-card').count(),0);
    await category('__composite_products__');
    assert.equal(await page.locator('#model-grid > .model-card').count(),1);
    await category('all');
    const search=page.locator('#model-smart-search');
    await search.fill('aa');await page.waitForTimeout(250);
    assert.equal(await page.locator('.product-library-card').count(),1);
    await search.fill('không tồn tại');await page.waitForTimeout(250);
    assert.equal(await page.locator('.product-library-card').count(),0);
    await search.fill('');await page.waitForTimeout(250);
    await page.locator('.product-library-actions button').first().click();
    assert.equal(await page.locator('#product-name').inputValue(),'Sản phẩm C');
    assert.equal(await page.locator('.product-component-row input').nth(1).inputValue(),'2');
    await page.locator('#product-name').fill('Bộ C mới');
    await page.locator('.product-editor button').filter({hasText:'Lưu sản phẩm'}).click();
    assert.match(await page.locator('#model-grid').innerText(),/Bộ C mới/);
    await page.locator('#btn-select-models').click();
    assert.equal(await page.locator('.product-library-card input[type="checkbox"]').count(),0,'Product must not enter model-only bulk deletion');
    await page.locator('#btn-select-models').click();
    // Reload reads the same recipe from the existing operations persistence.
    await page.reload();
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.getElementById('auth-ov').style.setProperty('display','none','important');goPage('models');setModelFilterCat('all');},theme);
    assert.match(await page.locator('#model-grid').innerText(),/Bộ C mới/);
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('.product-library-actions button').filter({hasText:'Xóa'}).click();
    assert.equal(await page.locator('.product-library-card').count(),0);
    assert.equal(await page.evaluate(()=>productCatalog().length),0);
    assert.equal(await page.locator('#model-grid [data-model-id]').count(),2,'Deleting a product preserves component models');
    console.log(`PASS product library ${width}/${theme}: unified grid, mark, categories, common search/sort, CRUD, quantities, reload, model selection isolation, contrast and layout`);
    await context.close();
  }
} finally {await browser.close();}
