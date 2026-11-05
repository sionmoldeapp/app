// F22: sannferdige anropsstatuser i klienten (ringStart, ringInn, ringSvar, ringNei). Kjører koden fra index.html i en tom side med stubber. Ingen ekte anrop.
const {test,before,after}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('./varsel/node_modules/playwright-core');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n');
const kode=source.slice(source.indexOf('const ring={ut:'),source.indexOf('setInterval(ringLytt,5e3);'));
let browser,server,url;
before(async()=>{server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><style>'+[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'</style><div id="fixture"></div>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',headless:true});});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
async function side(){const p=await browser.newPage({viewport:{width:390,height:700}});await p.goto(url);await p.evaluate(k=>{
  window.events=[];window.watchCb=null;window.watchErr=null;window.timers=[];window.toasts=[];window.sounds=[];
  window.esc=s=>String(s).replace(/[&<>"']/g,'');window.push=(t,b)=>toasts.push(t+': '+b);window.lydSpill=n=>sounds.push(n);
  window.tale={tid:null,mic:null};window.taleMic=async()=>{};window.taleMicAv=()=>{};window.taleRing=()=>{};window.taleSvar=r=>events.push('taleSvar');
  window.summ={vm:{},avv:{},akt:null};window.summStopp=()=>{};window.summStart=()=>{};window.summMerke=()=>{};window.nyBeskjedNavn=()=>'Meg';window.chatNavn=()=> 'Mottaker';window.meEmail=()=> 'meg@example.test';window.PUSH_URL='';window.SUPA_NA=true;window.chatVideoStart=o=>events.push('video:'+o.tid);
  window.chatAv=n=>'<span class="cav">'+n[0]+'</span>';window.cbgUrl=async()=>'';window.chatTile=async()=>'';window.chatTraad=id=>({id,parts:['meg@example.test','dem@example.test']});window.state={chat:{id:'t1'}};
  window.FB={ringStart:async(tid,til,navn,callId)=>events.push('start:'+callId),addMsg:async()=>{},notifyThread:async()=>{},ringPuls:async()=>{},ringSett:async()=>{},
    watchRing:(tid,cb,err)=>{watchCb=cb;watchErr=err;return()=>{}},ringEvent:async(tid,callId,ev)=>{events.push(ev+':'+callId);return true}};
  const st=window.setTimeout;window.setTimeout=(f,ms)=>{if(ms===45e3){timers.push(f);return 0}return st(f,ms)};
  (0,eval)(k+';window.ring=ring;window.ringSkriv=ringSkriv;window.ringStart=ringStart;window.ringInn=ringInn;window.ringSvar=ringSvar;window.ringNei=ringNei;window.ringAvbryt=ringAvbryt;window.ringLukk=ringLukk;window.rKnapp=rKnapp;window.RIKON=RIKON;window.ringSkjerm=ringSkjerm;');
 },kode);return p;}
const vindu=p=>p.evaluate(()=>(document.getElementById('ringov')||{}).textContent||'');
async function ring(p){await p.evaluate(()=>{ringStart()});await p.waitForFunction(()=>events.some(e=>e.startsWith('start:')));}

test('Den som ringer ser «Prøver å nå» først og «Ringer hos» først når mottakeren har bekreftet',async()=>{
  const p=await side();try{await ring(p);assert.match(await vindu(p),/Mottaker.*Kobler til/);
    await p.evaluate(()=>{const c=ring.ut.callId;watchCb({status:'ring',callId:c,levert:[]})});assert.match(await vindu(p),/Kobler til/);
    await p.evaluate(()=>{const c=ring.ut.callId;watchCb({status:'ring',callId:c,levert:['dem@example.test']})});assert.match(await vindu(p),/Mottaker.*Ringer …/);
  }finally{await p.close();}});
test('Avvist, opptatt og ingen svar vises med egne tekster og en OK-knapp som lukker',async()=>{
  for(const [status,tekst] of [['avvist',/Avvist/],['opptatt',/Opptatt/],['utlopt',/Ingen svar/]]){
    const p=await side();try{await ring(p);await p.evaluate(s=>{watchCb({status:s,callId:ring.ut.callId,levert:[]})},status);
      assert.match(await vindu(p),tekst);assert.equal(await p.evaluate(()=>!!document.querySelector('#ringov [data-ringlukk]')),true);
      await p.evaluate(()=>ringLukk());assert.equal(await vindu(p),'');assert.equal(await p.evaluate(()=>ring.ut),null);
    }finally{await p.close();}}});
test('Tidsavbrudd etter 45 sekunder sender timeout, og lyttefeil gir Forbindelsesfeil',async()=>{
  const p=await side();try{await ring(p);await p.evaluate(()=>timers[0]());
    assert.ok((await p.evaluate(()=>events)).some(e=>e.startsWith('timeout:')));
    await p.evaluate(()=>{watchErr&&watchErr(new Error('x'))});assert.match(await vindu(p),/Forbindelsesfeil/);
  }finally{await p.close();}});
test('Avbryt sender cancel for samme runde',async()=>{
  const p=await side();try{await ring(p);const c=await p.evaluate(()=>ring.ut.callId);await p.evaluate(()=>ringAvbryt());
    assert.ok((await p.evaluate(()=>events)).includes('cancel:'+c));assert.equal(await vindu(p),'');
  }finally{await p.close();}});

test('Avbryt mens oppstart venter skal ikke etterlate puls, lytter eller anropsmelding',async()=>{
  const p=await side();try{
    await p.evaluate(()=>{
      FB.ringStart=()=>new Promise(resolve=>{window.fullforStart=resolve});
      FB.addMsg=async()=>{events.push('anropsmelding')};
      FB.watchRing=()=>{events.push('lytter');return()=>{}};
      ringStart();
    });
    await p.waitForFunction(()=>typeof fullforStart==='function');
    await p.evaluate(async()=>{ringAvbryt();fullforStart();await ringSkriv('t1',()=>{})});
    const resultat=await p.evaluate(()=>({
      puls:ring.hb!==null,lytter:events.includes('lytter'),
      melding:events.includes('anropsmelding'),avsluttet:ring.ut===null
    }));
    assert.deepEqual(resultat,{puls:false,lytter:false,melding:false,avsluttet:true});
  }finally{await p.close();}});
test('Mottaker bekrefter levering én gang, kan avvise og svare, og gamle anrop vises ikke',async()=>{
  const p=await side();try{const nu=Date.now(),a=(o={})=>({id:'t1',status:'ring',fra:'dem@example.test',fraNavn:'Ola',til:['meg@example.test'],ms:nu,startAt:nu,callId:'c1',levert:[],avvist:[],opptatt:[],...o});
    await p.evaluate(x=>{ringInn([x]);ringInn([x])},a());assert.match(await vindu(p),/Ola/);
    assert.deepEqual((await p.evaluate(()=>events)).filter(e=>e.startsWith('delivered')),['delivered:c1']);
    await p.evaluate(()=>ringNei());assert.equal(await vindu(p),'');assert.ok((await p.evaluate(()=>events)).includes('decline:c1'));
    await p.evaluate(x=>ringInn([x]),a({ms:Date.now()+20e3}));assert.equal(await vindu(p),'');   // fornyet puls etter «Ikke nå» vises ikke igjen
    await p.evaluate(x=>ringInn([x]),a({callId:'c2',startAt:Date.now()-50e3}));assert.equal(await vindu(p),'');   // over 45 sekunder gammelt
    await p.evaluate(x=>ringInn([x]),a({callId:'c3'}));await p.evaluate(()=>ringSvar());
    assert.ok((await p.evaluate(()=>events)).includes('answer:c3'));
    await p.waitForFunction(()=>events.includes('taleSvar'));
  }finally{await p.close();}});
test('Svar for sent gir beskjed, og den som allerede er i samtale melder opptatt uten ringevindu',async()=>{
  const p=await side();try{const nu=Date.now(),a=(o={})=>({id:'t1',status:'ring',fra:'dem@example.test',fraNavn:'Ola',til:['meg@example.test'],ms:nu,startAt:nu,callId:'c1',levert:[],avvist:[],opptatt:[],...o});
    await p.evaluate(()=>{FB.ringEvent=async(t,c,e)=>{events.push(e+':'+c);return e!=='answer'}});
    await p.evaluate(x=>{ringInn([x]);ringSvar()},a());await p.waitForFunction(()=>toasts.length);assert.match((await p.evaluate(()=>toasts))[0],/avsluttet/);
    assert.equal(await p.evaluate(()=>events.includes('taleSvar')),false);
    await p.evaluate(x=>{tale.tid='x';ringInn([x]);ringInn([x])},a({callId:'c9'}));assert.equal(await vindu(p),'');
    assert.deepEqual((await p.evaluate(()=>events)).filter(e=>e.startsWith('busy')),['busy:c9']);
  }finally{await p.close();}});
test('Videoanrop: callId merkes v:, ringeren åpner video når mottakeren svarer, og mottakeren åpner video ved Svar', async () => {
  const p = await side(); try {
    await p.evaluate(() => { ringStart(true) }); await p.waitForFunction(() => events.some(e => e.startsWith('start:')));
    assert.match(await p.evaluate(() => events.find(e => e.startsWith('start:'))), /^start:v:/); assert.match(await vindu(p), /Mottaker.*Kobler til/);
    await p.evaluate(() => { watchCb({ status: 'svart', callId: ring.ut.callId, svarNavn: 'Ola' }) });
    assert.ok((await p.evaluate(() => events)).includes('video:t1'));
  } finally { await p.close(); }
  const q = await side(); try {
    const nu = Date.now();
    await q.evaluate(x => { ringInn([x]) }, { id: 't1', status: 'ring', fra: 'dem@example.test', fraNavn: 'Ola', til: ['meg@example.test'], ms: nu, startAt: nu, callId: 'v:abc', levert: [], avvist: [], opptatt: [] });
    assert.match(await vindu(q), /Videoanrop i Sionchat/); await q.evaluate(() => ringSvar());
    await q.waitForFunction(() => events.includes('video:t1')); assert.equal(await q.evaluate(() => events.includes('taleSvar')), false);
  } finally { await q.close(); }
});
const taleKode=source.slice(source.indexOf('const taleKlokke='),source.indexOf('function taleTikk(){'));

test('En sen oppstart avsluttes før et nytt anrop til samme samtale skrives',async()=>{
  const p=await side();try{
    await p.evaluate(()=>{
      window.skrev=[];window.lagret=null;
      FB.ringStart=(t,til,n,c)=>new Promise(resolve=>{skrev.push(c);window.fullfor=()=>{lagret=c;resolve()}});
      FB.ringEvent=async(t,c,e)=>{if(lagret===c)lagret=null;events.push(e+':'+c);return true};
      ringStart();
    });
    await p.waitForFunction(()=>skrev.length===1);
    const gammel=await p.evaluate(()=>ring.ut.callId);
    await p.evaluate(()=>{window.gammelFullfor=fullfor;ringAvbryt();ringStart();gammelFullfor()});
    await p.waitForFunction(()=>skrev.length===2);
    await p.evaluate(async()=>{fullfor();await ringSkriv('t1',()=>{})});
    assert.notEqual(await p.evaluate(()=>ring.ut.callId),gammel);
    assert.equal(await p.evaluate(()=>lagret===ring.ut.callId),true);
    assert.equal(await p.evaluate(()=>events.includes('cancel:'+skrev[0])),true);
  }finally{await p.close();}});

test('En sen oppstartsfeil eller gammel lyttefeil avslutter ikke et nyere anrop',async()=>{
  const p=await side();try{
    await p.evaluate(()=>{FB.ringStart=()=>new Promise((resolve,reject)=>{window.avvisStart=reject});ringStart()});
    await p.waitForFunction(()=>typeof avvisStart==='function');
    await p.evaluate(()=>{ringAvbryt();FB.ringStart=async()=>{};ringStart();avvisStart(new Error('gammel feil'))});
    await p.waitForFunction(()=>watchErr!==null);
    assert.equal(await p.evaluate(()=>!!ring.ut&&!ring.ut.slutt&&toasts.length===0),true);
    await p.evaluate(()=>{window.gammelFeil=watchErr;ringAvbryt();ringStart()});
    await p.waitForFunction(()=>watchErr!==gammelFeil);
    await p.evaluate(()=>gammelFeil(new Error('gammel lytter')));
    assert.equal(await p.evaluate(()=>!!ring.ut&&!ring.ut.slutt),true);
  }finally{await p.close();}});

const summKode=source.slice(source.indexOf('const summ={tm:'),source.indexOf('function tilstLytt(){'));
async function summSide(){const p=await side();await p.evaluate(k=>{
  document.getElementById('fixture').innerHTML='<div id="cMsg" style="height:400px">Tom plass</div>';
  window.UI={summ:true};window.uiLagre=()=>{};window.vibrasjoner=[];
  Object.defineProperty(navigator,'vibrate',{configurable:true,value:n=>{vibrasjoner.push(n);return true}});
  FB.ringVibr=async()=>{events.push('vibr')};FB.ringSett=async(t,s)=>{events.push(s)};
  (0,eval)(k+';window.summ=summ;window.summSend=summSend;window.summSlutt=summSlutt;');
},summKode);return p;}
async function hold(p){await p.evaluate(()=>document.getElementById('cMsg').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,isPrimary:true,pointerType:'touch',clientX:30,clientY:30})));
  await p.waitForFunction(()=>summ.akt&&events.includes('vibr'));}

test('Summing stopper ved slipp, kansellert berøring og mistet vindusfokus',async()=>{
  for(const slutt of ['pointerup','pointercancel','touchend','touchcancel','blur','pagehide']){
    const p=await summSide();try{await hold(p);
      await p.evaluate(n=>{
        const el=document.getElementById('cMsg');
        el.addEventListener(n,e=>e.stopPropagation()); // slipp må fanges før andre kontroller stopper hendelsen
        if(n==='blur'||n==='pagehide')window.dispatchEvent(new Event(n));
        else if(n.startsWith('touch'))el.dispatchEvent(new TouchEvent(n,{bubbles:true,touches:[]}));
        else el.dispatchEvent(new PointerEvent(n,{bubbles:true,pointerId:1,isPrimary:true}));
      },slutt);
      assert.deepEqual(await p.evaluate(()=>({aktiv:!!summ.akt,siste:vibrasjoner.at(-1),puls:summ.hb})),{aktiv:false,siste:0,puls:0},slutt);
      await p.evaluate(()=>ringSkriv('t1',()=>{}));assert.equal(await p.evaluate(()=>events.at(-1)),'avbrutt',slutt);
    }finally{await p.close();}
  }});

test('En annen finger fjerner ikke slipp-koblingen til fingeren som summer',async()=>{
  const p=await summSide();try{await hold(p);
    await p.evaluate(()=>{
      const el=document.getElementById('cMsg');
      el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:2,isPrimary:false}));
      el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:2,isPrimary:false}));
    });
    assert.equal(await p.evaluate(()=>!!summ.akt),true);
    await p.evaluate(()=>document.body.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,isPrimary:true})));
    assert.equal(await p.evaluate(()=>summ.akt),null);
  }finally{await p.close();}});

