const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),src=fs.readFileSync(path.join(root,'index.html'),'utf8');
test('Alle medlemmer får ny privat melding, lederverktøy krever fortsatt lederrolle',()=>{
 const context=vm.createContext({state:{user:{},member:true,admin:false,leads:[]},isLeader:()=>false,kanAlle:()=>false,GROUPS:[['activ8','Activ8']],chatPeople:[{id:'me@example.test',name:'Meg'},{id:'other@example.test',name:'Annet medlem'}],meEmail:()=> 'me@example.test'});
 for(const name of ['chatKan','chatLedKan','chatFolkAlle','chatGrupper'])vm.runInContext(src.match(new RegExp('const '+name+'=[^\\n]+'))[0],context);
 assert.equal(vm.runInContext('chatKan()',context),true);assert.equal(vm.runInContext('chatLedKan()',context),false);
 assert.equal(vm.runInContext('chatGrupper().length',context),0);assert.equal(vm.runInContext('chatFolkAlle()[0].id',context),'other@example.test');
 context.state.member=false;assert.equal(vm.runInContext('chatKan()',context),false);
 context.state.member=true;context.state.admin=true;assert.equal(vm.runInContext('chatLedKan()',context),true);
 const list=src.slice(src.indexOf('const chatListeHtml='),src.indexOf('function chatPanelHtml'));
 assert.match(list,/chatKan\(\)\?'<button[^\n]+data-chatnyv/);
});
test('Vanlig medlem får personvalg uten gruppeutsending eller ledermenyer',()=>{
 const box={innerHTML:''};
 const context=vm.createContext({state:{chat:{},user:{},member:true},chatHistSikre:()=>{},chatStoppMsgs:()=>{},chatW:()=>box,chatOmrader:()=>[],kanAlle:()=>false,chatLedKan:()=>false,chatGrupper:()=>[],chatNyPersonerHtml:()=>'<button data-chatpers="other@example.test">Annet medlem</button>'});
 vm.runInContext(src.slice(src.indexOf('function chatNyVelg(){'),src.indexOf('function chatGruppeSkriv(')),context);
 vm.runInContext('chatNyVelg()',context);
 assert.match(box.innerHTML,/data-chatpers="other@example.test"/);
 assert.doesNotMatch(box.innerHTML,/data-chatgr=|data-chatgrsamt|data-chatavstny|Du leder ingen grupper/);
});
test('Firebase-regler tillater medlems-DM og avviser uvedkommende',async()=>{
 const project='demo-codex-chat-members',base='http://127.0.0.1:8080',db=base+'/v1/projects/'+project+'/databases/(default)/documents';
 const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
 const r=await fetch(base+'/emulator/v1/projects/'+project+':securityRules',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:rules}]}})});
 assert.ok(r.ok,await r.text());
 const token=email=>{const b=v=>Buffer.from(JSON.stringify(v)).toString('base64url');return b({alg:'none',typ:'JWT'})+'.'+b({iss:'https://securetoken.google.com/'+project,aud:project,sub:email,user_id:email,email,email_verified:true,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'password'}})+'.'};
 const fields=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,Array.isArray(v)?{arrayValue:{values:v.map(x=>({stringValue:x}))}}:typeof v==='number'?{integerValue:String(v)}:{stringValue:v}]));
 async function commit(email,writes){return fetch(db+':commit',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(email?token(email):'owner')},body:JSON.stringify({writes})});}
 const write=(id,o,created=false)=>({update:{name:'projects/'+project+'/databases/(default)/documents/'+id,fields:fields(o)},...(created?{updateTransforms:[{fieldPath:'created',setToServerValue:'REQUEST_TIME'}]}:{})});
 const a='chat-a@example.test',b='chat-b@example.test',c='chat-c@example.test';
 try{
  assert.ok((await commit(null,[write('members/'+a,{name:'Test A'}),write('members/'+b,{name:'Test B'}),write('members/'+c,{name:'Test C'})])).ok);
  const thread=(id,to)=>write('threads/'+id,{roleId:'dm',roleName:'Beskjed',kind:'dm',toName:'Test',from:a,fromName:'Test A',parts:[a,to],last:'Test',lastBy:a,ms:1,unread:[to]},true);
  let result=await commit(a,[thread('member-dm',b),write('threads/member-dm/messages/first',{by:a,name:'Test A',text:'Test'},true)]);assert.ok(result.ok,await result.text());
  result=await commit(b,[write('threads/member-dm/messages/reply',{by:b,name:'Test B',text:'Svar'},true)]);assert.ok(result.ok,await result.text());
  result=await fetch(db+'/threads/member-dm',{headers:{Authorization:'Bearer '+token(c)}});assert.equal(result.status,403);
  result=await commit(a,[thread('invalid-dm','not-member@example.test')]);assert.equal(result.status,403);
  result=await fetch(db+'/members',{headers:{Authorization:'Bearer '+token(a)}});assert.ok(result.ok,await result.text());
  result=await fetch(db+'/members',{headers:{Authorization:'Bearer '+token('outsider@example.test')}});assert.equal(result.status,403);
  result=await commit(a,[write('members/'+a,{name:'Test A',leads:['activ8']})]);assert.equal(result.status,403);
 }finally{await fetch(base+'/emulator/v1/projects/'+project+'/databases/(default)/documents',{method:'DELETE'});}
});
