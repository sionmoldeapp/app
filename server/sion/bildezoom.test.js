// Chatbilde: klyp med to fingre åpner fullskjerm, forstørres opptil 6 ganger, flyttes med én finger og dobbelttrykk bytter. Ekte berøringshendelser via Chrome DevTools.
const {test,before,after}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('./varsel/node_modules/playwright-core');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n');
const kode=source.slice(source.indexOf('function bildeSveip(dlg){'),source.indexOf('/* Dra samtalen mot høyre'));
let browser,server,url;
before(async()=>{server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'</style><div id="fixture"></div>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',headless:true});});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
async function side(){const ctx=await browser.newContext({viewport:{width:390,height:780},hasTouch:true,isMobile:true}),p=await ctx.newPage();await p.goto(url);
  await p.evaluate(k=>{(0,eval)(k+';window.bildeSveip=bildeSveip;window.bildeZoom=bildeZoom;');
    const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle='#39c';x.fillRect(0,0,400,300);x.fillStyle='#fc0';x.fillRect(180,130,40,40);
    const d=document.createElement('dialog');d.className='lp pub cvis';d.innerHTML='<form method="dialog" class="form"><img id="bi" src="'+c.toDataURL()+'" style="max-width:100%;max-height:70vh"></form>';document.body.appendChild(d);d.showModal();bildeSveip(d);bildeZoom(d)},kode);
  const cdp=await ctx.newCDPSession(p);return {p,cdp,ctx};}
const touch=(cdp,type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y],i)=>({x,y,id:i+1}))});
const tilst=p=>p.evaluate(()=>{const z=document.querySelector('dialog.bzoom');if(!z)return null;const m=new DOMMatrix(getComputedStyle(z.querySelector('img')).transform);return {s:m.a,tx:m.e,ty:m.f}});
async function klyp(cdp,fra,til){await touch(cdp,'touchStart',[[195-fra,390],[195+fra,390]]);for(let i=1;i<=10;i++){const d=fra+(til-fra)*i/10;await touch(cdp,'touchMove',[[195-d,390],[195+d,390]])}await touch(cdp,'touchEnd',[])}
test('Klyp åpner fullskjerm og forstørrer, men ikke over 6 ganger',async()=>{
  const {p,cdp,ctx}=await side();try{await klyp(cdp,30,150);let t=await tilst(p);assert.ok(t,'zoomvisningen åpnet');assert.ok(t.s>1.5,'forstørret: '+JSON.stringify(t));
    const s1=t.s;await touch(cdp,'touchStart',[[100,390],[290,390]]);await touch(cdp,'touchMove',[[5,390],[385,390]]);await touch(cdp,'touchMove',[[0,390],[390,390]]);await touch(cdp,'touchEnd',[]);
    t=await tilst(p);assert.ok(t.s<=6.01,'maks 6: '+t.s);
  }finally{await ctx.close()}});
test('Én finger flytter bildet når det er forstørret, og klyp inn tilbake gir passet',async()=>{
  const {p,cdp,ctx}=await side();try{await klyp(cdp,30,160);const a=await tilst(p);
    await touch(cdp,'touchStart',[[200,400]]);for(let i=1;i<=8;i++)await touch(cdp,'touchMove',[[200-i*10,400]]);await touch(cdp,'touchEnd',[]);
    const b=await tilst(p);assert.ok(Math.abs(b.tx-a.tx)>20,'flyttet: '+JSON.stringify([a,b]));
    await klyp(cdp,160,10);const c=await tilst(p);assert.ok(c.s<1.05&&Math.abs(c.tx)<1,'tilbake til passet: '+JSON.stringify(c));
  }finally{await ctx.close()}});
test('Dobbelttrykk i fullskjerm zoomer til 3 ganger og tilbake, og ✕ lukker',async()=>{
  const {p,cdp,ctx}=await side();try{await klyp(cdp,30,60);await klyp(cdp,60,10);
    const trykk=async()=>{await touch(cdp,'touchStart',[[195,390]]);await touch(cdp,'touchEnd',[])};
    await trykk();await trykk();await p.waitForTimeout(300);let t=await tilst(p);assert.ok(Math.abs(t.s-3)<.05,'3x: '+t.s);
    await trykk();await trykk();await p.waitForTimeout(300);t=await tilst(p);assert.ok(Math.abs(t.s-1)<.05,'1x: '+t.s);
    await p.evaluate(()=>document.querySelector('dialog.bzoom .bzx').click());await p.waitForTimeout(100);assert.equal(await tilst(p),null);
  }finally{await ctx.close()}});
