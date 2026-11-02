const webpush=require('web-push'),{Pool}=require('pg'),e=process.env;
webpush.setVapidDetails(e.VAPID_SUBJECT,e.VAPID_PUBLIC_KEY,e.VAPID_PRIVATE_KEY);
const pool=new Pool({host:'db',user:'postgres',password:e.POSTGRES_PASSWORD,database:e.POSTGRES_DB});
(async()=>{const {rows}=await pool.query("select token from push_tokens where email='helgevalberg@gmail.com'");
for(const r of rows){const o=JSON.parse(Buffer.from(r.token,'base64url').toString());
try{const x=await webpush.sendNotification({endpoint:o.e,keys:{p256dh:o.p,auth:o.a}},JSON.stringify({notification:{title:'Test fra serveren',body:'Fikk du dette varselet? Da virker varsler.'},data:{url:'./'}}),{TTL:600,urgency:'high'});console.log('sendt',x.statusCode,new URL(o.e).host)}catch(er){console.log('feil',er.statusCode,String(er.body||er.message).slice(0,120))}}
process.exit(0)})()
