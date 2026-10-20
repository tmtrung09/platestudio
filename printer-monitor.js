/* On-demand browser monitor. Bambu credentials never enter this module. */
(() => {
  "use strict";
  const phaseText = {
    RUNNING: "Đang in",
    PREPARE: "Chuẩn bị",
    PAUSE: "Tạm dừng",
    FINISH: "Hoàn thành",
    FAILED: "Thất bại",
    IDLE: "Sẵn sàng",
    UNKNOWN: "Chờ dữ liệu",
  };
  let scope = "",
    generation = 0,
    abort = null,
    streaming = false,
    polling = false,
    connected = false,
    cursor = 0,
    primed = false,
    lastPoll = 0;
  let snapshot = { devices: {} },
    events = [],
    historyRows = [],
    moreHistory = false,
    historyOffset = 0,
    query = "",
    view = "live",
    message = "",
    aliases = {},
    ignored = {},
    readIds = {},
    pinned = false,
    modal = null,
    detailSelection = null,
    detailReturnScroll = 0;
  const detailRequests = new Set(), detailErrors = new Map();
  const requiredTypes = new Set(['printer_finished','printer_paused','printer_failed','printer_stopped','printer_error']);
  let requiredAlerts=new Map(), alertOverlay=null, alertFocus=null, alertRelease=null, alertLockPending=false, alertBusy=false, alertStoreDirty=true;
  let acknowledgedAlertKeys=new Set();
  let lastPrinterTransitions={};
  const alertInert=new Map();
  const alertPrefix=()=>`ps_printer_alerts_v1_${encodeURIComponent(scope)}:`;
  const alertKey=id=>alertPrefix()+encodeURIComponent(id);
  const needsConfirmation=event=>requiredTypes.has(event?.type);
  const icon = (name) => appIcon(name),
    e = (value) => esc(String(value ?? ""));
  const context = () => ({
    workspace: cloudWorkspaceId(),
    user: currentUser?.id || "",
    allowed:
      !!currentUser &&
      !!sb &&
      (canAccess("progress.view") || canAccess("plates.plan")) &&
      !STAFF_REPORT_MODE &&
      !STAFF_RECEIVING_MODE,
  });
  const key = () => `ps_printers_v1_${scope}`;
  const save = () => {
    try {
      localStorage.setItem(
        key(),
        JSON.stringify({ aliases, ignored, readIds, snapshot, events, cursor, lastPrinterTransitions }),
      );
    } catch {
      /* Server history is not removed on a full local cache. */
    }
  };
  const norm = (s) => searchFold(String(s || ""));
  const warningKey = (device, issue) =>
    JSON.stringify([device, issue.code, issue.episode]);
  const isIgnored = (device, issue) =>
    issue.severity === "warning" && !!ignored[warningKey(device, issue)];
  const date = (s) =>
    s ? new Date(s).toLocaleString("vi-VN") : "Chưa xác định";
  const time = (ms) => {
    if (!Number.isFinite(ms)) return "—";
    const mins = Math.floor(ms / 60000);
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };
  const thumb = (url) =>
    `<span class="pm-thumb" aria-hidden="true">${icon("model")}${url ? `<img src="${e(url)}" alt="" loading="lazy" onerror="this.hidden=true">` : ""}</span>`;
  const stale = (d) =>
    !connected || !d.lastReport || Date.now() - Date.parse(d.lastReport) > 120000;
  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }
  function image(node, url) {
    if(node.dataset.imageUrl===String(url||''))return;
    node.dataset.imageUrl=String(url||'');
    const img = node.querySelector("img");
    if (url && /^https:\/\//.test(url)) {
      if (!img || img.dataset.src !== url) {
        node.innerHTML = "";
        const el = document.createElement("img");
        el.dataset.src = url;
        el.src = url;
        el.alt = "";
        el.loading = "lazy";
        el.referrerPolicy = "no-referrer";
        el.onerror = () => {
          el.remove();
          node.append(document.createTextNode("Chưa có ảnh"));
        };
        node.append(el);
      }
    } else if (img || !node.textContent) node.textContent = "Chưa có ảnh";
  }
  function modelImage(model) {
    return /^(?:A1|A1 mini|P1S|P1P|P2S|H2S|X1 Carbon|X1C)$/.test(model)
      ? `https://cdn.jsdelivr.net/gh/bambulab/BambuStudio@47a13eeb1d9af65ef2371e361c856e21d4f6ca72/resources/profiles/BBL/${encodeURIComponent("Bambu Lab " + (model === "X1C" ? "X1 Carbon" : model) + "_cover.png")}`
      : null;
  }
  async function api(body, signal) {
    const ctx = context();
    if (!ctx.allowed || !ctx.workspace)
      throw new Error("Cần đăng nhập vào workspace có quyền xem máy.");
    const session = await sb.auth.getSession();
    if (!session.data?.session?.access_token)
      throw new Error("Phiên đăng nhập đã hết hạn.");
    const response = await fetch(SUPABASE_URL + "/functions/v1/bambu-monitor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + session.data.session.access_token,
      },
      body: JSON.stringify({ ...body, workspaceId: ctx.workspace }),
      priority:'low',
      signal:
        signal ||
        AbortSignal.timeout(body.action === "connect" ? 100000 : 30000),
    });
    return response;
  }
  async function request(body) {
    const response = await api(body),
      data = await response.json();
    if (!response.ok || data.error){const error=new Error(data.error || "Chưa nhận được dữ liệu máy in.");error.status=response.status;throw error;}
    return data;
  }
  // Each event has its own durable record: concurrent tabs cannot overwrite a
  // different event or turn an acknowledgment back into a pending array entry.
  function readAlert(id) {
    try {return JSON.parse(localStorage.getItem(alertKey(id))||'null');} catch {return null;}
  }
  function alertAssessment(event) {
    const device=snapshot.devices[event.printerId||event.deviceId];
    if(!primed||!device||stale(device)||device.online===false)return {status:'wait'};
    if(!event.jobKey||!device.run?.id)return {status:'obsolete'};
    if(device.run.id!==event.jobKey)return {status:'obsolete'};
    const time=Date.parse(event.createdAt),reported=Date.parse(device.lastReport);
    if(!Number.isFinite(time)||!Number.isFinite(reported)||reported<time||!['RUNNING','PREPARE','PAUSE','FAILED','FINISH','IDLE'].includes(device.phase))return {status:'wait'};
    const transitions=events.filter(row=>(row.printerId||row.deviceId)===(event.printerId||event.deviceId)&&row.jobKey===event.jobKey&&['printer_started','printer_resumed','printer_paused','printer_failed','printer_stopped','printer_finished'].includes(row.type));
    const retained=lastPrinterTransitions[event.printerId||event.deviceId];
    if(retained?.jobKey===event.jobKey)transitions.push(retained);
    const latest=transitions.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||Number(b.printerSequence||0)-Number(a.printerSequence||0))[0];
    if(latest&&(Date.parse(latest.createdAt)>time||latest.createdAt===event.createdAt&&event.type!=='printer_error'&&Number(latest.printerSequence||0)>Number(event.printerSequence||0)))return {status:'obsolete'};
    const base=JSON.stringify([event.printerId||event.deviceId,event.jobKey]);
    if(event.type==='printer_finished')return {status:['FINISH','IDLE'].includes(device.phase)&&device.run.result==='finished'?'active':'obsolete',key:base+':finished',issues:[]};
    const halted=device.phase==='PAUSE'||device.phase==='FAILED'||device.phase==='IDLE'&&['failed','stopped'].includes(device.run.result);
    if(!halted)return {status:'obsolete'};
    const issues=(device.issues||[]).filter(issue=>issue.severity==='error');
    if(device.phase!=='FAILED'&&!issues.length)return {status:'obsolete'};
    if(event.type==='printer_error'&&!issues.some(issue=>issue.code===event.code&&(!event.episode||issue.episode===event.episode)))return {status:'obsolete'};
    const halt=latest&&['printer_paused','printer_failed','printer_stopped'].includes(latest.type)?latest.id:event.episode||event.id;
    return {status:'active',key:base+':halt:'+halt,issues};
  }
  function retireRequiredAlert(id,row,reason) {
    requiredAlerts.delete(id);
    try{localStorage.setItem(alertKey(id),JSON.stringify({...row,resolved:true,resolution:reason,resolvedAt:new Date().toISOString()}));}catch{}
  }
  function reconcileRequiredAlerts() {
    const grouped=new Map();
    for(const [id,row] of requiredAlerts){
      const assessment=alertAssessment(row.event);
      if(assessment.status==='wait')continue;
      if(assessment.status!=='active'){retireRequiredAlert(id,row,'no-longer-actionable');continue;}
      row.confirmationKey=assessment.key;row.issues=assessment.issues;
      if(acknowledgedAlertKeys.has(assessment.key)){retireRequiredAlert(id,row,'already-dismissed');continue;}
      const earlier=grouped.get(assessment.key);
      if(earlier){retireRequiredAlert(id,row,'same-incident');continue;}
      grouped.set(assessment.key,row);
    }
  }
  function syncRequiredAlerts() {
    if(!scope||!alertStoreDirty)return;
    try {
      for(let i=0;i<localStorage.length;i++) {
        const name=localStorage.key(i);if(!name?.startsWith(alertPrefix()))continue;
        let row;try{row=JSON.parse(localStorage.getItem(name)||'null');}catch{continue;}
        if(!row?.event?.id||!needsConfirmation(row.event)||name!==alertKey(row.event.id))continue;
        if(row.acknowledged||row.resolved){requiredAlerts.delete(row.event.id);if(row.acknowledged&&row.confirmationKey)acknowledgedAlertKeys.add(row.confirmationKey);}
        else requiredAlerts.set(row.event.id,row);
      }
      alertStoreDirty=false;
    }catch {/* Pending in-memory alerts are kept if local persistence is unavailable. */}
  }
  function enqueueRequiredAlert(event) {
    const ctx=context();
    if(!event?.type?.startsWith('printer_'))return false;
    if(!needsConfirmation(event))return true;
    if(!ctx.allowed||scope!==ctx.workspace+':'+ctx.user||!eventIsForCurrentUser(event))return true;
    const saved=readAlert(event.id);
    if(saved?.acknowledged||saved?.resolved)return true;
    const assessment=alertAssessment(event);
    if(assessment.status==='obsolete'||assessment.key&&acknowledgedAlertKeys.has(assessment.key))return true;
    if(!requiredAlerts.has(event.id)) {
      const issues=assessment.issues||[];
      const row=saved||{event:{...event},issues,confirmationKey:assessment.key,acknowledged:false};
      row.durable=true;
      try {localStorage.setItem(alertKey(event.id),JSON.stringify(row));}
      catch {row.durable=false;}
      requiredAlerts.set(event.id,row);
    }
    queueMicrotask(pumpRequiredAlerts);return true;
  }
  function closeRequiredAlert({restoreFocus=true}={}) {
    window.PlatePrinterVoice?.stop();
    alertOverlay?.remove();alertOverlay=null;
    alertInert.forEach((value,node)=>{node.inert=value;});alertInert.clear();
    if(restoreFocus&&alertFocus?.isConnected)alertFocus.focus({preventScroll:true});
    alertFocus=null;
    const release=alertRelease;alertRelease=null;release?.();
  }
  function alertBlocked() {
    return [...document.querySelectorAll('.dlg-ov,[aria-modal="true"],.auth-ov,#ov-order-form,#ov-project-detail,#ov-batch-report,#confirm-ov,.cloud-loading-ov,.guide-tour-ov')].some(node=>{
      if(node.closest('#printer-required-alert'))return false;
      const style=getComputedStyle(node);
      return node.getClientRects().length&&style.visibility!=='hidden'&&node.getAttribute('aria-hidden')!=='true';
    });
  }
  async function openEventMachine(event) {
    if(!context().allowed)return false;
    const deviceId=event.printerId||event.deviceId;
    if(snapshot.devices[deviceId]) {
      closeSystemNotifications(false);query='';view='live';goPage('printer-monitor');selectDetail('machine',deviceId);return true;
    }
    const gen=generation;
    if(event.jobKey) {
      if(!historyRows.some(row=>row.id===event.jobKey))await loadDetailRun(event.jobKey);
      if(gen!==generation||!context().allowed)return false;
      if(historyRows.some(row=>row.id===event.jobKey)) {
        closeSystemNotifications(false);query='';view='history';goPage('printer-monitor');selectDetail('run',event.jobKey);return true;
      }
    }
    return false;
  }
  async function acknowledgeRequiredAlert(viewMachine=false,{dismiss=false}={}) {
    if(!alertOverlay||alertBusy)return;
    const id=alertOverlay.dataset.eventId,row=requiredAlerts.get(id),gen=generation;
    if(!row)return;
    const status=alertOverlay.querySelector('.pm-alert-status');
    alertBusy=true;alertOverlay.querySelectorAll('button').forEach(button=>button.disabled=true);
    try {
      if(viewMachine&&!await openEventMachine(row.event)) {
        if(gen===generation)setText(status,'Chưa mở được đúng máy hoặc mẻ. Thử lại hoặc chọn Đã biết.');return;
      }
      if(gen!==generation)return;
      try {localStorage.setItem(alertKey(id),JSON.stringify({event:{id,type:row.event.type},confirmationKey:row.confirmationKey,acknowledged:true,acknowledgedAt:new Date().toISOString()}));}
      catch {if(!dismiss){setText(status,'Chưa lưu được xác nhận trên thiết bị. Hãy thử lại; thông báo vẫn được giữ.');return;}toast('Đã đóng trong phiên này; chưa lưu được xác nhận nên có thể hiện lại khi tải lại trang.');}
      if(row.confirmationKey)acknowledgedAlertKeys.add(row.confirmationKey);
      requiredAlerts.delete(id);
      readIds[id]=true;
      const event=events.find(event=>event.id===id);if(event)event.readBy=[notificationUserKey()];
      save();closeRequiredAlert({restoreFocus:!viewMachine});ensureSystemNotificationButton();
      if(viewMachine)document.querySelector('.pm-detail h2')?.focus({preventScroll:true});
    }finally {
      alertBusy=false;
      if(gen===generation)alertOverlay?.querySelectorAll('button').forEach(button=>button.disabled=false);
    }
  }
  async function requestVoiceAudio(data,signal) {
    const ctx=context();if(!ctx.allowed||scope!==ctx.workspace+':'+ctx.user||!data.isPreview&&!data.isCurrent())throw new Error('Thông báo không còn hiệu lực.');
    const session=await sb.auth.getSession();if(!session.data?.session?.access_token)throw new Error('Cần đăng nhập để dùng giọng Enya.');
    const latest=context();if(!latest.allowed||ctx.workspace!==latest.workspace||ctx.user!==latest.user||signal.aborted)throw new Error('Phiên thông báo đã thay đổi.');
    return fetch(SUPABASE_URL+'/functions/v1/printer-voice',{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+session.data.session.access_token},body:JSON.stringify({workspaceId:ctx.workspace,...(data.isPreview?{mode:'preview'}:{eventId:data.event.id,name:data.name}),expectedHash:data.expectedHash}),signal});
  }
  function showRequiredAlert(row) {
    const event=row.event;
    closeSystemNotifications(false);
    alertFocus=document.activeElement;
    const overlay=document.createElement('div');overlay.id='printer-required-alert';overlay.dataset.eventId=event.id;
    overlay.innerHTML=`<section class="pm-alert-card" role="alertdialog" aria-modal="true" aria-labelledby="pm-alert-title" aria-describedby="pm-alert-detail pm-alert-time"><header><span class="pm-alert-icon" aria-hidden="true">${icon(event.type==='printer_finished'?'check':event.type==='printer_failed'?'warning':'pause')}</span><div><small class="pm-alert-kind">${event.type==='printer_finished'?'Hoàn thành':event.type==='printer_failed'?'Lỗi':'Máy đã ngừng in'}</small><h2 id="pm-alert-title">${e(event.title)}</h2></div></header><p id="pm-alert-detail">${e(event.detail||'Trạng thái do máy in báo.')}</p><small id="pm-alert-time">${e(date(event.createdAt))}</small><div class="pm-alert-issues">${(row.issues||[]).slice(0,4).map(issue=>`<p><span class="pm-notice-severity pm-notice-${e(issue.severity)}">${issue.severity==='error'?'Lỗi':issue.severity==='warning'?'Cảnh báo':'Thông tin'}</span> ${e(issue.text||issue.original||'Máy đang báo mã')} <small>${e(issue.code||'')}</small></p>`).join('')}${(row.issues||[]).length>4?'<small>Xem máy để đọc tất cả mã.</small>':''}</div><small class="pm-alert-queue"></small><p class="pm-alert-status" role="status"></p><footer><button type="button" class="btn btn-ghost" data-alert-ack>Đã biết</button><button type="button" class="btn btn-ac" data-alert-view>Xem máy</button></footer></section>`;
    overlay.dataset.severity=event.type==='printer_finished'?'success':'error';
    const device=snapshot.devices[event.printerId||event.deviceId];
    window.PlatePrinterAlertArt?.update(overlay.querySelector('.pm-alert-card'),{event,device,issues:row.issues,name:aliases[device?.id]||device?.name});
    overlay.querySelector('[data-alert-ack]').onclick=()=>void acknowledgeRequiredAlert();
    overlay.querySelector('[data-alert-view]').onclick=()=>void acknowledgeRequiredAlert(true);
    document.body.append(overlay);alertOverlay=overlay;
    for(const node of document.body.children)if(node!==overlay){alertInert.set(node,node.inert);node.inert=true;}
    if(row.durable===false)setText(overlay.querySelector('.pm-alert-status'),'Chưa lưu được thông báo trên thiết bị. Đừng tải lại trang trước khi xác nhận.');
    overlay.querySelector('[data-alert-ack]').focus({preventScroll:true});
    const spoken=window.PlatePrinterVoice?.present({requestAudio:requestVoiceAudio,scope,event,issues:row.issues,name:aliases[device?.id]||device?.name,key:row.confirmationKey||event.id,card:overlay.querySelector('.pm-alert-card'),isCurrent:()=>{const ctx=context();return alertOverlay===overlay&&ctx.allowed&&scope===ctx.workspace+':'+ctx.user&&alertAssessment(row.event).status==='active';}});
    if(!spoken)playNotificationSound();
  }
  function pumpRequiredAlerts() {
    const ctx=context(),valid=ctx.allowed&&scope===ctx.workspace+':'+ctx.user;
    window.PlatePrinterVoice?.configure(valid?scope:'',valid);
    if(!valid||document.hidden){closeRequiredAlert();return;}
    syncRequiredAlerts();reconcileRequiredAlerts();
    if(alertOverlay&&(!requiredAlerts.has(alertOverlay.dataset.eventId)||alertAssessment(requiredAlerts.get(alertOverlay.dataset.eventId).event).status!=='active'))closeRequiredAlert();
    if(alertOverlay) {
      const row=requiredAlerts.get(alertOverlay.dataset.eventId),issues=JSON.stringify(row.issues||[]);
      if(alertOverlay.dataset.issues!==issues){alertOverlay.dataset.issues=issues;alertOverlay.querySelector('.pm-alert-issues').innerHTML=(row.issues||[]).slice(0,4).map(issue=>`<p><span class="pm-notice-severity pm-notice-error">Lỗi</span> ${e(issue.text||issue.original||'Máy đang báo mã')} <small>${e(issue.code||'')}</small></p>`).join('')+((row.issues||[]).length>4?'<small>Xem máy để đọc tất cả mã.</small>':'');}
      const count=[...requiredAlerts.values()].filter(row=>alertAssessment(row.event).status==='active').length;
      const device=snapshot.devices[row.event.printerId||row.event.deviceId];
      window.PlatePrinterAlertArt?.update(alertOverlay.querySelector('.pm-alert-card'),{event:row.event,device,issues:row.issues,name:aliases[device?.id]||device?.name});
      window.PlatePrinterVoice?.update({event:row.event,issues:row.issues,name:aliases[device?.id]||device?.name});
      setText(alertOverlay.querySelector('.pm-alert-queue'),count>1?`${count} thông báo · hiển thị lần lượt`:'');return;
    }
    if(alertBusy||alertLockPending||!requiredAlerts.size||alertBlocked())return;
    const present=()=>{if(context().allowed&&!document.hidden&&!alertBlocked()){syncRequiredAlerts();reconcileRequiredAlerts();const row=[...requiredAlerts.values()].filter(row=>alertAssessment(row.event).status==='active').sort((a,b)=>Date.parse(a.event.createdAt)-Date.parse(b.event.createdAt))[0];if(row)showRequiredAlert(row);}};
    if(!navigator.locks){present();return;}
    alertLockPending=true;const gen=generation;
    void navigator.locks.request('ps-printer-alert-presenter:'+scope,{ifAvailable:true},async lock=>{
      if(!lock||gen!==generation)return;
      let release;const held=new Promise(resolve=>release=resolve);alertRelease=release;
      present();if(!alertOverlay){alertRelease=null;release();}await held;
    }).catch(()=>{}).finally(()=>{if(gen===generation)alertLockPending=false;});
  }
  function receive(data, { initial = false } = {}) {
    connected = !!data.connected;
    snapshot = data.state || snapshot;
    const known = new Map(events.map((event) => [event.id, event]));
    const rows = [...(data.events || [])].sort((a, b) => a.seq - b.seq);
    const fresh=[];
    for (const row of rows) {
      const event = {
        ...row.data,
        id: "printer:" + row.data.id,
        printerId: row.data.deviceId,
        printerSequence: Number(row.seq),
        permissions: ["progress.view", "plates.plan"],
        readBy: readIds["printer:" + row.data.id]
          ? [notificationUserKey()]
          : [],
      };
      known.set(event.id, event);
      if(['printer_started','printer_resumed','printer_paused','printer_failed','printer_stopped','printer_finished'].includes(event.type)){
        const prior=lastPrinterTransitions[event.printerId],at=Date.parse(event.createdAt),before=Date.parse(prior?.createdAt);
        if(!prior||at>before||at===before&&event.printerSequence>Number(prior.printerSequence||0))lastPrinterTransitions[event.printerId]=event;
      }
      cursor = Math.max(cursor, Number(row.seq));
      if (primed && !initial && !isIgnored(event.printerId, event)) {
        fresh.push(event);
      }
    }
    events = [...known.values()]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 200);
    if (initial || !primed) {
      const seen = seenNotificationIds();
      events.forEach((event) => seen.add(event.id));
      saveSeenNotificationIds(seen);
      primed = true;
    }
    for(const event of fresh){
      enqueueRequiredAlert(event);
      if(navigator.locks)void navigator.locks.request('ps-printer-notify:'+scope,()=>announceSystemEvent(event));
      else announceSystemEvent(event);
    }
    const all = new Map(historyRows.map((row) => [row.id, row]));
    (data.history || []).forEach((row) => all.set(row.id, row));
    historyRows = [...all.values()].sort(
      (a, b) =>
        Date.parse(b.data.firstObservedAt) - Date.parse(a.data.firstObservedAt),
    );
    if(Array.isArray(data.history))moreHistory = !!data.moreHistory;
    save();
    ensureSystemNotificationButton();
    render();
    renderPin();
    pumpRequiredAlerts();
  }
  async function poll({ initial = false, force = false } = {}) {
    const cameraPending=typeof batchCameraHasPending==='function'&&batchCameraHasPending();
    if(!initial&&cameraPending&&Date.now()-lastPoll<15000)return;
    if (
      polling ||
      !scope ||
      (!force && Date.now() - lastPoll < (connected ? 5000 : 60000))
    )
      return;
    const gen = generation;
    polling = true;
    lastPoll = Date.now();
    try {
      let data = await request({
        action: "read",
        cursor: initial ? 0 : cursor,
        initial,
        history:initial||(curPage==='printer-monitor'&&view==='history'),
      });
      if (gen !== generation) return;
      receive(data, { initial });
      while (!initial && data.moreEvents) {
        data = await request({ action: "read", cursor,history:false });
        if (gen !== generation) return;
        receive(data);
      }
      if (!streaming && connected) startStream(gen);
      if (!connected) {
        message = "Chưa kết nối Bambu Cloud";
        render();
      }
    } catch (error) {
      if (gen === generation) {
        message = error.message;
        render();
      }
    } finally {
      if (gen === generation) polling = false;
    }
  }
  async function startStream(gen) {
    if (streaming || !connected || !navigator.onLine) return;
    streaming = true;
    abort = new AbortController();
    const signal = abort.signal;
    try {
      const response = await api({ action: "stream" }, signal);
      if (gen !== generation) return;
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Chưa mở được luồng trạng thái");
      }
      if (!response.headers.get("content-type")?.includes("ndjson")) {
        const data = await response.json();
        message = data.busy
          ? "Đang theo dõi từ phiên web khác"
          : "Chờ trạng thái máy";
        return;
      }
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let tail = "";
      while (!signal.aborted) {
        const part = await reader.read();
        if (part.done) break;
        tail += decoder.decode(part.value, { stream: true });
        if (tail.length > 1000000)
          throw new Error("Luồng trạng thái không hợp lệ");
        let pos;
        while ((pos = tail.indexOf("\n")) >= 0) {
          const line = tail.slice(0, pos);
          tail = tail.slice(pos + 1);
          if (!line) continue;
          const data = JSON.parse(line);
          if (gen !== generation) return;
          if (data.kind === "error") throw new Error(data.error);
          if (data.kind === "connected") message = "Đã kết nối luồng máy";
          if (data.kind === "connecting") message = "Đang kết nối Bambu Cloud…";
          if (data.kind === "update") void poll({ force: true });
          render();
        }
      }
    } catch (error) {
      if (!signal.aborted && gen === generation) {
        message = error.message;
        render();
      }
    } finally {
      if (gen === generation) {
        streaming = false;
        abort = null;
        setTimeout(() => {
          if (gen === generation && connected) startStream(gen);
        }, 5000);
      }
    }
  }
  function reset(next) {
    closeRequiredAlert();requiredAlerts=new Map();acknowledgedAlertKeys=new Set();lastPrinterTransitions={};alertLockPending=false;alertBusy=false;alertStoreDirty=true;
    generation++;
    abort?.abort();
    abort = null;
    streaming = false;
    polling = false;
    scope = next;
    connected = false;
    cursor = 0;
    primed = false;
    lastPoll = 0;
    snapshot = { devices: {} };
    events = [];
    historyRows = [];
    historyOffset = 0;
    detailSelection = null;
    clearTimeout(detailCloseTimer);detailCloseTimer=0;
    detailRequests.clear();
    detailErrors.clear();
    moreHistory = false;
    aliases = {};
    ignored = {};
    readIds = {};
    message = "Đang kiểm tra kết nối…";
    document
      .querySelectorAll('.system-notification-popup[data-event-id^="printer:"]')
      .forEach(closeSystemNotificationPopup);
    if (next) {
      try {
        const saved = JSON.parse(localStorage.getItem(key()) || "{}");
        aliases = saved.aliases || {};
        ignored = saved.ignored || {};
        readIds = saved.readIds || {};
        snapshot = saved.snapshot || snapshot;
        events = saved.events || [];
        cursor = saved.cursor || 0;
        lastPrinterTransitions = saved.lastPrinterTransitions || {};
      } catch {}
    }
    render();
    renderPin();
    if (next) void poll({ initial: true, force: true });
    pumpRequiredAlerts();
  }
  function tick() {
    const ctx = context(),
      next = ctx.allowed && ctx.workspace ? ctx.workspace + ":" + ctx.user : "";
    if (next !== scope) reset(next);
    else if (next) void poll();
    renderPin();
    if (curPage === "printer-monitor") render();
    pumpRequiredAlerts();
  }
  function ignore(device, issue) {
    if (issue.severity !== "warning") return;
    ignored[warningKey(device, issue)] = true;
    for (const event of events)
      if (
        event.printerId === device &&
        event.code === issue.code &&
        event.episode === issue.episode
      ) {
        readIds[event.id] = true;
        event.readBy = [notificationUserKey()];
      }
    save();
    render();
    renderPin();
    ensureSystemNotificationButton();
    toast("Đã bỏ qua cảnh báo trên web.");
  }
  function restore(device, issue) {
    delete ignored[warningKey(device, issue)];
    save();
    render();
    renderPin();
  }
  function issuesHTML(device, issues) {
    return (issues || [])
      .map(
        (issue) =>
          `<div class="pm-issue pm-${e(issue.severity)}${isIgnored(device, issue) ? " pm-ignored" : ""}"><span>${icon(issue.severity === "info" ? "bell" : "warning")}<b>${issue.severity === "error" ? "Lỗi" : issue.severity === "warning" ? "Cảnh báo" : "Thông tin"}</b> · ${e(issue.code)}${isIgnored(device, issue) ? "<small>Đã bỏ qua</small>" : ""}</span><p>${e(issue.text || issue.detail)}</p>${issue.original ? `<details><summary>Nội dung gốc</summary><p>${e(issue.original)}</p></details>` : ""}${issue.severity === "warning" ? `<button type="button" class="btn btn-ghost btn-sm" data-pm-action="${isIgnored(device, issue) ? "restore" : "ignore"}" data-device="${e(device)}" data-code="${e(issue.code)}">${isIgnored(device, issue) ? "Hiện lại" : "Bỏ qua cảnh báo"}</button>` : ""}</div>`,
      )
      .join("");
  }
  function shell(host) {
    if (host.querySelector(".pm-toolbar")) return;
    host.innerHTML = `<section class="pm-workspace"><div class="pm-toolbar"><label class="page-smart-search"><span aria-hidden="true">${icon("search")}</span><input type="search" aria-label="Tìm máy hoặc mẻ in" placeholder="Tìm máy hoặc mẻ in…" autocomplete="off"></label><div class="pm-tabs"><button class="btn btn-ghost" data-pm-action="live">Hiện tại</button><button class="btn btn-ghost" data-pm-action="history">Lịch sử mẻ</button></div><button class="btn btn-ghost" data-pm-action="pin">Ghim gọn</button><button class="btn btn-ghost" data-pm-action="connect">Kết nối</button><button class="btn btn-ghost btn-icon-only" data-pm-action="retry" aria-label="Thử lại kết nối máy">${icon("refresh")}</button></div><p class="pm-connection" role="status"></p><div class="pm-count"></div><div class="pm-content"><div class="pm-list"><div class="pm-live"></div><div class="pm-history"></div><button class="btn btn-ghost pm-more" data-pm-action="more" hidden>Xem thêm mẻ</button></div><section id="pm-detail" class="pm-detail" aria-labelledby="pm-detail-title" hidden></section></div><p class="pm-footnote">Chỉ đọc trạng thái khi web mở. Mẻ in xong không tự cộng tồn hoặc xác nhận QC.</p></section>`;
    const panel=host.querySelector('.pm-detail'),slot=document.createElement('div'),clip=document.createElement('div');
    slot.className='pm-detail-slot';clip.className='pm-detail-clip';
    panel.before(slot);slot.append(clip);clip.append(panel);
    host.querySelector("input").value = query;
    host.querySelector("input").oninput = (event) => {
      query = event.target.value;
      render();
    };
    host.addEventListener("click", (event) => {
      const button = event.target.closest("[data-pm-action]");
      if (!button) {
        if(event.target.closest('button,input,summary,details,a,select'))return;
        const card=event.target.closest('.pm-machine,.pm-run');
        if(card)selectDetail(card.dataset.device?'machine':'run',card.dataset.device||card.dataset.run);
        return;
      }
      const action = button.dataset.pmAction,
        device = snapshot.devices[button.dataset.device];
      if (action === "live" || action === "history") {
        view = action;
        detailSelection = null;
        render();
      } else if (action === "connect") openConnection();
      else if (action === "retry") {
        lastPoll = 0;
        void poll({ force: true });
      } else if (action === "pin") {
        pinned = !pinned;
        renderPin();
        button.setAttribute("aria-pressed", String(pinned));
      } else if (action === "machine" || action === "run") selectDetail(action,button.dataset.device||button.dataset.run);
      else if (action === "close-detail") closeDetail();
      else if (action === "detail-retry") void loadDetailRun(button.dataset.run,true);
      else if (action === "rename") rename(device);
      else if (action === "ignore" || action === "restore") {
        const issue = device?.issues?.find(
          (i) => i.code === button.dataset.code,
        );
        if (issue) (action === "ignore" ? ignore : restore)(device.id, issue);
      } else if (action === "models") openModels(button.dataset.run);
      else if (action === "more") void loadMore();
    });
  }
  function render() {
    const host = document.getElementById("printer-monitor-page");
    if (!host || curPage !== "printer-monitor") return;
    shell(host);
    const ctx = context();
    host.querySelector('[data-pm-action="connect"]').hidden =
      !isWorkspaceOwner();
    setText(
      host.querySelector(".pm-connection"),
      !ctx.allowed
        ? "Đăng nhập để xem máy của xưởng."
        : message || "Đang theo dõi khi web mở.",
    );
    for (const action of ["live", "history"])
      host
        .querySelector(`[data-pm-action="${action}"]`)
        .setAttribute("aria-pressed", String(view === action));
    host.querySelector(".pm-live").hidden = view !== "live";
    host.querySelector(".pm-history").hidden = view !== "history";
    const devices = Object.values(snapshot.devices).filter(
      (d) =>
        !snapshot.boundDevices ||
        snapshot.boundDevices.some((b) => b.id === d.id),
    );
    const shown = devices.filter((d) =>
      norm(
        [
          aliases[d.id],
          d.name,
          d.model,
          d.fileName,
          ...(d.issues || []).map((i) => i.text),
        ].join(" "),
      ).includes(norm(query)),
    );
    setText(
      host.querySelector(".pm-count"),
      view === "live"
        ? `${shown.length}/${devices.length} máy`
        : `${historyRows.filter((row) => norm([row.data.machineName, row.data.fileName, ...(row.linked_models || []).map((m) => m.modelName)].join(" ")).includes(norm(query))).length} mẻ đã tải`,
    );
    const list = host.querySelector(".pm-live"),
      ids = new Set(shown.map((d) => d.id));
    if(detailSelection?.type==='machine'&&(!ctx.allowed||!ids.has(detailSelection.id)))detailSelection=null;
    [...list.children].forEach((node) => {
      if (!ids.has(node.dataset.device)) node.remove();
    });
    for (const [index, d] of shown.entries()) {
      let card = [...list.children].find(
        (node) => node.dataset.device === d.id,
      );
      if (!card) {
        card = document.createElement("article");
        card.className = "pm-machine";
        card.dataset.device = d.id;
        card.innerHTML = `<div class="pm-media"><div class="pm-machine-image"></div><div class="pm-job-image"></div></div><div class="pm-main"><header><button type="button" class="pm-machine-open pm-name" data-pm-action="machine" data-device="${e(d.id)}" aria-controls="pm-detail"></button><span class="pm-model"></span><button type="button" class="btn btn-ghost btn-sm btn-icon-only" data-pm-action="rename" data-device="${e(d.id)}" aria-label="Đổi biệt danh máy">${icon("edit")}</button></header><div class="pm-status"></div><div class="pm-file"></div><div class="pm-progress" role="progressbar" aria-label="Tiến độ in" aria-valuemin="0" aria-valuemax="100"><i></i></div><div class="pm-metrics"></div><small class="pm-seen"></small><details class="pm-issues"><summary></summary><div></div></details></div>`;
        list.append(card);
      }
      setText(card.querySelector(".pm-name"), aliases[d.id] || d.name);
      const selected=detailSelection?.type==='machine'&&detailSelection.id===d.id;
      card.classList.toggle('pm-selected',selected);
      card.querySelector('.pm-machine-open').setAttribute('aria-expanded',String(selected));
      card.querySelector('.pm-machine-open').setAttribute('aria-label','Xem chi tiết '+(aliases[d.id]||d.name));
      setText(card.querySelector(".pm-model"), d.model);
      const activeErrors = (d.issues || []).filter(
          (i) => i.severity === "error",
        ),
        activeWarnings = (d.issues || []).filter(
          (i) => i.severity === "warning" && !isIgnored(d.id, i),
        );
      card.classList.toggle("pm-has-error", !!activeErrors.length);
      card.classList.toggle("pm-stale", stale(d) || !d.online);
      setText(
        card.querySelector(".pm-status"),
        `${phaseText[d.phase] || "Chờ dữ liệu"}${d.online===false ? " · Máy ngoại tuyến" : stale(d) ? " · Dữ liệu cũ" : ""}${activeErrors.length ? " · Có lỗi" : activeWarnings.length ? " · Có cảnh báo" : ""}`,
      );
      setText(card.querySelector(".pm-file"), d.fileName || "Chưa có tên mẻ");
      const bar = card.querySelector(".pm-progress");
      bar.setAttribute("aria-valuenow", String(d.percent || 0));
      bar.querySelector("i").style.width = (d.percent || 0) + "%";
      setText(
        card.querySelector(".pm-metrics"),
        `${d.percent ?? "—"}% · Layer ${d.layer ?? "—"}/${d.totalLayers ?? "—"} · Còn ${d.remainingMinutes === undefined ? "—" : time(d.remainingMinutes * 60000)} · Đầu ${d.nozzle ?? "—"}° / Bàn ${d.bed ?? "—"}°`,
      );
      setText(card.querySelector(".pm-seen"), "Báo cáo: " + date(d.lastReport));
      image(card.querySelector(".pm-machine-image"), modelImage(d.model));
      image(card.querySelector(".pm-job-image"), d.run?.thumbnail);
      const issueBox = card.querySelector(".pm-issues");
      issueBox.hidden = !(d.issues || []).length;
      setText(
        issueBox.querySelector("summary"),
        `${activeErrors.length} lỗi · ${activeWarnings.length} cảnh báo${(d.issues || []).some((i) => isIgnored(d.id, i)) ? " · Có cảnh báo đã bỏ qua" : ""}`,
      );
      const html = issuesHTML(d.id, d.issues);
      if (issueBox.lastElementChild.innerHTML !== html)
        issueBox.lastElementChild.innerHTML = html;
      if (list.children[index] !== card)
        list.insertBefore(card, list.children[index] || null);
    }
    if (!shown.length) {
      list.innerHTML =
        '<p class="empty">' +
        (devices.length
          ? "Không tìm thấy máy phù hợp."
          : "Chưa có dữ liệu máy. Chủ xưởng chọn Kết nối để đăng nhập Bambu.") +
        "</p>";
    }
    renderHistory(host);
    renderDetail(host);
    host.querySelector(".pm-more").hidden = view !== "history" || !moreHistory;
  }
  function renderHistory(host) {
    const list = host.querySelector(".pm-history");
    if (view !== "history") return;
    const shown = historyRows.filter((row) =>
        norm(
          [
            row.data.machineName,
            row.data.fileName,
            ...(row.linked_models || []).map((m) => m.modelName),
          ].join(" "),
        ).includes(norm(query)),
      ),
      ids = new Set(shown.map((row) => row.id));
    if(detailSelection?.type==='run'&&!ids.has(detailSelection.id))detailSelection=null;
    [...list.children].forEach((node) => {
      if (!ids.has(node.dataset.run)) node.remove();
    });
    for (const [index, row] of shown.entries()) {
      const run = row.data;
      let card = [...list.children].find((node) => node.dataset.run === row.id);
      if (!card) {
        card = document.createElement("article");
        card.className = "pm-run";
        card.dataset.run = row.id;
        card.innerHTML =
          '<div class="pm-job-image"></div><div class="pm-run-copy"></div>';
        list.append(card);
      }
      image(card.firstElementChild, run.thumbnail);
      card.classList.toggle('pm-selected',detailSelection?.type==='run'&&detailSelection.id===row.id);
      const html = `<button type="button" class="pm-machine-open" data-pm-action="run" data-run="${e(row.id)}" aria-controls="pm-detail" aria-expanded="${detailSelection?.type==='run'&&detailSelection.id===row.id}">${e(run.fileName || "Mẻ chưa có tên")}</button><p>${e(aliases[run.deviceId] || run.machineName)} · ${e(run.machineModel)} · ${e({ running: "Đang theo dõi", finished: "Hoàn thành", failed: "Thất bại", stopped: "Dừng", unknown: "Chưa rõ kết quả" }[run.result] || "Chưa rõ kết quả")}</p><dl><div><dt>Bắt đầu ghi nhận</dt><dd>${e(date(run.startedObservedAt || run.firstObservedAt))}${!run.startedObservedAt ? " (giữa mẻ)" : ""}</dd></div><div><dt>Kết thúc ghi nhận</dt><dd>${e(date(run.endedObservedAt))}</dd></div><div><dt>Thời gian in đã theo dõi</dt><dd>${e(time(run.printingMs))}${run.gap ? " · Có khoảng trống dữ liệu" : ""}</dd></div><div><dt>Tạm dừng đã theo dõi</dt><dd>${e(time(run.pausedMs))}</dd></div></dl><div class="pm-model-links">${(row.linked_models || []).map((m) => `<span>${thumb(m.image)}${e(m.modelName)}${m.variantName ? " · " + e(m.variantName) : ""} × ${e(m.qty)}</span>`).join("") || "<small>Chưa ghép model — không tự đoán từ tên file.</small>"}</div>${canAccess("plates.plan") ? `<button type="button" class="btn btn-ghost" data-pm-action="models" data-run="${e(row.id)}">Ghép model</button>` : ""}`;
      if (
        card.lastElementChild.innerHTML !== html &&
        !card.contains(document.activeElement)
      )
        card.lastElementChild.innerHTML = html;
      card.querySelector('[data-pm-action="run"]')?.setAttribute('aria-expanded',String(detailSelection?.type==='run'&&detailSelection.id===row.id));
      if (list.children[index] !== card)
        list.insertBefore(card, list.children[index] || null);
    }
    if (!shown.length)
      list.innerHTML =
        '<p class="empty">Chưa có mẻ phù hợp đã được ghi nhận.</p>';
  }
  let detailMotionRequested=false,detailCloseTimer=0;
  function renderDetailMotion() {
    detailMotionRequested=true;
    try{render();}finally{detailMotionRequested=false;}
  }
  function setDetailLayout(host,visible) {
    const panel=host.querySelector('.pm-detail'),layout=host.querySelector('.pm-content');
    const wasOpen=layout.classList.contains('pm-detail-open');
    const animate=detailMotionRequested&&!matchMedia('(prefers-reduced-motion:reduce)').matches;
    // Telemetry must not restart or cut short a user-initiated collapse.
    if(!visible&&detailCloseTimer&&!detailMotionRequested&&context().allowed)return;
    if(visible&&wasOpen)return;
    clearTimeout(detailCloseTimer);detailCloseTimer=0;
    layout.classList.toggle('pm-motion-off',!animate);
    panel.inert=!visible;panel.setAttribute('aria-hidden',String(!visible));
    if(visible){
      panel.hidden=false;
      if(!wasOpen)void layout.offsetWidth; // Establish the collapsed track before expanding.
      layout.classList.add('pm-detail-open');
    }else{
      layout.classList.remove('pm-detail-open');
      if(animate&&wasOpen){
        const scroll=detailReturnScroll;
        detailCloseTimer=setTimeout(()=>{
          detailCloseTimer=0;panel.hidden=true;
          if(curPage==='printer-monitor'&&innerWidth<1100)document.querySelector('.pg-content')?.scrollTo({top:scroll,behavior:'instant'});
        },350);
      }else panel.hidden=true;
    }
  }
  function selectDetail(type,id) {
    if(!context().allowed)return;
    if(type==='machine'&&!snapshot.devices[id])return;
    if(type==='run'&&!historyRows.some(row=>row.id===id))return;
    if(!detailSelection&&!detailCloseTimer)detailReturnScroll=document.querySelector('.pg-content')?.scrollTop||0;
    detailSelection={type,id};
    renderDetailMotion();
    const panel=document.querySelector('#printer-monitor-page .pm-detail');
    panel?.querySelector('h2')?.focus({preventScroll:true});
    if(innerWidth<1100)panel?.scrollIntoView({block:'start',behavior:'instant'});
  }
  function closeDetail() {
    const selected=detailSelection;
    detailSelection=null;
    renderDetailMotion();
    if(innerWidth<1100)document.querySelector('.pg-content')?.scrollTo({top:detailReturnScroll,behavior:'instant'});
    const cards=document.querySelectorAll('#printer-monitor-page .pm-machine,#printer-monitor-page .pm-run');
    [...cards].find(card=>(selected?.type==='machine'?card.dataset.device:card.dataset.run)===selected?.id)?.querySelector('[data-pm-action="machine"],[data-pm-action="run"]')?.focus({preventScroll:true});
  }
  async function loadDetailRun(id,force=false) {
    if(!id||detailRequests.has(id)||(!force&&detailErrors.has(id)))return;
    const gen=generation;
    detailRequests.add(id);detailErrors.delete(id);
    try {
      const data=await request({action:'read',runId:id});
      if(gen!==generation)return;
      if(data.run?.id!==id||!data.run.data)throw new Error('Chưa nhận được đúng mẻ đã chọn.');
      const index=historyRows.findIndex(row=>row.id===id);
      if(index<0)historyRows.push(data.run);else historyRows[index]=data.run;
    }catch(error){if(gen===generation)detailErrors.set(id,error.message);}
    finally{if(gen===generation){detailRequests.delete(id);render();}}
  }
  function renderDetail(host) {
    const panel=host.querySelector('.pm-detail'),layout=host.querySelector('.pm-content');
    const device=detailSelection?.type==='machine'?snapshot.devices[detailSelection.id]:null;
    const id=device?.run?.id||(detailSelection?.type==='run'?detailSelection.id:null);
    const row=id?historyRows.find(row=>row.id===id):null;
    const visible=context().allowed&&!!detailSelection&&!!(device||row);
    if(!visible){setDetailLayout(host,false);return;}
    panel.hidden=false;
    panel.style.setProperty('--pm-nav-offset',((document.querySelector('.page.active .production-navigation-slot')?.getBoundingClientRect().height||0)+10)+'px');
    if(!panel.firstElementChild)panel.innerHTML=`<header class="pm-detail-head"><div class="pm-detail-machine-image"></div><div><h2 id="pm-detail-title" tabindex="-1"></h2><small class="pm-detail-model"></small></div><button type="button" class="btn btn-ghost btn-icon-only" data-pm-action="close-detail" aria-label="Đóng chi tiết máy và mẻ">${icon('close')}</button></header><div class="pm-detail-image"></div><div class="pm-detail-titleline"><h3 class="pm-detail-file"></h3><strong class="pm-detail-percent"></strong></div><p class="pm-detail-status"></p><div class="pm-progress" role="progressbar" aria-label="Tiến độ mẻ đang xem" aria-valuemin="0" aria-valuemax="100"><i></i></div><p class="pm-detail-metrics"></p><dl class="pm-detail-facts"></dl><p class="pm-detail-gap"></p><div class="pm-detail-issues"></div><p class="pm-detail-read-status" role="status"></p><button type="button" class="btn btn-ghost" data-pm-action="detail-retry">Tải lại mẻ</button><section class="pm-detail-models"><h3>Model trong mẻ</h3><div class="pm-model-links"></div><button type="button" class="btn btn-ghost" data-pm-action="models">Ghép model</button></section><section class="pm-detail-log"><h3>Diễn biến mẻ</h3><ol></ol></section><p class="pm-detail-control">Chỉ đọc trạng thái; điều khiển cloud chưa được Bambu xác thực.</p>`;
    // Telemetry supplies current timing; only the exact saved run supplies confirmed model links.
    const run=device?{...(row?.data||{}),...(device.run||{})}:row.data;
    const name=aliases[device?.id||run.deviceId]||device?.name||run.machineName||'Máy in';
    setText(panel.querySelector('h2'),name);
    setText(panel.querySelector('.pm-detail-model'),(device?.model||run.machineModel||'Chưa rõ dòng máy')+' · '+(device?'Báo cáo: '+date(device.lastReport):'Mẻ lịch sử'));
    image(panel.querySelector('.pm-detail-machine-image'),modelImage(device?.model||run.machineModel));
    image(panel.querySelector('.pm-detail-image'),run.thumbnail);
    setText(panel.querySelector('.pm-detail-file'),run.fileName||device?.fileName||'Chưa có mẻ được ghi nhận');
    setText(panel.querySelector('.pm-detail-percent'),device?`${device.percent??'—'}%`:'');
    const errors=(device?.issues||[]).filter(issue=>issue.severity==='error');
    panel.classList.toggle('pm-has-error',errors.length>0);
    panel.classList.toggle('pm-stale',!!device&&(stale(device)||!device.online));
    const status=device?`${phaseText[device.phase]||'Chờ dữ liệu'}${device.online===false?' · Máy ngoại tuyến':stale(device)?' · Dữ liệu cũ':''}${errors.length?' · Có lỗi':''}`:({running:'Đang theo dõi',finished:'Hoàn thành',failed:'Thất bại',stopped:'Dừng',unknown:'Chưa rõ kết quả'}[run.result]||'Chưa rõ kết quả');
    setText(panel.querySelector('.pm-detail-status'),status);
    const bar=panel.querySelector('.pm-progress');bar.hidden=!device;
    bar.setAttribute('aria-valuenow',String(device?.percent||0));bar.querySelector('i').style.width=(device?.percent||0)+'%';
    setText(panel.querySelector('.pm-detail-metrics'),device?`Layer ${device.layer??'—'}/${device.totalLayers??'—'} · Còn ${Number.isFinite(device.remainingMinutes)?time(device.remainingMinutes*60000):'—'} · Đầu ${device.nozzle??'—'}° / Bàn ${device.bed??'—'}°`:'');
    const estimate=device&&['RUNNING','PREPARE'].includes(device.phase)&&!stale(device)&&device.online!==false&&!errors.length&&Number.isFinite(device.remainingMinutes)?new Date(Date.parse(device.lastReport)+device.remainingMinutes*60000).toISOString():null;
    const total=Number.isFinite(run.printingMs)&&Number.isFinite(run.pausedMs)?time(run.printingMs+run.pausedMs):'Chưa xác định';
    const facts=[['Bắt đầu ghi nhận',run.startedObservedAt?date(run.startedObservedAt):run.firstObservedAt?date(run.firstObservedAt)+' (giữa mẻ)':'Chưa xác định'],['Kết thúc ghi nhận',date(run.endedObservedAt)],['Dự kiến xong',date(estimate)],['Thời gian in đã theo dõi',time(run.printingMs)],['Tạm dừng đã theo dõi',time(run.pausedMs)],['Tổng thời gian đã theo dõi',total]];
    const factsNode=panel.querySelector('.pm-detail-facts');
    if(!factsNode.children.length)factsNode.innerHTML=facts.map(()=>'<div><dt></dt><dd></dd></div>').join('');
    facts.forEach(([label,value],i)=>{setText(factsNode.children[i].firstElementChild,label);setText(factsNode.children[i].lastElementChild,value);});
    setText(panel.querySelector('.pm-detail-gap'),run.gap?'Có khoảng trống dữ liệu; các thời gian theo dõi không phải tổng thời gian thực của máy.':'');
    const issueNode=panel.querySelector('.pm-detail-issues'),issueHTML=issuesHTML(device?.id,device?.issues);
    if(issueNode.innerHTML!==issueHTML)issueNode.innerHTML=issueHTML;
    const readStatus=panel.querySelector('.pm-detail-read-status');
    setText(readStatus,id?(detailErrors.get(id)||(!row?'Đang tải thông tin mẻ…':'')):'Chưa có ID mẻ; không tự đoán model từ tên file.');
    const retry=panel.querySelector('[data-pm-action="detail-retry"]');retry.dataset.run=id||'';retry.hidden=!id||!detailErrors.has(id);retry.disabled=detailRequests.has(id);
    const links=panel.querySelector('.pm-detail-models .pm-model-links'),linked=row?.linked_models||[];
    const modelKey=m=>JSON.stringify([m.modelId,m.variantId||'']);
    [...links.children].forEach(node=>{if(!linked.some(m=>modelKey(m)===node.dataset.key))node.remove();});
    linked.forEach(m=>{let node=[...links.children].find(node=>node.dataset.key===modelKey(m));if(!node){node=document.createElement('span');node.dataset.key=modelKey(m);node.innerHTML='<span class="pm-thumb"></span><span class="pm-link-label"></span>';links.append(node);}image(node.firstElementChild,m.image);setText(node.lastElementChild,`${m.modelName}${m.variantName?' · '+m.variantName:''} × ${m.qty}`);});
    if(!linked.length){let empty=links.querySelector('small');if(!empty){empty=document.createElement('small');links.append(empty);}setText(empty,row?'Chưa ghép model — không tự đoán từ tên file.':id?'Chưa xác nhận liên kết model của mẻ này.':'Chưa ghép model.');}
    const modelsButton=panel.querySelector('[data-pm-action="models"]');modelsButton.hidden=!row||!canAccess('plates.plan');modelsButton.dataset.run=id||'';
    const logs=[];
    if(run.firstObservedAt)logs.push([run.firstObservedAt,run.startedObservedAt?'Lần đầu ghi nhận mẻ':'Lần đầu thấy giữa mẻ — chưa biết giờ bắt đầu thực']);
    if(run.startedObservedAt)logs.push([run.startedObservedAt,'Bắt đầu in được ghi nhận']);
    events.filter(event=>event.jobKey===id&&event.printerId===(device?.id||run.deviceId)).forEach(event=>logs.push([event.createdAt,event.title+(event.code?' · '+event.code:'')]));
    if(run.endedObservedAt)logs.push([run.endedObservedAt,'Máy kết thúc mẻ · '+status]);
    if(run.lastObservedAt)logs.push([run.lastObservedAt,'Lần cuối ghi nhận mẻ']);
    const logHTML=logs.sort((a,b)=>Date.parse(a[0])-Date.parse(b[0])).map(([at,label])=>`<li><time>${e(date(at))}</time><span>${e(label)}</span></li>`).join('')||'<li>Chưa có diễn biến được ghi nhận.</li>';
    const logNode=panel.querySelector('.pm-detail-log ol');if(logNode.innerHTML!==logHTML)logNode.innerHTML=logHTML;
    setDetailLayout(host,true);
    if(id&&!row&&!detailRequests.has(id)&&!detailErrors.has(id))void loadDetailRun(id);
  }
  async function loadMore() {
    const gen = generation;
    historyOffset += 50;
    try {
      const data = await request({
        action: "read",
        cursor,
        offset: historyOffset,
      });
      if (gen === generation) receive(data);
    } catch (error) {
      historyOffset -= 50;
      toast(error.message);
    }
  }
  function rename(device) {
    if (!device) return;
    const ov = document.getElementById("dlg-mv");
    if (ov.style.display === "flex") return;
    ov.innerHTML = `<div class="dlg pm-rename"><div class="dlg-title">Biệt danh máy</div><label class="field"><span>${e(device.model)}</span><input maxlength="120" aria-label="Biệt danh máy" value="${e(aliases[device.id] || device.name)}"></label><div class="dlg-actions"><button class="btn btn-ghost" data-cancel>Huỷ</button><button class="btn btn-ac" data-save>Lưu trên thiết bị</button></div></div>`;
    ov.style.display = "flex";
    const initial = ov.querySelector("input").value;
    modal = {
      node: ov.firstElementChild,
      dirty: () => ov.querySelector("input")?.value !== initial,
    };
    ov.onclick = () => closeDialog("dlg-mv");
    ov.querySelector(".dlg").onclick = (event) => event.stopPropagation();
    ov.querySelector("[data-cancel]").onclick = () => closeDialog("dlg-mv");
    ov.querySelector("[data-save]").onclick = () => {
      const value = ov.querySelector("input").value.trim();
      if (!value) {
        toast("Nhập biệt danh máy.");
        return;
      }
      aliases[device.id] = value;
      save();
      modal = null;
      closeDialog("dlg-mv");
      render();
      renderPin();
    };
    ov.querySelector("input").focus();
  }
  function openConnection() {
    if (!isWorkspaceOwner()) {
      toast("Chỉ chủ xưởng kết nối tài khoản Bambu.");
      return;
    }
    const ov = document.getElementById("dlg-mv");
    if (ov.style.display === "flex") return;
    ov.innerHTML = `<div class="dlg pm-connect"><div class="dlg-title">Kết nối Bambu Cloud</div><p>Dùng email đã liên kết tài khoản Bambu. Không cần chạy app Windows.</p><label class="field"><span>Khu vực</span><select aria-label="Khu vực Bambu"><option value="Global">Global</option><option value="China">China</option></select></label><label class="field"><span>Email Bambu</span><input type="email" autocomplete="email" aria-label="Email Bambu"></label><button class="btn btn-ghost" data-email>Gửi mã email</button><label class="field"><span>Mã email</span><input inputmode="numeric" autocomplete="one-time-code" aria-label="Mã email" maxlength="12"></label><p class="pm-auth-status" role="status"></p><p>Chỉ đọc trạng thái. Điều khiển máy chưa được Bambu xác thực.</p><div class="dlg-actions"><button class="btn btn-ghost" data-cancel>Đóng</button>${connected ? '<button class="btn btn-ghost" data-disconnect>Ngắt liên kết</button>' : ""}<button class="btn btn-ac" data-login>Kết nối</button></div></div>`;
    ov.style.display = "flex";
    ov.querySelector(".dlg").onclick = (event) => event.stopPropagation();
    ov.querySelector("[data-cancel]").onclick = () => closeDialog("dlg-mv");
    const status = ov.querySelector(".pm-auth-status");
    const dialog=ov.firstElementChild;ov.onclick=()=>closeDialog('dlg-mv');
    let busy=false,emailRetryAt=0;
    modal={node:dialog,busy:()=>busy};
    const controls=()=>{
      dialog.querySelectorAll('[data-login],[data-disconnect]').forEach(el=>el.disabled=busy);
      const send=dialog.querySelector('[data-email]');if(send)send.disabled=busy||Date.now()<emailRetryAt;
    };
    const run = async (action, button) => {
      if (busy || button.disabled) return;
      const gen = generation;
      busy=true;controls();
      status.textContent = action==='email'?'Đang gửi yêu cầu mã email…':action==='connect'?'Đang xác nhận mã và kết nối Bambu…':'Đang ngắt liên kết…';
      try {
        const region = ov.querySelector("select").value,
          email = ov.querySelector('[type="email"]').value.trim(),
          code = ov
            .querySelector('[autocomplete="one-time-code"]')
            .value.trim();
        await request({ action, region, email, code });
        if (gen !== generation)
          throw new Error("Workspace đã đổi. Mở lại kết nối.");
        if (action === "email") {
          status.textContent = "Đã gửi yêu cầu. Nhập mã email mới nhất.";
          emailRetryAt=Date.now()+60000;
          setTimeout(controls,60000);
          if(ov.firstElementChild===dialog)ov.querySelector('[autocomplete="one-time-code"]').focus();
          return;
        }
        if(ov.firstElementChild===dialog)ov.querySelector('[autocomplete="one-time-code"]').value = "";
        if (action === "disconnect") {
          connected = false;
          abort?.abort();
          message = "Đã ngắt liên kết. Lịch sử vẫn được giữ.";
        } else {
          connected = true;
          message = "Đã liên kết, đang chờ báo cáo máy…";
        }
        if(ov.firstElementChild===dialog){modal=null;closeDialog("dlg-mv");}
        void poll({ initial: !primed, force: true });
      } catch (error) {
        status.textContent = error.message;
      } finally {
        busy=false;
        if(ov.firstElementChild===dialog)controls();
      }
    };
    ov.querySelector("[data-email]").onclick = (event) =>
      void run("email", event.currentTarget);
    ov.querySelector("[data-login]").onclick = (event) =>
      void run("connect", event.currentTarget);
    ov.querySelector("[data-disconnect]")?.addEventListener(
      "click",
      (event) => {
        if (confirm("Ngắt liên kết Bambu? Lịch sử đã lưu không bị xoá."))
          void run("disconnect", event.currentTarget);
      },
    );
    ov.querySelector('[type="email"]').focus();
  }
  function renderPin() {
    let panel = document.getElementById("pm-pinned");
    if (!pinned || !scope) {
      panel?.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "pm-pinned";
      panel.setAttribute("aria-label", "Bảng máy ghim gọn");
      document.body.append(panel);
      panel.onclick = (event) => {
        if (event.target.closest("button")) {
          pinned = false;
          renderPin();
        } else goPage("printer-monitor");
      };
    }
    const html = `<header><b>Máy in</b><button class="btn btn-ghost btn-icon-only" aria-label="Bỏ ghim bảng máy">${icon("close")}</button></header>${Object.values(
      snapshot.devices,
    )
      .map(
        (d) =>
          `<div>${e(aliases[d.id] || d.name)} <strong>${e(d.percent ?? "—")}%</strong><small>${e(phaseText[d.phase] || "Chờ dữ liệu")}${stale(d) ? " · Dữ liệu cũ" : ""}</small></div>`,
      )
      .join("")}`;
    if (panel.innerHTML !== html && !panel.contains(document.activeElement))
      panel.innerHTML = html;
  }
  function openModels(id) {
    const row = historyRows.find((r) => r.id === id);
    if (!row || !canAccess("plates.plan")) return;
    const ov = document.getElementById("dlg-mv");
    if (ov.style.display === "flex") return;
    let draft = structuredClone(row.linked_models || []),
      limit = 30;
    ov.innerHTML = `<div class="dlg pm-picker"><div class="dlg-title">Model trong mẻ</div><p>${e(row.data.fileName || "Mẻ in")} · ${e(row.data.machineName)}</p><label class="page-smart-search">${icon("search")}<input type="search" aria-label="Tìm model để ghép" placeholder="Tìm model, part, biến thể…"></label><div class="pm-picker-count"></div><div class="pm-picked"></div><div class="pm-options"></div><button class="btn btn-ghost" data-more>Xem thêm</button><p class="pm-save-status" role="status"></p><div class="dlg-actions"><button class="btn btn-ghost" data-cancel>Huỷ</button><button class="btn btn-ac" data-save>Lưu ghép model</button></div></div>`;
    ov.style.display = "flex";
    ov.querySelector(".dlg").onclick = (event) => event.stopPropagation();
    const original = JSON.stringify(draft);
    const reload=document.createElement('button');reload.type='button';reload.className='btn btn-ghost';reload.hidden=true;reload.textContent='Đối chiếu bản mới';ov.querySelector('.pm-save-status').after(reload);
    reload.onclick=async()=>{reload.disabled=true;const gen=generation,status=ov.querySelector('.pm-save-status');try{const data=await request({action:'read',runId:id});if(gen!==generation||ov.firstElementChild!==modal?.node)return;row.links_revision=data.run.links_revision;status.textContent='Bản cloud: '+((data.run.linked_models||[]).map(m=>`${m.modelName}${m.variantName?' · '+m.variantName:''} × ${m.qty}`).join('; ')||'Chưa ghép model')+'. Lựa chọn của em vẫn giữ; nhấn Lưu để thay bằng lựa chọn này.';reload.hidden=true;}catch(error){status.textContent=error.message;}finally{reload.disabled=false;}};
    let saving = false;
    modal = {
      node: ov.firstElementChild,
      dirty: () => JSON.stringify(draft) !== original,
      busy: () => saving,
    };
    const refreshPicked = () => {
      const node = ov.querySelector(".pm-picked"),
        ids = new Set(
          draft.map((item) =>
            JSON.stringify([item.modelId, item.variantId || ""]),
          ),
        );
      [...node.children].forEach((child) => {
        if (!ids.has(child.dataset.key)) child.remove();
      });
      draft.forEach((item, index) => {
        const id = JSON.stringify([item.modelId, item.variantId || ""]);
        let child = [...node.children].find(
          (child) => child.dataset.key === id,
        );
        if (!child) {
          child = document.createElement("div");
          child.className = "pm-picked-row";
          child.dataset.key = id;
          child.innerHTML = `${thumb(item.image)}<span>${e(item.modelName)}${item.variantName ? " · " + e(item.variantName) : ""}</span><button class="btn btn-ghost" data-minus aria-label="Giảm số lượng">−</button><input type="number" min="1" max="99999" aria-label="Số lượng ${e(item.modelName)}"><button class="btn btn-ghost" data-plus aria-label="Tăng số lượng">+</button><button class="btn btn-ghost btn-icon-only" data-remove aria-label="Bỏ model khỏi mẻ">${icon("close")}</button>`;
          node.append(child);
        }
        for (const type of ["minus", "plus", "remove"])
          child.querySelector("[data-" + type + "]").dataset[type] = index;
        const input = child.querySelector("input");
        input.dataset.qty = index;
        if (input !== document.activeElement) input.value = item.qty;
        if (node.children[index] !== child)
          node.insertBefore(child, node.children[index] || null);
      });
    };
    const options = () => {
      const q = norm(ov.querySelector('[type="search"]').value),
        hits = models.filter((model) =>
          norm(
            [
              model.name,
              ...(model.parts || []).map((p) => p.name),
              ...(model.variants || []).map((v) => v.name),
              ...(model.cats || []),
            ].join(" "),
          ).includes(q),
        );
      setText(ov.querySelector(".pm-picker-count"), `${hits.length} model`);
      ov.querySelector("[data-more]").hidden = hits.length <= limit;
      ov.querySelector(".pm-options").innerHTML =
        hits
          .slice(0, limit)
          .map(
            (model) =>
              `<div class="pm-model-option">${thumb(model.images?.[0])}<div><b>${e(model.name)}</b><div>${[{ id: "", name: "Model gốc" }, ...(model.variants || [])].map((v) => `<button type="button" class="btn btn-ghost" data-add="${e(model.id)}" data-variant="${e(v.id)}">${e(v.name)}</button>`).join("")}</div></div></div>`,
          )
          .join("") || "<p>Không tìm thấy model.</p>";
    };
    ov.querySelector('[type="search"]').oninput = () => {
      limit = 30;
      options();
    };
    ov.querySelector("[data-more]").onclick = () => {
      limit += 30;
      options();
    };
    ov.querySelector(".pm-options").onclick = (event) => {
      const button = event.target.closest("[data-add]");
      if (!button) return;
      const m = models.find((m) => m.id === button.dataset.add),
        v = m?.variants?.find((v) => v.id === button.dataset.variant);
      if (!m) return;
      const existing = draft.find(
        (r) => r.modelId === m.id && (r.variantId || "") === (v?.id || ""),
      );
      if (existing) existing.qty = Math.min(99999, existing.qty + 1);
      else
        draft.push({
          modelId: m.id,
          modelName: m.name,
          variantId: v?.id || null,
          variantName: v?.name || "",
          qty: 1,
          image: m.images?.[0],
        });
      refreshPicked();
    };
    ov.querySelector(".pm-picked").onclick = (event) => {
      const b = event.target.closest("button");
      if (!b) return;
      const index = Number(
        b.dataset.remove ?? b.dataset.minus ?? b.dataset.plus,
      );
      if (b.dataset.remove !== undefined) draft.splice(index, 1);
      else
        draft[index].qty = Math.min(
          99999,
          Math.max(
            1,
            draft[index].qty + (b.dataset.plus !== undefined ? 1 : -1),
          ),
        );
      refreshPicked();
    };
    ov.querySelector(".pm-picked").oninput = (event) => {
      if (event.target.dataset.qty !== undefined)
        draft[Number(event.target.dataset.qty)].qty = Number(
          event.target.value,
        );
    };
    const cancel = () => closeDialog("dlg-mv");
    ov.querySelector("[data-cancel]").onclick = cancel;
    ov.onclick = cancel;
    ov.querySelector("[data-save]").onclick = async (event) => {
      const b = event.currentTarget;
      b.disabled = true;
      saving = true;
      const gen = generation,
        status = ov.querySelector(".pm-save-status");
      status.textContent = "Đang lưu…";
      try {
        await request({
          action: "models",
          runId: id,
          revision: row.links_revision,
          models: draft.map(({ modelId, variantId, qty }) => ({
            modelId,
            variantId,
            qty,
          })),
        });
        if (gen !== generation) throw new Error("Workspace đã đổi.");
        status.textContent = "Đã lưu trên cloud.";
        modal = null;
        closeDialog("dlg-mv");
        void loadDetailRun(id,true);
        void poll({ force: true });
      } catch (error) {
        status.textContent = error.message;
        b.disabled = false;
        if(error.status===409)reload.hidden=false;
      } finally {
        saving = false;
      }
    };
    refreshPicked();
    options();
    ov.querySelector('[type="search"]').focus();
  }
  window.PlatePrinterMonitor = {
    render:()=>{render();pumpRequiredAlerts();},
    requiredAlert: enqueueRequiredAlert,
    voiceSettings: panel=>{const ctx=context();window.PlatePrinterVoice?.mount(panel,{scope:ctx.workspace+':'+ctx.user,allowed:ctx.allowed&&!!ctx.workspace,requestPreview:(data,signal)=>requestVoiceAudio({...data,isPreview:true},signal)});},
    openEvent: openEventMachine,
    allowClose: (id) => {
      const ov = document.getElementById(id);
      if (id !== "dlg-mv" || !modal || ov?.firstElementChild !== modal.node)
        return true;
      if (modal.busy?.()) {
        toast("Đang xử lý, chờ phản hồi trước khi đóng.");
        return false;
      }
      if (modal.dirty?.() && !confirm("Bỏ thay đổi chưa lưu?")) return false;
      modal = null;
      return true;
    },
    events: () => {
      const ctx = context();
      return ctx.allowed && scope === ctx.workspace + ":" + ctx.user
        ? events
        : [];
    },
    markRead: (event) => {
      readIds[event.id] = true;
      event.readBy = [notificationUserKey()];
      save();
    },
    ignored: (event) => isIgnored(event.printerId, event),
    ignoreEvent: (event) => ignore(event.printerId, event),
    receive,
  };
  document.addEventListener(
    "keydown",
    (event) => {
      if(event.key==='Escape'&&detailSelection&&curPage==='printer-monitor'&&!document.querySelector('.dlg-ov[style*="flex"]')&&!document.body.classList.contains('notifications-open')&&!event.target.closest('input,textarea,select,[contenteditable="true"]')){
        event.preventDefault();event.stopImmediatePropagation();closeDetail();return;
      }
      const dlg = document.querySelector(
        '#dlg-mv[style*="flex"]>.pm-picker,#dlg-mv[style*="flex"]>.pm-connect,#dlg-mv[style*="flex"]>.pm-rename',
      );
      if (!dlg || document.body.classList.contains("notifications-open"))
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeDialog("dlg-mv");
      } else if (event.key === "Tab") {
        const controls = [
            ...dlg.querySelectorAll("button:not(:disabled),input,select"),
          ].filter((el) => el.getClientRects().length),
          first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    },
    true,
  );
  window.addEventListener("storage", (event) => {
    if(scope&&event.key?.startsWith(alertPrefix())){alertStoreDirty=true;pumpRequiredAlerts();}
    if (event.key === key()) {
      try {
        const prefs = JSON.parse(event.newValue || "{}");
        aliases = prefs.aliases || aliases;
        ignored = prefs.ignored || ignored;
        readIds = prefs.readIds || readIds;
        events.forEach((event) => {
          event.readBy = readIds[event.id] ? [notificationUserKey()] : [];
        });
        render();
        renderPin();
      } catch {}
    }
  });
  setInterval(tick, 1000);
  window.addEventListener("online", () => {
    lastPoll = 0;
    tick();
  });
  window.addEventListener("offline", () => {
    abort?.abort();
    message = "Mất mạng — giữ dữ liệu đã nhận.";
    render();
  });
  document.addEventListener("visibilitychange", () => {
    alertStoreDirty=true;
    if (!document.hidden) {
      lastPoll = 0;
      tick();
    }
  });
  window.addEventListener("pagehide", () => {abort?.abort();closeRequiredAlert({restoreFocus:false});});
  // Window capture precedes the libraries' document-level selection shortcuts.
  // Escape dismisses this incident, never an underlying form or selection.
  window.addEventListener('keydown',event=>{
    if(!alertOverlay)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();void acknowledgeRequiredAlert(false,{dismiss:true});return;}
    if(event.key==='Delete')event.preventDefault();
    if(event.key==='Tab'){
      const controls=[...alertOverlay.querySelectorAll('button:not(:disabled)')],first=controls[0],last=controls.at(-1);
      if(!alertOverlay.contains(document.activeElement)||event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last){event.preventDefault();(event.shiftKey?last:first)?.focus();}
    }
    event.stopImmediatePropagation();
  },true);
  document.addEventListener('focusin',event=>{if(alertOverlay&&!alertOverlay.contains(event.target))alertOverlay.querySelector('button:not(:disabled)')?.focus({preventScroll:true});});
})();
