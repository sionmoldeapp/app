// Valgfri test mot en ISOLERT LiveKit på loopback. Bruk aldri ekte kontoer eller produksjonsnøkler.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('./varsel/node_modules/playwright-core');
const { lagVideo } = require('./varsel/video');
test('LiveKit: toveis testvideo, kamerarydding og grense på 12', { skip: !process.env.LIVEKIT_TEST_URL, timeout: 120000 }, async () => {
  const target = new URL(process.env.LIVEKIT_TEST_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Kun isolert loopback-server er tillatt');
  const root = path.resolve(__dirname, '../..'), parts = Array.from({ length: 13 }, (_, i) => `test${i}@example.test`);
  const video = lagVideo({ env: { LIVEKIT_URL: target.href.replace(/\/$/, ''), LIVEKIT_API_URL: target.href.replace(/^ws/, 'http'),
    LIVEKIT_API_KEY: 'codex-test', LIVEKIT_API_SECRET: 'codex-test-only-secret-12345678901234567890' },
    pool: { query: async q => ({ rows: q.includes('from threads') ? [{ kind: 'gruppe', parts }] : [{ name: 'Testperson' }] }) } });
  const server = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><title>Isolert video</title><script src="/lib/livekit-client-2.23.0.umd.js"></script>'); }
    if (!['/lib/sion-video.js', '/lib/sion-video.css', '/lib/livekit-client-2.23.0.umd.js'].includes(req.url)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(fs.readFileSync(path.join(root, req.url)));
  });
  let browser;
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + server.address().port;
    const executablePath = process.env.CHROME_BIN || ['C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
    browser = await chromium.launch({ executablePath, headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--mute-audio'] });
    const pages = [];
    for (let i = 0; i < 2; i++) {
      const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); pages.push(p); await p.goto(url);
      await p.evaluate(() => { window.captured = []; const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async o => { const s = await original(o); captured.push(...s.getTracks()); return s; }; });
      const adgang = await video({ threadId: 'isolert-video-media' }, parts[i]); assert.equal(adgang.ok, true);
      await p.evaluate(async a => { await (await import('/lib/sion-video.js')).open({ title: 'Videotest', getAccess: async () => a }); }, adgang);
      await p.click('[data-join]'); await p.waitForSelector('[data-controls]:not([hidden])', { timeout: 20000 });
    }
    for (const p of pages) {
      await p.waitForFunction(() => document.querySelectorAll('[data-grid] section').length === 2 && [...document.querySelectorAll('[data-grid] video')].filter(v => v.videoWidth > 0).length === 2, { timeout: 20000 });
    }
    await pages[0].screenshot({ path: path.join(os.tmpdir(), 'sion-video-test-mobile.png') });
    for (const p of pages) { await p.click('[data-leave]'); await p.waitForFunction(() => captured.length >= 2 && captured.every(t => t.readyState === 'ended')); await p.close(); }
    const p = await browser.newPage(); await p.goto(url);
    const tokens = [];
    for (let i = 0; i < 13; i++) { const a = await video({ threadId: 'isolert-video-grense' }, parts[i]); assert.equal(a.ok, true); tokens.push(a); }
    const resultat = await p.evaluate(async adgang => {
      window.rooms = []; const resultat = [];
      for (const a of adgang) {
        const r = new LivekitClient.Room(); rooms.push(r);
        try { await r.connect(a.url, a.token, { autoSubscribe: false }); resultat.push({ ok: true }); }
        catch (e) { resultat.push({ ok: false, reason: e.reason, code: e.code, message: e.message }); }
      }
      return resultat;
    }, tokens);
    assert.equal(resultat.filter(r => r.ok).length, 12, JSON.stringify(resultat));
    assert.equal(resultat[12].ok, false); // SDK-et rapporterer kapasitetsavvisning som WebSocket-feil.
    const fullt = await video({ threadId: 'isolert-video-grense' }, parts[12]);
    assert.equal(fullt.ok, false); assert.match(fullt.feil, /full/);
    await p.evaluate(async () => { for (const r of rooms) await r.disconnect(); });
  } finally { await browser?.close(); await new Promise(r => server.close(r)); }
});
