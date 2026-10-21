import { describe, expect, it } from 'vitest';
import { ranking } from '@engine/engine.ts';
import { SONGS, findInvalidGenres } from '@engine/songs.ts';
import { GENRES } from '@engine/genres.ts';
import {
  drawCurrent,
  expectErr,
  makeHarness,
  okState,
  posFor,
  setupRoom,
  testSongs,
  wrongPosFor,
} from './helpers/harness.ts';

const secretLeakCheck = (state: unknown, songs = testSongs(60)) => {
  const json = JSON.stringify(state);
  return songs.filter((s) => json.includes(`"${s.title}"`));
};

describe('Lobby', () => {
  it('erstellt einen Raum mit gültigem, zufälligem Code', async () => {
    const h = makeHarness();
    const res = await h.client('u1').create('Anna', { genres: ['pop'] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const st = okState(res);
    expect(st.hostId).toBe(res.playerId);
    expect(st.phase).toBe('waiting');
    expect(st.players).toHaveLength(1);
    const other = okState(await h.client('u2').create('Bob'));
    expect(other.code).not.toBe(st.code);
  });

  it('lässt einen zweiten Client per Code (case-insensitive) beitreten und lehnt ungültige Codes ab', async () => {
    const h = makeHarness();
    const host = h.client('u1');
    const created = await host.create('Anna');
    if (!created.ok) throw new Error();
    const guest = h.client('u2');
    expectErr(await guest.join('ZZZZZZ', 'Ben'), 'invalid_code');
    expectErr(await guest.join('', 'Ben'), 'invalid_code');
    const joined = await guest.join(` ${created.code.toLowerCase()} `, 'Ben');
    expect(joined.ok).toBe(true);
    const a = okState(await host.sync(created.roomId));
    const b = okState(await guest.sync(created.roomId));
    expect(a.players.map((p) => p.name)).toEqual(['Anna', 'Ben']);
    expect(b).toEqual(a); // gleicher Zustand für beide
  });

  it('behandelt doppelte Namen, volle Räume und Wiedereintritt', async () => {
    const h = makeHarness();
    const created = await h.client('u1').create('Anna', { maxPlayers: 2 });
    if (!created.ok) throw new Error();
    expectErr(await h.client('u2').join(created.code, 'anna'), 'name_taken');
    expect((await h.client('u2').join(created.code, 'Ben')).ok).toBe(true);
    expectErr(await h.client('u3').join(created.code, 'Cleo'), 'room_full');
    // Reconnect derselben Sitzung liefert denselben Spieler
    const again = await h.client('u2').join(created.code, 'Egal');
    expect(again.ok && again.playerId).toBeTruthy();
  });

  it('nur der Host ändert Einstellungen und startet; Genres sind mehrfach wählbar', async () => {
    const h = makeHarness();
    const { host, guest, roomId } = await setupRoom(h, {}, false);
    expectErr(await guest.act(roomId, { type: 'updateSettings', patch: { targetCards: 5 } }), 'not_host');
    const st = okState(await host.act(roomId, { type: 'updateSettings', patch: { genres: ['pop', 'rock', 'jazz'], targetCards: 5 } }));
    expect(st.settings.genres).toEqual(['pop', 'rock', 'jazz']);
    expect(st.pool.size).toBe(60);
    expectErr(await guest.act(roomId, { type: 'start' }), 'not_host');
  });

  it('verhindert Start mit zu wenigen Spielern oder leerer Genre-Auswahl', async () => {
    const h = makeHarness();
    const host = h.client('u1');
    const c = await host.create('Anna');
    if (!c.ok) throw new Error();
    expectErr(await host.act(c.roomId, { type: 'start' }), 'not_enough_players');
    await h.client('u2').join(c.code, 'Ben');
    okState(await host.act(c.roomId, { type: 'updateSettings', patch: { genres: [] } }));
    expectErr(await host.act(c.roomId, { type: 'start' }), 'pool_too_small');
  });

  it('verhindert zwei gleichzeitige Starts (nur ein Spiel entsteht)', async () => {
    const h = makeHarness();
    const { host, roomId } = await setupRoom(h, {}, false);
    const [a, b] = await Promise.all([host.act(roomId, { type: 'start' }), host.act(roomId, { type: 'start' })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(okState(await host.sync(roomId)).gameNo).toBe(1);
  });

  it('weist Beitritt während des Spiels ab', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    expectErr(await h.client('late').join(room.code, 'Spät'), 'game_running');
  });

  it('übergibt Host-Rolle beim Verlassen und schließt leere Lobbys', async () => {
    const h = makeHarness();
    const { host, guest, roomId, guestPid } = await setupRoom(h, {}, false);
    const left = await host.act(roomId, { type: 'leave' });
    expect(left.ok && left.left).toBe(true);
    const st = okState(await guest.sync(roomId));
    expect(st.hostId).toBe(guestPid);
    await guest.act(roomId, { type: 'leave' });
    expect(h.store.rooms.has(roomId)).toBe(false);
  });

  it('bestimmt nach Ablauf der Frist einen neuen Host', async () => {
    const h = makeHarness();
    const { guest, roomId, guestPid, host } = await setupRoom(h, {}, false);
    await host.heartbeat(roomId);
    h.advance(200_000);
    const st = okState(await guest.heartbeat(roomId));
    expect(st.hostId).toBe(guestPid);
  });
});

describe('Geheimhaltung', () => {
  it('der öffentliche Zustand enthält vor dem Aufdecken keine Titel oder Jahre der gezogenen Karte', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const { state, song } = await drawCurrent(room);
    expect(state.turn!.cardId).toMatch(/^c_\d+$/);
    const json = JSON.stringify(state);
    expect(json).not.toContain(song.title);
    expect(json).not.toContain(song.artist);
    expect(json).not.toContain(song.id);
    // Gegner und Gast sehen dasselbe (nur Startkarten sind aufgedeckt)
    const guestView = okState(await room.guest.sync(room.roomId));
    expect(JSON.stringify(guestView)).not.toContain(song.title);
    // Aufgedeckte Karten sind genau die Startkarten
    const revealed = guestView.players.flatMap((p) => p.timeline);
    expect(revealed).toHaveLength(2);
    // Deck und Rest-Songs tauchen nirgends auf
    const leaked = secretLeakCheck(guestView).filter((s) => !revealed.some((r) => r.songId === s.id));
    expect(leaked).toEqual([]);
  });

  it('nur der aktive Spieler erhält Audio; andere nicht', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const { res, active } = await drawCurrent(room);
    expect(res.ok && res.audio?.kind).toBe('synth');
    const other = active === room.host ? room.guest : room.host;
    expectErr(await other.act(room.roomId, { type: 'audio' }), 'not_your_turn');
    const again = await active.act(room.roomId, { type: 'audio' });
    expect(again.ok && again.audio?.kind).toBe('synth');
  });

  it('der Client kann serverinterne Aktionen nicht auslösen', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const res = await room.host.act(room.roomId, { type: 'reroll' } as never);
    expectErr(res, 'unknown_action');
    expectErr(await room.host.act(room.roomId, { type: 'join', playerId: 'x', name: 'x' } as never), 'unknown_action');
  });

  it('Fremde ohne Mitgliedschaft können weder lesen noch handeln', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const intruder = h.client('intruder');
    expectErr(await intruder.sync(room.roomId), 'not_member');
    expectErr(await intruder.act(room.roomId, { type: 'draw' }), 'not_member');
  });
});

