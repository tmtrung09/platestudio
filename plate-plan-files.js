/* Print inputs are private workspace assets, never model records or executable previews. */
(() => {
  const bucket='plate-plan-files',maxBytes=50*1024*1024,accept='.3mf,.stl,.obj,.gcode,.bgcode,.step,.stp,.zip';
  let database,working=false;
  const scope=()=>`${cloudWorkspaceId()||'local'}:${currentUser?.id||'local'}`;
  const open=()=>database||(database=new Promise((resolve,reject)=>{const r=indexedDB.open('plate-plan-files-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{database=null;reject(r.error);};}));
  async function db(mode,action){const base=await open();return new Promise((resolve,reject)=>{const tx=base.transaction('files',mode),request=action(tx.objectStore('files'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Không lưu được file trên thiết bị.'));});}
  const get=id=>db('readonly',s=>s.get(id));
  const put=row=>db('readwrite',s=>s.put(row));
  const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(n=>n.toString(16).padStart(2,'0')).join('');
  async function add(files){
    const capturedScope=scope(),workspace=cloudWorkspaceId(),owner=currentUser?.id||'',result=[];
    for(const file of files){
      const extension=file.name.split('.').pop().toLowerCase();
      if(!accept.split(',').includes('.'+extension))throw new Error(`File ${file.name}: chỉ nhận 3MF, STL, OBJ, G-code, BGCODE, STEP hoặc ZIP.`);
      if(!file.size||file.size>maxBytes)throw new Error(`File ${file.name}: dung lượng phải từ 1 byte đến 50 MB.`);
    }
    const rows=[];
    for(const file of files){
      const id=crypto.randomUUID(),extension=file.name.split('.').pop().toLowerCase();
      const meta={id,name:file.name,size:file.size,type:file.type||'application/octet-stream',workspaceId:workspace,ownerId:owner,path:workspace&&owner?`${workspace}/${owner}/${id}.${extension}`:''};
      rows.push({id,scope:capturedScope,meta,blob:file,hash:await digest(file),status:'pending',attempts:0});result.push(meta);
    }
    if(rows.length)await db('readwrite',s=>{let request;for(const row of rows)request=s.put(row);return request;});
    queueMicrotask(resume);return result;
  }
  function updateStatus(id,status){document.querySelectorAll('[data-plan-file-status]').forEach(el=>{if(el.dataset.planFileStatus===id){el.textContent=status;const retry=el.parentElement.querySelector('.pp-file-retry');if(retry)retry.hidden=status==='File đã lên cloud';}});}
  async function resume(forceId){
    if(working||!sb||!currentUser||!cloudWorkspaceId()||!navigator.onLine||!canAccess('plates.plan'))return;
    working=true;const capturedScope=scope();
    try{
      const rows=await db('readonly',s=>s.getAll());
      for(const row of rows){
        if(scope()!==capturedScope)break;
        if(row.scope!==capturedScope||row.status==='uploaded'||!row.meta.path||(!forceId&&row.nextAttempt>Date.now())||(forceId&&row.id!==forceId))continue;
        updateStatus(row.id,'Đang tải file…');
        try{
          const {error}=await sb.storage.from(bucket).upload(row.meta.path,row.blob,{contentType:'application/octet-stream',upsert:false});
          if(error){
            if(String(error.statusCode||error.status)!=='409')throw error;
            const copy=await sb.storage.from(bucket).download(row.meta.path);
            if(copy.error||!copy.data||await digest(copy.data)!==row.hash)throw copy.error||new Error('File trên cloud không khớp bản trên thiết bị.');
          }
          // Retain the original blob even after Storage success; plan ACK is independent.
          await put({...row,status:'uploaded',error:'',nextAttempt:0});if(scope()===capturedScope)updateStatus(row.id,'File đã lên cloud');
        }catch(error){
          await put({...row,status:'error',error:String(error.message||'Chưa tải được file'),attempts:row.attempts+1,nextAttempt:Date.now()+Math.min(300000,15000*2**Math.min(row.attempts,4))});
          if(scope()===capturedScope)updateStatus(row.id,'Chưa tải cloud · giữ trên thiết bị');
        }
      }
    }catch(error){console.warn('Print file queue unavailable:',error.message);}finally{working=false;}
  }
  function html(files){return (files||[]).map(meta=>`<div class="pp-file-row"><button type="button" class="pp-file-download" data-plate-file="${esc(JSON.stringify(meta))}" onclick="PlatePlanFiles.download(this.dataset.plateFile)" title="Tải file về máy">${appIcon('data')}<span>${esc(meta.name)}</span></button><small data-plan-file-status="${esc(meta.id)}">${(meta.size/1048576).toFixed(1)} MB · kiểm tra khi tải</small><button type="button" class="pp-file-retry" data-plan-file-id="${esc(meta.id)}" onclick="PlatePlanFiles.retry(this.dataset.planFileId)">Thử tải lên</button></div>`).join('');}
  async function refresh(){
    for(const el of document.querySelectorAll('[data-plan-file-status]')){
      try{const row=await get(el.dataset.planFileStatus);if(!el.isConnected)continue;
        el.textContent=row?.scope===scope()?(row.status==='uploaded'?'File đã lên cloud':!row.meta.path?'Chỉ trên thiết bị · cần đăng nhập trước khi chọn file để tải cloud':row.status==='error'?`Chưa tải cloud · giữ trên thiết bị: ${row.error}`:'Đã giữ trên thiết bị · chờ tải cloud'):'File đính kèm · chưa kiểm tra cloud';
        const retry=el.parentElement.querySelector('.pp-file-retry');if(retry)retry.hidden=!row||!row.meta.path||row.scope!==scope()||row.status==='uploaded';
      }catch{el.textContent='Chưa đọc được bản trên thiết bị';}
    }
  }
  async function download(raw){
    try{
      const meta=typeof raw==='string'?JSON.parse(raw):raw,capturedScope=scope(),row=await get(meta.id);let blob;
      if(row?.scope===capturedScope)blob=row.blob;
      else{
        if(!sb||!currentUser||meta.workspaceId!==cloudWorkspaceId()||!meta.path?.startsWith(`${cloudWorkspaceId()}/`))throw new Error('Cần đăng nhập đúng xưởng để tải file này.');
        const result=await sb.storage.from(bucket).download(meta.path);if(result.error)throw result.error;blob=result.data;
      }
      if(scope()!==capturedScope)throw new Error('Tài khoản đã đổi, đã dừng tải file.');
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=meta.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch(error){toast('Chưa tải được file: '+error.message,6000);}
  }
  window.PlatePlanFiles={add,html,refresh,download,resume,retry:id=>resume(id),accept,maxBytes,scope,get};
  window.addEventListener('online',()=>resume());document.addEventListener('visibilitychange',()=>{if(!document.hidden)resume();});
  setInterval(()=>resume(),60000);setTimeout(()=>resume(),2000);
})();
