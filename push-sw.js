/* Plate Studio — app shell local-first + thông báo đẩy. */
const APP_SHELL_CACHE='plate-studio-shell-v3';
const APP_SHELL=['./','./index.html','./plate-studio.html','./printer-monitor.js','./manifest.webmanifest','./plate-studio-mark.svg','./assets/camera-boom.mp3'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(APP_SHELL_CACHE).then(cache=>Promise.allSettled(APP_SHELL.map(url=>cache.add(url)))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('plate-studio-shell-')&&key!==APP_SHELL_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(APP_SHELL_CACHE).then(cache=>cache.put(request,copy));return response;}).catch(async()=>await caches.match(request)||await caches.match('./plate-studio.html')));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>{
    const network=fetch(request).then(response=>{if(response.ok)caches.open(APP_SHELL_CACHE).then(cache=>cache.put(request,response.clone()));return response;});
    return cached||network;
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
