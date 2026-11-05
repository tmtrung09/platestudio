/* Token-bound customer care; IndexedDB drafts and immutable retry envelopes. */
(() => {
 'use strict';
 const labels={pending:'Chờ cửa hàng xem xét',info:'Cần bổ sung thông tin',approved:'Đã duyệt · Chờ xếp lịch in',printing:'Đang in phần thay thế',qc:'Kiểm tra & hoàn thiện',ready:'Sẵn sàng đến nhận',collected:'Đã nhận phần thay thế',declined:'Chưa được chấp nhận',reconcile:'Cần cửa hàng đối chiếu sản xuất'};
 const stages=['pending','approved','printing','qc','ready','collected'];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const id=()=>crypto.randomUUID(),q=(root,s)=>root.querySelector(s);
 let customer=null,staff=null;
 const newDraft=()=>({requestId:id(),lineId:'',partId:'',description:'',images:[]});
 async function api(client,body){
  const {data,error}=await client.functions.invoke('custom-order-care',{body});
  if(error||data?.error){let detail=data;try{if(error?.context?.json)detail=await error.context.json();}catch{}throw Object.assign(Error(detail?.error||'Chưa kết nối được cửa hàng. Nháp vẫn được giữ.'),{code:detail?.code||'',definitive:['P0001','PT409','MEDIA_MISMATCH'].includes(detail?.code)});}
  if(!data)throw Error('Chưa nhận được xác nhận của máy chủ.');return data;
 }
 const status=(root,message)=>{const el=q(root,'.care-message');el.textContent=message;};
 function reviewForm(){return `<section class="care-card"><span class="eyebrow">SAU KHI BẠN MANG VỀ</span><h2>Đánh giá trải nghiệm</h2><p>Chia sẻ riêng với cửa hàng. Đánh giá không là điều kiện để được bảo hành.</p><form class="care-review" novalidate>${[['experience','Trải nghiệm mua hàng'],['quality','Chất lượng sản phẩm']].map(([key,label])=>`<fieldset><legend>${label}</legend><div class="care-ratings" role="group" aria-label="${label}">${[1,2,3,4,5].map(v=>`<button type="button" data-rating="${key}" data-value="${v}" aria-pressed="false" aria-label="${v} trên 5">${v}</button>`).join('')}</div></fieldset>`).join('')}<p class="care-hint">1 · Chưa hài lòng → 5 · Rất hài lòng</p><label>Lời nhắn <small>Không bắt buộc</small><textarea name="message" rows="3" maxlength="2000"></textarea></label><button class="btn primary" type="submit">Gửi đánh giá</button></form><p class="care-reviewed" hidden></p></section>`;}
 function customerHTML(){return `<div class="custom-care"><div class="section-top"><div><h2>Đánh giá & bảo hành</h2><p>Chăm sóc món đồ, cả sau khi bạn nhận hàng.</p></div><button type="button" class="btn secondary care-refresh">Làm mới</button></div><p class="care-message" role="status">Đang đọc từ cửa hàng…</p><p class="care-eligibility" hidden>Phần đánh giá và yêu cầu bảo hành sẽ mở sau khi cửa hàng xác nhận bạn đã nhận hàng.</p><div class="care-content" hidden><div class="care-public-grid"><section class="care-card"><h2>Món đồ cần được sửa ở đâu?</h2><p>Chọn sản phẩm, bộ phận và ảnh tình trạng. Cửa hàng sẽ xem xét trước khi duyệt in thay thế.</p><form class="care-warranty" novalidate><fieldset><legend>Sản phẩm trong đơn</legend><label>Tìm sản phẩm<input type="search" data-care-search placeholder="Tên sản phẩm hoặc biến thể"></label><small class="care-search-count" role="status"></small><div class="care-products care-options"></div></fieldset><fieldset class="care-parts-field" hidden><legend>Bộ phận bị hỏng</legend><label>Tìm bộ phận<input type="search" data-care-search placeholder="Tên bộ phận"></label><small class="care-search-count" role="status"></small><div class="care-parts care-options"></div></fieldset><label>Mô tả tình trạng<textarea name="description" rows="4" maxlength="2000" required></textarea></label><label>Ảnh tình trạng<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple><small>1–4 ảnh JPG, PNG hoặc WebP, tối đa 5 MB/ảnh. Nháp và ảnh được giữ trên thiết bị trước khi gửi.</small></label><div class="care-previews"></div><p class="care-draft-status" role="status"></p><p class="care-hint">Gửi yêu cầu chưa có nghĩa được duyệt bảo hành. Cửa hàng sẽ xác nhận sau khi xem tình trạng thực tế.</p><button class="btn primary" type="submit">Gửi yêu cầu bảo hành</button></form></section>${reviewForm()}</div><section class="care-history"><h2>Theo dõi bảo hành</h2><div class="care-requests"></div></section></div><div class="care-retry" hidden><button class="btn secondary" data-care-retry>Thử gửi lại cùng yêu cầu</button><button class="btn text" data-care-edit hidden>Đối chiếu và sửa nháp</button></div></div>`;}
 function metaFiles(d){return d.images.map(({id,name,type,size,sha256})=>({id,name,type,size,sha256}));}
 async function save(c){
  const snapshot=structuredClone(c.value);c.saved=false;const operation=c.chain=c.chain.catch(()=>{}).then(()=>window.CustomOrderStore.save(c.scope,snapshot));
  try{await operation;if(c.chain===operation){q(c.root,'.care-draft-status').textContent='Đã giữ nháp trên thiết bị.';c.saved=true;}}catch(e){c.saved=false;status(c.root,'Chưa lưu được nháp trên thiết bị. Giữ trang này mở và thử lại.');throw e;}
 }
 function preview(c){const host=q(c.root,'.care-previews');host.replaceChildren();for(const image of c.value.draft.images){const div=document.createElement('div'),img=document.createElement('img');const url=URL.createObjectURL(image.blob);img.src=url;img.alt=image.name;img.onload=()=>URL.revokeObjectURL(url);div.append(img);const button=document.createElement('button');button.type='button';button.className='btn-icon-only';button.textContent='×';button.setAttribute('aria-label','Bỏ ảnh '+image.name);button.onclick=()=>{c.value.draft.images=c.value.draft.images.filter(x=>x.id!==image.id);preview(c);void save(c).catch(()=>{});};div.append(button);host.append(div);}}
 function filterChoices(input){const field=input.closest('fieldset'),fold=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();let count=0;for(const label of field.querySelectorAll('.care-options>label')){label.hidden=!fold(label.textContent).includes(fold(input.value.trim()));if(!label.hidden)count++;}q(field,'.care-search-count').textContent=count?`${count} kết quả`:'Không tìm thấy kết quả';}
 function parts(c){const d=c.value.draft,line=c.order.lines.find(x=>x.id===d.lineId),host=q(c.root,'.care-parts');q(c.root,'.care-parts-field').hidden=!line;const unique=[...new Map((line?.partColors||[]).map(p=>[p.partId,p])).values()];host.innerHTML=[...unique.map(p=>({id:p.partId,name:p.partName})),{id:'',name:'Khác / Chưa xác định được'}].map(p=>`<label><input type="radio" name="part" value="${esc(p.id)}" ${d.partSelected&&d.partId===p.id?'checked':''}>${esc(p.name)}</label>`).join('');}
 function restore(c){
  const d=c.value.draft;q(c.root,'.care-products').innerHTML=c.order.lines.map(line=>`<label><input type="radio" name="line" value="${esc(line.id)}" ${line.id===d.lineId?'checked':''}>${(line.model?.images||[]).some(src=>/^https?:\/\//.test(src))?`<img class="care-product-image" src="${esc(line.model.images.find(src=>/^https?:\/\//.test(src)))}" alt="" loading="lazy">`:'<span class="care-product-fallback">Chưa có ảnh</span>'}<span>${esc(line.model?.name)}${line.variantName?' · '+esc(line.variantName):''}</span></label>`).join('');
  parts(c);q(c.root,'[name=description]').value=d.description;preview(c);q(c.root,'[name=message]').value=c.value.review.message;
  c.root.querySelectorAll('[data-rating]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.value)===c.value.review[el.dataset.rating])));lock(c);
 }
 function lock(c){const locked=c.busy||!!c.value.pending;c.root.querySelectorAll('form input,form textarea,form button').forEach(el=>el.disabled=locked);q(c.root,'.care-retry').hidden=!c.value.pending||c.busy;}
 function requestHTML(row,manage=false){
  const index=stages.indexOf(row.stage);return `<article class="care-card" data-care-id="${esc(row.id)}"><div class="section-top"><b>${esc(row.modelName)} · ${esc(row.partName)}</b><span class="pill priority">${esc(labels[row.stage]||row.stage)}</span></div><small>${manage?esc(row.customer)+' · '+esc(row.orderId)+' · ':''}BH-${esc(row.id.slice(0,8))}</small>${row.reportedPartName&&row.reportedPartName!==row.partName?`<p>Khách báo: ${esc(row.reportedPartName)}</p>`:''}<p class="care-quote">${esc(row.description)}</p><div class="care-previews">${(row.images||[]).map(img=>img.src?`<a href="${esc(img.src)}" target="_blank" rel="noopener noreferrer"><img src="${esc(img.src)}" alt="${esc(img.name)}" loading="lazy"></a>`:'<span>Chưa tải được ảnh; bấm làm mới để thử lại.</span>').join('')}</div>${row.supplement?`<p class="care-quote"><b>Khách bổ sung</b><br>${esc(row.supplement)}</p>`:''}${row.note?`<p class="care-store-note"><b>Cửa hàng nhắn bạn</b><br>${esc(row.note)}</p>`:''}${index>=0?`<ol class="care-timeline">${stages.map((s,i)=>`<li class="${i<index?'done':''}" ${i===index?'aria-current="step"':''}>${esc(labels[s])}</li>`).join('')}</ol>`:''}${row.stage==='ready'?'<p class="care-store-note">Phần thay thế đã sẵn sàng. Bạn có thể đến cửa hàng nhận, mang theo link đơn này để đối chiếu.</p>':''}${!manage&&row.stage==='info'?`<form class="care-supplement" data-id="${esc(row.id)}"><label>Bổ sung thông tin<textarea name="supplement" maxlength="2000" rows="3" required></textarea></label><button class="btn secondary">Gửi bổ sung</button><button type="button" class="btn text" data-edit-supplement="${esc(row.id)}" hidden>Đối chiếu và sửa thông tin bổ sung</button></form>`:''}${manage&&row.jobId?`<a class="btn secondary" href="plate-studio.html#ps_page=orders&amp;q=${encodeURIComponent(row.jobId)}">Xem việc in bảo hành</a>`:''}</article>`;
 }
 function paintCustomer(c,data){
  c.data=data;q(c.root,'.care-content').hidden=!data.eligible;q(c.root,'.care-eligibility').hidden=data.eligible;
  const form=q(c.root,'.care-review'),result=q(c.root,'.care-reviewed');form.hidden=!!data.review;result.hidden=!data.review;if(data.review)result.textContent=`Đã gửi đánh giá · Trải nghiệm ${data.review.experience}/5 · Chất lượng ${data.review.quality}/5. Cảm ơn bạn.`;
  const list=q(c.root,'.care-requests');if(!list.contains(document.activeElement)&&!c.supplementBusy){list.innerHTML=data.warranties.length?data.warranties.map(row=>requestHTML(row)).join(''):'<p>Chưa có yêu cầu bảo hành.</p>';list.querySelectorAll('.care-supplement').forEach(form=>{const entry=c.value.supplements?.[form.dataset.id];if(entry){form.elements.supplement.value=entry.message;form.elements.supplement.disabled=entry.pending;q(form,'[data-edit-supplement]').hidden=!entry.rejected;}});}
 }
 async function refreshCustomer(c){try{const {care}=await api(c.client,{action:'read',token:c.token});if(customer!==c)return;c.value.lastCare=care;paintCustomer(c,care);void save(c).catch(()=>{});status(c.root,'Đã cập nhật từ cửa hàng.');}catch(e){if(customer===c)status(c.root,e.message+' Đang giữ dữ liệu đã nhận.');}}
 async function send(c){
  if(c.busy||!c.value.pending)return;c.busy=true;lock(c);status(c.root,'Đang gửi; chỉ xác nhận sau khi máy chủ lưu thành công.');
  try{
   const pending=c.value.pending;
   if(pending.payload.kind==='warranty'){
    const {uploads}=await api(c.client,{action:'reserve',token:c.token,requestId:pending.requestId,files:metaFiles(pending.draft)});
    for(let i=0;i<uploads.length;i++){const f=pending.draft.images[i],u=uploads[i];const {error}=await c.client.storage.from('custom-care-media').uploadToSignedUrl(u.path,u.token,f.blob,{contentType:f.type,upsert:false});if(error&&!/already exists|duplicate/i.test(error.message||'')&&String(error.statusCode)!=='409')throw error;}
   }
   const {care}=await api(c.client,{action:'submit',token:c.token,requestId:pending.requestId,payload:pending.payload,files:pending.draft?metaFiles(pending.draft):undefined});
   if(customer!==c)return;
   if(pending.payload.kind==='warranty'){c.value.draft=newDraft();}else c.value.review={experience:0,quality:0,message:''};
   c.value.pending=null;await save(c);restore(c);paintCustomer(c,care);status(c.root,'Cửa hàng đã nhận và lưu yêu cầu của bạn.');
  }catch(e){if(customer!==c)return;status(c.root,e.message||'Chưa gửi được. Nháp và mã yêu cầu vẫn được giữ.');q(c.root,'[data-care-edit]').hidden=!e.definitive;}
  finally{c.busy=false;if(customer===c)lock(c);}
 }
 async function sendSupplement(c,cid){
  const entry=c.value.supplements[cid];if(!entry?.message.trim())return status(c.root,'Nhập thông tin bổ sung.');
  if(c.supplementBusy)return;c.supplementBusy=true;entry.pending=true;const form=c.root.querySelector(`.care-supplement[data-id="${cid}"]`);if(form){form.elements.supplement.disabled=true;form.querySelector('button').disabled=true;}
  try{await save(c);const {care}=await api(c.client,{action:'supplement',token:c.token,id:cid,requestId:entry.requestId,revision:entry.revision,message:entry.message});delete c.value.supplements[cid];await save(c);c.supplementBusy=false;paintCustomer(c,care);status(c.root,'Đã lưu thông tin bổ sung.');}
  catch(e){if(e.definitive){entry.rejected=true;void save(c).catch(()=>{});const edit=form?.querySelector('[data-edit-supplement]');if(edit)edit.hidden=false;}status(c.root,e.message+' Nội dung bổ sung vẫn được giữ.');}
  finally{c.supplementBusy=false;if(form?.isConnected)form.querySelector('button').disabled=false;}
 }
 async function mountCustomer({host,client,order,token}){
  if(!host||!/^[a-f0-9]{64}$/.test(token))return;if(order.cancelled){if(customer?.token===token)customer.root.hidden=true;return;}
  if(customer?.token===token){customer.order=order;customer.root.hidden=false;if(customer.root.parentNode!==host)host.append(customer.root);return;}
  const root=document.createElement('section');root.innerHTML=customerHTML();const c=customer={host,root,client,order,token,scope:'customer-care:'+token,chain:Promise.resolve(),value:{draft:newDraft(),review:{experience:0,quality:0,message:''},supplements:{},pending:null},saved:true,busy:false};host.append(root);
  try{const cached=await window.CustomOrderStore.load(c.scope);if(cached)c.value=cached;c.value.supplements||={};}catch{status(root,'Chưa đọc được nháp trên thiết bị.');}
  if(customer!==c)return;restore(c);if(c.value.lastCare){paintCustomer(c,c.value.lastCare);status(root,'Đang dùng bản đã nhận trên thiết bị; chờ cập nhật từ cửa hàng.');}
  root.addEventListener('input',e=>{if(e.target.hasAttribute('data-care-search')){filterChoices(e.target);return;}if(c.value.pending)return;if(e.target.name==='description')c.value.draft.description=e.target.value;if(e.target.name==='message')c.value.review.message=e.target.value;if(e.target.name==='supplement'){const cid=e.target.closest('form').dataset.id;const row=c.data.warranties.find(row=>row.id===cid);const entry=c.value.supplements[cid]||={requestId:id(),revision:row.revision,message:'',pending:false};if(!entry.pending)entry.message=e.target.value;}void save(c).catch(()=>{});});
  root.addEventListener('change',async e=>{
   if(c.value.pending)return;const target=e.target;
   if(target.name==='line'){c.value.draft.lineId=target.value;c.value.draft.partId='';c.value.draft.partSelected=false;parts(c);}
   if(target.name==='part'){c.value.draft.partId=target.value;c.value.draft.partSelected=true;}
   if(target.name==='images'){
    const files=[...target.files];target.value='';if(files.length+c.value.draft.images.length>4||files.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5242880||!f.size)){status(root,'Chọn 1–4 ảnh JPG, PNG, WebP, không quá 5 MB mỗi ảnh.');return;}
    c.busy=true;lock(c);try{for(const f of files){const digest=await crypto.subtle.digest('SHA-256',await f.arrayBuffer());c.value.draft.images.push({id:id(),name:f.name.slice(0,180),size:f.size,type:f.type,blob:f,sha256:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')});}preview(c);}finally{c.busy=false;lock(c);}
   }
   void save(c).catch(()=>{});
  });
  root.addEventListener('click',async e=>{
   const b=e.target.closest('button');if(!b)return;
   if(b.classList.contains('care-refresh'))return refreshCustomer(c);
   if(b.dataset.rating){c.value.review[b.dataset.rating]=Number(b.dataset.value);root.querySelectorAll(`[data-rating=${b.dataset.rating}]`).forEach(el=>el.setAttribute('aria-pressed',String(el===b)));void save(c).catch(()=>{});}
   if(b.hasAttribute('data-care-retry'))return send(c);
   if(b.dataset.editSupplement){await refreshCustomer(c);const cid=b.dataset.editSupplement,row=c.data.warranties.find(row=>row.id===cid),entry=c.value.supplements[cid];if(!entry||row?.stage!=='info'){status(root,'Yêu cầu đã chuyển trạng thái. Nội dung bổ sung vẫn được giữ trên thiết bị.');return;}if(!confirm('Đối chiếu phản hồi mới rồi sửa thông tin đang giữ?'))return;entry.requestId=id();entry.revision=row.revision;entry.pending=false;entry.rejected=false;await save(c);const form=b.closest('form');form.elements.supplement.disabled=false;b.hidden=true;return;}
   if(b.hasAttribute('data-care-edit')){await refreshCustomer(c);if(!confirm('Đối chiếu yêu cầu đã lưu trước khi sửa. Bắt đầu lại từ nháp đang giữ?'))return;c.value.pending=null;c.value.draft.requestId=id();try{await save(c);lock(c);}catch{}}
  });
  root.addEventListener('submit',async e=>{
   e.preventDefault();if(c.busy)return;const form=e.target;
   if(form.classList.contains('care-supplement')){
    await sendSupplement(c,form.dataset.id);return;
   }
   if(c.value.pending)return;
   let payload,draft;
   if(form.classList.contains('care-warranty')){draft=structuredClone(c.value.draft);if(!draft.lineId||!draft.partSelected||!draft.description.trim()||!draft.images.length){status(root,'Chọn sản phẩm, bộ phận, mô tả tình trạng và thêm ít nhất một ảnh.');return;}payload={kind:'warranty',lineId:draft.lineId,partId:draft.partId,description:draft.description.trim()};}
   else{if(!c.value.review.experience||!c.value.review.quality){status(root,'Chọn điểm cho cả trải nghiệm và chất lượng.');return;}payload={kind:'review',...c.value.review};}
   c.value.pending={requestId:draft?.requestId||id(),payload,draft};c.busy=true;lock(c);try{await save(c);c.busy=false;await send(c);}catch{c.busy=false;c.value.pending=null;lock(c);}
  });
  await refreshCustomer(c);if(c.value.pending)void send(c);for(const [cid,entry] of Object.entries(c.value.supplements))if(entry.pending)await sendSupplement(c,cid);
 }
 function staffHTML(){return `<section class="custom-care"><div class="section-top"><h2>Đánh giá & bảo hành</h2><div class="care-actions"><button class="btn secondary care-refresh">Làm mới</button><button class="btn secondary care-zalo-send">Xử lý hàng chờ Zalo</button></div></div><p class="care-message" role="status">Đang đọc thông báo…</p><div class="care-staff-events"></div><button class="btn text care-clear-filter" hidden>Xem tất cả yêu cầu</button><div class="care-staff-list"></div><button class="btn secondary care-more" hidden>Xem thêm yêu cầu và đánh giá</button><h2>Đánh giá từ khách</h2><div class="care-staff-reviews"></div></section>`;}
 function staffActions(c,row){if(!c.canManage)return '<p>Chỉ quản lý đơn được duyệt bảo hành.</p>';if(row.stage==='ready')return '<button class="btn primary" data-decision="collected">Xác nhận khách đã nhận</button>';if(row.stage!=='pending')return '';
  const draft=c.decisions[row.id]||{},parts=[...new Map((row.parts||[]).map(p=>[p.partId,p])).values()];return `${draft.revision&&draft.revision!==row.revision?'<p class="care-store-note">Yêu cầu đã được cập nhật. Nháp phản hồi vẫn được giữ; đối chiếu trước khi gửi.</p><button class="btn secondary" data-care-reconcile>Đã đối chiếu, tiếp tục sửa nháp</button>':''}<label>Phản hồi cho khách<textarea name="decision-note" rows="3" maxlength="2000">${esc(draft.note||'')}</textarea></label><fieldset><legend>Phần in thay thế</legend><label>Tìm bộ phận<input type="search" data-care-search></label><small class="care-search-count" role="status"></small><div class="care-options">${parts.map(p=>`<label><input name="approve-part-${esc(row.id)}" type="radio" value="${esc(p.partId)}" ${draft.partId===p.partId?'checked':''}>${esc(p.partName)}</label>`).join('')}</div></fieldset><label>Số lượng bộ phận thay thế<input name="quantity" type="number" min="1" max="9999" step="1" value="${esc(draft.quantity??1)}"></label><div class="care-actions"><button class="btn secondary" data-decision="info">Cần thêm thông tin</button><button class="btn primary" data-decision="approved">Duyệt in thay thế</button><button class="btn secondary" data-decision="declined">Từ chối có lý do</button></div>`;
 }
 async function refreshStaff(c,more=false){
  if(c.busy||c.root.querySelector('.care-staff-list')?.contains(document.activeElement))return;
  try{
   const {care}=await api(c.client,{action:'inbox',workspaceId:c.workspaceId,offset:more?c.offset+40:0,focusId:c.focusId});if(staff!==c)return;
   c.offset=more?c.offset+40:c.offset;c.reviews=more?[...new Map([...c.reviews,...(care.reviews||[])].map(r=>[r.orderId,r])).values()]:[...new Map([...(care.reviews||[]),...c.reviews.filter(old=>!(care.reviews||[]).some(fresh=>fresh.orderId===old.orderId))].map(r=>[r.orderId,r])).values()];
   c.rows=more?[...new Map([...c.rows,...care.warranties].map(row=>[row.id,row])).values()]:[...new Map([...care.warranties,...c.rows.filter(row=>!care.warranties.some(fresh=>fresh.id===row.id))].map(row=>[row.id,row])).values()];
   q(c.root,'.care-staff-list').innerHTML=c.rows.length?c.rows.map(row=>requestHTML(row,true).replace('</article>',`${staffActions(c,row)}<p class="care-zalo">Zalo: ${(row.zalo||[]).map(x=>esc((x.stage==='ready'?'Sẵn sàng nhận':'Đã duyệt')+' · '+({pending:'Chờ gửi',sending:'Đang gửi',sent:'Dịch vụ đã tiếp nhận',blocked:'Cần cấu hình',unknown:'Chưa rõ kết quả, cần đối chiếu',failed:'Gửi thất bại'}[x.status]||x.status))).join('; ')||'Chưa có thông báo cần gửi'}</p></article>`)).join(''):'<p>Chưa có yêu cầu bảo hành.</p>';
   q(c.root,'.care-staff-events').textContent=`${care.total} yêu cầu · Thông báo gần nhất: ${care.events?.[0]?({warranty:'Yêu cầu bảo hành mới',review:'Có đánh giá mới',supplement:'Khách bổ sung thông tin'}[care.events[0].kind]||labels[care.events[0].kind]||'Đã cập nhật'): 'Chưa có'}`;
   q(c.root,'.care-staff-reviews').innerHTML=c.reviews.length?c.reviews.map(r=>`<article class="care-card"><b>${esc(r.orderId)} · Trải nghiệm ${esc(r.experience)}/5 · Chất lượng ${esc(r.quality)}/5</b><p class="care-quote">${esc(r.message||'Không có lời nhắn.')}</p></article>`).join(''):'<p>Chưa có đánh giá.</p>';
   q(c.root,'.care-more').hidden=c.rows.length>=care.total&&c.reviews.length>=(care.reviewTotal||0);q(c.root,'.care-clear-filter').hidden=!c.focusId;status(c.root,'Đã cập nhật từ máy chủ.');if(c.canManage&&Date.now()-(c.lastZalo||0)>60000)void flushZalo(c,false);
  }catch(e){if(staff===c)status(c.root,e.message+' Dữ liệu đã nhận được giữ nguyên.');}
 }
 async function saveDecisions(c){const snapshot=structuredClone({decisions:c.decisions});c.chain=c.chain.catch(()=>{}).then(()=>window.CustomOrderStore.save('care-manager:'+c.workspaceId+':'+c.userId,snapshot));try{await c.chain;}catch{if(staff===c)status(c.root,'Nháp phản hồi đang giữ trong phiên này; chưa lưu được trên thiết bị.');}}
 async function flushZalo(c,report){
  if(!c.canManage||c.zaloBusy)return;c.zaloBusy=true;c.lastZalo=Date.now();
  try{const {data,error}=await c.client.functions.invoke('custom-care-zalo',{body:{workspaceId:c.workspaceId}});if(error||data?.error)throw Error('Chưa xử lý được hàng chờ Zalo. Trạng thái bảo hành vẫn được giữ.');if(staff===c&&report)status(c.root,data?.configured?`Dịch vụ đã tiếp nhận ${data.accepted||0} tin. Đây chưa phải xác nhận khách đã đọc.`:'Zalo chưa cấu hình đầy đủ OA/API/mẫu tin. Phiếu bảo hành vẫn được lưu.');}
  catch(e){if(staff===c&&report)status(c.root,e.message);}finally{c.zaloBusy=false;}
 }
 function mountStaff({host,client,workspaceId,userId,canManage}){
  if(!host)return;if(staff?.workspaceId===workspaceId&&staff.userId===userId&&staff.canManage===canManage){if(staff.root.parentNode!==host)host.append(staff.root);staff.canManage=canManage;return;}
  const root=document.createElement('div');root.innerHTML=staffHTML();const c=staff={root,client,workspaceId,userId,canManage,decisions:{},chain:Promise.resolve(),rows:[],reviews:[],offset:0,focusId:/^[a-f0-9-]{36}$/.test(new URLSearchParams(location.search).get('care')||'')?new URLSearchParams(location.search).get('care'):null,busy:false};host.append(root);q(root,'.care-zalo-send').hidden=!canManage;const remember=e=>{if(e.target.hasAttribute('data-care-search')){filterChoices(e.target);return;}const card=e.target.closest('[data-care-id]');if(!card)return;const row=c.rows.find(row=>row.id===card.dataset.careId);if(!row)return;const draft=c.decisions[row.id]||={revision:row.revision};draft.note=q(card,'[name=decision-note]')?.value||'';draft.partId=q(card,'input[type=radio]:checked')?.value||'';draft.quantity=q(card,'[name=quantity]')?.value||1;void saveDecisions(c);};root.addEventListener('input',remember);root.addEventListener('change',remember);
  root.addEventListener('click',async e=>{
   const b=e.target.closest('button');if(!b)return;if(b.classList.contains('care-refresh')){document.activeElement?.blur();return refreshStaff(c);}if(b.classList.contains('care-clear-filter')){c.focusId=null;c.rows=[];c.reviews=[];c.offset=0;return refreshStaff(c);}if(b.classList.contains('care-more'))return refreshStaff(c,true);if(b.classList.contains('care-zalo-send'))return flushZalo(c,true);
   if(b.hasAttribute('data-care-reconcile')){const card=b.closest('[data-care-id]'),row=c.rows.find(row=>row.id===card.dataset.careId);if(c.decisions[row.id]&&confirm('Đã đối chiếu phản hồi mới của yêu cầu này?')){c.decisions[row.id].revision=row.revision;void saveDecisions(c);document.activeElement?.blur();void refreshStaff(c);}return;}
   if(!b.dataset.decision||c.busy)return;const card=b.closest('[data-care-id]'),row=c.rows.find(r=>r.id===card.dataset.careId),note=q(card,'[name=decision-note]')?.value||'',partId=q(card,'input[type=radio]:checked')?.value;
   if(c.decisions[row.id]?.revision&&c.decisions[row.id].revision!==row.revision){status(root,'Đối chiếu yêu cầu đã cập nhật trước khi gửi nháp phản hồi.');return;}
   if(b.dataset.decision==='approved'&&(!q(card,'[name=quantity]')?.value||!Number.isSafeInteger(Number(q(card,'[name=quantity]').value))||Number(q(card,'[name=quantity]').value)<1)){status(root,'Nhập số lượng bộ phận thay thế hợp lệ.');return;}
   if(b.dataset.decision==='approved'&&!partId){status(root,'Chọn đúng bộ phận được duyệt trước khi xếp in.');return;}
   if(b.dataset.decision!=='collected'&&!note.trim()){status(root,'Nhập phản hồi cho khách.');return;}
   if(!confirm(b.dataset.decision==='collected'?'Xác nhận khách đã nhận phần thay thế?':'Xác nhận '+b.textContent.toLowerCase()+'?'))return;
   c.busy=true;card.querySelectorAll('button').forEach(el=>el.disabled=true);
   try{await api(client,{action:'decision',workspaceId,id:row.id,revision:row.revision,decision:b.dataset.decision,note,partId,quantity:Number(q(card,'[name=quantity]')?.value||1)});delete c.decisions[row.id];void saveDecisions(c);document.activeElement?.blur();c.busy=false;await refreshStaff(c);void flushZalo(c,false);}catch(e){status(root,e.message);card.querySelectorAll('button').forEach(el=>el.disabled=false);}finally{c.busy=false;}
  });void (async()=>{try{const cached=await window.CustomOrderStore.load('care-manager:'+workspaceId+':'+userId);if(cached?.decisions)c.decisions=cached.decisions;}catch{}if(staff===c)await refreshStaff(c);})();
 }
 setInterval(()=>{if(document.hidden)return;if(customer?.root.isConnected)void refreshCustomer(customer);if(staff?.root.isConnected)void refreshStaff(staff);},30000);
 window.addEventListener('online',()=>{if(!customer?.root.isConnected||customer.token!==location.hash.slice(1))return;if(customer.value.pending)void send(customer);for(const [cid,entry] of Object.entries(customer.value.supplements))if(entry.pending)void sendSupplement(customer,cid);});
 window.addEventListener('beforeunload',e=>{if(customer&&!customer.saved){e.preventDefault();e.returnValue='';}});
 window.CustomCare={mountCustomer,mountStaff};window.dispatchEvent(new Event('custom-care-ready'));
})();
