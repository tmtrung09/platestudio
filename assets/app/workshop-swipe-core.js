/* Pure per-part projection. IDs come from the order's allocated print items. */
(() => {
 const states=['qc','ready','assembling','wait_ready','wait_assembling','completed','error'];
 const key=(itemId,partId,filamentId='')=>[itemId,partId,filamentId].join('\u001f');
 function missingParts(row){const variant=(row.m?.variants||[]).find(v=>v.id===row.it.variantId),required=(row.m?.parts||[]).filter(p=>!Array.isArray(variant?.partIds)||variant.partIds.includes(p.id));return required.some(p=>!row.parts.some(allocated=>allocated.partId===p.id&&allocated.orderItemId===row.it.id));}
 function seed(order,item,g){const h=order.assembly?.handovers?.[item.id]||(order.assembly?.handedAt?order.assembly:{}),per=Math.max(1,Math.ceil((g.partRequired??g.required)/Math.max(1,item.qty))),offset=g.offset||0,passed=Math.min(g.printed,Math.max(0,Number(h.qcAcceptedQty??h.partQcAcceptedQty??(h.qcStatus==='accepted'?item.qty:0))*per-offset)),done=Math.min(passed,Math.max(0,(Number(order.assembly?.items?.[item.id])||0)*per-offset)),active=h.assemblyStatus==='in_progress'?passed-done:0;return {itemId:item.id,partId:g.partId,filamentId:g.filamentId,revision:0,required:g.required,printed:g.printed,qc:g.printed-passed,ready:passed-done-active,assembling:active,wait_ready:0,wait_assembling:0,completed:done,error:0};}
 function groups(rows){return rows.filter(row=>row.source==='order'&&row.handed).flatMap(row=>{const by=new Map();for(const part of row.parts){if(!part.partId||part.orderItemId!==row.it.id||part.orderId!==row.o.id)continue;const k=key(row.it.id,part.partId,part.filamentId||''),g=by.get(k)||{key:k,orderId:row.o.id,itemId:row.it.id,partId:part.partId,filamentId:part.filamentId||'',required:0,printed:0,part,row};g.required+=Math.max(0,Number(part.qty)||0);g.printed+=Math.min(Math.max(0,Number(part.qtyDone)||0),Math.max(0,Number(part.qty)||0));by.set(k,g);}const list=[...by.values()];for(const g of list){g.partRequired=list.filter(x=>x.partId===g.partId).reduce((n,x)=>n+x.required,0);g.offset=list.filter(x=>x.partId===g.partId&&x.filamentId<g.filamentId).reduce((n,x)=>n+x.printed,0);}return list.map(g=>{let r=structuredClone(row.o.assembly?.partWork?.[g.key]||seed(row.o,row.it,g));const delta=g.printed-r.printed;g.blocked=missingParts(row)||delta<0||r.required!==g.required;if(delta>0){r.error-=Math.min(delta,r.error);r.qc+=delta;r.printed=g.printed;r.revision++;}g.state=r;return g;});});}
 function move(r,from,to,qty){if(!states.includes(from)||!states.includes(to)||!Number.isInteger(qty)||qty<1||qty>r[from])throw Error('Số lượng part không hợp lệ.');const n={...r,[from]:r[from]-qty,[to]:r[to]+qty,revision:r.revision+1};if(to==='error')n.printed-=qty;return n;}
 function project(order,itemId,work){const item=order.items.find(i=>i.id===itemId);if(!item)return null;const n=Number(item.qty),by=new Map();for(const r of Object.values(work).filter(r=>r.itemId===itemId)){const group=by.get(r.partId)||Object.fromEntries(['required',...states].map(k=>[k,0]));for(const k of ['required',...states])group[k]+=r[k]||0;by.set(r.partId,group);}const rows=[...by.values()];if(!rows.length)return null;const metrics=rows.map(r=>{const per=Math.max(1,Math.ceil(r.required/Math.max(1,n)));return {done:Math.floor(r.completed/per),passed:Math.floor((r.ready+r.assembling+r.wait_ready+r.wait_assembling+r.completed)/per),active:r.assembling+r.wait_assembling+r.completed>0};}),done=Math.min(n,...metrics.map(x=>x.done)),passed=Math.min(n,...metrics.map(x=>x.passed));return {done,passed,stage:done>=n?'completed':metrics.some(x=>x.active)?'in_progress':passed>0?'ready':'part_qc'};}
 /* Inspection covers the same sources as the native list. Only canonical,
    handed-over order parts enter the transactional swipe state machine. */
 function catalog(rows,partGroups=groups(rows)){
  const tasks=[];
  for(const row of rows){
   if(row.o?.status==='cancelled')continue;
   const own=partGroups.filter(g=>g.row===row),covered=new Set();
   const addReview=(part,stage,reason,identity,qty)=>tasks.push({row,part,stage,reason,identity,qty,readOnly:true,orderId:row.o?.id||null,itemId:row.it.id,partId:part.partId||'',filamentId:part.filamentId||'',required:Math.max(0,Number(part.qty)||0),printed:Math.max(0,Number(part.qtyDone)||0),state:{revision:0}});
   for(const g of own){
    covered.add(g.key);
    const available=states.filter(stage=>g.state[stage]>0);
    if(available.length)for(const stage of available)tasks.push({...g,stage,qty:g.state[stage],readOnly:!!g.blocked||stage==='error',reason:g.blocked?'Phân bổ hoặc số lượng nguồn cần đối chiếu trong danh sách.':stage==='error'?'Part đã báo lỗi. Mở danh sách để xem phần cần in bù.':''});
    else addReview({...g.part,qty:g.required,qtyDone:g.printed},'printing','Chưa có part đã in để QC; theo dõi phần còn thiếu trong danh sách.',`printing:${g.orderId}:${g.key}`,Math.max(0,g.required-g.printed));
   }
   const source=row.source==='external'?`external:${row.externalKey}`:`order:${row.o?.id}:${row.it.id}`;
   const remaining=(row.parts||[]).filter(part=>!covered.has(key(row.it.id,part.partId,part.filamentId||''))||part.orderItemId!==row.it.id||part.orderId!==row.o?.id);
   if(row.source==='external'||!row.handed){
    const parts=remaining.length?remaining:[{partName:'Chưa có cấu hình part',qty:0,qtyDone:0,unconfigured:true}];
    parts.forEach((original,index)=>{let part=original;if(row.source==='external'){
      const declarations=(row.reports||[]).flatMap(report=>report.manualItems||[]).filter(item=>item.modelId===row.it.modelId&&(item.variantId||'')===(row.it.variantId||'')&&item.partId===original.partId),colors=new Set(declarations.map(item=>item.filamentId||''));
      part={...original,filamentId:colors.size===1?[...colors][0]:'',sourceColorLabel:colors.size>1?'Nhiều màu':''};
     }const printed=Math.max(0,Number(part.qtyDone)||0),required=Math.max(0,Number(part.qty)||0),stage=row.source==='external'?'external':printed?'handover':'printing';
     const reason=row.source==='external'?'Hàng ngoài đơn chưa có trạng thái riêng từng part. Mở danh sách để tiếp tục QC/gia công theo báo cáo mẻ.':printed?'Part đã in nhưng chưa xác nhận giao xưởng. Mở danh sách để bàn giao trước khi QC.':'Part chưa in xong. Mở danh sách để xem phần còn thiếu.';
     addReview(part,stage,reason,`${source}:${part.id||part.partId||index}:${part.filamentId||''}`,printed||required);
    });
   }else remaining.forEach((part,index)=>addReview(part,'review','Phân bổ cũ thiếu hoặc không khớp ID đơn/dòng/part. Giữ dữ liệu gốc để đối chiếu; chưa gửi lượt quẹt.',`${source}:review:${part.id||index}`,Math.max(0,Number(part.qtyDone)||0)));
  }
  return tasks;
 }
 window.WorkshopSwipeCore={states,key,seed,groups,move,project,catalog};
})();
