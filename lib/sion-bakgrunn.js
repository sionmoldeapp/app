// Uskarp bakgrunn i videosamtaler. Personen skilles fra bakgrunnen med MediaPipe (selfie-segmentering) som kjører i telefonen/nettleseren;
// bildet forlater ikke enheten. Filene ligger i appens egen mappe (lib/mediapipe), ingen CDN. Se server/sion/hent-mediapipe.js for den store wasm-filen.
let segLasting = null;
const base = new URL('./mediapipe/', import.meta.url).href;

export function blurStottet() {
  return typeof WebAssembly === 'object' && typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

async function segmenterer() {
  if (!segLasting) segLasting = (async () => {
    const { FilesetResolver, ImageSegmenter } = await import(base + 'vision_bundle.mjs');
    const fil = await FilesetResolver.forVisionTasks(base + 'wasm');
    const lag = delegate => ImageSegmenter.createFromOptions(fil, {
      baseOptions: { modelAssetPath: base + 'selfie_segmenter.tflite', delegate },
      runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true,
    });
    try { return await lag('GPU'); } catch { return await lag('CPU'); }
  })().catch(e => { segLasting = null; throw e; });
  return segLasting;
}

/* Tar et kamerasporet og gir et nytt spor der bakgrunnen er uskarp. stopp() frigjør alt (ikke selve kameraet). */
export async function startBlur(inn, { styrke = 14 } = {}) {
  const seg = await segmenterer();
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = new MediaStream([inn]);
  await video.play();
  const set = inn.getSettings?.() || {}, W = video.videoWidth || set.width || 640, H = video.videoHeight || set.height || 360;
  const ut = document.createElement('canvas'); ut.width = W; ut.height = H; const c = ut.getContext('2d');
  const liten = document.createElement('canvas'), cl = liten.getContext('2d');     // nedskalert kopi gir uskarp bakgrunn uten ctx.filter (virker også i Safari)
  liten.width = Math.max(16, Math.round(W / styrke)); liten.height = Math.max(9, Math.round(H / styrke));
  const person = document.createElement('canvas'); person.width = W; person.height = H; const cp = person.getContext('2d');
  const maske = document.createElement('canvas'), cm = maske.getContext('2d');
  let stoppet = false, rid = 0, sist = -1;
  const spor = ut.captureStream(30).getVideoTracks()[0];
  const tegn = () => {
    if (stoppet) return;
    if (video.readyState >= 2 && video.currentTime !== sist) {
      sist = video.currentTime;
      try {
        const r = seg.segmentForVideo(video, performance.now()), m = r.confidenceMasks?.[0];
        if (m) {
          const mw = m.width, mh = m.height, d = m.getAsFloat32Array();
          if (maske.width !== mw) { maske.width = mw; maske.height = mh; }
          const bilde = cm.createImageData(mw, mh), px = bilde.data;
          for (let i = 0; i < d.length; i++) { const a = Math.max(0, Math.min(1, (d[i] - 0.35) / 0.3)); px[i * 4 + 3] = a * 255; }   // myk kant rundt personen
          cm.putImageData(bilde, 0, 0);
          cl.imageSmoothingEnabled = true; cl.drawImage(video, 0, 0, liten.width, liten.height);
          c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(liten, 0, 0, W, H);
          cp.globalCompositeOperation = 'source-over'; cp.clearRect(0, 0, W, H); cp.drawImage(video, 0, 0, W, H);
          cp.globalCompositeOperation = 'destination-in'; cp.drawImage(maske, 0, 0, W, H);
          c.drawImage(person, 0, 0);
        }
        r.close?.();
      } catch { /* hopp over ruten */ }
    }
    rid = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tegn) : requestAnimationFrame(tegn);
  };
  tegn();
  return {
    track: spor,
    stopp() { stoppet = true; try { video.cancelVideoFrameCallback?.(rid); } catch { } cancelAnimationFrame(rid); spor.stop(); video.srcObject = null; video.remove(); },
  };
}

/* LiveKit TrackProcessor: kameraet.setProcessor(lagBlurProsessor()) og stopProcessor() for å slå av. */
export function lagBlurProsessor(opt) {
  let rør = null;
  return {
    name: 'sion-uskarp-bakgrunn', processedTrack: undefined,
    async init(o) { rør = await startBlur(o.track, opt); this.processedTrack = rør.track; },
    async restart(o) { await this.destroy(); await this.init(o); },
    async destroy() { rør?.stopp(); rør = null; this.processedTrack = undefined; },
  };
}