test('Sen summestart og puls kan ikke gjenopplive summingen etter slipp',async()=>{
  const p=await summSide();try{
    await p.evaluate(()=>{
      window.signal=null;FB.ringVibr=()=>new Promise(resolve=>{window.fullforSumm=()=>{signal='vibr';resolve()}});
      FB.ringSett=async(t,s)=>{signal=s};summSend();
    });
    await p.waitForFunction(()=>typeof fullforSumm==='function');
    await p.evaluate(()=>summSlutt());
    assert.equal(await p.evaluate(()=>vibrasjoner.at(-1)),0);
    await p.evaluate(async()=>{fullforSumm();await ringSkriv('t1',()=>{})});
    assert.equal(await p.evaluate(()=>signal),'avbrutt');
    // Mottaker stopper også når det avsluttede signalet kommer frem.
    await p.evaluate(()=>{ringInn([{id:'t1',status:'vibr',ms:Date.now(),fraNavn:'Test'}])});
    assert.equal(await p.evaluate(()=>summ.akt.inn),'t1');
    await p.evaluate(()=>ringInn([{id:'t1',status:'avbrutt',ms:Date.now()}]));
    assert.equal(await p.evaluate(()=>summ.akt),null);
    assert.equal(await p.evaluate(()=>vibrasjoner.at(-1)),0);
  }finally{await p.close();}});

