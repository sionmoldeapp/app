// Egen server (Supabase) i stedet for Firebase. Lastes av fb.js når appen kjører mot menighetens server.
// Etterligner akkurat de Firebase-funksjonene fb.js bruker (A = innlogging, S = database), så resten av fb.js er lik
// for begge. Dokumenter blir rader: én tabell per samling (se server/sion/sql/001_tabeller.sql), felt uten egen kolonne
// ligger i «ekstra». Tilgangen styres av reglene i server/sion/sql/002_tilgang.sql, ikke her.
// Nøkkelen i sion-konfig.json (anon) er offentlig, som firebaseConfig.

// Kolonnene i hver tabell: t tekst, a tekstliste, b ja/nei, i heltall, n stort heltall, j json, z tidspunkt.
// ! = kan ikke være tom, [ = standard er en liste. Holdes lik tabellene (spørringen står i server/SION.md).
const KOL={
  admins:{email:'t!',name:'t',rolle:'t',groups:'a!',muted:'a!',extra:'a!',pastor:'b!',kontor:'b!',by:'t',ekstra:'j!',created:'z!'},
  omrader:{id:'t!',name:'t',groups:'a!',ledere:'a!',pastorer:'a!',ord:'i',ekstra:'j!'},
  attester:{email:'t!',dato:'t',by:'t',godkjent:'b!',fil:'b!',ekstra:'j!',updated:'z!'},
  attestfil:{email:'t!',data:'t',ftype:'t',fnavn:'t',ms:'n'},
  attestfilny:{email:'t!',data:'t',ftype:'t',fnavn:'t',ms:'n'},
  attestforslag:{email:'t!',k:'t',dato:'t',by:'t',okM:'b!',okL:'b!',okLby:'t',fil:'b!',ms:'n',ekstra:'j!'},
  avst:{id:'t!',sp:'t',val:'a!',by:'t',byNavn:'t',grupper:'a!',ms:'n',v0:'a!',v1:'a!',v2:'a!',v3:'a!',v4:'a!',ekstra:'j!'},
  bonner:{thread_id:'t!',id:'t!',t:'t',by:'t',navn:'t',ms:'n',bedt:'a!',besvart:'b!',ekstra:'j!'},
  booking_team:{booking_id:'t!',email:'t!',n:'t',k:'t',oppg:'t',ms:'n',ekstra:'j!'},
  bookinger:{id:'t!',tittel:'t',rom:'a!',dato:'t',dato2:'t',tider:'a!',fra:'t',til:'t',status:'t',leier:'t',kontakt:'t',epost:'t',pris:'t',notat:'t',gjester:'i',servering:'t',allergener:'a!',allergenNotat:'t',maaltider:'j![',remindH:'i',teamMaal:'i',fakturert:'b!',fakturertMs:'n',fakturaVentH:'i',fakturaUtsattTil:'n',by:'t',ms:'n',ekstra:'j!'},
  categories:{id:'t!',name:'t!',ord:'i',ekstra:'j!'},
  events:{id:'t!',title:'t!',cat:'t',start:'t',end:'t',time:'t',place:'t',who:'t',text:'t',img:'t',m:'b!',groups:'a!',remindH:'i',hideHome:'b!',pubAt:'n',draft:'b!',ekstra:'j!',created:'z!'},
  groups:{id:'t!',name:'t!',desc:'t',ord:'i',vakt:'b!',remind:'b!',ekstra:'j!'},
  leader_types:{id:'t!',name:'t!',ord:'i',ekstra:'j!'},
  lrsaker:{id:'t!',tittel:'t',t:'t',bh:'t',name:'t',by:'t',ms:'n',done:'b!',doneMs:'n',ekstra:'j!'},
  members:{email:'t!',name:'t',rolle:'t',groups:'a!',leads:'a!',leder:'b!',ltype:'t',pastor:'b!',kontor:'b!',muted:'a!',extra:'a!',by:'t',ekstra:'j!',created:'z!'},
  messages:{thread_id:'t!',id:'t!',by:'t',name:'t',text:'t',svar:'j',img:'t',lyd:'t',lsek:'i',avst:'j',pam:'b!',redigert:'b!',slettet:'b!',seen:'a!',stjerne:'a!',likes:'a!',r_hjerte:'a!',r_ler:'a!',r_wow:'a!',r_trist:'a!',r_be:'a!',r_ild:'a!',r_hender:'a!',r_sion:'a!',r_amen:'a!',ekstra:'j!',created:'z!'},
  notes:{owner:'t!',id:'t!',title:'t',date:'t',speaker:'t',html:'t',img:'t',lyd:'j',ekstra:'j!',updated:'z!'},
  post_svar:{post_id:'t!',email:'t!',by:'t',name:'t',k:'t',t:'t',ms:'n',ekstra:'j!'},
  post_views:{id:'t!',n:'i!'},
  posts:{id:'t!',t:'t!',b:'t',bh:'t',img:'t',tag:'t',audience:'a!',groups:'a!',ltypes:'a!',m:'b!',hideHome:'b!',pinned:'b!',draft:'b!',svar:'b!',pubAt:'n',expireAt:'n',schedId:'t',ekstra:'j!',created:'z!'},
  prayers:{id:'t!',t:'t',name:'t',by:'t',ms:'n',ber:'a!',bedt:'n',ekstra:'j!'},
  push_tokens:{token:'t!',email:'t',groups:'a!',ekstra:'j!',created:'z!'},
  regular:{id:'t!',title:'t!',day:'i',time:'t',note:'t',cat:'t',weeks:'t',place:'t',who:'t',text:'t',img:'t',m:'b!',groups:'a!',ex:'j!',ekstra:'j!',created:'z!'},
  reminders:{id:'t!',token:'t',title:'t',fireAt:'n',ekstra:'j!',created:'z!'},
  ringer:{id:'t!',fra:'t',fraNavn:'t',til:'a!',status:'t',ms:'n',svarNavn:'t',callId:'t',startAt:'n',levert:'a!',avvist:'a!',opptatt:'a!',ekstra:'j!'},
  tale:{id:'t!',fra:'t',til:'a!',offer:'t',answer:'t',ms:'n',slutt:'b!',ekstra:'j!'},
  roles:{id:'t!',name:'t!',desc:'t',tasks:'a!',persons:'j![',emails:'a!',ord:'i',ekstra:'j!'},
  rsvp_counts:{id:'t!',n:'i!'},
  rsvps:{id:'t!',eventId:'t',title:'t',start:'t',name:'t',contact:'t',groups:'a!',ekstra:'j!',created:'z!'},
  scheduled:{id:'t!',title:'t',body:'t',tab:'t',malType:'t',groups:'a!',ltypes:'a!',kopi:'b!',fireAt:'n',by:'t',ekstra:'j!',created:'z!'},
  settings:{id:'t!',data:'j!'},
  shift_items:{gruppe:'t!',id:'t!',date:'t',role:'t',emails:'a!',names:'a!',ekstra:'j!'},
  shift_requests:{gruppe:'t!',id:'t!',shiftId:'t',date:'t',role:'t',from:'t',fromName:'t',text:'t',ekstra:'j!',created:'z!'},
  snapshot_data:{id:'t!',json:'t'},
  snapshots:{id:'t!',label:'t',by:'t',counts:'j!',created:'z!'},
  threads:{id:'t!',roleId:'t',roleName:'t',kind:'t',gid:'t',toName:'t',from:'t',fromName:'t',parts:'a!',last:'t',lastBy:'t',ms:'n',unread:'a!',gone:'a!',dempet:'a!',farge:'t',bakgrunn:'t',bgv:'n',bilde:'t',ekstra:'j!',created:'z!'},
  thread_bg:{thread_id:'t!',id:'t!',data:'t',by:'t',v:'n'},
  tilstede:{email:'t!',sist:'z!'},
  user_prefs:{email:'t!',meorder:'a!',homeorder:'a!',suborder:'t',ekstra:'j!'}};
