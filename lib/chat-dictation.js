// Nettleserens talegjenkjenning lager et utkast. Denne modulen sender aldri en melding.
let active;
const STILLE = [10, 30, 60, 300];
let silenceMs = 10000;
try { const v = Number(localStorage.getItem('sm-dikt-stille')); if (STILLE.includes(v)) silenceMs = v * 1000; } catch {}
export function closeDictation() { active?.(); }
export function openDictation({ insert, isCurrent }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) throw new Error('Snakk til tekst støttes ikke i denne nettleseren. Du kan bruke mikrofonen på telefonens tastatur.');
  if (active || document.querySelector('dialog.pub')) return;
  const d = document.createElement('dialog'); d.className = 'lp pub';
  d.innerHTML = '<div class="form"><h3 style="margin:0">Snakk til tekst</h3><p class="small" style="margin:0">Nettleseren gjør talen om til tekst og kan sende lyd til sin taleleverandør. Teksten sendes først når du selv trykker Send i chatten.</p><label class="f">Utkast<textarea data-draft rows="5" maxlength="1000" placeholder="Det du sier kommer her …"></textarea></label><button type="button" class="btn primary" data-hold style="min-height:56px;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none">🎤 Hold inne for å snakke</button><label class="f">Stopp av seg selv etter stillhet<select data-stille><option value="10">10 sekunder</option><option value="30">30 sekunder</option><option value="60">1 minutt</option><option value="300">5 minutter</option></select></label><p class="small" role="status" aria-live="polite" data-status>Snakk norsk.</p><div class="btns"><button type="button" class="btn" data-close>Avbryt</button><button type="button" class="btn" data-start>Start</button><button type="button" class="btn primary" data-use disabled>Bruk teksten</button></div></div>';
  const q = s => d.querySelector(s), status = s => { q('[data-status]').textContent = s; };
  let rec, listening = false, closed = false, prefix = '', error = false;
  const controls = b => { listening = b; q('[data-start]').textContent = b ? 'Stopp' : 'Snakk mer'; q('[data-draft]').disabled = b; q('[data-use]').disabled = b || !q('[data-draft]').value.trim(); };
  function finish() {
    if (closed) return; closed = true; want = false; stopTimer();
    if (rec) { rec.onresult = rec.onerror = rec.onend = null; try { rec.abort(); } catch {} }
    d.remove(); if (active === finish) active = null;
  }
  active = finish; window.SionDictation = { close: closeDictation };
  q('[data-close]').onclick = finish; d.addEventListener('close', finish); d.addEventListener('cancel', e => { e.preventDefault(); finish(); });
  q('[data-draft]').oninput = () => { q('[data-use]').disabled = !q('[data-draft]').value.trim(); };
  // Lytter med en gang vinduet åpnes. Nettleseren avslutter selv etter noen sekunders stillhet, så økten startes på nytt til det har vært stille i silenceMs.
  let want = false, last = 0, timer = 0, holding = false;
  q('[data-stille]').value = String(silenceMs / 1000);
  q('[data-stille]').onchange = e => { silenceMs = Number(e.target.value) * 1000; try { localStorage.setItem('sm-dikt-stille', e.target.value); } catch {} };
  const stopTimer = () => { clearInterval(timer); timer = 0; };
  function begin() {
    if (closed || !want) return;
    const session = new Recognition(); rec = session; rec.lang = 'nb-NO'; rec.interimResults = true; rec.continuous = false;
    prefix = q('[data-draft]').value.trim(); error = false;
    rec.onresult = e => {
      if (closed || rec !== session || !isCurrent()) return;
      last = Date.now();
      const text = Array.from(e.results).map(r => r[0].transcript).join(' ').trim();
      q('[data-draft]').value = [prefix,text].filter(Boolean).join(' ');
    };
    rec.onerror = e => {
      if (closed || rec !== session) return;
      if (['no-speech','aborted'].includes(e.error)) return;
      error = true; want = false; stopTimer(); controls(false);
      status(['not-allowed','service-not-allowed'].includes(e.error) ? 'Mikrofon eller talegjenkjenning ble ikke tillatt. Sjekk nettleserens tillatelser.' : 'Talegjenkjenningen stoppet. Prøv igjen, eller skriv teksten.');
    };
    rec.onend = () => {
      if (closed || rec !== session) return;
      if (want && !error && (holding || Date.now() - last < silenceMs)) { setTimeout(begin, 120); return; }
      want = false; stopTimer(); controls(false);
      if (!error) status('Les og rett utkastet før du bruker teksten.');
    };
    try { rec.start(); controls(true); status(holding ? 'Lytter … slipp for å stoppe' : 'Lytter … stopper etter ' + silenceMs / 1000 + ' sekunder uten tale'); }
    catch { want = false; stopTimer(); controls(false); status('Kunne ikke starte. Prøv igjen.'); }
  }
  function start() {
    if (!isCurrent()) { finish(); return; }
    want = true; last = Date.now(); stopTimer();
    timer = setInterval(() => { if (want && !holding && Date.now() - last >= silenceMs) { want = false; stopTimer(); try { rec && rec.stop(); } catch {} } }, 500);
    begin();
  }
  // Hold inne: det skrives så lenge knappen holdes, uten tidsgrense. Slipp stopper.
  const hold = q('[data-hold]');
  hold.oncontextmenu = e => e.preventDefault();
  hold.onpointerdown = e => { e.preventDefault(); try { hold.setPointerCapture(e.pointerId); } catch {} holding = true; if (listening) { status('Lytter … slipp for å stoppe'); last = Date.now(); } else start(); };
  const slipp = () => { if (!holding) return; holding = false; want = false; stopTimer(); try { rec && rec.stop(); } catch {} };
  hold.onpointerup = hold.onpointercancel = hold.onlostpointercapture = slipp;
  q('[data-start]').onclick = () => {
    if (listening) { want = false; stopTimer(); try { rec.stop(); } catch {} return; }
    start();
  };
  q('[data-use]').onclick = () => {
    if (listening) return;
    const text = q('[data-draft]').value.trim();
    if (!isCurrent()) return finish();
    if (text && insert(text)) finish(); else status('Teksten er for lang for skrivefeltet. Kort ned utkastet.');
  };
  document.body.append(d); d.showModal(); start(); return finish;
}