test('En allerede sendt summepuls fullføres før stoppsignalet, og kort trykk starter ingenting',async()=>{
  const p=await summSide();try{
    await p.evaluate(()=>{
      const el=document.getElementById('cMsg');
      el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,isPrimary:true}));
      el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,isPrimary:true}));
    });
    await p.waitForTimeout(500);assert.deepEqual(await p.evaluate(()=>events),[]);
    await p.evaluate(()=>{
      const si=window.setInterval;window.setInterval=(fn,ms)=>{if(ms===4000)window.puls=fn;return si(fn,ms)};
      window.signal=null;FB.ringVibr=async()=>{signal='vibr'};FB.ringSett=async(t,s)=>{signal=s};summSend();
    });
    await p.evaluate(()=>ringSkriv('t1',()=>{}));
    await p.evaluate(()=>{FB.ringVibr=()=>new Promise(resolve=>{window.fullforPuls=()=>{signal='vibr';resolve()}});puls()});
    await p.waitForFunction(()=>typeof fullforPuls==='function');
    await p.evaluate(async()=>{summSlutt();fullforPuls();await ringSkriv('t1',()=>{})});
    assert.equal(await p.evaluate(()=>signal),'avbrutt');
    assert.equal(await p.evaluate(()=>summ.hb),0);
  }finally{await p.close();}});