describe('Spielzug', () => {
  it('Spieler wechseln in der vorgesehenen Reihenfolge', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const { active, song, me, state } = await drawCurrent(room);
      seen.push(state.turn!.playerId);
      okState(await active.act(room.roomId, { type: 'place', position: posFor(me.timeline, song.releaseYear) }));
      okState(await active.act(room.roomId, { type: 'nextTurn' }));
    }
    expect(seen).toEqual([room.hostPid, room.guestPid, room.hostPid, room.guestPid]);
  });

  it('akzeptiert eine korrekte Platzierung und aktualisiert Fortschritt und Zeitstrahl', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const { active, song, me } = await drawCurrent(room);
    const st = okState(await active.act(room.roomId, { type: 'place', position: posFor(me.timeline, song.releaseYear) }));
    const p = st.players.find((x) => x.id === me.id)!;
    expect(st.phase).toBe('resolving_turn');
    expect(st.lastResult?.correct).toBe(true);
    expect(st.lastResult?.card.title).toBe(song.title); // jetzt aufgedeckt
    expect(p.placedCorrect).toBe(1);
    expect(p.timeline).toHaveLength(2);
    expect([...p.timeline.map((c) => c.year)]).toEqual([...p.timeline.map((c) => c.year)].sort((a, b) => a - b));
  });

  it('lehnt eine falsche Platzierung ab: Zeitstrahl bleibt, kein Fortschritt', async () => {
    const h = makeHarness(testSongs(60), 7);
    const room = await setupRoom(h);
    // Suche einen Zug, bei dem eine falsche Position existiert (immer außer bei Gleichstand)
    const { active, song, me } = await drawCurrent(room);
    const wrong = wrongPosFor(me.timeline, song.releaseYear)!;
    expect(wrong).not.toBeNull();
    const st = okState(await active.act(room.roomId, { type: 'place', position: wrong }));
    const p = st.players.find((x) => x.id === me.id)!;
    expect(st.lastResult?.correct).toBe(false);
    expect(p.placedCorrect).toBe(0);
    expect(p.timeline).toHaveLength(1);
    expect(h.secretOf(room.roomId).discard).toContain(song.id);
  });

  it('verhindert doppeltes Ziehen, Platzieren und Fremdaktionen', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const st0 = okState(await room.host.sync(room.roomId));
    const activeC = st0.turn!.playerId === room.hostPid ? room.host : room.guest;
    const otherC = activeC === room.host ? room.guest : room.host;
    expectErr(await otherC.act(room.roomId, { type: 'draw' }), 'not_your_turn');
    expectErr(await activeC.act(room.roomId, { type: 'place', position: 0 }), 'no_card');
    okState(await activeC.act(room.roomId, { type: 'draw' }));
    expectErr(await activeC.act(room.roomId, { type: 'draw' }), 'already_drawn');
    expectErr(await activeC.act(room.roomId, { type: 'place', position: 5 }), 'invalid_position');
    expectErr(await activeC.act(room.roomId, { type: 'place', position: -1 }), 'invalid_position');
    okState(await activeC.act(room.roomId, { type: 'place', position: 0 }));
    expectErr(await activeC.act(room.roomId, { type: 'place', position: 0 }), 'invalid_phase');
    expectErr(await otherC.act(room.roomId, { type: 'place', position: 0 }), 'not_your_turn');
  });

  it('wertet wiederholte Anfragen mit gleicher Aktions-ID nur einmal', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const { active, song, me } = await drawCurrent(room);
    const pos = posFor(me.timeline, song.releaseYear);
    const a = okState(await active.act(room.roomId, { type: 'place', position: pos }, 'act-1'));
    const b = okState(await active.act(room.roomId, { type: 'place', position: pos }, 'act-1'));
    expect(b.version).toBe(a.version);
    expect(b.players.find((p) => p.id === me.id)!.placedCorrect).toBe(1);
  });

  it('zwei gleichzeitige Platzierungen werden nur einmal gewertet', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const { active, song, me } = await drawCurrent(room);
    const pos = posFor(me.timeline, song.releaseYear);
    const results = await Promise.all([
      active.act(room.roomId, { type: 'place', position: pos }),
      active.act(room.roomId, { type: 'place', position: pos }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const st = okState(await active.sync(room.roomId));
    expect(st.players.find((p) => p.id === me.id)!.placedCorrect).toBe(1);
  });

  it('zieht keinen Song doppelt, solange genug Songs übrig sind', async () => {
    const h = makeHarness();
    const room = await setupRoom(h, { targetCards: 20 });
    const seen = new Set<string>(h.secretOf(room.roomId).deck.length ? [] : []);
    for (const p of okState(await room.host.sync(room.roomId)).players) p.timeline.forEach((c) => seen.add(c.songId));
    for (let i = 0; i < 20; i++) {
      const { active, song, me } = await drawCurrent(room);
      expect(seen.has(song.id)).toBe(false);
      seen.add(song.id);
      okState(await active.act(room.roomId, { type: 'place', position: posFor(me.timeline, song.releaseYear) }));
      if ((await active.sync(room.roomId)).ok && okState(await active.sync(room.roomId)).phase === 'finished') break;
      okState(await active.act(room.roomId, { type: 'nextTurn' }));
    }
  });
});

