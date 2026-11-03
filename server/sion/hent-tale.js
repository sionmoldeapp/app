// Henter den norske talemodellen (NB-Whisper small, Nasjonalbiblioteket, ca. 175 MB) til server/volumes/tale.
// Kjøres én gang på hver server: node server/sion/hent-tale.js
const fs = require('fs'), path = require('path'), { Readable } = require('stream'), { pipeline } = require('stream/promises');
const URL = 'https://huggingface.co/NbAiLab/nb-whisper-small/resolve/main/ggml-model-q5_0.bin';
const mappe = path.join(__dirname, '..', 'volumes', 'tale'), fil = path.join(mappe, 'nb-whisper-small-q5_0.bin');
(async () => {
  if (fs.existsSync(fil) && fs.statSync(fil).size > 1e8) { console.log('Modellen finnes allerede:', fil); return; }
  fs.mkdirSync(mappe, { recursive: true });
  const r = await fetch(URL, { redirect: 'follow' });
  if (!r.ok) throw new Error('Nedlasting feilet: HTTP ' + r.status);
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(fil + '.del'));
  fs.renameSync(fil + '.del', fil);
  console.log('Ferdig:', fil);
})().catch(e => { console.error(e.message); process.exit(1); });
