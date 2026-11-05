/* Server-backed care events stay separate from mutable operations snapshots. */
(() => {
 let options,current='',rows=[],busy=false;
 const titles={warranty:'Yêu cầu bảo hành mới',review:'Khách gửi đánh giá',supplement:'Khách bổ sung thông tin bảo hành',approved:'Đã duyệt bảo hành',info:'Đã yêu cầu khách bổ sung',declined:'Đã phản hồi bảo hành',collected:'Khách đã nhận phần bảo hành'};
 function context(){const c=options?.getContext();return c?.ready&&c.workspaceId&&c.userId?c:null;}
 async function refresh(){
  const c=context(),key=c?c.workspaceId+':'+c.userId:'';
  if(key!==current){current=key;rows=[];options?.updated();}if(!c||busy)return;
  busy=true;try{
   const {data,error}=await c.client.rpc('custom_care_notifications',{w:c.workspaceId});
   const next=context();if(error||!Array.isArray(data)||!next||next.workspaceId+':'+next.userId!==key)return;
   rows=data.map(e=>({...e,title:titles[e.kind]||'Cập nhật chăm sóc khách hàng',detail:'Đơn '+e.orderId}));options.updated();
  }finally{busy=false;}
 }
 async function markRead(events){
  const c=context();if(!c)return;const key=c.workspaceId+':'+c.userId;if(key!==current)return;const ids=events.filter(e=>rows.some(row=>row.id===e.id)&&!e.readAt).map(e=>e.id.slice(5));if(!ids.length)return;
  const {error}=await c.client.rpc('mark_custom_care_read',{w:c.workspaceId,ids});if(error)throw Error('Chưa lưu được trạng thái đã đọc.');
  if(current!==key)return;const selected=new Set(ids.map(id=>'care:'+id));rows.forEach(row=>{if(selected.has(row.id))row.readAt=new Date().toISOString();});options.updated();
 }
 window.CustomCareNotifications={configure(value){options=value;void refresh().catch(()=>{});},events(){const c=context();return c&&current===c.workspaceId+':'+c.userId?rows:[];},markRead};
 setInterval(()=>{if(!document.hidden)void refresh().catch(()=>{});},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh().catch(()=>{});});
})();