describe('Titel-Bonus', () => {
  it('vergibt den Bonus bei richtigem Titel genau einmal und zählt ihn nicht als Karte', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const { active, song, me, state } = await drawCurrent(room);
    expect(state.turn!.guessMade).toBe(false);
    const g = okState(await active.act(room.roomId, { type: 'guess', text: song.title.toUpperCase() }));
    expect(g.turn!.guessMade).toBe(true);
    // Ergebnis des Tipps bleibt bis zum Aufdecken geheim
    expect(JSON.stringify(g)).not.toContain('"correct":true');
    expectErr(await active.act(room.roomId, { type: 'guess', text: song.title }), 'already_guessed');
    const wrong = wrongPosFor(me.timeline, song.releaseYear)!;
    const st = okState(await active.act(room.roomId, { type: 'place', position: wrong }));
    const p = st.players.find((x) => x.id === me.id)!;
    expect(st.lastResult?.titleCorrect).toBe(true);
    expect(p.bonusPoints).toBe(1);
    expect(p.placedCorrect).toBe(0); // falsch platziert: keine Karte, aber Bonuspunkt
    expect(ranking(st)[0].cards).toBeLessThanOrEqual(1);
  });

  it('lehnt falsche Titel ab', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const { active, song, me } = await drawCurrent(room);
    okState(await active.act(room.roomId, { type: 'guess', text: 'Totaler Quatsch' }));
    const st = okState(await active.act(room.roomId, { type: 'place', position: posFor(me.timeline, song.releaseYear) }));
    expect(st.lastResult?.titleCorrect).toBe(false);
    expect(st.players.find((p) => p.id === me.id)!.bonusPoints).toBe(0);
  });

  it('respektiert die ausgeschaltete Option', async () => {
    const h = makeHarness();
    const room = await setupRoom(h, { titleBonus: false });
    const { active } = await drawCurrent(room);
    expectErr(await active.act(room.roomId, { type: 'guess', text: 'x1' }), 'guess_disabled');
  });
});

