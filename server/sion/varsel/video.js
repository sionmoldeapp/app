// Gruppevideo (opptil 12) og videoanrop mellom to (privat samtale): tokens gis bare til deltakere i den aktuelle Sionchat-samtalen.
const { createHmac } = require('node:crypto');
const { AccessToken, RoomServiceClient, TrackSource } = require('livekit-server-sdk');

function lagVideo({ pool, env = process.env, rooms, Token = AccessToken }) {
  const klar = !!(env.LIVEKIT_URL && env.LIVEKIT_API_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
  const klient = klar ? rooms || new RoomServiceClient(env.LIVEKIT_API_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET) : null;
  const hash = s => createHmac('sha256', env.LIVEKIT_API_SECRET).update(s).digest('hex');
  return async function video(d, email) {
    if (typeof d.threadId !== 'string' || !d.threadId || d.threadId.length > 200) return { ok: false, feil: 'Velg en samtale.' };
    const tr = (await pool.query('select kind, parts from threads where id = $1', [d.threadId])).rows[0];
    if (!tr || !['gruppe', 'dm'].includes(tr.kind) || !(tr.parts || []).some(p => String(p).toLowerCase() === email)) {
      return { ok: false, feil: 'Du har ikke tilgang til denne samtalen.' };
    }
    const maks = tr.kind === 'dm' ? 2 : 12;
    if (!klar) return { ok: false, feil: 'Video er ikke aktivert på serveren ennå.' };
    const room = 'sion-' + hash('room:' + d.threadId).slice(0, 40);
    const identity = hash('person:' + d.threadId + ':' + email);
    try {
      await klient.createRoom({ name: room, maxParticipants: maks, emptyTimeout: 120, departureTimeout: 30 });
      const deltakere = await klient.listParticipants(room);
      if (deltakere.length >= maks && !deltakere.some(p => p.identity === identity)) {
        return { ok: false, feil: 'Samtalen er full (' + maks + ' deltakere). Prøv igjen når noen har gått ut.' };
      }
      const med = (await pool.query('select name from members where lower(email) = $1', [email])).rows[0];
      const token = new Token(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
        identity, name: String(med?.name || 'Deltaker').slice(0, 80), ttl: 120,
      });
      token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true,
        canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE], canPublishData: false, canUpdateOwnMetadata: false });
      return { ok: true, url: env.LIVEKIT_URL, token: await token.toJwt(), max: maks };
    } catch {
      // Ikke send SDK-feil eller serverdetaljer videre til klienten.
      return { ok: false, feil: 'Videotjenesten svarer ikke. Prøv igjen senere.' };
    }
  };
}
module.exports = { lagVideo };