// Samling i Firestore → tabell (der navnet er ulikt), nøkkelkolonne, og undersamlinger [tabell, forelder-kolonne, nøkkelkolonne]
const TOPP={leaderTypes:'leader_types',userPrefs:'user_prefs',rsvpCounts:'rsvp_counts',postViews:'post_views',pushTokens:'push_tokens',snapshotData:'snapshot_data'};
const NOKKEL={members:'email',admins:'email',user_prefs:'email',tilstede:'email',attester:'email',attestfil:'email',attestfilny:'email',attestforslag:'email',push_tokens:'token'};
const UNDER={'members/notes':['notes','owner','id'],'shifts/items':['shift_items','gruppe','id'],'shifts/requests':['shift_requests','gruppe','id'],
  'threads/messages':['messages','thread_id','id'],'threads/bonner':['bonner','thread_id','id'],'threads/bg':['thread_bg','thread_id','id'],'posts/svar':['post_svar','post_id','email'],'bookinger/team':['booking_team','booking_id','email']};
const SKJULT=new Set(['id','owner','gruppe','thread_id','post_id','booking_id']);   // nøkler som ikke er felt i dokumentet

// Tidspunkt som Firestore sitt Timestamp (toMillis, toDate)
class Ts{constructor(ms){this.ms=ms;this.seconds=Math.floor(ms/1000);this.nanoseconds=(ms%1000)*1e6}
  toMillis(){return this.ms}toDate(){return new Date(this.ms)}
  static fromMillis(ms){return new Ts(ms)}static fromDate(d){return new Ts(d.getTime())}static now(){return new Ts(Date.now())}}
