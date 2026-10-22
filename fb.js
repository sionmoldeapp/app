// Firebase (Spark-planen): innlogging og database. Lastes som modul fra index.html.
// firebaseConfig er ikke hemmelig. Det er reglene i firestore.rules som beskytter dataene.
const V='10.14.1',B='https://www.gstatic.com/firebasejs/'+V+'/';
try{
  const [{initializeApp},A,S]=await Promise.all([import(B+'firebase-app.js'),import(B+'firebase-auth.js'),import(B+'firebase-firestore.js')]);
  const M=await import(B+'firebase-messaging.js').catch(()=>null);   // varsler; appen virker uten
  const VAPID='BN0qXSST7zltP6MnXUbUiQg7HUDkobWNyUKld6kpW2TkKPiXtz9n3xbqquMKb0iakhv2wQt3kpDpofroi144D3M';   // offentlig nøkkel for web-push
  const app=initializeApp({
    apiKey:"AIzaSyAd8OmuuLWJYI2ICbPdn7VN6DQge4lp5mA",
    authDomain:"sion-molde-app.firebaseapp.com",
    projectId:"sion-molde-app",
    storageBucket:"sion-molde-app.firebasestorage.app",
    messagingSenderId:"792770444668",
    appId:"1:792770444668:web:ee5b9814f1190666adf8f9"});
  const auth=A.getAuth(app),db=S.getFirestore(app);
  await A.setPersistence(auth,A.browserLocalPersistence).catch(()=>{});   // brukeren forblir innlogget til hen logger ut
  // Egen forekomst brukes til å opprette brukere, slik at administratoren ikke logges ut av seg selv.
  const secAuth=A.getAuth(initializeApp(app.options,'oppretter'));
  // Sikkerhetspunkter (snapshots): innholdet lagres som tekst i databasen så administratorer kan rulle tilbake etter et uhell.
  const SNAP_COLS=['events','posts','regular','members','admins'],KEEP_COLS=['events','posts','regular'];
  const utTid=v=>v&&typeof v.toDate==='function'?{__tid:v.toDate().toISOString()}:Array.isArray(v)?v.map(utTid):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,utTid(x)])):v;
  const revive=v=>v&&typeof v==='object'&&typeof v.__tid==='string'?S.Timestamp.fromDate(new Date(v.__tid)):Array.isArray(v)?v.map(revive):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,revive(x)])):v;
  // Viser «Sletter …» i appen til slettingen er bekreftet av databasen.
