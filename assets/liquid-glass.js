/* Optional @ybouane/liquidglass. Original optics, one disposable mobile instance. */
(()=>{
 'use strict';
 const base=new URL('.',document.currentScript.src),key='ps_liquid_gl';
 let enabled=false,library,instance,proxy,backdrop,target,root,pending=false,timer,idle=0,scrollUntil=0,generation=0,failed=false;
 let savedRootStyle,savedContentStyle;
 const stats={captures:0,starts:0,destroys:0};
 try{enabled=localStorage.getItem(key)==='on';}catch{}
 function renderSettings(){
  const host=document.getElementById('glass-settings');if(!host)return;
  let saved=enabled;try{saved=localStorage.getItem(key)==='on';}catch{}
  host.innerHTML=`<label class="glass-setting-row"><span><b>Liquid Glass</b><small>Kính trong suốt, khúc xạ ánh sáng. Có thể tốn thêm pin.</small></span><input id="glass-preference" type="checkbox" role="switch" aria-label="Liquid Glass" ${saved?'checked':''}></label><p class="glass-setting-note">Lưu trên thiết bị này. Áp dụng khi tải lại trang.</p><p id="glass-setting-status" role="status"></p>`;
  host.querySelector('input').onchange=event=>{
   try{localStorage.setItem(key,event.target.checked?'on':'off');document.getElementById('glass-setting-status').textContent='Đã lưu. Tải lại trang khi hoàn tất công việc để áp dụng.';}
   catch{event.target.checked=!event.target.checked;document.getElementById('glass-setting-status').textContent='Chưa lưu được cài đặt.';}
  };
 }
 const visible=el=>el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
 function surface(){
  if(!enabled||failed||document.hidden||innerWidth>860||visible(document.getElementById('auth-ov'))||document.getElementById('br-multi-cam'))return null;
  const menu=document.querySelector('.more-sheet-ov.show .more-sheet');
  return visible(menu)?menu:document.getElementById('mobile-nav');
 }
 function restoreRoot(){if(root&&savedRootStyle)for(const [name,value] of Object.entries(savedRootStyle)){if(value)root.style.setProperty(name,value);else root.style.removeProperty(name);}const content=document.getElementById('pg-content');if(content&&savedContentStyle)for(const [name,value] of Object.entries(savedContentStyle)){if(value)content.style.setProperty(name,value);else content.style.removeProperty(name);}}
 function dispose(){
  generation++;target?.removeAttribute('data-liquid-ready');target=null;
  if(instance){instance.destroy();instance=null;stats.destroys++;}
  proxy?.remove();backdrop?.remove();proxy=backdrop=null;restoreRoot();
 }
 function position(el){
  const r=el.getBoundingClientRect(),radius=parseFloat(getComputedStyle(el).borderTopLeftRadius)||24;
  const css=`position:fixed;pointer-events:none;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:${el.id==='mobile-nav'?1099:1399};border-radius:${radius}px;isolation:isolate`;
  if(proxy.style.cssText!==css)proxy.style.cssText=css;
  const config=JSON.stringify({cornerRadius:radius,blurAmount:el.id==='mobile-nav'?0:0.25});if(proxy.dataset.config!==config)proxy.dataset.config=config;
 }
 async function captureContent(engine,content){
  if(!content.scrollTop&&!content.scrollLeft){engine.capture.invalidateCache(content);await engine.capture.captureElement(content,true);return;}
  // SVG foreignObject snapshots do not preserve a scroll container's offsets.
  // Capture an inert, offscreen viewport clone; never move the live app content.
  const r=content.getBoundingClientRect(),host=document.createElement('div');host.className='main plate-glass-capture';host.inert=true;host.setAttribute('aria-hidden','true');
  host.style.cssText=`position:fixed!important;left:-100000px!important;top:0!important;width:${r.width}px!important;height:${r.height}px!important;pointer-events:none!important`;
  const clone=content.cloneNode(true);clone.style.cssText+=`;flex:none;width:${r.width}px;height:${r.height}px;overflow:hidden!important;scroll-behavior:auto`;
  for(const node of clone.querySelectorAll('*')){for(const attr of [...node.attributes])if(attr.name.startsWith('on'))node.removeAttribute(attr.name);if(node.matches('script,iframe'))node.remove();}
  for(const child of clone.children)child.style.transform=`translate(${-content.scrollLeft}px,${-content.scrollTop}px) ${child.style.transform||''}`;
  host.append(clone);document.body.append(host);
  try{const canvas=await engine.capture.captureToCanvas(clone,r.width,r.height);if(canvas)engine.capture.cache.set(content,{canvas,w:canvas.width,h:canvas.height});}
  finally{host.remove();}
 }
 async function refresh(){
  if(!enabled||location.protocol==='file:')return;
  const el=surface();if(!el){dispose();return;}
  if(pending)return;
  if(performance.now()<scrollUntil){schedule();return;}
  pending=true;const token=generation;
  try{
   library ||= (await import(new URL('vendor/ybouane-liquidglass.js',base))).LiquidGlass;
   if(token!==generation||!surface())return;
   root=document.querySelector('.main');
   if(!proxy){
    savedRootStyle=Object.fromEntries(['position','user-select','-webkit-user-select'].map(name=>[name,root.style.getPropertyValue(name)]));
    if(getComputedStyle(root).position==='static')root.style.position='relative';
    const content=document.getElementById('pg-content');savedContentStyle=Object.fromEntries(['position','z-index'].map(name=>[name,content.style.getPropertyValue(name)]));content.style.position='relative';content.style.zIndex='0';
    backdrop=document.createElement('canvas');backdrop.width=backdrop.height=1;backdrop.className='plate-glass-backdrop';backdrop.setAttribute('aria-hidden','true');backdrop.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:-1';
    proxy=document.createElement('div');proxy.className='plate-glass-lens';proxy.setAttribute('aria-hidden','true');root.append(backdrop,proxy);
   }
   position(el);const ctx=backdrop.getContext('2d');ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()||'#14151a';ctx.fillRect(0,0,1,1);
   if(!instance){
    const fresh=await library.init({root,glassElements:[proxy]});
    if(token!==generation||!surface()){fresh.destroy();restoreRoot();return;}
    instance=fresh;stats.starts++;
    const content=document.getElementById('pg-content');if(content.scrollTop||content.scrollLeft)await captureContent(instance,content);
    // The library disables selection on its root; native app controls must remain selectable.
    for(const name of ['user-select','-webkit-user-select']){if(savedRootStyle[name])root.style.setProperty(name,savedRootStyle[name]);else root.style.removeProperty(name);}
   }else{
    // Static wrapper content needs cache invalidation; markChanged alone only re-shades.
    const content=document.getElementById('pg-content');
    await captureContent(instance,content);stats.captures++;
   }
   if(token!==generation||!instance)return;
   instance.markChanged();target?.removeAttribute('data-liquid-ready');target=el;target.dataset.liquidReady='';
  }catch(error){failed=true;dispose();console.warn('Liquid Glass: keeping CSS fallback.',error);}
  finally{pending=false;if(token!==generation&&surface())schedule();}
 }
 function cancel(){clearTimeout(timer);if(idle){if(window.cancelIdleCallback)cancelIdleCallback(idle);else clearTimeout(idle);idle=0;}}
 function schedule(){cancel();timer=setTimeout(()=>{const run=()=>{idle=0;void refresh();};idle=window.requestIdleCallback?requestIdleCallback(run,{timeout:1500}):setTimeout(run,32);},Math.max(500,scrollUntil-performance.now()));}
 function sync(){const next=surface();if(!next){cancel();dispose();}else{if(target&&target!==next){target.removeAttribute('data-liquid-ready');target=null;if(proxy)proxy.style.visibility='hidden';}schedule();}}
 function start(){
  renderSettings();if(!enabled)return;
  const content=document.getElementById('pg-content');if(content)new MutationObserver(schedule).observe(content,{childList:true,subtree:true});
  const observer=new MutationObserver(records=>{if(records.some(record=>record.type==='attributes'||[...record.addedNodes,...record.removedNodes].some(node=>!node.classList?.contains('plate-glass-capture'))))sync();});
  for(const el of [document.getElementById('more-sheet-ov'),document.getElementById('auth-ov')])if(el)observer.observe(el,{attributes:true,attributeFilter:['class','style']});
  observer.observe(document.body,{childList:true});
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  document.addEventListener('transitionend',event=>{if(event.target.matches('.more-sheet'))sync();});
  document.addEventListener('scroll',()=>{scrollUntil=performance.now()+500;schedule();},{capture:true,passive:true});
  document.addEventListener('visibilitychange',sync);window.addEventListener('resize',sync,{passive:true});
  window.addEventListener('pagehide',()=>{cancel();dispose();});window.addEventListener('pageshow',sync);sync();
 }
 window.PlateLiquidGlass={refresh,renderSettings,get status(){return {enabled,loaded:!!instance,engine:'ybouane',failed,...stats};}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
