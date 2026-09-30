const CACHE_NAME = 'nqn-service-v940-cierre-z-loader';
const APP_SHELL = [
  './',
  './index.html',
  './NQN_SERVICE_ESTABLE.html',
  './manifest.webmanifest',
  './turnos.js',
  './cierre-z.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

const CIERRE_LOADER = `
/* nqn-cierre-z-loader */
(function(){
  function loadCierreZ(){
    if(document.querySelector('script[data-nqn-cierre-z]')) return;
    var s=document.createElement('script');
    s.src='./cierre-z.js?v=940';
    s.dataset.nqnCierreZ='1';
    s.defer=true;
    document.head.appendChild(s);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',loadCierreZ);
  else loadCierreZ();
})();
`;

function appendCierreLoader(js){
  if(js.includes('nqn-cierre-z-loader')) return js;
  return js + '\n' + CIERRE_LOADER;
}

async function fetchFresh(request){
  return fetch(request,{cache:'no-store'});
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for(const url of APP_SHELL){
        try{
          const r=await fetch(url,{cache:'reload'});
          if(r && r.ok) await cache.put(url,r.clone());
        }catch(e){}
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME && k.startsWith('nqn-service-'))
          .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET') return;

  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;

  if(url.pathname.endsWith('/turnos.js')){
    event.respondWith((async()=>{
      try{
        const r=await fetchFresh(req);
        if(!r || !r.ok) throw new Error('network');
        const js=appendCierreLoader(await r.text());
        const modified=new Response(js,{
          status:200,
          headers:{'content-type':'application/javascript; charset=utf-8'}
        });
        const cache=await caches.open(CACHE_NAME);
        cache.put(req,modified.clone()).catch(()=>{});
        return modified;
      }catch(e){
        const cached=await caches.match(req) || await caches.match('./turnos.js');
        if(!cached) throw e;
        const js=appendCierreLoader(await cached.text());
        return new Response(js,{
          status:200,
          headers:{'content-type':'application/javascript; charset=utf-8'}
        });
      }
    })());
    return;
  }

  event.respondWith(
    fetchFresh(req)
      .then(r=>{
        if(r && r.ok){
          const copy=r.clone();
          caches.open(CACHE_NAME).then(c=>c.put(req,copy)).catch(()=>{});
        }
        return r;
      })
      .catch(()=>caches.match(req))
  );
});
