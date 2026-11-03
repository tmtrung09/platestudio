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
  // Keep the original draft database/version compatible with an older tab.
  // Upgrading that database would make its next indexedDB.open(..., 1) fail.
  let orderConnection;
  const openOrders=()=>orderConnection ||= new Promise((resolve,reject)=>{
    const request=indexedDB.open('platedio-custom-order-cache-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('confirmed-orders',{keyPath:['scope','id']}).createIndex('scope','scope');
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();orderConnection=null;};resolve(request.result);};
    request.onerror=()=>{orderConnection=null;reject(request.error);};
    request.onblocked=()=>{orderConnection=null;reject(Error('Chưa mở được bản xem đơn trên thiết bị.'));};
  });
  // Server-confirmed records are separate from the draft snapshot. A stale tab
  // saving its draft cannot erase receipts cached by another tab of this scope.
  async function orders(scope,values,observedAt=Date.now()){
    const db=await openOrders(),write=Array.isArray(values);
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('confirmed-orders',write?'readwrite':'readonly'),store=transaction.objectStore('confirmed-orders');
      let result=[];
      if(write){for(const order of values){const request=store.get([scope,order.id]);request.onsuccess=()=>{if(!request.result?.deleted&&(!request.result||request.result.observedAt<=observedAt))store.put({scope,id:order.id,order,observedAt});};}}
      else {const request=store.index('scope').getAll(scope);request.onsuccess=()=>{result=request.result.filter(row=>!row.deleted).map(row=>row.order);};}
      transaction.oncomplete=()=>resolve(write?true:result);
      transaction.onabort=()=>reject(transaction.error||Error('Không giữ được đơn đã xác nhận trên thiết bị.'));
      transaction.onerror=()=>{};
    });
  }
  async function deleteOrders(scope,ids){
    const db=await openOrders();return new Promise((resolve,reject)=>{
      const transaction=db.transaction('confirmed-orders','readwrite'),store=transaction.objectStore('confirmed-orders');
      for(const id of ids)store.put({scope,id,deleted:true,observedAt:Date.now()});
      transaction.oncomplete=()=>resolve(true);transaction.onabort=()=>reject(transaction.error||Error('Chưa cập nhật bản xem đơn đã xóa.'));transaction.onerror=()=>{};
    });
  }
  window.CustomOrderStore={load:scope=>run(scope),save:(scope,value)=>run(scope,value,true),loadOrders:scope=>orders(scope),saveOrders:(scope,values,observedAt)=>orders(scope,values,observedAt),deleteOrders};
})();