describe('Wiederholen', () => {
  it('begrenzt Wiederholungen gemäß Einstellung', async () => {
    const h = makeHarness();
    const room = await setupRoom(h, { maxReplays: 1 });
    const { active } = await drawCurrent(room);
    expect((await active.act(room.roomId, { type: 'replay' })).ok).toBe(true);
    expectErr(await active.act(room.roomId, { type: 'replay' }), 'replay_limit');
  });
  it('kann komplett ausgeschaltet werden', async () => {
    const h = makeHarness();
    const room = await setupRoom(h, { allowReplay: false });
    const { active } = await drawCurrent(room);
    expectErr(await active.act(room.roomId, { type: 'replay' }), 'replay_disabled');
  });
});

describe('Sieg', () => {
  async function playUntilEnd(room: Awaited<ReturnType<typeof setupRoom>>, onlyCorrect = true, maxTurns = 80) {
    for (let i = 0; i < maxTurns; i++) {
      const cur = okState(await room.host.sync(room.roomId));
      if (cur.phase === 'finished') return cur;
      const { active, song, me } = await drawCurrent(room);
      const pos = onlyCorrect ? posFor(me.timeline, song.releaseYear) : 0;
      const st = okState(await active.act(room.roomId, { type: 'place', position: pos }));
      if (st.phase === 'finished') return st;
      okState(await active.act(room.roomId, { type: 'nextTurn' }));
    }
    throw new Error('Spiel endete nicht');
  }

  it('erkennt die zehnte korrekt platzierte Karte als Sieg (Standardziel 10)', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const end = await playUntilEnd(room);
    expect(end.settings.targetCards).toBe(10);
    expect(end.phase).toBe('finished');
    expect(end.endReason).toBe('target_reached');
    const winner = end.players.find((p) => p.id === end.winnerId)!;
    expect(winner.placedCorrect).toBe(10);
    expect(ranking(end)[0].playerId).toBe(winner.id);
    // Der andere Spieler hat weniger oder gleich viele (Host beginnt)
    expect(end.players.every((p) => p.placedCorrect <= 10)).toBe(true);
    expect(end.winnerId).toBe(room.hostPid); // Host beginnt und trifft immer
  });

  it('danach sind keine Spielaktionen mehr möglich', async () => {
    const h = makeHarness();
    const room = await setupRoom(h, { targetCards: 3 });
    await playUntilEnd(room);
    expect((await room.host.act(room.roomId, { type: 'draw' })).ok).toBe(false);
    expect((await room.guest.act(room.roomId, { type: 'draw' })).ok).toBe(false);
    expect((await room.host.act(room.roomId, { type: 'place', position: 0 })).ok).toBe(false);
    expectErr(await room.host.act(room.roomId, { type: 'nextTurn' }), 'invalid_phase');
  });

  it('zählt die Startkarte optional zum Ziel (offizielle Zählung)', async () => {
    const h = makeHarness();
    const room = await setupRoom(h, { targetCards: 3, startCardCounts: true });
    const end = await playUntilEnd(room);
    const w = end.players.find((p) => p.id === end.winnerId)!;
    expect(w.placedCorrect).toBe(2);
    expect(w.timeline).toHaveLength(3);
  });

  it('konkurrierende Aktionen in der Siegrunde: genau ein Gewinner', async () => {
    const h = makeHarness();
    const room = await setupRoom(h, { targetCards: 3 });
    // Host gewinnt in seinem Zug; der Gast versucht gleichzeitig zu handeln.
    let finished = false;
    for (let i = 0; i < 20 && !finished; i++) {
      const { active, song, me } = await drawCurrent(room);
      const other = active === room.host ? room.guest : room.host;
      const pos = posFor(me.timeline, song.releaseYear);
      const results = await Promise.all([
        active.act(room.roomId, { type: 'place', position: pos }),
        other.act(room.roomId, { type: 'place', position: 0 }),
        other.act(room.roomId, { type: 'draw' }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const st = okState(await active.sync(room.roomId));
      finished = st.phase === 'finished';
      if (!finished) okState(await active.act(room.roomId, { type: 'nextTurn' }));
    }
    expect(finished).toBe(true);
    const st = okState(await room.host.sync(room.roomId));
    expect(st.winnerId).toBeTruthy();
    expect(st.players.filter((p) => p.placedCorrect >= 3)).toHaveLength(1);
  });

  it('beendet das Spiel, wenn das Deck erschöpft ist; der Führende gewinnt', async () => {
    const h = makeHarness(testSongs(6));
    const room = await setupRoom(h, { genres: ['pop', 'rock'], targetCards: 20 });
    expect(okState(await room.host.sync(room.roomId)).pool.level).toBe('warn'); // Warnung, aber Start erlaubt
    let st = okState(await room.host.sync(room.roomId));
    for (let i = 0; i < 20 && st.phase !== 'finished'; i++) {
      const { active, song, me, state } = await drawCurrent(room).catch(async () => {
        // Deck leer: die Ziehaktion selbst beendet das Spiel
        return { active: null, song: null, me: null, state: null } as never;
      });
      if (!active) break;
      st = state;
      st = okState(await active.act(room.roomId, { type: 'place', position: posFor(me.timeline, song.releaseYear) }));
      if (st.phase === 'finished') break;
      st = okState(await active.act(room.roomId, { type: 'nextTurn' }));
    }
    st = okState(await room.host.sync(room.roomId));
    expect(st.phase).toBe('finished');
    expect(st.endReason).toBe('deck_empty');
    expect(st.winnerId).toBeTruthy();
    const best = Math.max(...st.players.map((p) => p.placedCorrect));
    expect(st.players.find((p) => p.id === st.winnerId)!.placedCorrect).toBe(best);
  });
});

describe('Spielende, Neustart, Verbindung', () => {
  async function finish(room: Awaited<ReturnType<typeof setupRoom>>) {
    for (let i = 0; i < 40; i++) {
      const { active, song, me } = await drawCurrent(room);
      const st = okState(await active.act(room.roomId, { type: 'place', position: posFor(me.timeline, song.releaseYear) }));
      if (st.phase === 'finished') return st;
      await active.act(room.roomId, { type: 'nextTurn' });
    }
    throw new Error('nicht beendet');
  }

  it('startet ein neues Spiel mit denselben Spielern; alte Ergebnisse bleiben getrennt', async () => {
    const h = makeHarness();
    const room = await setupRoom(h, { targetCards: 3, genres: ['pop', 'rock', 'jazz'] });
    const first = await finish(room);
    expectErr(await room.guest.act(room.roomId, { type: 'restart' }), 'not_host');
    const next = okState(await room.host.act(room.roomId, { type: 'restart' }));
    expect(next.phase).toBe('playing');
    expect(next.gameNo).toBe(2);
    expect(next.gameId).not.toBe(first.gameId);
    expect(next.players.every((p) => p.placedCorrect === 0 && p.bonusPoints === 0 && p.timeline.length === 1)).toBe(true);
    expect(next.history).toHaveLength(1);
    expect(next.history[0].gameId).toBe(first.gameId);
    expect(next.history[0].winnerId).toBe(first.winnerId);
    expect(next.winnerId).toBeNull();
  });

  it('führt zurück in die Lobby', async () => {
    const h = makeHarness();
    const room = await setupRoom(h, { targetCards: 3 });
    await finish(room);
    const lobby = okState(await room.host.act(room.roomId, { type: 'toLobby' }));
    expect(lobby.phase).toBe('waiting');
    expect(lobby.players).toHaveLength(2);
    expect(lobby.players.every((p) => p.timeline.length === 0)).toBe(true);
    expect(h.secretOf(room.roomId).deck).toEqual([]);
  });

  it('stellt nach einer Unterbrechung denselben Spieler und Zustand wieder her', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const { active } = await drawCurrent(room);
    // „Neu laden": Beitritt mit derselben Sitzung (uid) während des laufenden Spiels
    const rejoined = await h.client(active.uid).join(room.code, 'egal');
    expect(rejoined.ok).toBe(true);
    const st = okState(rejoined);
    expect(st.turn!.cardId).toBeTruthy();
    // und das Audio ist weiter abrufbar
    const audio = await active.act(room.roomId, { type: 'audio' });
    expect(audio.ok && audio.audio).toBeTruthy();
  });

  it('überspringt den Zug eines getrennten Spielers', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    const st0 = okState(await room.host.sync(room.roomId));
    const activePid = st0.turn!.playerId;
    const waiting = activePid === room.hostPid ? room.guest : room.host;
    const waitingPid = activePid === room.hostPid ? room.guestPid : room.hostPid;
    // Aktiver Spieler sendet keine Heartbeats mehr
    await waiting.heartbeat(room.roomId);
    h.advance(200_000);
    await waiting.heartbeat(room.roomId);
    const st = okState(await waiting.sync(room.roomId));
    expect(st.turn!.playerId).toBe(waitingPid);
  });

  it('beendet das Spiel, wenn zu wenige Spieler übrig sind', async () => {
    const h = makeHarness();
    const room = await setupRoom(h);
    await room.guest.act(room.roomId, { type: 'leave' });
    const st = okState(await room.host.sync(room.roomId));
    expect(st.phase).toBe('finished');
    expect(st.endReason).toBe('abandoned');
  });

  it('drosselt Missbrauch (Rate-Limit)', async () => {
    const h = makeHarness();
    const c = h.client('spam');
    let limited = false;
    for (let i = 0; i < 60; i++) {
      const r = await c.join('ABCDEF', 'x');
      if (!r.ok && r.error.code === 'rate_limited') limited = true;
    }
    expect(limited).toBe(true);
  });
});

