const BRIDGE='http://127.0.0.1:41761';
const REPORT_URL='https://banhmi19.kiotviet.vn/man/#/ProductReport';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bridge(path,options={}){const response=await fetch(BRIDGE+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||'Không liên lạc được local bridge.');return response.json();}
async function notify(path,payload){try{await bridge(path,{method:'POST',body:JSON.stringify(payload)});}catch(error){console.warn('Plate Studio Kiot sync:',error);}}
async function waitForTab(tabId){
  for(let i=0;i<80;i++){const tab=await chrome.tabs.get(tabId);if(tab.status==='complete'&&tab.url?.includes('banhmi19.kiotviet.vn'))return tab;await wait(500);}throw new Error('KiotViet tải quá lâu.');
}
async function targetTab(job){
  const tabs=await chrome.tabs.query({url:'https://banhmi19.kiotviet.vn/*'});let tab=tabs.find(item=>item.url?.includes('/man/'))||tabs[0];
  if(!tab)tab=await chrome.tabs.create({url:REPORT_URL,active:true});
  else if(!tab.url?.includes('/ProductReport'))tab=await chrome.tabs.update(tab.id,{url:REPORT_URL,active:true});
  else {tab=await chrome.tabs.update(tab.id,{active:true});if(!(job?.origin==='range'&&job?.period==='custom-day'&&job?.rangeId))await chrome.tabs.reload(tab.id);}
  return waitForTab(tab.id);
}
async function run(job){
  const tab=await targetTab(job);await notify('/extension/progress',{id:job.id,detail:job?.origin==='range'?'Đang giữ tab Báo cáo cho lượt bù ngày tiếp theo…':'Đang mở Báo cáo hàng hóa trong Chrome…'});
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
  const reply=await chrome.tabs.sendMessage(tab.id,{type:'plate-studio-run-kiot-sync',job});
  if(!reply?.ok)throw new Error(reply?.error||'Không gửi được lệnh đến trang KiotViet.');
}
async function check(){
  try{const claim=await bridge('/extension/claim',{method:'POST',body:'{}'});if(claim.run)await run(claim.job);}catch(error){const current=await bridge('/job').catch(()=>null);if(current?.id)await notify('/extension/error',{id:current.id,detail:error.message||String(error)});}
}
chrome.runtime.onInstalled.addListener(()=>chrome.alarms.create('plate-studio-kiot-poll',{periodInMinutes:.5}));
chrome.runtime.onStartup.addListener(()=>chrome.alarms.create('plate-studio-kiot-poll',{periodInMinutes:.5}));
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='plate-studio-kiot-poll')check();});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type==='plate-studio-kiot-check'){check();return;}
  if(message?.type==='plate-studio-real-hover'||message?.type==='plate-studio-real-click'){
    const tabId=sender.tab?.id;if(!tabId){reply({ok:false,error:'Không tìm thấy tab KiotViet để hover.'});return;}
    (async()=>{let attached=false;const target={tabId},x=Number(message.x)||0,y=Number(message.y)||0;try{await chrome.debugger.attach(target,'1.3');attached=true;await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'none',buttons:0});if(message.type==='plate-studio-real-hover')await wait(2200);if(message.type==='plate-studio-real-click'){await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});}reply({ok:true});}catch(error){reply({ok:false,error:error.message||String(error)});}finally{if(attached)await chrome.debugger.detach(target).catch(()=>{});}})();
    return true;
  }
  if(message?.type==='plate-studio-open-export-menu'){
    const tabId=sender.tab?.id;if(!tabId){reply({ok:false,error:'Không tìm thấy tab KiotViet.'});return;}
    chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:()=>{
      const anchor=document.querySelector('#export[data-command="telerik_ReportViewer_export"]');
      if(!anchor)return {ok:false,error:'Không tìm thấy menu Xuất file.'};
      const item=anchor.closest('li.k-item')||anchor.parentElement;
      const root=anchor.closest('.k-menu')||item?.parentElement;
      const jq=window.jQuery||window.$;const widget=jq&&root?jq(root).data('kendoMenu'):null;
      if(widget&&typeof widget.open==='function'){widget.open(item);return {ok:true,method:'kendoMenu.open'};}
      for(const type of ['pointerover','mouseover','mouseenter','pointermove','mousemove'])anchor.dispatchEvent(new MouseEvent(type,{bubbles:type!=='mouseenter',cancelable:true,view:window}));
      return {ok:true,method:'menu-events'};
    }}).then(result=>reply(result[0]?.result||{ok:false,error:'Không thể mở menu Xuất file.'})).catch(error=>reply({ok:false,error:error.message||String(error)}));
    return true;
  }
  if(message?.type==='plate-studio-set-kiot-date-range'){
    const tabId=sender.tab?.id,day=String(message.day||'');
    if(!tabId){reply({ok:false,error:'Không tìm thấy tab KiotViet.'});return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)){reply({ok:false,error:'Ngày báo cáo không hợp lệ.'});return;}
    /* Chạy ở MAIN world để truy cập chính Kendo widget mà KiotViet đang dùng.
       Không bấm giả theo toạ độ: value + change cập nhật model của KiotViet,
       sau đó đọc lại cả Từ ngày và Đến ngày làm điều kiện an toàn. */
    chrome.scripting.executeScript({target:{tabId},world:'MAIN',args:[day],func:async(requestedDay)=>{
      const jq=window.jQuery||window.$;
      if(!jq)return {ok:false,error:'KiotViet chưa sẵn sàng bộ chọn lịch.'};
      const visible=node=>!!node&&(node.offsetWidth||node.offsetHeight||node.getClientRects().length);
      const asDay=value=>{if(!(value instanceof Date)||Number.isNaN(value.getTime()))return '';const pad=number=>String(number).padStart(2,'0');return `${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`;};
      const target=new Date(`${requestedDay}T12:00:00`);
      const calendarEntries=()=>[...document.querySelectorAll('.kv-filter-time-other .k-calendar,.popover-filter .k-calendar')].filter(visible).map(node=>({node,widget:jq(node).data('kendoCalendar')||jq(node).data('kendoDatePicker')})).filter(entry=>entry.widget);
      const widgetFor=node=>node?(jq(node).data('kendoCalendar')||jq(node).data('kendoDatePicker')):null;
      const entries=calendarEntries();
      const fromNode=document.querySelector('#fromDate')||entries[0]?.node;
      const from=widgetFor(fromNode);
      if(!from)return {ok:false,error:'Không tìm thấy lịch Từ ngày của KiotViet.'};
      const assign=(widget,node)=>{widget.value(target);widget.trigger('change');node.dispatchEvent(new Event('change',{bubbles:true}));};
      /* Chọn Từ ngày làm KiotViet render lại cột Đến ngày. Vì vậy phải chờ
         render rồi truy vấn widget bên phải lần nữa; giữ node cũ khiến ngày
         kết thúc bị trả về Hôm nay, đúng lỗi đã quan sát trên lịch hai cột. */
      assign(from,fromNode);
      await new Promise(resolve=>setTimeout(resolve,260));
      const refreshed=calendarEntries();
      const refreshedFromNode=document.querySelector('#fromDate')||fromNode;
      const toNode=document.querySelector('#toDate')||refreshed.find(entry=>entry.node!==refreshedFromNode)?.node;
      const to=widgetFor(toNode);
      if(!to)return {ok:false,error:'Không tìm thấy lịch Đến ngày của KiotViet sau khi chọn Từ ngày.'};
      assign(to,toNode);
      await new Promise(resolve=>setTimeout(resolve,160));
      const selectedFrom=asDay(widgetFor(document.querySelector('#fromDate')||fromNode)?.value()),selectedTo=asDay(widgetFor(document.querySelector('#toDate')||toNode)?.value());
      if(selectedFrom!==requestedDay||selectedTo!==requestedDay)return {ok:false,error:`KiotViet không nhận ngày yêu cầu (Từ ${selectedFrom||'trống'}, Đến ${selectedTo||'trống'}).`};
      return {ok:true,from:selectedFrom,to:selectedTo};
    }}).then(result=>reply(result[0]?.result||{ok:false,error:'Không thể đặt ngày trên KiotViet.'})).catch(error=>reply({ok:false,error:error.message||String(error)}));
    return true;
  }
  if(message?.type==='plate-studio-create-kiot-date-report'){
    const tabId=sender.tab?.id;
    if(!tabId){reply({ok:false,error:'Không tìm thấy tab KiotViet.'});return;}
    chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:()=>{
      const visible=node=>!!node&&(node.offsetWidth||node.offsetHeight||node.getClientRects().length);
      const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/\s+/g,' ').trim().toLowerCase();
      const button=[...document.querySelectorAll('[ng-click="filterbyDateRange()"],a,button')].find(node=>visible(node)&&(node.matches('[ng-click="filterbyDateRange()"]')||normal(node.textContent)==='tao bao cao'));
      if(!button)return {ok:false,error:'Không tìm thấy nút Tạo báo cáo.'};
      const angularApi=window.angular;
      let scope=angularApi?.element?.(button).scope?.()||null;
      for(let level=0;scope&&level<8&&typeof scope.filterbyDateRange!=='function';level+=1)scope=scope.$parent;
      if(typeof scope?.filterbyDateRange==='function'){
        const invoke=()=>scope.filterbyDateRange();
        if(scope.$root?.$$phase)invoke();else scope.$apply(invoke);
        return {ok:true,method:'angular-filterbyDateRange'};
      }
      button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
      return {ok:true,method:'main-world-click'};
    }}).then(result=>reply(result[0]?.result||{ok:false,error:'Không thể kích hoạt Tạo báo cáo.'})).catch(error=>reply({ok:false,error:error.message||String(error)}));
    return true;
  }
  if(message?.type==='plate-studio-recorder-control'){
    const tabId=message.tabId||sender.tab?.id;
    if(!tabId){reply({ok:false,error:'Không tìm thấy tab KiotViet.'});return;}
    chrome.tabs.sendMessage(tabId,{type:'plate-studio-recorder-control',action:message.action})
      .then(result=>reply(result||{ok:true})).catch(error=>reply({ok:false,error:error.message||'Hãy mở tab KiotViet trước.'}));
    return true;
  }
});
setInterval(check,2500);
