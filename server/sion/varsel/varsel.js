// Sion Molde: sending av push-varsler fra egen server (erstatter Apps Script-tjenesten når appen kjører mot Supabase).
// Appen sender de samme kallene som til Apps Script (POST med {idToken, ...}); innloggingsbeviset sjekkes mot GoTrue.
// Enhetene registrerer seg med Web Push (VAPID) og ligger i push_tokens (token = {e: endpoint, p: p256dh, a: auth} som JSON, kodet som base64url).
// Støttet: vanlige varsler (administrator/gruppeleder), beskjeder i Sionchat, planlagte varsler (scheduled) og påminnelser (reminders).
// Automatiske varsler (vakt, politiattest, samlings- og bookingpåminnelser) ligger i auto.js og kjøres hvert minutt.
// E-post (notat, forbønner, saker, velkomst, påmeldte, hilsen, fakturapåminnelse) og daglig rydding ligger i epost.js.
// Kall uten innlogging (anonyme forbønner og leietakerens skjema) ligger i apen.js. Dermed brukes ikke Apps Script lenger på egen server.

const http = require('http'), webpush = require('web-push'), { Pool } = require('pg');
const env = process.env;
const PORT = +env.PORT || 8110;
const GRUPPER = ['sondagsskole', 'activ8', 'hangout', 'debora', 'cdur', 'kjokken', 'torsdagsgruppa', 'vertskap', 'lederradet', 'ungdomsledere', 'sommerstevne', 'elevate', 'lovsang', 'forkynnere'];
const MIN_SEKUNDER_MELLOM_VARSLER = 10;
const VERSJON = 'supabase-1';

if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) { console.error('VAPID_PUBLIC_KEY og VAPID_PRIVATE_KEY mangler i .env'); process.exit(1); }
webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:post@sionmolde.no', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
const pool = new Pool({ host: env.PGHOST || 'db', port: +env.PGPORT || 5432, user: 'postgres', password: env.POSTGRES_PASSWORD, database: env.POSTGRES_DB || 'postgres', max: 4 });
const log = (...a) => console.log(new Date().toISOString(), ...a);
const video = require('./video').lagVideo({ pool, env });

