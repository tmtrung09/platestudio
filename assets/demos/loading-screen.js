/* Standalone approval demo. No application dependencies, cloud or storage. */
(()=>{
 const root=document.documentElement,viewport=document.getElementById('preview-viewport');
 const message=document.getElementById('loading-message'),label=document.getElementById('preview-label'),retry=document.getElementById('retry-demo');
 const explanation=document.getElementById('demo-explanation'),ready=document.getElementById('ready-page'),loader=document.getElementById('loading-screen'),logoButton=document.getElementById('logo-demo');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),timers=new Set();let generation=0,waitingState='loading';
 const motionOff=()=>reduced.matches||root.dataset.motion==='paused';
 function cancel(){generation++;timers.forEach(clearTimeout);timers.clear();}
 function later(callback,ms){const run=generation,id=setTimeout(()=>{timers.delete(id);if(run===generation)callback();},ms);timers.add(id);}
 function phase(state){
  root.dataset.state=state;viewport.dataset.state=state;
  const usable=state==='ready'||state==='revealing';
  if(usable)viewport.dataset.hasContent='true';
  viewport.setAttribute('aria-busy',String(!usable));ready.inert=!usable;loader.inert=['exiting','revealing','ready'].includes(state);
  retry.hidden=state!=='slow';logoButton.disabled=!usable;
  const captions={entering:'Loading đang xuất hiện',loading:'Màn hình đang chờ',slow:'Mô phỏng · tải chậm',exiting:'Loading rời · nội dung xuất hiện',revealing:'Logo góc trái sượt ngang',ready:'Nội dung và logo đã sẵn sàng'};
  label.textContent=captions[state];message.textContent=state==='slow'?'Trang đang cần thêm một chút thời gian':'Đang mở không gian làm việc';
  const step=state==='slow'?'loading':state==='ready'?'revealing':state;
  document.querySelectorAll('[data-phase]').forEach(item=>{if(item.dataset.phase===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
 }
 function logoReveal(){
  if(motionOff()){phase('ready');return;}
  // Restart only the review logo when its replay button is pressed rapidly.
  if(viewport.dataset.state==='revealing'){phase('ready');void document.querySelector('.brand-reveal').offsetWidth;}
  phase('revealing');later(()=>phase('ready'),780);
 }
 function finish(){cancel();if(motionOff()){phase('ready');return;}phase('exiting');later(logoReveal,620);}
 function enter({auto=false,slow=false}={}){
  cancel();const waiting=slow?'slow':'loading';waitingState=waiting;
  if(motionOff())phase(waiting);else{phase('entering');later(()=>phase(waiting),650);}
  explanation.textContent=slow?'Mô phỏng trang chưa sẵn sàng. Loading tiếp tục chờ; bấm Thử lại để xem lại toàn bộ trình tự.':auto?'Mô phỏng mở trang: loading vào → chờ sẵn sàng → lướt ra → nội dung hiện → logo góc trái sượt ngang.':'Demo đang giữ màn hình chờ để duyệt. Bấm Chạy thử để xem trọn trình tự vào, ra và logo xuất hiện.';
  if(auto)later(finish,2800);
 }
 document.getElementById('play-demo').addEventListener('click',()=>enter({auto:true}));
 document.getElementById('slow-demo').addEventListener('click',()=>enter({slow:true}));
 logoButton.addEventListener('click',()=>{cancel();logoReveal();});
 retry.addEventListener('click',()=>{document.getElementById('play-demo').focus({preventScroll:true});enter({auto:true});});
 for(const kind of ['theme','device'])document.querySelectorAll(`[data-${kind}-choice]`).forEach(button=>button.addEventListener('click',()=>{
  root.dataset[kind]=button.dataset[`${kind}Choice`];
  document.querySelectorAll(`[data-${kind}-choice]`).forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
 }));
 function settleMotion(){
  if(!motionOff())return;
  if(viewport.dataset.state==='entering')phase(waitingState);
  else if(['exiting','revealing'].includes(viewport.dataset.state)){cancel();phase('ready');}
 }
 document.getElementById('motion-toggle').addEventListener('click',event=>{
  const button=event.currentTarget,paused=root.dataset.motion!=='paused';root.dataset.motion=paused?'paused':'playing';
  button.setAttribute('aria-pressed',String(paused));button.querySelector('span').textContent=paused?'Chạy chuyển động':'Dừng chuyển động';
  button.querySelector('svg').innerHTML=paused?'<path d="m8 5 11 7-11 7z"/>':'<path d="M8 5v14M16 5v14"/>';settleMotion();
 });
 reduced.addEventListener('change',settleMotion);
 document.addEventListener('visibilitychange',()=>{viewport.classList.toggle('is-background',document.hidden);});
 enter();
})();
