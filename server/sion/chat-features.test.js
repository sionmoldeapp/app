const {test,before,after}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('./varsel/node_modules/playwright-core');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const readers=source.slice(source.indexOf('const chatLesVent='),source.indexOf('function chatMsgs(sist){'));
let browser,server,url;
before(async()=>{server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><style>'+[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'</style><div id="fixture"></div>');}
  if(req.url!=='/lib/chat-dictation.js'){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,req.url)));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',headless:true});});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
async function dictation(){const p=await browser.newPage();await p.goto(url);await p.evaluate(async()=>{
  window.inserted=[];window.current=true;window.started=0;window.aborted=0;
  window.SpeechRecognition=class{constructor(){window.rec=this;}start(){started++;}stop(){this.onend?.();}abort(){aborted++;}};
  const m=await import('/lib/chat-dictation.js');m.openDictation({isCurrent:()=>current,insert:t=>{inserted.push(t);return true;}});
});return p;}
test('Diktering starter bare ved Start og setter et utkast før Bruk',async()=>{
 const p=await dictation();try{assert.equal(await p.evaluate(()=>started),0);await p.click('[data-start]');
 await p.evaluate(()=>rec.onresult({results:[[{transcript:'Dette er en test'}]]}));assert.deepEqual(await p.evaluate(()=>inserted),[]);
 await p.evaluate(()=>rec.onend());await p.fill('[data-draft]','Dette er rettet tekst');await p.click('[data-use]');
 assert.deepEqual(await p.evaluate(()=>inserted),['Dette er rettet tekst']);assert.equal(await p.locator('dialog').count(),0);
 }finally{await p.close();}
});
test('Avbryt og samtalebytte stopper gjenkjenningen uten å sette inn tekst',async()=>{
 const p=await dictation();try{await p.click('[data-start]');await p.evaluate(()=>rec.onresult({results:[[{transcript:'ikke send'}]]}));
 await p.evaluate(()=>SionDictation.close());assert.deepEqual(await p.evaluate(()=>inserted),[]);assert.equal(await p.evaluate(()=>aborted),1);
 }finally{await p.close();}
});
test('Mikrofonfeil gir forståelig melding og kan prøves igjen',async()=>{
 const p=await dictation();try{await p.click('[data-start]');await p.evaluate(()=>rec.onerror({error:'not-allowed'}));
 assert.match(await p.locator('[data-status]').innerText(),/ikke tillatt/);assert.equal(await p.locator('[data-start]').isEnabled(),true);
 }finally{await p.close();}
});
async function receiptPage(){const p=await browser.newPage({viewport:{width:390,height:640}});await p.goto(url);await p.evaluate(code=>{
 document.getElementById('fixture').innerHTML='<div id="cMsg" style="height:180px;overflow:auto"><div class="cb" data-msg="visible" style="height:70px">Synlig</div><div style="height:350px"></div><div class="cb" data-msg="below" style="height:70px">Under</div></div>';
 window.state={chat:{id:'group',vis:true,vy:'samtale',msgs:[{id:'visible',by:'sender@example.test',name:'Avsender',seen:[]},{id:'below',by:'sender@example.test',seen:[]}]}};
 window.thread={id:'group',kind:'gruppe',parts:['sender@example.test','reader@example.test','reader2@example.test']};window.calls=[];
 window.chatTraad=()=>thread;window.meEmail=()=> 'reader@example.test';window.FB={markMsgsSeen:async(t,ids)=>calls.push(ids)};
 window.chatMsgs=()=>{};window.chatFolkAlle=()=>[{id:'reader@example.test',name:'Testleser'},{id:'reader2@example.test',name:'Andre leser'}];
 window.chatAv=n=>'<span class="cav">'+n[0]+'</span>';window.esc=s=>String(s).replace(/[&<>"']/g,'');(0,eval)(code);
 },readers);return p;}
test('Bare faktisk synlig melding kvitteres, ikke skjulte eller uleste meldinger lenger ned',async()=>{
 const p=await receiptPage();try{await p.evaluate(()=>chatLesSynlig());assert.deepEqual(await p.evaluate(()=>calls),[['visible']]);
 await p.evaluate(()=>chatLesSynlig());assert.deepEqual(await p.evaluate(()=>calls),[['visible']]);
 }finally{await p.close();}
});
test('Lesing registreres ikke bak en åpen dialog',async()=>{
 const p=await receiptPage();try{await p.evaluate(()=>{const d=document.createElement('dialog');document.body.append(d);d.showModal();chatLesSynlig();});
 assert.deepEqual(await p.evaluate(()=>calls),[]);
 }finally{await p.close();}
});
test('Leserikoner filtrerer duplikater og fremmede; langt trykk åpner navneliste',async()=>{
 const p=await receiptPage();try{await p.evaluate(()=>{const m=state.chat.msgs[0];m.seen=['reader@example.test','reader@example.test','reader2@example.test','outside@example.test'];document.getElementById('fixture').insertAdjacentHTML('beforeend',chatLesereHtml(m,thread,false));});
 assert.equal(await p.locator('[data-creaders] .cav').count(),2);const button=p.locator('[data-creaders]');await button.hover();await p.mouse.down();
 await p.waitForSelector('dialog[open]');await p.mouse.up();assert.match(await p.locator('.creaderslist').innerText(),/Testleser/);assert.match(await p.locator('.creaderslist').innerText(),/Andre leser/);assert.doesNotMatch(await p.locator('.creaderslist').innerText(),/outside/);
 }finally{await p.close();}
});
test('Skrivefelt og nye verktøy passer på en smal telefon',async()=>{
 const p=await browser.newPage({viewport:{width:320,height:640}});try{await p.goto(url);
 const start=source.indexOf('function chatRamme('),code=source.slice(start,source.indexOf('/* Bytter mellom send-knapp',start))+'\n'+source.slice(source.indexOf('function chatInpOppd(){'),source.indexOf('function chatBar(){'));
 await p.evaluate(code=>{
  document.getElementById('fixture').innerHTML='<div id="chat" class="chat"><div class="cw"></div></div>';
  window.state={chat:{id:'test'}};window.SUPA_NA=true;window.chatTraad=()=>({kind:'gruppe'});window.chatW=()=>document.querySelector('.cw');window.esc=s=>s;
  for(const k of ['RINGIKON','CHAT_FULL_UT','CHAT_FULL_INN','CHEVIKON','KAMIKON','GALLERIKON','MIKIKON','chatSend'])window[k]='';
  window.chatPanelHtml=()=>'';window.chatHurtigHtml=()=>'';(0,eval)(code);chatRamme('Testgruppe','','','','');
 },code);
 const bounds=await p.evaluate(()=>{const f=document.getElementById('cForm'),t=document.getElementById('cT');return {scroll:f.scrollWidth,width:f.clientWidth,text:t.getBoundingClientRect().width};});
 assert.ok(bounds.scroll<=bounds.width+1,JSON.stringify(bounds));assert.ok(bounds.text>=100,JSON.stringify(bounds));
 await p.evaluate(()=>{state.chat.verk=true;chatInpOppd();});assert.equal(await p.locator('#cVerk').isVisible(),true);assert.equal(await p.locator('[data-cdictate]').isVisible(),true);
 }finally{await p.close();}
});
