// Tilgangsoversikten følger appens lagrede fargevalg på samme enhet.
(() => {
  const lsGet = key => {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  };
const cHex=h=>{h=String(h||'').trim().replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');return /^[0-9a-f]{6}$/i.test(h)?'#'+h.toLowerCase():null};
const cRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const cHx=a=>'#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const cMix=(a,b,t)=>{const x=cRgb(a),y=cRgb(b);return cHx(x.map((v,i)=>v*(1-t)+y[i]*t))};
const cLum=h=>{const [r,g,b]=cRgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*b};
const cKon=(a,b)=>{const l1=cLum(a),l2=cLum(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)};
const cInk=h=>cKon(h,'#ffffff')>=cKon(h,'#111111')?'#ffffff':'#111111';
const EGEN_DEF={brand:'#14304f',lamp:'#96723a',bgL:'#f6f4ef',bgD:'#0a1b2e',surfL:'',surfD:'',inkL:'',inkD:''};
function egenCfg(){let j={};try{j=JSON.parse(lsGet('sm-egen')||'{}')||{}}catch(e){}const o={...EGEN_DEF};for(const k in EGEN_DEF){const v=cHex(j[k]);if(v)o[k]=v;else if(/^(surf|ink)/.test(k))o[k]=''}return o}
function egenTokens(c,mork){
  const bg=mork?c.bgD:c.bgL,surf=(mork?c.surfD:c.surfL)||(mork?cMix(bg,'#ffffff',.08):cMix(bg,'#ffffff',.75)),ink=(mork?c.inkD:c.inkL)||(mork?cMix('#ffffff',bg,.08):cMix(bg,'#000000',.88));
  let brand=c.brand,lamp=c.lamp;
  if(mork){if(cLum(brand)<.3)brand=cMix(brand,'#ffffff',.5);if(cLum(lamp)<.3)lamp=cMix(lamp,'#ffffff',.5)}else if(cLum(lamp)>.45)lamp=cMix(lamp,'#000000',.35);
  const muted=cMix(ink,bg,.42),line=cMix(bg,ink,.14),chip=cMix(bg,ink,.08),okc=mork?'#8cc7b0':'#2d6a5a',lb=cLum(c.brand);
  const ha=lb>.3?cMix(c.brand,'#000000',.2):cMix(c.brand,'#ffffff',.12),hb=lb>.3?cMix(c.brand,'#000000',.55):lb>.12?cMix(c.brand,'#000000',.4):cMix(c.brand,'#000000',.45),[lr,lg,lbb]=cRgb(lamp);
  return '--bg:'+bg+';--surface:'+surf+';--ink:'+ink+';--muted:'+muted+';--line:'+line+';--brand:'+brand+';--brand-ink:'+cInk(brand)+';--lamp:'+lamp+';--lamp-soft:'+cMix(lamp,bg,.82)+';--ok:'+okc+';--ok-soft:'+cMix(okc,bg,.82)+';--chip:'+chip
   +';--lamp-ink:'+cInk(lamp)+';--lamp-glow:rgba('+lr+','+lg+','+lbb+','+(mork?.26:.22)+');--shadow-card:'+(mork?'0 1px 2px rgba(0,0,0,.3),0 8px 22px rgba(0,0,0,.28)':'0 1px 2px rgba(28,42,58,.05),0 8px 22px rgba(28,42,58,.06)')+';--shadow-pop:'+(mork?'0 10px 26px rgba(0,0,0,.45)':'0 10px 26px rgba(28,42,58,.14)')
   +';--ikon-a:'+cMix(c.brand,'#ffffff',.2)+';--ikon-b:'+c.brand+';--hero-a:'+ha+';--hero-b:'+hb+';--hero-dot:'+cMix(lamp,'#ffffff',.35)+';--hero-link:'+cMix(c.brand,'#ffffff',.85)+(mork?';color-scheme:dark':'')}
function egenBruk(){let st=document.getElementById('egenPal');if(!st){st=document.createElement('style');st.id='egenPal';document.head.appendChild(st)}
  const c=egenCfg(),L=egenTokens(c,false),D=egenTokens(c,true);
  st.textContent=':root[data-pal="egen"]{'+L+'}@media (prefers-color-scheme:dark){:root[data-pal="egen"]:not([data-theme="light"]){'+D+'}}:root[data-pal="egen"][data-theme="dark"]{'+D+'}';
  window.PAL_BG=window.PAL_BG||{};PAL_BG.egen=[c.bgL,c.bgD]}
egenBruk();

  const palettes = new Set(['klassisk','premium','kobber','grafitt','skog','vin','iphone','android','rosa','gutta','jul','solnedgang','egen']);
  function applyAppearance() {
    const root = document.documentElement;
    const selected = lsGet('sm-pal');
    root.dataset.pal = palettes.has(selected) ? selected : 'premium';
    const theme = lsGet('sm-theme');
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
    egenBruk();
  }
  window.sionTilgangTema = applyAppearance;
  window.addEventListener('storage', event => {
    if (event.key === null || ['sm-pal','sm-theme','sm-egen'].includes(event.key)) applyAppearance();
  });
  window.addEventListener('focus', applyAppearance);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) applyAppearance();
  });
  applyAppearance();
})();
