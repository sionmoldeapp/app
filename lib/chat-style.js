// Lokal forhåndsvisning. Ingen samtaleinnstillinger skrives før brukeren trykker Bruk.
export function openStyle(o) {
  if (document.querySelector('dialog.pub')) return;
  if (!document.getElementById('chat-style-css')) {
    const l = document.createElement('link'); l.id = 'chat-style-css'; l.rel = 'stylesheet';
    l.href = new URL('./chat-style.css', import.meta.url).href; document.head.append(l);
  }
  const d = document.createElement('dialog'); d.className = 'lp pub cstyle'; d.setAttribute('aria-labelledby', 'csTitle');
  d.innerHTML = '<header class="cshead"><h3 id="csTitle">Farge og bakgrunn</h3><button type="button" class="cbtn" data-close aria-label="Lukk">×</button></header>'
    + '<div class="cspreview cmsg" aria-label="Forhåndsvisning med eksempelmeldinger"><div class="cssample">Vi sees på fredag!</div><div class="cssample csown">Ja, det blir fint!</div></div>'
    + '<p class="cshelp">Prøv her først. Alle i samtalen ser valget når du trykker Bruk.</p>'
    + '<div class="cstabs" role="tablist" aria-label="Tilpass samtalen"><button type="button" id="csBgTab" role="tab" aria-controls="csBgPanel" aria-selected="true" data-tab="background">Bakgrunn</button><button type="button" id="csColorTab" role="tab" aria-controls="csColorPanel" aria-selected="false" data-tab="color">Meldingsfarge</button></div>'
    + '<div class="csbody"><section id="csBgPanel" role="tabpanel" aria-labelledby="csBgTab"><div class="cscategories" aria-label="Bakgrunnsstiler"></div><div class="csgallery"></div><div class="csupload"><button type="button" class="btn" data-upload>Velg eget bilde</button><input type="file" accept="image/*" data-file hidden><button type="button" class="btn" data-remove hidden>Fjern eget bilde</button></div></section>'
    + '<section id="csColorPanel" role="tabpanel" aria-labelledby="csColorTab" hidden><div class="cscolors"></div></section></div>'
    + '<footer class="csfoot"><span class="csstatus" role="status" aria-live="polite"></span><button type="button" class="btn primary" data-apply>Bruk bakgrunn</button></footer>';
  const q = s => d.querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  let bg = o.background || 'ingen', color = o.color || 'tema', tab = 'background', busy = false, closed = false, image = null, oldImage = '', generation = 0;
  const categories = [['new','Nye'],['jesus','Jesus'],['cross','Kors'],['light','Lyse'],['calm','Rolige'],['simple','Enkle'],['all','Alle']];
  const group = id => id.startsWith('jesus-') ? 'jesus' : id.startsWith('kors-') ? 'cross' : /^lys(18|19|20|21|22)$/.test(id) ? 'light' : /^neon(18|19|20|21|22)$/.test(id) ? 'new' : ['ingen','himmel','solnedgang','skog','natt','rosa','sion'].includes(id) ? 'simple' : 'calm';
  let category = bg === 'ingen' ? 'new' : group(bg);
  const status = t => { q('.csstatus').textContent = t; };
  q('.cscategories').innerHTML = categories.map(([id,n]) => '<button type="button" data-category="'+id+'" aria-pressed="false">'+n+'</button>').join('');
  // En separat bildeflate lar hele bakgrunnen vises uten tekst oppå miniatyren.
  q('.csgallery').innerHTML = o.backgrounds.map(([id,n]) => '<button type="button" class="cstile" data-bg="'+id+'" aria-pressed="false"><span class="cbgp" data-bgp="'+id+'" aria-hidden="true"></span><span>'+esc(n)+'</span></button>').join('');
  q('.cscolors').innerHTML = [['tema','Tema',null],...o.colors].map(([id,n,hex]) => '<button type="button" data-color="'+id+'" aria-pressed="false"><span style="background:'+ (hex || 'var(--brand)') +'" aria-hidden="true"></span>'+esc(n)+'</button>').join('');
  function controls(b) { busy = b; d.querySelectorAll('button,input').forEach(x => { x.disabled = b; }); }
  function filter() {
    d.querySelectorAll('[data-category]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.category === category)));
    d.querySelectorAll('.cstile[data-bg]').forEach(b => { const id=b.dataset.bg; b.hidden = category !== 'all' && group(id) !== category && !(category === 'light' && id.endsWith('-lys')) && !(category === 'new' && /^(jesus|kors)-/.test(id)); });
  }
  function preview() {
    const p = q('.cspreview'), version = ++generation; p.dataset.bg = bg; p.style.backgroundImage = '';
    const f = o.colors.find(c => c[0] === color); q('.csown').style.background = f ? f[2] : 'var(--brand)'; q('.csown').style.color = f ? '#fff' : 'var(--brand-ink)';
    if (bg === 'eget') { const u = image || oldImage; if (u) p.style.backgroundImage = 'url("'+u+'")'; }
    else if (bg === 'sion') o.pattern().then(u => { if (!closed && generation === version && u) p.style.backgroundImage = 'url("'+u+'")'; }).catch(() => {});
    d.querySelectorAll('.cstile[data-bg]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bg === bg)));
    d.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === color)));
    q('[data-remove]').hidden = bg !== 'eget';
  }
  const finish = () => { if (closed) return; closed = true; generation++; d.remove(); };
  d.addEventListener('close', finish); d.addEventListener('cancel', e => { e.preventDefault(); if (!busy) d.close(); });
  d.addEventListener('keydown', e => {
    if (!e.target.matches('[role=tab]') || !['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    e.preventDefault(); const b = q(e.key === 'Home' ? '#csBgTab' : e.key === 'End' ? '#csColorTab' : tab === 'background' ? '#csColorTab' : '#csBgTab'); b.click(); b.focus();
  });
  d.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b || busy) return;
    if (b.hasAttribute('data-close')) return d.close();
    if (b.dataset.tab) {
      tab = b.dataset.tab; d.querySelectorAll('[data-tab]').forEach(x => { x.setAttribute('aria-selected', String(x === b)); x.tabIndex = x === b ? 0 : -1; });
      q('#csBgPanel').hidden = tab !== 'background'; q('#csColorPanel').hidden = tab !== 'color';
      q('[data-apply]').textContent = tab === 'background' ? 'Bruk bakgrunn' : 'Bruk farge'; status('');
    }
    if (b.dataset.category) { category = b.dataset.category; filter(); }
    if (b.dataset.bg) { bg = b.dataset.bg; preview(); status('Forhåndsvisning – ikke lagret ennå.'); }
    if (b.dataset.color) { color = b.dataset.color; preview(); status('Forhåndsvisning – ikke lagret ennå.'); }
    if (b.hasAttribute('data-upload')) q('[data-file]').click();
    if (b.hasAttribute('data-remove')) { bg = 'ingen'; image = null; category = 'simple'; filter(); preview(); status('Trykk Bruk for å fjerne bakgrunnen.'); }
    if (b.hasAttribute('data-apply')) {
      controls(true); status('Lagrer …');
      try { await o.save(tab === 'color' ? { field:'farge', value:color === 'tema' ? null : color } : { field:'bakgrunn', value:bg, image:bg === 'eget' ? image : null }); if (!closed) d.close(); }
      catch (err) { if (!closed) { controls(false); status(err?.message || 'Kunne ikke lagre. Prøv igjen.'); } }
    }
  });
  q('[data-file]').addEventListener('change', async e => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    if (!f.type.startsWith('image/')) return status('Velg en bildefil.');
    controls(true); status('Gjør klart bildet …');
    try { const u = await o.prepareImage(f); if (!closed) { image = u; bg = 'eget'; preview(); status('Bildet er klart. Trykk Bruk for å lagre.'); } }
    catch { if (!closed) status('Kunne ikke lese bildet. Velg et annet.'); }
    finally { if (!closed) controls(false); }
  });
  document.body.append(d); filter(); preview(); q('#csColorTab').tabIndex = -1; d.showModal();
  if (bg === 'eget') o.loadImage().then(u => { oldImage = u || ''; if (!closed && !image) preview(); }).catch(() => { if (!closed) status('Kunne ikke vise det egne bildet.'); });
  return d;
}
