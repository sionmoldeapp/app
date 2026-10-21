const V='sion-v16',F=['./','index.html','manifest.webmanifest','icon.svg','logo-512.png','icon-192.png','badge-96.png','fb.js','fonts.css','fonts/bebas-neue-400-latin.woff2','fonts/yellowtail-400-latin.woff2','fonts/poppins-400-latin.woff2','fonts/poppins-500-latin.woff2','fonts/poppins-600-latin.woff2'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(F))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x))))));
// Raskt og oppdatert: filene fra appen vises med en gang fra hurtigbufferen (appen åpnes uten å vente på nettet),
// og hentes samtidig på nytt i bakgrunnen, så neste åpning har siste versjon. Det virker også uten nett.
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);if(u.origin!==location.origin)return;   // Firebase og andre eksterne adresser går som vanlig
  const nav=e.request.mode==='navigate';
  e.respondWith(caches.open(V).then(async c=>{
    const nøkkel=nav?new Request(u.origin+u.pathname):e.request;
    const treff=await c.match(nøkkel);
    const nett=fetch(e.request,{cache:'no-cache'}).then(r=>{if(r.ok&&r.status===200)c.put(nøkkel,r.clone()).catch(()=>{});return r}).catch(()=>null);
    if(treff){e.waitUntil(nett);return treff}
    return (await nett)||(nav?await c.match('index.html'):null)||Response.error()}))});
// Push-varsler fra Firebase Cloud Messaging: vis varselet, og åpne appen når det trykkes på.
self.addEventListener('push',e=>{
  let d={};try{d=e.data.json()}catch(x){}
  const n=d.notification||d.data||{};
  e.waitUntil(self.registration.showNotification(n.title||'Sion Molde',{body:n.body||'',badge:'badge-96.png',silent:false,vibrate:[200,100,200],data:{url:(d.fcmOptions&&d.fcmOptions.link)||(d.data&&d.data.url)||'./'}}))});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'./';
  let tab='';try{tab=new URL(url,self.registration.scope).searchParams.get('tab')||''}catch(x){}
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    for(const c of l)if('focus' in c){c.postMessage({type:'open-tab',tab});return c.focus()}
    return clients.openWindow(url)}))});
