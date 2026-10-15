/* Standalone approval viewer; shared artwork is also used in the app. */
const PAGE_CARD_DEMOS=window.PlatePageInfoArt.pages;
const root=document.documentElement;
let selectedId=PAGE_CARD_DEMOS.some(page=>page.id===location.hash.slice(1))?location.hash.slice(1):'delivery-builder';
let toastTimer;
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fold=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
function heroMarkup(page){
  return `<article class="info-hero" data-page-id="${page.id}" data-scene="${page.art}" style="--a:${page.tone[0]};--d:${page.tone[1]};--p:${page.tone[2]}"><div class="hero-copy"><div class="hero-eyebrow">${esc(page.eyebrow)}</div><h3>${esc(page.title)}</h3><p>${esc(page.description)}</p><button type="button" class="hero-action" data-demo-action="${esc(page.action)}">${esc(page.action)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></div><div class="hero-art" aria-hidden="true"><svg class="scene" viewBox="0 0 360 210" focusable="false"><ellipse class="ground" cx="180" cy="184" rx="144" ry="15"/>${window.PlatePageInfoArt.scene(page.art)}</svg></div></article>`;
}
const visibilityObserver=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('in-view',entry.isIntersecting)),{rootMargin:'60px'});
function observeScenes(host){host.querySelectorAll('.info-hero').forEach(hero=>visibilityObserver.observe(hero));}
function updateDirectory(){
  const query=fold(document.getElementById('page-search').value.trim());
  const pages=PAGE_CARD_DEMOS.filter(page=>fold(`${page.name} ${page.group} ${page.title}`).includes(query));
  document.getElementById('directory-count').textContent=`${pages.length} / ${PAGE_CARD_DEMOS.length}`;
  document.getElementById('directory-empty').hidden=pages.length>0;
  const nav=document.getElementById('page-directory');
  let previousGroup='';
  nav.innerHTML=pages.map(page=>{
    const group=page.group!==previousGroup?`<div class="directory-group">${esc(page.group)}</div>`:'';previousGroup=page.group;
    return `${group}<button type="button" class="directory-page" data-select-page="${page.id}" ${page.id===selectedId?'aria-current="page"':''}><span class="page-number">${String(PAGE_CARD_DEMOS.indexOf(page)+1).padStart(2,'0')}</span><span>${esc(page.name)}</span></button>`;
  }).join('');
  document.querySelectorAll('.gallery-entry').forEach(entry=>{entry.hidden=!pages.some(page=>page.id===entry.dataset.galleryPage);});
}
function selectPage(id,{focusPreview=false}={}){
  const page=PAGE_CARD_DEMOS.find(page=>page.id===id);if(!page)return;
  const oldHero=document.querySelector('#product-preview .info-hero');if(oldHero)visibilityObserver.unobserve(oldHero);
  selectedId=id;history.replaceState(null,'',`#${id}`);
  document.getElementById('preview-page-name').textContent=`${page.group} / ${page.name}`;
  document.getElementById('preview-index').textContent=`${PAGE_CARD_DEMOS.indexOf(page)+1} / ${PAGE_CARD_DEMOS.length}`;
  document.getElementById('scene-caption').textContent=page.scene;
  const preview=document.getElementById('product-preview');preview.innerHTML=heroMarkup(page);preview.firstElementChild.classList.add('in-view');observeScenes(preview);
  document.querySelectorAll('.directory-page').forEach(button=>{if(button.dataset.selectPage===id)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  if(focusPreview){const title=preview.querySelector('h3');title.tabIndex=-1;title.focus({preventScroll:true});preview.scrollIntoView({block:'nearest',behavior:'instant'});}
}
function setChoice(kind,value){
  root.dataset[kind]=value;
  document.querySelectorAll(`[data-${kind}-choice]`).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset[`${kind}Choice`]===value)));
  if(kind==='view'){
    document.getElementById('single-view').hidden=value!=='single';
    document.getElementById('all-pages').hidden=value!=='all';
  }
}
document.getElementById('all-pages').innerHTML=PAGE_CARD_DEMOS.map(page=>`<div class="gallery-entry" data-gallery-page="${page.id}"><div class="gallery-label"><span>${esc(page.group)} / ${esc(page.name)}</span><button type="button" data-open-page="${page.id}" aria-label="Xem riêng ${esc(page.name)}">Xem riêng</button></div>${heroMarkup(page)}</div>`).join('');
observeScenes(document.getElementById('all-pages'));
document.getElementById('page-search').addEventListener('input',updateDirectory);
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.selectPage){selectPage(button.dataset.selectPage);setChoice('view','single');}
  if(button.dataset.openPage){setChoice('view','single');selectPage(button.dataset.openPage,{focusPreview:true});}
  ['view','device','theme'].forEach(kind=>{if(button.dataset[`${kind}Choice`])setChoice(kind,button.dataset[`${kind}Choice`]);});
  if(button.dataset.demoAction){
    const toast=document.getElementById('demo-toast');toast.textContent=`“${button.dataset.demoAction}” là thao tác minh họa trong bản duyệt.`;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,3500);
  }
});
document.getElementById('motion-toggle').addEventListener('click',event=>{
  const paused=root.dataset.motion!=='paused';root.dataset.motion=paused?'paused':'playing';
  const button=event.currentTarget;button.setAttribute('aria-pressed',String(paused));button.querySelector('span').textContent=paused?'Chạy chuyển động':'Dừng chuyển động';
  button.querySelector('svg').innerHTML=paused?'<path d="m8 5 11 7-11 7z"/>':'<path d="M8 5v14M16 5v14"/>';
});
['previous','next'].forEach(direction=>document.getElementById(`${direction}-page`).addEventListener('click',()=>{
  const index=PAGE_CARD_DEMOS.findIndex(page=>page.id===selectedId);selectPage(PAGE_CARD_DEMOS[(index+(direction==='next'?1:-1)+PAGE_CARD_DEMOS.length)%PAGE_CARD_DEMOS.length].id);
}));
document.getElementById('page-directory').addEventListener('keydown',event=>{
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const buttons=[...document.querySelectorAll('.directory-page')];const index=buttons.indexOf(document.activeElement);if(index<0)return;
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
  event.preventDefault();buttons[next]?.focus();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.getElementById('demo-toast').hidden=true;});
updateDirectory();selectPage(selectedId);
