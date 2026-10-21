import { describe, expect, it } from 'vitest';
import { makeHarness, okState, posFor, testSongs, type Client, type Harness } from './helpers/harness.ts';

async function lobby3(h: Harness, settings: Record<string, unknown> = {}) {
  const [a, b, c] = ['ua', 'ub', 'uc'].map((u) => h.client(u));
  const created = await a.create('Anna', { genres: ['pop', 'rock'], ...settings });
  if (!created.ok) throw new Error(created.error.message);
  const jb = await b.join(created.code, 'Ben');
  const jc = await c.join(created.code, 'Cleo');
  if (!jb.ok || !jc.ok) throw new Error('join');
  return { a, b, c, roomId: created.roomId, pid: { a: created.playerId, b: jb.playerId, c: jc.playerId } };
}

const byPid = (r: Awaited<ReturnType<typeof lobby3>>) => ({ [r.pid.a]: r.a, [r.pid.b]: r.b, [r.pid.c]: r.c }) as Record<string, Client>;

async function playTurn(h: Harness, r: Awaited<ReturnType<typeof lobby3>>, who: Client, correct = true) {
  const draw = okState(await who.act(r.roomId, { type: 'draw' }));
  const cur = h.secretOf(r.roomId).current!;
  const song = testSongs(60).find((s) => s.id === cur.songId)!;
  const me = draw.players.find((p) => p.id === draw.turn!.playerId)!;
  const pos = correct ? posFor(me.timeline, song.releaseYear) : 0;
  return okState(await who.act(r.roomId, { type: 'place', position: pos }));
}

