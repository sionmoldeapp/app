// Kopierer alt fra Firebase-emulatoren (Firestore) til tabellene i Supabase (se sql/001_tabeller.sql).
// Leser bare fra emulatoren. Skriver med service_role-nøkkelen fra server/.env (går forbi Row Level Security).
// Kan kjøres flere ganger: rader med samme nøkkel oppdateres (upsert), ingenting slettes.
//
// Bruk (fra server/):  node sion/importer-firestore.js
// Ekte data: hent dem først inn i emulatoren med lokal/hent-ekte-data.bat, og kjør så dette.
//
// Valg: --fra=http://127.0.0.1:8080  --til=http://localhost:8088  --prove (viser bare hva som ville blitt gjort)

const fs = require('fs'), path = require('path');
const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=').slice(1).join('=');
const PROVE = process.argv.includes('--prove');
const FS = (arg('fra') || 'http://127.0.0.1:8080') + '/v1/projects/sion-molde-app/databases/(default)/documents';
const API = (arg('til') || 'http://localhost:8088') + '/rest/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const KEY = (env.match(/^SERVICE_ROLE_KEY=(.*)$/m) || [])[1];
if (!KEY) { console.error('Fant ikke SERVICE_ROLE_KEY i server/.env'); process.exit(1); }
const FH = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };   // emulatoren: les alt
const SH = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

// Samling i Firestore → tabell, nøkkelkolonne og (for undersamlinger) kolonnen som peker på forelderen.
const TOPP = {
  events: 'events', posts: 'posts', regular: 'regular', categories: 'categories', members: 'members', admins: 'admins',
  groups: 'groups', leaderTypes: 'leader_types', roles: 'roles', userPrefs: 'user_prefs', rsvpCounts: 'rsvp_counts',
  rsvps: 'rsvps', postViews: 'post_views', pushTokens: 'push_tokens', reminders: 'reminders', scheduled: 'scheduled',
  threads: 'threads', avst: 'avst', tilstede: 'tilstede', ringer: 'ringer', prayers: 'prayers', lrsaker: 'lrsaker',
  attester: 'attester', attestfil: 'attestfil', attestfilny: 'attestfilny', attestforslag: 'attestforslag',
  bookinger: 'bookinger', settings: 'settings', snapshots: 'snapshots', snapshotData: 'snapshot_data',
};
const UNDER = {   // forelder/undersamling → [tabell, forelder-kolonne, nøkkelkolonne]
  'members/notes': ['notes', 'owner', 'id'], 'shifts/items': ['shift_items', 'gruppe', 'id'],
  'shifts/requests': ['shift_requests', 'gruppe', 'id'], 'threads/messages': ['messages', 'thread_id', 'id'],
  'threads/bonner': ['bonner', 'thread_id', 'id'], 'posts/svar': ['post_svar', 'post_id', 'email'],
  'bookinger/team': ['booking_team', 'booking_id', 'email'],
};
const NOKKEL = { members: 'email', admins: 'email', user_prefs: 'email', tilstede: 'email', attester: 'email', attestfil: 'email',
  attestfilny: 'email', attestforslag: 'email', push_tokens: 'token' };
// Foreldre må finnes før barna (fremmednøkler).
const REKKEFOLGE = ['threads', 'posts', 'bookinger', 'snapshots'];

// Firestore sin typede verdi → vanlig JS-verdi
const verdi = v => {
  const [t, x] = Object.entries(v)[0];
  switch (t) {
    case 'stringValue': case 'referenceValue': case 'bytesValue': return x;
    case 'integerValue': return Number(x);
    case 'doubleValue': return Number(x);
    case 'booleanValue': return x;
    case 'timestampValue': return x;
    case 'nullValue': return null;
    case 'geoPointValue': return x;
    case 'arrayValue': return (x.values || []).map(verdi);
    case 'mapValue': return Object.fromEntries(Object.entries(x.fields || {}).map(([k, y]) => [k, verdi(y)]));
    default: return x;
  }
};

// Tilpasser verdien til kolonnetypen. undefined = passer ikke (legges i ekstra).
const DATO = /^\d{4}-\d{2}-\d{2}$/;
function tilpass(v, format) {
  if (v === null) return null;
  if (format === 'jsonb' || format === 'json') return v;
  if (format.endsWith('[]')) return Array.isArray(v) ? v.map(x => typeof x === 'string' ? x : JSON.stringify(x)) : undefined;
  if (Array.isArray(v) || typeof v === 'object') return format === 'text' ? JSON.stringify(v) : undefined;
  if (format === 'text') return String(v);
  if (format === 'boolean') return typeof v === 'boolean' ? v : undefined;
  if (['integer', 'smallint', 'bigint'].includes(format)) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return Date.parse(v);   // tidspunkt lagret som ms
    const n = Number(v); return Number.isFinite(n) ? Math.round(n) : undefined;
  }
  if (format === 'date') return typeof v === 'string' && DATO.test(v.slice(0, 10)) ? v.slice(0, 10) : undefined;
  if (format.startsWith('timestamp')) {
    if (typeof v === 'number') return new Date(v).toISOString();
    return typeof v === 'string' && !isNaN(Date.parse(v)) ? v : undefined;
  }
  return v;
}