// Spesialverdier: servertid, slett felt, legg til / fjern i liste, tell opp
class Felt{constructor(t,v){this.t=t;this.v=v}}
const UT=Symbol('passer ikke');

const lastSkript=src=>new Promise((ok,feil)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>feil(new Error('Fant ikke '+src));document.head.appendChild(s)});
const nyId=()=>Array.from(crypto.getRandomValues(new Uint8Array(20)),b=>'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b%62]).join('');

export async function lag(){
  await lastSkript('lib/supabase-2.117.3.js');
  const K=await (await fetch('sion-konfig.json',{cache:'no-store'})).json();
  const opp={persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'};
  const sb=window.supabase.createClient(location.origin,K.anon,{auth:opp});
  // Egen klient til å opprette brukere, så administratoren ikke logges ut av seg selv (som secAuth i fb.js)
  const sb2=window.supabase.createClient(location.origin,K.anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'sb-oppretter'}});

  // ---------- Feil i samme form som Firebase (e.code), så meldingene i appen virker ----------
  const dbFeil=(e,st)=>({code:e.code==='42501'||st===401||st===403?'permission-denied':e.code==='23505'?'already-exists':
    ['23514','22023','22P02','23502'].includes(e.code)?'invalid-argument':'unknown',message:e.message||String(e)});
  const kj=async q=>{const r=await q;if(r.error)throw dbFeil(r.error,r.status);return r};
  const rpc=(f,a)=>kj(sb.rpc(f,a));
  const authFeil=e=>{const c=(e&&e.code)||'',m=String((e&&e.message)||'').toLowerCase(),s=e&&e.status;
    return {code:c==='invalid_credentials'||/invalid login/.test(m)?'auth/invalid-credential':c==='email_not_confirmed'?'auth/user-disabled':
      c==='weak_password'||/password should/.test(m)?'auth/weak-password':c==='email_address_invalid'||c==='validation_failed'||/email.*invalid|invalid.*email/.test(m)?'auth/invalid-email':
      s===429||/rate limit/.test(m)?'auth/too-many-requests':/fetch|network/.test(m)?'auth/network-request-failed':'auth/'+(c||'ukjent'),message:e&&e.message}};

  // ---------- Stier: samling og dokument ----------
  function samling(segs){
    if(segs.length===1){const t=TOPP[segs[0]]||segs[0];if(!KOL[t])throw {code:'invalid-argument',message:'Ukjent samling '+segs[0]};return {type:'col',table:t,keyCol:NOKKEL[t]||'id',parent:{}}}
    const u=segs.length===3&&UNDER[segs[0]+'/'+segs[2]];if(!u)throw {code:'invalid-argument',message:'Ukjent samling '+segs.join('/')};
    return {type:'col',table:u[0],keyCol:u[2],parent:{[u[1]]:String(segs[1])}}}
  const dokument=(c,id)=>({type:'doc',table:c.table,id:String(id),keys:{[c.keyCol]:String(id),...c.parent},col:c});
  const deler=a=>a.flatMap(s=>String(s).split('/'));
  const medNokler=(q,ref)=>{for(const [k,v] of Object.entries(ref.keys))q=q.eq(k,v);return q};

  // ---------- Rad ↔ dokument ----------
  function tilData(t,rad){
    if(t==='settings')return {...(rad.data||{})};
    const kol=KOL[t],o={...(rad.ekstra||{})};
    for(const [k,v] of Object.entries(rad)){if(k==='ekstra'||SKJULT.has(k)||v==null)continue;o[k]=kol[k]&&kol[k][0]==='z'?new Ts(Date.parse(v)):v}
    return o}
  const tilJson=v=>v instanceof Ts?v.toDate().toISOString():v instanceof Date?v.toISOString():Array.isArray(v)?v.map(tilJson):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,tilJson(x)])):v;
  function standard(ty){if(!ty.includes('!'))return null;const c=ty[0];return c==='a'?[]:c==='b'?false:c==='j'?(ty.includes('[')?[]:{}):c==='i'||c==='n'?0:c==='t'?'':undefined}
  function tilpass(v,ty){
    if(v===null)return ty.includes('!')?standard(ty):null;
    const c=ty[0];
    if(v instanceof Felt&&v.t==='ts')return c==='z'?new Date().toISOString():UT;
    if(v instanceof Ts||v instanceof Date)return c==='z'?tilJson(v):UT;
    if(c==='t')return typeof v==='string'?v:UT;
    if(c==='a')return Array.isArray(v)&&v.every(x=>typeof x==='string')?v:UT;
    if(c==='b')return typeof v==='boolean'?v:UT;
    if(c==='i')return Number.isInteger(v)&&Math.abs(v)<2147483648?v:UT;
    if(c==='n')return Number.isSafeInteger(v)?v:UT;
    if(c==='j')return tilJson(v);
    return UT}
  const verdi=v=>v instanceof Ts||v instanceof Date?tilJson(v):v;

  async function les(ref){return (await kj(medNokler(sb.from(ref.table).select('*'),ref).maybeSingle())).data}
  async function hentRader(q,velg){
    let r=sb.from(q.table).select(velg||'*');
    for(const [k,v] of Object.entries(q.parent||{}))r=r.eq(k,v);
    for(const d of q.deler||[]){
      if(d.w){const [f,op,v0]=d.w,v=verdi(v0);
        r=op==='=='?r.eq(f,v):op==='!='?r.neq(f,v):op==='>='?r.gte(f,v):op==='>'?r.gt(f,v):op==='<='?r.lte(f,v):op==='<'?r.lt(f,v):
          op==='array-contains'?r.contains(f,[v]):op==='in'?r.in(f,v):(()=>{throw {code:'invalid-argument',message:'Ukjent sammenligning '+op}})()}
      if(d.o)r=r.order(d.o[0],{ascending:d.o[1]!=='desc'});
      if(d.l)r=r.limit(d.l)}
    return (await kj(r)).data||[]}
  const dokSnap=(ref,rad)=>({id:ref.id,ref,exists:()=>!!rad,data:()=>rad?tilData(ref.table,rad):undefined,get:k=>rad?tilData(ref.table,rad)[k]:undefined});
  const samSnap=(q,rader)=>{const docs=rader.map(r=>dokSnap(dokument(q,r[q.keyCol]),r));return {docs,size:docs.length,empty:!docs.length,forEach:f=>docs.forEach(f)}};

  /* Meldinger: bilder og lydklipp er store (opptil flere hundre kB hver) og hentes ikke sammen med meldingene. Teksten og resten vises med en gang, og mediene hentes én og én etterpå (nyeste først)
     og lagres i minnet, så senere oppdateringer (reaksjoner, lest) bare henter det som er nytt. */
  const medier=new Map();
  async function hentMeldinger(mal,cb,stoppet){
    const velg=Object.keys(KOL.messages).filter(k=>k!=='img'&&k!=='lyd').join(','),tid=mal.parent&&mal.parent.thread_id;
    const rader=await hentRader(mal,velg);if(stoppet())return;
    const ids=rader.map(r=>r.id),har={};
    for(const r of rader){const m=medier.get(tid+'|'+r.id);if(m){if(m.img)r.img=m.img;if(m.lyd)r.lyd=m.lyd}}
    cb(samSnap(mal,rader));   // teksten vises med en gang, før vi vet hvilke meldinger som har bilde eller lyd
    if(ids.length)await Promise.all(['img','lyd'].map(async f=>{
      const k=await kj(sb.from('messages').select('id').eq('thread_id',tid).in('id',ids).not(f,'is',null).neq(f,''));
      for(const r of k.data||[])(har[r.id]=har[r.id]||[]).push(f)}));
    if(stoppet())return;
    const mangler=[];
    for(const r of rader){if(!medier.has(tid+'|'+r.id)&&har[r.id]){mangler.push(r);if(har[r.id].includes('img'))r.imgVent=true;if(har[r.id].includes('lyd'))r.lydVent=true}}
    if(mangler.length)cb(samSnap(mal,rader));
    let tm=0;const oppdater=()=>{clearTimeout(tm);tm=setTimeout(()=>{if(!stoppet())cb(samSnap(mal,rader))},120)};
    for(const r of mangler.reverse()){   // nyeste først
      if(stoppet())return;
      try{const d=(await kj(sb.from('messages').select('id,img,lyd').eq('thread_id',tid).eq('id',r.id).maybeSingle())).data;
        delete r.imgVent;delete r.lydVent;if(d){medier.set(tid+'|'+r.id,{img:d.img||'',lyd:d.lyd||''});if(d.img)r.img=d.img;if(d.lyd)r.lyd=d.lyd}oppdater()}catch(e){delete r.imgVent;delete r.lydVent;oppdater()}}}

  // Skriving. modus: sett (erstatter dokumentet), flett (setDoc med merge), endre (updateDoc: dokumentet må finnes)
  async function skriv(ref,data,modus){
    const t=ref.table;
    // Tellere, påmelding og varselkoder går via funksjoner i databasen (se 002_tilgang.sql)
    if(t==='rsvp_counts'||t==='post_views'){const d=data.n instanceof Felt&&data.n.t==='inc'?data.n.v:1;
      return t==='post_views'?rpc('nyhet_sett',{p_id:ref.id}):rpc('rsvp_tell',{p_id:ref.id,p_d:d<0?-1:1})}
    if(t==='rsvps')return rpc('meld_paa',{p_id:ref.id,p_event:data.eventId,p_title:data.title,p_start:data.start,p_name:data.name,p_contact:data.contact,p_groups:data.groups||[]});
    if(t==='push_tokens')return rpc('kode_lagre',{p_token:ref.id,p_email:data.email||null});
    const kol=KOL[t],gml=ref.ny?null:await les(ref).catch(e=>{if(e.code==='permission-denied')return null;throw e});
    if(!gml&&modus==='endre')throw {code:'not-found',message:'Finnes ikke: '+t+'/'+ref.id};
    if(t==='settings'){   // hele dokumentet ligger i kolonnen data
      const d=modus==='sett'||!gml?{}:{...gml.data};
      for(const [k,v] of Object.entries(data)){if(v instanceof Felt&&v.t==='del')delete d[k];else d[k]=tilJson(v instanceof Felt?(v.t==='ts'?new Date():v.v):v)}
      return gml?kj(sb.from(t).update({data:d}).eq('id',ref.id)):kj(sb.from(t).insert({id:ref.id,data:d}))}
    const rad={},ekstra=modus==='sett'||!gml?{}:{...(gml.ekstra||{})};let ekstraEndret=modus==='sett'&&gml&&Object.keys(gml.ekstra||{}).length>0;
    const liste=(k,v,fra)=>{const a=Array.isArray(fra)?[...fra]:[];if(v.t==='union'){v.v.forEach(x=>{if(!a.includes(x))a.push(x)});return a}return a.filter(x=>!v.v.includes(x))};
    for(const [k,v] of Object.entries(data)){
      const ty=k!=='ekstra'&&kol[k];
      if(ty&&ref.keys[k]!==undefined)continue;   // nøkkelen ligger allerede i raden
      if(ty){
        if(v instanceof Felt&&v.t==='del'){rad[k]=standard(ty);continue}
        if(v instanceof Felt&&(v.t==='union'||v.t==='remove')){rad[k]=liste(k,v,gml&&gml[k]);continue}
        if(v instanceof Felt&&v.t==='inc'){rad[k]=((gml&&gml[k])||0)+v.v;continue}
        const x=tilpass(v,ty);
        if(x===UT){rad[k]=standard(ty);ekstra[k]=tilJson(v);ekstraEndret=true}
        else{rad[k]=x;if(k in ekstra){delete ekstra[k];ekstraEndret=true}}
      }else if(kol.ekstra){
        ekstraEndret=true;
        if(v instanceof Felt&&v.t==='del')delete ekstra[k];
        else if(v instanceof Felt&&(v.t==='union'||v.t==='remove'))ekstra[k]=liste(k,v,ekstra[k]);
        else if(v instanceof Felt&&v.t==='inc')ekstra[k]=(Number(ekstra[k])||0)+v.v;
        else ekstra[k]=tilJson(v instanceof Felt?new Date():v);
      }else throw {code:'invalid-argument',message:'Feltet '+k+' finnes ikke i '+t};
    }
    if(!gml){
      const ny={...ref.keys,...rad};if(kol.ekstra&&Object.keys(ekstra).length)ny.ekstra=ekstra;
      return kj(sb.from(t).insert(ny)).catch(e=>{throw e.code==='already-exists'?{code:'permission-denied',message:e.message}:e})}
    if(modus==='sett')for(const [k,ty] of Object.entries(kol))if(!(k in rad)&&k!=='ekstra'&&ref.keys[k]===undefined){const s=standard(ty);if(s!==undefined)rad[k]=s}
    if(kol.ekstra&&ekstraEndret)rad.ekstra=ekstra;
    if(!Object.keys(rad).length)return;
    const r=await kj(medNokler(sb.from(t).update(rad,{count:'exact'}),ref));
    if(!r.count)throw {code:'permission-denied',message:'Ingen tilgang til å endre '+t+'/'+ref.id}}

  async function slett(ref){
    const t=ref.table;
    if(t==='rsvps')return rpc('meld_av',{p_id:ref.id});
    if(t==='push_tokens')return rpc('kode_fjern',{p_token:ref.id});
    if(t==='reminders')return rpc('paaminnelse_fjern',{p_id:ref.id});
    return kj(medNokler(sb.from(t).delete(),ref))}

  // ---------- S: databasen (samme navn som firebase-firestore) ----------
  let kanalNr=0;
  const S={
    Timestamp:Ts,
    collection:(db,...s)=>samling(deler(s)),
    doc(a,...s){
      if(a&&a.type==='col'){const d=dokument(a,s.length?s[0]:nyId());if(!s.length)d.ny=true;return d}
      const p=deler(s);return dokument(samling(p.slice(0,-1)),p[p.length-1])},
    query:(c,...d)=>({...c,type:'query',deler:d}),
    where:(f,op,v)=>({w:[f,op,v]}),orderBy:(f,r)=>({o:[f,r||'asc']}),limit:n=>({l:n}),
    serverTimestamp:()=>new Felt('ts'),deleteField:()=>new Felt('del'),increment:n=>new Felt('inc',n),
    arrayUnion:(...v)=>new Felt('union',v),arrayRemove:(...v)=>new Felt('remove',v),
    getDoc:async ref=>dokSnap(ref,await les(ref)),
    getDocs:async q=>samSnap(q,await hentRader(q)),
    setDoc:(ref,data,o)=>skriv(ref,data,o&&o.merge?'flett':'sett'),
    updateDoc:(ref,data)=>skriv(ref,data,'endre'),
    deleteDoc:ref=>slett(ref),
    addDoc:async(c,data)=>{const ref=S.doc(c);await skriv(ref,data,'sett');return ref},
    // Batch: operasjonene kjøres etter hverandre i samme rekkefølge (forelder før barn, som reglene krever)
    ringEvent:async(tid,callId,event,name)=>{const r=await rpc('chat_ring_event',{p_thread:tid,p_call:callId,p_event:event,p_name:name||''});return r.data;},
    markMsgsSeen:(tid,ids)=>rpc('mark_chat_seen',{p_thread:tid,p_ids:ids.slice(0,20)}),
    writeBatch:()=>{const ops=[];return {set:(r,d,o)=>{ops.push(()=>S.setDoc(r,d,o))},update:(r,d)=>{ops.push(()=>S.updateDoc(r,d))},delete:r=>{ops.push(()=>S.deleteDoc(r))},
      commit:async()=>{for(const f of ops)await f()}}},
    // Lytter (sanntid): henter på nytt når en rad i tabellen endres. Reglene bestemmer hvilke endringer brukeren får.
    onSnapshot(mal,cb,err){
      let stopp=false,tm;
      const hent=async()=>{try{
        if(mal.type==='col'&&mal.table==='messages'){await hentMeldinger(mal,cb,()=>stopp);return}
        const s=mal.type==='doc'?dokSnap(mal,await les(mal)):samSnap(mal,await hentRader(mal));if(!stopp)cb(s)}catch(e){if(!stopp&&err)err(e)}};
      const f=Object.entries(mal.type==='doc'?mal.keys:mal.parent||{})[0];
      const ch=sb.channel('sion-'+(++kanalNr)).on('postgres_changes',{event:'*',schema:'public',table:mal.table,...(f?{filter:f[0]+'=eq.'+f[1]}:{})},
        ()=>{clearTimeout(tm);tm=setTimeout(hent,120)}).subscribe(st=>{if(st==='SUBSCRIBED')hent()});
      hent();
      return ()=>{stopp=true;clearTimeout(tm);sb.removeChannel(ch)}}};

  // ---------- A: innlogging (samme navn som firebase-auth) ----------
  const bruker=s=>s&&s.user?{uid:s.user.id,email:String(s.user.email||'').toLowerCase(),
    getIdToken:async()=>((await sb.auth.getSession()).data.session||{}).access_token||''}:null;
  const auth={currentUser:bruker((await sb.auth.getSession()).data.session)},secAuth={};
  sb.auth.onAuthStateChange((ev,s)=>{auth.currentUser=bruker(s)});
  const nyNettopp=new Set();   // nyopprettede brukere har allerede fått e-post (bekreftelseslenken lar dem velge passord)
  const velgUrl=()=>location.origin+location.pathname+'?velg=1';
  const A={
    browserLocalPersistence:'lokal',browserSessionPersistence:'okt',
    setPersistence:async()=>{},
    onAuthStateChanged(a,cb){let sist;
      const {data}=sb.auth.onAuthStateChange((ev,s)=>{const u=bruker(s),id=u?u.uid:null;if(ev!=='INITIAL_SESSION'&&id===sist)return;sist=id;setTimeout(()=>cb(u),0)});
      return ()=>data.subscription.unsubscribe()},
    async signInWithEmailAndPassword(a,e,p){const r=await sb.auth.signInWithPassword({email:String(e).trim(),password:p});if(r.error)throw authFeil(r.error);return {user:bruker(r.data.session)}},
    signOut:async a=>{if(a!==secAuth)await sb.auth.signOut()},
    async sendPasswordResetEmail(a,e){e=String(e).trim().toLowerCase();if(nyNettopp.delete(e))return;
      const r=await sb.auth.resetPasswordForEmail(e,{redirectTo:velgUrl()});if(r.error)throw authFeil(r.error);
      kodePassord(sb,e)},
    EmailAuthProvider:{credential:(email,password)=>({email,password})},
    async reauthenticateWithCredential(u,c){const r=await sb.auth.signInWithPassword(c);if(r.error){const f=authFeil(r.error);if(f.code==='auth/invalid-credential')f.code='auth/wrong-password';throw f}},
    async updatePassword(u,p){const r=await sb.auth.updateUser({password:p});if(r.error)throw authFeil(r.error)},
    async deleteUser(u){await rpc('slett_min_konto',{});await sb.auth.signOut()},
    async createUserWithEmailAndPassword(a,e,p){e=String(e).trim().toLowerCase();
      const r=await sb2.auth.signUp({email:e,password:p,options:{emailRedirectTo:velgUrl()}});if(r.error)throw authFeil(r.error);
      if(r.data.user&&Array.isArray(r.data.user.identities)&&!r.data.user.identities.length)throw {code:'auth/email-already-in-use'};
      nyNettopp.add(e);return {user:{email:e}}}};

  velgPassord(sb,auth);
  return {A,S,auth,db:{},secAuth}}

