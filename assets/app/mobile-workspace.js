/* Mobile presentation owners. Existing nodes are shared widgets, never copied forms.
   No data reads/writes, request queues or permission policy live in this module. */
(() => {
  const registry=window.PlateMobileRoutes;if(!registry)return;
  const media=matchMedia('(max-width:860px), (max-width:1100px) and (pointer:coarse)');
  const records=new Set(),folds=new Set(),tables=new Set(),categoryState=new Map(),foldState=new Map(),scrollTransfers=new Map(),boundTools=new WeakSet();
  let scheduled=false,working=false,lastMode=null,orderStep='catalog',orderVisible=false,categoriesOpen=false;
  const add=(el,name)=>{if(el&&!el.classList.contains(name))el.classList.add(name);};
  const attr=(el,name,value)=>{if(el&&el.getAttribute(name)!==String(value))el.setAttribute(name,String(value));};
  const visible=el=>!!(el?.isConnected&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
  const svg=kind=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${kind==='back'?'m14 5-7 7 7 7':kind==='next'?'m9 5 7 7-7 7':'M4 7h16M4 12h16M4 17h16'}"/></svg>`;
  function preserve(run){
    const focus=document.activeElement,start=focus?.selectionStart,end=focus?.selectionEnd;
    const scroll=[...document.querySelectorAll('.pg-content,.dlg,.mws-dialog-body,.of-cart-scroll')].map(el=>[el,el.scrollLeft,el.scrollTop]);
    run();
    if(focus?.isConnected&&document.activeElement!==focus&&visible(focus)&&!focus.disabled){focus.focus({preventScroll:true});if(typeof start==='number')try{focus.setSelectionRange(start,end);}catch{}}
    scroll.forEach(([el,x,y])=>{if(el.isConnected&&visible(el)){const top=scrollTransfers.has(el)?scrollTransfers.get(el):y;if(Math.abs(el.scrollLeft-x)>.5||Math.abs(el.scrollTop-top)>.5)el.scrollTo({left:x,top,behavior:'instant'});}});scrollTransfers.clear();
  }
  function move(node,parent,before=null){if(node.parentNode===parent&&(before===null?node===parent.lastChild:node.nextSibling===before))return;if(parent.moveBefore&&node.isConnected&&parent.isConnected){try{parent.moveBefore(node,before);return;}catch{}}parent.insertBefore(node,before);}
  function place(node,parent){
    if(node.parentNode===parent)return;
    const marker=document.createComment('mobile presentation slot');node.before(marker);move(node,parent);
    records.add({node,parent,marker});
  }
  function restore(){
    preserve(()=>{
      document.querySelectorAll('.mws-dialog-body').forEach(body=>scrollTransfers.set(body.parentElement,body.scrollTop));
      for(const record of [...records].reverse()){const {node,parent,marker}=record;if(marker.isConnected&&node.parentNode===parent)move(node,marker.parentNode,marker);marker.remove();records.delete(record);}
      document.querySelectorAll('[data-mws-generated]').forEach(el=>el.remove());
      document.querySelectorAll('.mws-route,.mws-dialog,.mws-card-table').forEach(el=>{el.classList.remove('mws-route','mws-dialog','mws-card-table');delete el.dataset.mobileFamily;delete el.dataset.mobileRoute;});
      for(const cell of tables){if(cell.isConnected)cell.removeAttribute('data-mobile-label');}tables.clear();folds.clear();
      for(const [node,hidden] of categoryState)if(node.isConnected)node.hidden=hidden;categoryState.clear();
    });
  }
  function generated(tag,name){const el=document.createElement(tag);el.className=name;el.dataset.mwsGenerated='';return el;}
  function appHeader(){
    if(document.documentElement.dataset.studioSurface!=='app')return;
    const brand=document.querySelector('.platedio-mobile-brand');if(!brand)return;
    let header=document.querySelector('.mws-app-header');
    if(!header){header=generated('div','mws-app-header');header.setAttribute('role','banner');document.body.prepend(header);}
    const nodes=[brand,document.querySelector('.cam-fab'),document.getElementById('page-options-tools'),document.getElementById('system-notification-button')].filter(Boolean);
    nodes.forEach((node,index)=>{place(node,header);if(header.children[index]!==node)move(node,header,header.children[index]||null);});
  }
  function globalTools(){
    const button=document.getElementById('global-scroll-top'),panel=document.getElementById('page-options-panel');if(!button||!panel)return;
    place(button,panel);
    if(!button.querySelector('.mws-scroll-label')){const label=generated('span','mws-scroll-label');label.textContent='Cuộn lên đầu trang';button.append(label);}
    if(!boundTools.has(button)){button.addEventListener('click',()=>{if(media.matches&&typeof closePageOptions==='function')closePageOptions(true);});boundTools.add(button);}
  }
  function routeForPage(page){return registry.native[page.id.replace('page-','')];}
  function pageView(page){
    const policy=routeForPage(page);if(!policy)return;
    add(page,'mws-route');attr(page,'data-mobile-route',page.id.replace('page-',''));attr(page,'data-mobile-family',policy.family);
    // Information cards and production navigation retain their renderer-owned
    // direct-child slots; moving them would create duplicates on a permission refresh.
    let frame=page.querySelector(':scope > .mws-workspace');
    if(!frame){frame=generated('div','mws-workspace');page.append(frame);}
    const focusedWorkspace=page.querySelector(':scope > #fulfillment-page');
    if(focusedWorkspace&&frame.nextElementSibling!==focusedWorkspace)move(frame,page,focusedWorkspace);
    for(const node of [...page.children]){
      if(node===frame||node.matches('.page-heading,.model-link-drop-overlay,.production-navigation-slot,#fulfillment-page,[data-mws-generated]'))continue;
      // A hidden legacy/permission-owned widget must remain under its original
      // selectors; reparenting it could accidentally resurrect a retired view.
      if(node.id!=='filters-models'&&getComputedStyle(node).display==='none')continue;
      place(node,frame);
    }
    frame.querySelectorAll('.sect-hd,.kv-toolbar,.sales-toolbar,.progress-toolbar,.fulfillment-toolbar,.model-library-toolbar').forEach(el=>add(el,'mws-toolbar'));
    const heading=page.querySelector(':scope > .page-heading');
    if(heading&&!heading.querySelector('.mws-identity')){
      const identity=generated('div','mws-identity'),title=document.createElement('div'),subtitle=document.createElement('p');title.setAttribute('role','heading');title.setAttribute('aria-level','1');
      title.textContent=policy.title;subtitle.textContent=heading.querySelector('p')?.textContent||'';identity.append(title,subtitle);heading.prepend(identity);
    }
    if(policy.family==='priorities'){
      // Expose real priority work first; secondary statistics stay available on demand.
      frame.querySelectorAll('.dashboard-role-kpis').forEach(el=>fold(el,'Số liệu tổng quan'));
    }
    if(policy.family==='catalog'){
      frame.querySelectorAll('.model-grid,.order-list,.project-grid,.plate-grid').forEach(el=>add(el,'mws-library'));
      frame.querySelectorAll('.sect-hd').forEach(catalogTools);
      const categories=frame.querySelector('#filters-models');if(categories){if(!categoryState.has(categories))categoryState.set(categories,categories.hidden);categories.hidden=!categoriesOpen;attr(document.getElementById('model-category-toggle'),'aria-expanded',String(categoriesOpen));}
    }
    tableViews(page);
  }
  function catalogTools(toolbar){
    if(toolbar.querySelector(':scope > .mws-catalog-primary'))return;
    const primary=generated('div','mws-catalog-primary'),search=toolbar.querySelector('.page-smart-search'),main=toolbar.querySelector('.btn-ac'),category=toolbar.querySelector('#model-category-toggle')||toolbar.querySelector('.order-filter-toggle,.filter-toggle-btn'),sort=toolbar.querySelector('select');
    const details=generated('details','mws-tools'),summary=document.createElement('summary'),body=document.createElement('div');summary.textContent='Thao tác';body.className='mws-tools-body';details.append(summary,body);
    toolbar.append(primary,details);
    if(search)place(search,primary);if(main)place(main,primary);if(category)place(category,primary);if(sort)place(sort,primary);
    for(const child of [...toolbar.children])if(child!==primary&&child!==details&&!child.hasAttribute('data-mws-generated'))place(child,body);
    details.hidden=!body.querySelector('button,a,input,select,textarea,summary');
  }
  function toggleCategories(force){
    const panel=document.getElementById('filters-models');if(!media.matches||!panel)return false;
    if(!categoryState.has(panel))categoryState.set(panel,panel.hidden);categoriesOpen=typeof force==='boolean'?force:!categoriesOpen;panel.hidden=!categoriesOpen;
    attr(document.getElementById('model-category-toggle'),'aria-expanded',String(categoriesOpen));return true;
  }
  function fold(node,label){
    if(node.closest('.mws-disclosure'))return;
    const details=generated('details','mws-disclosure'),summary=document.createElement('summary'),key=(node.closest('.page')?.id||'')+':'+label;summary.textContent=label;details.dataset.layoutLabel=label;details.open=!!foldState.get(key);details.append(summary);node.before(details);place(node,details);folds.add(details);
    details.addEventListener('toggle',()=>foldState.set(key,details.open));
  }
  function tableViews(root){
    root.querySelectorAll('table').forEach(table=>{
      if(table.closest('.calendar,.kiot-sales-calendar,.sales-calendar,[role=grid]')||table.querySelector('[rowspan]'))return;
      const headers=[...table.querySelectorAll('thead tr:last-child th')].map(th=>th.textContent.trim());if(headers.length<2)return;
      add(table,'mws-card-table');
      table.querySelectorAll('tbody tr').forEach(row=>[...row.children].forEach((cell,i)=>{if(cell.colSpan>1)return;attr(cell,'data-mobile-label',headers[i]||'');tables.add(cell);}));
    });
  }
  function dialogView(dialog){
    if(dialog.closest('#auth-ov,#batch-multi-camera,.ws-dialog')||dialog.matches('.mws-dialog'))return;
    add(dialog,'mws-dialog');
    if(dialog.matches('.model-sku-dialog,.workshop-evidence-dialog,.pp-edit-dlg,.product-editor'))return; // Their existing single-owner bodies already preserve drafts and file inputs.
    const title=dialog.querySelector(':scope > .dlg-title,:scope > .model-detail-title'),footer=dialog.querySelector(':scope > .dlg-actions');
    const previousScroll=dialog.scrollTop,body=generated('div','mws-dialog-body');dialog.insertBefore(body,footer||null);
    for(const child of [...dialog.children])if(child!==title&&child!==footer&&child!==body)place(child,body);
    body.scrollTop=previousScroll;
    tableViews(dialog);
  }
  function orderView(){
    const root=document.getElementById('ov-order-form');if(!root||!visible(root)){orderVisible=false;return;}
    if(!orderVisible){orderStep='catalog';orderVisible=true;}
    attr(root,'data-mobile-family','order');
    let nav=root.querySelector('.mws-order-steps');
    if(!nav){
      nav=generated('nav','mws-order-steps');nav.setAttribute('aria-label','Các bước tạo đơn');
      nav.innerHTML='<button type="button" data-mws-order="catalog">1 · Sản phẩm</button><button type="button" data-mws-order="requirements">2 · Yêu cầu</button>';
      nav.addEventListener('click',event=>{const button=event.target.closest('[data-mws-order]');if(!button)return;orderStep=button.dataset.mwsOrder;syncOrderState(root);if(orderStep==='requirements')root.querySelector('#of-o-note')?.focus({preventScroll:true});});
      root.querySelector('.of-hd')?.after(nav);
    }
    let actions=root.querySelector('.mws-order-actions');
    if(!actions){actions=generated('div','mws-order-actions');actions.innerHTML='<button type="button" class="btn btn-ac">Yêu cầu & xác nhận '+svg('next')+'</button>';root.append(actions);actions.querySelector('button').onclick=()=>{orderStep='requirements';syncOrderState(root);root.querySelector('#of-o-note')?.focus({preventScroll:true});};}
    syncOrderState(root);
  }
  function syncOrderState(root){
    attr(root,'data-mobile-order-step',orderStep);
    root.querySelectorAll('[data-mws-order]').forEach(button=>{attr(button,'aria-current',button.dataset.mwsOrder===orderStep?'step':'false');});
    const catalog=root.querySelector('.of-cat-pane'),cart=root.querySelector('.of-cart-pane');
    if(catalog)catalog.inert=orderStep!=='catalog';if(cart)cart.inert=orderStep!=='requirements';
    const empty=!(Number(root.querySelector('#of-cart-count')?.textContent)||0);const next=root.querySelector('.mws-order-actions button');if(next)next.disabled=empty;
    const requirements=root.querySelector('[data-mws-order="requirements"]');if(requirements)requirements.disabled=empty;
  }
  function setOrderStep(step){
    if(!media.matches||!document.getElementById('page-order-form')?.classList.contains('active'))return false;
    orderStep=step==='requirements'?'requirements':'catalog';orderVisible=true;
    const root=document.getElementById('ov-order-form');if(root)syncOrderState(root);sync();return true;
  }
  function externalView(){
    const surface=document.documentElement.dataset.studioSurface;
    if(surface!=='custom')return;
    const page=document.body.dataset.page==='counter'?'custom-orders':'order-status',policy=registry.surfaces[page];
    attr(document.body,'data-mobile-route',page);attr(document.body,'data-mobile-family',policy.family);
    const app=document.getElementById('app');if(!app)return;
    // One requirements form and one draft: mobile arranges the same owned widgets.
    app.querySelectorAll('.product-layout,.customer-columns,.work-grid').forEach(el=>add(el,'mws-flow'));
    app.querySelectorAll('.form-actions,.product-actions').forEach(el=>add(el,'mws-form-actions'));
    tableViews(app);
  }
  function apply(){
    if(working)return;working=true;
    try{
      const enabled=media.matches;attr(document.documentElement,'data-mobile-studio',enabled?'active':'desktop');
      if(!enabled){if(lastMode===true){restore();document.querySelectorAll('#of-cart-pane,.of-cat-pane').forEach(el=>el.inert=false);if(typeof applyPageLayout==='function'&&typeof curPage!=='undefined')applyPageLayout(curPage);}lastMode=false;return;}
      lastMode=true;
      for(const record of [...records])if(!record.node.isConnected&&!record.marker.isConnected)records.delete(record);
      for(const cell of tables)if(!cell.isConnected)tables.delete(cell);
      for(const fold of folds)if(!fold.isConnected)folds.delete(fold);
      preserve(()=>{
        appHeader();
        globalTools();
        document.querySelectorAll('.page.active').forEach(pageView);
        document.querySelectorAll('.dlg-ov .dlg').forEach(dialog=>{if(visible(dialog))dialogView(dialog);});
        orderView();externalView();
      });
      const view=window.visualViewport,height=Math.round(view?.height||innerHeight),offset=Math.round(view?.offsetTop||0);
      const root=document.documentElement;attr(root,'data-mobile-short-view',height<=500?'true':'false');if(root.style.getPropertyValue('--mws-view-height')!==height+'px')root.style.setProperty('--mws-view-height',height+'px');if(root.style.getPropertyValue('--mws-view-top')!==offset+'px')root.style.setProperty('--mws-view-top',offset+'px');
    }finally{working=false;}
  }
  function sync(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply();});}
  window.PlateMobileWorkspace={sync,toggleCategories,setOrderStep,active:()=>media.matches,inventory:()=>registry,inspect:()=>({active:media.matches,routes:Object.keys(registry.native),surfaces:Object.keys(registry.surfaces),mounted:[...document.querySelectorAll('.mws-route')].map(el=>el.dataset.mobileRoute),duplicateIds:[...document.querySelectorAll('[id]')].map(el=>el.id).filter((id,i,all)=>all.indexOf(id)!==i)})};
  const start=()=>{new MutationObserver(sync).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','open','disabled']});media.addEventListener('change',sync);window.visualViewport?.addEventListener('resize',sync);window.visualViewport?.addEventListener('scroll',sync);window.addEventListener('resize',sync);sync();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
