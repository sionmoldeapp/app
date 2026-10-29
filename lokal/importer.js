// Leser inn en sikkerhetskopi fra den ekte appen (Meg → Administrer → «Last ned sikkerhetskopi») i den lokale databasen.
// Bruk:  node lokal/importer.js "C:\sti\til\sion-sikkerhetskopi-ÅÅÅÅ-MM-DD.json"
// Brukere (members/admins) får også en innlogging i emulatoren med ett felles testpassord (skrives til lokal/innlogging.txt).
// Ekte passord kan ikke hentes ut av Firebase. Filen og dataene skal aldri på GitHub.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const P='sion-molde-app',FS='http://127.0.0.1:8080/v1/projects/'+P+'/databases/(default)/documents',AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/';
const fil=process.argv[2];if(!fil||!fs.existsSync(fil)){console.error('Oppgi sti til sikkerhetskopifilen.');process.exit(1)}
const kopi=JSON.parse(fs.readFileSync(fil,'utf8'));
const gjen=v=>v&&typeof v==='object'&&typeof v.__tid==='string'?new Date(v.__tid):Array.isArray(v)?v.map(gjen):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,gjen(x)])):v;
const val=v=>v===null||v===undefined?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?(Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v}):typeof v==='string'?{stringValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(val)}}:v instanceof Date?{timestampValue:v.toISOString()}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,val(x)]))}};
async function sett(col,id,d){
  const r=await fetch(FS+'/'+col+'/'+encodeURIComponent(id),{method:'PATCH',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({fields:Object.fromEntries(Object.entries(d).map(([k,x])=>[k,val(x)]))})});
  if(!r.ok)throw new Error(col+'/'+id+' '+r.status+' '+await r.text())}
(async()=>{
  const pass='Sion'+Math.floor(1000+Math.random()*9000)+'test',tall={};
  for(const col of Object.keys(kopi)){
    for(const x of kopi[col]){await sett(col,x.id,gjen(x.data));tall[col]=(tall[col]||0)+1}}
  const epost=[...new Set([...(kopi.members||[]),...(kopi.admins||[])].map(x=>x.id).filter(e=>e.includes('@')))];
  let nye=0;
  for(const e of epost){const r=await fetch(AUTH+'accounts:signUp?key=x',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e,password:pass})});if(r.ok)nye++}
  const f=path.join(__dirname,'innlogging.txt');
  fs.appendFileSync(f,'\nImportert fra sikkerhetskopi: alle brukerne har dette felles testpassordet i testversjonen: '+pass+'\n');
  console.log('Importert:',JSON.stringify(tall),'| innlogginger opprettet:',nye,'av',epost.length,'(felles passord i lokal/innlogging.txt)')
})().catch(e=>{console.error(e.message);process.exit(1)});
