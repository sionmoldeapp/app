// Eksplisitt driftstest med kunstige kameraer. Ingen ekte brukere, databaseendringer eller varsler.
// Bruk: SION_VIDEO_DEPLOYED_TEST=1 node --test sion/video-deployed.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('./varsel/node_modules/playwright-core');
const { RoomServiceClient } = require('./varsel/node_modules/livekit-server-sdk');
const { lagVideo } = require('./varsel/video');
test('Sikker video gjennom offentlig Funnel og TURN/TLS', { skip: !process.env.SION_VIDEO_DEPLOYED_TEST, timeout: 120000 }, async () => {
  const root = path.resolve(__dirname, '../..');
  const cfg = Object.fromEntries(fs.readFileSync(path.join(root, 'server/.env'), 'utf8').split(/\r?\n/)
    .filter(s => /^[A-Z_]+=/.test(s)).map(s => { const n = s.indexOf('='); return [s.slice(0, n), s.slice(n + 1).replace(/^["']|["']$/g, '')]; }));
  const domain = new URL(cfg.LIVEKIT_URL).hostname;
  const dns = await (await fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=A')).json();
  const ip = dns.Answer?.find(a => a.type === 1 && !/^(100\.|127\.|10\.|192\.168\.)/.test(a.data))?.data;
  assert.ok(ip, 'Mangler offentlig Funnel-adresse fra uavhengig DNS');
  const rooms = new RoomServiceClient('http://127.0.0.1:7880', cfg.LIVEKIT_API_KEY, cfg.LIVEKIT_API_SECRET);
  const parts = ['video-test-a@example.test', 'video-test-b@example.test'], names = new Set();
  const video = lagVideo({ env: { ...cfg, LIVEKIT_API_URL: 'http://127.0.0.1:7880' }, rooms: {
    createRoom: async o => { names.add(o.name); return rooms.createRoom(o); }, listParticipants: r => rooms.listParticipants(r),
  }, pool: { query: async q => ({ rows: q.includes('from threads') ? [{ kind: 'gruppe', parts }] : [{ name: 'Videotest' }] }) } });
  const server = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><title>Sikker videotest</title><script src="/lib/livekit-client-2.23.0.umd.js"></script>'); }
    if (!['/lib/sion-video.js', '/lib/sion-video.css', '/lib/livekit-client-2.23.0.umd.js'].includes(req.url)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(fs.readFileSync(path.join(root, req.url)));
  });
  let browser;
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const executablePath = process.env.CHROME_BIN || ['C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
    browser = await chromium.launch({ executablePath, headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--mute-audio', '--host-resolver-rules=MAP ' + domain + ' ' + ip] });
    const pages = [], tid = 'codex-video-deployment-' + Date.now();
    for (let i = 0; i < 2; i++) {
      const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); pages.push(p);
      await p.goto('http://127.0.0.1:' + server.address().port);
      await p.evaluate(() => {
        window.testPCs = []; window.iceErrors = []; const Original = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends Original { constructor(config, ...args) { super({ ...config, iceTransportPolicy: 'relay' }, ...args); testPCs.push(this);
          this.addEventListener('icecandidateerror', e => iceErrors.push({ code: e.errorCode, text: e.errorText, url: e.url })); }
          setConfiguration(config) { super.setConfiguration({ ...config, iceTransportPolicy: 'relay' }); } };
        const original = LivekitClient.Room.prototype.connect;
        LivekitClient.Room.prototype.connect = function(u, t, o) { return original.call(this, u, t, { ...o, rtcConfig: { iceTransportPolicy: 'relay' } }); };
      });
      const adgang = await video({ threadId: tid }, parts[i]); assert.equal(adgang.ok, true, adgang.feil);
      await p.evaluate(async a => { await (await import('/lib/sion-video.js')).open({ title: 'Sikker videotest', getAccess: async () => a }); }, adgang);
      await p.click('[data-join]');
      try { await p.waitForSelector('[data-controls]:not([hidden])', { timeout: 25000 }); }
      catch { const diag = await p.evaluate(() => ({ status: document.querySelector('[data-status]').textContent,
        configs: testPCs.map(pc => ({ policy: pc.getConfiguration().iceTransportPolicy, servers: pc.getConfiguration().iceServers.map(s => s.urls) })), errors: iceErrors }));
        assert.fail(JSON.stringify(diag)); }
    }
    for (const p of pages) {
      await p.waitForFunction(() => [...document.querySelectorAll('[data-grid] video')].filter(v => v.videoWidth > 0).length === 2, { timeout: 25000 });
      // Chromium publiserer ICE-statistikk litt etter de første videobildene.
      await p.waitForFunction(async () => {
        for (const pc of testPCs) { const stats = await pc.getStats();
          for (const s of stats.values()) if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.bytesReceived + s.bytesSent > 0 && stats.get(s.localCandidateId)?.candidateType === 'relay') return true;
        }
        return false;
      }, null, { timeout: 12000, polling: 500 });
      const stats = await p.evaluate(async () => {
        const active = [];
        for (const pc of testPCs) { const stats = await pc.getStats();
          for (const s of stats.values()) if (s.type === 'candidate-pair' && s.state === 'succeeded') {
            active.push({ relay: stats.get(s.localCandidateId)?.candidateType === 'relay', bytes: s.bytesReceived + s.bytesSent });
          }
        }
        return active;
      });
      assert.ok(stats.length && stats.every(s => s.relay && s.bytes > 0), 'Videotrafikken må gå gjennom kryptert TURN-relé: ' + JSON.stringify(stats));
    }
    for (const p of pages) await p.click('[data-leave]');
  } finally {
    await browser?.close(); await new Promise(r => server.close(r));
    for (const name of names) await rooms.deleteRoom(name).catch(() => {});
  }
});
