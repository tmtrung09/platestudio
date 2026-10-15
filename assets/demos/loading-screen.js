/* Standalone approval demo. No application dependencies, cloud or storage. */
(()=>{
 const root=document.documentElement,viewport=document.getElementById('preview-viewport');
 const message=document.getElementById('loading-message'),label=document.getElementById('preview-label'),retry=document.getElementById('retry-demo');
 const explanation=document.getElementById('demo-explanation'),ready=document.getElementById('ready-page');
 let timer;
 function setState(state){
  clearTimeout(timer);root.dataset.state=state;viewport.dataset.state=state;
  viewport.setAttribute('aria-busy',String(state!=='ready'));ready.inert=state!=='ready';
  document.getElementById('loading-screen').inert=state==='ready';
  retry.hidden=state!=='slow';
  label.textContent=state==='ready'?'Nội dung đã sẵn sàng':state==='slow'?'Mô phỏng · tải chậm':'Màn hình đang chờ';
  message.textContent=state==='slow'?'Trang đang cần thêm một chút thời gian':'Đang mở không gian làm việc';
  explanation.textContent=state==='ready'?'Trang đã sẵn sàng trong mô phỏng; màn hình loading đã nhường chỗ cho nội dung. Bấm Chạy thử để xem lại.':state==='slow'?'Tình huống minh họa khi trang chưa sẵn sàng. Màn hình chờ không tự báo hoàn tất hoặc hiển thị phần trăm giả.':'Demo đang giữ màn hình chờ để em duyệt. Bấm Chạy thử để xem chuyển vào trang.';
 }
 function play(){setState('loading');explanation.textContent='Đang mô phỏng mở trang. Demo sẽ phát tín hiệu sẵn sàng sau 2,8 giây.';timer=setTimeout(()=>setState('ready'),2800);}
 document.getElementById('play-demo').addEventListener('click',play);
 document.getElementById('slow-demo').addEventListener('click',()=>setState('slow'));
 retry.addEventListener('click',()=>{document.getElementById('play-demo').focus({preventScroll:true});play();});
 for(const kind of ['theme','device'])document.querySelectorAll(`[data-${kind}-choice]`).forEach(button=>button.addEventListener('click',()=>{
  root.dataset[kind]=button.dataset[`${kind}Choice`];
  document.querySelectorAll(`[data-${kind}-choice]`).forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
 }));
 document.getElementById('motion-toggle').addEventListener('click',event=>{
  const button=event.currentTarget,paused=root.dataset.motion!=='paused';root.dataset.motion=paused?'paused':'playing';
  button.setAttribute('aria-pressed',String(paused));button.querySelector('span').textContent=paused?'Chạy chuyển động':'Dừng chuyển động';
  button.querySelector('svg').innerHTML=paused?'<path d="m8 5 11 7-11 7z"/>':'<path d="M8 5v14M16 5v14"/>';
 });
 document.addEventListener('visibilitychange',()=>{viewport.classList.toggle('is-background',document.hidden);});
 setState('loading');
})();
