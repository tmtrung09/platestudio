/* One isolated IndexedDB record per workspace + user, acknowledged on transaction completion. */
(() => {
  let connection;
  const open=()=>connection ||= new Promise((resolve,reject)=>{
    const request=indexedDB.open('platedio-custom-orders-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('scopes');
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();connection=null;};resolve(request.result);};
    request.onerror=()=>{connection=null;reject(request.error);};
    request.onblocked=()=>{connection=null;reject(Error('Kho nháp đang bị một phiên cũ giữ.'));};
  });
  async function run(scope,value,write=false){
    const db=await open();return new Promise((resolve,reject)=>{
      const transaction=db.transaction('scopes',write?'readwrite':'readonly'),store=transaction.objectStore('scopes');
      const request=write?store.put(value,scope):store.get(scope);let result;
      request.onsuccess=()=>{result=request.result;};
      transaction.oncomplete=()=>resolve(write?true:result);
      transaction.onabort=()=>reject(transaction.error||request.error||Error('Không lưu được nháp.'));
      transaction.onerror=()=>{};
    });
  }
  window.CustomOrderStore={load:scope=>run(scope),save:(scope,value)=>run(scope,value,true)};
})();
