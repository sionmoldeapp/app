const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('./varsel/node_modules/playwright-core');
const source=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const helpers=source.slice(source.indexOf('const bildePos='),source.indexOf('/* Bilde for én dato'));
const picker=source.slice(source.indexOf('const pbHtml='),source.indexOf('function richBox('));
const fields=source.slice(source.indexOf('function fields('),source.indexOf('function admItems('));
const saveStart=source.indexOf('    const t=f.dataset.type,fd=new FormData(f),d={};');
const payload=source.slice(saveStart,source.indexOf('    const wantPush=',saveStart));
let browser,server,url;
before(async()=>{server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'</style><form id="fixture" style="padding:16px"></form>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',headless:true})});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r))});
async function page(){const p=await browser.newPage({viewport:{width:390,height:844}});await p.goto(url);await p.evaluate(({helpers,picker,fields,payload})=>{
 window.esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
 window.state={admin:true};window.PUSH_URL='';window.erHovedFast=()=>false;
 window.FIELDS={events:[['img','Bilde','bilde']],regular:[['img','Bilde','bilde']],posts:[['img','Bilde','bilde']]};window.evBilde=()=>'';
 const c=document.createElement('canvas');c.width=300;c.height=600;const x=c.getContext('2d');x.fillStyle='#123456';x.fillRect(0,0,300,600);x.fillStyle='gold';x.fillRect(40,40,100,150);window.photo=c.toDataURL('image/jpeg');window.pbKomprimer=async()=>photo;
 (0,eval)(helpers+'\n'+picker+'\n'+fields+'\nwindow.crop={pbHtml,pbPos,pbVerdi,fastInfo,fastPort,bildePos,bildePosStil,bildePortHtml,fields};window.savePayload=f=>{'+payload+';return d};');
 },{helpers,picker,fields,payload});return p}