async function hent(url, opt) {
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error(r.status + ' ' + url + ': ' + (await r.text()).slice(0, 300));
  return r.json();
}
const samlinger = async parent =>
  (await hent(FS + (parent ? '/' + parent : '') + ':listCollectionIds', { method: 'POST', headers: FH, body: '{"pageSize":300}' })).collectionIds || [];
async function dokumenter(p) {
  let ut = [], tok = '';
  do {
    const j = await hent(FS + '/' + p + '?pageSize=300&showMissing=true' + (tok ? '&pageToken=' + tok : ''), { headers: FH });
    ut = ut.concat(j.documents || []); tok = j.nextPageToken || '';
  } while (tok);
  return ut;
}

(async () => {
  // Kolonnene i hver tabell (fra PostgREST sin beskrivelse av API-et)
  const spec = await hent(API + '/', { headers: SH });
  const KOL = Object.fromEntries(Object.entries(spec.definitions || {}).map(([t, d]) =>
    [t, Object.fromEntries(Object.entries(d.properties || {}).map(([k, p]) => [k, p.format]))]));

  const rader = {}, hoppet = [];
  const legg = (tabell, rad) => (rader[tabell] || (rader[tabell] = [])).push(rad);

  function lagRad(tabell, felt, faste) {
    const kol = KOL[tabell];
    if (!kol) throw new Error('Tabellen ' + tabell + ' finnes ikke i Supabase (kjør sql/001_tabeller.sql)');
    if (tabell === 'settings') return { ...faste, data: felt };
    const rad = { ...faste }, ekstra = {};
    for (const [k, v] of Object.entries(felt)) {
      if (k in faste || !(k in kol) || k === 'ekstra') { ekstra[k] = v; continue; }
      const t = tilpass(v, kol[k]);
      if (t === undefined) ekstra[k] = v; else rad[k] = t;
    }
    if ('ekstra' in kol && Object.keys(ekstra).length) rad.ekstra = ekstra;
    return rad;
  }

  async function gaa(parent, forelderSamling, forelderId) {
    for (const c of await samlinger(parent)) {
      const docs = await dokumenter((parent ? parent + '/' : '') + c);
      const under = forelderSamling ? UNDER[forelderSamling + '/' + c] : null;
      const tabell = forelderSamling ? (under && under[0]) : TOPP[c];
      for (const d of docs) {
        const id = d.name.split('/').pop(), rel = d.name.split('/documents/')[1];
        if (d.fields || !d.name.endsWith('/' + c)) {
          if (!tabell) hoppet.push(rel);
          else if (d.fields) {
            const felt = Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, verdi(v)]));
            const faste = under ? { [under[1]]: forelderId, [under[2]]: id } : { [NOKKEL[tabell] || 'id']: id };
            legg(tabell, lagRad(tabell, felt, faste));
          }
        }
        await gaa(rel, c, id);   // undersamlinger (også under «manglende» foreldre, som shifts/{gruppe})
      }
    }
  }
  await gaa('', '', '');

  const tabeller = Object.keys(rader).sort((a, b) => {
    const ia = REKKEFOLGE.indexOf(a), ib = REKKEFOLGE.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  let feil = 0;
  for (const t of tabeller) {
    const alle = rader[t];
    // PostgREST krever samme kolonner i alle radene i én forespørsel: send i grupper med likt kolonnesett.
    const grupper = {};
    for (const r of alle) (grupper[Object.keys(r).sort().join(',')] || (grupper[Object.keys(r).sort().join(',')] = [])).push(r);
    let ok = 0;
    for (const g of Object.values(grupper)) for (let i = 0; i < g.length; i += 300) {
      const bit = g.slice(i, i + 300);
      if (PROVE) { ok += bit.length; continue; }
      const r = await fetch(API + '/' + t, { method: 'POST', headers: { ...SH, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(bit) });
      if (r.ok) ok += bit.length; else { feil++; console.error('FEIL ' + t + ': ' + r.status + ' ' + (await r.text()).slice(0, 400)); }
    }
    console.log((PROVE ? '[prøve] ' : '') + t.padEnd(16) + ok + ' av ' + alle.length);
  }
  if (hoppet.length) console.log('Ikke kopiert (ukjent samling): ' + hoppet.slice(0, 20).join(', ') + (hoppet.length > 20 ? ' …' : ''));
  if (feil) process.exit(1);
})().catch(e => { console.error(e.message || e); process.exit(1); });
