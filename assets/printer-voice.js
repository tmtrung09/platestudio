/* Spoken printer alerts share the monitor's current-event and presenter policy. */
(() => {
  'use strict';
  const synth=window.speechSynthesis;
  const supported=!!synth&&typeof window.SpeechSynthesisUtterance==='function';
  const clean=value=>String(value||'').replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
  let scope='',allowed=false,enabled=false,activated=false,active=null,utterance=null,timer=0,notice='';
  const heard=new Set();
  const setText=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
  const preference=()=>`ps_printer_voice_v1_${encodeURIComponent(scope)}`;
  const history=()=>preference()+':spoken';
  const causes={
    'feed-failed':'Không kéo được nhựa.', 'retract-failed':'Không rút được nhựa.',
    runout:'Đã hết nhựa.', 'nozzle-clog':'Đầu phun bị tắc.',
    spaghetti:'Máy phát hiện búi nhựa. Cần kiểm tra bản in.'
  };
  function textFor({event,issues=[],name=''}) {
    const identity=clean(name)||'Máy in',machine=/^máy(?:\s|$)/i.test(identity)?identity:`Máy ${identity}`;
    if(event.type==='printer_finished')return `${machine} đã in xong. Vui lòng kiểm tra kết quả.`;
    const cause=causes[window.PlatePrinterAlertArt?.resolve(event,issues)];
    return `${machine} ${event.type==='printer_failed'?'in thất bại':'đã dừng vì lỗi'}. ${cause||'Vui lòng xem thông báo và kiểm tra máy.'}`;
  }
  function voice(){try{return synth?.getVoices().find(item=>/^vi(?:[-_]|$)/i.test(item.lang));}catch{return null;}}
  function cancel(){
    clearTimeout(timer);timer=0;
    if(!utterance)return;
    utterance.onstart=utterance.onend=utterance.onerror=null;utterance=null;
    try{synth.cancel();}catch{}
  }
  function stop(){cancel();active=null;notice='';paint();}
  function valid(){return !!active&&allowed&&!document.hidden&&active.scope===scope&&active.isCurrent();}
  function wasHeard(key){
    if(heard.has(scope+':'+key))return true;
    try{return JSON.parse(localStorage.getItem(history())||'[]').includes(key);}catch{return false;}
  }
  function remember(key){
    heard.add(scope+':'+key);
    try{const rows=JSON.parse(localStorage.getItem(history())||'[]');localStorage.setItem(history(),JSON.stringify([...new Set([...rows,key])].slice(-120)));}catch{}
  }
  function speak(text,{manual=false,preview=false}={}){
    const selected=voice();
    if(!supported||!selected){notice='Thiết bị chưa có giọng tiếng Việt. Thêm giọng trong cài đặt thiết bị rồi thử lại.';paint();return false;}
    if(document.hidden||!allowed||!preview&&!valid())return false;
    if(!activated&&!manual){notice='Chạm Đọc thông báo để phát giọng trên trình duyệt này.';paint();return false;}
    cancel();
    // Do not join or cancel another feature's speech queue.
    if(synth.speaking||synth.pending){notice='Giọng đọc đang bận. Chọn Nghe thử hoặc Đọc thông báo để thử lại.';paint();return false;}
    const item=new SpeechSynthesisUtterance(text),owner=scope,target=preview?null:active;
    item.lang=selected.lang;item.voice=selected;item.rate=1;item.pitch=1;item.volume=1;
    utterance=item;
    item.onstart=()=>{
      if(utterance!==item)return;
      if(owner!==scope||document.hidden||!allowed||target&&(!valid()||active!==target)){cancel();return;}
      clearTimeout(timer);timer=0;
      if(target){target.started=true;remember(target.key);}
      notice=preview?'Đang nghe thử giọng tiếng Việt…':'Đang đọc thông báo…';paint();
    };
    item.onend=()=>{if(utterance!==item)return;utterance=null;clearTimeout(timer);notice='';paint();};
    item.onerror=()=>{if(utterance!==item)return;utterance=null;clearTimeout(timer);notice='Chưa phát được giọng đọc. Chạm Nghe thử hoặc Đọc thông báo để thử lại.';paint();};
    notice='Đang chuẩn bị giọng đọc…';paint();
    timer=setTimeout(()=>{if(utterance!==item)return;cancel();notice='Trình duyệt chưa phát giọng. Chạm Nghe thử hoặc Đọc thông báo để thử lại.';paint();},6000);
    try{synth.speak(item);return true;}catch{cancel();notice='Chưa phát được giọng đọc. Hãy thử lại.';paint();return false;}
  }
  function attempt(){
    if(!enabled||!valid()||active.attempted||wasHeard(active.key))return false;
    if(!voice()){paint();return false;}
    if(!activated){notice='Chạm Đọc thông báo để phát giọng trên trình duyệt này.';paint();return false;}
    active.attempted=true;
    return speak(textFor(active));
  }
  function configure(nextScope,nextAllowed){
    if(scope!==nextScope||allowed!==nextAllowed){
      stop();scope=nextScope;allowed=!!nextAllowed;notice='';
      try{enabled=!!scope&&localStorage.getItem(preference())==='1';}catch{enabled=false;}
    }
    paint();
  }
  function status(){
    if(!supported)return 'Trình duyệt này chưa hỗ trợ giọng đọc.';
    if(notice)return notice;
    const selected=voice();
    if(!selected)return 'Chưa có giọng tiếng Việt trên thiết bị.';
    return enabled?`Giọng thiết bị: ${selected.name}. Đọc khi in xong hoặc dừng vì lỗi.`:'Bật để đọc tên máy, in xong và lỗi dừng máy.';
  }
  function paint(){
    document.querySelectorAll('[data-printer-voice-settings]').forEach(host=>{
      host.hidden=!allowed||!scope;
      const toggle=host.querySelector('[data-voice-toggle]'),test=host.querySelector('[data-voice-test]');
      toggle.disabled=!supported;toggle.setAttribute('aria-pressed',String(enabled));
      setText(toggle.querySelector('span'),`Giọng đọc máy ${enabled?'bật':'tắt'}`);
      test.disabled=!supported;
      setText(host.querySelector('[data-voice-status]'),status());
    });
    if(active?.host){
      const button=active.host.querySelector('button');
      button.disabled=!supported;
      setText(button.querySelector('span'),utterance?'Dừng đọc':wasHeard(active.key)?'Đọc lại':'Đọc thông báo');
      setText(active.host.querySelector('small'),notice||(!supported?'Trình duyệt chưa hỗ trợ giọng đọc.':!voice()?'Chưa có giọng tiếng Việt.':enabled?'Giọng tiếng Việt':'Tự động đọc đang tắt'));
    }
  }
  function mount(panel,{scope:nextScope,allowed:nextAllowed}){
    configure(nextScope,nextAllowed);
    if(!panel.querySelector('[data-printer-voice-settings]')){
      const host=document.createElement('div');host.className='printer-voice-settings';host.dataset.printerVoiceSettings='';
      host.innerHTML='<div><button type="button" class="notification-control" data-voice-toggle aria-pressed="false">'+appIcon('volume')+'<span>Giọng đọc máy tắt</span></button><button type="button" class="notification-control" data-voice-test>Nghe thử</button></div><small data-voice-status role="status"></small>';
      panel.querySelector('.notification-panel-footer').before(host);
      host.querySelector('[data-voice-toggle]').onclick=()=>{
        activated=true;enabled=!enabled;cancel();notice='';
        try{localStorage.setItem(preference(),enabled?'1':'0');}catch{notice='Chưa lưu được tùy chọn; thay đổi chỉ có hiệu lực trong phiên này.';paint();return;}
        if(enabled)speak('Đã bật giọng đọc máy. Thông báo sẽ đọc khi in xong hoặc máy dừng vì lỗi.',{manual:true,preview:true});
        paint();
      };
      host.querySelector('[data-voice-test]').onclick=()=>{activated=true;speak('Thông báo minh họa: Máy Mỹ Mỹ đã dừng vì lỗi. Không kéo được nhựa.',{manual:true,preview:true});};
    }
    paint();
  }
  function present(data){
    stop();configure(data.scope,true);
    const host=document.createElement('div');host.className='printer-voice-alert';
    host.innerHTML='<button type="button" class="notification-control">'+appIcon('volume')+'<span>Đọc thông báo</span></button><small role="status"></small>';
    (data.card.querySelector('.pn-content')||data.card).append(host);
    active={...data,host,attempted:false,started:false};notice='';
    host.querySelector('button').onclick=()=>{
      activated=true;
      if(utterance){cancel();notice='Đã dừng đọc.';paint();return;}
      if(valid()){active.attempted=true;speak(textFor(active),{manual:true});}
    };
    const result=attempt();paint();return result;
  }
  function update(data){
    if(!active)return;
    if(!valid()){stop();return;}
    if(textFor(active)!==textFor({...active,...data})){cancel();notice='Nội dung đã cập nhật. Chọn Đọc thông báo để nghe.';active.attempted=true;}
    Object.assign(active,data);paint();
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('pagehide',stop);
  window.addEventListener('storage',event=>{
    if(event.key!==preference())return;
    try{enabled=localStorage.getItem(preference())==='1';}catch{enabled=false;}
    if(!enabled)cancel();paint();
  });
  const activate=event=>{if(event.isTrusted)activated=true;};
  window.addEventListener('pointerdown',activate,{passive:true});window.addEventListener('keydown',activate);
  synth?.addEventListener('voiceschanged',()=>{paint();attempt();});
  window.PlatePrinterVoice={mount,present,update,stop,configure,textFor};
})();
