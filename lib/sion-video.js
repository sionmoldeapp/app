// LiveKit lastes fra appens egne filer. Ingen offentlig møtetjeneste eller romlenker.
let aktiv = null, sdkLasting;
function sdk() {
  if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
  if (!sdkLasting) sdkLasting = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = new URL('./livekit-client-2.23.0.umd.js', import.meta.url).href;
    s.onload = () => window.LivekitClient ? resolve(window.LivekitClient) : reject(new Error('Videobiblioteket mangler.'));
    s.onerror = () => { s.remove(); sdkLasting = null; reject(new Error('Kunne ikke laste video. Sjekk nettilkoblingen.')); };
    document.head.append(s);
  });
  return sdkLasting;
}
export function close() { if (aktiv) aktiv.close(); }
export async function open({ title, getAccess }) {
  if (aktiv) { aktiv.dlg.focus(); return; }
  if (!document.getElementById('sion-video-css')) {
    const css = document.createElement('link'); css.id = 'sion-video-css'; css.rel = 'stylesheet';
    css.href = new URL('./sion-video.css', import.meta.url).href; document.head.append(css);
  }
  const dlg = document.createElement('dialog'); dlg.className = 'svideo';
  dlg.setAttribute('aria-label', 'Gruppevideo');
  dlg.innerHTML = '<header><h2>Gruppevideo</h2><button type="button" data-close aria-label="Lukk videosamtalen">Lukk</button></header>'
    + '<p data-title></p><p data-status role="status" aria-live="polite">Henter videotjenesten …</p>'
    + '<div data-preview><video muted autoplay playsinline></video></div>'
    + '<div data-setup><p>Opptil 12 personer. De andre blir med via videoknappen i samme gruppechat.</p>'
    + '<label><input type="checkbox" data-camera checked> Kamera på</label> <label><input type="checkbox" data-mic checked> Mikrofon på</label> <label data-blurvalg><input type="checkbox" data-blur> Uskarp bakgrunn</label>'
    + '<div class="svbuttons"><button type="button" data-previewbtn disabled>Forhåndsvisning</button><button type="button" data-join disabled>Bli med</button></div></div>'
    + '<div data-grid hidden></div><div class="svbuttons" data-controls hidden><button type="button" data-mute>Mikrofon</button>'
    + '<button type="button" data-cam>Kamera</button><button type="button" data-blurknapp>Uskarp bakgrunn</button><label data-kvalvalg hidden>Kvalitet på den andre <select data-kval><option value="hoy">Høy</option><option value="mid">Middels</option><option value="lav">Lav (sparer data)</option></select></label><button type="button" data-sound hidden>Slå på lyd</button><button type="button" data-leave>Forlat samtalen</button></div>';
  const q = s => dlg.querySelector(s), status = t => { q('[data-status]').textContent = t; };
  q('[data-title]').textContent = title;
  let ferdig = false, opptatt = false, room, L, tracks = [], access, bakgrunn, parSamtale = false, kval = 'hoy';
  const lagBlur = async () => { bakgrunn = bakgrunn || await import('./sion-bakgrunn.js'); return bakgrunn.lagBlurProsessor(); };
  const tiles = new Map();
  const fjernMedia = el => { el._sionTrack?.detach?.(el); el.srcObject = null; el.remove(); };
  const fjernTile = tile => { tile.querySelectorAll('video,audio').forEach(fjernMedia); tile.remove(); };
  async function adgang() {
    try { return await getAccess(); }
    catch (e) { const feil = new Error(e?.message || 'Videotjenesten er ikke tilgjengelig.'); feil.sionAccess = true; throw feil; }
  }
  function stoppTracks() { for (const t of tracks) { try { t.stopProcessor?.(); } catch { } t.stop(); } tracks = []; q('[data-preview] video').srcObject = null; }
  function rydd() {
    if (ferdig) return; ferdig = true; stoppTracks();
    if (room) { room.removeAllListeners(); room.disconnect(); }
    for (const tile of tiles.values()) fjernTile(tile); tiles.clear();
    dlg.remove(); window.removeEventListener('pagehide', rydd); if (aktiv?.dlg === dlg) aktiv = null;
  }
  aktiv = { dlg, close: rydd }; window.addEventListener('pagehide', rydd);
  dlg.addEventListener('cancel', e => { e.preventDefault(); rydd(); }); dlg.addEventListener('close', rydd);
  q('[data-close]').onclick = rydd; q('[data-leave]').onclick = rydd;
  document.body.append(dlg); dlg.showModal();
  const knapper = b => { opptatt = b; for (const s of ['[data-join]', '[data-previewbtn]', '[data-camera]', '[data-mic]']) q(s).disabled = b; };
  async function fang() {
    stoppTracks();
    if (!q('[data-mic]').checked && !q('[data-camera]').checked) return true;
    const nye = await L.createLocalTracks({ audio: q('[data-mic]').checked,
      video: q('[data-camera]').checked ? { resolution: (parSamtale ? L.VideoPresets.h720 : L.VideoPresets.h360).resolution, facingMode: 'user' } : false });
    if (ferdig) { nye.forEach(t => t.stop()); return false; }
    tracks = nye;
    const v = tracks.find(t => t.kind === L.Track.Kind.Video);
    if (v && q('[data-blur]').checked) { try { await v.setProcessor(await lagBlur()); } catch { q('[data-blur]').checked = false; status('Uskarp bakgrunn virker ikke på denne enheten. Du er med uten.'); } }
    if (v) v.attach(q('[data-preview] video'));
    return true;
  }
  function feil(e) {
    const nektet = ['NotAllowedError', 'PermissionDeniedError'].includes(e?.name);
    status(e?.sionAccess ? e.message : nektet ? 'Kamera eller mikrofon ble ikke tillatt. Du kan slå dem av og bli med for å lytte.' :
      'Kunne ikke koble til. Sjekk nettet, eller prøv med kamera og mikrofon av.');
  }
  function tegn() {
    if (ferdig || !room) return;
    const folk = [room.localParticipant, ...room.remoteParticipants.values()], ids = new Set(folk.map(p => p.identity));
    for (const [id, tile] of tiles) if (!ids.has(id)) { fjernTile(tile); tiles.delete(id); }
    for (const p of folk) {
      let tile = tiles.get(p.identity);
      if (!tile) { tile = document.createElement('section'); tile.innerHTML = '<div class="svmedia"></div><span></span>'; tiles.set(p.identity, tile); q('[data-grid]').append(tile); }
      tile.querySelector('span').textContent = (p === room.localParticipant ? 'Deg' : p.name || 'Deltaker') + (p.isMicrophoneEnabled ? '' : ' · mikrofon av');
      const media = tile.querySelector('.svmedia'), wanted = new Set();
      for (const pub of p.trackPublications.values()) {
        const t = pub.track;
        if (!t || pub.isMuted || (p === room.localParticipant && t.kind === L.Track.Kind.Audio)) continue;
        const id = pub.trackSid; wanted.add(id);
        if (!Array.from(media.children).some(el => el.dataset.track === id)) {
          const el = t.attach(); el._sionTrack = t; el.dataset.track = id; el.autoplay = true; el.playsInline = true;
          el.muted = p === room.localParticipant; media.append(el);
        }
      }
      for (const el of Array.from(media.children)) if (!wanted.has(el.dataset.track)) fjernMedia(el);
    }
    q('[data-mute]').textContent = room.localParticipant.isMicrophoneEnabled ? 'Slå av mikrofon' : 'Slå på mikrofon';
    q('[data-cam]').textContent = room.localParticipant.isCameraEnabled ? 'Slå av kamera' : 'Slå på kamera';
    status(parSamtale ? (folk.length === 1 ? 'Venter på den andre …' : 'I samtale') : folk.length + ' av 12 deltakere' + (folk.length === 1 ? ' – venter på de andre.' : ''));
  }
  q('[data-previewbtn]').onclick = async () => {
    if (opptatt) return; knapper(true);
    try { if (await fang()) status('Forhåndsvisning – du er ikke med i samtalen ennå.'); }
    catch (e) { if (!ferdig) feil(e); }
    finally { if (!ferdig) knapper(false); }
  };
  for (const s of ['[data-camera]', '[data-mic]']) q(s).onchange = stoppTracks;
  q('[data-join]').onclick = async () => {
    if (opptatt) return; knapper(true); status('Kobler til …');
    try {
      // Nytt adgangsbevis på hvert forsøk: medlemskap sjekkes igjen etter forhåndsvisningen.
      access = await adgang(); if (ferdig) return; parSamtale = access.max === 2;
      if (!await fang()) return;
      room = new L.Room({ adaptiveStream: !parSamtale, dynacast: true, videoCaptureDefaults: { resolution: (parSamtale ? L.VideoPresets.h720 : L.VideoPresets.h360).resolution },
        publishDefaults: parSamtale ? { simulcast: true, videoCodec: 'vp8', videoEncoding: { maxBitrate: 1700000, maxFramerate: 30 } } : { simulcast: true, videoCodec: 'vp8' }, disconnectOnPageLeave: true });
      const r = room;
      for (const ev of [L.RoomEvent.ParticipantConnected, L.RoomEvent.ParticipantDisconnected, L.RoomEvent.TrackSubscribed,
        L.RoomEvent.TrackUnsubscribed, L.RoomEvent.TrackMuted, L.RoomEvent.TrackUnmuted,
        L.RoomEvent.LocalTrackPublished, L.RoomEvent.LocalTrackUnpublished]) r.on(ev, tegn);
      r.on(L.RoomEvent.Reconnecting, () => status('Forbindelsen ble brutt. Prøver å koble til igjen …'));
      r.on(L.RoomEvent.Reconnected, tegn);
      r.on(L.RoomEvent.TrackSubscribed, settKvalitet);
      r.on(L.RoomEvent.Disconnected, () => {
        if (ferdig) return; stoppTracks(); r.removeAllListeners(); if (room === r) room = null;
        for (const tile of tiles.values()) fjernTile(tile); tiles.clear(); q('[data-controls]').hidden = true;
        q('[data-setup]').hidden = false; q('[data-preview]').hidden = false;
        q('[data-grid]').hidden = true; status('Samtalen er avsluttet. Du kan bli med igjen.'); knapper(false);
      });
      r.on(L.RoomEvent.AudioPlaybackStatusChanged, () => { q('[data-sound]').hidden = r.canPlaybackAudio; });
      await r.connect(access.url, access.token);
      if (ferdig) { r.disconnect(); return; }
      for (const t of tracks) { if (ferdig) return; await r.localParticipant.publishTrack(t); }
      if (ferdig) return;
      q('[data-preview] video').srcObject = null;
      q('[data-setup]').hidden = true; q('[data-preview]').hidden = true;
      q('[data-controls]').hidden = false; q('[data-grid]').hidden = false; q('[data-kvalvalg]').hidden = !parSamtale; settKvalitet(); knappTekst(); tegn();
    } catch (e) {
      if (room) { room.removeAllListeners(); room.disconnect(); room = null; }
      stoppTracks(); if (!ferdig) { feil(e); knapper(false); }
    }
  };
  function settKvalitet() {
    if (!room || !parSamtale) return;
    const nivaa = { hoy: L.VideoQuality.HIGH, mid: L.VideoQuality.MEDIUM, lav: L.VideoQuality.LOW }[kval];
    for (const p of room.remoteParticipants.values()) for (const pub of p.trackPublications.values()) if (pub.kind === L.Track.Kind.Video) { try { pub.setVideoQuality(nivaa); } catch { } }
  }
  q('[data-kval]').onchange = e => { kval = e.currentTarget.value; settKvalitet(); };
  q('[data-blurknapp]').onclick = async e => {
    if (!room || ferdig) return; const b = e.currentTarget; b.disabled = true;
    try {
      const pub = room.localParticipant.getTrackPublication(L.Track.Source.Camera), tr = pub?.track;
      if (!tr) { status('Slå på kamera først.'); return; }
      if (tr.getProcessor?.()) await tr.stopProcessor(); else await tr.setProcessor(await lagBlur());
    } catch { status('Uskarp bakgrunn virker ikke på denne enheten.'); }
    finally { b.disabled = false; knappTekst(); }
  };
  function knappTekst() { const tr = room?.localParticipant.getTrackPublication(L.Track.Source.Camera)?.track; q('[data-blurknapp]').textContent = tr?.getProcessor?.() ? 'Vis bakgrunn' : 'Uskarp bakgrunn'; }
  async function veksle(b, kamera) {
    if (!room || ferdig) return; b.disabled = true;
    try { const p = room.localParticipant; if (kamera) await p.setCameraEnabled(!p.isCameraEnabled); else await p.setMicrophoneEnabled(!p.isMicrophoneEnabled); }
    catch (e) { if (!ferdig) feil(e); }
    finally { b.disabled = false; tegn(); }
  }
  q('[data-mute]').onclick = e => veksle(e.currentTarget, false);
  q('[data-cam]').onclick = e => veksle(e.currentTarget, true);
  q('[data-sound]').onclick = async () => { try { await room?.startAudio(); } catch { status('Trykk Slå på lyd for å høre samtalen.'); } };
  try {
    // Sjekk oppsettet før vi ber om kamera eller mikrofon.
    access = await adgang(); if (ferdig) return; L = await sdk(); if (ferdig) return;
    parSamtale = access.max === 2;
    if (parSamtale) { dlg.setAttribute('aria-label', 'Videoanrop'); q('h2').textContent = 'Videoanrop'; q('[data-setup] p').textContent = 'Samtale mellom to. Kamera og mikrofon velges før du blir med.'; }
    try { const b = await import('./sion-bakgrunn.js'); if (!b.blurStottet()) { q('[data-blurvalg]').hidden = true; q('[data-blurknapp]').hidden = true; } } catch { q('[data-blurvalg]').hidden = true; q('[data-blurknapp]').hidden = true; }
    status('Velg kamera og mikrofon før du blir med.'); knapper(false);
  } catch (e) { if (!ferdig) status(e.message || 'Videotjenesten er ikke tilgjengelig.'); }
}
window.SionVideo = { open, close };
