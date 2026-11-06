const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('./varsel/node_modules/playwright-core');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const code=source.match(/const CHAT_REAK=[^\n]+/)[0]+'\n'+source.match(/function chatMinReak\([^\n]+/)[0]+'\n'+source.slice(source.indexOf('const chatReakNylig='),source.indexOf('/* Angre en melding du har sendt:'))+'\n'+source.slice(source.indexOf('async function chatReak(mid,felt){'),source.indexOf('const chatLik='))+'\n'+source.slice(source.indexOf('const REAK_SOKEORD='),source.indexOf('/* Bilde i chatten:'));
let browser,server,url;
before(async()=>{server=http.createServer((req,res)=>{if(req.url==='/emoji.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,'lib/emoji-data.js')))}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'</style><div id="chat" class="chat" style="inset:0"><div id="cMsg"><div class="cb" data-msg="m">Test</div></div></div>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',headless:true})});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r))});
async function page(){const p=await browser.newPage({viewport:{width:390,height:700}});await p.goto(url);await p.addScriptTag({url:url+'/emoji.js'});await p.evaluate(code=>{
 window.state={chat:{id:'thread',msgs:[{id:'m',by:'other@example.test',text:'Test',reak:{},emo:[]}]}};
 window.meEmail=()=> 'me@example.test';window.chatTraad=()=>({kind:'dm',parts:['me@example.test','other@example.test']});
 window.chatEl=()=>document.getElementById('chat');window.chatMsgs=()=>{};window.lydSpill=()=>{};window.chatHjerteVokser=()=>{};window.nyBeskjedNavn=()=> 'Test';
 window.sent=[];window.fail=false;window.FB={reakMsg:async(...args)=>{if(fail)throw {code:'test'};sent.push(args)}};window.push=()=>{};
 window.esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');window.chatReakHtml=e=>e===':sion:'?'Sion':esc(e);window.emoKan=()=>true;window.emoLast=async()=>{};window.emoBrukt=()=>{};
 (0,eval)(code+';window.react={chatMsgMeny,chatReakVelg,chatReak,chatReakNylig,chatReakKjapp,chatReakBrukt}');
 },code);return p}
test('Siste vellykkede reaksjon vises først, også frie emojier; fjerning og feil forfalsker ikke historikken',async()=>{
 const p=await page();try{
  await p.evaluate(()=>react.chatReak('m','r_ler'));await p.evaluate(()=>react.chatReak('m','emo:🦋'));
  await p.evaluate(()=>react.chatMsgMeny('m'));
  assert.equal(await p.locator('.cmeny-pill [data-cmv]').first().getAttribute('data-cmv'),'rx:emo:🦋');
  assert.equal(await p.locator('.cmeny-pill [data-cmv]').nth(1).getAttribute('data-cmv'),'rx:r_ler');
  await p.evaluate(()=>react.chatReak('m','emo:🦋'));assert.deepEqual(await p.evaluate(()=>react.chatReakNylig()),['🦋','😂']);
  await p.evaluate(async()=>{fail=true;await react.chatReak('m','r_ild')});assert.deepEqual(await p.evaluate(()=>react.chatReakNylig()),['🦋','😂']);
  await p.reload();assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('sm-reaknylig'))[0]),'🦋');
 }finally{await p.close()}
});
test('Pluss åpner søk øverst; norsk tekst og emoji filtrerer, tomt søk viser samlingen igjen',async()=>{
 const p=await page();try{
  await p.evaluate(()=>react.chatMsgMeny('m'));await p.locator('[data-cmpl]').click();
  const search=p.locator('[data-rvsok]');await search.fill('hjerte');assert.ok(await p.locator('[data-rve="❤️"]').count());assert.equal(await p.locator('[data-rve="🐶"]').count(),0);
  await search.fill('bønn');assert.ok(await p.locator('[data-rve="🙏"]').count());
  await search.fill('🦋');assert.equal(await p.locator('[data-rve]').count(),1);
  await search.fill('ikke-en-emoji');assert.match(await p.locator('[data-rvbody]').innerText(),/Ingen treff/);
  await search.fill('');assert.ok(await p.locator('[data-rve]').count()>100);
  await p.locator('dialog.creakv').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const layout=await p.evaluate(()=>{const d=document.querySelector('dialog'),body=d.querySelector('[data-rvbody]'),input=d.querySelector('[data-rvsok]'),cancel=d.querySelector('[data-rvavbryt]');body.scrollTop=body.scrollHeight;return {scroll:body.scrollTop,search:input.getBoundingClientRect().bottom<=body.getBoundingClientRect().top,cancel:cancel.getBoundingClientRect().bottom<=innerHeight,width:d.scrollWidth<=d.clientWidth,cancelBottom:cancel.getBoundingClientRect().bottom,height:innerHeight,dialogTop:d.getBoundingClientRect().top}});
  assert.ok(layout.scroll>0);assert.ok(layout.search);assert.ok(layout.cancel,JSON.stringify(layout));assert.ok(layout.width);
  await p.evaluate(()=>document.documentElement.style.setProperty('--kb','200px'));
  assert.ok(await p.locator('[data-rvavbryt]').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight-200));
 }finally{await p.close()}
});
test('Avbryt lukker etter søk og scrolling uten å sende reaksjon; Escape virker også',async()=>{
 const p=await page();try{
  await p.evaluate(()=>react.chatReakVelg('m'));await p.locator('[data-rvsok]').fill('hjerte');await p.locator('[data-rvavbryt]').click();await p.waitForFunction(()=>!document.querySelector('dialog.creakv'));
  assert.equal(await p.evaluate(()=>sent.length),0);
  await p.evaluate(()=>react.chatReakVelg('m'));await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('dialog.creakv'));assert.equal(await p.evaluate(()=>sent.length),0);
 }finally{await p.close()}
});
test('Valg fra søkeresultat lagres som reaksjon og blir første hurtigvalg',async()=>{
 const p=await page();try{
  await p.evaluate(()=>react.chatReakVelg('m'));await p.locator('[data-rvsok]').fill('ild');await p.locator('[data-rve="🔥"]').click();await p.waitForFunction(()=>sent.length===1);
  await p.waitForFunction(()=>!document.querySelector('dialog.creakv'));assert.equal(await p.evaluate(()=>sent[0][2].legg),'r_ild');assert.equal(await p.evaluate(()=>react.chatReakKjapp()[0][0]),'r_ild');
 }finally{await p.close()}
});