const sl=async(p,t)=>{if(window.smBusy)window.smBusy(1,t);try{return await p}finally{if(window.smBusy)window.smBusy(-1)}};
const FB={
    full:false,   // true for medlemmer og administratorer: da hentes også medlemsinnhold
    get user(){return auth.currentUser},
    onAuth:cb=>A.onAuthStateChanged(auth,cb),
    login:(e,p)=>A.signInWithEmailAndPassword(auth,e,p),
    logout:()=>A.signOut(auth),
    reset:e=>A.sendPasswordResetEmail(auth,e),
    // Endring av passord krever at brukeren bekrefter det gamle passordet først.
    async changePassword(old,nw){const u=auth.currentUser;await A.reauthenticateWithCredential(u,A.EmailAuthProvider.credential(u.email,old));await A.updatePassword(u,nw)},
    // Uinnloggede ber bare om åpent innhold (m == false). Reglene krever det samme.
    async list(col){
      const c=S.collection(db,col);
      const snap=await S.getDocs(FB.full?c:S.query(c,S.where('m','==',false)));
      return snap.docs.map(d=>{const x=d.data();return {...x,id:d.id,ms:x.created&&x.created.toMillis?x.created.toMillis():0}});
    },
    async isAdmin(email){
      try{return (await S.getDoc(S.doc(db,'admins',email))).exists()}catch(e){return false}
    },
    add:(col,data)=>S.addDoc(S.collection(db,col),{...data,created:S.serverTimestamp()}),
    set:(col,id,data)=>S.setDoc(S.doc(db,col,id),data,{merge:true}),
    // Unntak for enkeltdatoer på en fast samling (avlyst / fjernet / endret). Hele ex-feltet byttes ut.
    setFastEx:(id,ex)=>S.updateDoc(S.doc(db,'regular',id),{ex}),
    // Grupper (samlingen groups): navn og beskrivelse. Appen bruker innebygde standardgrupper til administrator redigerer første gang.
    async groupsList(){const s=await S.getDocs(S.collection(db,'groups'));return s.docs.map(d=>({id:d.id,...d.data()}))},
    // Påmeldinger («Jeg kommer») med navn, lest av administratorer og gruppeledere. Dokument-ID = arrangement + enhet.
    setRsvpDoc:(id,d)=>S.setDoc(S.doc(db,'rsvps',id),{...d,created:S.serverTimestamp()}),
    delRsvpDoc:id=>S.deleteDoc(S.doc(db,'rsvps',id)),
    async rsvpList(eventId){const s=await S.getDocs(S.query(S.collection(db,'rsvps'),S.where('eventId','==',eventId)));return s.docs.map(d=>{const x=d.data();return {id:d.id,name:x.name||'',contact:x.contact||'',ms:x.created&&x.created.toMillis?x.created.toMillis():0}}).sort((a,b)=>a.ms-b.ms)},
    // Egen profil: navn og gruppevarsler en ikke vil ha (muted). Sletting av seg selv: konto, medlemskap og varselkode.
    // Egne innstillinger (userPrefs/{e-post}): rekkefølgen på kortene under Meg. Bare eieren leser og skriver.
    async myPrefs(email){try{const s=await S.getDoc(S.doc(db,'userPrefs',email));return s.exists()?s.data():null}catch(e){return null}},
    setPrefOrder:(email,felt,list)=>(felt==='meorder'||felt==='homeorder')?S.setDoc(S.doc(db,'userPrefs',email),{[felt]:list.slice(0,20).map(x=>String(x).slice(0,20))},{merge:true}):Promise.resolve(),
    async myProfile(email){try{const s=await S.getDoc(S.doc(db,'members',email));return s.exists()?{name:s.data().name||'',muted:s.data().muted||[]}:null}catch(e){return null}},
    setProfile:(email,d)=>S.updateDoc(S.doc(db,'members',email),d),
    async deleteSelf(password){
      const u=auth.currentUser,email=u.email.toLowerCase();
      await A.reauthenticateWithCredential(u,A.EmailAuthProvider.credential(u.email,password));
      let tk='';try{tk=localStorage.getItem('sm-push')||''}catch(e){}
      if(tk){try{await S.deleteDoc(S.doc(db,'pushTokens',tk))}catch(e){}}
      try{const ns=await S.getDocs(S.collection(db,'members',email,'notes'));for(const d of ns.docs)await S.deleteDoc(d.ref)}catch(e){}
      // Personvern: alt som er knyttet til brukeren fjernes (bønneemner, egne samtaler med meldinger, innstillinger).
      try{const ps=await S.getDocs(S.query(S.collection(db,'prayers'),S.where('by','==',u.uid)));for(const d of ps.docs)await S.deleteDoc(d.ref)}catch(e){}
      try{const ts=await S.getDocs(S.query(S.collection(db,'threads'),S.where('from','==',email)));for(const t of ts.docs){const ms=await S.getDocs(S.collection(db,'threads',t.id,'messages'));for(const m of ms.docs)await S.deleteDoc(m.ref);await S.deleteDoc(t.ref)}}catch(e){}
      try{await S.deleteDoc(S.doc(db,'userPrefs',email))}catch(e){}
      try{await S.deleteDoc(S.doc(db,'attester',email))}catch(e){}
      await S.deleteDoc(S.doc(db,'members',email));
      await A.deleteUser(u);
    },
    // Innsyn (GDPR artikkel 15): alt appen har lagret om brukeren, som en fil.
    async exportMine(){
      const u=auth.currentUser,email=u.email.toLowerCase(),o={eksportert:new Date().toISOString(),epost:email};
      const prøv=async f=>{try{return await f()}catch(e){return null}};
      o.profil=await prøv(async()=>{const s=await S.getDoc(S.doc(db,'members',email));return s.exists()?s.data():null});
      o.notater=await prøv(async()=>(await S.getDocs(S.collection(db,'members',email,'notes'))).docs.map(d=>({id:d.id,...d.data()})));
      o.innstillinger=await prøv(async()=>{const s=await S.getDoc(S.doc(db,'userPrefs',email));return s.exists()?s.data():null});
      o.politiattest=await prøv(async()=>{const s=await S.getDoc(S.doc(db,'attester',email));return s.exists()?{godkjent:s.data().dato}:null});
      o.bonneemner=await prøv(async()=>(await S.getDocs(S.query(S.collection(db,'prayers'),S.where('by','==',u.uid)))).docs.map(d=>{const x=d.data();return {t:x.t,navn:x.name,tidspunkt:x.ms}}));
      o.beskjeder=await prøv(async()=>{const ts=await S.getDocs(S.query(S.collection(db,'threads'),S.where('parts','array-contains',email)));const ut=[];for(const t of ts.docs){const x=t.data(),ms=await S.getDocs(S.query(S.collection(db,'threads',t.id,'messages'),S.orderBy('created')));ut.push({ansvarsomrade:x.roleName,fra:x.fromName,deltakere:x.parts,meldinger:ms.docs.map(m=>{const y=m.data();return {fra:y.name,epost:y.by,tekst:y.text,tidspunkt:y.created&&y.created.toDate?y.created.toDate().toISOString():null}})})}return ut});
      return o;
    },
    // Visninger av nyheter (postViews) og antall telefoner med varsler på (bare administrator).
    async view(id){const ref=S.doc(db,'postViews',id),s=await S.getDoc(ref);if(s.exists())await S.updateDoc(ref,{n:S.increment(1)});else await S.setDoc(ref,{n:1})},
    async viewCounts(){const s=await S.getDocs(S.collection(db,'postViews'));const o={};s.docs.forEach(d=>o[d.id]=d.data().n||0);return o},
    async pushCount(){const s=await S.getDocs(S.collection(db,'pushTokens'));return s.size},
    // Private møtenotater: members/{e-post}/notes/n1..n100. Bare eieren har tilgang.
    async notesList(email){const s=await S.getDocs(S.collection(db,'members',email,'notes'));return s.docs.map(d=>{const x=d.data();return {id:d.id,title:x.title||'',date:x.date||'',speaker:x.speaker||'',html:x.html||'',ms:x.updated&&x.updated.toMillis?x.updated.toMillis():0}}).sort((a,b)=>b.ms-a.ms)},
    saveNote:(email,id,d)=>S.setDoc(S.doc(db,'members',email,'notes',id),{title:d.title,date:d.date,speaker:d.speaker||'',html:d.html,updated:S.serverTimestamp()}),
    delNote:(email,id)=>sl(S.deleteDoc(S.doc(db,'members',email,'notes',id))),
    // Vakter: shifts/{gruppe}/items (vaktene) og shifts/{gruppe}/requests (byttebeskjeder til lederen).
    async shiftsList(group,fromIso){const s=await S.getDocs(S.collection(db,'shifts',group,'items'));return s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>!fromIso||x.date>=fromIso).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:String(a.role).localeCompare(String(b.role)))},
    setShift:(group,id,d)=>S.setDoc(S.doc(db,'shifts',group,'items',id),d),
    delShift:(group,id)=>sl(S.deleteDoc(S.doc(db,'shifts',group,'items',id))),
    async requestsList(group){const s=await S.getDocs(S.collection(db,'shifts',group,'requests'));return s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.date).localeCompare(String(b.date)))},
    addRequest:(group,d)=>S.addDoc(S.collection(db,'shifts',group,'requests'),{...d,created:S.serverTimestamp()}),
    delRequest:(group,id)=>sl(S.deleteDoc(S.doc(db,'shifts',group,'requests',id))),
    // Planlagte varsler (samlingen scheduled): Apps Script sender dem når fireAt er passert.
    addScheduled:d=>S.addDoc(S.collection(db,'scheduled'),{...d,by:auth.currentUser.email,created:S.serverTimestamp()}),
    // Avlyser et planlagt varsel. Returnerer false hvis det allerede er sendt (dokumentet finnes ikke lenger).
    delScheduled:id=>sl((async()=>{const ref=S.doc(db,'scheduled',id),s=await S.getDoc(ref);if(!s.exists())return false;await S.deleteDoc(ref);return true})()),
    // Endrer et planlagt varsel (tid, tittel, tekst). false hvis det allerede er sendt.
    updScheduled:(id,d)=>sl((async()=>{const ref=S.doc(db,'scheduled',id),s=await S.getDoc(ref);if(!s.exists())return false;await S.updateDoc(ref,d);return true})(),'Lagrer …'),
    // Ansvarsområder (roles) og beskjeder (threads med messages). Deltakere identifiseres med e-post (se reglene).
    async rolesList(){const s=await S.getDocs(S.collection(db,'roles'));return s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>((a.ord==null?999:a.ord)-(b.ord==null?999:b.ord))||String(a.name).localeCompare(String(b.name)))},
    setRole:(id,d)=>S.setDoc(S.doc(db,'roles',id),{name:String(d.name).slice(0,60),desc:String(d.desc||'').slice(0,140),tasks:(d.tasks||[]).slice(0,20).map(x=>String(x).slice(0,120)),persons:(d.persons||[]).slice(0,4).map(p=>({n:String(p.n).slice(0,60),tlf:String(p.tlf||'').slice(0,30),e:String(p.e||'').slice(0,100)})),emails:(d.emails||[]).slice(0,4),ord:d.ord==null?999:d.ord}),
    delRole:id=>sl(S.deleteDoc(S.doc(db,'roles',id))),
    async threadsList(me){const s=await S.getDocs(S.query(S.collection(db,'threads'),S.where('parts','array-contains',me),S.limit(50)));return s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.ms||0)-(a.ms||0))},
    async msgsList(id){const s=await S.getDocs(S.query(S.collection(db,'threads',id,'messages'),S.orderBy('created'),S.limit(200)));return s.docs.map(d=>{const x=d.data();return {id:d.id,by:x.by,name:x.name,text:x.text,ms:x.created&&x.created.toMillis?x.created.toMillis():Date.now()}})},
    async newThread(role,text,name){
      const me=auth.currentUser.email.toLowerCase(),parts=[...new Set([me,...(role.emails||[])])],tref=S.doc(S.collection(db,'threads')),mref=S.doc(S.collection(db,'threads',tref.id,'messages')),b=S.writeBatch(db);
      b.set(tref,{roleId:role.id,roleName:String(role.name).slice(0,60),from:me,fromName:String(name).slice(0,60),parts,last:String(text).slice(0,140),lastBy:me,ms:Date.now(),unread:parts.filter(p=>p!==me),created:S.serverTimestamp()});
      b.set(mref,{by:me,name:String(name).slice(0,60),text:String(text).slice(0,1000),created:S.serverTimestamp()});
      await b.commit();return tref.id},
    async addMsg(t,text,name){
      const me=auth.currentUser.email.toLowerCase(),tref=S.doc(db,'threads',t.id),mref=S.doc(S.collection(db,'threads',t.id,'messages')),b=S.writeBatch(db);
      b.set(mref,{by:me,name:String(name).slice(0,60),text:String(text).slice(0,1000),created:S.serverTimestamp()});
      b.update(tref,{last:String(text).slice(0,140),lastBy:me,ms:Date.now(),unread:t.parts.filter(p=>p!==me)});
      await b.commit()},
    markThreadRead:id=>S.updateDoc(S.doc(db,'threads',id),{unread:S.arrayRemove(auth.currentUser.email.toLowerCase())}),
    async notifyThread(url,id){const idToken=await auth.currentUser.getIdToken(true);const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,action:'beskjed',threadId:id})});return r.json()},
    // Politiattest (attester/{e-post}): bare datoen den ble godkjent.
    async getAttest(email){const s=await S.getDoc(S.doc(db,'attester',email));return s.exists()?{dato:s.data().dato||''}:null},
    setAttest:(email,dato)=>S.setDoc(S.doc(db,'attester',email),{dato:String(dato).slice(0,10),by:auth.currentUser.email.toLowerCase(),updated:S.serverTimestamp()}),
    delAttest:email=>sl(S.deleteDoc(S.doc(db,'attester',email))),
    async listAttester(){const s=await S.getDocs(S.collection(db,'attester'));return s.docs.map(d=>({id:d.id,dato:d.data().dato||''}))},
    async attesterFor(ids){const ut=[];for(const id of ids){try{const s=await S.getDoc(S.doc(db,'attester',id));if(s.exists())ut.push({id,dato:s.data().dato||''})}catch(e){}}return ut},
    // Bønneemner (prayers): bare medlemmer. by og ber bruker uid, ikke e-post.
    async prayersList(){const s=await S.getDocs(S.query(S.collection(db,'prayers'),S.orderBy('ms','desc'),S.limit(40)));return s.docs.map(d=>({id:d.id,...d.data()}))},
    markPrayed:ids=>sl((async()=>{const b=S.writeBatch(db),t=Date.now();ids.forEach(id=>b.update(S.doc(db,'prayers',id),{bedt:t}));await b.commit()})()),
    addPrayer:d=>S.addDoc(S.collection(db,'prayers'),{t:String(d.t).slice(0,400),name:String(d.name||'').slice(0,60),by:auth.currentUser.uid,ms:Date.now(),ber:[]}),
    // Anonyme bønneemner uten innlogging går via Apps Script (regnestykke og grenser).
    async bonnUtfordring(url){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'bonnutfordring'})});return r.json()},
    async bonnAnon(url,d){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'bonnanon',...d})});return r.json()},
    delPrayer:id=>sl(S.deleteDoc(S.doc(db,'prayers',id))),
    // Saker til lederrådet: bare administratorer og medlemmer i gruppen lederradet (reglene).
    async lrList(){const s=await S.getDocs(S.query(S.collection(db,'lrsaker'),S.orderBy('ms','desc'),S.limit(100)));return s.docs.map(d=>({id:d.id,...d.data()}))},
    lrAdd:d=>S.addDoc(S.collection(db,'lrsaker'),{t:String(d.t).slice(0,600),name:String(d.name||'').slice(0,60),by:auth.currentUser.email.toLowerCase(),ms:Date.now(),done:false}),
    lrDone:(id,v)=>sl(S.updateDoc(S.doc(db,'lrsaker',id),{done:!!v,doneMs:v?Date.now():0})),
    lrDel:id=>sl(S.deleteDoc(S.doc(db,'lrsaker',id))),
    // Kontaktinfo («Finn frem» på Hjem): alle kan lese, administrator endrer.
    async getPrivacy(){const s=await S.getDoc(S.doc(db,'settings','personvern'));return s.exists()?s.data():null},
    setPrivacy:(text,updated)=>S.setDoc(S.doc(db,'settings','personvern'),{text:String(text).slice(0,20000),updated:String(updated).slice(0,10)}),
    async getContact(){const s=await S.getDoc(S.doc(db,'settings','contact'));return s.exists()?s.data():null},
    setContact:d=>S.setDoc(S.doc(db,'settings','contact'),{address:String(d.address||'').slice(0,120),hours:String(d.hours||'').slice(0,120),phone:String(d.phone||'').slice(0,30),email:String(d.email||'').slice(0,100)}),
    // Kategorier (samlingen categories): navn og rekkefølge.
    async catsList(){const s=await S.getDocs(S.collection(db,'categories'));return s.docs.map(d=>({id:d.id,...d.data()}))},
    setCatDoc:(id,d)=>S.setDoc(S.doc(db,'categories',id),d,{merge:true}),
    delCatDoc:id=>sl(S.deleteDoc(S.doc(db,'categories',id))),
    setGroupDoc:(id,d)=>S.setDoc(S.doc(db,'groups',id),d,{merge:true}),
    delGroupDoc:id=>sl(S.deleteDoc(S.doc(db,'groups',id))),
    del:(col,id)=>sl(S.deleteDoc(S.doc(db,col,id))),
    // «Jeg kommer»: en anonym teller per arrangement. Ingen navn lagres, bare antallet.
    async counts(){const snap=await S.getDocs(S.collection(db,'rsvpCounts'));const o={};snap.docs.forEach(d=>o[d.id]=d.data().n||0);return o},
    async rsvp(id,delta){
      const ref=S.doc(db,'rsvpCounts',id),s=await S.getDoc(ref);
      if(s.exists())await S.updateDoc(ref,{n:S.increment(delta)});
      else if(delta>0)await S.setDoc(ref,{n:1});
    },
    // ---- Push-varsler (Firebase Cloud Messaging). Enhetens varselkode lagres i pushTokens; bare administratorer kan lese dem.
    async pushSupported(){try{return !!M&&await M.isSupported()&&'Notification' in window&&'serviceWorker' in navigator}catch(e){return false}},
    async enablePush(reg){
      if(!(await FB.pushSupported()))throw {code:'push/unsupported'};
      if(await Notification.requestPermission()!=='granted')throw {code:'push/denied'};
      const token=await M.getToken(M.getMessaging(app),{vapidKey:VAPID,serviceWorkerRegistration:reg});
      if(!token)throw {code:'push/no-token'};
      // Er brukeren innlogget, kobles koden til e-posten. Da kan tjenesten sende til medlemmer og grupper. Besøkende får bare «alle»-varsler.
      const ref=S.doc(db,'pushTokens',token);
      try{await S.setDoc(ref,{token,groups:[],created:S.serverTimestamp(),...(auth.currentUser?{email:auth.currentUser.email.toLowerCase()}:{})})}
      catch(e){   // reglene tillater kanskje ikke e-post ennå: lagre uten kobling, så «alle»-varsler fungerer
        if(!auth.currentUser||e.code!=='permission-denied')throw e;
        await S.setDoc(ref,{token,groups:[],created:S.serverTimestamp()});
      }
      return token;
    },
    // Kobler en eksisterende varselkode til innlogget bruker (etter innlogging), eller fjerner koblingen (før utlogging).
    // Påminnelser: ett dokument per enhet og samling. Apps Script sender varselet når fireAt er passert og sletter dokumentet.
    setReminder:(id,d)=>S.setDoc(S.doc(db,'reminders',id),{...d,created:S.serverTimestamp()}),
    delReminder:id=>S.deleteDoc(S.doc(db,'reminders',id)),
    linkPush:token=>auth.currentUser?S.setDoc(S.doc(db,'pushTokens',token),{token,groups:[],created:S.serverTimestamp(),email:auth.currentUser.email.toLowerCase()}):Promise.resolve(),
    unlinkPush:token=>S.setDoc(S.doc(db,'pushTokens',token),{token,groups:[],created:S.serverTimestamp()}),
    // Feiler høyt: kalleren beholder status og viser feil hvis abonnementet ikke faktisk ble fjernet.
    // Firebase trenger å vite hvilken service worker som eier abonnementet (reg) før koden kan slettes etter en sideinnlasting.
    // Mislykkes den vanlige slettingen, avslutter vi abonnementet direkte i nettleseren. Mislykkes begge, feiler vi høyt.
    async disablePush(token,reg){
      const m=M.getMessaging(app);
      let done=false,err;
      try{
        if(reg)await M.getToken(m,{vapidKey:VAPID,serviceWorkerRegistration:reg}).catch(()=>{});
        done=await M.deleteToken(m);
      }catch(e){err=e}
      if(!done&&reg){
        try{const sub=await reg.pushManager.getSubscription();if(sub)await sub.unsubscribe();done=true}catch(e){err=err||e}
      }
      if(!done)throw err||{code:'push/not-removed'};
      if(token)await S.deleteDoc(S.doc(db,'pushTokens',token));
    },
    // Sender varsel via Apps Script-tjenesten. Tjenesten sjekker innloggingsbeviset og at brukeren er administrator.
    // Liste over påmeldte på e-post til brukerens egen adresse (administrator eller gruppeleder).
    async sendRsvpMail(url,d){
      const idToken=await auth.currentUser.getIdToken(true);
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,action:'paameldte',title:d.title,date:d.date,names:d.names})});
      return r.json();
    },
    // Møtenotat på e-post til brukerens egen adresse (adressen tas fra innloggingsbeviset i Apps Script).
    async sendNote(url,d){
      const idToken=await auth.currentUser.getIdToken(true);
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,action:'notat',title:d.title,date:d.date,speaker:d.speaker,html:d.html})});
      return r.json();
    },
    // Nye bønneemner på e-post til brukerens egen adresse (bare administrator og bønneledere; innholdet hentes av Apps Script).
    async sendPrayers(url){
      const idToken=await auth.currentUser.getIdToken(true);
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,action:'bonn'})});
      return r.json();
    },
    // Åpne saker til lederrådet på e-post (Apps Script): administrator får dem selv, andre sender til administratorene.
    async sendSaker(url){
      const idToken=await auth.currentUser.getIdToken(true);
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,action:'saker'})});
      return r.json();
    },
    // Velkomst-e-post (Apps Script) til nylig opprettede brukere.
    async sendWelcome(url,emails){
      const idToken=await auth.currentUser.getIdToken(true);
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,action:'velkomst',emails})});
      return r.json();
    },
    async sendPush(url,title,body,tab,mal,kopi){
      const idToken=await auth.currentUser.getIdToken(true);
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,title,body,tab,mal,kopi:kopi===true})});
      return r.json();
    },
    // Sikkerhetskopi: henter alt innhold (også medlemsinnhold og brukerlister) som ren tekst. Bare administratorer får lov.
    // Varselkoder (pushTokens) tas ikke med: de er enhetsidentifikatorer og lar seg gjenskape ved at folk slår på varsler igjen.
    async exportAll(){
      const cols=['events','posts','regular','rsvpCounts','members','admins'];
      const ut=v=>v&&typeof v.toDate==='function'?{__tid:v.toDate().toISOString()}:Array.isArray(v)?v.map(ut):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,ut(x)])):v;
      const res={};
      for(const c of cols){
        const snap=await S.getDocs(S.collection(db,c));
        res[c]=snap.docs.map(d=>({id:d.id,data:ut(d.data())}));
      }
      return res;
    },
    // ---- Sikkerhetspunkter og tilbakerulling (bare administratorer) ----
    // Oversikten ligger i snapshots, selve innholdet som tekst i snapshotData. Innhold (arrangementer, nyheter, faste samlinger) erstattes ved
    // tilbakerulling. Brukerlistene (members, admins) flettes: ingen brukere slettes, og ingen administrator kan låses ute.
    async collect(cols){
      const res={};
      for(const c of cols){const snap=await S.getDocs(S.collection(db,c));res[c]=snap.docs.map(d=>({id:d.id,data:utTid(d.data())}))}
      return res;
    },
    async makeSnapshot(label){
      const data=await FB.collect(SNAP_COLS),json=JSON.stringify(data);
      if(json.length>900000)throw {code:'snapshot/too-large'};
      const counts=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length]));
      // Et automatisk punkt av et tomt innhold lages ikke: da kunne en katastrofe slette gode punkter over tid.
      if(label==='Automatisk'&&(counts.events||0)+(counts.posts||0)+(counts.regular||0)===0)return null;
      const ref=await S.addDoc(S.collection(db,'snapshots'),{created:S.serverTimestamp(),by:auth.currentUser.email,label,counts});
      await S.setDoc(S.doc(db,'snapshotData',ref.id),{json});
      FB.pruneSnapshots(30).catch(()=>{});
      return ref.id;
    },
    async listSnapshots(){
      const snap=await S.getDocs(S.query(S.collection(db,'snapshots'),S.orderBy('created','desc'),S.limit(60)));
      return snap.docs.map(d=>{const x=d.data();return {id:d.id,label:x.label,by:x.by,counts:x.counts||{},ms:x.created&&x.created.toMillis?x.created.toMillis():0}});
    },
    async pruneSnapshots(keep){
      const l=await FB.listSnapshots();
      for(const x of l.slice(keep)){await S.deleteDoc(S.doc(db,'snapshotData',x.id)).catch(()=>{});await S.deleteDoc(S.doc(db,'snapshots',x.id))}
    },
    // Lager et punkt bare hvis det siste er eldre enn minMs (så vi ikke lager ett for hver sletting).
    async ensureSnapshot(label,minMs){
      const vis=String(label).startsWith('Før');   // sikkerhetspunkt før sletting hører med til «Sletter …»
      if(vis&&window.smBusy)window.smBusy(1);
      try{const l=await FB.listSnapshots();
        return l.length&&Date.now()-l[0].ms<minMs?l[0].id:await FB.makeSnapshot(label)}
      finally{if(vis&&window.smBusy)window.smBusy(-1)}
    },
    async loadSnapshot(id){
      const s=await S.getDoc(S.doc(db,'snapshotData',id));
      if(!s.exists())throw {code:'snapshot/missing'};
      return JSON.parse(s.data().json);
    },
    // Ren planlegging (uten skriving): hva som skal skrives og slettes for å gjenskape data. current = id-er som finnes nå, per samling.
    planRestore(current,data){
      const sets=[],dels=[];
      for(const c of SNAP_COLS){
        const snap=data&&data[c];if(!Array.isArray(snap))continue;
        const ids=new Set(snap.map(x=>x.id));
        snap.forEach(x=>sets.push([c,x.id,x.data]));
        if(KEEP_COLS.includes(c))(current[c]||[]).filter(id=>!ids.has(id)).forEach(id=>dels.push([c,id]));
      }
      return {sets,dels};
    },
    async restore(data){
      const current={};
      for(const c of KEEP_COLS){const snap=await S.getDocs(S.collection(db,c));current[c]=snap.docs.map(d=>d.id)}
      const {sets,dels}=FB.planRestore(current,data);
      const ops=[...dels.map(([c,id])=>({del:[c,id]})),...sets.map(([c,id,d])=>({set:[c,id,d]}))];
      for(let i=0;i<ops.length;i+=400){
        const b=S.writeBatch(db);
        ops.slice(i,i+400).forEach(o=>{if(o.del)b.delete(S.doc(db,o.del[0],o.del[1]));else b.set(S.doc(db,o.set[0],o.set[1]),revive(o.set[2]))});
        await b.commit();
      }
      return {skrevet:sets.length,slettet:dels.length};
    },
    // Varsel som kommer mens appen er åpen (da viser ikke nettleseren noe selv).
    onPush(cb){FB.pushSupported().then(ok=>{if(ok)M.onMessage(M.getMessaging(app),cb)})},
    // Gruppene innlogget bruker tilhører (fra egen oppføring i members og admins).
    async myGroups(email){
      const ut=new Set();
      for(const c of ['members','admins']){try{const s=await S.getDoc(S.doc(db,c,email));if(s.exists())(s.data().groups||[]).forEach(g=>ut.add(g))}catch(e){}}
      return [...ut];
    },
    // Gruppene innlogget bruker er leder for (kan publisere til). Settes bare av administratorer, i feltet leads på oppføringen i members.
    async myLeads(email){try{const s=await S.getDoc(S.doc(db,'members',email));return s.exists()?(s.data().leads||[]):[]}catch(e){return []}},
    // Rollen «Leder»: feltet leder på oppføringen i members. Gir innsyn i ledersamlinger og innhold for ledere, men ikke rett til å publisere.
    // Lederkategorien til innlogget leder (tom hvis ikke leder).
    async myLtype(email){try{const s=await S.getDoc(S.doc(db,'members',email));return s.exists()&&s.data().leder===true?(s.data().ltype||''):null}catch(e){return null}},
    // Hilsen på e-post via Apps Script (bare administrator). Mottakerne finnes og avgjøres i tjenesten.
    async sendMail(url,d){
      const idToken=await auth.currentUser.getIdToken(true);
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,action:'epost',title:d.title,body:d.body,mal:d.mal})});
      return r.json();
    },
    async myLeder(email){try{const s=await S.getDoc(S.doc(db,'members',email));return s.exists()&&s.data().leder===true}catch(e){return false}},
    // Lederkategorier (samlingen leaderTypes) og hvilken kategori en leder tilhører (feltet ltype).
    async ltypesList(){const s=await S.getDocs(S.collection(db,'leaderTypes'));return s.docs.map(d=>({id:d.id,...d.data()}))},
    setLtypeDoc:(id,d)=>S.setDoc(S.doc(db,'leaderTypes',id),d,{merge:true}),
    delLtypeDoc:id=>sl(S.deleteDoc(S.doc(db,'leaderTypes',id))),
    setLtype:(email,ltype)=>S.updateDoc(S.doc(db,'members',email),{ltype}),
    setLeder:(email,v)=>S.updateDoc(S.doc(db,'members',email),{leder:!!v}),
    setLeads:(email,leads,groups)=>S.updateDoc(S.doc(db,'members',email),{leads,groups}),
    setGroups:(email,role,groups)=>S.updateDoc(S.doc(db,role==='admin'?'admins':'members',email),{groups}),
    async isMember(email){
      try{return (await S.getDoc(S.doc(db,'members',email))).exists()}catch(e){return false}
    },
    // Brukere = administratorer (samlingen admins) og medlemmer (samlingen members). Adressen er dokument-ID.
    async listUsers(){
      const [m,a]=await Promise.all([S.getDocs(S.collection(db,'members')),S.getDocs(S.collection(db,'admins'))]);
      return a.docs.map(d=>({id:d.id,role:'admin',groups:d.data().groups||[],leads:[]})).concat(m.docs.map(d=>({id:d.id,role:'member',groups:d.data().groups||[],leads:d.data().leads||[],leder:d.data().leder===true,ltype:d.data().ltype||'',name:d.data().name||''}))).sort((x,y)=>x.id<y.id?-1:1);
    },
    // Gruppeleder: medlemmer i egne grupper, legge til (oppretter kontoen hvis personen er ny) og fjerne fra en gruppe.
    async leaderMembers(leads){const s=await S.getDocs(S.collection(db,'members'));return s.docs.map(d=>({id:d.id,groups:d.data().groups||[],leads:d.data().leads||[],name:d.data().name||''})).filter(u=>u.groups.some(g=>leads.includes(g))).sort((a,b)=>a.id<b.id?-1:1)},
    async leaderAdd(email,group){
      const ref=S.doc(db,'members',email),s=await S.getDoc(ref);
      if(s.exists()){const g=new Set(s.data().groups||[]);g.add(group);await S.updateDoc(ref,{groups:[...g]});return {created:false}}
      await S.setDoc(ref,{email,rolle:'medlem',created:S.serverTimestamp(),by:auth.currentUser.email,groups:[group]});
      const pw=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%56]).join('');
      let created=true;
      try{await A.createUserWithEmailAndPassword(secAuth,email,pw);await A.signOut(secAuth)}
      catch(e){if(e.code==='auth/email-already-in-use')created=false;else throw e}
      if(created)await A.sendPasswordResetEmail(auth,email);
      return {created:true,account:created}
    },
    async leaderRemove(email,group){
      const ref=S.doc(db,'members',email),s=await S.getDoc(ref);if(!s.exists())return;
      await S.updateDoc(ref,{groups:(s.data().groups||[]).filter(g=>g!==group)});
    },
    // Legger adressen i riktig liste, oppretter kontoen med et tilfeldig passord og sender en e-post der brukeren velger passord selv.
    async addUser(email,role){
      await S.setDoc(S.doc(db,role==='admin'?'admins':'members',email),{email,rolle:role==='admin'?'admin':'medlem',created:S.serverTimestamp(),by:auth.currentUser.email});
      const pw=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%56]).join('');
      let created=true;
      try{await A.createUserWithEmailAndPassword(secAuth,email,pw);await A.signOut(secAuth)}
      catch(e){if(e.code==='auth/email-already-in-use')created=false;else throw e}
      if(created)await A.sendPasswordResetEmail(auth,email);
      return {created};
    },
    async setRole(email,role){
      const to=role==='admin'?'admins':'members',from=role==='admin'?'members':'admins';
      await S.setDoc(S.doc(db,to,email),{email,rolle:role==='admin'?'admin':'medlem',created:S.serverTimestamp(),by:auth.currentUser.email});
      await S.deleteDoc(S.doc(db,from,email));
    },
    async removeUser(email){await S.deleteDoc(S.doc(db,'members',email));await S.deleteDoc(S.doc(db,'admins',email))},
    async addMany(col,items){
      const b=S.writeBatch(db);
      items.forEach(x=>b.set(S.doc(S.collection(db,col)),{...x,created:S.serverTimestamp()}));
      return b.commit();
    }
  };
  // Lagring og sending vises med «Lagrer …» / «Sender …» til databasen eller tjenesten har svart.
  for(const n of ['setAttest','setPrivacy','setRole','newThread','addMsg','addPrayer','lrAdd','setContact','add','set','setFastEx','setProfile','saveNote','setShift','addRequest','addScheduled','setCatDoc','setGroupDoc','setLtypeDoc','setLtype','setLeder','setLeads','setGroups','setRole','addUser','leaderAdd','leaderRemove']){const f=FB[n];if(f)FB[n]=(...a)=>sl(f.apply(FB,a),'Lagrer …')}
  for(const n of ['sendPush','sendNote','sendPrayers','sendSaker','sendWelcome','sendRsvpMail','sendMail']){const f=FB[n];if(f)FB[n]=(...a)=>sl(f.apply(FB,a),'Sender …')}
  window._fbRes(FB);
}catch(e){console.warn('Firebase kunne ikke lastes, bruker JSON-filene',e);window._fbRes(null)}
