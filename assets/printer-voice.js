/* Enya audio playback; alert policy and acknowledgment remain in the monitor. */
(() => {
  'use strict';
  const policy=window.PlatePrinterVoicePolicy,preview=new URL('printer-voice/enya-preview.wav',document.currentScript.src).href;
  const supported=typeof Audio==='function',heard=new Set(),memory=new Map();
  let scope='',allowed=false,enabled=false,activated=false,active=null,playback=null,notice='',requestPreview=null;
  const setText=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
  const preference=()=>`ps_printer_voice_v1_${encodeURIComponent(scope)}`;
  const history=()=>preference()+':spoken';
  const textFor=data=>policy.textFor(data);
  function cancel(){
    const item=playback;playback=null;if(!item)return;
    item.abort.abort();clearTimeout(item.timer);
    if(item.audio){item.audio.onplaying=item.audio.onended=item.audio.onerror=null;item.audio.pause();item.audio.removeAttribute('src');item.audio.load();}
    if(item.url)URL.revokeObjectURL(item.url);
  }
  function stop(){cancel();active=null;notice='';paint();}
  function valid(){return !!active&&allowed&&!document.hidden&&active.scope===scope&&active.isCurrent();}
  function wasHeard(key){if(heard.has(scope+':'+key))return true;try{return JSON.parse(localStorage.getItem(history())||'[]').includes(key);}catch{return false;}}
  function remember(key){heard.add(scope+':'+key);try{const rows=JSON.parse(localStorage.getItem(history())||'[]');localStorage.setItem(history(),JSON.stringify([...new Set([...rows,key])].slice(-120)));}catch{}}
  async function audioBlob(target,signal){
    const signature=policy.version+'\n'+textFor(target);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature)))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
    const cacheUrl=new URL('printer-voice-cache/'+encodeURIComponent(scope)+'/'+digest+'.wav',location.href).href;
    if(memory.has(cacheUrl))return memory.get(cacheUrl);
    let cache;try{cache=await caches.open('ps-printer-enya-v1');const cached=await cache.match(cacheUrl);if(cached)return await cached.blob();}catch{}
    if(typeof target.requestAudio!=='function')throw new Error('Chưa kết nối được giọng Enya.');
    let response;
    for(let retry=0;retry<10;retry++){
      if(signal.aborted)throw new DOMException('Aborted','AbortError');
      response=await target.requestAudio({...target,expectedHash:digest},signal);
      if(response.status!==425)break;
      await new Promise((resolve,reject)=>{const finish=()=>{signal.removeEventListener('abort',abort);resolve();},timer=setTimeout(finish,2000),abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};signal.addEventListener('abort',abort,{once:true});});
    }
    if(!response.ok){let data;try{data=await response.json();}catch{}throw new Error(data?.error||'Chưa tải được giọng Enya. Hãy thử lại.');}
    const blob=await response.blob();
    if(!blob.type.startsWith('audio/')||blob.size<44||blob.size>2500000)throw new Error('Tệp giọng Enya chưa hợp lệ. Hãy thử lại.');
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    memory.set(cacheUrl,blob);while(memory.size>80)memory.delete(memory.keys().next().value);
    try{await cache?.put(cacheUrl,new Response(blob));const keys=(await cache.keys()).filter(key=>key.url.includes('/'+encodeURIComponent(scope)+'/'));for(const key of keys.slice(0,Math.max(0,keys.length-80)))await cache.delete(key);}catch{}
    return blob;
  }
  async function speak({isPreview=false,manual=false,livePreview=false}={}){
    if(!supported||!allowed||document.hidden||!isPreview&&!valid())return false;
    if(!activated&&!manual){notice='Chạm Đọc thông báo để phát giọng Enya.';paint();return false;}
    cancel();const target=isPreview?null:active,owner=scope,item={abort:new AbortController(),audio:null,url:null,timer:0};playback=item;
    notice=isPreview?'Đang mở bản nghe thử Enya…':'Đang chuẩn bị giọng Enya…';paint();
    const current=()=>playback===item&&owner===scope&&allowed&&!document.hidden&&(!target||active===target&&valid());
    item.timer=setTimeout(()=>{if(!current())return;cancel();notice='Giọng Enya đang tải chậm. Chọn Đọc thông báo để thử lại.';paint();},85000);
    try{
      let source=preview,previewNote='Đang nghe thử giọng Enya…';
      if(isPreview&&livePreview&&requestPreview){
        try{const blob=await audioBlob({event:{type:'preview'},requestAudio:requestPreview},item.abort.signal);if(!current())return false;source=item.url=URL.createObjectURL(blob);previewNote='Đang nghe thử Enya từ dịch vụ giọng đọc…';}
        catch(error){if(!current())return false;previewNote=(error?.message||'Chưa kết nối được dịch vụ.')+' Đang nghe bản mẫu Enya đã lưu.';}
      }
      if(!isPreview){const blob=await audioBlob(target,item.abort.signal);if(!current())return false;source=item.url=URL.createObjectURL(blob);}
      if(!current())return false;
      const audio=new Audio(source);item.audio=audio;audio.preload='auto';
      audio.onplaying=()=>{if(!current()){cancel();return;}clearTimeout(item.timer);if(target)remember(target.key);notice=isPreview?previewNote:'Đang đọc thông báo…';paint();};
      audio.onended=()=>{if(playback!==item)return;cancel();notice='';paint();};
      audio.onerror=()=>{if(playback!==item)return;cancel();notice='Chưa phát được giọng Enya. Chạm Nghe thử hoặc Đọc thông báo để thử lại.';paint();};
      await audio.play();return true;
    }catch(error){if(playback!==item)return false;cancel();notice=error?.name==='NotAllowedError'?'Trình duyệt chưa cho phát âm thanh. Chạm Nghe thử hoặc Đọc thông báo để phát.':error?.message||'Chưa phát được giọng Enya. Hãy thử lại.';paint();return false;}
  }
  function attempt(){
    if(!enabled||!valid()||active.attempted||wasHeard(active.key))return false;
    if(!activated){notice='Chạm Đọc thông báo để phát giọng Enya.';paint();return false;}
    active.attempted=true;void speak();return true;
  }
  function configure(nextScope,nextAllowed){if(scope!==nextScope||allowed!==nextAllowed){stop();scope=nextScope;allowed=!!nextAllowed;try{enabled=!!scope&&localStorage.getItem(preference())==='1';}catch{enabled=false;}}paint();}
  function paint(){
    document.querySelectorAll('[data-printer-voice-settings]').forEach(host=>{
      host.hidden=!allowed||!scope;const toggle=host.querySelector('[data-voice-toggle]');toggle.disabled=!supported;toggle.setAttribute('aria-pressed',String(enabled));setText(toggle.querySelector('span'),`Giọng đọc máy ${enabled?'bật':'tắt'}`);host.querySelector('[data-voice-test]').disabled=!supported;
      setText(host.querySelector('[data-voice-status]'),notice||(!supported?'Trình duyệt chưa hỗ trợ âm thanh.':enabled?'Enya · Đọc khi in xong hoặc máy dừng vì lỗi.':'Giọng Enya · Bật để đọc thông báo máy.'));
    });
    if(active?.host){const button=active.host.querySelector('button');button.disabled=!supported;setText(button.querySelector('span'),playback?'Dừng đọc':wasHeard(active.key)?'Đọc lại':'Đọc thông báo');setText(active.host.querySelector('small'),notice||(enabled?'Giọng Enya':'Tự động đọc đang tắt'));}
  }
  function mount(panel,{scope:nextScope,allowed:nextAllowed,requestPreview:nextRequest}){
    requestPreview=nextRequest;
    configure(nextScope,nextAllowed);
    if(!panel.querySelector('[data-printer-voice-settings]')){
      const host=document.createElement('div');host.className='printer-voice-settings';host.dataset.printerVoiceSettings='';host.innerHTML='<div><button type="button" class="notification-control" data-voice-toggle aria-pressed="false">'+appIcon('volume')+'<span>Giọng đọc máy tắt</span></button><button type="button" class="notification-control" data-voice-test>Nghe thử</button></div><small data-voice-status role="status"></small>';panel.querySelector('.notification-panel-footer').before(host);
      host.querySelector('[data-voice-toggle]').onclick=()=>{activated=true;enabled=!enabled;cancel();notice='';try{localStorage.setItem(preference(),enabled?'1':'0');}catch{notice='Chưa lưu được tùy chọn; thay đổi chỉ có hiệu lực trong phiên này.';paint();return;}if(enabled)void speak({isPreview:true,manual:true});paint();};
      host.querySelector('[data-voice-test]').onclick=()=>{activated=true;void speak({isPreview:true,manual:true,livePreview:true});};
    }paint();
  }
  function present(data){
    stop();configure(data.scope,true);const host=document.createElement('div');host.className='printer-voice-alert';host.innerHTML='<button type="button" class="notification-control">'+appIcon('volume')+'<span>Đọc thông báo</span></button><small role="status"></small>';(data.card.querySelector('.pn-content')||data.card).append(host);active={...data,host,attempted:false};
    host.querySelector('button').onclick=()=>{activated=true;if(playback){cancel();notice='Đã dừng đọc.';paint();return;}if(valid()){active.attempted=true;void speak({manual:true});}};
    const started=attempt();paint();return started;
  }
  function update(data){if(!active)return;if(!allowed||active.scope!==scope||!active.isCurrent()){stop();return;}if(textFor(active)!==textFor({...active,...data})){cancel();notice='Nội dung đã cập nhật. Chọn Đọc thông báo để nghe.';active.attempted=true;}Object.assign(active,data);paint();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancel();notice='';paint();}});window.addEventListener('pagehide',stop);
  window.addEventListener('storage',event=>{if(event.key!==preference())return;try{enabled=localStorage.getItem(preference())==='1';}catch{enabled=false;}if(!enabled){cancel();notice='';}paint();});
  const activate=event=>{if(event.isTrusted)activated=true;};window.addEventListener('pointerdown',activate,{passive:true});window.addEventListener('keydown',activate);
  window.PlatePrinterVoice={mount,present,update,stop,configure,textFor};
})();
