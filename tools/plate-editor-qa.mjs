import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const executablePath=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(existsSync);
mkdirSync('qa-results/plate-editor',{recursive:true});
const browser=await chromium.launch({executablePath,headless:true});
try{
 for(const width of [320,390,700,1100,1440])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:800}});
  await context.route(/^https?:/,route=>route.abort());
  const page=await context.newPage();
  await page.goto(pathToFileURL(resolve('plate-studio.html')).href);
  await page.addStyleTag({content:'#auth-ov{display:none!important}'});
  await page.evaluate(theme=>{
   document.documentElement.dataset.theme=theme;document.getElementById('auth-ov').style.display='none';
   currentUser=null;cloudReady=false;orders=[];pitems=[];plates=[];batchReports=[];operations={};
   fils=[{id:'qa-white',name:'Trắng',hex:'#fff',brand:'PLA'}];
   const art='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#cacac2"/><rect x="60" y="35" width="80" height="130" rx="20" fill="#f8f5ee"/><circle cx="85" cy="70" r="6"/><circle cx="115" cy="70" r="6"/></svg>');
   models=Array.from({length:40},(_,i)=>({id:'qa-'+i,name:i===0?'Minecraft Skeleton – Print in place Articulated':'Model kiểm thử '+i,images:i%3?[art]:[],parts:[{id:'p',name:'Thân model',filamentIds:['qa-white']}],variants:i===0?[{id:'v',name:'Size lớn',partColors:{}}]:[]}));
   openNightPlanEditor('lucifer');
  },theme);
  const checkLayout=async()=>{
   const state=await page.evaluate(()=>{
    const dlg=document.querySelector('.pp-edit-dlg'),footer=dlg.querySelector('.pp-edit-footer'),bounds=footer.getBoundingClientRect();
    return {overflow:dlg.scrollWidth>dlg.clientWidth+1,footerVisible:bounds.bottom<=innerHeight&&bounds.top>=0,footerHeight:bounds.height,bodyOverflow:dlg.querySelector('.pp-edit-body').scrollWidth>dlg.querySelector('.pp-edit-body').clientWidth+1};
   });
   assert.equal(state.overflow,false,`${width}/${theme} dialog fits`);assert.equal(state.bodyOverflow,false,`${width}/${theme} body fits`);assert.equal(state.footerVisible,true,'Save bar stays within viewport');
  };
  await checkLayout();assert.equal(await page.getByRole('button',{name:'Lưu plate'}).isDisabled(),true);
  await page.locator('.pp-edit-dlg').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
  const tabStyle=await page.locator('[data-plan-tab="all"]').evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect(),active=el.parentElement.querySelector('[aria-selected="true"]'),track=getComputedStyle(el.parentElement),activeStyle=getComputedStyle(active);return {border:s.borderTopWidth,image:s.backgroundImage,bg:s.backgroundColor,font:parseFloat(s.fontSize),height:r.height,track:track.backgroundColor,activeBg:activeStyle.backgroundColor,activeShadow:activeStyle.boxShadow};});
  assert.equal(tabStyle.border,'0px');assert.equal(tabStyle.image,'none');assert.notEqual(tabStyle.track,'rgba(0, 0, 0, 0)');assert.notEqual(tabStyle.activeBg,'rgba(0, 0, 0, 0)');assert.notEqual(tabStyle.activeShadow,'none');assert.ok(tabStyle.font<=12&&tabStyle.height>=33.5&&tabStyle.height<=36,`Segmented tabs stay compact while distinct: ${JSON.stringify(tabStyle)}`);
  assert.equal(await page.locator('.pp-need-tabs').evaluate(el=>{const top=el.firstElementChild.offsetTop;return [...el.children].every(child=>child.offsetTop===top);}),true,'Tabs never wrap into a second bulky row');
  await page.evaluate(()=>{window.editorNodes={shell:document.querySelector('.pp-edit-dlg'),search:document.querySelector('.pp-picker-search input'),grid:document.querySelector('.pp-picker-grid'),cards:[...document.querySelectorAll('.pp-picker-card')]};});
  await page.getByRole('searchbox',{name:'Tìm model, part hoặc biến thể'}).fill('Skeleton');
  const searchFocus=await page.locator('.pp-picker-search input').evaluate(input=>{
   const field=getComputedStyle(input),shell=getComputedStyle(input.parentElement);
   return {outline:field.outlineStyle,shadow:field.boxShadow,outerRing:shell.boxShadow!=='none'};
  });
  assert.deepEqual(searchFocus,{outline:'none',shadow:'none',outerRing:true},'Composite search has exactly one shell focus ring');
  if(width===390||width===1440)await page.locator('.pp-picker-search').screenshot({path:`qa-results/plate-editor/focus-${width}-${theme}.png`});
  const familyFocus=await page.evaluate(()=>{
   const result=[];
   for(const name of ['more-search','br-manual-model-input']){
    const shell=document.createElement('div');shell.className=name;const input=document.createElement('input');shell.append(input);document.querySelector('.pp-edit-dlg').append(shell);input.focus();
    const inner=getComputedStyle(input),outer=getComputedStyle(shell);
    result.push(inner.outlineStyle==='none'&&inner.boxShadow==='none'&&(outer.outlineStyle!=='none'||outer.boxShadow!=='none'));shell.remove();
   }
   return result;
  });
  assert.deepEqual(familyFocus,[true,true],'More-menu and report-picker searches share the single-ring rule');
  assert.equal(await page.locator('#pp-picker-count').textContent(),'1 model','Result count follows query');
  assert.equal(await page.locator('.pp-picker-card:visible').count(),1);
  await page.locator('.pp-picker-card:visible').click();
  assert.equal(await page.evaluate(()=>editorNodes.shell===document.querySelector('.pp-edit-dlg')&&editorNodes.search===document.querySelector('.pp-picker-search input')&&editorNodes.grid===document.querySelector('.pp-picker-grid')&&editorNodes.cards.every(card=>card.isConnected)),true,'Selection never remounts dialog, search or catalogue images');
  await page.getByRole('button',{name:'Tăng số lượng',exact:true}).click();
  assert.equal(await page.locator('#pp-plan-qty').inputValue(),'2');
  await page.getByRole('button',{name:'Giảm số lượng',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Giảm số lượng',exact:true}).isDisabled(),true,'Quantity cannot go below one');
  assert.equal(await page.locator('.pp-picker-add').textContent(),'＋ Thêm vào plate');
  await page.locator('.pp-picker-add').hover();
  assert.equal(await page.locator('.pp-picker-add').evaluate(el=>{const s=getComputedStyle(el);return s.borderTopWidth==='0px'&&s.backgroundImage==='none'&&s.boxShadow==='none'&&s.animationName==='none';}),true,'Both themes keep flat buttons, including hover');
  assert.equal(await page.getByRole('button',{name:'Tăng số lượng',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44;}),true,'Stepper has a usable touch target');
  await page.locator('.pp-picker-selected input').fill('3');await page.locator('.pp-picker-add').click();
  assert.equal(await page.locator('.pp-edit-total b').textContent(),'3 part');
  assert.equal(await page.getByRole('button',{name:'Lưu plate'}).isEnabled(),true);
  assert.equal(await page.locator('.pp-picker-search input').inputValue(),'Skeleton','Selection preserves search');
  await page.locator('.pp-picker-add').click();assert.equal(await page.locator('.pp-edit-total b').textContent(),'6 part');
  assert.equal(await page.locator('.pp-queued-row').count(),1,'Same part merges into one queue row');
  await checkLayout();
  await page.evaluate(()=>document.querySelector('.pp-edit-body').scrollTop=9999);await checkLayout();
  await page.getByRole('button',{name:'Lưu plate'}).focus();
  assert.equal(await page.getByRole('button',{name:'Lưu plate'}).evaluate(el=>el===document.activeElement),true,'Save remains keyboard accessible');
  if(width===390||width===1440){await page.waitForTimeout(300);await page.screenshot({path:`qa-results/plate-editor/${width}-${theme}.png`});}
  await page.getByRole('button',{name:'Bỏ Thân model'}).click();assert.equal(await page.getByRole('button',{name:'Lưu plate'}).isDisabled(),true);
  await page.getByRole('searchbox',{name:'Tìm model, part hoặc biến thể'}).fill('khongtimthayzzz');
  assert.equal(await page.locator('#night-plan-model-picker-empty').isVisible(),true);
  await page.evaluate(()=>{getNightPrintPlan().machines.lucifer.slots[0].filamentId='qa-white';renderNightPlanEditor();});
  await page.getByRole('button',{name:'Chỉ màu khớp'}).click();assert.equal(await page.getByRole('button',{name:'Tất cả model'}).getAttribute('aria-pressed'),'true');
  await checkLayout();
  await page.evaluate(()=>selectNightPlanModel('qa-1'));
  assert.equal(await page.locator('.pp-picker-selected select').count(),1,'Models without variants show only part selection');
  await page.locator('.pp-picker-add').click();
  await page.getByRole('button',{name:'Lưu plate'}).click();
  assert.equal(await page.evaluate(()=>getNightPrintPlan().machines.lucifer.plate.items[0].modelId),'qa-1','Save preserves the chosen model in the plan');
  await page.evaluate(()=>{models=[];openNightPlanEditor('lucifer');});
  assert.equal(await page.locator('#night-plan-model-picker-empty').isVisible(),true,'Empty catalogue explains the empty state');
  const dataChecks=await page.evaluate(()=>{
   models=Array.from({length:3},(_,i)=>({id:'need-'+i,name:'Nhu cầu '+i,parts:[{id:'p',name:'Thân',qtyPerModel:i===2?2:1,filamentIds:['qa-white']}],variants:[]}));
   orders=[{id:'need-order',items:[{id:'i0',modelId:'need-0',qty:8},{id:'i1',modelId:'need-1',qty:5}]}];
   pitems=[{id:'pending',orderId:'need-order',itemId:'i0',modelId:'need-0',partId:'p',qty:10,qtyDone:2,filamentId:'qa-white'},{id:'bad',orderId:'need-order',itemId:'i1',modelId:'need-1',partId:'p',partName:'Thân',qty:5,qtyDone:0,filamentId:'qa-white'}];
   operations={qualityIssues:[{id:'q',orderId:'need-order',itemId:'i1',modelId:'need-1',partId:'bad',qty:2,status:'open'}]};
   kiotViet={catalog:[{sku:'sku2',name:'Sản phẩm bán',stock:0,minStock:2}],mappings:[{sku:'sku2',modelId:'need-2'}],sales:[{sku:'sku2',qty:4}],salesImports:[{id:'latest',importedAt:'2026-09-19',sales:[{sku:'sku2',name:'Sản phẩm bán',qty:4}]}]};
   openNightPlanEditor('lucifer');const groups=printPlanEditState.needGroups;
   return {missing:groups.missing.find(n=>n.modelId==='need-0')?.qty,defects:groups.defects.find(n=>n.modelId==='need-1')?.qty,sold:groups.sold.find(n=>n.modelId==='need-2')?.qty,suggested:groups.suggested.find(n=>n.modelId==='need-2')?.qty};
  });
  assert.deepEqual(dataChecks,{missing:8,defects:2,sold:8,suggested:8},'Tabs derive real demand and multiply sales by parts per model');
  await page.getByRole('tab',{name:/Bù lỗi/}).click();
  assert.equal(await page.locator('.pp-picker-card:visible').count(),1);
  await page.locator('.pp-picker-card:visible').click();assert.equal(await page.locator('#pp-plan-qty').inputValue(),'2','Selecting a need prefills its actual quantity');
  await page.locator('.pp-picker-add').click();assert.equal(await page.locator('.pp-picker-card:visible').count(),0,'Queued need no longer suggested twice');
  await page.getByRole('tab',{name:/Bù đã bán/}).click();assert.equal(await page.locator('.pp-picker-card:visible').count(),1);
  await page.getByRole('tab',{name:/Gợi ý thêm/}).click();assert.equal(await page.locator('.pp-picker-card:visible').count(),1);
  const editedNeeds=await page.evaluate(()=>{
   saveNightPlanEditor();openNightPlanEditor('lucifer');const before=nightPlanTabNeeds('defects').length;
   removeNightPlanEditorItem(0);return {before,after:nightPlanTabNeeds('defects')[0]?.qty};
  });
  assert.deepEqual(editedNeeds,{before:0,after:2},'Editing and removing an existing planned row restores demand without double subtraction');
  await checkLayout();
  console.log(`PASS plate editor ${width}/${theme}: layout, search/count, add/merge/remove, filters, persistent actions`);
  await context.close();
 }
}finally{await browser.close();}