// ---- Innlogging: GoTrue sier hvem tokenet tilhører
async function epostFraToken(tok) {
  if (!tok || typeof tok !== 'string') return null;
  try {
    const r = await fetch((env.GOTRUE_URL || 'http://auth:9999') + '/user', { headers: { Authorization: 'Bearer ' + tok, apikey: env.ANON_KEY || '' } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.email ? String(u.email).toLowerCase() : null;
  } catch (e) { log('GoTrue:', e.message); return null; }
}

// ---- Oppslag
const erAdmin = async e => (await pool.query('select 1 from admins where lower(email) = $1', [e])).rowCount > 0;
const erPastor = async e => (await pool.query('select 1 from members where lower(email) = $1 and (pastor or kontor)', [e])).rowCount > 0;   // pastor eller sekretær   // pastor sender som administrator (til alle, medlemmer og alle grupper)
const lederAv = async e => ((await pool.query('select leads from members where lower(email) = $1', [e])).rows[0] || {}).leads || [];
async function gyldigeGrupper() {
  const ut = GRUPPER.slice();
  (await pool.query('select id from groups')).rows.forEach(r => { if (!ut.includes(r.id)) ut.push(r.id); });
  return ut;
}
async function brukere() {   // e-post -> {groups, muted, extra}, medlemmer og administratorer slått sammen
  const ut = {};
  for (const t of ['members', 'admins']) {
    (await pool.query('select email, groups, muted, extra from ' + t)).rows.forEach(r => {
      const e = String(r.email).toLowerCase(), b = ut[e] = ut[e] || { groups: [], muted: [], extra: [] };
      b.groups.push(...(r.groups || [])); b.muted.push(...(r.muted || [])); b.extra.push(...(r.extra || []));
    });
  }
  return ut;
}
async function ledere() {   // e-post -> lederkategori
  const ut = {};
  (await pool.query('select email, ltype from members where leder = true')).rows.forEach(r => { ut[String(r.email).toLowerCase()] = r.ltype || 'hoved'; });
  return ut;
}
async function alleKoder() {
  return (await pool.query('select token, email from push_tokens')).rows.map(r => ({ token: r.token, email: r.email ? String(r.email).toLowerCase() : '' }));
}

// Hvem som skal ha varselet: {type:'alle'} | {type:'medlem'} | {type:'grupper', groups} | {type:'ltype', ltypes} | {type:'blandet', groups, ltypes} | {type:'emails', emails}
async function lesMal(m) {
  if (!m || !m.type || m.type === 'alle') return { type: 'alle' };
  if (m.type === 'medlem') return { type: 'medlem' };
  if (m.type === 'emails') return { type: 'emails', emails: (m.emails || []).map(x => String(x).toLowerCase()) };
  const lt = (m.ltypes || []).map(String).filter(x => /^[a-z0-9_-]{1,40}$/.test(x));
  if (m.type === 'ltype') { if (!lt.length) throw new Error('Velg minst én lederkategori.'); return { type: 'ltype', ltypes: lt }; }
  if (m.type === 'grupper' || m.type === 'blandet') {
    const gyldige = await gyldigeGrupper(), g = (m.groups || []).filter(x => gyldige.includes(x));
    if (m.type === 'grupper') { if (!g.length) throw new Error('Velg minst én gyldig gruppe.'); return { type: 'grupper', groups: g }; }
    if (!g.length && !lt.length) throw new Error('Velg minst én mottakergruppe.');
    return { type: 'blandet', groups: g, ltypes: lt };
  }
  throw new Error('Ukjent mottakergruppe.');
}
async function mottakere(mal, koder) {
  if (mal.type === 'emails') return koder.filter(k => k.email && mal.emails.includes(k.email));
  if (mal.type === 'alle') return koder;
  if (mal.type === 'ltype') { const l = await ledere(); return koder.filter(k => k.email && l[k.email] && mal.ltypes.includes(l[k.email])); }
  const b = await brukere(), l = mal.type === 'blandet' ? await ledere() : {};
  return koder.filter(k => {
    const u = k.email && b[k.email]; if (!u) return false;
    if (mal.type === 'medlem') return true;
    if (mal.type === 'blandet' && l[k.email] && mal.ltypes.includes(l[k.email])) return true;
    return u.groups.some(g => mal.groups.includes(g) && !u.muted.includes(g)) || u.extra.some(g => mal.groups.includes(g));
  });
}

// ---- Sending
function tilSub(token) { try { const o = JSON.parse(token[0] === '{' ? token : Buffer.from(token, 'base64url').toString('utf8')); return o && o.e && o.p && o.a ? { endpoint: o.e, keys: { p256dh: o.p, auth: o.a } } : null; } catch (e) { return null; } }
async function sendTil(koder, tittel, tekst, lenke, ekstra) {
  const data = { url: lenke, ...(ekstra || {}) }, nyttelast = JSON.stringify({ notification: { title: tittel, body: tekst }, data });
  let sendt = 0, feilet = 0, fjernet = 0;
  for (let i = 0; i < koder.length; i += 20) {
    await Promise.all(koder.slice(i, i + 20).map(async k => {
      const sub = tilSub(k.token);
      if (!sub) { feilet++; return; }
      try { await webpush.sendNotification(sub, nyttelast, { TTL: 86400, urgency: 'high' }); sendt++; }
      catch (e) {
        feilet++;
        if (e.statusCode === 404 || e.statusCode === 410) { await pool.query('delete from push_tokens where token = $1', [k.token]).catch(() => {}); fjernet++; }
        else log('Sending feilet:', e.statusCode || '', String(e.body || e.message).slice(0, 120));
      }
    }));
  }
  return { sendt, feilet, fjernet };
}
async function send(tittel, tekst, tab, mal, kopiTil, ekstra) {
  const lenke = './' + (tab && tab !== 'home' ? '?tab=' + tab : ''), alle = await alleKoder(), m = await mottakere(mal || { type: 'alle' }, alle);
  if (kopiTil) { const har = new Set(m.map(k => k.token)); alle.forEach(k => { if (k.email === kopiTil && !har.has(k.token)) m.push(k); }); }
  const r = await sendTil(m, tittel, tekst, lenke, ekstra);
  return { enheter: m.length, totalt: alle.length, ...r };
}

// ---- Ringing: en nettapp kan ikke spille ringelyd når den er i bakgrunnen. Derfor sendes varselet på nytt hvert 6. sekund
// (samme tag, renotify i sw.js, så telefonen piper/vibrerer igjen) så lenge det ringer, høyst 45 s. Ubesvart: «Tapt anrop».
const ringerNa = new Set();
async function ringIgjen(tid, fra, tittel, tekst, andre, ekstra) {
  if (ringerNa.has(tid)) return;
  ringerNa.add(tid);
  try {
    const les = async () => (await pool.query('select status, "callId", fra from ringer where id = $1', [tid])).rows[0];
    const forst = await les();
    if (!forst || forst.status !== 'ring' || String(forst.fra || '').toLowerCase() !== fra) return;
    const start = Date.now();
    let status = 'ring';
    while (Date.now() - start < 45000) {
      await new Promise(r => setTimeout(r, 6000));
      const n = await les();
      if (!n || n.callId !== forst.callId) { status = 'ny'; break; }
      status = n.status;
      if (status !== 'ring') break;
      await send(tittel, tekst, 'me', { type: 'emails', emails: andre }, null, ekstra);
    }
    if (status === 'ring' || status === 'avbrutt' || status === 'utlopt') {
      const navn = tittel.replace(/^(📞|📹) /u, '').replace(/ ringer deg( med video)?$/, '');
      await send('📵 Tapt anrop fra ' + navn, 'Trykk for å åpne Sionchat.', 'me', { type: 'emails', emails: andre }, null, { tapt: 1, tr: tid });
    }
    log('Ringing i', tid.slice(0, 8), 'endte:', status);
  } finally { ringerNa.delete(tid); }
}

// ---- Kall fra appen
const sistSendt = { alle: 0 }, sistBeskjed = {};
async function behandle(d) {
  const aapen = await apen.behandle(d);   // anonym forbønn og leietakerskjema: uten innlogging
  if (aapen !== undefined) return aapen;
  const email = await epostFraToken(d.idToken);
  if (!email) return { ok: false, feil: 'Ikke innlogget (innloggingsbeviset ble ikke godtatt).' };

  if (d.action === 'video') return video(d, email);

  if (d.action === 'beskjed') {   // melding i Sionchat: varsle de andre i samtalen
    const tr = (await pool.query('select parts, dempet, "roleName", last from threads where id = $1', [String(d.threadId || '')])).rows[0];
    if (!tr) return { ok: false, feil: 'Fant ikke samtalen.' };
    const parts = (tr.parts || []).map(x => String(x).toLowerCase());
    if (!parts.includes(email)) return { ok: false, feil: 'Ingen tilgang til samtalen.' };
    const nokkel = email + '|' + String(d.threadId);   // per samtale, så et klistremerke rett etter en tekst ikke mister varselet
    if (Date.now() - (sistBeskjed[nokkel] || 0) < 1000) return { ok: false, feil: 'Vent et sekund.' };
    sistBeskjed[nokkel] = Date.now();
    const dempet = (tr.dempet || []).map(x => String(x).toLowerCase()), andre = parts.filter(x => x !== email && !dempet.includes(x));
    if (!andre.length) return { ok: true, sendt: 0 };
    let ekstra = null, tittel = 'Ny beskjed: ' + (tr.roleName || 'Ansvarsområde');
    try {
      const sm = (await pool.query('select text, name from messages where thread_id = $1 order by created desc limit 1', [String(d.threadId)])).rows[0];
      const bm = sm && /⟦bok:([A-Za-z0-9_-]+):[am]⟧/.exec(sm.text || '');
      if (bm) { ekstra = { bok: bm[1], tr: String(d.threadId) }; tittel = 'Kommer du? Ny booking'; }
      // Ringing og videoanrop: eget varsel som blir stående og vibrerer lenger (sw.js ser på data.ring)
      const rm = sm && /^(🔔 Ringer|📹 Videoanrop)/u.exec(sm.text || '');
      if (rm) { const n = String(sm.name || 'Noen').slice(0, 60), vid = rm[1].startsWith('📹'); ekstra = { ring: vid ? 'video' : 'tale', tr: String(d.threadId) }; tittel = vid ? '📹 ' + n + ' ringer deg med video' : '📞 ' + n + ' ringer deg'; }
    } catch (e) { /* uten svarknapper */ }
    const tekst = ekstra && ekstra.ring ? 'Trykk for å åpne Sionchat og svare.' : String(tr.last || '').replace(/:sion(?:-[a-z0-9]+)?:/g, '🕊️ Klistremerke').replace(/⟦[^⟧]*⟧/g, '').trim().slice(0, 120) || 'Ny melding';
    const r = await send(tittel, tekst, 'me', { type: 'emails', emails: andre }, null, ekstra);
    log('Chatvarsel fra', email, 'i', String(d.threadId).slice(0, 8), ':', r.sendt, 'av', r.enheter, 'enheter');
    if (ekstra && ekstra.ring) ringIgjen(String(d.threadId), email, tittel, tekst, andre, ekstra).catch(e => log('Ringing feilet:', e.message));
    return { ok: true, sendt: r.sendt };
  }

  if (d.action === 'selvlenke') return apen.lenke(email, d);
  const ep = await epost.behandle(email, d);   // e-post: notat, forbønner, saker, velkomst, påmeldte, hilsen
  if (ep !== undefined) return ep;
  if (d.action && d.action !== 'varsel') return { ok: false, feil: 'Ukjent handling «' + d.action + '».' };

  // Vanlig varsel: administrator, eller gruppeleder (bare til egne grupper)
  let leder = null;
  if (!(await erAdmin(email)) && !(await erPastor(email))) {
    const g = await lederAv(email);
    if (!g.length) return { ok: false, feil: 'Du har ikke tilgang til å sende varsler. Innlogget som ' + email + ', og den adressen er verken administrator eller gruppeleder.' };
    leder = g;
  }
  const tittel = String(d.title || '').trim().slice(0, 80), tekst = String(d.body || '').trim().slice(0, 1000);
  if (!tittel) return { ok: false, feil: 'Tittel mangler.' };
  if (Date.now() - sistSendt.alle < MIN_SEKUNDER_MELLOM_VARSLER * 1000) return { ok: false, feil: 'Vent noen sekunder mellom hvert varsel.' };
  sistSendt.alle = Date.now();
  const tab = ['home', 'prog', 'news', 'me'].includes(d.tab) ? d.tab : 'home', mal = await lesMal(d.mal);
  if (leder) {
    const utenfor = mal.type !== 'grupper' ? ['alle'] : mal.groups.filter(x => !leder.includes(x));
    if (utenfor.length) return { ok: false, feil: 'Som gruppeleder kan du bare sende til gruppene du leder.' };
  }
  const res = await send(tittel, tekst, tab, mal, d.kopi === true ? email : null);
  log('Varsel fra', email, 'til', mal.type, '«' + tittel + '»:', res.sendt, 'av', res.enheter);
  return { ok: true, ...res };
}

// ---- Planlagte varsler og påminnelser (hvert minutt)
async function planlagte() {
  for (const r of (await pool.query('select * from scheduled where "fireAt" is not null and "fireAt" <= $1', [Date.now()])).rows) {
    try {
      const mal = await lesMal({ type: r.malType || 'alle', groups: r.groups || [], ltypes: r.ltypes || [] });
      await send(r.title || 'Sion Molde', r.body || '', ['home', 'prog', 'news', 'me'].includes(r.tab) ? r.tab : 'news', mal, r.kopi && r.by ? String(r.by).toLowerCase() : null);
      log('Planlagt varsel sendt:', r.title);
    } catch (e) { log('Planlagt varsel feilet:', e.message); continue; }
    await pool.query('delete from scheduled where id = $1', [r.id]);
  }
}
async function paaminnelser() {
  const na = Date.now();
  for (const r of (await pool.query('select id, token, title, "fireAt" from reminders where "fireAt" is not null and "fireAt" <= $1', [na])).rows) {
    if (na - r.fireAt < 3 * 36e5) {   // over 3 timer forsinket: slettes uten å sendes
      const sub = tilSub(r.token);
      if (sub) {
        try { await webpush.sendNotification(sub, JSON.stringify({ notification: { title: 'Påminnelse', body: r.title || 'Samling' }, data: { url: './?tab=prog' } }), { TTL: 3 * 3600, urgency: 'high' }); }
        catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) { log('Påminnelse feilet:', e.statusCode || e.message); continue; } }   // prøver igjen neste runde
      }
    }
    await pool.query('delete from reminders where id = $1', [r.id]);
  }
}
const auto = require('./auto.js')({ pool, send, brukere, log });
const epost = require('./epost.js')({ pool, log, erAdmin, erPastor, lederAv, brukere, ledere, lesMal, osloDato: auto.osloDato, osloTime: auto.osloTime, forst: auto.forst });
const apen = require('./apen.js')({ pool, log, send, erAdmin, osloDato: auto.osloDato, epost });
let kjorer = false;
setInterval(async () => {
  if (kjorer) return; kjorer = true;
  try { await planlagte(); await paaminnelser(); } catch (e) { log('Rundt:', e.message); }
  for (const f of ['vakter', 'attester', 'samlinger', 'bookinger']) { try { await auto[f](); } catch (e) { log(f + ':', e.message); } }
  if (new Date().getMinutes() === 0) await auto.rydd().catch(() => {});
  if (new Date().getMinutes() % 10 === 0) await epost.faktura().catch(e => log('faktura:', e.message));
  await epost.ryddGamle().catch(e => log('rydding:', e.message));   // én gang i døgnet etter kl. 03
  kjorer = false;
}, 60e3);

