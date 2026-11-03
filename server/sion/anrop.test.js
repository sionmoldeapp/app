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
  window.summ={vm:{},avv:{},akt:null};window.summStopp=()=>{};window.summStart=()=>{};window.summMerke=()=>{};window.nyBeskjedNavn=()=>'Meg';window.chatNavn=()=> 'Mottaker';window.meEmail=()=> 'meg@example.test';window.PUSH_URL='';
  window.chatTraad=id=>({id,parts:['meg@example.test','dem@example.test']});window.state={chat:{id:'t1'}};
  window.FB={ringStart:async(tid,til,navn,callId)=>events.push('start:'+callId),addMsg:async()=>{},notifyThread:async()=>{},ringPuls:async()=>{},ringSett:async()=>{},
    watchRing:(tid,cb,err)=>{watchCb=cb;watchErr=err;return()=>{}},ringEvent:async(tid,callId,ev)=>{events.push(ev+':'+callId);return true}};
  const st=window.setTimeout;window.setTimeout=(f,ms)=>{if(ms===45e3){timers.push(f);return 0}return st(f,ms)};
  (0,eval)(k+';window.ring=ring;window.ringStart=ringStart;window.ringInn=ringInn;window.ringSvar=ringSvar;window.ringNei=ringNei;window.ringAvbryt=ringAvbryt;window.ringLukk=ringLukk;');
 },kode);return p;}
const vindu=p=>p.evaluate(()=>(document.getElementById('ringov')||{}).textContent||'');
async function ring(p){await p.evaluate(()=>{ringStart()});await p.waitForFunction(()=>events.some(e=>e.startsWith('start:')));}

test('Den som ringer ser «Prøver å nå» først og «Ringer hos» først når mottakeren har bekreftet',async()=>{
  const p=await side();try{await ring(p);assert.match(await vindu(p),/Prøver å nå Mottaker/);
    await p.evaluate(()=>{const c=ring.ut.callId;watchCb({status:'ring',callId:c,levert:[]})});assert.match(await vindu(p),/Prøver å nå/);
    await p.evaluate(()=>{const c=ring.ut.callId;watchCb({status:'ring',callId:c,levert:['dem@example.test']})});assert.match(await vindu(p),/Ringer hos Mottaker/);
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
