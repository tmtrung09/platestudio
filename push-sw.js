/* Plate Studio — service worker cho thông báo đẩy. */
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