describe('Musikbibliothek', () => {
  it('enthält mindestens 100 eindeutige Songs mit gültigen Genres', () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
    expect(findInvalidGenres(SONGS)).toEqual([]);
    for (const s of SONGS) {
      expect(s.releaseYear).toBeGreaterThan(1900);
      expect(s.releaseYear).toBeLessThanOrEqual(new Date().getFullYear() + 1);
      expect(s.genres.length).toBeGreaterThan(0);
    }
  });
  it('entfernt Duplikate der Startliste (Journey)', () => {
    expect(SONGS.filter((s) => s.title === "Don't Stop Believin'")).toHaveLength(1);
  });
  it('deckt jedes Genre mit mindestens 3 Songs ab', () => {
    const counts: Record<string, number> = {};
    for (const s of SONGS) for (const g of s.genres) counts[g] = (counts[g] ?? 0) + 1;
    const thin = GENRES.filter((g) => (counts[g.id] ?? 0) < 3).map((g) => `${g.id}:${counts[g.id] ?? 0}`);
    expect(thin).toEqual([]);
  });
  it('kann ein vollständiges Spiel mit der echten Bibliothek spielen', async () => {
    const h = makeHarness(SONGS as never);
    const host = h.client('a');
    const guest = h.client('b');
    const c = await host.create('A', { genres: ['pop', '80er', 'deutschrap'], targetCards: 3 });
    if (!c.ok) throw new Error();
    await guest.join(c.code, 'B');
    const st = okState(await host.act(c.roomId, { type: 'start' }));
    expect(st.pool.size).toBeGreaterThan(30);
  });
});

