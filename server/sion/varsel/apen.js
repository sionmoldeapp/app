// Kall uten innlogging (erstatter Apps Script): anonyme forbønner og leietakerens skjema for en booking (selvbetjening).
// Selvbetjeningslenken lages av en innlogget administrator eller gruppen Utleie (selvlenke). Lastes av varsel.js.
const crypto = require('crypto');

module.exports = ({ pool, log, send, erAdmin, osloDato, epost }) => {
  const env = process.env;
  const TALLORD = ['null', 'en', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti'];
  const SELV_MAT = ['Frokost', 'Lunsj', 'Middag', 'Annet'];   // samme lister som skjemaet i appen og Apps Script
  const SELV_ALLERGENER = ['Gluten', 'Melk', 'Laktose', 'Egg', 'Fisk', 'Skalldyr', 'Bløtdyr', 'Peanøtter', 'Nøtter', 'Soya', 'Selleri', 'Sennep', 'Sesam', 'Sulfitt', 'Lupin'];
  // Hemmeligheten til regnestykket utledes fra den private VAPID-nøkkelen, så det trengs ingen egen nøkkel i .env.
  const hemmelig = crypto.createHash('sha256').update('sion-bonn|' + (env.VAPID_PRIVATE_KEY || '')).digest();
  const sig = (ts, nonce, svar) => crypto.createHmac('sha256', hemmelig).update(ts + '|' + nonce + '|' + svar).digest('base64url');
  const brukte = new Map(), teller = {};   // brukte sjekker (20 min) og antall forbønner per time og døgn (i minnet)

  async function bonn(d) {
    if (d.action === 'bonnutfordring') {
      const a = 1 + Math.floor(Math.random() * 8), b = 1 + Math.floor(Math.random() * (9 - a)), ts = String(Date.now()), nonce = crypto.randomBytes(4).toString('hex');
      return { ok: true, spm: 'Hva er ' + TALLORD[a] + ' pluss ' + TALLORD[b] + '? Skriv svaret som et tall.', ts, nonce, sig: sig(ts, nonce, a + b) };
    }
    const tekst = String(d.t || '').trim();
    if (!tekst || tekst.length > 400) return { ok: false, feil: 'Skriv et forbønn på opptil 400 tegn.' };
    if (d.hp) return { ok: true };   // skjult felt som bare roboter fyller ut
    const alder = Date.now() - (+d.ts || 0);
    if (!(alder > 3000 && alder < 15 * 60e3)) return { ok: false, feil: 'Sjekken er utløpt. Åpne skjemaet på nytt.' };
    const nonce = String(d.nonce || '');
    for (const [k, t] of brukte) if (Date.now() - t > 20 * 60e3) brukte.delete(k);
    if (brukte.has(nonce)) return { ok: false, feil: 'Sjekken er allerede brukt. Åpne skjemaet på nytt.' };
    brukte.set(nonce, Date.now());
    const forventet = sig(String(d.ts), nonce, String(parseInt(d.svar, 10))), gitt = String(d.sig || '');
    if (gitt.length !== forventet.length || !crypto.timingSafeEqual(Buffer.from(gitt), Buffer.from(forventet))) return { ok: false, feil: 'Svaret på sjekken var feil. Prøv igjen.' };
    const time = osloDato(new Date()) + 'T' + new Date().getHours(), dag = osloDato(new Date());
    Object.keys(teller).forEach(k => { if (k !== 'T' + time && k !== 'D' + dag) delete teller[k]; });
    if ((teller['T' + time] || 0) >= 10 || (teller['D' + dag] || 0) >= 40) return { ok: false, feil: 'Det er sendt inn mange forbønner nå. Prøv igjen senere.' };
    await pool.query("insert into prayers (t, name, \"by\", ms, ber) values ($1, '', 'anonym', $2, '{}')", [tekst, Date.now()]);
    teller['T' + time] = (teller['T' + time] || 0) + 1; teller['D' + dag] = (teller['D' + dag] || 0) + 1;
    return { ok: true };
  }

  // ---- Selvbetjening for leietakere
  async function koder(d) {
    const bid = String(d.bid || ''), tok = String(d.tok || '');
    if (!/^[A-Za-z0-9_-]{10,40}$/.test(bid) || !/^[a-f0-9]{32}$/.test(tok)) return null;
    const r = (await pool.query('select tok, brukt, "by" from selvlenker where bid = $1', [bid])).rows[0];
    if (!r || r.tok !== tok) return null;
    return { bid, tok, brukt: !!r.brukt, by: r.by || '' };
  }
  async function lenke(email, d) {   // innlogget: administrator eller gruppen Utleie
    const bid = String(d.bid || '');
    if (!/^[A-Za-z0-9_-]{10,40}$/.test(bid)) return { ok: false, feil: 'Ugyldig booking.' };
    if (!(await erAdmin(email)) && !(await epost.iGruppe(email, 'utleie'))) return { ok: false, feil: 'Bare administratorer og gruppen Utleie kan lage lenke.' };
    const b = (await pool.query('select "by" from bookinger where id = $1', [bid])).rows[0];
    if (!b) return { ok: false, feil: 'Fant ikke bookingen. Lagre den først.' };
    let tok = d.ny ? '' : ((await pool.query('select tok from selvlenker where bid = $1', [bid])).rows[0] || {}).tok || '';
    if (!tok) {
      tok = crypto.randomBytes(16).toString('hex');
      await pool.query('insert into selvlenker (bid, tok, "by", brukt, ms) values ($1, $2, $3, false, $4) on conflict (bid) do update set tok = excluded.tok, "by" = excluded."by", brukt = false, ms = excluded.ms', [bid, tok, b.by || email, Date.now()]);
    }
    return { ok: true, url: epost.APP_URL.replace(/\/?$/, '/') + '?selv=' + bid + '.' + tok };
  }
  async function skjema(d) {
    const k = await koder(d);
    if (!k) return { ok: false, feil: 'Lenken er ugyldig eller utløpt. Be om en ny lenke.' };
    const f = (await pool.query('select * from bookinger where id = $1', [k.bid])).rows[0];
    if (!f) return { ok: false, feil: 'Fant ikke bookingen. Be om en ny lenke.' };
    if (d.action === 'selvhent') return { ok: true, brukt: k.brukt, tittel: f.tittel || '', dato: f.dato || '', dato2: f.dato2 || '', fra: f.fra || '', til: f.til || '', leier: f.leier || '', rom: f.rom || [] };
    // selvsend
    if (d.hp) return { ok: true };
    if (k.brukt) return { ok: false, feil: 'Skjemaet er allerede sendt inn. Ta kontakt med oss hvis noe skal endres.' };
    const antall = parseInt(d.antall, 10);
    if (!(antall >= 1 && antall <= 2000)) return { ok: false, feil: 'Skriv hvor mange personer dere blir.' };
    const maal = (Array.isArray(d.maal) ? d.maal : []).slice(0, 8).map(m => ({ t: SELV_MAT.includes(m && m.t) ? m.t : 'Annet', kl: /^\d\d:\d\d$/.test(String(m && m.kl || '')) ? m.kl : '', n: Math.max(0, Math.min(2000, parseInt(m && m.n, 10) || 0)) })).filter(m => m.kl || m.n);
    const all = (Array.isArray(d.all) ? d.all : []).slice(0, 20).map(a => ({ n: SELV_ALLERGENER.includes(a && a.n) ? a.n : '', a: Math.max(0, Math.min(2000, parseInt(a && a.a, 10) || 0)) })).filter(a => a.n && a.a > 0);
    const annet = String(d.annet || '').replace(/\s+/g, ' ').trim().slice(0, 100), msg = String(d.msg || '').trim().slice(0, 1000);
    const allNotat = all.map(a => a.n + ' ' + a.a).concat(annet ? [annet] : []).join(', ').slice(0, 200);
    const serv = maal.map(m => m.t + (m.kl ? ' ' + m.kl : '') + (m.n ? ': ' + m.n + ' pers.' : '')).join('; ').slice(0, 200);
    const notat = ((f.notat ? f.notat + ' | ' : '') + 'Fra leier: ' + (msg || 'skjema sendt inn')).slice(0, 500);
    await pool.query('update bookinger set gjester = $2, maaltider = $3, servering = $4, allergener = $5, "allergenNotat" = $6, notat = $7, ms = $8 where id = $1',
      [k.bid, antall, JSON.stringify(maal.map(m => ({ t: m.t, kl: m.kl, r: m.n ? m.n + ' personer' : '' }))), serv, all.map(a => a.n), allNotat, notat, Date.now()]);
    await pool.query('update selvlenker set brukt = true, "bruktMs" = $2 where bid = $1', [k.bid, Date.now()]);
    // Melding til den som la inn bookingen: privat samtale i Sionchat (bare mottakeren er deltaker) og varsel
    try {
      const tittel = f.tittel || 'Booking', mottaker = String(k.by || f.by || '').toLowerCase(), dm = /^(\d{4})-(\d\d)-(\d\d)$/.exec(f.dato || '');
      const dato = dm ? (+dm[3]) + '. ' + ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'][+dm[2] - 1] : (f.dato || '');
      const tekst = '✅ Skjema fra leier er sendt inn\n' + tittel + ' ' + dato + (f.fra ? ' kl. ' + f.fra : '') + (f.leier ? '\nLeier: ' + f.leier : '')
        + '\nAntall personer: ' + antall + (serv ? '\nMåltider: ' + serv : '') + (allNotat ? '\nAllergener: ' + allNotat : '') + (msg ? '\n\nBeskjed: ' + msg : '') + '\n\nDetaljene ligger nå i bookingen. Legg inn endelig pris.';
      const fraNavn = ('Booking: ' + (f.leier || tittel)).slice(0, 60), mottakere = mottaker ? [mottaker] : await epost.adminer();
      for (const to of mottakere) {
        const id = (await pool.query(`insert into threads ("roleId", "roleName", kind, "toName", "from", "fromName", parts, last, "lastBy", ms, unread)
          values ('dm', 'Booking', 'dm', $1, 'selvbetjening', $2, $3, $4, 'selvbetjening', $5, $3) returning id`, [to, fraNavn, [to], ('Skjema fra leier: ' + tittel).slice(0, 140), Date.now()])).rows[0].id;
        await pool.query("insert into messages (thread_id, \"by\", name, text) values ($1, 'selvbetjening', $2, $3)", [id, fraNavn, tekst.slice(0, 960) + '⟦selv:' + k.bid + '⟧']);
      }
      await send('Skjema fra leier', (tittel + (f.leier ? ' – ' + f.leier : '') + ': ' + antall + ' personer').slice(0, 120), 'me', { type: 'emails', emails: mottakere });
    } catch (e) { log('selv-melding:', e.message); }
    return { ok: true };
  }

  // Gir undefined for handlinger som ikke hører hit
  async function behandle(d) {
    if (d.action === 'bonnutfordring' || d.action === 'bonnanon') return bonn(d);
    if (d.action === 'selvhent' || d.action === 'selvsend') return skjema(d);
    return undefined;
  }
  return { behandle, lenke };
};
