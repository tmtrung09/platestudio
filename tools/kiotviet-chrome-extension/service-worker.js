const BRIDGE='http://127.0.0.1:41761';
const REPORT_URL='https://banhmi19.kiotviet.vn/man/#/ProductReport';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bridge(path,options={}){const response=await fetch(BRIDGE+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||'Không liên lạc được local bridge.');return response.json();}
async function notify(path,payload){try{await bridge(path,{method:'POST',body:JSON.stringify(payload)});}catch(error){console.warn('Plate Studio Kiot sync:',error);}}
async function waitForTab(tabId){
  for(let i=0;i<80;i++){const tab=await chrome.tabs.get(tabId);if(tab.status==='complete'&&tab.url?.includes('banhmi19.kiotviet.vn'))return tab;await wait(500);}throw new Error('KiotViet tải quá lâu.');
}
async function targetTab(){
  const tabs=await chrome.tabs.query({url:'https://banhmi19.kiotviet.vn/*'});let tab=tabs.find(item=>item.url?.includes('/man/'))||tabs[0];
  if(!tab)tab=await chrome.tabs.create({url:REPORT_URL,active:true});
  else if(!tab.url?.includes('/ProductReport'))tab=await chrome.tabs.update(tab.id,{url:REPORT_URL,active:true});
  else {tab=await chrome.tabs.update(tab.id,{active:true});await chrome.tabs.reload(tab.id);}
  return waitForTab(tab.id);
}
async function run(job){
  const tab=await targetTab();await notify('/extension/progress',{id:job.id,detail:'Đang mở Báo cáo hàng hóa trong Chrome…'});
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
  if(message?.type==='plate-studio-recorder-control'){
    const tabId=message.tabId||sender.tab?.id;
    if(!tabId){reply({ok:false,error:'Không tìm thấy tab KiotViet.'});return;}
    chrome.tabs.sendMessage(tabId,{type:'plate-studio-recorder-control',action:message.action})
      .then(result=>reply(result||{ok:true})).catch(error=>reply({ok:false,error:error.message||'Hãy mở tab KiotViet trước.'}));
    return true;
  }
});
setInterval(check,2500);
