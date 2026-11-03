// Isolert nettlesertest: ingen ekte kontoer, kameraer, samtaler eller varsler.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./varsel/node_modules/playwright-core');
let browser, server, url;
before(async () => {
  const root = path.resolve(__dirname, '../..');
  server = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><html lang="nb"><title>Videotest</title><body></body></html>'); }
    const tillatt = ['/lib/sion-video.js', '/lib/sion-video.css', '/lib/livekit-client-2.23.0.umd.js'];
    if (!tillatt.includes(req.url)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(fs.readFileSync(path.join(root, req.url)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); url = 'http://127.0.0.1:' + server.address().port;
  const executablePath = process.env.CHROME_BIN || ['C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
  browser = await chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); });
async function side() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); await page.goto(url);
  await page.evaluate(() => {
    window.prove = { captured: 0, stopped: 0, connected: 0, disconnected: 0, access: 0 };
    const events = ['ParticipantConnected', 'ParticipantDisconnected', 'TrackSubscribed', 'TrackUnsubscribed', 'TrackMuted', 'TrackUnmuted', 'LocalTrackPublished', 'LocalTrackUnpublished', 'Reconnecting', 'Reconnected', 'Disconnected', 'AudioPlaybackStatusChanged'];
    class Room {
      constructor() { window.testRoom = this; this.events = {}; this.remoteParticipants = new Map();
        this.localParticipant = { identity: 'test', name: 'Test', trackPublications: new Map(), isMicrophoneEnabled: false, isCameraEnabled: false,
          publishTrack: async t => { this.localParticipant.trackPublications.set(t.kind, { track: t, trackSid: t.kind }); this.localParticipant[t.kind === 'audio' ? 'isMicrophoneEnabled' : 'isCameraEnabled'] = true; },
          setMicrophoneEnabled: async b => { this.localParticipant.isMicrophoneEnabled = b; }, setCameraEnabled: async b => { this.localParticipant.isCameraEnabled = b; } };
      }
      on(e, f) { (this.events[e] ||= []).push(f); return this; }
      emit(e) { for (const f of this.events[e] || []) f(); }
      removeAllListeners() { this.events = {}; }
      async connect() { prove.connected++; if (window.connectWait) await new Promise(r => window.continueConnect = r); if (window.full) throw { code: 4 }; }
      disconnect() { prove.disconnected++; }
      async startAudio() {}
    }
    window.LivekitClient = { Room, RoomEvent: Object.fromEntries(events.map(x => [x, x])), Track: { Kind: { Video: 'video', Audio: 'audio' } }, VideoPresets: { h360: { resolution: { width: 640, height: 360 } } },
      createLocalTracks: async o => { prove.captured++;
        if (window.captureWait) await new Promise(r => window.continueCapture = r);
        if (window.deny) throw { name: 'NotAllowedError' };
        return ['audio', 'video'].filter(k => o[k]).map(kind => ({ kind, stop() { prove.stopped++; }, attach(el) { return el || document.createElement(kind); } }));
      } };
    window.getAccess = async () => { prove.access++; if (window.accessError) throw new Error('Gruppevideo er ikke aktivert på serveren ennå.');
      if (window.accessFull) throw new Error('Samtalen er full (12 deltakere).'); return { url: 'wss://example.test', token: 'test', max: 12 }; };
  });
  return page;
}
async function apne(p) { await p.evaluate(async () => { const m = await import('/lib/sion-video.js'); await m.open({ title: '<img src=x onerror=alert(1)>', getAccess }); }); }
test('Forhåndsvisning publiserer ikke, og avbryt slår av alle spor', async () => {
  const p = await side(); try { await apne(p);
    assert.equal(await p.locator('[data-title] img').count(), 0);
    await p.click('[data-previewbtn]'); assert.match(await p.locator('[data-status]').innerText(), /ikke med/);
    assert.equal((await p.evaluate(() => prove)).connected, 0);
    await p.click('[data-close]'); const r = await p.evaluate(() => prove); assert.equal(r.captured, 1); assert.equal(r.stopped, 2);
    assert.equal(await p.locator('dialog').count(), 0);
  } finally { await p.close(); }
});
test('Avbrudd mens kamera åpnes stopper også forsinkede spor', async () => {
  const p = await side(); try { await apne(p); await p.evaluate(() => window.captureWait = true);
    await p.click('[data-previewbtn]'); await p.waitForFunction(() => window.continueCapture);
    await p.click('[data-close]'); await p.evaluate(() => continueCapture()); await p.waitForFunction(() => prove.stopped === 2);
    assert.equal((await p.evaluate(() => prove)).connected, 0);
  } finally { await p.close(); }
});
test('Lyttemodus krever ikke kamera eller mikrofontilgang; utlogging kan lukke samtalen', async () => {
  const p = await side(); try { await apne(p); await p.uncheck('[data-camera]'); await p.uncheck('[data-mic]');
    await p.click('[data-join]'); await p.waitForSelector('[data-controls]:not([hidden])');
    const r = await p.evaluate(() => prove); assert.equal(r.captured, 0); assert.equal(r.connected, 1); assert.equal(r.access, 2);
    await p.evaluate(() => SionVideo.close()); assert.equal(await p.locator('dialog').count(), 0);
    assert.ok((await p.evaluate(() => prove)).disconnected > 0);
  } finally { await p.close(); }
});
test('Nektet kameratilgang kan følges av lyttemodus', async () => {
  const p = await side(); try { await apne(p); await p.evaluate(() => window.deny = true); await p.click('[data-join]');
    await p.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('ikke tillatt'));
    await p.uncheck('[data-camera]'); await p.uncheck('[data-mic]'); await p.click('[data-join]');
    await p.waitForSelector('[data-controls]:not([hidden])'); await p.click('[data-leave]');
  } finally { await p.close(); }
});
test('Fullt rom stopper spor og tillater nytt forsøk', async () => {
  const p = await side(); try { await apne(p); await p.click('[data-previewbtn]');
    await p.evaluate(() => { window.accessFull = true; });
    await p.click('[data-join]');
    await p.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('12 deltakere'));
    assert.equal((await p.evaluate(() => prove)).stopped, 2); assert.equal(await p.locator('[data-join]').isEnabled(), true);
  } finally { await p.close(); }
});
test('Ukonfigurert server ber ikke om kamera og viser forklaring', async () => {
  const p = await side(); try { await p.evaluate(() => window.accessError = true); await apne(p);
    assert.match(await p.locator('[data-status]').innerText(), /ikke aktivert/);
    assert.equal((await p.evaluate(() => prove)).captured, 0); assert.equal(await p.locator('[data-join]').isEnabled(), false);
  } finally { await p.close(); }
});
test('Avbrudd mens tilkoblingen pågår forlater rommet og frigir kamera', async () => {
  const p = await side(); try { await apne(p); await p.evaluate(() => window.connectWait = true); await p.click('[data-join]');
    await p.waitForFunction(() => window.continueConnect); await p.click('[data-close]'); await p.evaluate(() => continueConnect());
    await p.waitForFunction(() => prove.disconnected >= 2); assert.equal((await p.evaluate(() => prove)).stopped, 2);
  } finally { await p.close(); }
});
