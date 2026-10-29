// Testversjonen: serverer appen og sender database- og innloggingskall videre til Firebase-emulatoren.
// Alt kommer inn på én adresse (port 8090), så én tunnel holder (se LESMEG.md).
const http=require('http'),fs=require('fs'),path=require('path');
const ROT=path.resolve(__dirname,'..'),PORT=8090;
const AUTH=9099,FIRESTORE=8080;
const TYPER={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
// Filer og mapper som aldri serveres (notater, scripts, lokale data).
const SKJULT=/^\/(\.|lokal|design|CLAUDE\.md|SAMARBEID\.md|README\.md|varsel-script\.gs|overvaaking\.gs)/i;
function proxy(req,res,port){
  const h={...req.headers,host:'127.0.0.1:'+port};
  // «Bearer owner» omgår reglene i emulatoren. Det slipper aldri gjennom fra internett.
  if(/^bearer\s+owner$/i.test(h.authorization||''))delete h.authorization;
  const p=http.request({host:'127.0.0.1',port,path:req.url,method:req.method,headers:h},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
  p.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Emulatoren svarer ikke')});
  req.pipe(p)}
http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0]);
  if(u.startsWith('/emulator/'))return void(res.writeHead(403),res.end());          // tømming/administrasjon av emulatoren
  if(/^\/(identitytoolkit|securetoken|www)\.googleapis\.com\//.test(u)||u.startsWith('/identitytoolkit.googleapis.com'))return proxy(req,res,AUTH);
  if(u.startsWith('/google.firestore.')||u.startsWith('/v1/projects/'))return proxy(req,res,FIRESTORE);
  if(SKJULT.test(u)||u.includes('..'))return void(res.writeHead(404),res.end());
  let f=path.join(ROT,u==='/'?'index.html':u);
  if(!f.startsWith(ROT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('Ikke funnet')}
  res.writeHead(200,{'content-type':TYPER[path.extname(f).toLowerCase()]||'application/octet-stream','cache-control':'no-cache'});
  fs.createReadStream(f).pipe(res)
}).listen(PORT,'127.0.0.1',()=>console.log('Testversjonen kjører på http://localhost:'+PORT));
