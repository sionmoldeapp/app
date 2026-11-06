const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('./varsel/node_modules/playwright-core');
const html=fs.readFileSync(path.resolve(__dirname,'../../tilgang.html'),'utf8');
const code=html.slice(html.indexOf('const GROUPS_DEFAULT='),html.lastIndexOf('(async()=>{'));
let browser,server,url;
before(async()=>{server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><style>'+html.match(/<style>([\s\S]*?)<\/style>/)[1]+'</style><div class="nav" id="nav" style="width:290px"></div>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',headless:true});});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
test('Felles ungdomsledervalg styrer begge team og kan fjernes samlet i editoren',async()=>{
 const p=await side();try{
  await p.evaluate(()=>regApne('medlem@example.test'));
  const choice=p.locator('[data-ungdomsteam]');
  assert.equal(await choice.count(),1);
  assert.equal(await p.locator('[data-rg="activ8"][data-v="2"],[data-rg="hangout"][data-v="2"],[data-rg="ungdomsledere"]').count(),0);
  await choice.check();
  for(const id of ['activ8','hangout'])assert.equal(await p.locator('[data-rg="'+id+'"][data-v="1"]').isDisabled(),true);
  await choice.uncheck();
  for(const id of ['activ8','hangout']){
   const member=p.locator('[data-rg="'+id+'"][data-v="1"]');
   assert.equal(await member.isDisabled(),false);assert.equal(await member.getAttribute('aria-pressed'),'true');
  }
 }finally{await p.close();}});
async function side(){const p=await browser.newPage({viewport:{width:390,height:844}});await p.goto(url);await p.evaluate(k=>{
  window.fbReady=new Promise(()=>{});
  (0,eval)(k+';window.testD=D;window.testV=V;window.tegnNav=tegnNav;window.utvalgFor=utvalgFor;window.teamNavGrener=teamNavGrener;');
  testD.groups=[{id:'activ8',name:'Activ8'},{id:'hangout',name:'Hangout'},{id:'ungdomsledere',name:'Ungdomsledere'},{id:'sondagsskole',name:'Søndagsskole'},{id:'lovsang',name:'Lovsangsteamet'},{id:'elevate',name:'Elevate'},{id:'custom-sw',name:'S Worship'},{id:'cdur',name:'Sion C-dur'},{id:'custom-kor',name:'Barnekor'},{id:'debora',name:'Debora'},{id:'bonneledere',name:'Bønneledere'},{id:'forkynnere',name:'Forkynnere'},{id:'lederradet',name:'Lederrådet'},{id:'vertskap',name:'Vertskap'}];
  testD.ltypes=[{id:'hoved',name:'Hovedledere'},{id:'ungdom',name:'Ungdomsledere'},{id:'forkynner',name:'Forkynnere'},{id:'custom',name:'Andre ledere'}];
  const u=(id,more={})=>({id:id+'@example.test',name:id,role:'member',groups:[],leads:[],extra:[],muted:[],leder:false,...more});
  testD.users=[u('admin',{role:'admin'}),u('pastor',{pastor:true}),u('raad',{groups:['lederradet']}),u('hoved',{leder:true,ltype:'hoved'}),u('omradeleder'),u('ungdom',{leder:true,ltype:'ungdom'}),u('worship',{leads:['custom-sw','elevate']}),u('kor',{leads:['custom-kor']}),u('forkynner',{leder:true,ltype:'forkynner'}),u('medlem',{groups:['custom-sw']})];
  testD.omrader=[{id:'musikk',name:'Musikk',groups:['lovsang','custom-sw'],ledere:['omradeleder@example.test']}];
  tegnNav();
},code);return p;}
test('Fem hovedoverskrifter står i avtalt rekkefølge og lovsang har fem underteam',async()=>{
 const p=await side();try{
  assert.deepEqual(await p.locator('#nav>.navgr>h3').allTextContents(),['Administratorer1','Pastorer1','Lederrådet1','Hovedledere2','Teamledere4','Andre oversikter']);
  assert.deepEqual(await p.locator('[data-seks="nav-team-lovsang"]>.seksinn>.navgr>h3').allTextContents(),['Lovsangsteamet0','Elevate1','S Worship1','Sion-Cdur0','Barnekor1']);
  for(const t of ['Ungdomslederteam','Søndagsskoleledere','Lovsangsteam ledere','Debora','Bønnegruppe','Forkynnere','Vertskap','Andre ledere'])assert.ok((await p.locator('[data-seks="nav-team"]>.seksinn').textContent()).includes(t));
 }finally{await p.close();}});
test('Sammenlegging skjuler også valgt punkt og undergrupper; hver gren beholder egen tilstand',async()=>{
 const p=await side();try{
  const parent=p.locator('[data-seks="nav-team"]>h3>button'),child=p.locator('[data-seks="nav-team-lovsang"]>h3>button');
  await p.evaluate(()=>{testV.sel={t:'team',id:'sworship'};tegnNav()});
  await child.click();assert.equal(await child.getAttribute('aria-expanded'),'false');
  await parent.click();assert.equal(await parent.getAttribute('aria-expanded'),'false');
  assert.equal(await p.locator('[data-seks="nav-team"]>.seksinn').isVisible(),false);
  await parent.focus();await p.keyboard.press('Space');
  assert.equal(await parent.getAttribute('aria-expanded'),'true');assert.equal(await child.getAttribute('aria-expanded'),'false');
  await p.evaluate(()=>tegnNav());assert.equal(await child.getAttribute('aria-expanded'),'false');
  assert.ok((await p.evaluate(()=>JSON.parse(localStorage.getItem('sm-tilg-lukket')))).includes('nav-team-lovsang'));
 }finally{await p.close();}});
test('Teamfiltre bruker faktiske lederfelt og navn, uten å telle vanlige medlemmer eller duplisere personer',async()=>{
 const p=await side();try{
  const result=await p.evaluate(()=>{
   const ids=s=>testD.users.filter(utvalgFor(s).f).map(u=>u.name);
   const before=JSON.stringify(testD.users);
   return {worship:ids({t:'team',id:'lovsang'}),youth:ids({t:'team',id:'ungdom'}),hoved:ids({t:'hoved'}),area:ids({t:'hovedomr',id:'musikk'}),raad:ids({t:'rad'}),unchanged:before===JSON.stringify(testD.users)};
  });
  assert.deepEqual(result,{worship:['worship','kor'],youth:['ungdom'],hoved:['hoved','omradeleder'],area:['omradeleder'],raad:['raad'],unchanged:true});
 }finally{await p.close();}});
test('Valg i det nye hierarkiet åpner riktig personliste i hele tilgangsoversikten',async()=>{
 const p=await side();try{
  await p.setViewportSize({width:1440,height:1000});
  await p.evaluate(()=>{document.body.innerHTML='<div id="rot"></div>';tegn()});
  await p.locator('[data-seks="nav-team-sworship"]>.seksinn>button').click();
  assert.equal(await p.locator('#liste h2').textContent(),'S Worship');
  assert.equal(await p.locator('#liste tbody tr').count(),1);
  assert.equal(await p.locator('#liste tbody .navn').textContent(),'worship');
  assert.equal(await p.locator('.stats [data-sel*=teamalle] b').textContent(),'4');
 }finally{await p.close();}});
