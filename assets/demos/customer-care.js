/* Approval prototype: in-memory fixtures only; no network, accounts or persistence. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const products=[{id:'keyboard',name:'Bàn phím tên · LINH',parts:['Khay bàn phím','Nút + ký tự']},{id:'stand',name:'Kệ điện thoại · Xanh rêu',parts:['Thân kệ','Chân đỡ']}];
 const stages=['pending','approved','printing','qc','ready','collected'];
 const labels={pending:'Chờ cửa hàng xem xét',info:'Cần bổ sung thông tin',approved:'Đã duyệt · Chờ xếp lịch in',printing:'Đang in phần thay thế',qc:'Kiểm tra & hoàn thiện',ready:'Sẵn sàng đến nhận',collected:'Đã nhận phần thay thế',declined:'Chưa được chấp nhận'};
 const titles={pending:'Cửa hàng sẽ xem tình trạng của bạn.',info:'Cửa hàng cần hiểu rõ hơn một chút.',approved:'Phần thay thế đã được duyệt.',printing:'Đang chăm lại chi tiết của bạn.',qc:'Thêm một lượt kiểm tra kỹ.',ready:'Món đồ của bạn sắp trọn vẹn rồi.',collected:'Cảm ơn bạn đã cùng chăm món đồ.',declined:'Cửa hàng đã phản hồi yêu cầu.'};
 const descriptions={pending:'Bạn theo dõi phản hồi tại đây. Yêu cầu chưa được đưa vào sản xuất.',info:'Bạn xem lời nhắn bên dưới và bổ sung thông tin để cửa hàng xem xét tiếp.',approved:'Cửa hàng sẽ xếp lịch in đúng bộ phận đã xác nhận.',printing:'Chỉ bộ phận được duyệt được in lại; đơn mua ban đầu vẫn giữ nguyên.',qc:'Phần thay thế được kiểm tra trước khi báo bạn đến nhận.',ready:'Phần thay thế đã được cửa hàng xác nhận sẵn sàng.',collected:'Lần bảo hành này đã hoàn tất. Bạn vẫn có thể gửi góp ý hoặc yêu cầu hỗ trợ khác.',declined:'Bạn có thể xem lý do bên dưới và liên hệ cửa hàng để được hỗ trợ thêm.'};
 let request=null,photos=[],review=null,ratings={experience:0,quality:0},events=[],view='customer',tab='warranty',timer;
 const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 function toast(message){clearTimeout(timer);$('care-toast').textContent=message;$('care-toast').hidden=false;timer=setTimeout(()=>$('care-toast').hidden=true,4200);}
 function event(message){events.unshift(message);$('events').replaceChildren(...events.map(text=>node('li',text)));$('inbox-count').textContent=String(events.length);}
 function error(id,message,focus){$(id).textContent=message;$(id).hidden=!message;if(focus)$(focus).focus();}
 function setView(next){view=next;$('customer-view').hidden=next!=='customer';$('studio-view').hidden=next!=='studio';document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.view===next)));if(next==='studio')renderStudio();}
 function setTab(next){tab=next;$('warranty-tab').hidden=next!=='warranty';$('review-tab').hidden=next!=='review';document.querySelectorAll('[data-tab]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.tab===next)));}
 function selectedProduct(){return products.find(product=>product.id===document.querySelector('[name=product]:checked')?.value);}
 function showParts(){const product=selectedProduct();$('parts-field').hidden=!product;$('parts').replaceChildren();if(!product)return;[...product.parts,'Khác / Chưa xác định được'].forEach((part,i)=>{const label=node('label'),input=document.createElement('input');input.type='radio';input.name='part';input.value=String(i);label.append(input,node('span',part));$('parts').append(label);});}
 for(const product of products){const label=node('label'),input=document.createElement('input');input.type='radio';input.name='product';input.value=product.id;input.addEventListener('change',showParts);label.append(input);if(product.id==='keyboard'){const img=document.createElement('img');img.src='../custom-orders/keyboard-render/35ed70cdd88f-b143cda7/tray-4.png';img.alt='Khay bàn phím · ảnh minh họa sản phẩm';img.className='choice-image';label.append(img);}label.append(node('span',product.name));$('products').append(label);}
 function gallery(target,items,remove=false){$(target).replaceChildren(...items.map((photo,i)=>{const figure=node('div',undefined,'photo'),img=document.createElement('img');img.src=photo.url;img.alt='Ảnh tình trạng: '+photo.name;figure.append(img,node('span',photo.name));if(remove){const button=node('button','Bỏ ảnh');button.type='button';button.setAttribute('aria-label','Bỏ ảnh '+photo.name);button.onclick=()=>{URL.revokeObjectURL(photos[i].url);photos.splice(i,1);gallery('photo-list',photos,true);$('photos').focus();};figure.append(button);}return figure;}));}
 $('photos').addEventListener('change',()=>{
  const files=[...$('photos').files];const valid=['image/jpeg','image/png','image/webp'];
  if(files.some(file=>!valid.includes(file.type)||file.size>5*1024*1024)||photos.length+files.length>4){error('photo-error','Chọn tối đa 4 ảnh JPG, PNG hoặc WebP; mỗi ảnh không quá 5 MB.');$('photos').value='';return;}
  error('photo-error','');for(const file of files)photos.push({name:file.name,url:URL.createObjectURL(file)});$('photos').value='';gallery('photo-list',photos,true);
 });
 $('warranty-form').addEventListener('submit',e=>{
  e.preventDefault();if(request)return;const product=selectedProduct(),part=document.querySelector('[name=part]:checked');
  if(!product)return error('warranty-error','Bạn chọn sản phẩm cần hỗ trợ trước nhé.');
  if(!part)return error('warranty-error','Bạn chọn bộ phận bị hỏng hoặc “Chưa xác định được”.');
  if(!$('damage').value.trim())return error('warranty-error','Bạn mô tả tình trạng sản phẩm để cửa hàng xem xét.','damage');
  if(!photos.length)return error('warranty-error','Bạn thêm ít nhất một ảnh tình trạng sản phẩm.','photos');
  error('warranty-error','');request={product:product.name,part:[...product.parts,'Khác / Chưa xác định được'][Number(part.value)],description:$('damage').value.trim(),photos:[...photos],stage:'pending',note:'',supplement:''};
  event('Yêu cầu bảo hành mới BH-0248 · '+request.product+' / '+request.part);renderStatus();toast('Đã tạo yêu cầu minh họa. Chưa gửi dữ liệu thật.');$('request-title').tabIndex=-1;$('request-title').focus();
 });
 function renderStatus(){
  $('request-card').hidden=!!request;$('request-status').hidden=!request;if(!request)return;
  const {stage,note}=request;$('customer-status').textContent=labels[stage];$('request-title').textContent=titles[stage];$('request-description').textContent=descriptions[stage]+' '+request.product+' · '+request.part+'.';$('care-art').dataset.stage=stage;
  const index=stages.indexOf(stage),timeline=stage==='declined'?['pending','declined']:stage==='info'?['pending','info']:stages;
  $('customer-timeline').replaceChildren(...timeline.map((key,i)=>{const li=node('li',labels[key]);if((index>=0&&i<index)||(stage==='info'||stage==='declined')&&i===0)li.className='done';if(key===stage)li.setAttribute('aria-current','step');return li;}));
  $('customer-note').hidden=!note;$('customer-note').querySelector('p').textContent=note;$('pickup-note').hidden=stage!=='ready';$('supplement').hidden=stage!=='info';$('new-request').hidden=!['collected','declined'].includes(stage);if(view==='studio')renderStudio();
 }
 $('send-supplement').onclick=()=>{if(request?.stage!=='info')return;const value=$('more-info').value.trim();if(!value)return error('supplement-error','Bạn nhập thông tin cần bổ sung.','more-info');request.supplement=value;request.stage='pending';$('more-info').value='';error('supplement-error','');event('Khách bổ sung thông tin cho BH-0248: '+value);renderStatus();toast('Đã bổ sung trong demo; đang chờ cửa hàng xem lại.');};
 function renderStudio(){
  $('studio-empty').hidden=!!request;$('studio-request').hidden=!request;if(!request)return;
  $('studio-status').textContent=labels[request.stage];$('studio-product').textContent=request.product+' · '+request.part;$('studio-damage').textContent=request.description;gallery('studio-photos',request.photos);$('studio-supplement').hidden=!request.supplement;$('studio-supplement').textContent='Khách bổ sung: '+request.supplement;
  const actions=request.stage==='pending'?[['info','Cần thêm thông tin'],['approved','Duyệt in thay thế'],['declined','Từ chối có lý do']]:{approved:[['printing','Mô phỏng bắt đầu in']],printing:[['qc','Mô phỏng in xong']],qc:[['ready','Xác nhận sẵn sàng nhận']],ready:[['collected','Xác nhận khách đã nhận']]}[request.stage]||[];
  $('studio-actions').replaceChildren(...actions.map(([stage,text])=>{const button=node('button',text,'btn '+(['info','declined'].includes(stage)?'secondary':'primary'));button.dataset.transition=stage;button.onclick=()=>transition(stage);return button;}));
 }
 function transition(next){
  const note=$('decision-note').value.trim();if(['info','declined','approved'].includes(next)&&!note)return error('decision-error','Nhập phản hồi cho khách trước khi xác nhận.','decision-note');
  error('decision-error','');request.stage=next;if(note)request.note=note;$('decision-note').value='';event('BH-0248 · '+labels[next]+(next==='ready'?' · Hiển thị lời mời khách đến nhận trên trang theo dõi.':''));renderStatus();toast('Đã cập nhật trạng thái minh họa.');
 }
 $('new-request').onclick=()=>{if(!request||!['collected','declined'].includes(request.stage))return;event('Lưu lịch sử minh họa BH-0248 · '+labels[request.stage]);/* Historical events remain visible to the reviewer. */request=null;photos.forEach(photo=>URL.revokeObjectURL(photo.url));photos=[];$('warranty-form').reset();$('parts').replaceChildren();$('parts-field').hidden=true;gallery('photo-list',photos,true);renderStatus();$('damage').focus();};
 for(const group of document.querySelectorAll('[data-rating]'))for(let value=1;value<=5;value++){
  const button=node('button');button.type='button';button.dataset.score=String(value);button.setAttribute('aria-label',value+' trên 5');button.setAttribute('aria-pressed','false');button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>';button.append(node('span',String(value)));button.onclick=()=>{ratings[group.dataset.rating]=value;group.querySelectorAll('button').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));};group.append(button);
 }
 $('review-form').addEventListener('submit',e=>{e.preventDefault();if(review)return;if(!ratings.experience||!ratings.quality)return error('review-error','Bạn chọn điểm cho cả trải nghiệm mua hàng và chất lượng sản phẩm.');review={...ratings,text:$('review-text').value.trim()};error('review-error','');$('review-form').hidden=true;$('review-success').hidden=false;$('studio-review').textContent='BM-0248 · Trải nghiệm '+review.experience+'/5 · Chất lượng '+review.quality+'/5\n'+(review.text||'Khách không để lại lời nhắn.');event('Có đánh giá mới cho BM-0248.');toast('Đã ghi đánh giá minh họa; chưa gửi dữ liệu thật.');});
 document.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>setView(el.dataset.view));document.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>setTab(el.dataset.tab));$('try-studio').onclick=()=>{setView('studio');$('studio-title').tabIndex=-1;$('studio-title').focus();};$('back-customer').onclick=()=>setView('customer');
 $('theme').onclick=()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';$('theme').textContent=dark?'Giao diện sáng':'Giao diện tối';};
 $('reset').onclick=()=>{if(window.confirm('Xóa dữ liệu minh họa và bắt đầu lại?'))location.reload();};
 window.addEventListener('beforeunload',e=>{if(($('damage').value||photos.length)&&!request||$('review-text').value&&!review){e.preventDefault();e.returnValue='';}});
 window.addEventListener('pagehide',()=>photos.forEach(photo=>URL.revokeObjectURL(photo.url)));
 setView(view);setTab(tab);
})();
