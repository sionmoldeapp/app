// Henter innholdet og brukerne fra den ekte databasen og legger dem i testversjonen (lokal emulator). Du logger inn som administrator når du kjører den.
// Bruk:  node lokal/hent-fra-ekte.js   (emulatoren må kjøre: lokal\start-test.bat)
// E-post og passord skrives inn her og brukes bare til én innlogging mot Firebase. Ingenting lagres. Det leses bare (ca. 1 lesing per dokument). Ekte data endres aldri.
const fs=require('fs'),path=require('path'),readline=require('readline'),{execFileSync}=require('child_process');
const KEY='AIzaSyAd8OmuuLWJYI2ICbPdn7VN6DQge4lp5mA',P='sion-molde-app';   // offentlig web-nøkkel, den samme som i fb.js
const COLS=['events','posts','regular','rsvpCounts','members','admins'];
function spor(q,skjult){return new Promise(res=>{
  const rl=readline.createInterface({input:process.stdin,output:process.stdout,terminal:true});
  if(skjult){rl._writeToOutput=s=>{if(s.includes(q))process.stdout.write(s);else if(/[\r\n]/.test(s))process.stdout.write(s)}}
  rl.question(q,a=>{rl.close();res(a.trim())})})}
const les=v=>{
  if('stringValue' in v)return v.stringValue;if('integerValue' in v)return Number(v.integerValue);if('doubleValue' in v)return v.doubleValue;
  if('booleanValue' in v)return v.booleanValue;if('nullValue' in v)return null;if('timestampValue' in v)return {__tid:v.timestampValue};
  if('arrayValue' in v)return (v.arrayValue.values||[]).map(les);
  if('mapValue' in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,les(x)]));
  if('geoPointValue' in v)return v.geoPointValue;if('referenceValue' in v)return v.referenceValue;if('bytesValue' in v)return v.bytesValue;return null};
(async()=>{
  console.log('Hent fra den ekte databasen til testversjonen. Logg inn som administrator i den ekte appen.\n');
  const e=await spor('E-post: '),p=await spor('Passord (vises ikke): ',true);
  const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+KEY,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e,password:p,returnSecureToken:true})});
  const j=await r.json();if(!r.ok){console.error('Innlogging feilet: '+(j.error&&j.error.message||r.status));process.exit(1)}
  const H={authorization:'Bearer '+j.idToken},kopi={};
  for(const c of COLS){
    kopi[c]=[];let side='';
    do{
      const u='https://firestore.googleapis.com/v1/projects/'+P+'/databases/(default)/documents/'+c+'?pageSize=300'+(side?'&pageToken='+encodeURIComponent(side):'');
      const x=await fetch(u,{headers:H}),d=await x.json();
      if(!x.ok){console.error(c+': '+(d.error&&d.error.message||x.status)+(x.status===403?' (er kontoen administrator?)':''));process.exit(1)}
      (d.documents||[]).forEach(doc=>kopi[c].push({id:decodeURIComponent(doc.name.split('/').pop()),data:Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,les(v)]))}));
      side=d.nextPageToken||''
    }while(side);
    console.log(c+': '+kopi[c].length)}
  const mappe=path.join(__dirname,'data');fs.mkdirSync(mappe,{recursive:true});
  const f=path.join(mappe,'ekte-kopi.json');fs.writeFileSync(f,JSON.stringify(kopi));
  execFileSync(process.execPath,[path.join(__dirname,'importer.js'),f],{stdio:'inherit'});
  fs.unlinkSync(f);console.log('\nFerdig. Kopifilen er slettet igjen.')
})().catch(x=>{console.error(x.message);process.exit(1)});