describe('3 Spieler: Verlassen und Zugfolge', () => {
  it('aktiver Spieler verlässt während des Zugs → nächster Spieler ist dran, Karte wandert in die Ablage', async () => {
    const h = makeHarness();
    const r = await lobby3(h);
    okState(await r.a.act(r.roomId, { type: 'start' }));
    // A zieht und geht
    okState(await r.a.act(r.roomId, { type: 'draw' }));
    const songId = h.secretOf(r.roomId).current!.songId;
    await r.a.act(r.roomId, { type: 'leave' });
    const st = okState(await r.b.sync(r.roomId));
    expect(st.phase).toBe('playing');
    expect(st.turn!.playerId).toBe(r.pid.b);
    expect(st.turn!.cardId).toBeNull();
    expect(st.hostId).toBe(r.pid.b);
    expect(h.secretOf(r.roomId).current).toBeNull();
    expect(h.secretOf(r.roomId).discard).toContain(songId);
    // Reihenfolge läuft weiter: B → C → B
    const s1 = await playTurn(h, r, r.b);
    expect(s1.phase).toBe('resolving_turn');
    okState(await r.b.act(r.roomId, { type: 'nextTurn' }));
    expect(okState(await r.c.sync(r.roomId)).turn!.playerId).toBe(r.pid.c);
    await playTurn(h, r, r.c);
    okState(await r.c.act(r.roomId, { type: 'nextTurn' }));
    expect(okState(await r.c.sync(r.roomId)).turn!.playerId).toBe(r.pid.b);
  });

  it('Spieler vor dem aktiven verlässt → aktiver bleibt aktiv, Reihenfolge stimmt', async () => {
    const h = makeHarness();
    const r = await lobby3(h);
    okState(await r.a.act(r.roomId, { type: 'start' }));
    await playTurn(h, r, r.a);
    okState(await r.a.act(r.roomId, { type: 'nextTurn' })); // B am Zug
    await r.a.act(r.roomId, { type: 'leave' });
    const st = okState(await r.b.sync(r.roomId));
    expect(st.turn!.playerId).toBe(r.pid.b);
    expect(st.turnOrder).toEqual([r.pid.b, r.pid.c]);
    await playTurn(h, r, r.b);
    okState(await r.b.act(r.roomId, { type: 'nextTurn' }));
    expect(okState(await r.b.sync(r.roomId)).turn!.playerId).toBe(r.pid.c);
  });

  it('aktiver Spieler verlässt während der Ergebnisanzeige → jeder darf weiterschalten', async () => {
    const h = makeHarness();
    const r = await lobby3(h);
    okState(await r.a.act(r.roomId, { type: 'start' }));
    await playTurn(h, r, r.a);
    await r.a.act(r.roomId, { type: 'leave' });
    let st = okState(await r.c.sync(r.roomId));
    expect(st.phase).toBe('resolving_turn');
    st = okState(await r.c.act(r.roomId, { type: 'nextTurn' }));
    expect(st.phase).toBe('playing');
    expect(st.turn!.playerId).toBe(r.pid.b); // Nachfolger von A
  });

  it('letzter Spieler in der Reihenfolge verlässt → Runde läuft korrekt weiter', async () => {
    const h = makeHarness();
    const r = await lobby3(h);
    okState(await r.a.act(r.roomId, { type: 'start' }));
    for (const who of [r.a, r.b]) {
      await playTurn(h, r, who);
      okState(await who.act(r.roomId, { type: 'nextTurn' }));
    }
    // C am Zug und geht
    await r.c.act(r.roomId, { type: 'leave' });
    const st = okState(await r.a.sync(r.roomId));
    expect(st.turn!.playerId).toBe(r.pid.a);
    expect(st.round).toBe(2);
  });

  it('Host überspringt den Zug; Nicht-Host darf das nicht', async () => {
    const h = makeHarness();
    const r = await lobby3(h);
    okState(await r.a.act(r.roomId, { type: 'start' }));
    const bad = await r.b.act(r.roomId, { type: 'skipTurn' });
    expect(bad.ok).toBe(false);
    okState(await r.a.act(r.roomId, { type: 'draw' }));
    const st = okState(await r.a.act(r.roomId, { type: 'skipTurn' }));
    expect(st.turn!.playerId).toBe(r.pid.b);
  });

  it('kurzes Wegschalten der App (60 s ohne Heartbeat) führt nicht zu Host-Wechsel oder Zugverlust', async () => {
    const h = makeHarness();
    const r = await lobby3(h);
    okState(await r.a.act(r.roomId, { type: 'start' }));
    for (const c of [r.a, r.b, r.c]) await c.heartbeat(r.roomId);
    h.advance(60_000);
    // B und C senden weiter Heartbeats, A (Host, am Zug) war kurz in einer anderen App
    await r.b.heartbeat(r.roomId);
    const st = okState(await r.c.heartbeat(r.roomId));
    expect(st.hostId).toBe(r.pid.a);
    expect(st.turn!.playerId).toBe(r.pid.a);
    // erst nach langer Abwesenheit greift die Übergabe
    h.advance(200_000);
    await r.b.heartbeat(r.roomId);
    const later = okState(await r.c.heartbeat(r.roomId));
    expect(later.hostId).not.toBe(r.pid.a);
    expect(later.turn!.playerId).not.toBe(r.pid.a);
  });

  it('Lobby: Host entfernt Spieler; Gekickter kann wieder beitreten', async () => {
    const h = makeHarness();
    const r = await lobby3(h);
    okState(await r.a.act(r.roomId, { type: 'kick', targetId: r.pid.c }));
    expect(okState(await r.a.sync(r.roomId)).players).toHaveLength(2);
    expect((await r.c.sync(r.roomId)).ok).toBe(false);
    const code = okState(await r.a.sync(r.roomId)).code;
    expect((await r.c.join(code, 'Cleo')).ok).toBe(true);
  });

  it('Revanche nach Weggang eines Spielers mit 2 Verbliebenen', async () => {
    const h = makeHarness();
    const r = await lobby3(h, { targetCards: 3 });
    okState(await r.a.act(r.roomId, { type: 'start' }));
    await r.c.act(r.roomId, { type: 'leave' });
    let st = okState(await r.a.sync(r.roomId));
    for (let i = 0; i < 30 && st.phase !== 'finished'; i++) {
      const who = byPid(r)[st.turn!.playerId];
      st = await playTurn(h, r, who);
      if (st.phase !== 'finished') st = okState(await who.act(r.roomId, { type: 'nextTurn' }));
    }
    expect(st.phase).toBe('finished');
    const next = okState(await r.a.act(r.roomId, { type: 'restart' }));
    expect(next.players).toHaveLength(2);
    expect(next.turnOrder).toHaveLength(2);
  });
});
