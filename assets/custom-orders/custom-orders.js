/* Custom order counter and token-bound customer journey. Server is authoritative. */
(() => {
  'use strict';
  const FACEBOOK = 'https://www.facebook.com/banhmi.176huynhcuong';
  const PUBLIC = document.body.dataset.page === 'customer';
  const productWide=window.matchMedia('(min-width:1100px)');
  if(!window.supabase?.createClient){document.getElementById('app').innerHTML='<main class="broken-link"><h1>Chưa mở được kết nối.</h1><p>Kiểm tra mạng hoặc tải lại trang để thử lại.</p><button class="btn primary" id="connection-retry">Thử lại</button></main>';document.getElementById('connection-retry').onclick=()=>location.reload();return;}
  const client = supabase.createClient('https://mapmfngikmumvghapqcu.supabase.co','sb_publishable_V2iHcQ5i7l-kR8rEADgCKg_8bz9BiBJ',{auth:{persistSession:!PUBLIC,autoRefreshToken:!PUBLIC,detectSessionInUrl:false}});
  let workspace=null,session=null,scope='',booted=false,writeChain=Promise.resolve(),catalogSequence=0,catalogTotal=0,orderTotal=0,refreshTimer,searchTimer;
  const modelIndex=new Map();
  const app = document.getElementById('app');
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const normalized = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const money = value => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
  const dateLabel = value => value ? new Intl.DateTimeFormat('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(`${value}T12:00:00+07:00`)) : 'Chưa hẹn ngày';
  const uid = () => crypto.randomUUID();
  const icons = {
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon:'<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
    chevron:'<path d="m9 5 7 7-7 7"/>',check:'<path d="m5 12 4 4L19 6"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    box:'<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9v10M3 8l9 4 9-4M7.5 5.5l9 5v5"/>',
    bag:'<path d="M5 8h14l1 13H4L5 8Zm3 0V6a4 4 0 0 1 8 0v2"/>',
    list:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 11h6m-6 4h6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 3h2"/>',
    user:'<circle cx="12" cy="7.5" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    money:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    qr:'<path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6v-6Zm6 0v-3M12 3v3m0 6h-2m-4 0H3m9 3v6"/>',
    facebook:'<path d="M14 21v-8h3l.5-4H14V7c0-1.1.4-2 2-2h2V1.5A22 22 0 0 0 15 1c-3 0-5 1.8-5 5v3H7v4h3v8"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
    spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    link:'<path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 1)"/>',
    store:'<path d="M3 10h18l-2-7H5l-2 7Zm2 0v11h14V10M9 21v-7h6v7M3 10s0 3 3 3 3-3 3-3 0 3 3 3 3-3 3-3 0 3 3 3 3-3 3-3"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.box}</svg>`;
  const brand = () => '<span class="wordmark">platedio<span>.</span></span>';
  let models = [];
  const stages = [
    {label:'Đã nhận đơn',headline:'Một ý tưởng,<br><em>rất riêng bạn.</em>',description:'Cửa hàng đã ghi nhận yêu cầu. Hành trình làm món đồ của bạn bắt đầu từ đây.',detail:'Yêu cầu custom đã được cửa hàng xác nhận.',art:'idea'},
    {label:'Đang thực hiện',headline:'Đang thành hình.<br><em>Riêng cho bạn.</em>',description:'Xưởng đang thực hiện món đồ theo yêu cầu đã chốt. Từng chi tiết nhỏ đều mang dấu ấn của bạn.',detail:'Xưởng đang thực hiện yêu cầu đã chốt.',art:'making'},
    {label:'Kiểm tra hoàn thiện',headline:'Chăm chút thêm<br><em>một chút nữa.</em>',description:'Sản phẩm đang được kiểm tra và hoàn thiện trước khi đến tay bạn.',detail:'Kiểm tra sản phẩm và hoàn thiện các chi tiết.',art:'check'},
    {label:'Sẵn sàng nhận / giao',headline:'Xong rồi này.<br><em>Đón bạn nhé!</em>',description:'Món đồ của bạn đã sẵn sàng. Hẹn bạn tại cửa hàng, hoặc liên hệ để xác nhận việc giao hàng.',detail:'Sản phẩm đã sẵn sàng nhận tại cửa hàng hoặc giao.',art:'ready'},
    {label:'Hoàn tất',headline:'Từ một ý tưởng,<br><em>đến tay bạn.</em>',description:'Cảm ơn bạn đã cùng Bánh Mì làm nên một món đồ mang dấu ấn riêng. Mong bạn thích món đồ này.',detail:'Đơn hàng đã được giao và xác nhận hoàn tất.',art:'done'}
  ];
  const freshDraft = () => ({lines:[],customer:'',phone:'',delivery:'pickup',address:'',total:'',deposit:'',due:'',checked:false});
  let state = {view:'staff',area:'create',step:0,draft:freshDraft(),orders:[],selectedToken:'',query:'',filter:'all',theme:'light'};
  let storageAvailable = true;

  let toastTimer, graphicId = 0, saving = false;
  function toast(message) {
    const node = $('#toast'); node.textContent = message; node.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => {node.hidden = true;}, 6000);
  }
  function persist() {return persistState();}
  function productArt(model, extra = "") {
    const src=(model?.images||[]).find(url=>typeof url==="string"&&/^https?:\/\//.test(url));
    return `<span class="product-art ${extra}">${src?`<img src="${esc(src)}" alt="${esc(model?.name||"Sản phẩm")}" loading="lazy" decoding="async">`:`<span class="image-fallback">${icon("box")}<small>Chưa có ảnh</small></span>`}</span>`;
  }
  function journeyArt(stage) {
    const id = `scene-${++graphicId}`;
    const defs = `<defs><linearGradient id="${id}-top" x2="0" y2="1"><stop stop-color="#edf4ce"/><stop offset="1" stop-color="#c4dda0"/></linearGradient><linearGradient id="${id}-side" x2="1" y2="1"><stop stop-color="#7d9e60"/><stop offset="1" stop-color="#3e7048"/></linearGradient></defs>`;
    const ring = '<g class="ring"><ellipse cx="225" cy="190" rx="162" ry="162" fill="none" stroke="#c7e59b" stroke-opacity=".08"/><circle cx="225" cy="28" r="3" fill="#d2eba4"/><circle cx="385" cy="205" r="2" fill="#d2eba4"/></g>';
    const base = '<ellipse cx="225" cy="270" rx="137" ry="34" fill="#0c2a1a" opacity=".4"/><path d="m98 235 124-52 132 51-127 59Z" fill="#416449"/><path d="m98 235 129 49 127-50v11l-127 59-129-58Z" fill="#254b33"/><path d="m111 235 111-45 119 44-114 50Z" fill="none" stroke="#88ad6b" stroke-opacity=".3"/>';
    const shape = `<g class="layer-stack"><path d="m162 194 62-24 67 27v37l-65 27-64-27Z" fill="url(#${id}-side)"/><path d="m162 194 64 26 65-23-67-27Z" fill="url(#${id}-top)"/>${Array.from({length:7},(_,i)=>`<path d="m163 ${199+i*5} 63 26 64-24" fill="none" stroke="#b3d18c" stroke-opacity=".38" stroke-width="1"/>`).join('')}<path d="m180 195 44-17 49 19-46 17Z" fill="none" stroke="#6c945a" stroke-width="1.5"/></g>`;
    let scene = '';
    if(stage === 0) scene = `<g class="floating-object"><path d="m144 112 111-17 58 117-117 22Z" fill="#44684a"/><path d="m135 101 111-17 58 117-117 22Z" fill="#e3ecca"/><path d="m160 122 64-9m-57 23 74-10m-42 52 49-8" stroke="#90a77a" stroke-width="2"/><path class="draw-line" d="m185 168 29-21 30 18-29 15-30-12Z" fill="none" stroke="#3d714a" stroke-width="2"/><g class="pencil"><path d="m252 126 9-5 29 58-9 5Z" fill="#b9d78a"/><path d="m281 184 5 12 4-17Z" fill="#e6d5a3"/><path d="m285 192 1 4 1-5Z" fill="#325339"/></g></g>`;
    if(stage === 1) scene = `<path d="M122 224V81h207v143" fill="none" stroke="#668559" stroke-width="7"/><path d="M122 99h207M137 81v144m177-144v145" fill="none" stroke="#99b580" stroke-width="2"/>${shape}<g class="printer-head"><path d="M194 95h61v42h-61Z" fill="#adc496"/><path d="M194 95h61v9h-61Z" fill="#d4e2b4"/><path d="M205 137h38l-9 15h-20Z" fill="#54784a"/><path d="m219 152 5 8 5-8Z" fill="#e8c987"/><path d="M224 160v20" stroke="#d6eca7" stroke-width="1.5"/><circle cx="244" cy="115" r="3" fill="#d5f28a"/></g><path d="m184 230 43 18 43-17" stroke="#cae89a" stroke-width="1" fill="none"/>`;
    if(stage === 2) scene = `${shape}<path class="scan-light" d="m148 149 77-30 85 34-85 33Z" fill="#e1f5b8" opacity=".35"/><g class="floating-object"><circle cx="294" cy="144" r="38" fill="#cce5a0" fill-opacity=".15" stroke="#d8edb4" stroke-width="3"/><path d="m320 173 25 27" stroke="#d8edb4" stroke-width="9" stroke-linecap="round"/><path d="m278 143 11 11 21-23" fill="none" stroke="#e5f5c9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    if(stage === 3 || stage === 4) scene = `<g class="floating-object"><path d="m156 171 68-26 70 28v65l-68 31-70-32Z" fill="#b8cc96"/><path d="m156 171 70 28 68-26v65l-68 31v-70" fill="#a2ba7d"/><path d="m226 199 24-9v69l-24 10Z" fill="#e9e5bc"/><path d="m226 199-22-9v69l22 10Z" fill="#d4d7a6"/><g class="${stage===3?'package-lid':'sealed-lid'}"><path d="m148 164 76-29 78 31-76 33Z" fill="#dce3b9"/><path d="m148 164 78 31 76-29v16l-76 33-78-33Z" fill="#c3d39b"/><path d="m204 187 22 8 24-10-26-10Z" fill="#f1edce"/></g><g class="seal"><circle cx="226" cy="157" r="19" fill="#284f34"/><path d="m216 157 7 7 13-15" stroke="#d4edac" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></g>${stage===4?'<path d="m130 138-9-15m201 12 10-13m-33-35 5-18m-105 14-4-15" stroke="#d4edac" stroke-width="2" stroke-linecap="round"/>':''}`;
    return `<div class="journey-art" role="img" aria-label="Đồ họa minh họa: ${esc(stages[stage].label)}"><svg viewBox="0 0 450 340" aria-hidden="true">${defs}${ring}${base}${scene}<path class="star-a" d="m340 88 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#d9ecb1"/><path class="star-b" d="m100 163 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#b2cf8d"/></svg><span class="scene-label">${['THE FIRST IDEA','MADE JUST FOR YOU','THE LITTLE DETAILS','READY FOR YOUR EVERYDAY','YOURS, AT LAST'][stage]} · MINH HỌA</span></div>`;
  }
  const getModel = line => {
    const cached=modelIndex.get(line?.modelId);
    // Enrich older cached drafts with recipe fields only when the source revision matches.
    return cached&&(!line?.model||cached.revision===line.model.revision)?cached:line?.model;
  };
  const variantName = line => getModel(line)?.variants.find(variant => variant.id === line.variantId)?.name || '';
  const selectedOrder = () => state.orders.find(order => order.token === state.selectedToken);
  const priority = () => `<span class="pill priority">${icon('spark')}Custom · Ưu tiên</span>`;
  function route(view, token) {
    if(view==='login'){location.href='plate-studio.html?next=custom-orders';return;}
    if(view==='customer'){openCustomer(token);return;}
    if(PUBLIC)return;
    const hash = view === 'customer' ? `#khach/${encodeURIComponent(token || state.selectedToken)}` : view === 'login' ? '#dangnhap' : '#cuahang';
    if(location.hash === hash) {state.view=view;render();} else location.hash = hash;
  }
  function readRoute() {if(booted&&!PUBLIC){state.view="staff";render();}}
  function render() {
    document.documentElement.dataset.theme=state.theme;

    $('#theme-toggle').innerHTML=icon(state.theme==='light'?'moon':'sun');
    $('#theme-toggle').setAttribute('aria-label', `Chuyển giao diện ${state.theme==='light'?'tối':'sáng'}`);
    [$('#detail-dialog'),$('#share-dialog'),$('#confirm-dialog')].forEach(dialog=>{if(dialog.open)dialog.close();});
    app.innerHTML = state.view === 'customer' ? customerHTML() : staffHTML();
    if(!PUBLIC&&state.offline&&$('.workspace-top'))$('.workspace-top').insertAdjacentHTML('afterend','<p class="offline-note" role="status">Ngoại tuyến · đang dùng nháp và model đã lưu trên thiết bị. Quyền và dữ liệu sẽ được kiểm tra lại khi có kết nối.</p>');
    document.title = state.view==='customer' ? `Đơn ${selectedOrder()?.id || ''} · Bánh Mì × platedio` : 'platedio · Đơn custom';
    if(state.view==='staff' && state.area==='create') {renderStep();renderSummary();}
    if(state.view==='staff' && state.area==='orders') renderOrderList();
    if(state.view==='staff' && state.area==='success') renderQRCode($('.qr-code'), selectedOrder());
  }
  function staffHTML() {
    const list = state.area === 'orders';
    return `<div class="shell"><aside class="sidebar">${brand()}<div class="store-label"><b>Bánh Mì Stationery</b>Không gian cửa hàng</div><nav aria-label="Công việc tại cửa hàng"><button class="side-nav ${!list?'active':''}" data-action="create">${icon('plus')}Nhận đơn custom</button><button class="side-nav ${list?'active':''}" data-action="orders">${icon('bag')}Đơn custom<small>${orderTotal}</small></button></nav><div class="sidebar-bottom"><div class="staff-person"><span class="avatar">${esc(actorInitials())}</span><div><b>${esc(actorName())}</b><small>${esc(workspace?.role==='store_custom'?'Nhân viên cửa hàng':'Quản lý đơn')}</small></div></div>${workspace?.role!=='store_custom'?'<a class="side-nav" href="plate-studio.html">Về Plate Studio</a>':''}<button class="side-nav" data-action="logout">${icon('lock')}Đăng xuất</button></div></aside><main class="workspace"><div class="workspace-top"><div class="breadcrumb">Cửa hàng ${icon('chevron')}<span>${list?'Đơn custom':'Nhận đơn custom'}</span></div><span class="mobile-brand">${brand()}</span><div class="top-context"><span>Bánh Mì Stationery</span><button class="btn text" data-action="${list?'create':'orders'}">${icon(list?'plus':'bag')}${list?'Tạo đơn':'Đơn custom'}</button><button class="btn-icon-only" data-action="logout" aria-label="Đăng xuất ${esc(actorName())}" title="Đăng xuất">${icon('lock')}</button><span class="avatar" aria-label="${esc(actorName())}">${esc(actorInitials())}</span></div></div>${state.area==='pending'?pendingHTML():state.area === 'success' ? successHTML() : `<div class="staff-heading"><div><span class="eyebrow">${list?'MỌI ĐƠN CUSTOM CỦA CỬA HÀNG':'TỪ QUẦY HÀNG ĐẾN XƯỞNG'}</span><h1>${list?'Mỗi yêu cầu, một dấu ấn.':'Một đơn hàng, thật riêng.'}</h1><p>${list?'Theo dõi tiến độ và mở lại mã QR dành cho khách.':'Ghi đúng mong muốn của khách. Phần còn lại, xưởng tiếp nối.'}</p></div>${priority()}</div>${list?ordersHTML():`<nav class="workflow-steps" aria-label="Các bước nhận đơn">${['Sản phẩm','Khách & hẹn lấy','Xem lại đơn'].map((label,index)=>`<button class="step ${index<state.step?'done':''}" data-step="${index}" ${index>state.step?'disabled':''} ${index===state.step?'aria-current="step"':''}><span>${index<state.step?'✓':index+1}</span>${label}</button>`).join('')}</nav><div class="work-grid"><section id="step-body" aria-label="Thông tin đơn custom"></section><aside class="panel summary" id="order-summary" aria-label="Tóm tắt đơn"></aside></div>`}`}</main></div>`;
  }
  function renderStep() {
    const host=$('#step-body'); if(!host)return;
    host.innerHTML=state.step===0?productStep():state.step===1?customerStep():reviewStep();
    host.parentElement.classList.toggle('product-workspace',state.step===0);
    if(state.step===0) {
      $('#product-summary-slot').append($('#order-summary'));
      $('#model-picker').open=productWide.matches||!state.draft.lines.length;
      renderCatalog('');renderLines();
    }
  }
  function productStep() {
    return `<div class="product-layout"><div class="product-model-column"><details class="panel model-picker" id="model-picker" ${state.draft.lines.length?'':'open'}><summary><div><h2>Thêm sản phẩm</h2><p>Tìm model theo tên hoặc mã Kiot.</p></div>${icon('chevron')}</summary><div class="model-picker-content"><label class="search-box">${icon('search')}<span class="sr-only">Tìm model theo tên hoặc mã Kiot</span><input type="search" id="model-search" placeholder="Tên model hoặc mã Kiot…" autocomplete="off"></label><div class="result-label"><span id="result-count" role="status"></span><span>Thư viện model</span></div><div class="catalog-grid" id="catalog"></div><button class="btn text full" data-action="more-models" id="more-models" hidden>Xem thêm model</button></div></details><div id="product-summary-slot"></div></div><div class="product-requirement-column"><section class="panel" id="custom-requirements-panel"><div class="section-top"><h2>Yêu cầu custom</h2><span class="section-number" id="line-count" role="status"></span></div><div id="selected-lines"></div></section><div class="form-actions product-actions"><button class="btn text" data-action="orders">Xem đơn cửa hàng</button><button class="btn primary" data-action="next" id="next-step" ${state.draft.lines.length?'':'disabled'}>Thông tin khách${icon('arrow')}</button></div><p class="draft-hint">${icon('shield')}${storageAvailable?'Nháp được giữ trên thiết bị này theo tài khoản và xưởng.':'Chỉ giữ nháp trong phiên này; bộ nhớ trình duyệt chưa sẵn sàng.'}</p></div></div>`;
  }
  function renderCatalog(query) {
    clearTimeout(searchTimer);searchTimer=setTimeout(()=>{void loadCatalog(query).catch(showError);},180);
    return;
  }
  function paintCatalog(query) {
    const filtered=models.filter(model=>normalized(`${model.name} ${model.sku} ${model.category} ${model.variants.map(v=>v.name).join(' ')}`).includes(normalized(query.trim())));
    $('#result-count').textContent=`${filtered.length} kết quả`;
    $('#catalog').innerHTML=filtered.length?filtered.map(model=>`<button class="model-card" data-model="${esc(model.id)}" aria-label="Chọn ${esc(model.name)}">${productArt(model)}<span class="model-info"><b>${esc(model.name)}</b><small>${esc(model.sku)}</small><span class="pick-label">${model.variants.length?`${model.variants.length} biến thể`:'Chọn model'}${icon('plus')}</span></span></button>`).join(''):'<div class="empty">Không tìm thấy model.<br>Thử tên không dấu hoặc mã Kiot khác.</div>';
  }
  function renderLines() {
    $('#line-count').textContent=`${state.draft.lines.length} dòng`;
    $('#selected-lines').innerHTML=state.draft.lines.length?state.draft.lines.map(lineHTML).join(''):'<div class="empty">Mở Thêm sản phẩm để chọn model và ghi yêu cầu custom.<br>Mỗi sản phẩm có mô tả và ảnh tham khảo riêng.</div>';
    window.FilamentPickers?.init($('#selected-lines'));
    paintKeyboards();
    $('#next-step').disabled=!state.draft.lines.length;
  }
  function lineHTML(line) {
    const model=getModel(line);if(!model)return '';
    return `<article class="selected-line" data-line="${line.id}" tabindex="-1" aria-label="Yêu cầu custom cho ${esc(model.name)}"><div class="line-header">${productArt(model)}<div class="line-title"><b>${esc(model.name)}</b><small>${esc(model.sku)}${variantName(line)?` · ${esc(variantName(line))}`:''}</small></div><button class="btn-icon-only" data-remove-line="${line.id}" aria-label="Bỏ ${esc(model.name)}">${icon('trash')}</button></div>${partFields(line)}<div class="field"><label for="note-${line.id}">Mô tả yêu cầu <span class="required">*</span></label><textarea id="note-${line.id}" data-note="${line.id}" rows="3" maxlength="4000" placeholder="Màu sắc, nội dung, chi tiết khách muốn thay đổi…">${esc(line.note)}</textarea></div><div class="line-meta"><div class="qty" role="group" aria-label="Số lượng ${esc(model.name)}"><button data-qty="${line.id}" data-delta="-1" aria-label="Giảm số lượng">${icon('minus')}</button><input aria-label="Số lượng ${esc(model.name)}" type="number" min="1" max="9999" step="1" data-quantity="${line.id}" value="${esc(line.qty)}"><button data-qty="${line.id}" data-delta="1" aria-label="Tăng số lượng">${icon('plus')}</button></div><label class="upload-label" for="files-${line.id}">${icon('image')}Thêm ảnh tham khảo<input class="sr-only" id="files-${line.id}" type="file" accept="image/jpeg,image/png,image/webp" multiple data-files="${line.id}"></label></div><div class="attachments" id="images-${line.id}">${imageHTML(line)}</div><small class="line-attach">Tối đa 4 ảnh/dòng · JPG, PNG, WebP · 2 MB/ảnh.</small></article>`;
  }
  const imageHTML = line => line.images.map((image,index)=>`<div class="attachment"><img src="${esc(image.src)}" alt="Ảnh tham khảo ${index+1}"><span>${esc(image.name)}</span><button class="btn-icon-only" data-remove-image="${line.id}" data-index="${index}" aria-label="Bỏ ảnh ${esc(image.name)}">${icon('close')}</button></div>`).join('');
  function selectModel(id) {
    const model=models.find(model=>model.id===id);if(!model)return;
    if(!model.variants.length) {addLine(model.id,'');return;}
    const dialog=$('#detail-dialog');
    dialog.innerHTML=`<div class="dialog-header"><div><span class="eyebrow">CHỌN BIẾN THỂ</span><h2 id="dialog-title">${esc(model.name)}</h2></div><button class="btn-icon-only" data-close-dialog aria-label="Đóng chọn biến thể">${icon('close')}</button></div>${productArt(model,'variant-photo')}<p>Chọn đúng biến thể khách muốn custom.</p><div class="variant-options">${model.variants.map(variant=>`<button data-variant="${esc(variant.id)}" data-variant-model="${esc(model.id)}" aria-pressed="false">${esc(variant.name)}</button>`).join('')}</div><div class="form-actions"><button class="btn text" data-close-dialog>Quay lại</button><button class="btn primary" id="add-variant" disabled data-action="add-variant">Thêm vào đơn${icon('plus')}</button></div>`;
    dialog.showModal();
  }
  function addLine(modelId,variantId) {
    if(state.draft.lines.length>=30){toast('Mỗi đơn tối đa 30 dòng sản phẩm.');return;}
    const line={id:uid(),modelId,model:structuredClone(modelIndex.get(modelId)),variantId,qty:1,note:'',images:[],colorChoices:{}};
    state.draft.lines.push(line);state.draft.checked=false;persist();
    const holder=$('#selected-lines');if(state.draft.lines.length===1)holder.innerHTML='';
    holder.insertAdjacentHTML('beforeend',lineHTML(line));
    window.FilamentPickers?.init(holder);
    paintKeyboards();
    $('#line-count').textContent=`${state.draft.lines.length} dòng`;
    $('#next-step').disabled=false;renderSummary();
    $('#model-picker').open=productWide.matches;
    const selected=$('[data-line="'+line.id+'"]');
    selected.focus({preventScroll:true});
    const position=selected.getBoundingClientRect();
    if(!productWide.matches||position.top<16||position.top>innerHeight-100)selected.scrollIntoView({block:'start',behavior:'instant'});

  }
  function customerStep() {
    const d=state.draft;
    return `<div id="form-error" class="error-box" role="alert" hidden></div><section class="panel"><div class="section-top"><h2>Thông tin khách</h2>${icon('user')}</div><div class="field-row"><div class="field"><label for="customer-name">Tên khách <span class="required">*</span></label><input id="customer-name" data-field="customer" autocomplete="name" maxlength="120" value="${esc(d.customer)}" placeholder="Tên để xưng hô với khách"></div><div class="field"><label for="customer-phone">Số điện thoại / Zalo <span class="required">*</span></label><input id="customer-phone" data-field="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" value="${esc(d.phone)}" placeholder="Số liên hệ nhận hàng"></div></div><div class="field"><label>Hình thức nhận hàng</label><div class="delivery-switch"><label><input type="radio" name="delivery" value="pickup" ${d.delivery==='pickup'?'checked':''}>${icon('store')}Nhận tại cửa hàng</label><label><input type="radio" name="delivery" value="delivery" ${d.delivery==='delivery'?'checked':''}>${icon('box')}Giao hàng</label></div></div><div class="field" id="address-field" ${d.delivery==='delivery'?'':'hidden'}><label for="customer-address">Địa chỉ nhận <span class="required">*</span></label><textarea id="customer-address" data-field="address" autocomplete="street-address" rows="2" maxlength="1000" placeholder="Địa chỉ khách muốn nhận hàng">${esc(d.address)}</textarea></div></section><section class="panel"><div class="section-top"><div><h2>Giá & ngày hẹn</h2><p>Nhập theo thỏa thuận với khách.</p></div>${icon('calendar')}</div><div class="field-row"><div class="field"><label for="order-total">Tổng tiền đơn <span class="required">*</span></label><input type="number" id="order-total" data-field="total" min="0" max="999999999" step="1" inputmode="numeric" value="${esc(d.total)}" placeholder="VNĐ"></div><div class="field"><label for="order-deposit">Đã nhận cọc <span class="required">*</span></label><input type="number" id="order-deposit" data-field="deposit" min="0" max="999999999" step="1" inputmode="numeric" value="${esc(d.deposit)}" placeholder="Nhập 0 nếu chưa cọc"></div></div><div class="field"><label for="order-due">Ngày hẹn nhận / giao <span class="required">*</span></label><input type="date" id="order-due" data-field="due" value="${esc(d.due)}"></div><p class="draft-hint">${icon('spark')}Đơn custom được nhận diện và ưu tiên trong luồng sản xuất.</p></section><div class="form-actions"><button class="btn secondary" data-action="back">${icon('back')}Sản phẩm</button><button class="btn primary" data-action="next">Xem lại đơn${icon('arrow')}</button></div>`;
  }
  function orderDetails(order, withCustomer=true) {
    return `${withCustomer?`<div class="review-block"><span class="eyebrow">KHÁCH & NGÀY HẸN</span><div class="review-data"><div><small>Khách hàng</small><b>${esc(order.customer)}</b></div><div><small>Liên hệ</small><b>${esc(order.phone)}</b></div><div><small>Ngày hẹn</small><b>${esc(dateLabel(order.due))}</b></div><div><small>Nhận hàng</small><b>${order.delivery==='pickup'?'Tại Bánh Mì Stationery':'Giao hàng'}</b></div></div>${order.delivery==='delivery'?`<p class="custom-note">${esc(order.address)}</p>`:''}</div>`:''}<div class="review-block"><span class="eyebrow">SẢN PHẨM & YÊU CẦU</span>${order.lines.map(line=>`<div class="review-product">${productArt(getModel(line))}<div><b>${esc(getModel(line)?.name)} × ${esc(line.qty)}</b><br><small>${esc(variantName(line))}</small><p>${esc(line.note)}</p>${partSummary(line)}${line.images?.length?`<small>${line.images.length} ảnh tham khảo</small><div class="attachments">${line.images.map(image=>`<div class="attachment"><img src="${esc(image.src)}" alt="Ảnh yêu cầu custom"></div>`).join('')}</div>`:''}</div></div>`).join('')}</div><div class="review-block"><div class="money-row"><span>Tổng tiền</span><b>${money(order.total)}</b></div><div class="money-row"><span>Đã nhận cọc</span><b>${money(order.deposit)}</b></div><div class="money-row total"><span>Còn lại</span><b>${money(Number(order.total)-Number(order.deposit))}</b></div></div>`;
  }
  function reviewStep() {
    return `<section class="panel"><div class="section-top"><div><h2>Cùng khách kiểm tra lần cuối</h2><p>Xác nhận sản phẩm, yêu cầu, số tiền và ngày hẹn.</p></div>${icon('check')}</div>${orderDetails(state.draft)}<label class="review-check"><input type="checkbox" id="review-confirm" ${state.draft.checked?'checked':''}>Đã đối chiếu thông tin và yêu cầu với khách.</label><p class="draft-hint">${icon('shield')}Chỉ báo tạo đơn sau khi máy chủ xác nhận.</p></section><div class="form-actions"><button class="btn secondary" data-action="back">${icon('back')}Chỉnh thông tin</button><button class="btn primary" data-action="submit" id="submit-order" ${state.draft.checked?'':'disabled'}>Xác nhận tạo đơn${icon('check')}</button></div>`;
  }
  function renderSummary() {
    const node=$('#order-summary');if(!node)return;const d=state.draft;
    node.innerHTML=`<span class="eyebrow">ĐƠN CUSTOM MỚI</span><div class="summary-visual"><p>Một chút khác biệt.<br><em>Một món đồ riêng.</em></p><svg viewBox="0 0 200 150" aria-hidden="true"><path d="m30 65 100-23 43 27-100 29Z" fill="#a9bd83"/><path d="m30 76 43 27 100-29v10L73 114 30 88Z" fill="#76985f"/><path d="m30 65 43 27 100-29v10L73 103 30 77Z" fill="#d0dcae"/></svg></div><div class="summary-items">${d.lines.length?d.lines.map(line=>`<div class="summary-item">${productArt(getModel(line))}<span><b>${esc(getModel(line)?.name)}</b><small>${esc(variantName(line))}</small></span><b>×${esc(line.qty)}</b></div>`).join(''):'<p class="summary-empty">Đơn của khách sẽ xuất hiện tại đây.</p>'}</div>${d.customer?`<div class="money-row"><span>Khách hàng</span><b>${esc(d.customer)}</b></div>`:''}${d.due?`<div class="money-row"><span>Ngày hẹn</span><b>${dateLabel(d.due)}</b></div>`:''}<div class="money-row"><span>Tổng tiền</span><b>${d.total!==''?money(d.total):'—'}</b></div><div class="money-row"><span>Đã cọc</span><b>${d.deposit!==''?money(d.deposit):'—'}</b></div><div class="money-row total"><span>Còn lại</span><b>${d.total!==''&&d.deposit!==''?money(Number(d.total)-Number(d.deposit)):'—'}</b></div><p class="summary-hint">${icon('qr')}Sau khi tạo đơn, khách nhận mã QR để theo dõi hành trình sản phẩm.</p>`;
  }
  function validateStep() {
    const d=state.draft;
    if(state.step===0) {
      if(!d.lines.length){toast('Chọn ít nhất một model.');return false;}
      for(const line of d.lines){const error=keyboardError(line);if(error){toast(error);$(`[data-keyboard-text="${line.id}"]`)?.focus();return false;}}
      const partMissing=d.lines.find(line=>eligibleParts(line).some(part=>resolvedColorIds(line,part).some(id=>!window.getFil(id))));
      if(partMissing){toast('Màu của part không còn trong thư viện. Kiểm tra lại màu gốc hoặc chọn màu thay thế.');$(`[data-line="${partMissing.id}"] .part-colors`).scrollIntoView({block:'center'});return false;}
      const missing=d.lines.find(line=>!line.note.trim());
      if(missing){toast('Ghi yêu cầu custom cho từng sản phẩm trước khi tiếp tục.');$(`[data-note="${missing.id}"]`).focus();return false;}
      if(d.lines.some(line=>!Number.isInteger(line.qty)||line.qty<1||line.qty>9999)){toast('Số lượng phải là số nguyên từ 1 đến 9.999.');return false;}
      return true;
    }
    let message='',target='';
    if(!d.customer.trim()){message='Nhập tên khách hàng.';target='#customer-name';}
    else if(d.phone.replace(/[^0-9]/g,'').length<8 || d.phone.replace(/[^0-9]/g,'').length>15){message='Kiểm tra số điện thoại liên hệ của khách.';target='#customer-phone';}
    else if(d.delivery==='delivery'&&!d.address.trim()){message='Nhập địa chỉ nhận hàng.';target='#customer-address';}
    else if(d.total===''||!Number.isSafeInteger(Number(d.total))||Number(d.total)<0||Number(d.total)>999999999){message='Nhập tổng tiền hợp lệ từ 0 đến 999.999.999 ₫.';target='#order-total';}
    else if(d.deposit===''||!Number.isSafeInteger(Number(d.deposit))||Number(d.deposit)<0||Number(d.deposit)>Number(d.total)){message='Tiền cọc cần từ 0 đến tổng tiền đơn.';target='#order-deposit';}
    else if(!/^\d{4}-\d{2}-\d{2}$/.test(d.due)||Number.isNaN(new Date(`${d.due}T12:00:00+07:00`).valueOf())){message='Chọn ngày hẹn nhận hoặc giao hàng.';target='#order-due';}
    if(message){$('#form-error').textContent=message;$('#form-error').hidden=false;$(target).focus();return false;}return true;
  }
  function changeStep(step) {
    if(step>state.step&&!validateStep())return;
    state.step=step;persist();render();window.scrollTo({top:0,behavior:'instant'});
    const heading=$('#step-body h2');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
  }
  function submitOrder() {void queueOrder();}
  function trackingURL(order) {
    const url=new URL('order-status.html',location.href);url.hash=order.trackingToken||order.token;return url.href;
  }
  function renderQRCode(node,order) {
    if(!node||!order)return;
    if(typeof qrcode!=='function'){node.textContent='QR chưa tải được';return;}
    const qr=qrcode(0,'M');qr.addData(trackingURL(order),'Byte');qr.make();
    node.innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true});
    $('svg',node).setAttribute('role','img');$('svg',node).setAttribute('aria-label',`QR xem đơn ${order.id}`);
  }
  function qrHTML(order) {
    return `<div class="qr-card"><h3>Hành trình riêng của khách</h3><div class="qr-code" data-qr-token="${order.token}"></div><b>${esc(order.id)}</b><p>Quét để mở trang theo dõi đơn.</p><div class="qr-actions"><button class="btn secondary" data-copy="${order.token}">${icon('copy')}Chép link</button><button class="btn primary" data-track="${order.token}">Xem thử${icon('arrow')}</button></div><span class="qr-link">${esc(trackingURL(order))}</span><p>Đường dẫn riêng của đơn, dùng được trên điện thoại của khách. Khách không cần đăng nhập.</p></div>`;
  }
  function successHTML() {
    const order=selectedOrder();
    return `<section class="panel success-panel"><div class="success-symbol">${icon('check')}</div><span class="eyebrow">ĐƠN ĐÃ ĐƯỢC MÁY CHỦ XÁC NHẬN</span><h1>Đã ghi nhận mong muốn của khách.</h1><p>Đơn đã vào luồng sản xuất với nhãn Custom và mức ưu tiên. Đưa mã QR cho khách để theo dõi đơn.</p><div class="success-layout"><div>${priority()}${orderDetails(order)}<div class="form-actions"><button class="btn secondary" data-action="create">${icon('plus')}Nhận đơn tiếp</button><button class="btn text" data-action="orders">Xem đơn cửa hàng${icon('arrow')}</button></div></div>${qrHTML(order)}</div></section>`;
  }
  function ordersHTML() {
    return `<div class="order-toolbar"><label class="search-box">${icon('search')}<span class="sr-only">Tìm đơn custom</span><input id="order-search" type="search" placeholder="Tên khách, mã đơn, model…" value="${esc(state.query)}"></label><button class="btn primary" data-action="create">${icon('plus')}Nhận đơn</button></div><nav class="order-tabs" aria-label="Lọc đơn"><button data-filter="all" aria-pressed="${state.filter==='all'}">Tất cả</button><button data-filter="active" aria-pressed="${state.filter==='active'}">Đang thực hiện</button><button data-filter="ready" aria-pressed="${state.filter==='ready'}">Sẵn sàng</button><button data-filter="done" aria-pressed="${state.filter==='done'}">Hoàn tất</button></nav><div class="result-label"><span id="order-count" role="status"></span><span>Tất cả nhân viên cửa hàng</span></div><div class="order-list" id="order-list"></div><button class="btn text full" data-action="more-orders" id="more-orders" hidden>Xem thêm đơn</button>`;
  }
  function renderOrderList() {
    if(state.offline&&!state.orders.length){$('#order-count').textContent='Chưa đọc được danh sách từ cửa hàng';$('#order-list').innerHTML='<div class="panel empty">Đang ngoại tuyến. Đơn đã gửi sẽ xuất hiện khi có kết nối.</div>';return;}
    const orders=state.orders.filter(order=>(state.filter==='all'||!order.cancelled&&(state.filter==='active'&&order.stage<3||state.filter==='ready'&&order.stage===3||state.filter==='done'&&order.stage===4))&&normalized(`${order.id} ${order.customer} ${order.lines.map(line=>`${getModel(line)?.name} ${getModel(line)?.sku} ${variantName(line)}`).join(' ')}`).includes(normalized(state.query)));
    $('#order-count').textContent=`${orders.length} đơn custom${orderTotal>state.orders.length?' · đã tải '+state.orders.length+'/'+orderTotal:''}`;
    const html=orders.length?orders.map(order=>`<button class="order-row" data-order="${order.token}">${productArt(getModel(order.lines[0]))}<span class="order-row-main"><b>${esc(order.customer)} · ${esc(order.id)}</b><small>${esc(getModel(order.lines[0])?.name)}${order.lines.length>1?` +${order.lines.length-1} sản phẩm`:''} · Tạo bởi ${esc(order.creator)}</small></span><span class="order-row-meta"><span class="pill priority">${esc(order.cancelled?'Đã hủy':stages[order.stage].label)}</span><span>Hẹn ${dateLabel(order.due)}</span></span>${icon('chevron')}</button>`).join(''):'<div class="panel empty">Không có đơn trong lựa chọn này.</div>';
    const host=$('#order-list'),previous=[...host.children],byKey=new Map(previous.map(node=>[node.dataset.order,node])),focus=document.activeElement?.dataset.order;
    const template=document.createElement('template');template.innerHTML=html;
    const nodes=[...template.content.children].map(node=>{const old=byKey.get(node.dataset.order);return old?.outerHTML===node.outerHTML?old:node;});
    if(previous.length!==nodes.length||nodes.some((node,index)=>node!==previous[index])){host.replaceChildren(...nodes);if(focus)[...host.children].find(node=>node.dataset.order===focus)?.focus({preventScroll:true});}
  }
  function openOrder(token) {
    const order=state.orders.find(order=>order.token===token);if(!order)return;
    state.selectedToken=token;const dialog=$('#detail-dialog');
    dialog.innerHTML=`<div class="dialog-header"><div><span class="eyebrow">ĐƠN CUSTOM · CHI TIẾT</span><h2 id="dialog-title">${esc(order.id)} · ${esc(order.customer)}</h2></div><button class="btn-icon-only" data-close-dialog aria-label="Đóng chi tiết đơn">${icon('close')}</button></div><div class="status-line">${icon('clock')}${esc(order.cancelled?'Đã hủy':stages[order.stage].label)}</div>${orderDetails(order)}<div class="detail-bottom">${!order.cancelled?`<button class="btn secondary" data-share="${order.token}">${icon('qr')}QR dành cho khách</button><button class="btn primary" data-track="${order.token}">Xem trang khách${icon('arrow')}</button>`:''}${canManage()&&order.stage===3&&!order.cancelled?`<button class="btn secondary" data-complete="${order.id}">Xác nhận khách nhận hàng</button>`:''}</div>`;
    dialog.showModal();
  }
  async function showQR(token) {
    const order=state.orders.find(order=>order.token===token);if(!order)return;
    try {await ensureTracking(order);}catch(error){showError(error);return;}
    $('#detail-dialog').close();const dialog=$('#share-dialog');
    dialog.innerHTML=`<div class="dialog-header"><h2 id="share-title">Gửi khách hành trình đơn</h2><button class="btn-icon-only" data-close-dialog aria-label="Đóng mã QR">${icon('close')}</button></div>${qrHTML(order)}`;
    dialog.showModal();renderQRCode($('.qr-code',dialog),order);
  }
  function customerHTML() {
    const order=selectedOrder();
    if(!order)return unavailableHTML();
    const stage=order.cancelled?{...stages[0],headline:'Đơn đã hủy.',description:'Đơn hàng này đã được hủy. Bạn có thể nhắn cửa hàng nếu cần hỗ trợ.',label:'Đã hủy'}:stages[order.stage];
    return `<main class="customer-page"><header class="customer-header"><div class="store-brand">${brand()}<span class="brand-divider"></span><small>BÁNH MÌ<br>STATIONERY</small></div><a class="btn secondary" href="${FACEBOOK}" target="_blank" rel="noopener noreferrer">${icon('facebook')}Nhắn cửa hàng${icon('arrow')}</a></header><section class="customer-hero" aria-labelledby="customer-title"><div class="hero-copy"><span class="eyebrow">CHÀO ${esc(order.customer)} · ${esc(order.id)}</span><h1 id="customer-title">${stage.headline}</h1><p>${stage.description}</p><span class="hero-status"><i></i>${stage.label}</span></div>${journeyArt(order.cancelled?0:order.stage)}</section><section class="arrival-strip"><div class="arrival-date">${icon('calendar')}<div><small>${order.stage===4?'Ngày hẹn của đơn':'Ngày hẹn '+(order.delivery==='pickup'?'nhận tại cửa hàng':'giao hàng')}</small><strong>${dateLabel(order.due)}</strong></div></div><p>${order.stage===4?'Cảm ơn bạn đã đặt hàng tại Bánh Mì Stationery.':'Nếu lịch hẹn có thay đổi, cửa hàng sẽ liên hệ với bạn để xác nhận.'}</p></section><div class="customer-columns"><section class="journey-section"><div class="section-top"><h2>Hành trình món đồ của bạn</h2><small>Đơn custom</small></div><ol class="timeline">${stages.map((item,index)=>`<li class="${index<order.stage?'complete':index===order.stage?'current':'future'}" ${index===order.stage?'aria-current="step"':''}><span class="timeline-marker">${index<order.stage?icon('check'):index===order.stage?icon('clock'):String(index+1).padStart(2,'0')}</span><b>${item.label}</b>${index<=order.stage?`<p>${item.detail}</p>${index===0?`<time datetime="${order.created}">${dateLabel(order.created)}</time>`:''}`:''}</li>`).join('')}</ol></section><aside><section class="customer-order"><span class="eyebrow">ĐÃ CHỐT CÙNG BẠN</span><h2>Món đồ của ${esc(order.customer)}</h2>${order.lines.map(line=>`<div class="customer-product">${productArt(getModel(line))}<div><b>${esc(getModel(line)?.name)}</b><small>${esc(variantName(line))}${variantName(line)?' · ':''}Số lượng ${esc(line.qty)}</small></div></div><div class="custom-note"><span>YÊU CẦU CUSTOM</span>${esc(line.note)}${partSummary(line)}</div>${line.images.length?`<div class="attachments">${line.images.map((image,index)=>`<div class="attachment"><img src="${esc(image.src)}" alt="Ảnh tham khảo đã chốt ${index+1}"></div>`).join('')}</div>`:''}`).join('')}<div class="rule"></div><div class="money-row"><span>Tổng tiền</span><b>${money(order.total)}</b></div><div class="money-row"><span>Đã cọc</span><b>${money(order.deposit)}</b></div><div class="money-row total"><span>Còn lại</span><b>${money(order.total-order.deposit)}</b></div></section><div class="customer-contact"><a class="btn secondary" href="${FACEBOOK}" target="_blank" rel="noopener noreferrer">${icon('facebook')}Nhắn Bánh Mì Stationery${icon('arrow')}</a><p>Cần hỏi thêm? Gửi mã ${esc(order.id)}<br>để cửa hàng hỗ trợ bạn nhanh hơn.</p></div></aside></div><footer class="customer-footer">${brand()}<span>Một món đồ riêng, một chút niềm vui mỗi ngày.<br>Bánh Mì Stationery · Made with care.</span></footer><p class="public-updated" id="public-updated" role="status">Tiến độ được cập nhật tự động khi trang đang mở.</p></main>`;
  }
  async function addImages(input) {
    const line=state.draft.lines.find(line=>line.id===input.dataset.files);if(!line)return;
    const selected=Array.from(input.files||[]);if(!selected.length)return;
    if(line.images.length+selected.length>4){toast('Mỗi dòng tối đa 4 ảnh tham khảo.');input.value='';return;}
    if(selected.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024)){toast('Chọn ảnh JPG, PNG hoặc WebP, không quá 2 MB mỗi ảnh.');input.value='';return;}
    input.disabled=true;
    try {
      const images=await Promise.all(selected.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({id:uid(),name:file.name,src:reader.result,type:file.type});reader.onerror=()=>reject(Error('Không đọc được ảnh.'));reader.readAsDataURL(file);})));
      if(!state.draft.lines.includes(line))return;
      line.images.push(...images);state.draft.checked=false;persist();
      const holder=$(`#images-${line.id}`);if(holder)holder.innerHTML=imageHTML(line);toast(`Đã thêm ${images.length} ảnh vào nháp.`);
    } catch {toast('Không đọc được ảnh. Nháp vẫn được giữ; thử chọn lại.');}
    finally {input.disabled=false;input.value='';}
  }
  function actorName(){return session?.user?.user_metadata?.full_name||session?.user?.email?.split('@')[0]||'Nhân viên';}
  function canCreate(){return workspace?.owner_user_id===session?.user?.id||(workspace?.permissions||[]).some(permission=>['orders.manage','custom_orders.create'].includes(permission));}
  function canManage(){return workspace?.owner_user_id===session?.user?.id||workspace?.role!=='store_custom'&&(workspace?.permissions||[]).includes('orders.manage');}
  function actorInitials(){return actorName().split(/\s+/).slice(-2).map(value=>value[0]||'').join('').toUpperCase();}
  function eligibleParts(line){const model=getModel(line),variant=model?.variants?.find(item=>item?.id===line.variantId);return (model?.parts||[]).filter(part=>!Array.isArray(variant?.partIds)||variant.partIds.includes(part.id));}
  function originalColorIds(line,part){
    const variant=getModel(line)?.variants?.find(item=>item.id===line.variantId),ids=variant?.partColors?.[part.id];
    return Array.isArray(ids)&&ids.length?ids.filter(Boolean):Array.isArray(part.filamentIds)?part.filamentIds.filter(Boolean):part.filamentId?[part.filamentId]:[];
  }
  const keyboardProfile=line=>window.CustomKeyboardPreview?.profile(line,getModel(line));
  function keyboardError(line){
    if(getModel(line)?.keyboardProfile&&!window.CustomKeyboardPreview)return 'Chưa tải được công cụ bàn phím. Nháp vẫn được giữ; tải lại trang để thử lại.';
    return window.CustomKeyboardPreview?.validation(line,keyboardProfile(line),window.getFil)||'';
  }
  function paintKeyboards(changed){
    for(const line of changed?[changed]:state.draft.lines){const p=keyboardProfile(line),holder=$(`[data-keyboard-line="${line.id}"]`);if(p&&holder)void window.CustomKeyboardPreview.paint(holder,line,p,window.getFil);}
  }
  function resolvedColorIds(line,part){
    const p=keyboardProfile(line);
    if(p&&line.keyboard){const ids=window.CustomKeyboardPreview.ids(line,p);if(part.id===p.partIds.tray&&ids.tray)return [ids.tray];if(part.id===p.partIds.keys&&(ids.buttons||ids.characters))return [...new Set([ids.buttons,ids.characters].filter(Boolean))];}
    const override=line.colorChoices?.[part.id];return override?[override]:originalColorIds(line,part);
  }
  function originalColorLabel(line,part){return originalColorIds(line,part).map(id=>window.getFil(id)?.name||'Màu không còn trong thư viện').join(' + ')||'Chưa chỉ định';}
  function partFields(line){
    const p=keyboardProfile(line),keyboard=p?window.CustomKeyboardPreview.fields(line,p,window.fils):'';
    const parts=eligibleParts(line).filter(part=>!p||![p.partIds.tray,p.partIds.keys].includes(part.id));if(!parts.length)return keyboard;
    return keyboard+`<fieldset class="part-colors"><legend>Màu part · chỉ chọn khi cần đổi</legend>${parts.map(part=>{
      const ids=originalColorIds(line,part),label=originalColorLabel(line,part);
      return `<label class="part-color-field"><span>${esc(part.name)}</span><select class="br-color-native" data-part="${esc(part.id)}" data-part-line="${line.id}" aria-label="Màu part ${esc(part.name)}"><option value="" data-filament-id="${esc(ids.length===1?ids[0]:'')}">Giữ màu gốc: ${esc(label)}</option>${window.fils.map(fil=>`<option value="${esc(fil.id)}" ${line.colorChoices?.[part.id]===fil.id?'selected':''}>${esc([fil.brand,fil.name,fil.mat].filter(Boolean).join(' · '))}</option>`).join('')}</select></label>`;
    }).join('')}</fieldset>`;
  }
  function partSummary(line){
    const p=keyboardProfile(line),roles=p&&line.keyboard?window.CustomKeyboardPreview.ids(line,p):null;
    const rows=line.partColors||eligibleParts(line).flatMap(part=>{
      if(roles&&[p.partIds.tray,p.partIds.keys].includes(part.id))return (part.id===p.partIds.tray?['tray']:['buttons','characters']).map(role=>{const fil=window.getFil(roles[role]),sourceIds=p.sourceColorIds?.[role==='tray'?'tray':'keys']||[];return {partName:window.CustomKeyboardPreview.labels[role],...fil,...(!fil&&sourceIds.length>1?{name:'Màu gốc: '+sourceIds.map(id=>window.getFil(id)?.name||'Màu không còn trong thư viện').join(' + ')}:{})};});
      const ids=resolvedColorIds(line,part);return ids.length?ids.map(id=>({partName:part.name,...window.getFil(id)})):[{partName:part.name}];
    });
    const text=line.keyboard?.text?`<p class="keyboard-confirmed-text"><b>Ký tự:</b> ${esc(line.keyboard.text)}</p>`:'';
    return text+(rows.length?`<div class="part-summary">${rows.map(row=>`<span><i style="background:${/^#[a-f0-9]{3,8}$/i.test(row.hex||'')?row.hex:'#9eaa9a'}"></i><b>${esc(row.partName)}</b> · ${esc(row.name||'Chưa chỉ định')}</span>`).join('')}</div>`:'');
  }
  let saveTimer,dirtyVersion=0,savedVersion=0;
  function snapshot(){return structuredClone({draft:state.draft,step:state.step,pending:state.pending||null,theme:state.theme,models:[...modelIndex.values()].slice(-600),fils:window.fils});}
  function persistState(){
    if(PUBLIC||!scope)return;dirtyVersion++;clearTimeout(saveTimer);
    const hint=$('.draft-hint');if(hint)hint.textContent='Đang giữ nháp trên thiết bị…';
    saveTimer=setTimeout(()=>{void flushSave();},200);
  }
  function flushSave(){
    clearTimeout(saveTimer);const owner=scope,value=snapshot(),version=dirtyVersion;
    writeChain=writeChain.then(async()=>{
      if(!owner)return false;
      try{await CustomOrderStore.save(owner,value);if(scope===owner){storageAvailable=true;savedVersion=version;const hint=$('.draft-hint');if(hint&&savedVersion===dirtyVersion)hint.textContent='Đã giữ nháp trên thiết bị theo tài khoản và xưởng.';}return true;}
      catch{if(scope===owner){storageAvailable=false;toast('Chưa lưu được nháp trên thiết bị. Giữ trang đang mở và thử lại; đơn chưa được gửi.');}return false;}
    });return writeChain;
  }
  async function rpc(name,args){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
  const showError=error=>toast(error?.message||'Chưa tải được dữ liệu. Vui lòng thử lại.');
  async function loadCatalog(query='',more=false){
    if(state.offline){paintCatalog(query);$('#result-count')?.replaceChildren(document.createTextNode('Model đã lưu trên thiết bị'));if($('#more-models'))$('#more-models').hidden=true;return;}
    const generation=++catalogSequence,owner=scope;
    const data=await rpc('custom_order_catalog',{w:workspace.workspace_id,q:query,off:more?models.length:0});
    if(owner!==scope||generation!==catalogSequence)return;
    models=more?models.concat(data.models):data.models;models.forEach(model=>modelIndex.set(model.id,model));catalogTotal=data.total;
    // Cache-first drafts may predate recipe fields. Update only labels, preserving form DOM.
    for(const line of state.draft.lines)for(const part of eligibleParts(line)){
      const select=$('select[data-part-line="'+line.id+'"][data-part="'+CSS.escape(part.id)+'"]');
      if(!select)continue;const ids=originalColorIds(line,part),option=select.options[0];
      option.textContent='Giữ màu gốc: '+originalColorLabel(line,part);option.dataset.filamentId=ids.length===1?ids[0]:'';
    }
    window.FilamentPickers?.init($('#selected-lines'));
    for(const line of state.draft.lines){
      const p=keyboardProfile(line),article=$(`[data-line="${line.id}"]`);
      if(p&&article&&!article.querySelector('.keyboard-custom')){
        const old=article.querySelector('.part-colors');if(old)old.outerHTML=partFields(line);else article.querySelector('.line-header')?.insertAdjacentHTML('afterend',partFields(line));
        window.FilamentPickers?.init(article);
      }
    }
    paintKeyboards();
    if($('#catalog')){paintCatalog(query);$('#result-count').textContent=`${catalogTotal} kết quả${catalogTotal>models.length?' · đang hiện '+models.length:''}`;$('#more-models').hidden=models.length>=catalogTotal;}
  }
  async function signImages(order){
    const refs=(order.lines||[]).flatMap(line=>line.images||[]).filter(image=>image.path&&!image.src);
    if(!refs.length)return order;
    const {data,error}=await client.storage.from('custom-order-media').createSignedUrls(refs.map(image=>image.path),300);
    if(!error)for(const image of refs)image.src=data?.find(row=>row.path===image.path)?.signedUrl||'';
    return order;
  }
  let listSequence=0;
  async function loadOrders(more=false){
    if(state.offline){if($('#order-list'))renderOrderList();return;}
    const generation=++listSequence,owner=scope;
    const result=await rpc('custom_order_list',{w:workspace.workspace_id,off:more?state.orders.length:0,q:state.area==='orders'?state.query:''});
    const rows=await Promise.all(result.orders.filter(Boolean).map(async order=>({...await signImages(order),token:order.id})));
    if(owner!==scope||generation!==listSequence)return;
    const previous=new Map(state.orders.map(order=>[order.id,order]));
    for(const row of rows)row.trackingToken=previous.get(row.id)?.trackingToken;
    state.orders=more?state.orders.concat(rows):rows;orderTotal=result.total;
    if(state.area==='orders'&&$('#order-list')){renderOrderList();$('#more-orders').hidden=state.orders.length>=orderTotal;}
  }
  async function ensureTracking(order){
    if(!order.trackingToken){const token=await rpc('custom_order_tracking',{w:workspace.workspace_id,oid:order.id});if(!token)throw Error('Đơn này không có link theo dõi đang hoạt động.');order.trackingToken=token;}
    return order.trackingToken;
  }
  async function openCustomer(id){
    if(PUBLIC)return;const order=state.orders.find(row=>row.token===id);if(!order)return;
    try{await ensureTracking(order);location.href=trackingURL(order);}catch(error){showError(error);}
  }
  function pendingHTML(){return `<section class="panel"><div class="section-top"><div><span class="eyebrow">ĐƠN CHỜ MÁY CHỦ XÁC NHẬN</span><h1>${saving?'Đang gửi yêu cầu của khách…':'Đơn đang được giữ trên thiết bị.'}</h1></div>${icon('clock')}</div><p class="muted">${saving?'Ảnh và thông tin đang được gửi. Bạn có thể giữ trang mở để nhận mã QR.':'Khi có mạng, trang sẽ tự gửi lại cùng mã yêu cầu để tránh tạo trùng. Chưa có xác nhận từ máy chủ.'}</p>${orderDetails(state.pending?.draft||state.draft)}<div class="form-actions"><button class="btn secondary" data-action="orders">Xem đơn đã tạo</button><button class="btn primary" data-action="retry" ${saving?'disabled':''}>Thử gửi lại${icon('arrow')}</button></div></section>`;}
  async function queueOrder(){
    if(saving||state.pending||!state.draft.checked)return;
    const draft=structuredClone(state.draft);
    for(const line of draft.lines){const error=keyboardError(line);if(error){toast(error);return;}if(eligibleParts(line).some(part=>resolvedColorIds(line,part).some(id=>!window.getFil(id)))){toast('Kiểm tra lại màu gốc hoặc chọn màu thay thế trước khi tạo đơn.');return;}}
    state.pending={requestId:uid(),draft,uploads:{},scope};dirtyVersion++;
    const submit=$('#submit-order');if(submit){submit.disabled=true;submit.textContent='Đang giữ yêu cầu…';}
    if(!await flushSave()){state.pending=null;render();return;}
    state.area='pending';render();void drainPending();
  }
  async function drainPending(){
    if(saving||!state.pending||!navigator.onLine||!session||state.offline)return;
    const entry=state.pending,owner=scope;if(entry.scope!==owner)return;
    saving=true;if(state.area==='pending')render();
    try{
      const payload={customer:entry.draft.customer,phone:entry.draft.phone,delivery:entry.draft.delivery,address:entry.draft.address,total:String(entry.draft.total),deposit:String(entry.draft.deposit),due:entry.draft.due,lines:[]};
      for(const line of entry.draft.lines){
        const images=[];
        for(const image of line.images){
          const key=`${line.id}/${image.id}`;
          if(!entry.uploads[key]){
            const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[image.type];if(!ext)throw Error('Ảnh tham khảo không hợp lệ.');
            const path=`${workspace.workspace_id}/${session.user.id}/${entry.requestId}/${line.id}-${image.id}.${ext}`;
            const blob=await(await fetch(image.src)).blob();if(scope!==owner)return;
            const {error}=await client.storage.from('custom-order-media').upload(path,blob,{contentType:image.type,upsert:false});
            if(error&&String(error.statusCode)!=='409'&&!/already exists|duplicate/i.test(error.message))throw error;
            entry.uploads[key]=path;if(!await flushSave())throw Error('Chưa giữ được trạng thái tải ảnh. Thử lại khi bộ nhớ thiết bị sẵn sàng.');
          }
          images.push({path:entry.uploads[key],name:image.name});
        }
        payload.lines.push({modelId:line.modelId,modelRevision:line.model.revision,variantId:line.variantId,qty:line.qty,note:line.note,colorChoices:line.colorChoices||{},images,...(line.keyboard?{keyboard:line.keyboard}:{})});
      }
      if(scope!==owner)return;
      const result=await rpc('commit_custom_order',{w:workspace.workspace_id,request:entry.requestId,p:payload});
      if(scope!==owner)return;
      const order=await signImages(result.order);if(scope!==owner)return;
      order.token=order.id;order.trackingToken=result.token;
      state.orders=[order,...state.orders.filter(row=>row.id!==order.id)];orderTotal=Math.max(orderTotal,state.orders.length);state.selectedToken=order.token;
      state.pending=null;state.draft=freshDraft();state.step=0;state.area='success';await flushSave();
      toast('Máy chủ đã xác nhận tạo đơn. Mã QR đã sẵn sàng.');
    }catch(error){
      if(scope!==owner)return;
      if(['40001','P0001','22P02','22008'].includes(error.code)){
        state.draft=entry.draft;state.draft.checked=false;state.pending=null;state.step=0;state.area='create';await flushSave();
      }
      showError(error);
    }finally{saving=false;if(scope===owner)render();}
  }
  function unavailableHTML(){return `<main class="broken-link">${icon('link')}<h1>Chưa mở được đơn hàng.</h1><p>Kiểm tra lại đường dẫn hoặc nhắn Bánh Mì Stationery để được hỗ trợ.</p><div class="form-actions"><button class="btn secondary" data-action="public-retry">Thử lại</button><a class="btn primary" href="${FACEBOOK}" target="_blank" rel="noopener noreferrer">Nhắn cửa hàng${icon('arrow')}</a></div></main>`;}
  let publicSequence=0,publicSignature='';
  async function loadPublic(){
    const generation=++publicSequence,token=location.hash.slice(1);if(!/^[a-f0-9]{64}$/.test(token)){app.innerHTML=unavailableHTML();return;}
    try{
      const {data,error}=await client.functions.invoke('custom-order-status',{body:{token}});if(error||!data?.order)throw Error('Chưa cập nhật được tiến độ. Kiểm tra mạng hoặc thử lại.');
      if(generation!==publicSequence||token!==location.hash.slice(1))return;
      const order=data.order;order.token=token;const signature=JSON.stringify({...order,lines:order.lines.map(line=>({...line,images:line.images.map(image=>({name:image.name}))}))});
      if(signature!==publicSignature){state.orders=[order];state.selectedToken=token;state.view='customer';publicSignature=signature;const position=scrollY;render();window.scrollTo({top:position,behavior:'instant'});}
      if($('#public-updated'))$('#public-updated').textContent='Đã cập nhật từ cửa hàng · '+new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'}).format(new Date());
    }catch(error){if(generation!==publicSequence)return;if(!state.orders.length)app.innerHTML=unavailableHTML();else if($('#public-updated'))$('#public-updated').textContent='Chưa cập nhật được dữ liệu mới. Đang giữ tiến độ đã nhận trước đó.';}
  }
  async function installAdapter(){
    window.fils=[];window.getFil=id=>window.fils.find(fil=>fil.id===id);window.esc=esc;window.appIcon=icon;window.fuzzyTextMatch=(value,query)=>{
      const hay=normalized(value),terms=normalized(query).trim().split(/\s+/),words=hay.split(/\s+/);
      return hay.includes(terms.join(' '))||terms.every(term=>term.length<=2?words.includes(term):words.some(word=>word.includes(term)));
    };
    $('#theme-toggle').innerHTML=icon('moon');
    document.addEventListener('error',event=>{if(event.target?.tagName==='IMG'){event.target.hidden=true;event.target.parentElement.classList.add('image-failed');}},true);
    if(PUBLIC){state.view='customer';booted=true;await loadPublic();refreshTimer=setInterval(()=>{if(!document.hidden)void loadPublic();},30000);return;}
    try{
      const {data,error}=await client.auth.getSession();if(error)throw error;session=data.session;
      if(!session){location.replace('plate-studio.html?next=custom-orders');return;}
      const restore=async()=>{
        scope=`${workspace.workspace_id}:${session.user.id}`;let saved;
        try{saved=await CustomOrderStore.load(scope);}catch{storageAvailable=false;}
        if(saved?.draft&&Array.isArray(saved.draft.lines)){state.draft=saved.draft;state.pending=saved.pending;state.step=Math.min(2,Math.max(0,saved.step||0));state.theme=saved.theme==='dark'?'dark':'light';window.fils=saved.fils||[];models=saved.models||[];models.forEach(model=>modelIndex.set(model.id,model));}
      };
      const identity=await CustomOrderStore.load('identity:'+session.user.id).catch(()=>null);
      if(identity?.workspace){workspace=identity.workspace;state.offline=true;await restore();state.view='staff';state.area=state.pending?'pending':canCreate()?'create':'orders';booted=true;render();}
      const reconnect=async()=>{
        let timeout;const result=await Promise.race([rpc('ensure_workspace_membership',{}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Chưa kết nối được cửa hàng.')),8000);})]).finally(()=>clearTimeout(timeout));
        const remote=Array.isArray(result)?result[0]:result;
        if(!remote||!(remote.owner_user_id===session.user.id||(remote.permissions||[]).some(permission=>['orders.manage','custom_orders.create','custom_orders.view'].includes(permission)))){scope='';throw Object.assign(Error('Tài khoản chưa được cấp quyền nhận hoặc xem đơn custom.'),{code:'42501'});}
        await CustomOrderStore.save('identity:'+session.user.id,{workspace:remote}).catch(()=>{});
        if(workspace&&workspace.workspace_id!==remote.workspace_id){await flushSave();location.reload();return;}
        workspace=remote;state.offline=false;if(!booted)await restore();
        window.fils=await rpc('custom_order_filaments',{w:workspace.workspace_id});await Promise.all([loadCatalog($('#model-search')?.value||''),loadOrders()]);
        if(!booted){state.view='staff';state.area=state.pending?'pending':canCreate()?'create':'orders';booted=true;render();}else $('.offline-note')?.remove();
        await flushSave();void drainPending();
      };
      try{await reconnect();}catch(error){if(error.code==='42501'||!booted)throw error;state.offline=true;render();}
      const initialOrder=new URLSearchParams(location.search).get('order');
      if(initialOrder){let order=state.orders.find(row=>row.id===initialOrder);if(!order){order=await rpc('custom_order_get',{w:workspace.workspace_id,oid:initialOrder});if(order){order=await signImages(order);order.token=order.id;state.orders.push(order);}}if(order)openOrder(order.token);}
      client.auth.onAuthStateChange((event,next)=>{if(event==='SIGNED_OUT'||next&&next.user.id!==session.user.id){scope='';session=null;clearInterval(refreshTimer);location.replace('plate-studio.html?next=custom-orders');}else if(next)session=next;});
      const resume=()=>{paintKeyboards();if(state.offline)void reconnect().catch(error=>{if(error.code==='42501'){app.innerHTML='<main class="broken-link"><h1>Quyền truy cập đã thay đổi.</h1><p>Liên hệ chủ xưởng để được cấp lại quyền.</p></main>';}else showError(error);});else{void drainPending();void loadOrders().catch(()=>{});}};
      refreshTimer=setInterval(()=>{if(!document.hidden)resume();},30000);
      window.addEventListener('online',resume);window.addEventListener('focus',resume);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)void drainPending();else void flushSave();});
      window.addEventListener('beforeunload',event=>{if(!storageAvailable||dirtyVersion!==savedVersion){event.preventDefault();event.returnValue='';}});
    }catch(error){app.innerHTML=`<main class="broken-link">${brand()}<h1>Chưa mở được không gian cửa hàng.</h1><p>${esc(error.message||'Kiểm tra mạng và thử lại.')}</p><button class="btn primary" data-action="reload">Thử lại</button><a class="btn secondary" href="plate-studio.html">Về đăng nhập</a></main>`;}
  }
  document.addEventListener('click', async event => {
    const button=event.target.closest('button,a');if(!button)return;
    if(button.id==='theme-toggle'){state.theme=state.theme==='light'?'dark':'light';persist();document.documentElement.dataset.theme=state.theme;button.innerHTML=icon(state.theme==='light'?'moon':'sun');button.setAttribute('aria-label',`Chuyển giao diện ${state.theme==='light'?'tối':'sáng'}`);return;}
    if(button.hasAttribute('data-close-dialog')){button.closest('dialog').close();return;}
    if(button.dataset.model){selectModel(button.dataset.model);return;}
    if(button.dataset.variant){$('.variant-options').querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));const add=$('#add-variant');add.disabled=false;add.dataset.chosenModel=button.dataset.variantModel;add.dataset.variantId=button.dataset.variant;return;}
    if(button.dataset.step!==undefined){changeStep(Number(button.dataset.step));return;}
    if(button.dataset.removeLine){const index=state.draft.lines.findIndex(line=>line.id===button.dataset.removeLine);const line=state.draft.lines[index];if(!line)return;
      if(line.note.trim()||line.images.length){const dialog=$('#confirm-dialog');dialog.innerHTML=`<div class="dialog-header"><h2 id="confirm-title">Bỏ sản phẩm khỏi đơn?</h2><button class="btn-icon-only" data-close-dialog aria-label="Đóng xác nhận">${icon('close')}</button></div><p>Mô tả và ảnh tham khảo của dòng này sẽ được bỏ khỏi nháp.</p><div class="form-actions"><button class="btn secondary" data-close-dialog>Giữ lại</button><button class="btn primary" data-confirm-remove="${line.id}">Bỏ sản phẩm</button></div>`;dialog.showModal();return;}
      removeLine(line.id);return;
    }
    if(button.dataset.confirmRemove){$('#confirm-dialog').close();removeLine(button.dataset.confirmRemove);return;}
    if(button.dataset.removeImage){const line=state.draft.lines.find(line=>line.id===button.dataset.removeImage);line.images.splice(Number(button.dataset.index),1);state.draft.checked=false;persist();$(`#images-${line.id}`).innerHTML=imageHTML(line);$(`#files-${line.id}`).focus();return;}
    if(button.dataset.qty){const line=state.draft.lines.find(line=>line.id===button.dataset.qty);line.qty=Math.min(9999,Math.max(1,(Number(line.qty)||1)+Number(button.dataset.delta)));$(`[data-quantity="${line.id}"]`).value=line.qty;state.draft.checked=false;persist();renderSummary();return;}
    if(button.dataset.filter){state.filter=button.dataset.filter;$('.order-tabs').querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));renderOrderList();return;}
    if(button.dataset.order){openOrder(button.dataset.order);return;}
    if(button.dataset.share){showQR(button.dataset.share);return;}
    if(button.dataset.complete){const id=button.dataset.complete;if(!confirm('Xác nhận khách đã nhận đủ sản phẩm của đơn này?'))return;try{const order=await rpc('complete_custom_order',{w:workspace.workspace_id,oid:id});const index=state.orders.findIndex(row=>row.id===id);state.orders[index]={...state.orders[index],...order};openOrder(id);toast('Đã xác nhận khách nhận hàng.');}catch(error){showError(error);}return;}
    if(button.dataset.track){route('customer',button.dataset.track);window.scrollTo({top:0,behavior:'instant'});return;}
    if(button.dataset.copy){const order=state.orders.find(order=>order.token===button.dataset.copy);try {await navigator.clipboard.writeText(trackingURL(order));toast('Đã sao chép đường dẫn theo dõi đơn.');}catch{toast('Chưa sao chép được. Chọn đường dẫn dưới mã QR để chép thủ công.');}return;}
    switch(button.dataset.action){
      case 'add-variant': {const modelId=button.dataset.chosenModel,variantId=button.dataset.variantId;$('#detail-dialog').close();addLine(modelId,variantId);break;}
      case 'orders':state.area='orders';state.query='';route('staff');void loadOrders();break;
      case 'create':if(!canCreate()){toast('Tài khoản chỉ có quyền xem đơn custom.');break;}state.area=state.pending?'pending':'create';route('staff');break;
      case 'retry':void drainPending();break;
      case 'reload':location.reload();break;
      case 'refresh':void loadOrders().then(()=>toast('Đã cập nhật tiến độ.')).catch(showError);break;
      case 'more-models':void loadCatalog($('#model-search')?.value||'',true).catch(showError);break;
      case 'more-orders':void loadOrders(true).catch(showError);break;
      case 'public-retry':void loadPublic();break;
      case 'logout':if(!await flushSave()){toast('Chưa giữ được nháp. Hãy thử lại trước khi đăng xuất.');break;}await client.auth.signOut();location.href='plate-studio.html';break;
      case 'login':route('login');break;
      case 'next':changeStep(state.step+1);break;
      case 'back':changeStep(state.step-1);break;
      case 'submit':submitOrder();break;
      case 'toggle-password': {const input=$('#login-password');input.type=input.type==='password'?'text':'password';button.setAttribute('aria-label',input.type==='password'?'Hiện mật khẩu':'Ẩn mật khẩu');break;}
      case 'forgot':toast('Bản tích hợp sẽ giữ luồng khôi phục mật khẩu hiện có. Demo chỉ mô phỏng giao diện.');break;
    }
  });
  function removeLine(id) {
    state.draft.lines=state.draft.lines.filter(line=>line.id!==id);state.draft.checked=false;persist();
    $(`[data-line="${id}"]`)?.remove();
    if(!state.draft.lines.length)renderLines();
    $('#line-count').textContent=`${state.draft.lines.length} dòng`;renderSummary();
    if(!state.draft.lines.length){$('#model-picker').open=true;$('#model-search').focus({preventScroll:true});$('#model-search').scrollIntoView({block:'center',behavior:'instant'});}
    else {const selected=$('#selected-lines .selected-line:last-child');selected?.focus({preventScroll:true});}
  }
  function keepProductFieldVisible(){
    const active=document.activeElement,actions=$('.product-actions');
    if(!actions||!$('#selected-lines')?.contains(active)||!active.matches('textarea,select,button,input:not([type="file"])'))return;
    const field=active.getBoundingClientRect(),viewport=window.visualViewport;
    const top=(viewport?.offsetTop||0)+12,bottom=Math.min(actions.getBoundingClientRect().top-12,(viewport?viewport.offsetTop+viewport.height:innerHeight)-12);
    const delta=field.bottom>bottom?field.bottom-bottom:field.top<top?field.top-top:0;
    if(delta)window.scrollBy({top:delta,behavior:'instant'});
  }
  productWide.addEventListener('change',()=>{
    const picker=$('#model-picker');if(!picker)return;
    const focused=picker.contains(document.activeElement);
    picker.open=productWide.matches||!state.draft.lines.length;
    if(!picker.open&&focused)picker.querySelector('summary').focus({preventScroll:true});
  });
  document.addEventListener('focusin',()=>requestAnimationFrame(keepProductFieldVisible));
  window.addEventListener('resize',()=>requestAnimationFrame(keepProductFieldVisible));
  window.visualViewport?.addEventListener('resize',()=>requestAnimationFrame(keepProductFieldVisible));
  document.addEventListener('keydown',event=>{
    const picker=$('#model-picker');
    if(event.key==='Escape'&&!event.defaultPrevented&&picker?.open&&state.draft.lines.length&&picker.contains(document.activeElement)&&!document.querySelector('dialog[open]')){
      picker.open=false;picker.querySelector('summary').focus({preventScroll:true});event.preventDefault();
    }
  });
  document.addEventListener('input', event => {
    const input=event.target;
    if(input.dataset.keyboardText){const line=state.draft.lines.find(line=>line.id===input.dataset.keyboardText),p=keyboardProfile(line);if(!line||!p)return;window.CustomKeyboardPreview.init(line,p).text=input.value;state.draft.checked=false;persist();paintKeyboards(line);return;}
    if(input.id==='model-search'){renderCatalog(input.value);return;}
    if(input.id==='order-search'){state.query=input.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>void loadOrders().catch(showError),180);return;}
    if(input.dataset.note){const line=state.draft.lines.find(line=>line.id===input.dataset.note);line.note=input.value;state.draft.checked=false;persist();return;}
    if(input.dataset.quantity){const line=state.draft.lines.find(line=>line.id===input.dataset.quantity);line.qty=Number(input.value);state.draft.checked=false;persist();renderSummary();return;}
    if(input.dataset.field){state.draft[input.dataset.field]=input.value;state.draft.checked=false;persist();renderSummary();if($('#form-error'))$('#form-error').hidden=true;}
  });
  document.addEventListener('change',event=>{
    const input=event.target;
    if(input.dataset.keyboardRole){const line=state.draft.lines.find(line=>line.id===input.dataset.keyboardLine),p=keyboardProfile(line);if(!line||!p)return;const k=window.CustomKeyboardPreview.init(line,p);if(input.value)k.colors[input.dataset.keyboardRole]=input.value;else delete k.colors[input.dataset.keyboardRole];delete line.colorChoices?.[input.dataset.keyboardRole==='tray'?p.partIds.tray:p.partIds.keys];state.draft.checked=false;persist();paintKeyboards(line);return;}
    if(input.dataset.part){const line=state.draft.lines.find(line=>line.id===input.dataset.partLine);line.colorChoices ||= {};if(input.value)line.colorChoices[input.dataset.part]=input.value;else delete line.colorChoices[input.dataset.part];state.draft.checked=false;persist();paintKeyboards(line);return;}
    if(input.name==='delivery'){state.draft.delivery=input.value;state.draft.checked=false;persist();$('#address-field').hidden=input.value!=='delivery';}
    if(input.id==='review-confirm'){state.draft.checked=input.checked;persist();$('#submit-order').disabled=!input.checked;}
    if(input.dataset.files)addImages(input);
    if(input.dataset.quantity){const line=state.draft.lines.find(line=>line.id===input.dataset.quantity);line.qty=Math.min(9999,Math.max(1,Math.round(Number(input.value)||1)));input.value=line.qty;persist();renderSummary();}
  });
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
  window.addEventListener('hashchange',()=>{if(PUBLIC)void loadPublic();else readRoute();});
  installAdapter();
})();
