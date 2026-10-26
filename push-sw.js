/* Plate Studio — app shell local-first + thông báo đẩy. */
const APP_SHELL_CACHE='plate-studio-shell-v24';
const APP_SHELL=['./assets/app/workshop-swipe-core.js','./assets/app/workshop-swipe-store.js','./assets/app/workshop-swipe.js','./assets/app/workshop-swipe.css','./assets/app/forest-theme.css','./assets/custom-orders/supabase.js','./custom-orders.html','./order-status.html','./assets/custom-orders/custom-orders.css','./assets/custom-orders/live.css','./assets/custom-orders/login.css','./assets/custom-orders/custom-orders.js','./assets/custom-orders/durable-store.js','./assets/custom-orders/qr-code.js','./','./index.html','./plate-studio.html','./printer-monitor.js','./assets/printer-voice.js','./assets/printer-voice/boarding-chime.wav','./assets/printer-voice-policy.js','./assets/printer-voice.css','./assets/printer-alert-art.js','./assets/printer-alert-scenes.css','./assets/printer-alert-art.css','./assets/printer-alerts/hotend-a1.webp','./assets/printer-alerts/hotend-p1.webp','./assets/printer-alerts/hotend-h2.webp','./plate-plan-files.js','./filament-picker.js','./kiot-pending-store.js','./kiot-mapping-sync.js','./manifest.webmanifest','./plate-studio-mark.svg','./assets/camera-boom.mp3','./assets/page-info-art.js','./assets/page-info-cards.js','./assets/page-info-cards.css','./assets/app/shortcut-invite.js','./assets/app/shortcut-invite.css','./assets/app/platedio-icon.svg','./assets/app/platedio-192.png','./assets/app/platedio-512.png','./assets/app/platedio-180.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(APP_SHELL_CACHE).then(cache=>Promise.allSettled(APP_SHELL.map(url=>cache.add(url)))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('plate-studio-shell-')&&key!==APP_SHELL_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  let cacheWrite=Promise.resolve();
  const fresh=fetch(request).then(response=>{
    // Clone synchronously while the response body is still unused.
    if(response.ok){const copy=response.clone();cacheWrite=caches.open(APP_SHELL_CACHE).then(cache=>cache.put(request,copy));}
    return response;
  });
  event.waitUntil(fresh.then(()=>cacheWrite).catch(()=>{}));
  if(request.mode==='navigate'){
    event.respondWith(fresh.catch(async()=>await caches.match(request)||await caches.match('./plate-studio.html')||Response.error()));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>{
    return cached||fresh.catch(async()=>await caches.match(request,{ignoreSearch:true})||Response.error());
  }));
});
self.addEventListener('push', event => {
  let data={title:'Plate Studio',body:'Có cập nhật mới.',url:'./'};
  try{data={...data,...event.data.json()};}catch(_){if(event.data)data.body=event.data.text();}
  event.waitUntil(self.registration.showNotification(data.title,{
    body:data.body,
    icon:'plate-studio-mark.svg',
    badge:'plate-studio-mark.svg',
    tag:data.tag||'plate-studio-update',
    renotify:true,
    data:{url:data.url||'./'},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target=new URL(event.notification.data?.url||'./',self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
    const existing=windows.find(client=>client.url.startsWith(self.location.origin));
    return existing?existing.focus():clients.openWindow(target);
  }));
});