test('Redigering åpner med lagret utsnitt; slider oppdaterer begge forhåndsvisninger uten å endre originalen',async()=>{
 const p=await page();try{
  await p.evaluate(()=>{window.original={img:photo,imgPos:{x:30,y:65}};document.querySelector('#fixture').innerHTML=crop.fields('events',original)});
  assert.deepEqual(await p.locator('[data-pbpreview]').evaluateAll(es=>es.map(e=>getComputedStyle(e).objectPosition)),['30% 65%','30% 65%']);
  await p.locator('[data-pby]').fill('80');await p.locator('[data-pbx]').fill('20');
  assert.deepEqual(await p.locator('[data-pbpreview]').evaluateAll(es=>es.map(e=>getComputedStyle(e).objectPosition)),['20% 80%','20% 80%']);
  assert.deepEqual(await p.evaluate(()=>original.imgPos),{x:30,y:65});
  assert.deepEqual(await p.evaluate(()=>crop.pbPos(document.querySelector('#fixture'))),{x:20,y:80,zoom:1});
  await p.locator('[data-pbreset]').click();assert.deepEqual(await p.evaluate(()=>crop.pbPos(document.querySelector('#fixture'))),{x:50,y:25,zoom:1});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await p.close()}
});
test('Valgt utsnitt kan lagres og åpnes på nytt; bildets adresse beholdes',async()=>{
 const p=await page();try{
  await p.evaluate(()=>{const f=document.querySelector('#fixture');f.dataset.type='regular';f.innerHTML=crop.fields('regular',{img:'bilder/ingar-jensen.jpg',imgPos:{x:10,y:90}})});
  const saved=await p.evaluate(()=>savePayload(document.querySelector('#fixture')));
  assert.deepEqual(saved,{img:'bilder/ingar-jensen.jpg',imgPos:{x:10,y:90,zoom:1}});
  await p.evaluate(v=>document.querySelector('#fixture').innerHTML=crop.fields('regular',v),saved);
  assert.deepEqual(await p.locator('[data-pbpreview]').evaluateAll(es=>es.map(e=>getComputedStyle(e).objectPosition)),['10% 90%','10% 90%']);
 }finally{await p.close()}
});
test('Endring av én dato arver riktig bilde og utsnitt uten å endre hele den faste samlingen',async()=>{
 const p=await page();try{
  const result=await p.evaluate(()=>{const r={img:photo,imgPos:{x:20,y:70}};const inherited=crop.fastInfo(r,{k:'endret',title:'Annen tittel'}),own=crop.fastInfo(r,{k:'endret',img:photo+'x'}),moved=crop.fastInfo(r,{k:'endret',imgPos:{x:90,y:10}});document.querySelector('#fixture').innerHTML=crop.pbHtml('',moved.imgPos,r.img);return {inherited:inherited.imgPos,own:own.imgPos,moved:moved.imgPos,original:r.imgPos,image:crop.pbVerdi(document.querySelector('#fixture')),html:crop.fastPort(r,moved)}});
  assert.deepEqual(result.inherited,{x:20,y:70,zoom:1});assert.deepEqual(result.own,{x:50,y:25,zoom:1});assert.deepEqual(result.moved,{x:90,y:10,zoom:1});assert.deepEqual(result.original,{x:20,y:70});assert.equal(result.image,'');assert.match(result.html,/object-position:90% 10%/);
  assert.equal(await p.locator('[data-pbcrop]').isVisible(),true);
 }finally{await p.close()}
});
test('Nytt og fjernet bilde oppdaterer forhåndsvisningen; nyhetsbilder får ikke portrettverktøy',async()=>{
 const p=await page();try{
  await p.evaluate(()=>document.querySelector('#fixture').innerHTML=crop.fields('events',{}));assert.equal(await p.locator('[data-pbcrop]').isVisible(),false);
  await p.locator('[data-pbfil]').setInputFiles({name:'test.jpg',mimeType:'image/jpeg',buffer:Buffer.from('syntetisk')});
  await p.waitForFunction(()=>!document.querySelector('[data-pbcrop]').hidden);
  await p.locator('[data-pbfjern]').click();assert.equal(await p.locator('[data-pbcrop]').isVisible(),false);assert.equal(await p.evaluate(()=>crop.pbVerdi(document.querySelector('#fixture'))),'');
  await p.evaluate(()=>document.querySelector('#fixture').innerHTML=crop.fields('posts',{img:photo}));assert.equal(await p.locator('[data-pbcrop]').count(),0);
 }finally{await p.close()}
});
test('Zoom oppdaterer begge utsnitt uten å forstørre rammen og følger lagring/gjenåpning',async()=>{
 const p=await page();try{
  await p.evaluate(()=>{const f=document.querySelector('#fixture');f.dataset.type='events';f.innerHTML=crop.fields('events',{img:photo,imgPos:{x:30,y:65}})});
  const before=await p.locator('.pbforhands .event-portrait').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width));
  await p.locator('[data-pbzoom]').fill('2.5');
  assert.equal(await p.locator('[data-pbzoomvalue]').textContent(),'2.5×');
  assert.deepEqual(await p.locator('.pbforhands .event-portrait').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width)),before);
  assert.deepEqual(await p.locator('[data-pbpreview]').evaluateAll(es=>es.map(e=>getComputedStyle(e).transform)),['matrix(2.5, 0, 0, 2.5, 0, 0)','matrix(2.5, 0, 0, 2.5, 0, 0)']);
  assert.deepEqual(await p.locator('.pbforhands .event-portrait').evaluateAll(es=>es.map(e=>getComputedStyle(e).overflow)),['hidden','hidden']);
  const saved=await p.evaluate(()=>savePayload(document.querySelector('#fixture')));assert.deepEqual(saved.imgPos,{x:30,y:65,zoom:2.5});
  await p.evaluate(v=>{document.querySelector('#fixture').innerHTML=crop.fields('events',v)+'<div class="card next">'+crop.bildePortHtml('nport',v.img,v.imgPos)+'</div><div class="item open"><div class="detail">'+crop.fastPort({},v)+'</div></div>'},saved);
  assert.equal(await p.locator('[data-pbzoom]').inputValue(),'2.5');
  assert.deepEqual(await p.locator('.nport>img,.evport>img').evaluateAll(es=>es.map(e=>getComputedStyle(e).transform)),['matrix(2.5, 0, 0, 2.5, 0, 0)','matrix(2.5, 0, 0, 2.5, 0, 0)']);
  await p.locator('[data-pbreset]').click();assert.equal(await p.locator('[data-pbzoom]').inputValue(),'1');
  assert.equal(await p.evaluate(()=>crop.bildePos({zoom:99}).zoom),3);
 }finally{await p.close()}
});