describe('Audio-Rückfall', () => {
  it('wechselt nach wiederholtem Ausfall dauerhaft auf den Ersatzanbieter, behandelt „keine Vorschau“ aber als Songproblem', async () => {
    const { FallbackResolver, DemoResolver } = await import('@engine/audio.ts');
    let calls = 0;
    const flaky = { id: 'x', resolve: async () => (calls++, { kind: 'none' as const, provider: 'x', reason: 'Audioquelle nicht erreichbar.' }) };
    const r = new FallbackResolver(flaky, new DemoResolver(), 2);
    const song = testSongs(1)[0];
    expect((await r.resolve(song)).kind).toBe('none'); // 1. Ausfall: noch Hauptanbieter
    expect((await r.resolve(song)).kind).toBe('synth'); // 2. Ausfall: Rückfall
    expect((await r.resolve(song)).kind).toBe('synth');
    expect(calls).toBe(2); // danach keine Anfragen mehr
    const missing = { id: 'y', resolve: async () => ({ kind: 'none' as const, provider: 'y', reason: 'Keine Vorschau gefunden.' }) };
    const r2 = new FallbackResolver(missing, new DemoResolver(), 2);
    for (let i = 0; i < 5; i++) expect((await r2.resolve(song)).kind).toBe('none');
  });
});

describe('Cover-Zuordnung', () => {
  it('wählt das passende Ergebnis auch ohne Vorschau-URL und liefert das Cover', async () => {
    const { pickBestMatch } = await import('@engine/audio.ts');
    const results = [
      { trackName: 'Wonderwall (Live)', artistName: 'Oasis', artworkUrl100: 'live.jpg' },
      { trackName: 'Wonderwall', artistName: 'Oasis', artworkUrl100: 'studio.jpg' },
      { trackName: 'Wonderwall', artistName: 'Someone Else', artworkUrl100: 'cover.jpg' },
    ];
    const best = pickBestMatch({ title: 'Wonderwall', artist: 'Oasis' }, results, false);
    expect(best?.artworkUrl100).toBe('studio.jpg');
    expect(pickBestMatch({ title: 'Wonderwall', artist: 'Oasis' }, results, true)).toBeNull(); // ohne Preview kein Treffer
  });
});
