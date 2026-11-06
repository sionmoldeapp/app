const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('./varsel/node_modules/playwright-core');
const root=path.resolve(__dirname,'../..');
const app=fs.readFileSync(path.join(root,'index.html'),'utf8');
const access=fs.readFileSync(path.join(root,'tilgang.html'),'utf8');
const appStyle=app.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const custom=app.slice(app.indexOf('const cHex='),app.indexOf('const egenPalEntry='));
const palettes=['klassisk','premium','kobber','grafitt','skog','vin','iphone','android','rosa','gutta','jul','solnedgang','egen'];
let browser,server,url;
before(async()=>{
 server=http.createServer((req,res)=>{
  if(req.url.startsWith('/lib/')){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(root,req.url)));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url==='/app')res.end('<!doctype html><style>'+appStyle+'</style><script>const lsGet=k=>localStorage.getItem(k);document.documentElement.dataset.pal=lsGet("sm-pal")||"premium";if(lsGet("sm-theme"))document.documentElement.dataset.theme=lsGet("sm-theme");'+custom+'</script>');
  else res.end(access.slice(0,access.indexOf('</head>')+7)+'<body><div class="panel">Test</div></body>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',headless:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
async function colors(p){return p.evaluate(()=>{const c=getComputedStyle(document.documentElement);return ['--bg','--surface','--ink','--muted','--brand','--lamp','--line','--chip'].map(k=>c.getPropertyValue(k).trim())});}
test('Tilgang har samme farger som appen i alle paletter, lyst og mørkt',async()=>{
 const context=await browser.newContext();
 try{
  const a=await context.newPage(),b=await context.newPage();await a.goto(url);
  for(const pal of palettes)for(const theme of ['light','dark']){
   await a.evaluate(({pal,theme})=>{localStorage.setItem('sm-pal',pal);localStorage.setItem('sm-theme',theme);localStorage.setItem('sm-egen',JSON.stringify({brand:'#125f4b',bgL:'#f0e9df',bgD:'#10251d'}))},{pal,theme});
   await a.goto(url+'/app');await b.goto(url);
   assert.deepEqual(await colors(b),await colors(a),pal+' '+theme);
   assert.equal(await b.evaluate(()=>{const c=getComputedStyle(document.documentElement);return c.getPropertyValue('--surface2').trim()===c.getPropertyValue('--chip').trim()}),true,'Ekstra flater: '+pal+' '+theme);
  }
 }finally{await context.close();}
});
test('Endringer i appens fargevalg oppdaterer åpen tilgangsoversikt',async()=>{
 const context=await browser.newContext();
 try{
  const a=await context.newPage(),b=await context.newPage();await a.goto(url);await b.goto(url);
  await a.evaluate(()=>{localStorage.setItem('sm-pal','skog');localStorage.setItem('sm-theme','dark')});
  await b.waitForFunction(()=>document.documentElement.dataset.pal==='skog'&&document.documentElement.dataset.theme==='dark');
  await a.evaluate(()=>{localStorage.setItem('sm-pal','egen');localStorage.setItem('sm-egen',JSON.stringify({bgD:'#10251d'}))});
  await b.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()==='#10251d');
  await a.evaluate(()=>localStorage.clear());
  await b.waitForFunction(()=>document.documentElement.dataset.pal==='premium'&&!document.documentElement.dataset.theme);
 }finally{await context.close();}
});
test('Automatisk lys/mørk følger telefonen, eksplisitt lys overstyrer mørk',async()=>{
 const p=await browser.newPage();
 try{
  await p.emulateMedia({colorScheme:'light'});await p.goto(url);const light=await colors(p);
  await p.emulateMedia({colorScheme:'dark'});assert.notDeepEqual(await colors(p),light);
  await p.evaluate(()=>{localStorage.setItem('sm-theme','light');sionTilgangTema()});assert.deepEqual(await colors(p),light);
 }finally{await p.close();}
});