// ---- Snakk til tekst: lyden fra appen (webm/mp4 fra MediaRecorder) skrives ut av whisper.cpp i sion-tale. Bare innloggede medlemmer. Én om gangen, maks 3 i kø.
let taleKo = Promise.resolve(), taleVenter = 0;
async function taleTekst(req, res) {
  const svar = (kode, o) => { res.writeHead(kode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  if (req.method === 'GET') return svar(200, { ok: true, tale: !!env.TALE_URL });
  if (req.method !== 'POST') return svar(405, { ok: false, feil: 'Ikke tillatt' });
  if (!env.TALE_URL) return svar(200, { ok: false, feil: 'Talegjenkjenning er ikke aktivert på serveren.' });
  const deler = [];let n = 0;
  req.on('data', c => { n += c.length; if (n > 8e6) { req.destroy(); return; } deler.push(c); });
  req.on('end', async () => {
    try {
      const tok = String(req.headers.authorization || '').replace(/^Bearer /, ''), e = await epostFraToken(tok);
      if (!e || !((await pool.query('select 1 from members where lower(email) = $1 union select 1 from admins where lower(email) = $1', [e])).rowCount)) return svar(401, { ok: false, feil: 'Du må være innlogget.' });
      const lyd = Buffer.concat(deler);
      if (lyd.length < 800) return svar(200, { ok: true, tekst: '' });
      if (taleVenter >= 3) return svar(200, { ok: false, feil: 'Talegjenkjenningen er opptatt. Prøv igjen om litt.' });
      taleVenter++;
      const jobb = taleKo.then(async () => {
        const fd = new FormData();
        fd.append('file', new Blob([lyd], { type: String(req.headers['content-type'] || 'audio/webm').split(';')[0] }), 'tale');
        fd.append('response_format', 'json'); fd.append('temperature', '0.0'); fd.append('language', 'no');
        const r = await fetch(env.TALE_URL + '/inference', { method: 'POST', body: fd, signal: AbortSignal.timeout(170e3) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return String((await r.json()).text || '').replace(/\s+/g, ' ').trim();
      });
      taleKo = jobb.catch(() => {}).then(() => { taleVenter--; });
      const tekst = await jobb;
      log('Tale:', e, lyd.length + ' byte', tekst.length + ' tegn');
      svar(200, { ok: true, tekst });
    } catch (er) { log('Tale feilet:', er.message); svar(200, { ok: false, feil: 'Kunne ikke skrive ut talen (' + er.message + ').' }); }
  });
}

// ---- HTTP
http.createServer((req, res) => {
  if ((req.url || '').split('?')[0] === '/tale') return taleTekst(req, res);
  const svar = (kode, o) => { res.writeHead(kode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ ...o, versjon: VERSJON })); };
  if (req.method === 'GET') return svar(200, { ok: true, tjeneste: 'Sion Molde varsler (egen server)' });
  if (req.method !== 'POST') return svar(405, { ok: false, feil: 'Ikke tillatt' });
  let body = '';
  req.on('data', c => { body += c; if (body.length > 80000) req.destroy(); });   // møtenotater kan være opptil 20 000 tegn HTML
  req.on('end', async () => {
    try { svar(200, await behandle(JSON.parse(body))); }
    catch (e) { log('Feil:', e.message); svar(200, { ok: false, feil: 'Feil i varseltjenesten: ' + e.message }); }
  });
}).listen(PORT, () => log('Varseltjenesten lytter på', PORT));
