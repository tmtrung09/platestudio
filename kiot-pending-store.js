/* Overflow outbox for parsed Kiot sales; never receives browser credentials. */
(() => {
  let opening;
  function database(){
    if(!opening)opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open('plate-studio-kiot-pending-v1',1);
      request.onupgradeneeded=()=>{const store=request.result.createObjectStore('reports',{keyPath:'key'});store.createIndex('scope','scope');};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
      request.onerror=()=>{opening=null;reject(request.error);};
      request.onblocked=()=>{opening=null;reject(new Error('Kho báo cáo đang bận; giữ file Excel và thử lại.'));};
    });
    return opening;
  }
  async function transaction(mode,run){
    const db=await database();return new Promise((resolve,reject)=>{
      const tx=db.transaction('reports',mode),store=tx.objectStore('reports');let value;
      tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Không ghi được kho báo cáo trên máy.'));
      run(store,result=>{value=result;});
    });
  }
  async function put(scope,entry){
    if(!scope||!entry?.requestId||!Array.isArray(entry.sales))throw new Error('Bản nhập thiếu định danh hoặc dữ liệu.');
    const copy=structuredClone(entry);
    await transaction('readwrite',store=>store.put({key:scope+entry.requestId,scope,entry:copy}));
  }
  async function list(scope){
    if(!scope)return [];
    return transaction('readonly',(store,done)=>{const request=store.index('scope').getAll(scope);request.onsuccess=()=>done(request.result.map(row=>row.entry));});
  }
  async function remove(scope,id){await transaction('readwrite',store=>store.delete(scope+id));}
  window.KiotPendingStore={put,list,remove};
})();
