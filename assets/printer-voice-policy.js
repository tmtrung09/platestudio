/* Shared by the browser and authenticated voice service. No DOM or credentials. */
(() => {
  const previewText='Thông báo minh họa. Máy Tiểu Mỹ Thụ đã hoàn tất mẻ in. Máy Mỹ Mỹ đã dừng vì lỗi, không kéo được nhựa. Máy Pế Pế đã hết nhựa. Vui lòng kiểm tra máy.';
  const cleanName=value=>String(value||'').replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
  function issueScene(issue){
    if(issue?.severity!=='error')return '';
    const original=String(issue.original||'').trim(),code=String(issue.code||'').replace(/[^a-f\d]/gi,'').toUpperCase();
    if(['03004006','03008016','03001A0000020002'].includes(code)||/^The nozzle is clogged(?: with filament)?\./.test(original))return 'nozzle-clog';
    if(/^Unable to feed filament into the extruder\./.test(original))return 'feed-failed';
    if(/^Failed to pull (?:back|out) the filament from (?:the toolhead|the extruder)\./.test(original))return 'retract-failed';
    if(/^(?:AMS Lite filament has run out\.|(?:The )?(?:external filament|External filament)(?: connected to the (?:left|right) extruder)? has run out;|The filament on external spool has run out;|AMS [A-Z] Slot \d filament has run out\. Please insert)/.test(original))return 'runout';
    if(/^(?:Spaghetti defects were detected by the AI Print Monitoring\.|The AI print monitor has detected a spaghetti defect\.)/.test(original))return 'spaghetti';
    return '';
  }
  function scene(event,issues=[]){if(event.type==='printer_finished')return 'complete';const kinds=[...new Set(issues.map(issueScene).filter(Boolean))];return kinds.length===1?kinds[0]:event.type==='printer_failed'?'failed':'error';}
  function textFor({event,issues=[],name=''}){
    if(event.type==='preview')return previewText;
    const identity=cleanName(name)||'Máy in',machine=/^máy(?:\s|$)/i.test(identity)?identity:`Máy ${identity}`;
    if(event.type==='printer_finished')return `${machine} đã in xong. Vui lòng kiểm tra kết quả.`;
    const cause=({'feed-failed':'Không kéo được nhựa.','retract-failed':'Không rút được nhựa.',runout:'Đã hết nhựa.','nozzle-clog':'Đầu phun bị tắc.',spaghetti:'Máy phát hiện búi nhựa. Cần kiểm tra bản in.'})[scene(event,issues)];
    return `${machine} ${event.type==='printer_failed'?'in thất bại':'đã dừng vì lỗi'}. ${cause||'Vui lòng xem thông báo và kiểm tra máy.'}`;
  }
  function eligible(event,device,transitions=[],now=Date.now()){
    if(!event||!device||!['printer_finished','printer_paused','printer_failed','printer_stopped','printer_error'].includes(event.type)||device.online===false)return false;
    const at=Date.parse(event.createdAt),reported=Date.parse(device.lastReport);
    if(!Number.isFinite(at)||!Number.isFinite(reported)||reported<at||now-reported>120000||reported>now+10000||!event.jobKey||device.run?.id!==event.jobKey)return false;
    const latest=transitions.filter(row=>row.jobKey===event.jobKey&&['printer_started','printer_resumed','printer_paused','printer_failed','printer_stopped','printer_finished'].includes(row.type)).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||Number(b.printerSequence||0)-Number(a.printerSequence||0))[0];
    if(latest&&(Date.parse(latest.createdAt)>at||latest.createdAt===event.createdAt&&event.type!=='printer_error'&&Number(latest.printerSequence||0)>Number(event.printerSequence||0)))return false;
    if(event.type==='printer_finished')return ['FINISH','IDLE'].includes(device.phase)&&device.run.result==='finished';
    const errors=(device.issues||[]).filter(row=>row.severity==='error');
    if(!(device.phase==='PAUSE'||device.phase==='FAILED'||device.phase==='IDLE'&&['failed','stopped'].includes(device.run.result))||device.phase!=='FAILED'&&!errors.length)return false;
    return event.type!=='printer_error'||errors.some(row=>row.code===event.code&&(!event.episode||row.episode===event.episode));
  }
  globalThis.PlatePrinterVoicePolicy=Object.freeze({cleanName,scene,textFor,eligible,version:'enya-1'});
})();
