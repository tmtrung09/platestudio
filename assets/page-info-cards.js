/* Decorative page cards. Business controls, permissions and counts stay in their renderers. */
(()=>{
  function start(){
    if(window.PlatePageInfoCards||!window.PlatePageInfoArt)return;
    const stylesheet=document.querySelector('link[data-page-info-style]');
    if(stylesheet&&!stylesheet.sheet){stylesheet.addEventListener('load',start,{once:true});return;}
    const art=window.PlatePageInfoArt;
    const records=new Map(art.pages.map(page=>[page.id,page]));
    const existing={dashboard:['#dashboard-command','.dashboard-role-hero,.dash-command-hero'],packaging:['#packaging-page','.packaging-hero'],access:['#access-page','.access-intro'],sales:['#sales-page','.sales-hero']};
    const observed=new WeakSet();
    const tracked=new Set();
    const visuals=new Map();
    const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const icon=kind=>kind==='pause'?'<path d="M8 5v14M16 5v14"/>':kind==='play'?'<path d="m8 5 11 7-11 7z"/>':kind==='guide'?'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>':'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>';
    const svg=kind=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icon(kind)}</svg>`;
    const paused=()=>document.documentElement.dataset.pageInfoMotion==='paused';
    const visibility=new IntersectionObserver(entries=>entries.forEach(entry=>{
      entry.target.classList.toggle('is-art-visible',entry.isIntersecting&&!document.hidden&&!!entry.target.closest('.page.active'));
    }),{rootMargin:'0px'});
    function motionButton(button){
      const label=paused()?'Chạy đồ họa minh họa':'Dừng đồ họa minh họa';
      button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(paused()));
      const kind=paused()?'play':'pause';if(button.dataset.motionIcon!==kind){button.innerHTML=svg(kind);button.dataset.motionIcon=kind;}
    }
    function decorate(card,record){
      card.classList.add('page-info-card');card.dataset.infoPage=record.id;
      card.style.setProperty('--info-a',record.tone[0]);card.style.setProperty('--info-d',record.tone[1]);card.style.setProperty('--info-p',record.tone[2]);
      if(!card.querySelector(':scope > .page-info-art')){
        [...card.children].forEach(child=>child.classList.add('page-info-content'));
        const picture=visuals.get(record.id)?.picture||document.createElement('div');picture.className='page-info-art';picture.setAttribute('aria-hidden','true');
        if(!picture.firstElementChild)picture.innerHTML=`<svg class="scene" viewBox="0 0 360 210" focusable="false"><ellipse class="ground" cx="180" cy="184" rx="144" ry="15"/>${art.scene(record.art)}</svg>`;
        card.append(picture);
      }
      let button=card.querySelector('.page-info-motion');
      if(!button){button=visuals.get(record.id)?.button||document.createElement('button');button.type='button';button.className='btn btn-icon-only page-info-motion';(card.querySelector('.page-info-tools')||card).append(button);}
      visuals.set(record.id,{picture:card.querySelector(':scope > .page-info-art'),button});
      card.querySelectorAll('.dashboard-role-actions button').forEach(action=>{
        if(action.textContent.trim().startsWith('📷')&&!action.querySelector('svg')){
          const label=action.textContent.trim().replace(/^📷\s*/,'');
          action.innerHTML=`${typeof appIcon==='function'?appIcon('batch'):''}<span>${esc(label)}</span>`;
        }
      });
      motionButton(button);
      if(!tracked.has(card)){tracked.add(card);visibility.observe(card);}
    }
    function heading(host,key,meta){
      const record=records.get(key);if(!record||existing[key])return false;
      if(host.dataset.infoPage!==key){
        host.innerHTML=`<div class="page-heading-main"><div class="page-info-copy"><div class="page-heading-eyebrow">${esc(record.group)} / ${esc(record.name)}</div><h1>${esc(record.title)}</h1><p>${esc(record.description)}</p></div><div class="gap-row page-info-tools"><button type="button" class="btn btn-ghost btn-sm page-guide-btn" data-page-guide="${key}" onclick="openPageGuide('${key}')" title="Mở hướng dẫn trang này">${svg('guide')}Hướng dẫn <span class="guide-replay-cue" aria-hidden="true">${svg('play')}</span></button><button type="button" class="btn btn-ghost btn-sm page-layout-btn" onclick="openPageLayoutManager('${key}')" title="Sắp xếp các khối hiển thị">${svg('layout')}Bố cục</button></div></div>`;
      }
      host.classList.add('page-info-heading');decorate(host,record);return true;
    }
    function sync(key){
      const page=document.getElementById(`page-${key}`),record=records.get(key);if(!page||!record)return;
      page.classList.add('page-info-host');
      tracked.forEach(card=>{if(!card.isConnected){visibility.unobserve(card);tracked.delete(card);}else if(!card.closest('.page.active'))card.classList.remove('is-art-visible');});
      const definition=existing[key];
      if(definition){
        const mount=page.querySelector(definition[0]);
        if(mount&&!observed.has(mount)){
          observed.add(mount);
          new MutationObserver(()=>{
            const live=mount.querySelector(definition[1]);
            if(live&&!live.querySelector(':scope > .page-info-art'))decorate(live,record);
            tracked.forEach(card=>{if(!card.isConnected){visibility.unobserve(card);tracked.delete(card);}});
          }).observe(mount,{childList:true});
        }
        const live=page.querySelector(definition[1]);if(live)decorate(live,record);
      }else{
        const host=page.querySelector(':scope > .page-heading');if(host)heading(host,key,{});
      }
      // Reobserve persistent cards when returning to a route without resetting SVG DOM.
      page.querySelectorAll('.page-info-card').forEach(card=>{visibility.unobserve(card);visibility.observe(card);});
    }
    document.addEventListener('click',event=>{
      const button=event.target.closest('.page-info-motion');if(!button)return;
      document.documentElement.dataset.pageInfoMotion=paused()?'playing':'paused';
      document.querySelectorAll('.page-info-motion').forEach(motionButton);
    });
    document.addEventListener('visibilitychange',()=>{
      tracked.forEach(card=>{card.classList.remove('is-art-visible');if(!document.hidden){visibility.unobserve(card);visibility.observe(card);}});
    });
    window.PlatePageInfoCards={heading,sync};
    if(typeof curPage!=='undefined'){
      if(typeof updatePageHeading==='function')updatePageHeading(curPage);
      sync(curPage);
    }
  }
  window.addEventListener('plate-page-info-art-ready',start,{once:true});start();
})();
