// Tester tilgangsreglene (sql/002_tilgang.sql) mot den lokale Supabase, som ulike brukere.
// Lager egne testbrukere (@test.sion) og testrader, og sletter dem til slutt. Rører ikke andre data.
// Innloggingsbevisene lages med JWT_SECRET fra server/.env, så det trengs ingen ekte kontoer.
//
// Bruk (fra server/):  node sion/test-tilgang.js        Bare lokalt, aldri mot serveren.

const fs = require('fs'), path = require('path'), crypto = require('crypto');
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  .split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const API = 'http://localhost:8088/rest/v1';
if (!/localhost|127\.0\.0\.1/.test(env.SUPABASE_PUBLIC_URL || '')) { console.error('Bare for lokal Supabase'); process.exit(1); }

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
  return h + '.' + p + '.' + crypto.createHmac('sha256', env.JWT_SECRET).update(h + '.' + p).digest('base64url');
}
const D = '@test.sion';
const bruker = navn => ({ navn, sub: crypto.randomUUID(), email: navn + D });
const B = { admin: bruker('admin'), leder: bruker('leder'), medlem: bruker('medlem'), annen: bruker('annen'), fremmed: bruker('fremmed') };
const tok = b => b ? jwt({ role: 'authenticated', aud: 'authenticated', sub: b.sub, email: b.email }) : env.ANON_KEY;
const TJ = env.SERVICE_ROLE_KEY;

