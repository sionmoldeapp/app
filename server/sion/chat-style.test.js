const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm');
const { chromium } = require('./varsel/node_modules/playwright-core');
const root = path.resolve(__dirname, '../..'), html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const backgrounds = vm.runInNewContext(html.match(/const CHAT_BG=(\[.*?\]);/)[1]), colors = vm.runInNewContext(html.match(/const CHAT_FARGER=(\[.*?\]);/)[1]);
const start = html.indexOf('async function chatUtseendeMeny(){'), code = html.slice(start, html.indexOf('/* Stjernemerke:', start));
let server, browser, url;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><style>' + [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n') + '</style><div id="chat"><div id="cMsg" class="cmsg"></div></div>'); }
    if (!/^\/(lib\/chat-style\.(js|css)|bilder\/chat-(?:neon\d+\.jpg|lys\d+\.png|(?:jesus|kors)-[a-z-]+\.png))$/.test(req.url)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : req.url.endsWith('.js') ? 'text/javascript' : req.url.endsWith('.png') ? 'image/png' : 'image/jpeg'); res.end(fs.readFileSync(path.join(root, req.url)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); await new Promise(r => server.close(r)); });
async function open() {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); await p.goto(url);
  await p.evaluate(({ backgrounds, colors, code }) => {
    window.t = { id:'test', bakgrunn:'eget', bgv:1 }; window.state = { chat: { id:t.id } }; window.calls = [];
    window.chatTraad = () => t; window.CHAT_BG = backgrounds; window.CHAT_FARGER = colors;
    window.cbgUrl = async () => ''; window.cbgFraFil = async () => 'data:image/png;base64,AAA='; window.chatTile = async () => ''; window.isDark = () => true;
    window.chatFargeBruk = () => {}; window.push = () => {};
    window.FB = { hentBg: async () => ({ data:'old-image', v:1 }), setBg: async (_, data) => calls.push(['image',data]),
      delBg: async () => calls.push(['delete']), setUtseende: async (_, field, value) => { calls.push(['save',field,value]); if (window.failSave) throw Error('save failed'); } };
    (0,eval)(code);
  }, { backgrounds, colors, code });
  await p.evaluate(() => chatUtseendeMeny()); await p.waitForSelector('dialog.cstyle[open]'); return p;
}
test('Forhåndsvisning og avbryt skriver ingenting', async () => {
  const p = await open(); try { await p.click('[data-category="new"]'); await p.click('[data-bg="neon22"]');
    assert.equal(await p.locator('.cspreview').getAttribute('data-bg'), 'neon22'); assert.equal(await p.locator('.cspreview').isVisible(), true); assert.deepEqual(await p.evaluate(() => calls), []);
    await p.click('[data-close]'); assert.deepEqual(await p.evaluate(() => calls), []); assert.equal(await p.evaluate(() => t.bakgrunn), 'eget');
  } finally { await p.close(); }
});
test('Tidligere eget bilde slettes først etter bekreftet lagring', async () => {
  const p = await open(); try { await p.click('[data-category="new"]'); await p.click('[data-bg="neon22"]'); await p.click('[data-apply]'); await p.waitForSelector('dialog.cstyle', { state:'detached' });
    assert.deepEqual(await p.evaluate(() => calls), [['save','bakgrunn','neon22'],['delete']]);
  } finally { await p.close(); }
});
test('Lagringsfeil beholder eget bilde og lar brukeren prøve igjen', async () => {
  const p = await open(); try { await p.evaluate(() => window.failSave = true); await p.click('[data-category="new"]'); await p.click('[data-bg="neon22"]'); await p.click('[data-apply]');
    await p.waitForFunction(() => document.querySelector('[data-apply]').disabled === false);
    assert.deepEqual(await p.evaluate(() => calls), [['save','bakgrunn','neon22']]); assert.equal(await p.evaluate(() => t.bakgrunn), 'eget');
    assert.equal(await p.locator('dialog.cstyle').isVisible(), true);
  } finally { await p.close(); }
});
test('Fargetabben lagrer bare fargen, og fanene virker med tastatur', async () => {
  const p = await open(); try { await p.click('[data-category="new"]'); await p.click('[data-bg="neon22"]'); await p.click('#csBgTab'); await p.keyboard.press('ArrowRight');
    assert.equal(await p.locator('#csColorPanel').isVisible(), true); await p.click('[data-color="lilla"]'); await p.click('[data-apply]'); await p.waitForSelector('dialog.cstyle', { state:'detached' });
    assert.deepEqual(await p.evaluate(() => calls), [['save','farge','lilla']]);
  } finally { await p.close(); }
});
test('Eget bilde forhåndsvises før lagring og gjenopprettes ved metadatafeil', async () => {
  const p = await open(); try { await p.locator('[data-file]').setInputFiles({ name:'preview.png', mimeType:'image/png', buffer:Buffer.from('test') });
    await p.waitForFunction(() => !document.querySelector('[data-apply]').disabled); assert.deepEqual(await p.evaluate(() => calls), []);
    await p.evaluate(() => window.failSave = true); await p.click('[data-apply]'); await p.waitForFunction(() => !document.querySelector('[data-apply]').disabled);
    assert.deepEqual(await p.evaluate(() => calls), [['image','data:image/png;base64,AAA='],['save','bakgrunn','eget'],['image','old-image']]);
  } finally { await p.close(); }
});
test('Alle 47 bakgrunner er tilgjengelige og mobilflaten holder knappen synlig', async () => {
  const p = await open(); try { await p.click('[data-category="all"]'); assert.equal(await p.locator('.cstile[data-bg]:visible').count(), 47);
    await p.setViewportSize({ width:320, height:640 }); const r = await p.locator('[data-apply]').boundingBox(); assert.ok(r.y + r.height <= 640);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  } finally { await p.close(); }
});

