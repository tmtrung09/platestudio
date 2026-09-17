/* Optional original liquidGL. Reload applies preferences and releases old GPU resources. */
(()=>{
 'use strict';
 const base=new URL('.',document.currentScript.src),key='ps_liquid_gl';
 let enabled=false,loaded=false,pending=false,timer,library;
 try{enabled=localStorage.getItem(key)==='on';}catch{}
 const lenses=new Map();
 function renderSettings(){
  const host=document.getElementById('glass-settings');if(!host)return;
  let saved=enabled;try{saved=localStorage.getItem(key)==='on';}catch{}
  host.innerHTML=`<label class="glass-setting-row"><span><b>Liquid Glass</b><small>Kính trong suốt, khúc xạ ánh sáng. Có thể tốn thêm pin.</small></span><input id="glass-preference" type="checkbox" role="switch" aria-label="Liquid Glass" ${saved?'checked':''}></label><p class="glass-setting-note">Lưu trên thiết bị này. Áp dụng khi tải lại trang.</p><p id="glass-setting-status" role="status"></p>`;
  host.querySelector('input').onchange=event=>{
   try{localStorage.setItem(key,event.target.checked?'on':'off');document.getElementById('glass-setting-status').textContent='Đã lưu. Tải lại trang khi hoàn tất công việc để áp dụng.';}
   catch{event.target.checked=!event.target.checked;document.getElementById('glass-setting-status').textContent='Chưa lưu được cài đặt.';}
  };
 }
 async function refresh(){
  if(!enabled||pending||location.protocol==='file:')return;
  const nav=document.getElementById('mobile-nav');
  if(!nav?.getClientRects().length)return;
  pending=true;
  try{
   library ||= (await import(new URL('vendor/liquidGL.js',base))).default;
   for(const el of [nav,document.querySelector('.more-sheet')]){
    if(!el||lenses.has(el))continue;
    const proxy=document.createElement('div');proxy.className='plate-glass-lens';proxy.setAttribute('aria-hidden','true');proxy.setAttribute('data-liquid-ignore','');document.body.append(proxy);
    const position=()=>{const r=el.getBoundingClientRect();proxy.style.cssText=`position:fixed;pointer-events:none;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${getComputedStyle(el).borderTopLeftRadius};z-index:1100`;};
    position();proxy.id='plate-glass-'+lenses.size;
    library({target:'#'+proxy.id});lenses.set(el,{proxy,position});
   }
   loaded=true;
   const renderer=window.__liquidGLRenderer__;
   if(renderer){await renderer._backendReady;await renderer.captureSnapshot();
    if(renderer.hasTexture){for(const el of lenses.keys())el.dataset.liquidReady='';}
   }
  }catch(error){console.warn('Liquid Glass unavailable; keeping CSS glass.',error);}
  finally{pending=false;}
 }
 function sync(){for(const {position} of lenses.values())position();clearTimeout(timer);timer=setTimeout(refresh,180);}
 function start(){
  renderSettings();if(!enabled)return;
  const observer=new MutationObserver(sync);
  const menu=document.getElementById('more-sheet-ov');if(menu)observer.observe(menu,{attributes:true,attributeFilter:['class']});
  const nav=document.getElementById('mobile-nav');if(nav)observer.observe(nav,{childList:true});
  document.addEventListener('transitionend',event=>{if(event.target.matches('.more-sheet'))sync();});
  const content=document.getElementById('pg-content');if(content)observer.observe(content,{childList:true,subtree:true});
  document.addEventListener('scroll',sync,{capture:true,passive:true});
  window.addEventListener('resize',sync,{passive:true});
  const theme=new MutationObserver(sync);theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  sync();
 }
 window.PlateLiquidGlass={refresh,renderSettings,get status(){return {enabled,loaded};}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
