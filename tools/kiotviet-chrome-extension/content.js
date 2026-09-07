(()=>{
  if(window.__plateStudioKiotSyncInstalled)return;
  window.__plateStudioKiotSyncInstalled=true;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const visible=element=>!!element&&!!(element.offsetWidth||element.offsetHeight||element.getClientRects().length)&&getComputedStyle(element).visibility!=='hidden';
  const normal=value=>String(value||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('vi');
  // KiotViet giữ lại DOM cũ trong lúc tải báo cáo mới. Những khoảng chờ này
  // giúp extension không bấm tiếp vào giao diện cũ trước khi trang render xong.
  const RENDER={report:3000,picker:550,search:1800,choice:1100,filter:2200,time:5200,exportMenu:2200};
  const click=element=>{element.scrollIntoView({block:'center',inline:'center'});element.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));element.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));element.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));element.click();};
  async function hover(element){
    element.scrollIntoView({block:'center',inline:'center'});const rect=element.getBoundingClientRect();
    try{const result=await chrome.runtime.sendMessage({type:'plate-studio-real-hover',x:rect.left+rect.width/2,y:rect.top+rect.height/2});if(result?.ok)return;}catch{}
    for(const type of ['pointerover','mouseover','mouseenter','pointermove','mousemove'])element.dispatchEvent(new MouseEvent(type,{bubbles:type!=='mouseenter',cancelable:true,view:window}));
  }
  async function realClick(element){
    element.scrollIntoView({block:'center',inline:'center'});const rect=element.getBoundingClientRect();
    try{const result=await chrome.runtime.sendMessage({type:'plate-studio-real-click',x:rect.left+rect.width/2,y:rect.top+rect.height/2});if(result?.ok)return;}catch{}
    click(element);
  }
  async function waitFor(getter,label,timeout=20000){const started=Date.now();while(Date.now()-started<timeout){const value=getter();if(value)return value;await wait(180);}throw new Error(`Không tìm thấy ${label}.`);}
  function firstVisible(selector,root=document){return [...root.querySelectorAll(selector)].find(visible)||null;}
  function pageLoadState(){
    const loaders=[...document.querySelectorAll('.k-loading-mask,.k-loading-image,.animation-loading,.report-loading,[aria-busy="true"]')].filter(visible);
    return {readyState:document.readyState,loaders:loaders.length,popups:[...document.querySelectorAll('.popover,.k-popup,.k-animation-container')].filter(visible).length};
  }
  function textButton(text,{popupOnly=false,startsWith=false}={}){
    const wanted=normal(text),candidates=[...document.querySelectorAll('button,a,label,li,[role="option"],.kv-item-name,.k-item,span')].filter(visible).filter(element=>startsWith?normal(element.textContent).startsWith(wanted):normal(element.textContent)===wanted);
    const filtered=popupOnly?candidates.filter(element=>element.closest('.popover,.k-animation-container,.k-popup,.k-list-container')):candidates;
    const item=(filtered[0]||candidates[0]);return item?.closest('button,a,label,li,[role="option"]')||item||null;
  }
  function categoryCheckbox(text){
    const wanted=normal(text);
    const name=[...document.querySelectorAll('.k-animation-container [role="treeitem"] .k-in,.k-popup [role="treeitem"] .k-in,.popover [role="treeitem"] .k-in')]
      .find(element=>visible(element)&&normal(element.textContent).startsWith(wanted));
    if(!name)return null;
    const row=name.closest('[role="treeitem"]');
    const input=row?.querySelector('input.k-checkbox[type="checkbox"]');
    const label=input?.id?row.querySelector(`label.k-checkbox-label[for="${CSS.escape(input.id)}"]`):row?.querySelector('label.k-checkbox-label');
    return label&&input?{label,input}:null;
  }
  function categoryOption(text){
    const wanted=normal(text);
    const label=[...document.querySelectorAll('.popover label.kv-item-name,.k-animation-container label.kv-item-name,.k-popup label.kv-item-name')]
      .find(element=>visible(element)&&normal(element.textContent).startsWith(wanted));
    if(label){const input=label.htmlFor?document.getElementById(label.htmlFor):null;return {label,input};}
    return categoryCheckbox(text);
  }
  function setInput(input,value){const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
  function showSyncStatus(detail,tone='working'){
    let card=document.querySelector('#plate-studio-kiot-sync-status');
    if(!card){card=document.createElement('div');card.id='plate-studio-kiot-sync-status';card.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;min-width:310px;max-width:520px;padding:13px 16px;border:1px solid #7470df;border-radius:12px;background:#17192beF;color:#f7f5ff;font:13px/1.4 Arial,sans-serif;box-shadow:0 14px 40px #0008';document.documentElement.append(card);}
    card.style.borderColor=tone==='error'?'#e56878':tone==='done'?'#4ebf91':'#7470df';card.innerHTML=`<b style="display:block;font-size:14px;margin-bottom:3px">${tone==='error'?'⚠ KiotViet cần xử lý':tone==='done'?'✓ KiotViet':'↻ KiotViet đang đồng bộ'}</b><span>${detail}</span>`;
  }
  async function reportProgress(job,detail){showSyncStatus(detail);await fetch('http://127.0.0.1:41761/extension/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id,detail})});}
  async function selectReportMode(job){await reportProgress(job,'Đang chuyển sang chế độ Báo cáo…');const input=await waitFor(()=>document.querySelector('#sView_data'),'nút Báo cáo');if(!input.checked)click(input.closest('label')||input);await waitFor(()=>document.querySelector('#sView_data')?.checked,'chế độ Báo cáo');await reportProgress(job,'Đang chờ KiotViet dựng báo cáo…');await wait(RENDER.report);}
  async function selectCategory(job,category,parentCategory){
    await reportProgress(job,'Mở bộ chọn Nhóm hàng…');const picker=await waitFor(()=>firstVisible('kv-product-category-selector a.k-widget'),'bộ chọn Nhóm hàng');
    for(let i=0;i<30;i++){const remove=firstVisible('li.k-button .k-select,li.k-button .k-icon.k-i-close',picker);if(!remove)break;click(remove);await wait(130);}
    /* KiotViet trả về đúng nhánh Rùm Beng → 3D Rùm Beng khi tìm “3d”.
       Nhãn nhóm luôn mang thêm số lượng trong ngoặc, nên phải so khớp đầu chuỗi. */
    click(picker);await wait(RENDER.picker);await reportProgress(job,'Gõ “3d” để lọc cây nhóm hàng…');const input=await waitFor(()=>firstVisible('#categorySearchInput,#categorySearchFilter'),'ô tìm Nhóm hàng');setInput(input,'3d');await wait(RENDER.search);
    await reportProgress(job,'Chọn nhóm “3D Rùm Beng”…');const option=await waitFor(()=>categoryOption(category),'nhãn nhóm hàng 3D Rùm Beng');click(option.label);await waitFor(()=>!option.input||option.input.checked,'xác nhận chọn nhóm hàng 3D Rùm Beng');await wait(RENDER.choice);
    await reportProgress(job,'Bấm Áp dụng nhóm hàng…');const apply=await waitFor(()=>textButton('Áp dụng',{popupOnly:true}),'nút Áp dụng');click(apply);
    await waitFor(()=>[...picker.querySelectorAll('li.k-button')].some(item=>normal(item.textContent).startsWith(normal(category))),'xác nhận nhóm hàng');await reportProgress(job,'Đang chờ KiotViet lọc nhóm hàng…');await wait(RENDER.filter);
  }
  async function selectTimeRange(job){
    const yesterday=job.period==='yesterday';
    const range={key:yesterday?'yesterday':'year',label:yesterday?'Hôm qua':'Năm nay',loading:yesterday?'báo cáo hôm qua':'báo cáo năm nay'};
    const activeLabel=firstVisible('#reportsortDateTimeLbl')||[...document.querySelectorAll('li.reportsortDateTime .sortTimeLbl')].find(visible);if(!activeLabel)throw new Error('Không tìm thấy bộ chọn thời gian.');
    if(normal(activeLabel.textContent)===normal(range.label))return;await reportProgress(job,'Mở bộ chọn thời gian…');await realClick(activeLabel);await wait(700);
    await reportProgress(job,`Chọn “${range.label}” trong hộp thời gian…`);const choice=await waitFor(()=>firstVisible(`.popover a[ng-click="filterbyRange('${range.key}')"],.k-popup a[ng-click="filterbyRange('${range.key}')"]`)||textButton(range.label,{popupOnly:true}),`nút ${range.label} trong hộp thời gian`);click(choice);
    await waitFor(()=>choice.classList.contains('selected'),`xác nhận nút ${range.label} đã được chọn`);await reportProgress(job,`Đang chờ KiotViet tải ${range.loading}…`);await wait(RENDER.time);
  }
  async function exportExcel(job){
    await reportProgress(job,'Mở menu định dạng tải…');const exportButton=await waitFor(()=>firstVisible('#export[data-command="telerik_ReportViewer_export"]'),'menu Xuất file',30000);await hover(exportButton);
    const opened=await chrome.runtime.sendMessage({type:'plate-studio-open-export-menu'});if(!opened?.ok)throw new Error(opened?.error||'Không mở được menu định dạng tải.');await wait(RENDER.exportMenu);
    const menu=await waitFor(()=>firstVisible('[data-command="telerik_ReportViewer_export"][data-command-parameter="XLS"]')?.closest('ul'),'menu định dạng tải đang hiển thị',12000);
    exportButton.classList.add('k-state-active','k-state-border-down');await wait(650);
    await reportProgress(job,'Đang bấm Excel 97–2003…');
    // Kendo giữ mục Excel trong DOM ngay cả khi submenu chưa kịp vẽ. Click
    // trực tiếp vào mục đó là cùng lệnh xuất, đồng thời không phụ thuộc :hover.
    const xls=await waitFor(()=>firstVisible('[data-command="telerik_ReportViewer_export"][data-command-parameter="XLS"]',menu),'Excel 97–2003');xls.focus?.();click(xls);await reportProgress(job,'KiotViet đang chuẩn bị file Excel…');
  }
  // Thứ tự lấy từ bản ghi thao tác thật trên KiotViet.
  async function execute(job){try{await selectReportMode(job);await selectCategory(job,job.category||'3D Rùm Beng',job.categoryParent||'Rùm Beng');await selectTimeRange(job);await exportExcel(job);showSyncStatus('Đã yêu cầu Chrome tải file Excel. Đang chờ Plate Studio nhập file…','done');}catch(error){showSyncStatus(error.message||String(error),'error');throw error;}}
  const recorder=(()=>{try{const saved=JSON.parse(sessionStorage.getItem('plateStudioKiotRecorder')||'null');if(saved?.active&&Array.isArray(saved.actions))return saved;}catch{}return {active:false,startedAt:0,actions:[],lastPointer:null,lastLoadState:null};})();
  function updateRecorderBadge(){
    let badge=document.querySelector('#plate-studio-kiot-recording-badge');
    if(!recorder.active){badge?.remove();return;}
    if(!badge){badge=document.createElement('div');badge.id='plate-studio-kiot-recording-badge';badge.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647;padding:9px 13px;border-radius:999px;background:#b52f4c;color:#fff;font:700 13px Arial,sans-serif;box-shadow:0 8px 24px #0008;pointer-events:none';document.documentElement.append(badge);}
    badge.textContent=`● Đang ghi thao tác · ${recorder.actions.length}`;
  }
  function persistRecorder(){try{if(recorder.active)sessionStorage.setItem('plateStudioKiotRecorder',JSON.stringify(recorder));else sessionStorage.removeItem('plateStudioKiotRecorder');}catch{}updateRecorderBadge();}
  function recorderElement(target){
    const element=target?.closest?.('button,a,label,input,select,textarea,[role="button"],[role="option"],[role="treeitem"]')||target;
    if(!element||element===document.body)return null;
    const attrs={};for(const name of ['id','name','type','role','for','data-command','data-command-parameter','aria-expanded','aria-selected','class']){const value=element.getAttribute?.(name);if(value)attrs[name]=value;}
    const selectors=[];
    if(element.id&&!/^[\d_-]{12,}$/.test(element.id))selectors.push(`#${CSS.escape(element.id)}`);
    if(element.getAttribute?.('data-command'))selectors.push(`[data-command="${CSS.escape(element.getAttribute('data-command'))}"]`);
    if(element.htmlFor)selectors.push(`label[for="${CSS.escape(element.htmlFor)}"]`);
    if(element.name)selectors.push(`${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`);
    const treeItem=element.closest?.('[role="treeitem"]');
    const popup=element.closest?.('.popover,.k-animation-container,.k-popup,.k-list-container');
    const context={};
    if(treeItem)context.treeItemText=String(treeItem.textContent||'').replace(/\s+/g,' ').trim().slice(0,220);
    if(element.htmlFor){const input=document.getElementById(element.htmlFor);if(input){context.forInput={id:input.id,checked:!!input.checked};const row=input.closest?.('[role="treeitem"]');if(row)context.treeItemText=String(row.textContent||'').replace(/\s+/g,' ').trim().slice(0,220);}}
    if(popup)context.popupClass=popup.className||popup.id||'popup';
    const rect=element.getBoundingClientRect();
    return {tag:element.tagName.toLowerCase(),text:String(element.textContent||'').replace(/\s+/g,' ').trim().slice(0,160),attrs,selectors,rect:{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)},context};
  }
  function record(type,event){
    if(!recorder.active)return;const element=recorderElement(event.target);if(!element)return;
    const action={at:Date.now()-recorder.startedAt,type,url:location.href,element,page:pageLoadState()};
    if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLSelectElement){
      if(event.target.type!=='password')action.value=event.target.type==='checkbox'?event.target.checked:String(event.target.value||'').slice(0,300);
    }
    const previous=recorder.actions.at(-1);
    if(type==='input'&&previous?.type==='input'&&previous.element?.attrs?.id===element.attrs?.id){recorder.actions[recorder.actions.length-1]=action;persistRecorder();return;}
    recorder.actions.push(action);persistRecorder();
  }
  function recordPointer(event){
    if(!recorder.active)return;const now=Date.now(),previous=recorder.lastPointer;
    if(previous&&now-previous.at<180&&previous.target===event.target)return;
    recorder.lastPointer={at:now,target:event.target};const element=recorderElement(event.target);if(!element)return;
    recorder.actions.push({at:now-recorder.startedAt,type:'pointer',url:location.href,point:{x:Math.round(event.clientX),y:Math.round(event.clientY)},element,page:pageLoadState()});persistRecorder();
  }
  function recordLoadState(){
    if(!recorder.active)return;const current=pageLoadState(),previous=recorder.lastLoadState;
    if(previous&&previous.readyState===current.readyState&&previous.loaders===current.loaders&&previous.popups===current.popups)return;
    recorder.lastLoadState=current;recorder.actions.push({at:Date.now()-recorder.startedAt,type:'page-state',url:location.href,page:current});persistRecorder();
  }
  document.addEventListener('click',event=>record('click',event),true);
  document.addEventListener('input',event=>record('input',event),true);
  document.addEventListener('change',event=>record('change',event),true);
  document.addEventListener('pointermove',recordPointer,{capture:true,passive:true});
  window.addEventListener('hashchange',()=>{if(recorder.active){recorder.actions.push({at:Date.now()-recorder.startedAt,type:'navigation',url:location.href});persistRecorder();}});
  setInterval(recordLoadState,250);
  updateRecorderBadge();
  chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
    if(message?.type==='plate-studio-run-kiot-sync'){execute(message.job).then(()=>reply({ok:true})).catch(error=>reply({ok:false,error:error.message||String(error)}));return true;}
    if(message?.type==='plate-studio-recorder-control'){
      if(message.action==='start'){recorder.active=true;recorder.startedAt=Date.now();recorder.actions=[];recorder.lastPointer=null;recorder.lastLoadState=null;recordLoadState();persistRecorder();reply({ok:true,active:true});return;}
      if(message.action==='stop'){
        const payload={capturedAt:Date.now(),url:location.href,actions:recorder.actions};recorder.active=false;persistRecorder();
        fetch('http://127.0.0.1:41761/extension/recording',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
          .then(response=>response.ok?response.json():Promise.reject(new Error('Không lưu được bản ghi vào local bridge.')))
          .then(result=>reply({ok:true,active:false,actions:result.actions||recorder.actions.length}))
          .catch(error=>reply({ok:false,error:error.message||String(error)}));return true;
      }
      reply({ok:true,active:recorder.active,actions:recorder.actions.length});return;
    }
  });
  /* Nếu đã có bất kỳ tab KiotViet nào đang mở, ping này đánh thức service
     worker ngay khi Plate Studio tạo lượt đồng bộ — không cần chờ alarm. */
  setInterval(()=>chrome.runtime.sendMessage({type:'plate-studio-kiot-check'}).catch(()=>{}),1200);
})();