test('Fem lyse bakgrunner kan forhåndsvises og velges uten å endre mørke valg', async () => {
  for (const id of ['lys18','lys19','lys20','lys21','lys22']) {
    const p = await open(); try {
      await p.click('[data-category="light"]');
      assert.equal(await p.locator('.cstile[data-bg]:visible').count(), 11);
      await p.click('[data-bg="'+id+'"]');
      const image = await p.locator('.cspreview').evaluate(e => getComputedStyle(e).backgroundImage);
      assert.ok(image.includes('chat-'+id+'.png'));
      const response = await p.request.get(image.match(/url\("?(.*?)"?\)/)[1]);
      assert.equal(response.status(),200);
      assert.equal(response.headers()['content-type'],'image/png');
      assert.deepEqual(await p.evaluate(()=>calls),[]);
      await p.locator('.cspreview').evaluate(e => { e.innerHTML='<span class="cdag">I dag</span>'; });
      assert.equal(await p.locator('.cspreview .cdag').evaluate(e=>getComputedStyle(e).color),'rgb(52, 68, 87)');
      await p.click('[data-apply]');
      await p.waitForSelector('dialog.cstyle',{state:'detached'});
      assert.deepEqual(await p.evaluate(()=>calls),[['save','bakgrunn',id],['delete']]);
      assert.ok(backgrounds.some(x=>x[0]==='neon'+id.slice(3)));
    } finally { await p.close(); }
  }
});

test('Jesus og kors har tre motiver hver i lyst og mørkt, med lesbar dato og lagring',async()=>{
  for(const base of ['jesus-skrift','jesus-bolge','jesus-enkel','kors-linje','kors-band','kors-lys']){
    for(const theme of ['mork','lys']){
      const id=base+'-'+theme,p=await open();try{
        await p.setViewportSize({width:320,height:640});
        await p.click('[data-category="'+(base.startsWith('jesus')?'jesus':'cross')+'"]');
        assert.equal(await p.locator('.cstile[data-bg]:visible').count(),6);
        await p.click('[data-bg="'+id+'"]');
        const image=await p.locator('.cspreview').evaluate(e=>getComputedStyle(e).backgroundImage);
        assert.ok(image.includes('chat-'+id+'.png'));
        assert.equal((await p.request.get(image.match(/url\("?(.*?)"?\)/)[1])).status(),200);
        await p.locator('.cspreview').evaluate(e=>{e.innerHTML='<span class="cdag">I dag</span>'});
        assert.equal(await p.locator('.cspreview .cdag').evaluate(e=>getComputedStyle(e).color),theme==='lys'?'rgb(52, 68, 87)':'rgb(255, 255, 255)');
        assert.deepEqual(await p.evaluate(()=>calls),[]);
        await p.click('[data-apply]');await p.waitForSelector('dialog.cstyle',{state:'detached'});
        assert.deepEqual(await p.evaluate(()=>calls),[['save','bakgrunn',id],['delete']]);
      }finally{await p.close()}
    }
  }
});
