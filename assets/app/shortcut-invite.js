/* Browser-confirmed installation only. Stores device-local invitation preferences, never workshop data. */
(()=>{
 'use strict';
 const KEY='ps_install_invite_v1',WEEK=7*24*60*60*1000;
 const scriptURL=document.currentScript?.src||new URL('assets/app/shortcut-invite.js',location.href).href;
 const iconURL=new URL('platedio-icon.svg',scriptURL).href;
 const standalone=matchMedia('(display-mode: standalone)'),minimal=matchMedia('(display-mode: minimal-ui)');
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const android=/Android/.test(navigator.userAgent),inApp=/FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(navigator.userAgent);
 const actionDisplay=new WeakMap();
 let promptEvent=null,card=null,timer=0,autoReady=false,manual=false,shown=false,sessionDismissed=false,capturePaused=false,busy=false,view='invite',opener=null,memory={};
 function readPreference(){try{const value=JSON.parse(localStorage.getItem(KEY)||'{}');return value&&typeof value==='object'?value:{};}catch{return memory;}}
 let preference=readPreference();
 function remember(value){preference={...preference,...value};memory=preference;try{localStorage.setItem(KEY,JSON.stringify(preference));}catch{/* The in-memory choice still applies for this visit. */}}
 const isInstalled=()=>standalone.matches||minimal.matches||navigator.standalone===true;
 const visible=el=>!!el&&!el.hidden&&!el.inert&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
 const editing=()=>document.activeElement?.matches('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
 function blocked(){
  if(document.hidden||!window.PlatedioStartup||!['ready','revealing'].includes(PlatedioStartup.state))return true;
  const style=document.querySelector('[data-platedio-install-style]');if(!style?.sheet||style.media==='print')return true;
  if(document.body.matches('.staff-report-mode,.staff-receiving-mode,.delivery-receive-only,.notifications-open,.more-sheet-open,.workshop-swipe-mode'))return true;
  if(visible(document.getElementById('auth-ov'))||visible(document.getElementById('ov-order-form')))return true;
  if([...document.querySelectorAll('[role="dialog"],[role="menu"],[aria-modal="true"],[id^="ov-"],#confirm-ov,#page-options-tools[open],.ov,.dlg-ov,.guide-tour-ov,.spotlight-ov,video,.system-notification-popup,#system-notification-panel,#toast .notification-card')].some(el=>!card?.contains(el)&&visible(el)))return true;
  return !!editing()&&!card?.contains(document.activeElement);
 }
 function mount(){
  if(card)return;
  card=document.createElement('section');card.id='platedio-install';card.hidden=true;card.setAttribute('aria-labelledby','pi-title');card.setAttribute('aria-describedby','pi-description');
  card.innerHTML=`<div class="pi-head"><span class="pi-kicker">LUÔN Ở GẦN BẠN</span><button class="pi-close btn-icon-only" type="button" aria-label="Đóng lời mời tạo lối tắt"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="pi-scroll"><div class="pi-art" aria-hidden="true"><div class="pi-halo"></div><div class="pi-board"><div class="pi-grid"><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="pi-icon"><img src="${iconURL}" alt="" width="70" height="70"></div><i class="pi-dot"></i><i class="pi-dot"></i></div><b class="pi-wordmark">platedio<span>.</span></b><h2 id="pi-title">Lần sau, mở nhanh hơn.</h2><p class="pi-description" id="pi-description"></p><div class="pi-guide" hidden><p></p><ol></ol><small>Tên menu có thể khác tùy phiên bản trình duyệt.</small></div><p class="pi-feedback" role="status" hidden></p></div><div class="pi-actions"><button class="pi-primary" type="button"><span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button><button class="pi-later" type="button">Để sau</button></div>`;
  if(window.appIcon){card.querySelector('.pi-close svg').outerHTML=appIcon('close').replace('<svg','<svg aria-hidden="true"');card.querySelector('.pi-primary svg').outerHTML=appIcon('chevron-right').replace('<svg','<svg aria-hidden="true"');}
  document.body.append(card);card.querySelector('.pi-close').onclick=()=>dismiss();card.querySelector('.pi-later').onclick=()=>dismiss();card.querySelector('.pi-primary').onclick=primary;
 }
 const find=selector=>card.querySelector(selector);
 function label(text){find('.pi-primary span').textContent=text;}
 function reset(){
  view='invite';find('.pi-scroll').scrollTop=0;find('.pi-guide').hidden=true;find('.pi-feedback').hidden=true;find('.pi-primary').disabled=false;find('.pi-primary').setAttribute('aria-expanded','false');
  find('.pi-description').textContent=ios?'Thêm platedio vào màn hình chính để trở lại xưởng chỉ bằng một chạm.':android?'Đặt platedio trên màn hình chính. Lần sau, chạm biểu tượng để vào ngay.':'Mở platedio từ danh sách ứng dụng, rồi ghim vào thanh tác vụ hoặc Dock để truy cập nhanh.';
  label(promptEvent?'Thêm platedio':'Xem cách thêm');
 }
 function feedback(text){find('.pi-feedback').hidden=false;find('.pi-feedback').textContent=text;}
 function hide(restore=false){
  if(!card||card.hidden)return;
  const hadFocus=card.contains(document.activeElement);card.hidden=true;card.inert=true;
  if(restore&&hadFocus&&visible(opener))opener.focus({preventScroll:true});
 }
 function dismiss(){manual=false;sessionDismissed=true;remember({until:Date.now()+WEEK});hide(true);}
 function guide(){
  view='guide';const el=find('.pi-guide');el.hidden=false;
  const steps=ios?['Mở platedio trong Safari, rồi mở menu Chia sẻ.','Chọn “Thêm vào Màn hình chính”.','Chọn “Thêm” để hoàn tất. Nếu có tùy chọn “Mở dưới dạng ứng dụng web”, bạn có thể bật lên.']:android?['Mở platedio trong Chrome.','Mở menu ba chấm, chọn “Thêm vào màn hình chính”.','Chọn “Cài đặt” hoặc tạo lối tắt theo lựa chọn trình duyệt hiển thị.']:/Edg\//.test(navigator.userAgent)?['Mở platedio trong Microsoft Edge.','Mở menu ba chấm → “Ứng dụng” → “Cài đặt trang này dưới dạng ứng dụng”.','Xác nhận cài đặt, rồi chọn cách ghim nếu trình duyệt hỏi.']:/Safari/.test(navigator.userAgent)&&!/Chrome|Chromium/.test(navigator.userAgent)?['Mở platedio trong Safari trên máy Mac.','Chọn “Tệp” → “Thêm vào Dock” nếu trình duyệt có hỗ trợ.','Xác nhận thêm để truy cập từ Dock.']:['Mở platedio trong Chrome trên máy tính.','Mở menu ba chấm → “Truyền, lưu và chia sẻ” → “Cài đặt trang dưới dạng ứng dụng”.','Xác nhận cài đặt. Sau đó, bạn có thể ghim ứng dụng vào thanh tác vụ hoặc Dock.'];
  el.querySelector('p').textContent=ios?'Thực hiện trong Safari':android?'Thêm bằng menu Chrome':'Thêm bằng menu trình duyệt';el.querySelector('ol').replaceChildren(...steps.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  if(inApp)feedback('Hãy mở trang này bằng Safari hoặc Chrome để thêm lối tắt.');
  label('Đã hiểu');find('.pi-primary').setAttribute('aria-expanded','true');find('.pi-primary').setAttribute('aria-controls','pi-guide');el.id='pi-guide';
  requestAnimationFrame(()=>{if(!card.hidden&&view==='guide')find('.pi-scroll').scrollTo({top:el.offsetTop-find('.pi-scroll').offsetTop,behavior:'instant'});});
 }
 async function primary(){
  if(busy)return;
  if(view==='guide'||view==='accepted'){dismiss();return;}
  if(!promptEvent){guide();return;}
  const event=promptEvent;promptEvent=null;busy=true;find('.pi-primary').disabled=true;label('Đang mở cài đặt…');
  try{
   // Keep the browser call directly inside the click gesture; each event is used once.
   const result=await event.prompt();const choice=result?.outcome?result:await event.userChoice;
   if(isInstalled()||preference.installed)return;
   if(choice?.outcome==='accepted'){view='accepted';sessionDismissed=true;remember({until:Date.now()+WEEK});feedback('Bạn đã chấp nhận. Trình duyệt đang hoàn tất cài đặt.');label('Đóng');}
   else {dismiss();}
  }catch{guide();feedback('Chưa mở được hộp cài đặt. Bạn có thể thêm bằng menu trình duyệt theo hướng dẫn dưới đây.');}
  finally{busy=false;if(card)find('.pi-primary').disabled=false;schedule();}
 }
 function schedule(delay=120){clearTimeout(timer);timer=setTimeout(reconcile,delay);}
 function reconcile(){
  document.querySelectorAll('[data-platedio-install-action]').forEach(el=>{
   if(isInstalled()){
    if(!actionDisplay.has(el))actionDisplay.set(el,{value:el.style.getPropertyValue('display'),priority:el.style.getPropertyPriority('display')});
    if(el.style.getPropertyValue('display')!=='none'||el.style.getPropertyPriority('display')!=='important')el.style.setProperty('display','none','important');
   }else if(actionDisplay.has(el)){
    const previous=actionDisplay.get(el);if(previous.value)el.style.setProperty('display',previous.value,previous.priority);else el.style.removeProperty('display');actionDisplay.delete(el);
   }
  });
  if(isInstalled()){if(!preference.installed)remember({installed:true});hide();manual=false;return;}
  if(busy)return;
  if(blocked()){if(card&&!card.hidden){hide();manual=false;}return;}
  if(card&&!card.hidden)return;
  if(!manual&&(!autoReady||capturePaused||sessionDismissed||preference.installed||Number(preference.until)>Date.now()||shown||!(promptEvent||(!inApp&&(ios||android)))))return;
  mount();reset();opener=document.activeElement;card.inert=false;card.hidden=false;shown=true;
  if(manual)find('.pi-close').focus({preventScroll:true});
 }
 window.PlatedioInstall={
  open(){if(isInstalled())return;manual=true;sessionDismissed=false;shown=false;schedule(260);},
  dismiss,
  pauseForCapture(){capturePaused=true;manual=false;hide();},
  get state(){return busy?'prompting':card&&!card.hidden?view:isInstalled()||preference.installed?'installed':'hidden';}
 };
 addEventListener('beforeinstallprompt',event=>{
  if(isInstalled())return;event.preventDefault();promptEvent=event;
  // A new browser eligibility event also proves a previously installed copy is no longer installed.
  if(preference.installed)remember({installed:false});
  if(card&&!card.hidden&&view==='invite'){label('Thêm platedio');return;}schedule(700);
 });
 addEventListener('appinstalled',()=>{promptEvent=null;busy=false;remember({installed:true,until:0});manual=false;hide(true);});
 addEventListener('storage',event=>{if(event.key!==KEY)return;preference=readPreference();if(preference.installed||Number(preference.until)>Date.now()){manual=false;hide();}});
 standalone.addEventListener('change',()=>schedule());minimal.addEventListener('change',()=>schedule());
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&card&&!card.hidden&&card.contains(document.activeElement)){event.preventDefault();event.stopImmediatePropagation();dismiss();}
 },true);
 function init(){
  if(window.appIcon)document.querySelectorAll('[data-platedio-install-icon]').forEach(el=>{el.outerHTML=appIcon('data').replace('<svg','<svg aria-hidden="true"');});
  if(new URLSearchParams(location.search).get('capture')==='1')capturePaused=true;
  const observer=new MutationObserver(records=>{if(records.every(record=>card?.contains(record.target)))return;schedule();});
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','inert','open']});
  document.addEventListener('focusin',()=>schedule());document.addEventListener('focusout',()=>schedule(250));document.addEventListener('visibilitychange',()=>schedule());
  document.querySelector('[data-platedio-install-style]')?.addEventListener('load',()=>schedule());
  // Let startup finish and give the main workflow a quiet moment before inviting.
  if(window.PlatedioStartup)PlatedioStartup.afterReady(()=>{setTimeout(()=>{autoReady=true;schedule();},3500);});
  else addEventListener('load',()=>{setTimeout(()=>{autoReady=true;schedule();},3500);},{once:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
