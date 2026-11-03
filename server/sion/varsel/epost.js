// E-post fra egen server (erstatter MailApp i Apps Script): møtenotat, forbønner, saker til lederrådet, velkomst, påmeldte,
// hilsen til medlemmer, påminnelse om faktura for utleie, og daglig rydding av gamle data.
// Sendes via SMTP (samme oppsett som innloggingen bruker: SMTP_* i .env). Lastes av varsel.js.
const nodemailer = require('nodemailer');

module.exports = ({ pool, log, erAdmin, erPastor, lederAv, brukere, ledere, lesMal, osloDato, osloTime, forst }) => {
  const env = process.env, APP_URL = env.APP_URL || env.SITE_URL || 'https://sionmoldeapp.github.io/app/';
  const FRA = env.SMTP_ADMIN_EMAIL || env.SMTP_USER || '';
  const post = env.SMTP_HOST ? nodemailer.createTransport({ host: env.SMTP_HOST, port: +env.SMTP_PORT || 587, secure: +env.SMTP_PORT === 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined }) : null;
  const MND = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  const lav = x => String(x || '').toLowerCase();
  const gyldig = x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
  const ren = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ramme = inn => '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5">' + inn + '<p style="color:#888;font-size:13px;margin-top:24px">Sendt fra Sion Molde-appen.</p></div>';
  const idag = () => { const [a, m, d] = osloDato(new Date()).split('-'); return d + '.' + m + '.' + a; };

  async function sendEpost(o) {
    if (!post) throw new Error('E-post er ikke satt opp på serveren (SMTP mangler i .env).');
    await post.sendMail({ from: { name: env.SMTP_SENDER_NAME || 'Sion Molde', address: FRA }, ...o });
  }
  // Én sending per person og handling per 8. sekund (som i Apps Script)
  const sist = {};
  const forFort = (nokkel, ms = 8000) => { if (Date.now() - (sist[nokkel] || 0) < ms) return true; sist[nokkel] = Date.now(); return false; };
  const iGruppe = async (e, g) => ((await pool.query('select groups from members where lower(email) = $1', [e])).rows[0] || { groups: [] }).groups.includes(g);
  const erMedlem = async e => (await pool.query('select 1 from members where lower(email) = $1 union select 1 from admins where lower(email) = $1', [e])).rowCount > 0;
  const adminer = async () => (await pool.query('select email from admins')).rows.map(r => lav(r.email));

  // ---- Møtenotat til egen adresse (adressen kommer fra innloggingsbeviset, aldri fra appen)
  const STR = { 1: '75%', 2: '85%', 3: '100%', 4: '120%', 5: '140%', 6: '180%', 7: '220%' };
  const renskNotat = html => ren(String(html || '').slice(0, 20000))
    .replace(/&lt;(\/?)(b|i|strong|em|div|p)&gt;/gi, '<$1$2>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;font[^&]*?size="([1-7])"[^&]*?&gt;/gi, (m, n) => '<span style="font-size:' + STR[n] + '">')
    .replace(/&lt;font[^&]*?&gt;/gi, '<span>')
    .replace(/&lt;\/font&gt;/gi, '</span>');
  async function notat(email, d) {
    if (!(await erMedlem(email))) return { ok: false, feil: 'Bare medlemmer kan sende notater til seg selv.' };
    if (forFort('notat:' + email)) return { ok: false, feil: 'Vent noen sekunder før du sender igjen.' };
    const tittel = String(d.title || '').trim().slice(0, 120) || 'Møtenotat', m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d.date || ''));
    const dato = m ? (+m[3]) + '. ' + MND[+m[2] - 1] + ' ' + m[1] : '', forkynner = String(d.speaker || '').trim().slice(0, 80);
    const kropp = renskNotat(d.html), tekst = kropp.replace(/<br>|<\/div>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const topp = [dato ? 'Dato: ' + dato : '', forkynner ? 'Forkynner: ' + forkynner : ''].filter(Boolean);
    await sendEpost({ to: email, subject: 'Møtenotat: ' + tittel + (dato ? ' (' + dato + ')' : ''), text: tittel + '\n' + topp.join('\n') + '\n\n' + tekst + '\n\nSendt fra Sion Molde-appen.',
      html: ramme('<h2 style="margin:0 0 6px">' + ren(tittel) + '</h2><div style="color:#555;margin:0 0 14px">' + topp.map(ren).join('<br>') + '</div><div>' + kropp + '</div>') });
    return { ok: true, til: email };
  }

  // ---- Nye forbønner (ikke bedt for, yngre enn en uke) til egen adresse: administratorer og gruppen bonneledere
  async function bonn(email) {
    if (!(await erAdmin(email)) && !(await iGruppe(email, 'bonneledere'))) return { ok: false, feil: 'Bare administratorer og bønneledere kan sende forbønner på e-post.' };
    if (forFort('bonn:' + email)) return { ok: false, feil: 'Vent noen sekunder før du sender igjen.' };
    const emner = (await pool.query('select t, name from prayers where t is not null and ms > $1 and bedt is null order by ms', [Date.now() - 7 * 864e5])).rows;
    if (!emner.length) return { ok: false, feil: 'Ingen nye forbønner å sende.' };
    const navn = x => x.name || 'anonym', dato = idag();
    await sendEpost({ to: email, subject: 'Forbønner (' + emner.length + ') ' + dato,
      text: 'Forbønner ' + dato + '\n\n' + emner.map(x => '• ' + x.t.replace(/\s*\n\s*/g, ' ') + ' (' + navn(x) + ')').join('\n') + '\n\nSendt fra Sion Molde-appen.',
      html: ramme('<h2 style="margin:0 0 4px">Forbønner</h2><div style="color:#555;margin:0 0 12px">' + ren(dato) + ' · ' + emner.length + ' nye</div><ul>' + emner.map(x => '<li>' + ren(x.t).replace(/\n/g, '<br>') + ' <span style="color:#777">(' + ren(navn(x)) + ')</span></li>').join('') + '</ul>') });
    return { ok: true, til: email, antall: emner.length };
  }

  // ---- Åpne saker til lederrådet: administrator får dem selv, gruppen lederradet sender dem til alle administratorer
  async function saker(email) {
    const adm = await erAdmin(email);
    if (!adm && !(await iGruppe(email, 'lederradet'))) return { ok: false, feil: 'Bare administratorer og medlemmer i lederrådet kan sende saklisten.' };
    if (forFort('saker:' + email)) return { ok: false, feil: 'Vent noen sekunder før du sender igjen.' };
    const s = (await pool.query("select tittel, t, name from lrsaker where not done and coalesce(t, '') <> '' order by ms")).rows;
    if (!s.length) return { ok: false, feil: 'Ingen åpne saker å sende.' };
    const til = adm ? [email] : await adminer();
    if (!til.length) return { ok: false, feil: 'Fant ingen administrator å sende til.' };
    const dato = idag();
    await sendEpost({ to: til.join(','), subject: 'Saker til lederrådet (' + s.length + ') ' + dato,
      text: 'Saker til lederrådet ' + dato + '\n\n' + s.map((x, i) => (i + 1) + '. ' + (x.tittel ? x.tittel + ': ' : '') + x.t.replace(/\s*\n\s*/g, ' ') + (x.name ? ' (' + x.name + ')' : '')).join('\n') + '\n\nSendt fra Sion Molde-appen av ' + email + '.',
      html: ramme('<h2 style="margin:0 0 4px">Saker til lederrådet</h2><div style="color:#555;margin:0 0 12px">' + ren(dato) + ' · ' + s.length + ' åpne saker</div><ol>' + s.map(x => '<li style="margin:0 0 8px">' + (x.tittel ? '<b>' + ren(x.tittel) + '</b><br>' : '') + ren(x.t).replace(/\n/g, '<br>') + (x.name ? ' <span style="color:#555">(' + ren(x.name) + ')</span>' : '') + '</li>').join('') + '</ol><div style="color:#777;font-size:13px">Sendt av ' + ren(email) + '.</div>') });
    return { ok: true, til: adm ? email : 'administratorene', antall: s.length };
  }

  // ---- Velkomst til nye brukere (administrator eller gruppeleder)
  async function velkomst(d) {
    const liste = (d.emails || []).map(x => lav(String(x).trim())).filter(gyldig).slice(0, 50);
    if (!liste.length) return { ok: false, feil: 'Ingen gyldige adresser.' };
    const tekst = 'Hei!\n\nDu er lagt til i Sion Molde-appen. Der finner du program, nyheter og varsler fra menigheten.\n\n'
      + '1. Velg passord\nDu får en egen e-post med en lenke for å velge passord. Finner du den ikke, så sjekk søppelpost.\n\n'
      + '2. Åpne appen og logg inn\n' + APP_URL + '\nLogg inn under «Mer».\n\n'
      + '3. Legg appen på telefonen\nAndroid (Chrome): trykk på menyen (tre prikker) og velg «Installer app».\niPhone (Safari): trykk på Del-ikonet og velg «Legg til på Hjem-skjerm».\n\n'
      + '4. Slå på varsler\nÅpne appen, gå til «Mer» → «Meg» → «Innstillinger» → «Varsler» og trykk «Slå på varsler». På iPhone må appen først ligge på Hjem-skjermen.\n\nHilsen\nSion Molde';
    for (const to of liste) await sendEpost({ to, subject: 'Velkommen til Sion Molde-appen', text: tekst });
    return { ok: true, sendt: liste.length };
  }

  // ---- Liste over påmeldte til avsenderens egen adresse (administrator eller gruppeleder)
  async function paameldte(email, d) {
    const navn = (d.names || []).map(x => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 500);
    const emne = String(d.title || '').trim().slice(0, 120) || 'Arrangement', dato = String(d.date || '').slice(0, 20);
    await sendEpost({ to: email, subject: 'Påmeldte: ' + emne + (dato ? ' (' + dato + ')' : ''),
      text: emne + (dato ? ' (' + dato + ')' : '') + '\n' + navn.length + ' påmeldte med navn\n\n' + (navn.map((n, i) => (i + 1) + '. ' + n).join('\n') || '(ingen navn ennå)') + '\n\nSendt fra Sion Molde-appen.',
      html: ramme('<h2 style="margin:0 0 4px">' + ren(emne) + '</h2><div style="color:#555;margin:0 0 12px">' + ren(dato) + ' · ' + navn.length + ' påmeldte med navn</div>' + (navn.length ? '<ol>' + navn.map(n => '<li>' + ren(n) + '</li>').join('') + '</ol>' : '<p>Ingen navn ennå.</p>')) });
    return { ok: true, til: email };
  }

  // ---- Hilsen på e-post til medlemmer (bare administrator), i blindkopi 40 om gangen
  async function hilsen(email, d) {
    if (!(await erAdmin(email)) && !(await erPastor(email))) return { ok: false, feil: 'Bare administratorer og pastorer kan sende e-post til medlemmer.' };
    const emne = String(d.title || '').trim().slice(0, 100), tekst = String(d.body || '').trim().slice(0, 3000);
    if (!emne || !tekst) return { ok: false, feil: 'Tittel og melding mangler.' };
    const mal = await lesMal(d.mal), b = await brukere(), l = mal.type === 'ltype' || mal.type === 'blandet' ? await ledere() : {};
    const iG = e => b[e].groups.some(g => (mal.groups || []).includes(g)), iL = e => l[e] && (mal.ltypes || []).includes(l[e]);
    const liste = Object.keys(b).filter(e => e !== email && gyldig(e) && (mal.type === 'alle' || mal.type === 'medlem' || (mal.type === 'grupper' && iG(e)) || (mal.type === 'ltype' && iL(e)) || (mal.type === 'blandet' && (iG(e) || iL(e)))));
    if (!liste.length) return { ok: false, feil: 'Fant ingen mottakere.' };
    for (let i = 0; i < liste.length; i += 40)
      await sendEpost({ to: email, bcc: liste.slice(i, i + 40), subject: emne, text: tekst + '\n\n— Sendt fra Sion Molde-appen', html: ramme('<h2 style="margin:0 0 10px">' + ren(emne) + '</h2><div>' + ren(tekst).replace(/\n/g, '<br>') + '</div>') });
    log('Hilsen på e-post fra', email, 'til', liste.length, 'mottakere: «' + emne + '»');
    return { ok: true, antall: liste.length };
  }

  // ---- Påminnelse om faktura: utleier som er over (1 døgn etter slutt) og ikke merket fakturert. Gjentas med fakturaVentH (standard 24 t).
  async function faktura() {
    const na = Date.now(), s = ((await pool.query("select data from settings where id = 'utleie'")).rows[0] || { data: {} }).data || {};
    const til = gyldig(env.FAKTURA_TIL || '') ? env.FAKTURA_TIL : gyldig(s.fakturaEpost || '') ? s.fakturaEpost : 'post@sionmolde.no';   // FAKTURA_TIL overstyrer (testversjonen på PC-en: til avsenderen selv)
    const sendt = {};
    (await pool.query("select nokkel, ms from varsel_sendt where nokkel like 'fp:%'")).rows.forEach(r => { sendt[r.nokkel] = +r.ms; });
    const forfalt = [];
    for (const b of (await pool.query("select * from bookinger where dato is not null and til is not null and not fakturert and coalesce(status, '') <> 'foresporsel' and coalesce(pris, '') not like 'Eget%'")).rows) {
      const sluttDato = b.dato2 || b.dato, slutt = new Date(sluttDato + 'T' + String(b.til).padStart(5, '0') + ':00').getTime();
      if (isNaN(slutt) || na < slutt + 864e5 || na > slutt + 120 * 864e5) continue;
      const vent = Math.max(1, +b.fakturaVentH || 24) * 36e5, sist0 = sendt['fp:' + b.id] || 0;
      if (na < (+b.fakturaUtsattTil || 0) || (sist0 && na < sist0 + vent)) continue;
      forfalt.push({ ...b, sluttDato });
    }
    if (!forfalt.length) return;
    const linjer = forfalt.sort((a, b) => a.dato < b.dato ? -1 : 1).map(x => '• ' + (x.tittel || 'Utleie') + ' – ' + x.dato + (x.sluttDato !== x.dato ? ' til ' + x.sluttDato : '') + ((x.rom || []).length ? ' (' + x.rom.join(', ') + ')' : '')
      + '\n   Leietaker: ' + (x.leier || 'ikke oppgitt') + (x.kontakt ? ', ' + x.kontakt : '') + (x.pris ? '\n   Pris: ' + x.pris : ''));
    await sendEpost({ to: til, subject: 'Påminnelse: ' + (forfalt.length === 1 ? 'faktura for utleie er ikke sendt' : forfalt.length + ' utleier mangler faktura'),
      text: 'Følgende utleier er over, og faktura er ikke merket som sendt:\n\n' + linjer.join('\n\n') + '\n\nNår fakturaen er sendt, åpne appen (Mer → Booking), trykk på bookingen og velg «Marker faktura sendt». Da stopper påminnelsene. Du kan også utsette påminnelsen på bookingen.\n\n' + APP_URL });
    for (const x of forfalt) await pool.query('insert into varsel_sendt (nokkel, ms) values ($1, $2) on conflict (nokkel) do update set ms = excluded.ms', ['fp:' + x.id, na]);
    log('Fakturapåminnelse sendt til', til, 'for', forfalt.length, 'utleier');
  }

  // ---- Daglig rydding (etter kl. 03): forbønner etter 30 dager, påmeldinger 90 dager etter arrangementet, samtaler etter 365 dager uten bruk
  async function ryddGamle() {
    if (osloTime(new Date()) < 3 || !(await forst('rydd:' + osloDato(new Date())))) return;
    const na = Date.now();
    const a = (await pool.query('delete from prayers where ms is not null and ms < $1', [na - 30 * 864e5])).rowCount;
    const b = (await pool.query("delete from rsvps where start ~ '^\\d{4}-\\d{2}-\\d{2}$' and start < $1", [osloDato(new Date(na - 90 * 864e5))])).rowCount;
    const c = (await pool.query('delete from threads where ms is not null and ms < $1', [na - 365 * 864e5])).rowCount;   // meldingene følger med (on delete cascade)
    log('Rydding:', a, 'forbønner,', b, 'påmeldinger,', c, 'samtaler slettet');
  }

  // Kall fra appen som går til e-post. Gir undefined for handlinger som ikke hører hit.
  async function behandle(email, d) {
    if (d.action === 'notat') return notat(email, d);
    if (d.action === 'bonn') return bonn(email);
    if (d.action === 'saker') return saker(email);
    if (!['velkomst', 'paameldte', 'epost'].includes(d.action)) return undefined;
    if (!(await erAdmin(email)) && !(await lederAv(email)).length) return { ok: false, feil: 'Du har ikke tilgang. Innlogget som ' + email + ', og den adressen er verken administrator eller gruppeleder.' };
    if (d.action === 'velkomst') return velkomst(d);
    if (d.action === 'paameldte') return paameldte(email, d);
    return hilsen(email, d);
  }
  return { behandle, faktura, ryddGamle, sendEpost, APP_URL, adminer, iGruppe };
};
