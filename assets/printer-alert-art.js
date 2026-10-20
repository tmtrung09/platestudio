/* Approved Signal design. Decoration only: alert policy, storage and actions stay in printer-monitor. */
(()=>{
  'use strict';
  const assets=new URL('printer-alerts/',document.currentScript.src);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copies={
    complete:{lead:'Mẻ in đã',word:'hoàn tất.',first:'Mẻ đã kết thúc',result:'Sẵn sàng kiểm tra kết quả.',note:'In xong chưa đồng nghĩa QC đạt.'},
    error:{lead:'Máy đã',word:'dừng.',first:'Đang có lỗi',result:'Chưa rõ nguyên nhân.',note:'Xem nội dung và mã lỗi gốc bên dưới.'},
    failed:{lead:'Mẻ in',word:'thất bại.',first:'Mẻ đã kết thúc',result:'Kết quả chưa hoàn thành.',note:'Cần kiểm tra kết quả thực tế tại máy.'},
    'feed-failed':{lead:'Không kéo được',word:'nhựa.',first:'Bánh kéo thử quay',result:'Sợi nhựa không tiến.',note:'Chưa xác định nguyên nhân cản đường cấp nhựa.'},
    'retract-failed':{lead:'Không rút được',word:'nhựa.',first:'Bánh kéo thử quay ngược',result:'Sợi nhựa không rút về.',note:'Chưa xác định điểm cản trên đường rút.'},
    runout:{lead:'Đã hết',word:'nhựa.',first:'Cuộn chỉ còn lõi rỗng',result:'Đường cấp nhựa trống.',note:'Minh họa trạng thái hết nhựa do máy báo.'},
    'nozzle-clog':{lead:'Đầu phun',word:'bị tắc.',first:'Nhựa tới đầu phun',result:'Dòng nhựa bị chặn.',note:'Hình dáng theo ảnh linh kiện · lớp cắt minh họa.'},
    spaghetti:{lead:'Phát hiện',word:'búi nhựa.',first:'Sợi nhựa rơi xuống',result:'Không tạo được lớp in.',note:'Cảnh minh họa phát hiện của máy; cần kiểm tra bản in.'},
    tangle:{lead:'Cuộn nhựa',word:'bị rối.',first:'Sợi nhựa căng lên',result:'Vòng chéo siết lại.',note:'Diễn biến sự cố là minh họa.'},
    adhesion:{lead:'Mẫu đã',word:'bong.',first:'Chân mẫu nhấc khỏi bàn',result:'Mẫu trượt khỏi vị trí.',note:'Diễn biến sự cố là minh họa.'}
  };
  // Only definitive catalog messages are mapped. A suggested cause is not a diagnosis.
  function issueScene(issue){
    if(issue?.severity!=='error')return '';
    const original=String(issue.original||'').trim(),code=String(issue.code||'').replace(/[^a-f\d]/gi,'').toUpperCase();
    if(['03004006','03008016','03001A0000020002'].includes(code))return 'nozzle-clog';
    if(/^The nozzle is clogged(?: with filament)?\./.test(original))return 'nozzle-clog';
    if(/^Unable to feed filament into the extruder\./.test(original))return 'feed-failed';
    if(/^Failed to pull (?:back|out) the filament from (?:the toolhead|the extruder)\./.test(original))return 'retract-failed';
    if(/^(?:AMS Lite filament has run out\.|(?:The )?(?:external filament|External filament)(?: connected to the (?:left|right) extruder)? has run out;|The filament on external spool has run out;|AMS [A-Z] Slot \d filament has run out\. Please insert)/.test(original))return 'runout';
    if(/^(?:Spaghetti defects were detected by the AI Print Monitoring\.|The AI print monitor has detected a spaghetti defect\.)/.test(original))return 'spaghetti';
    return '';
  }
  function resolve(event,issues=[]){
    if(event.type==='printer_finished')return 'complete';
    const scenes=[...new Set(issues.map(issueScene).filter(Boolean))];
    // Several different faults stay in the generic view with every original code visible.
    return scenes.length===1?scenes[0]:event.type==='printer_failed'?'failed':'error';
  }
  const machineMarkup="<div class=\"pn-machine\"><div class=\"pn-ground\"></div><div class=\"pn-shell\"></div><div class=\"pn-glass\"></div><div class=\"pn-base\"></div><div class=\"pn-post\"></div><div class=\"pn-crossbeam\"></div><div class=\"pn-interior\"><div class=\"pn-lead\"></div><div class=\"pn-platform\"></div><div class=\"pn-print\"></div><div class=\"pn-broken\"></div><div class=\"pn-rail\"></div><div class=\"pn-carriage\"><div class=\"pn-filament\"></div><div class=\"pn-head\"></div></div></div><div class=\"pn-door-handle\"></div><div class=\"pn-vent\"></div><div class=\"pn-spool\"></div><div class=\"pn-lightbar\"></div><div class=\"pn-logo\"></div><div class=\"pn-screen\"></div><div class=\"pn-status-led\"></div><div class=\"pn-feet\"></div></div>";
  const causeMarkup="<div class=\"pn-cause-scene\" aria-hidden=\"true\"><div class=\"pn-cause-heading\"></div><div class=\"pn-path-scene\"><div class=\"pn-reel\"><div class=\"pn-wound\"></div></div><div class=\"pn-inlet\"><div class=\"pn-strand\"></div></div><div class=\"pn-outlet\"><div class=\"pn-strand\"></div></div><div class=\"pn-knot\"></div><div class=\"pn-feeder-unit\"><div class=\"pn-gear\"></div><div class=\"pn-gear pn-gear-bottom\"></div><div class=\"pn-feeder-strand\"></div></div><div class=\"pn-hotend-unit\"><div class=\"pn-head-cover\"></div><div class=\"pn-heatblock\"></div><div class=\"pn-nozzle-tip\"></div><div class=\"pn-plug\"></div></div><div class=\"pn-flow-direction\"><i data-lucide=\"arrow-right\"></i></div><div class=\"pn-block-marker\"><i data-lucide=\"x\"></i></div><span class=\"pn-part-label pn-reel-label\">Cuộn nhựa</span><span class=\"pn-part-label pn-feed-label\">Bộ kéo</span><span class=\"pn-part-label pn-nozzle-label\">Đầu phun</span></div><div class=\"pn-print-scene\"><div class=\"pn-zoom-rail\"></div><div class=\"pn-hotend-unit\"><div class=\"pn-head-cover\"></div><div class=\"pn-heatblock\"></div><div class=\"pn-nozzle-tip\"></div></div><div class=\"pn-part-shadow\"></div><div class=\"pn-workbed\"></div><div class=\"pn-sample\"></div><div class=\"pn-spaghetti-bunch\"><div class=\"pn-loose-loop\"></div><div class=\"pn-loose-loop\"></div><div class=\"pn-loose-loop\"></div><div class=\"pn-loose-loop\"></div><div class=\"pn-loose-loop\"></div></div><span class=\"pn-print-scene-caption\"></span></div></div>";
  const focusFor=scene=>scene==='nozzle-clog'?'nozzle':['runout','tangle'].includes(scene)?'reel':['feed-failed','retract-failed'].includes(scene)?'feeder':['spaghetti','adhesion'].includes(scene)?'print':'';
  function update(card,{event,device={},issues=[],name=''}={}){
    if(!card||!event)return;
    const scene=resolve(event,issues),model=['A1','P1S','P2S','H2S'].includes(device.model)?device.model:'',focus=focusFor(scene),copy=copies[scene];
    const identity=name||device.name||event.title||'Máy in';
    const signature=JSON.stringify([scene,model,identity,event.title]);
    if(card.dataset.artSignature===signature)return;
    card.dataset.artSignature=signature;
    card.classList.add('pn-notice','pn-signal','pn-playing','pn-enter');card.classList.remove('pn-image-failed');
    card.classList.toggle('pn-has-cause',!!focus);card.classList.toggle('pn-long-word',copy.word.length>=8);
    Object.assign(card.dataset,{state:focus?'error':scene,cause:focus?scene:'',focus,model,scene});
    const old=card.querySelector('.pn-art'),wasMotion=old?.querySelector('[data-alert-motion]')===document.activeElement;
    if(!old){
      card.querySelector('header').classList.add('pm-alert-source-header');
      card.querySelector('#pm-alert-detail').classList.add('pn-file');
      card.querySelector('#pm-alert-time').classList.add('pn-time');
      const content=document.createElement('div');content.className='pn-content';
      const footer=card.querySelector('footer'),scroll=document.createElement('div');scroll.className='pn-alert-scroll';
      [...card.children].filter(n=>!n.matches('header,footer')).forEach(n=>content.append(n));
      scroll.append(card.querySelector('header'),content);card.append(scroll,footer);
    }
    const hero=document.createElement('div');hero.className='pn-art';
    hero.innerHTML=`<span class="pn-model-tag">${escape([model,identity].filter(Boolean).join(' / '))}</span><div class="pn-art-controls"><button type="button" class="btn-icon-only" data-alert-motion aria-label="Dừng hoạt ảnh minh họa" aria-pressed="false">${appIcon('pause')}</button><button type="button" class="btn-icon-only" data-alert-close aria-label="Đóng thông báo">${appIcon('close')}</button></div><div class="pn-eyebrow"><span class="pn-state-dot"></span><span>${scene==='complete'?'Hoàn thành':'Máy đã dừng · Cần kiểm tra'}</span></div><div class="pn-title" aria-hidden="true"><span class="pn-type-lead">${escape(copy.lead)}</span><span class="pn-type-word"><span class="pn-letterform">${escape(copy.word)}</span></span></div><div class="pn-machine-slot" aria-hidden="true">${model?machineMarkup:''}</div>${causeMarkup}<div class="pn-phase-summary">${escape(copy.result)}</div><p class="pn-description">${escape(copy.note)}</p>`;
    const illustration=hero.querySelector('.pn-cause-scene');illustration.setAttribute('role','img');illustration.removeAttribute('aria-hidden');illustration.setAttribute('aria-label',`${copy.first}. ${copy.result} Diễn biến minh họa, không phải ảnh trực tiếp.`);
    illustration.insertAdjacentHTML('beforeend',`<div class="pn-phase-copy" aria-hidden="true"><span class="pn-try">${escape(copy.first)}</span><span class="pn-verb">${escape(copy.result)}</span></div><div class="pn-nozzle-focus" aria-hidden="true"><img class="pn-photo-hotend" alt="" draggable="false"><div class="pn-focus-bore"></div><div class="pn-focus-material"></div><div class="pn-focus-obstruction"></div><div class="pn-focus-mark"></div><div class="pn-focus-pointer"></div><span class="pn-focus-label">Điểm tắc</span><span class="pn-focus-inlet-label">Sợi nhựa</span><span class="pn-reference-note">Lớp cắt và diễn biến minh họa</span></div>`);
    illustration.querySelector('.pn-cause-heading').textContent=({nozzle:'Cắt lớp đầu phun',feeder:'Cận cảnh bộ kéo nhựa',reel:scene==='runout'?'Cuộn nhựa đã hết':'Điểm rối trên cuộn',print:'Cận cảnh bản in'})[focus]||'';
    illustration.querySelector('.pn-feeder-unit').insertAdjacentHTML('afterbegin','<div class="pn-drive-wheel"></div>');
    illustration.querySelector('.pn-flow-direction').innerHTML=appIcon('arrow-right');
    if(focus==='nozzle'&&model){
      const image=illustration.querySelector('.pn-photo-hotend');image.src=new URL(`hotend-${model==='A1'?'a1':model==='P1S'?'p1':'h2'}.webp`,assets).href;
      image.onerror=()=>{image.hidden=true;card.classList.add('pn-image-failed');};
    }
    // Unknown models do not inherit the shape of a different printer.
    if(!model){hero.querySelector('.pn-machine-slot').hidden=true;hero.querySelector('.pn-nozzle-focus').classList.add('pn-no-reference');}
    if(model){const machine=hero.querySelector('.pn-machine');if(machine){machine.dataset.model=model;machine.querySelector('.pn-logo').textContent=model;}}
    old?old.replaceWith(hero):card.querySelector('.pn-alert-scroll').prepend(hero);
    if(wasMotion)hero.querySelector('[data-alert-motion]').focus({preventScroll:true});
    const overlay=card.closest('#printer-required-alert');
    const motion=hero.querySelector('[data-alert-motion]');
    const syncMotion=()=>{const paused=overlay.dataset.motion==='off';motion.setAttribute('aria-pressed',String(paused));motion.setAttribute('aria-label',paused?'Chạy hoạt ảnh minh họa':'Dừng hoạt ảnh minh họa');motion.innerHTML=appIcon(paused?'play':'pause');};
    motion.onclick=()=>{overlay.dataset.motion=overlay.dataset.motion==='off'?'on':'off';syncMotion();};syncMotion();
    hero.querySelector('[data-alert-close]').onclick=()=>card.querySelector('[data-alert-ack]').click();
  }
  window.PlatePrinterAlertArt=Object.freeze({resolve,issueScene,update});
})();