async function kall(hvem, metode, sti, body, ekstra = {}) {
  const t = hvem === 'tjener' ? TJ : tok(hvem);
  const r = await fetch(API + sti, { method: metode, headers: { apikey: env.ANON_KEY, Authorization: 'Bearer ' + t,
    'Content-Type': 'application/json', Prefer: 'return=representation', ...ekstra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const tekst = await r.text();
  let data; try { data = JSON.parse(tekst); } catch { data = tekst; }
  return { status: r.status, data, ok: r.ok };
}
let ok = 0, feil = 0;
function sjekk(navn, betingelse, info) {
  if (betingelse) ok++; else { feil++; console.log('FEIL: ' + navn + (info ? '  → ' + JSON.stringify(info).slice(0, 300) : '')); }
}
// Lov = gikk gjennom og endret/ga rader. Nektet = feilkode, eller ingen rader berørt.
const lov = (navn, r) => sjekk(navn + ' (skal gå)', r.ok && (!Array.isArray(r.data) || r.data.length > 0), r);
const nekt = (navn, r) => sjekk(navn + ' (skal nektes)', !r.ok || (Array.isArray(r.data) && r.data.length === 0), r);
const ant = (navn, r, n) => sjekk(navn + ' (skal gi ' + n + ')', r.ok && Array.isArray(r.data) && r.data.length === n, r);

async function rydd() {
  const e = Object.values(B).map(b => b.email).join(',');
  for (const [t, k] of [['messages', 'by'], ['threads', 'from'], ['notes', 'owner'], ['members', 'email'], ['admins', 'email'],
    ['attester', 'email'], ['attestforslag', 'email'], ['attestfil', 'email'], ['attestfilny', 'email'], ['user_prefs', 'email'], ['lrsaker', 'by']])
    await kall('tjener', 'DELETE', '/' + t + '?' + k + '=in.(' + e + ')');
  for (const t of ['events', 'posts', 'rsvp_counts', 'push_tokens', 'prayers', 'settings', 'bookinger', 'rapporter'])
    await kall('tjener', 'DELETE', '/' + t + '?' + (t === 'push_tokens' ? 'token' : 'id') + '=like.test-*');
}

(async () => {
  await rydd();
  // Testbrukere og testinnhold (som tjener)
  // Alle radene i én innsending må ha de samme feltene (PostgREST)
  for (const [t, rader] of [
    ['admins', [{ email: B.admin.email }]],
    ['members', [
      { email: B.leder.email, groups: ['activ8'], leads: ['activ8'] },
      { email: B.medlem.email, groups: ['activ8', 'lederradet'], leads: [] },
      { email: B.annen.email, groups: ['kjokken'], leads: [] }]],
    ['events', [{ id: 'test-apen', title: 'Åpen', m: false }, { id: 'test-medlem', title: 'Medlem', m: true }]]]) {
    const r = await kall('tjener', 'POST', '/' + t, rader);
    if (!r.ok) throw new Error('Fikk ikke lagt inn testdata i ' + t + ': ' + JSON.stringify(r.data));
  }

  // --- Program ---
  const ev = h => kall(h, 'GET', '/events?id=like.test-*&select=id');
  ant('besøkende ser bare åpent', await ev(null), 1);
  ant('fremmed (innlogget, ikke medlem) ser bare åpent', await ev(B.fremmed), 1);
  ant('medlem ser alt', await ev(B.medlem), 2);
  nekt('medlem oppretter arrangement', await kall(B.medlem, 'POST', '/events', { id: 'test-x1', title: 'x', m: true }));
  lov('gruppeleder oppretter for egen gruppe', await kall(B.leder, 'POST', '/events', { id: 'test-l1', title: 'x', m: true, groups: ['activ8'] }));
  nekt('gruppeleder oppretter for annen gruppe', await kall(B.leder, 'POST', '/events', { id: 'test-l2', title: 'x', m: true, groups: ['kjokken'] }));
  nekt('gruppeleder oppretter åpent innhold', await kall(B.leder, 'POST', '/events', { id: 'test-l3', title: 'x', m: false, groups: ['activ8'] }));
  nekt('gruppeleder endrer annet innhold', await kall(B.leder, 'PATCH', '/events?id=eq.test-medlem', { title: 'hack' }));
  lov('administrator endrer', await kall(B.admin, 'PATCH', '/events?id=eq.test-medlem', { title: 'Medlem 2' }));
  nekt('besøkende sletter', await kall(null, 'DELETE', '/events?id=eq.test-apen'));

  // --- Medlemmer ---
  ant('medlem ser medlemslisten til Sionchat', await kall(B.medlem, 'GET', '/members?email=like.*' + D), 3);
  ant('gruppeleder ser listen', await kall(B.leder, 'GET', '/members?email=like.*' + D), 3);
  nekt('fremmed ser medlemmer', await kall(B.fremmed, 'GET', '/members?email=like.*' + D));
  lov('medlem endrer eget navn', await kall(B.medlem, 'PATCH', '/members?email=eq.' + B.medlem.email, { name: 'Medlem Test' }));
  nekt('medlem gir seg selv grupper', await kall(B.medlem, 'PATCH', '/members?email=eq.' + B.medlem.email, { groups: ['utleie'] }));
  nekt('medlem gjør seg til gruppeleder', await kall(B.medlem, 'PATCH', '/members?email=eq.' + B.medlem.email, { leads: ['activ8'] }));
  lov('gruppeleder legger annen inn i egen gruppe', await kall(B.leder, 'PATCH', '/members?email=eq.' + B.annen.email, { groups: ['kjokken', 'activ8'] }));
  nekt('gruppeleder legger inn i annen gruppe', await kall(B.leder, 'PATCH', '/members?email=eq.' + B.medlem.email, { groups: ['activ8', 'lederradet', 'kjokken'] }));
  nekt('gruppeleder fjerner annen gruppe', await kall(B.leder, 'PATCH', '/members?email=eq.' + B.annen.email, { groups: ['activ8'] }));
  nekt('gruppeleder endrer navn på andre', await kall(B.leder, 'PATCH', '/members?email=eq.' + B.annen.email, { name: 'x' }));
  nekt('fremmed melder seg inn', await kall(B.fremmed, 'POST', '/members', { email: B.fremmed.email }));
  nekt('medlem gjør seg til administrator', await kall(B.medlem, 'POST', '/admins', { email: B.medlem.email }));

  // --- Sionchat ---
  const tid = 'test-' + crypto.randomUUID();
  const dm = { id: tid, roleId: 'dm', roleName: 'Privat', kind: 'dm', toName: 'M', from: B.leder.email, fromName: 'L',
    parts: [B.leder.email, B.medlem.email], last: 'Hei', lastBy: B.leder.email, ms: Date.now(), unread: [B.medlem.email] };
  lov('medlem starter privat beskjed til annen', await kall(B.medlem, 'POST', '/threads', { ...dm, id: 'test-t2', from: B.medlem.email, lastBy: B.medlem.email, parts: [B.medlem.email, B.annen.email] }));
  lov('gruppeleder starter privat beskjed til medlem i egen gruppe', await kall(B.leder, 'POST', '/threads', dm));
  ant('annen ser ikke samtalen', await kall(B.annen, 'GET', '/threads?id=eq.' + tid), 0);
  lov('medlem sender melding', await kall(B.medlem, 'POST', '/messages', { thread_id: tid, id: 'm1', by: B.medlem.email, name: 'M', text: 'Takk' }));
  nekt('annen sender melding i samtalen', await kall(B.annen, 'POST', '/messages', { thread_id: tid, id: 'm2', by: B.annen.email, name: 'A', text: 'Hei' }));
  nekt('medlem sender melding som en annen', await kall(B.medlem, 'POST', '/messages', { thread_id: tid, id: 'm3', by: B.leder.email, name: 'L', text: 'x' }));
  ant('annen leser ikke meldingene', await kall(B.annen, 'GET', '/messages?thread_id=eq.' + tid), 0);
  lov('gruppeleder liker meldingen', await kall(B.leder, 'PATCH', '/messages?thread_id=eq.' + tid + '&id=eq.m1', { likes: [B.leder.email] }));
  nekt('gruppeleder liker på vegne av andre', await kall(B.leder, 'PATCH', '/messages?thread_id=eq.' + tid + '&id=eq.m1', { likes: [B.leder.email, B.annen.email] }));
  nekt('gruppeleder redigerer andres melding', await kall(B.leder, 'PATCH', '/messages?thread_id=eq.' + tid + '&id=eq.m1', { text: 'hack', redigert: true }));
  lov('medlem redigerer egen melding', await kall(B.medlem, 'PATCH', '/messages?thread_id=eq.' + tid + '&id=eq.m1', { text: 'Tusen takk', redigert: true }));
  lov('medlem sender en fil', await kall(B.medlem, 'POST', '/messages', { thread_id: tid, id: 'test-fil1', by: B.medlem.email, name: 'M', text: '', fil: { navn: 'a.pdf', type: 'application/pdf', str: 3, data: 'data:application/pdf;base64,QUJD' } }));
  nekt('medlem sender for stor fil', await kall(B.medlem, 'POST', '/messages', { thread_id: tid, id: 'test-fil2', by: B.medlem.email, name: 'M', text: '', fil: { navn: 'a.pdf', type: 'application/pdf', str: 3, data: 'data:' + 'x'.repeat(700001) } }));
  nekt('medlem sender fil med ukjent felt', await kall(B.medlem, 'POST', '/messages', { thread_id: tid, id: 'test-fil3', by: B.medlem.email, name: 'M', text: '', fil: { navn: 'a.pdf', type: 'x', str: 3, data: 'data:x', url: 'http://x' } }));
  lov('leder reagerer med fri emoji', await kall(B.leder, 'PATCH', '/messages?id=eq.test-fil1', { emo: [B.leder.email + ' 🎉'] }));
  lov('leder bytter fri emoji (fjern)', await kall(B.leder, 'PATCH', '/messages?id=eq.test-fil1', { emo: [] }));
  nekt('leder setter emoji for en annen', await kall(B.leder, 'PATCH', '/messages?id=eq.test-fil1', { emo: [B.medlem.email + ' 🎉'] }));
  nekt('leder legger til to emojier samtidig', await kall(B.leder, 'PATCH', '/messages?id=eq.test-fil1', { emo: [B.leder.email + ' 🎉', B.leder.email + ' 🌟'] }));
  lov('medlem angrer filen', await kall(B.medlem, 'PATCH', '/messages?id=eq.test-fil1', { text: '', slettet: true, fil: null }));
  lov('medlem fester samtalen for seg', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { festet: [B.medlem.email] }));
  nekt('medlem fester for en annen', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { festet: [B.medlem.email, B.leder.email] }));
  lov('medlem arkiverer samtalen for seg', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { arkiv: [B.medlem.email] }));
  lov('medlem henter fra arkivet', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { arkiv: [] }));
  lov('medlem blokkerer en person', await kall(B.medlem, 'POST', '/user_prefs', { email: B.medlem.email, blokkert: [B.leder.email] }, { Prefer: 'resolution=merge-duplicates,return=representation' }));
  nekt('medlem lagrer innstillinger for en annen', await kall(B.medlem, 'POST', '/user_prefs', { email: B.annen.email, blokkert: [B.leder.email] }, { Prefer: 'resolution=merge-duplicates,return=representation' }));
  lov('medlem rapporterer en melding', await kall(B.medlem, 'POST', '/rapporter', { id: 'test-rp1', fra: B.medlem.email, fraNavn: 'M', tid, mid: 'x', hvem: B.leder.email, hvemNavn: 'L', utdrag: 'Hei', grunn: 'Test', ms: 1 }, { Prefer: 'return=minimal' }));
  nekt('medlem rapporterer i en annens navn', await kall(B.medlem, 'POST', '/rapporter', { id: 'test-rp2', fra: B.annen.email, fraNavn: 'A', tid, mid: '', hvem: '', hvemNavn: '', utdrag: '', grunn: 'Test', ms: 1 }, { Prefer: 'return=minimal' }));
  ant('medlem leser ikke rapporter', await kall(B.medlem, 'GET', '/rapporter?id=eq.test-rp1'), 0);
  ant('administrator leser rapporten', await kall(B.admin, 'GET', '/rapporter?id=eq.test-rp1'), 1);
  lov('administrator sletter rapporten', await kall(B.admin, 'DELETE', '/rapporter?id=eq.test-rp1'));
  lov('medlem kvitterer levert for siste melding', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { levert: [B.medlem.email + ':' + dm.ms] }));
  nekt('medlem kvitterer levert for en annen', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { levert: [B.medlem.email + ':' + dm.ms, B.leder.email + ':' + dm.ms] }));
  nekt('medlem kvitterer levert for feil melding', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { levert: [B.medlem.email + ':' + dm.ms, B.medlem.email + ':1'] }));
  nekt('medlem fjerner en levert-kvittering', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { levert: [] }));
  lov('ny melding tømmer levert', await kall(B.leder, 'PATCH', '/threads?id=eq.' + tid, { last: 'Hei igjen', lastBy: B.leder.email, ms: dm.ms + 1, unread: [B.medlem.email], levert: [] }));
  lov('medlem markerer som lest', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { unread: [] }));
  nekt('medlem legger til deltaker', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { parts: [B.leder.email, B.medlem.email, B.annen.email] }));
  nekt('medlem setter ulest for utenforstående', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { unread: [B.annen.email] }));
  lov('medlem skjuler samtalen for seg', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { gone: [B.medlem.email] }));
  lov('medlem velger eget bakgrunnsbilde', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { bakgrunn: 'eget', bgv: Date.now() }));
  lov('medlem velger Aurora-bakgrunnen', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { bakgrunn: 'aurora' }));
  lov('medlem setter eget nytt navn (navn og toName)', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { navn: { [B.medlem.email]: 'Nytt Navn' }, toName: 'Nytt Navn' }));
  nekt('medlem endrer navnet til en annen deltaker', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { navn: { [B.medlem.email]: 'Nytt Navn', [B.leder.email]: 'Hacket' } }));
  nekt('medlem endrer fromName (startet ikke samtalen)', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { fromName: 'Hacket' }));
  nekt('medlem setter for langt navn', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { navn: { [B.medlem.email]: 'x'.repeat(61) } }));
  lov('gruppeleder setter eget nytt navn (fromName)', await kall(B.leder, 'PATCH', '/threads?id=eq.' + tid, { navn: { [B.medlem.email]: 'Nytt Navn', [B.leder.email]: 'Ny Leder' }, fromName: 'Ny Leder' }));
  nekt('gruppeleder endrer toName (er ikke mottakeren)', await kall(B.leder, 'PATCH', '/threads?id=eq.' + tid, { toName: 'Hacket' }));
  lov('medlem velger Neon 1-bakgrunnen', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { bakgrunn: 'neon1' }));
  // Summing (ringer, status vibr): den andre i samtalen kan overskrive forrige summing/ringing, som i Firestore
  const ups = { Prefer: 'return=representation,resolution=merge-duplicates' }, summ = (fra, til) => ({ id: tid, fra: fra.email, fraNavn: 'Test', til: [til.email], status: 'vibr', ms: Date.now() });
  lov('gruppeleder summer i samtalen', await kall(B.leder, 'POST', '/ringer?on_conflict=id', summ(B.leder, B.medlem), ups));
  lov('medlem summer tilbake i samme samtale', await kall(B.medlem, 'POST', '/ringer?on_conflict=id', summ(B.medlem, B.leder), ups));
  lov('medlem stopper summingen', await kall(B.medlem, 'PATCH', '/ringer?id=eq.' + tid, { status: 'avbrutt' }));
  nekt('utenforstående summer i samtalen', await kall(B.annen, 'POST', '/ringer?on_conflict=id', summ(B.annen, B.leder), ups));
  nekt('summing i andres navn', await kall(B.medlem, 'POST', '/ringer?on_conflict=id', summ(B.leder, B.medlem), ups));
  // Anrop med bekreftelser (010): unik runde, levert/avvist/opptatt per mottaker, tidsavbrudd
  const anrop = (c, ms = Date.now()) => ({ id: tid, fra: B.leder.email, fraNavn: 'Test', til: [B.medlem.email], status: 'ring', ms, callId: c, startAt: ms, levert: [], avvist: [], opptatt: [] });
  const hend = (hvem, c, e) => kall(hvem, 'POST', '/rpc/chat_ring_event', { p_thread: tid, p_call: c, p_event: e, p_name: 'Test' });
  const les = async () => ((await kall('tjener', 'GET', '/ringer?id=eq.' + tid)).data || [])[0] || {};
  lov('leder starter anrop med runde-id', await kall(B.leder, 'POST', '/ringer?on_conflict=id', anrop('c1'), ups));
  let h = await hend(B.medlem, 'c1', 'delivered');
  sjekk('mottaker bekrefter levering', h.ok && h.data === true && (await les()).levert.includes(B.medlem.email), h);
  h = await hend(B.annen, 'c1', 'delivered');
  sjekk('utenforstående sender anropshendelse uten virkning', (!h.ok || h.data === false) && !(await les()).levert.includes(B.annen.email), h);
  h = await hend(B.medlem, 'annen-runde', 'delivered');
  sjekk('feil runde-id endrer ingenting', h.ok && h.data === false, h);
  nekt('mottaker setter utløpt selv', await kall(B.medlem, 'PATCH', '/ringer?id=eq.' + tid, { status: 'utlopt' }));
  nekt('mottaker fjerner levert-bekreftelsen', await kall(B.medlem, 'PATCH', '/ringer?id=eq.' + tid, { levert: [] }));
  h = await hend(B.medlem, 'c1', 'decline');
  sjekk('mottaker avviser (én mottaker gir status avvist)', h.ok && h.data === true && (await les()).status === 'avvist', h);
  await kall(B.leder, 'POST', '/ringer?on_conflict=id', anrop('c2'), ups);
  h = await hend(B.medlem, 'c2', 'busy');
  sjekk('mottaker melder opptatt', h.ok && h.data === true && (await les()).status === 'opptatt', h);
  await kall(B.leder, 'POST', '/ringer?on_conflict=id', anrop('c3'), ups);
  nekt('mottaker kan ikke gi tidsavbrudd', await hend(B.medlem, 'c3', 'timeout'));
  h = await hend(B.leder, 'c3', 'timeout');
  sjekk('den som ringer gir tidsavbrudd', h.ok && h.data === true && (await les()).status === 'utlopt', h);
  await kall(B.leder, 'POST', '/ringer?on_conflict=id', anrop('c4', Date.now() - 60e3), ups);
  h = await hend(B.medlem, 'c4', 'answer');
  sjekk('for sent svar etter 45 sekunder avvises', h.ok && h.data === false && (await les()).status === 'ring', h);
  await kall(B.leder, 'POST', '/ringer?on_conflict=id', anrop('c5'), ups);
  h = await hend(B.medlem, 'c5', 'answer');
  sjekk('mottaker svarer i tide', h.ok && h.data === true && (await les()).status === 'svart', h);
  await kall('tjener', 'DELETE', '/ringer?id=eq.' + tid);
  // Tale (WebRTC): den som ringer skriver tilbudet, mottakeren bare svaret og avslutning
  const tilbud = (fra, til) => ({ id: tid, fra: fra.email, til: [til.email], offer: 'v=0 tilbud', ms: Date.now(), slutt: false });
  lov('gruppeleder starter tale i samtalen', await kall(B.leder, 'POST', '/tale?on_conflict=id', tilbud(B.leder, B.medlem), ups));
  ant('utenforstående ser ikke talen', await kall(B.annen, 'GET', '/tale?id=eq.' + tid), 0);
  nekt('mottakeren endrer tilbudet', await kall(B.medlem, 'PATCH', '/tale?id=eq.' + tid, { offer: 'falskt' }));
  lov('mottakeren svarer', await kall(B.medlem, 'PATCH', '/tale?id=eq.' + tid, { answer: 'v=0 svar' }));
  lov('mottakeren legger på', await kall(B.medlem, 'PATCH', '/tale?id=eq.' + tid, { slutt: true }));
  lov('mottakeren ringer tilbake (tar over raden)', await kall(B.medlem, 'POST', '/tale?on_conflict=id', tilbud(B.medlem, B.leder), ups));
  nekt('utenforstående starter tale', await kall(B.annen, 'POST', '/tale?on_conflict=id', tilbud(B.annen, B.leder), ups));
  nekt('tale til flere enn én', await kall(B.leder, 'POST', '/tale?on_conflict=id', { ...tilbud(B.leder, B.medlem), til: [B.medlem.email, B.annen.email] }, ups));
  await kall('tjener', 'DELETE', '/tale?id=eq.' + tid);
  nekt('medlem velger ukjent bakgrunn', await kall(B.medlem, 'PATCH', '/threads?id=eq.' + tid, { bakgrunn: 'hack' }));
  const bg = { thread_id: tid, id: 'ett', data: 'data:image/jpeg;base64,AAAA', by: B.medlem.email, v: Date.now() };
  lov('medlem lagrer bakgrunnsbildet', await kall(B.medlem, 'POST', '/thread_bg', bg));
  ant('gruppeleder (deltaker) ser bakgrunnsbildet', await kall(B.leder, 'GET', '/thread_bg?thread_id=eq.' + tid), 1);
  ant('annen ser ikke bakgrunnsbildet', await kall(B.annen, 'GET', '/thread_bg?thread_id=eq.' + tid), 0);
  nekt('medlem lagrer noe annet enn JPEG', await kall(B.medlem, 'PATCH', '/thread_bg?thread_id=eq.' + tid, { data: 'data:text/html;base64,AAAA' }));
  nekt('annen lagrer bakgrunnsbilde i samtalen', await kall(B.annen, 'POST', '/thread_bg', { ...bg, id: 'to', by: B.annen.email }));
  lov('medlem sender påminnelse', await kall(B.medlem, 'POST', '/messages', { thread_id: tid, id: 'm4', by: B.medlem.email, name: 'M', text: 'Husk møtet', pam: true, svar: { id: 'm1', navn: 'M', tekst: 'Takk' } }));
  nekt('medlem sletter samtalen (ikke starteren)',await kall(B.medlem, 'DELETE', '/threads?id=eq.' + tid));

  // --- Notater ---
  const note = { owner: B.medlem.email, id: 'n1', title: 'Søndag', speaker: 'P', date: '2026-11-01', html: 'tekst' };
  lov('medlem lagrer notat', await kall(B.medlem, 'POST', '/notes', note));
  ant('administrator ser ikke notatet', await kall(B.admin, 'GET', '/notes?owner=eq.' + B.medlem.email), 0);
  nekt('medlem lagrer notat n101', await kall(B.medlem, 'POST', '/notes', { ...note, id: 'n101' }));
  nekt('medlem lagrer notat for andre', await kall(B.medlem, 'POST', '/notes', { ...note, owner: B.annen.email }));
  const klipp = { id: 'l1', data: 'data:audio/webm;base64,AAAA', sek: 3 };
  lov('medlem lagrer notat med lydklipp', await kall(B.medlem, 'PATCH', '/notes?owner=eq.' + B.medlem.email + '&id=eq.n1', { lyd: [klipp] }));
  nekt('medlem lagrer fire lydklipp', await kall(B.medlem, 'PATCH', '/notes?owner=eq.' + B.medlem.email + '&id=eq.n1', { lyd: [klipp, klipp, klipp, klipp] }));

  // --- Tellere og varselkoder ---
  lov('besøkende teller Jeg kommer', await kall(null, 'POST', '/rpc/rsvp_tell', { p_id: 'test-e1', p_d: 1 }));
  nekt('besøkende setter telleren direkte', await kall(null, 'PATCH', '/rsvp_counts?id=eq.test-e1', { n: 999 }));
  const kode = 'test-' + 'x'.repeat(150);
  lov('besøkende registrerer varselkode', await kall(null, 'POST', '/rpc/kode_lagre', { p_token: kode }));
  nekt('besøkende kobler kode til andres e-post', await kall(null, 'POST', '/rpc/kode_lagre', { p_token: kode, p_email: B.admin.email }));
  ant('besøkende leser varselkoder', await kall(null, 'GET', '/push_tokens?token=like.test-*'), 0);
  nekt('besøkende sletter alle varselkoder', await kall(null, 'DELETE', '/push_tokens?token=like.*'));
  ant('administrator leser varselkoder', await kall(B.admin, 'GET', '/push_tokens?token=like.test-*'), 1);

  // --- Innstillinger ---
  const forKontakt = (await kall('tjener', 'GET', '/settings?id=eq.contact')).data[0];   // settes tilbake etterpå
  nekt('administrator lager ukjent innstilling', await kall(B.admin, 'POST', '/settings', { id: 'test-x', data: {} }));
  lov('administrator lagrer kontaktinfo', await kall(B.admin, 'POST', '/settings?on_conflict=id',
    { id: 'contact', data: { address: 'Kometvegen 7', hours: '', phone: '', email: '' } }, { Prefer: 'return=representation,resolution=merge-duplicates' }));
  nekt('administrator lagrer ukjent felt', await kall(B.admin, 'PATCH', '/settings?id=eq.contact', { data: { address: 'x', hack: 1 } }));
  nekt('medlem endrer kontaktinfo', await kall(B.medlem, 'PATCH', '/settings?id=eq.contact', { data: { address: 'x' } }));
  // Pastor (members.pastor): kan legge ut nyheter til alle. Gruppeledere kan ikke lage pastorer, og medlemmer kan ikke gjøre seg selv til pastor.
  nekt('medlem gjør seg selv til pastor', await kall(B.annen, 'PATCH', '/members?email=eq.' + B.annen.email, { pastor: true }));
  await kall('tjener', 'PATCH', '/members?email=eq.' + B.annen.email, { pastor: true });
  lov('pastor legger ut nyhet til alle', await kall(B.annen, 'POST', '/posts', { id: 'test-pastor', t: 'Hilsen', b: 'Hei', audience: ['Alle'], groups: [], m: false }));
  nekt('medlem (ikke pastor) legger ut nyhet til alle', await kall(B.medlem, 'POST', '/posts', { id: 'test-ikkepastor', t: 'x', b: 'x', audience: ['Alle'], groups: [], m: false }));
  // Pastor uten gruppelederansvar: ser medlemslisten, skriver privat til hvem som helst og lager gruppesamtale for enhver gruppe (Sionchat)
  const pT = { roleName: 'Beskjed', fromName: 'P', from: B.annen.email, lastBy: B.annen.email, last: 'Hei', ms: Date.now() };
  ant('pastor ser medlemslisten', await kall(B.annen, 'GET', '/members?email=like.*' + D), 3);
  lov('pastor skriver privat til medlem utenfor egne grupper', await kall(B.annen, 'POST', '/threads',
    { ...pT, id: 'test-pdm', roleId: 'dm', kind: 'dm', toName: 'M', parts: [B.annen.email, B.medlem.email], unread: [B.medlem.email] }));
  const pGr = { ...pT, id: 'test-pgr', roleId: 'gruppe', kind: 'gruppe', gid: 'activ8', parts: [B.annen.email, B.medlem.email, B.leder.email], unread: [B.medlem.email, B.leder.email] };
  lov('pastor lager gruppesamtale for gruppe hen ikke leder', await kall(B.annen, 'POST', '/threads', pGr));
  await kall('tjener', 'DELETE', '/threads?id=in.(test-pdm,test-pgr)');
  await kall('tjener', 'PATCH', '/members?email=eq.' + B.annen.email, { pastor: false });
  nekt('medlem (ikke pastor) lager gruppesamtale', await kall(B.annen, 'POST', '/threads', pGr));
  nekt('medlem (ikke pastor) skriver privat til andre', await kall(B.annen, 'POST', '/threads',
    { ...pT, id: 'test-pdm', roleId: 'dm', kind: 'dm', toName: 'M', parts: [B.annen.email, B.medlem.email], unread: [B.medlem.email] }));
  await kall('tjener', 'DELETE', '/threads?id=in.(test-pdm,test-pgr)');
  await kall('tjener', 'PATCH', '/members?email=eq.' + B.annen.email, { kontor: true });
  lov('sekretær legger ut nyhet til alle', await kall(B.annen, 'POST', '/posts', { id: 'test-kontor', t: 'Hilsen', b: 'Hei', audience: ['Alle'], groups: [], m: false }));
  lov('sekretær planlegger varsel til alle', await kall(B.annen, 'POST', '/scheduled', { id: 'test-kontor', title: 'Hilsen', malType: 'alle', fireAt: Date.now() + 864e5 }, { Prefer: 'return=minimal' }));   // bare administratorer kan lese planlagte varsler
  await kall('tjener', 'PATCH', '/members?email=eq.' + B.annen.email, { kontor: false });
  await kall('tjener', 'DELETE', '/posts?id=eq.test-kontor');
  await kall('tjener', 'DELETE', '/scheduled?id=eq.test-kontor');
  nekt('gruppeleder lager nytt medlem som sekretær', await kall(B.leder, 'POST', '/members', { email: 'ny-kontor' + D, groups: ['activ8'], kontor: true }));
  nekt('gruppeleder lager nytt medlem som pastor', await kall(B.leder, 'POST', '/members', { email: 'ny-pastor' + D, groups: ['activ8'], pastor: true }));
  ant('medlem leser områdene (ingen ennå)', await kall(B.medlem, 'GET', '/omrader'), 0);
  nekt('medlem lager område', await kall(B.medlem, 'POST', '/omrader', { id: 'test-omr', name: 'x' }));
  await kall('tjener', 'DELETE', '/posts?id=in.(test-pastor,test-ikkepastor)');
  await kall('tjener', 'DELETE', '/members?email=eq.ny-pastor' + D);
  ant('besøkende leser kontaktinfo', await kall(null, 'GET', '/settings?id=eq.contact'), 1);
  if (forKontakt) await kall('tjener', 'PATCH', '/settings?id=eq.contact', { data: forKontakt.data });
  else await kall('tjener', 'DELETE', '/settings?id=eq.contact');
  // Portrett til Pastorens hilsen (settings/pastor)
  const forPastor = (await kall('tjener', 'GET', '/settings?id=eq.pastor')).data[0];
  lov('administrator lagrer pastorportrett', await kall(B.admin, 'POST', '/settings?on_conflict=id',
    { id: 'pastor', data: { img: 'data:image/jpeg;base64,AAAA' } }, { Prefer: 'return=representation,resolution=merge-duplicates' }));
  nekt('pastorportrett med ekstra felt', await kall(B.admin, 'PATCH', '/settings?id=eq.pastor', { data: { img: 'x', hack: 1 } }));
  nekt('pastorportrett over 250 000 tegn', await kall(B.admin, 'PATCH', '/settings?id=eq.pastor', { data: { img: 'x'.repeat(250001) } }));
  nekt('medlem bytter pastorportrett', await kall(B.medlem, 'PATCH', '/settings?id=eq.pastor', { data: { img: 'x' } }));
  if (forPastor) await kall('tjener', 'PATCH', '/settings?id=eq.pastor', { data: forPastor.data });
  else await kall('tjener', 'DELETE', '/settings?id=eq.pastor');

  // --- Politiattest (to-parts-bekreftelse) ---
  const fs1 = { email: B.medlem.email, k: 'sett', dato: '2026-10-01', by: B.medlem.email, okM: true, okL: false, okLby: '', fil: false, ms: Date.now() };
  nekt('medlem setter attest uten forslag', await kall(B.medlem, 'POST', '/attester', { email: B.medlem.email, dato: '2026-10-01', by: B.medlem.email, godkjent: true, fil: false }));
  nekt('medlem bekrefter på vegne av leder', await kall(B.medlem, 'POST', '/attestforslag', { ...fs1, okL: true, okLby: B.medlem.email }));
  lov('medlem foreslår dato', await kall(B.medlem, 'POST', '/attestforslag', fs1));
  nekt('medlem fullfører alene', await kall(B.medlem, 'POST', '/attester', { email: B.medlem.email, dato: '2026-10-01', by: B.medlem.email, godkjent: true, fil: false }));
  nekt('annen (ikke leder) bekrefter', await kall(B.annen, 'PATCH', '/attestforslag?email=eq.' + B.medlem.email, { okL: true, okLby: B.annen.email }));
  nekt('gruppeleder endrer datoen', await kall(B.leder, 'PATCH', '/attestforslag?email=eq.' + B.medlem.email, { dato: '2030-01-01', okL: true, okLby: B.leder.email }));
  lov('gruppeleder bekrefter', await kall(B.leder, 'PATCH', '/attestforslag?email=eq.' + B.medlem.email, { okL: true, okLby: B.leder.email }));
  nekt('gruppeleder setter feil dato', await kall(B.leder, 'POST', '/attester', { email: B.medlem.email, dato: '2030-01-01', by: B.leder.email, godkjent: true, fil: false }));
  lov('gruppeleder fullfører', await kall(B.leder, 'POST', '/attester', { email: B.medlem.email, dato: '2026-10-01', by: B.leder.email, godkjent: true, fil: false }));
  ant('annen ser ikke attesten', await kall(B.annen, 'GET', '/attester?email=eq.' + B.medlem.email), 0);

  // --- Lederrådet, forbønn, utleie ---
  lov('medlem i lederrådet legger inn sak', await kall(B.medlem, 'POST', '/lrsaker', { id: 'test-s1', t: 'Sak', name: 'M', by: B.medlem.email, ms: Date.now() }));
  ant('annen ser ikke sakene', await kall(B.annen, 'GET', '/lrsaker?id=eq.test-s1'), 0);
  nekt('medlem endrer teksten i saken', await kall(B.medlem, 'PATCH', '/lrsaker?id=eq.test-s1', { t: 'Endret' }));
  lov('medlem merker saken som behandlet', await kall(B.medlem, 'PATCH', '/lrsaker?id=eq.test-s1', { done: true, doneMs: Date.now() }));
  lov('medlem sender forbønn', await kall(B.medlem, 'POST', '/prayers', { id: 'test-p1', t: 'Be for meg', name: 'M', by: B.medlem.sub, ms: Date.now() }));
  ant('annen leser ikke forbønn', await kall(B.annen, 'GET', '/prayers?id=eq.test-p1'), 0);
  nekt('besøkende sender forbønn direkte', await kall(null, 'POST', '/prayers', { id: 'test-p2', t: 'x', name: 'x', by: 'x', ms: 1 }));
  nekt('medlem uten utleie ser bookinger', await kall(B.medlem, 'POST', '/bookinger', { id: 'test-b1', tittel: 'x', rom: ['Salen'], dato: '2026-12-01', fra: '10:00', til: '12:00', leier: 'x', kontakt: 'x', pris: '0', status: 'bekreftet', notat: '', by: 'x', ms: 1 }));
  lov('administrator lager booking', await kall(B.admin, 'POST', '/bookinger', { id: 'test-b1', tittel: 'x', rom: ['Salen'], dato: '2026-12-01', fra: '10:00', til: '12:00', leier: 'x', kontakt: 'x', pris: '0', status: 'bekreftet', notat: '', by: 'x', ms: 1 }));
  nekt('administrator lager ugyldig booking', await kall(B.admin, 'POST', '/bookinger', { id: 'test-b2', tittel: 'x', rom: [], dato: '2026-12-01', fra: '10', til: '12:00', leier: 'x', kontakt: 'x', pris: '0', status: 'hmm', notat: '', by: 'x', ms: 1 }));
  ant('medlem ser ikke bookinger', await kall(B.medlem, 'GET', '/bookinger?id=like.test-*'), 0);

  // Ledersamtale for et område: hovedleder (leder) retter deltakerne; andre kan ikke
  await kall('tjener', 'POST', '/omrader', { id: 'test-omr', name: 'Testområde', groups: ['activ8'], ledere: [B.leder.email] });
  await kall('tjener', 'POST', '/threads', { id: 'test-omrt', roleId: 'gruppe', roleName: 'Testområde – ledere', kind: 'gruppe', gid: 'activ8', from: B.leder.email, fromName: 'L',
    parts: [B.leder.email, B.medlem.email, B.annen.email, B.admin.email], last: 'x', lastBy: B.leder.email, ms: 1, unread: [] });
  lov('hovedleder retter deltakerne i ledersamtalen', await kall(B.leder, 'PATCH', '/threads?id=eq.test-omrt', { parts: [B.leder.email, B.medlem.email, B.annen.email], unread: [B.medlem.email], omr: 'test-omr' }));
  nekt('medlem (ikke hovedleder) endrer deltakerne', await kall(B.medlem, 'PATCH', '/threads?id=eq.test-omrt', { parts: [B.leder.email, B.medlem.email, B.annen.email, B.fremmed.email], unread: [], omr: 'test-omr' }));
  nekt('hovedleder bruker et område med annet navn', await kall(B.leder, 'PATCH', '/threads?id=eq.test-omrt', { parts: [B.leder.email, B.medlem.email, B.annen.email, B.fremmed.email], unread: [], omr: 'finnes-ikke' }));
  nekt('hovedleder lager for liten ledersamtale', await kall(B.leder, 'PATCH', '/threads?id=eq.test-omrt', { parts: [B.leder.email, B.medlem.email], unread: [], omr: 'test-omr' }));
  nekt('hovedleder endrer også siste melding', await kall(B.leder, 'PATCH', '/threads?id=eq.test-omrt', { parts: [B.leder.email, B.medlem.email, B.annen.email, B.fremmed.email], unread: [], omr: 'test-omr', last: 'hack' }));
  await kall('tjener', 'DELETE', '/threads?id=eq.test-omrt'); await kall('tjener', 'DELETE', '/omrader?id=eq.test-omr');

  await rydd();
  console.log(`\n${ok} riktige, ${feil} feil`);
  process.exit(feil ? 1 : 0);
})().catch(async e => { console.error(e); await rydd().catch(() => {}); process.exit(1); });