// Etter lenken i e-posten (ny bruker eller «Glemt passord?»): brukeren er logget inn via lenken og velger passord her.
// Vanlig <dialog> med appens egne stiler, så den ligger på samme nivå som appens andre vinduer.
function kodePassord(sb,email){
  const d=document.createElement('dialog');d.setAttribute('aria-labelledby','kodeT');
  d.innerHTML='<form class="form"><h2 id="kodeT">Velg nytt passord</h2><p>Hvis adressen er registrert, får du en engangskode på e-post. Skriv den inn her. Du kan la dette vinduet stå åpent mens du leser e-posten.</p>'+
    '<label class="f">Engangskode<input name="kode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]+" required></label>'+
    '<label class="f">Nytt passord<input name="passord" type="password" autocomplete="new-password" required minlength="8"></label>'+
    '<label class="f">Gjenta passordet<input name="gjenta" type="password" autocomplete="new-password" required minlength="8"></label>'+
    '<p class="small" role="status"></p><div class="btns"><button class="btn primary" type="submit">Lagre passord</button><button class="btn" type="button">Lukk</button></div></form>';
  const f=d.querySelector('form'),kode=f.elements.kode,p=f.elements.passord,g=f.elements.gjenta,m=f.querySelector('[role=status]'),lagre=f.querySelector('[type=submit]');
  let verifisert=false;
  d.addEventListener('close',()=>d.remove());f.querySelector('[type=button]').onclick=()=>d.close();
  f.onsubmit=async e=>{e.preventDefault();if(lagre.disabled)return;
    if(p.value!==g.value){m.textContent='Passordene er ikke like.';return}
    lagre.disabled=true;m.textContent='Kontrollerer …';
    try{
      if(!verifisert){const r=await sb.auth.verifyOtp({email,token:kode.value.trim(),type:'recovery'});
        if(r.error){m.textContent='Koden er feil eller utløpt. Kontroller koden fra den nyeste e-posten, eller lukk og be om en ny.';return}
        if(!r.data?.session){m.textContent='Kunne ikke bekrefte innloggingen. Lukk og be om en ny kode.';return}
        verifisert=true;kode.disabled=true}
      const r=await sb.auth.updateUser({password:p.value});
      if(r.error){m.textContent='Kunne ikke lagre passordet. Bruk minst 8 tegn og prøv igjen.';return}
      p.value='';g.value='';kode.value='';m.textContent='Passordet er endret. Du kan lukke vinduet.';f.onsubmit=e=>e.preventDefault();lagre.hidden=true;
    }catch(x){m.textContent='Ingen kontakt med innloggingstjenesten. Prøv igjen.'}
    finally{lagre.disabled=false}};
  document.body.appendChild(d);d.showModal();kode.focus()
}

