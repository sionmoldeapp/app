const V='sion-v31',F=['./','index.html','manifest.webmanifest','icon.svg','logo-512.png','bilder/ingar-jensen.jpg','icon-192.png','badge-96.png','fb.js','fonts.css','fonts/bebas-neue-400-latin.woff2','fonts/yellowtail-400-latin.woff2','fonts/poppins-400-latin.woff2','fonts/poppins-500-latin.woff2','fonts/poppins-600-latin.woff2'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>c.addAll(F)))});   // ny versjon tar over med en gang, uten å vente på at appen lukkes
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&x!=='sion-varsel').map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data&&e.data.type==='skip')self.skipWaiting()});
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
  const n=d.notification||(d.data&&(d.data.title||d.data.body)?d.data:null)||(d.title||d.body?d:null)||d.data||{};
  // Siste varsel (også påminnelser) huskes på telefonen, så Hjem kan vise det selv om appen var lukket da det kom.
  const lagre=caches.open('sion-varsel').then(c=>c.put(new Request(self.registration.scope+'varsel.json'),new Response(JSON.stringify({t:n.title||'Sion Molde',b:n.body||'',ms:Date.now(),tomt:!(n.title||n.body),felt:Object.keys(d).join(','),raw:JSON.stringify(d).slice(0,400)})))).catch(()=>{});
  // Er appen åpen, får den beskjed med en gang (uten dette måtte den lastes på nytt for å vise varselet på Hjem).
  const si=clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>l.forEach(c=>c.postMessage({type:'push',title:n.title||'Sion Molde',body:n.body||''}))).catch(()=>{});
  // Varselet vises alltid, også hvis hurtigbuffer eller meldinger til appen feiler. Feiler visningen med alle valg, prøves en enklere versjon.
  const vis=self.registration.showNotification(n.title||'Sion Molde',{body:n.body||'',icon:'icon-192.png',badge:'badge-96.png',silent:false,vibrate:[200,100,200],data:{url:(d.fcmOptions&&d.fcmOptions.link)||(d.data&&d.data.url)||'./',bok:(d.data&&d.data.bok)||'',tr:(d.data&&d.data.tr)||''},actions:(d.data&&d.data.bok)?[{action:'ja',title:'Kommer'},{action:'nei',title:'Kommer ikke'},{action:'vet',title:'Vet ikke ennå'}]:[]}).catch(()=>self.registration.showNotification(n.title||'Sion Molde',{body:n.body||''}));
  // Merke på app-ikonet når appen er lukket: antall varsler som står i varselfeltet (appen setter riktig tall når den åpnes).
  const ikon=vis.then(()=>self.registration.getNotifications()).then(l=>self.navigator&&self.navigator.setAppBadge?self.navigator.setAppBadge(Math.max(1,l.length)):0).catch(()=>{});
  e.waitUntil(Promise.allSettled([lagre,si,vis,ikon]))});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'./';
  let tab='';try{tab=new URL(url,self.registration.scope).searchParams.get('tab')||''}catch(x){}
  const dd=e.notification.data||{};
  if(dd.bok&&dd.tr&&['ja','nei','vet'].includes(e.action)){   // svar rett fra varselet
    e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
      for(const c of l)if('focus' in c){c.postMessage({type:'bok-svar',bok:dd.bok,tr:dd.tr,k:e.action});return c.focus()}
      return clients.openWindow('./?bsvar='+e.action+'&bok='+encodeURIComponent(dd.bok)+'&tr='+encodeURIComponent(dd.tr))}));return}
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    for(const c of l)if('focus' in c){c.postMessage({type:'open-tab',tab,title:e.notification.title,body:e.notification.body});return c.focus()}
    return clients.openWindow(url+(url.indexOf('?')<0?'?':'&')+'vt='+encodeURIComponent(String(e.notification.title||'').slice(0,100))+'&vb='+encodeURIComponent(String(e.notification.body||'').slice(0,160)))}))});
