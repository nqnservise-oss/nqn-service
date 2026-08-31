const CACHE='nqn-service-v8-offline';
const APP_SHELL=['./','./index.html','./NQN_SERVICE_ESTABLE.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];

async function precache(){
  const cache=await caches.open(CACHE);
  await Promise.all(APP_SHELL.map(async path=>{
    try{
      const req=new Request(path,{cache:'reload'});
      const res=await fetch(req);
      if(res&&res.ok)await cache.put(path,res.clone());
    }catch(e){}
  }));
}

self.addEventListener('install',event=>{
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('nqn-service-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

async function navigationResponse(request){
  const cache=await caches.open(CACHE);
  const cached=await cache.match('./index.html');
  if(cached){
    // Actualiza en segundo plano, pero entrega inmediatamente la copia local.
    fetch(request).then(async res=>{if(res&&res.ok){await cache.put('./index.html',res.clone());await cache.put('./',res.clone())}}).catch(()=>{});
    return cached;
  }
  try{
    const res=await fetch(request);
    if(res&&res.ok){await cache.put('./index.html',res.clone());await cache.put('./',res.clone())}
    return res;
  }catch(e){
    return new Response('<!doctype html><meta charset="utf-8"><title>NQN Service</title><body style="font-family:Arial;padding:30px"><h2>NQN Service</h2><p>No se pudo cargar la copia local. Conectate una vez a internet y volvé a abrir la app.</p></body>',{headers:{'Content-Type':'text/html;charset=utf-8'}});
  }
}

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(req.mode==='navigate'){
    event.respondWith(navigationResponse(req));
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(req,{ignoreSearch:true});
    if(cached)return cached;
    try{
      const res=await fetch(req);
      if(res&&res.ok)await cache.put(req,res.clone());
      return res;
    }catch(e){
      return cache.match('./index.html');
    }
  })());
});

self.addEventListener('message',event=>{
  if(event.data==='SKIP_WAITING')self.skipWaiting();
});