async function velgPassord(sb,auth){
  const q=new URLSearchParams(location.search),h=new URLSearchParams(location.hash.slice(1));
  if(!q.has('velg'))return;
  const rydd=()=>{q.delete('velg');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:''))};
  const d=document.createElement('dialog');d.setAttribute('aria-labelledby','velgT');
  if(!auth.currentUser){
    d.innerHTML='<form class="form" method="dialog"><h2 id="velgT">Lenken virker ikke</h2><p>'+(h.get('error_description')?'Lenken er brukt eller utløpt.':'Fant ingen innlogging fra lenken.')+
      ' Be om en ny via «Glemt passord?» på innloggingen under Mer.</p><button class="btn primary">OK</button></form>';
    d.addEventListener('close',()=>{d.remove();rydd()});document.body.appendChild(d);d.showModal();return}
  d.innerHTML='<form class="form"><h2 id="velgT">Velg passord</h2><p>For <b></b>. Minst 8 tegn.</p>'+
    '<label class="f">Nytt passord<input type="password" autocomplete="new-password" required minlength="8"></label>'+
    '<label class="f">Gjenta passordet<input type="password" autocomplete="new-password" required minlength="8"></label>'+
    '<p class="small" role="status" style="min-height:1.2em"></p><button class="btn primary">Lagre passord</button></form>';
  d.querySelector('b').textContent=auth.currentUser.email;
  const f=d.querySelector('form'),[p1,p2]=f.querySelectorAll('input'),m=f.querySelector('[role=status]');
  d.addEventListener('cancel',e=>e.preventDefault());   // må velge passord før vinduet lukkes
  f.onsubmit=async ev=>{ev.preventDefault();if(p1.value!==p2.value){m.textContent='Passordene er ikke like.';return}
    m.textContent='Lagrer …';const r=await sb.auth.updateUser({password:p1.value});
    if(r.error){m.textContent=/should|weak|least/i.test(r.error.message)?'Passordet er for svakt. Prøv et lengre.':'Kunne ikke lagre ('+r.error.message+').';return}
    rydd();d.close();setTimeout(()=>d.remove(),600)};
  document.body.appendChild(d);d.showModal();p1.focus()}
