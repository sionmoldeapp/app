// Fyller emulatoren med eksempeldata og en testadministrator. Kjøres én gang etter at emulatoren er startet:  node lokal/seed.js
// Innloggingen lages tilfeldig og skrives til lokal/innlogging.txt (ligger ikke på GitHub).
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const P='sion-molde-app',FS='http://127.0.0.1:8080/v1/projects/'+P+'/databases/(default)/documents',AUTH='http://127.0.0.1:9099';
const val=v=>v===null||v===undefined?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?(Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v}):typeof v==='string'?{stringValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(val)}}:v instanceof Date?{timestampValue:v.toISOString()}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,val(x)]))}};
async function sett(col,id,d){
  const r=await fetch(FS+'/'+col+'/'+encodeURIComponent(id),{method:'PATCH',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({fields:Object.fromEntries(Object.entries(d).map(([k,x])=>[k,val(x)]))})});
  if(!r.ok)throw new Error(col+'/'+id+' '+r.status+' '+await r.text())}
(async()=>{
  const epost='admin@test.lokal',pass=crypto.randomBytes(9).toString('base64url');
  const r=await fetch(AUTH+'/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:epost,password:pass})});
  const j=await r.json();if(!r.ok&&!(j.error&&j.error.message==='EMAIL_EXISTS'))throw new Error(JSON.stringify(j));
  const ny=r.ok;
  await sett('admins',epost,{name:'Testadministrator',created:new Date()});
  await sett('members',epost,{name:'Testadministrator',groups:[],created:new Date()});
  for(const [col,fil] of [['events','events'],['posts','posts'],['regular','regular']]){
    const l=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data',fil+'.json'),'utf8'));
    for(let i=0;i<l.length;i++){const x=l[i];await sett(col,'ex'+(x.id||i+1),{...x,m:x.tag==='Medlem',created:new Date()})}}
  if(ny){fs.writeFileSync(path.join(__dirname,'innlogging.txt'),'Testversjonen\nE-post: '+epost+'\nPassord: '+pass+'\n');console.log('Testadministrator lagt inn. Innlogging: lokal/innlogging.txt')}
  else console.log('Eksempeldata oppdatert. Testadministratoren fantes fra før (passordet står i lokal/innlogging.txt).')
})().catch(e=>{console.error(e.message);process.exit(1)});
