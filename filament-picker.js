/* Shared filament selection. Keep native values/handlers; never infer a selection. */
(() => {
  const selector='#pp-manual-color,.ms-slot select,.br-plan-color select,.of-cr-color-row select,select[onchange="setAiDraftFilament(this.value)"],select.br-color-native';
  let active=null,serial=0,observer;
  // Match known English color names with Vietnamese queries; never infer color from hex.
  const colorAliases={white:'trắng',black:'đen',grey:'xám ghi',gray:'xám ghi',red:'đỏ',green:'xanh xanh lá xanh lá cây',blue:'xanh xanh dương xanh da trời xanh nước biển',yellow:'vàng',orange:'cam',purple:'tím',violet:'tím',pink:'hồng',brown:'nâu',beige:'be kem',ivory:'trắng ngà',cream:'kem',cyan:'xanh lơ',turquoise:'xanh ngọc',teal:'xanh cổ vịt',mint:'xanh bạc hà',olive:'xanh ô liu',navy:'xanh navy xanh đậm',gold:'vàng kim',silver:'bạc',transparent:'trong suốt',clear:'trong suốt',light:'nhạt',dark:'đậm',matte:'mờ lì',silk:'lụa',marble:'vân đá'};
  const searchText=(option,f)=>{
    const name=String(f?.name||'').toLowerCase().replace(/[^a-z]+/g,' ').trim().split(/\s+/);
    const supplierAliases=/^(timory|tinmory|tinmorry)$/i.test(f?.canonicalBrand||f?.brand||'')?'TINMORRY TINMORY TIMORY':'';
    return `${option.textContent} ${f?.brand||''} ${f?.canonicalBrand||''} ${supplierAliases} ${f?.name||''} ${f?.nameVi||''} ${f?.originalName||''} ${f?.mat||''} ${f?.hex||''} ${f?.code||''} ${f?.line||''} ${(f?.paletteRefs||[]).map(r=>[r.vi,r.name,r.code,r.brand,r.line].join(' ')).join(' ')} ${name.map(word=>colorAliases[word]||'').join(' ')}`;
  };
  const details=f=>[f?.nameVi!==f?.name?f?.nameVi:'',f?.originalName!==f?.name?f?.originalName:'',f?.code,f?.line||f?.mat,f?.hex].filter(Boolean).join(' · ');
  const sourceHTML=f=>{
    const methods={'web-swatch':'Swatch trên web hãng','distributor-swatch':'Bảng màu nhà phân phối','photo-sample':'Lấy mẫu từ ảnh sản phẩm'};
    return (f?.paletteRefs||[]).filter(r=>methods[r.method]&&/^https:\/\/(r3dprint\.com|tinmorry\.net|www\.tonyswift3d\.com|www\.cailab3d\.com)\//.test(r.source||'')).map(r=>`<a href="${esc(r.source)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;min-height:44px">${esc([r.brand,r.code,methods[r.method]].filter(Boolean).join(' · '))}</a><div style="font-size:12px;color:var(--t2)">${esc(r.vi)} · HEX tham khảo ${esc(r.hex)} · ${esc(r.checkedDate||'')}</div>`).join('');
  };
  const swatch=f=>/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(f?.hex||'')?f.hex:'repeating-conic-gradient(#999 0 25%,#ddd 0 50%)';
  function refresh(state){
    const option=state.select.selectedOptions[0],filament=getFil(state.select.value||option?.dataset.filamentId);
    state.toggle.disabled=state.select.disabled;
    state.toggle.querySelector('.br-color-picker-dot').style.background=swatch(filament);
    state.toggle.querySelector('.filament-picker-label').textContent=(option?.textContent||'Chưa chỉ định')+(filament?.nameVi&&filament.nameVi!==filament.name?' · '+filament.nameVi:'');
  }
  function results(state,query='',limit=80){
    state.query=query;state.limit=limit;
    const rows=[...state.select.options].map(option=>({option,filament:getFil(option.value||option.dataset.filamentId)})).filter(({option,filament:f})=>!query.trim()||fuzzyTextMatch(searchText(option,f),query));
    state.count.textContent=`${rows.length} lựa chọn${rows.length>limit?' · đang hiện '+limit:''}`;
    state.list.innerHTML=rows.slice(0,limit).map(({option,filament:f})=>{
      const tile=!!option.value&&!!f,full=[option.textContent,f?details(f):''].filter(Boolean).join(' · ');
      return `<button type="button" class="br-color-picker-option${tile?'':' is-default'}${option.value===state.select.value?' selected':''}" role="option" tabindex="-1" aria-label="${esc(full)}" title="${esc(full)}" aria-selected="${option.value===state.select.value}" data-value="${esc(option.value)}" ${option.disabled?'disabled':''}><span class="br-color-picker-dot${tile?' filament-tile-swatch':''}" style="background:${swatch(f)}"></span><span class="br-color-picker-option-copy"><b>${esc(tile?(f.nameVi||f.name):option.textContent)}</b>${tile?`<small>${esc([f.canonicalBrand||f.brand,f.code,f.mat].filter(Boolean).join(' · '))}</small>`:''}</span>${option.value===state.select.value?`<span class="filament-tile-check" aria-hidden="true">${appIcon('check')}</span>`:''}</button>`;
    }).join('')||'<p class="br-color-picker-empty">Không tìm thấy màu phù hợp</p>';
    state.more.hidden=rows.length<=limit;
    state.list.querySelectorAll('[data-value]').forEach(button=>button.onclick=event=>{
      event.preventDefault();event.stopPropagation();
      if(!state.select.isConnected||state.select.disabled)return;
      const id=state.select.id,change=state.select.getAttribute('onchange');
      state.select.value=button.dataset.value;refresh(state);close();
      state.select.dispatchEvent(new Event('change',{bubbles:true}));
      if(!state.toggle.isConnected)requestAnimationFrame(()=>{
        const next=id?document.getElementById(id):[...document.querySelectorAll(selector)].find(el=>el.getAttribute('onchange')===change);
        next?._filamentPicker?.toggle.focus({preventScroll:true});
      });
    });
  }
  function place(){
    if(!active)return;
    const {toggle,menu,list}=active,rect=toggle.getBoundingClientRect();
    if(!toggle.isConnected||!toggle.getClientRects().length){close(false);return;}
    const view=window.visualViewport,leftEdge=view?.offsetLeft||0,topEdge=view?.offsetTop||0,width=view?.width||innerWidth,height=view?.height||innerHeight;
    const widthPx=Math.min(Math.max(rect.width,480),width-24),below=topEdge+height-rect.bottom-12,above=rect.top-topEdge-12;
    const downward=below>=above,room=Math.max(below,above),available=Math.min(560,room<250?height-24:room);
    menu.style.width=widthPx+'px';menu.style.left=Math.max(leftEdge+12,Math.min(rect.left,leftEdge+width-widthPx-12))+'px';
    const style=getComputedStyle(menu),chrome=[...menu.children].filter(el=>el!==list&&!el.hidden).reduce((sum,el)=>sum+el.getBoundingClientRect().height,0)+['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum,key)=>sum+(parseFloat(style[key])||0),0);
    list.style.maxHeight=Math.max(44,available-chrome)+'px';
    const menuHeight=Math.min(menu.getBoundingClientRect().height,available);
    menu.style.top=Math.max(topEdge+8,Math.min(downward?rect.bottom+6:rect.top-menuHeight-6,topEdge+height-menuHeight-8))+'px';
  }
  function close(focus=true){
    if(!active)return;const state=active;active=null;observer?.disconnect();
    state.menu.hidden=true;state.wrapper.classList.remove('open');state.toggle.setAttribute('aria-expanded','false');
    if(state.wrapper.isConnected)state.wrapper.append(state.menu);else state.menu.remove();
    if(focus&&state.toggle.isConnected)state.toggle.focus({preventScroll:true});
  }
  function open(state){
    if(state.toggle.disabled)return;
    if(active===state){close();return;}
    close(false);refresh(state);active=state;results(state);state.input.value='';
    state.wrapper.classList.add('open');state.toggle.setAttribute('aria-expanded','true');
    document.body.append(state.menu);state.menu.hidden=false;place();state.input.focus({preventScroll:true});
    observer ||= new MutationObserver(()=>{if(active&&!active.toggle.isConnected)close(false);});
    observer.observe(document.body,{childList:true,subtree:true});
  }
  function init(root=document){
    if(!root)return;
    const selects=[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
    for(const select of selects){
      if(select._filamentPicker){refresh(select._filamentPicker);continue;}
      const wrapper=document.createElement('div');wrapper.className='br-color-picker filament-picker';
      const label=select.getAttribute('aria-label')||[...select.parentElement.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()||'Màu nhựa';
      const menuId='filament-picker-menu-'+(++serial);
      wrapper.innerHTML=`<button type="button" class="br-color-picker-toggle" aria-label="${esc(label)}" aria-haspopup="dialog" aria-expanded="false" aria-controls="${menuId}"><span class="br-color-picker-dot"></span><span class="filament-picker-label"></span>${appIcon('chevron')}</button><div id="${menuId}" class="br-color-picker-menu filament-menu" role="dialog" aria-label="${esc(label)}" hidden><div class="filament-picker-head"><label class="br-color-picker-search">${appIcon('search')}<input type="search" aria-label="Tìm màu nhựa" placeholder="Tìm tên, hãng, chất liệu, mã màu…" autocomplete="off"></label><button type="button" class="btn btn-ghost btn-icon-only" aria-label="Đóng chọn màu">${appIcon('close')}</button></div><small class="filament-picker-count" role="status"></small><div class="br-color-picker-options" role="listbox" aria-label="${esc(label)}"></div><button type="button" class="filament-picker-more" hidden>Xem thêm màu</button></div>`;
      select.before(wrapper);select.hidden=true;wrapper.prepend(select);
      const state={select,wrapper,toggle:wrapper.querySelector('.br-color-picker-toggle'),menu:wrapper.querySelector('.filament-menu'),input:wrapper.querySelector('input'),count:wrapper.querySelector('.filament-picker-count'),list:wrapper.querySelector('.br-color-picker-options'),more:wrapper.querySelector('.filament-picker-more')};
      select._filamentPicker=state;refresh(state);results(state);
      state.toggle.onclick=event=>{event.preventDefault();event.stopPropagation();open(state);};
      state.input.oninput=()=>{results(state,state.input.value);place();};
      state.more.onclick=()=>{results(state,state.query,state.limit+80);place();};
      state.menu.querySelector('.btn-icon-only').onclick=()=>close();
      state.menu.onclick=event=>event.stopPropagation();
      state.menu.onkeydown=event=>{
        if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        const options=[...state.list.querySelectorAll('button:not(:disabled)')];if(!options.length)return;
        if(['Home','End','ArrowLeft','ArrowRight'].includes(event.key)&&event.target===state.input)return;
        event.preventDefault();const index=options.indexOf(document.activeElement),delta=event.key==='ArrowUp'?-1:1;
        let next=event.key==='Home'?0:event.key==='End'?options.length-1:index<0?(delta>0?0:options.length-1):(index+(event.key==='ArrowLeft'?-1:delta)+options.length)%options.length;
        if(index>=0&&['ArrowUp','ArrowDown'].includes(event.key)){
          const from=options[index].getBoundingClientRect(),rows=options.map((el,i)=>({i,r:el.getBoundingClientRect()})).filter(({r})=>(r.top-from.top)*delta>1);
          if(rows.length){const dy=Math.min(...rows.map(({r})=>Math.abs(r.top-from.top)));next=rows.filter(({r})=>Math.abs(Math.abs(r.top-from.top)-dy)<1).sort((a,b)=>Math.abs(a.r.left+a.r.width/2-from.left-from.width/2)-Math.abs(b.r.left+b.r.width/2-from.left-from.width/2))[0].i;}else next=index;
        }
        options[next].focus({preventScroll:true});options[next].scrollIntoView({block:'nearest'});
      };
      select.addEventListener('change',()=>refresh(state));
    }
  }
  document.addEventListener('keydown',event=>{if(active&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}},true);
  document.addEventListener('pointerdown',event=>{if(active&&!active.menu.contains(event.target)&&!active.wrapper.contains(event.target))close(false);},true);
  document.addEventListener('focusin',event=>{if(active&&!active.menu.contains(event.target)&&!active.wrapper.contains(event.target))close(false);});
  window.addEventListener('resize',place);window.visualViewport?.addEventListener('resize',place);
  document.addEventListener('scroll',event=>{if(active&&!active.menu.contains(event.target))place();},true);
  window.FilamentPickers={init,close,searchText,details,sourceHTML};init();
})();