test('Nettleserens berøringsinput stopper summingen straks fingeren løftes',async()=>{
  const p=await summSide();try{
    const cdp=await p.context().newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:30,y:80}]});
    await p.waitForFunction(()=>summ.akt&&events.includes('vibr'));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await p.evaluate(()=>summ.akt),null);
    assert.equal(await p.evaluate(()=>vibrasjoner.at(-1)),0);
    await p.evaluate(()=>ringSkriv('t1',()=>{}));
    assert.equal(await p.evaluate(()=>events.at(-1)),'avbrutt');
  }finally{await p.close();}});
test('Samtaleskjermen (lyd) viser navn, Demp og Avslutt, og Demp gir «Slå på»',async()=>{
  const p=await side();try{await p.evaluate(k=>{(0,eval)(k+';window.taleVis=taleVis');tale.tid='t1';tale.navn='Ola';taleVis()},taleKode);
    let v=await vindu(p);assert.match(v,/Ola/);assert.match(v,/Demp/);assert.match(v,/Avslutt/);assert.doesNotMatch(v,/Høyttaler/);   // høyttaler vises bare når telefonen støtter valg av lydutgang
    await p.evaluate(()=>{tale.demp=true;taleVis()});v=await vindu(p);assert.match(v,/Slå på/);assert.equal(await p.evaluate(()=>!!document.querySelector('#ringov [data-taledemp][aria-pressed="true"]')),true);
  }finally{await p.close();}});
