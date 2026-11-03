const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TokenVerifier } = require('livekit-server-sdk');
const { lagVideo } = require('./video');
const env = { LIVEKIT_URL: 'wss://video.example.test', LIVEKIT_API_URL: 'http://video:7880', LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 'test-secret-only-not-production-1234567890' };
function oppsett(tr = { kind: 'gruppe', parts: ['test@example.test'] }, config = env) {
  const kall = [], sql = [];
  return { kall, sql, video: lagVideo({ env: config, pool: { query: async (q, args) => {
    sql.push([q, args]); return { rows: q.includes('from threads') ? (tr ? [tr] : []) : [{ name: 'Testperson' }] };
  } }, rooms: { createRoom: async o => { kall.push(o); }, listParticipants: async () => [] } }) };
}
test('Kun deltakere får adgang; ukjent samtale, fremmed og andre samtaletyper avvises', async () => {
  for (const tr of [null, { kind: 'annet', parts: ['test@example.test'] }, { kind: 'dm', parts: ['annen@example.test'] }, { kind: 'gruppe', parts: ['annen@example.test'] }]) {
    const s = oppsett(tr), r = await s.video({ threadId: 'gruppe' }, 'test@example.test');
    assert.equal(r.ok, false); assert.equal(s.kall.length, 0); assert.equal(r.token, undefined);
  }
});
test('Ugyldige samtale-ID-er sendes ikke til databasen', async () => {
  const s = oppsett(); for (const threadId of ['', null, {}, 'x'.repeat(201)]) assert.equal((await s.video({ threadId }, 'test@example.test')).ok, false);
  assert.equal(s.sql.length, 0);
});
test('Ikke konfigurert tjeneste gir tydelig svar uten rom eller token', async () => {
  const s = oppsett(undefined, {}), r = await s.video({ threadId: 'gruppe' }, 'test@example.test');
  assert.equal(r.ok, false); assert.match(r.feil, /ikke aktivert/); assert.equal(s.kall.length, 0);
});
test('Signert adgang gjelder bare ett rom, varer 120 sekunder og gir ikke administrasjon', async () => {
  const s = oppsett(), r = await s.video({ threadId: 'gruppe' }, 'test@example.test');
  assert.equal(r.ok, true); assert.equal(r.max, 12); assert.equal(r.url, env.LIVEKIT_URL);
  assert.equal(s.kall[0].maxParticipants, 12); assert.equal(s.kall[0].emptyTimeout, 120);
  const claims = await new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET).verify(r.token);
  assert.equal(claims.exp - claims.nbf, 120); assert.equal(claims.name, 'Testperson');
  assert.equal(claims.video.room, s.kall[0].name); assert.equal(claims.video.roomJoin, true);
  assert.deepEqual(claims.video.canPublishSources, ['camera', 'microphone']);
  assert.equal(claims.video.canPublishData, false); assert.equal(claims.video.canUpdateOwnMetadata, false);
  for (const p of ['roomAdmin', 'roomCreate', 'roomList', 'roomRecord', 'recorder']) assert.ok(!claims.video[p]);
  assert.ok(!claims.sub.includes('@')); assert.ok(!s.kall[0].name.includes('gruppe'));
  const r2 = await s.video({ threadId: 'annen-gruppe' }, 'test@example.test');
  const c2 = await new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET).verify(r2.token);
  assert.notEqual(claims.sub, c2.sub); assert.notEqual(claims.video.room, c2.video.room);
});
test('Adgang sjekkes igjen etter at noen forlater gruppen', async () => {
  const tr = { kind: 'gruppe', parts: ['test@example.test'] }, s = oppsett(tr);
  assert.equal((await s.video({ threadId: 'gruppe' }, 'test@example.test')).ok, true);
  tr.parts = []; assert.equal((await s.video({ threadId: 'gruppe' }, 'test@example.test')).ok, false);
});
test('Feil fra videotjenesten lekker ikke nøkler eller detaljer', async () => {
  const video = lagVideo({ env, pool: { query: async () => ({ rows: [{ kind: 'gruppe', parts: ['test@example.test'] }] }) },
    rooms: { createRoom: async () => { throw new Error(env.LIVEKIT_API_SECRET); } } });
  const r = await video({ threadId: 'gruppe' }, 'test@example.test'); assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes(env.LIVEKIT_API_SECRET));
});
test('Full samtale gir forklaring før kameraet åpnes', async () => {
  const video = lagVideo({ env, pool: { query: async () => ({ rows: [{ kind: 'gruppe', parts: ['test@example.test'] }] }) },
    rooms: { createRoom: async () => {}, listParticipants: async () => Array.from({ length: 12 }, (_, i) => ({ identity: 'opptatt-' + i })) } });
  const r = await video({ threadId: 'gruppe' }, 'test@example.test'); assert.equal(r.ok, false);
  assert.match(r.feil, /full \(12 deltakere\)/); assert.equal(r.token, undefined);
});
test('Videoanrop i privat samtale: rom for to, og en tredje kommer ikke inn', async () => {
  const s = oppsett({ kind: 'dm', parts: ['test@example.test', 'annen@example.test'] }), r = await s.video({ threadId: 'dm1' }, 'test@example.test');
  assert.equal(r.ok, true); assert.equal(r.max, 2); assert.equal(s.kall[0].maxParticipants, 2);
  const full = lagVideo({ env, pool: { query: async () => ({ rows: [{ kind: 'dm', parts: ['test@example.test'] }] }) },
    rooms: { createRoom: async () => {}, listParticipants: async () => [{ identity: 'a' }, { identity: 'b' }] } });
  const r2 = await full({ threadId: 'dm1' }, 'test@example.test'); assert.equal(r2.ok, false); assert.match(r2.feil, /full \(2 deltakere\)/); assert.equal(r2.token, undefined);
});
