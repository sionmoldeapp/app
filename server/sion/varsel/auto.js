// Automatiske varsler (samme regler som før i Apps Script). Hvert tilfelle sendes én gang (tabellen varsel_sendt).
// Lastes av varsel.js, som gir inn pool, send, brukere og log.
module.exports = ({ pool, send, brukere, log }) => {
  const TZ = 'Europe/Oslo', MND = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  const PAAMINN_STANDARD = ['lederradet', 'ungdomsledere', 'torsdagsgruppa', 'vertskap', 'elevate', 'lovsang'];
  const GRUPPENAVN = { sondagsskole: 'Søndagsskole', activ8: 'Activ8', hangout: 'Hangout', debora: 'Debora', cdur: 'Sion C-dur', kjokken: 'Kjøkken', torsdagsgruppa: 'Torsdagsgruppa', vertskap: 'Vertskap', lederradet: 'Lederrådet', ungdomsledere: 'Ungdomsledere', sommerstevne: 'Sommerstevne', elevate: 'Elevate', lovsang: 'Lovsangsteamet', forkynnere: 'Forkynnere' };
  const osloDel = (d, o) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, ...o }).format(d);
  const osloDato = d => osloDel(d, { year: 'numeric', month: '2-digit', day: '2-digit' });   // åååå-mm-dd
  const osloTime = d => +osloDel(d, { hour: '2-digit', hourCycle: 'h23' });
  async function forst(nokkel) {   // true bare første gang nøkkelen brukes
    return (await pool.query('insert into varsel_sendt (nokkel, ms) values ($1, $2) on conflict do nothing', [nokkel, Date.now()])).rowCount > 0;
  }
  const tekstFoer = h => h >= 48 ? 'Om ' + Math.round(h / 24) + ' dager' : h >= 24 ? 'I morgen' : 'Om ' + h + (h === 1 ? ' time' : ' timer');
  function klokkeTilMs(dato, kl) {
    const k = /^\d{1,2}:\d{2}$/.test(kl || '') ? String(kl).padStart(5, '0') : '09:00', t = new Date(dato + 'T' + k + ':00');
    return isNaN(t) ? null : t.getTime();
  }
  const lav = x => String(x).toLowerCase();

  async function vakter() {   // dagen før, etter kl. 17
    const na = new Date();
    if (osloTime(na) < 17) return;
    if (!(await forst('vakt:' + osloDato(na)))) return;
    const imorgen = osloDato(new Date(na.getTime() + 864e5)), navn = {};
    (await pool.query('select id, name from groups')).rows.forEach(r => { navn[r.id] = r.name; });
    for (const v of (await pool.query('select gruppe, role, emails from shift_items where date = $1', [imorgen])).rows) {
      const em = (v.emails || []).map(lav).filter(Boolean); if (!em.length) continue;
      await send('Vakt i morgen', 'Du har vakt i morgen: ' + (navn[v.gruppe] || GRUPPENAVN[v.gruppe] || v.gruppe) + (v.role ? ' – ' + v.role : ''), 'me', { type: 'emails', emails: em });
    }
    log('Vaktvarsler sendt for', imorgen);
  }

  async function attester() {   // 60 dager før utløp (3 år etter godkjent dato), etter kl. 08
    if (osloTime(new Date()) < 8) return;
    const bruk = await brukere(), admins = (await pool.query('select email from admins')).rows.map(r => lav(r.email)), leads = {}, navn = {};
    (await pool.query('select email, name, leads from members')).rows.forEach(r => { leads[lav(r.email)] = r.leads || []; navn[lav(r.email)] = r.name || ''; });
    for (const a of (await pool.query('select email, dato from attester')).rows) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dato || '')) continue;
      const email = lav(a.email), utl = new Date(a.dato + 'T12:00:00'); utl.setFullYear(utl.getFullYear() + 3);
      const dager = Math.ceil((utl.getTime() - Date.now()) / 864e5);
      if (dager > 60 || !(await forst('attest:' + email + ':' + a.dato))) continue;
      const mine = (bruk[email] || { groups: [] }).groups, datoTxt = utl.getDate() + '. ' + MND[utl.getMonth()] + ' ' + utl.getFullYear(), verb = dager < 0 ? 'gikk ut ' : 'går ut ';
      const ledelse = new Set(admins);
      Object.keys(leads).forEach(e => { if (leads[e].some(g => mine.includes(g))) ledelse.add(e); });
      ledelse.delete(email);
      await send('Politiattest', 'Politiattesten din ' + verb + datoTxt + '. Husk å søke ny i god tid.', 'me', { type: 'emails', emails: [email] });
      if (ledelse.size) await send('Politiattest utløper snart', (navn[email] || email) + ': politiattesten ' + verb + datoTxt + '.', 'me', { type: 'emails', emails: [...ledelse] });
      log('Attestvarsel sendt for', email);
    }
  }

  async function samlinger() {   // arrangementer for grupper med påminnelse, remindH timer før start (standard 24)
    const na = Date.now(), flagg = {};
    PAAMINN_STANDARD.forEach(g => { flagg[g] = true; });
    (await pool.query('select id, remind from groups where remind is not null')).rows.forEach(r => { flagg[r.id] = !!r.remind; });
    for (const e of (await pool.query('select id, title, start, time, "remindH", groups from events where coalesce(draft, false) = false and start is not null')).rows) {
      const h = e.remindH == null ? 24 : +e.remindH; if (!(h > 0)) continue;
      const gr = (e.groups || []).filter(g => flagg[g]); if (!gr.length) continue;
      const start = klokkeTilMs(e.start, e.time); if (!start) continue;
      if (na < start - h * 36e5 || na > start || !(await forst('sr:' + e.id + ':' + h))) continue;
      await send('Påminnelse', tekstFoer(h) + (e.time ? ' kl. ' + e.time : '') + ': ' + (e.title || 'Samling'), 'prog', { type: 'grupper', groups: gr });
      log('Samlingspåminnelse sendt:', e.title);
    }
  }

  async function bookinger() {   // vertskapet før en booking + teamet kvelden før
    const na = Date.now(), imorgen = osloDato(new Date(na + 864e5)), kveld = osloTime(new Date()) >= 17;
    for (const b of (await pool.query("select * from bookinger where dato is not null and fra is not null and coalesce(status, '') <> 'foresporsel'")).rows) {
      const rom = (b.rom || []).join(', ');
      if (kveld && b.dato === imorgen && await forst('tp:' + b.id + ':' + imorgen)) {
        const grupper = {};
        (await pool.query("select email, oppg from booking_team where booking_id = $1 and k = 'ja'", [b.id])).rows.forEach(t => { (grupper[t.oppg || ''] = grupper[t.oppg || ''] || []).push(lav(t.email)); });
        const mt = (b.maaltider || []).map(m => (m.t || '') + (m.kl ? ' kl. ' + m.kl : '') + (m.r ? ' (' + m.r + ')' : '')).filter(Boolean);
        for (const o of Object.keys(grupper)) {
          const tekst = 'Kl. ' + b.fra + (rom ? ' · ' + rom : '') + (mt.length ? '. Servering: ' + mt.join(', ') : '') + (o ? '. Din oppgave: ' + o : '') + '. Du står på lista.';
          await send('I morgen: ' + (b.tittel || 'Utleie'), tekst.slice(0, 300), 'me', { type: 'emails', emails: grupper[o] });
        }
      }
      const h = b.remindH == null ? 24 : +b.remindH; if (!(h > 0)) continue;
      const start = klokkeTilMs(b.dato, b.fra); if (!start) continue;
      if (na < start - h * 36e5 || na > start || !(await forst('bp:' + b.id + ':' + h + ':' + start))) continue;
      const al = (b.allergener || []).concat(b.allergenNotat ? [b.allergenNotat] : []).join(', ');
      const tekst = tekstFoer(h) + ' kl. ' + b.fra + ': ' + (b.tittel || 'Utleie') + (rom ? ' (' + rom + ')' : '') + (b.gjester ? ', ' + b.gjester + ' gjester' : '') + (b.servering ? '. Servering: ' + b.servering : '') + (al ? '. Allergener: ' + al : '');
      await send('Påminnelse: booking', tekst.slice(0, 300), 'me', { type: 'grupper', groups: ['vertskap'] });
      log('Bookingpåminnelse sendt:', b.tittel);
    }
  }

  async function rydd() { await pool.query('delete from varsel_sendt where ms < $1', [Date.now() - 400 * 864e5]); }

  return { vakter, attester, samlinger, bookinger, rydd, tekstFoer, klokkeTilMs, osloDato };
};
