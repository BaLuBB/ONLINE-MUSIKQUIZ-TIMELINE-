import { describe, expect, it } from 'vitest';
import { buildPool, evaluatePool, isPlacementCorrect, ranking, reduce, createRoom, defaultSettings, canTransition, applySettingsPatch } from '@engine/engine.ts';
import { seededRng } from '@engine/rng.ts';
import { isTitleCorrect } from '@engine/normalize.ts';
import { testSongs } from './helpers/harness.ts';

describe('Songpool', () => {
  it('bildet die Vereinigungsmenge mehrerer Genres ohne Duplikate', () => {
    const songs = testSongs(20);
    const dup = { ...songs[0], id: 'dup-id' }; // gleicher Interpret+Titel unter anderer ID
    const pool = buildPool([...songs, dup, songs[1]], { genres: ['pop', 'jazz'], yearMin: null, yearMax: null });
    const ids = pool.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('dup-id');
    // pop (gerade) ∪ jazz (durch 5 teilbar) → 10 gerade + ungerade Vielfache von 5 (5,15)
    expect(pool.length).toBe(12);
    expect(pool.every((s) => s.genres.includes('pop') || s.genres.includes('jazz'))).toBe(true);
  });
  it('berücksichtigt Zeitraum und Verfügbarkeit', () => {
    const songs = testSongs(20);
    songs[0].available = false;
    const pool = buildPool(songs, { genres: ['pop', 'rock'], yearMin: 1965, yearMax: 1970 });
    expect(pool.map((s) => s.releaseYear).sort()).toEqual([1965, 1966, 1967, 1968, 1969, 1970]);
  });
  it('warnt bei zu kleiner Bibliothek', () => {
    const s = defaultSettings();
    expect(evaluatePool(3, s, 4).level).toBe('error');
    expect(evaluatePool(20, s, 4).level).toBe('warn');
    expect(evaluatePool(200, s, 4).level).toBe('ok');
  });
});

describe('Platzierung', () => {
  const tl = [{ year: 1980 }, { year: 1990 }, { year: 1990 }, { year: 2000 }];
  it('akzeptiert korrekte Positionen', () => {
    expect(isPlacementCorrect(tl, 0, 1970)).toBe(true);
    expect(isPlacementCorrect(tl, 1, 1985)).toBe(true);
    expect(isPlacementCorrect(tl, 4, 2010)).toBe(true);
  });
  it('lehnt falsche Positionen ab', () => {
    expect(isPlacementCorrect(tl, 0, 1985)).toBe(false);
    expect(isPlacementCorrect(tl, 4, 1985)).toBe(false);
    expect(isPlacementCorrect(tl, 2, 1985)).toBe(false);
  });
  it('behandelt gleiche Jahre als austauschbar', () => {
    expect(isPlacementCorrect(tl, 1, 1990)).toBe(true); // vor gleichem Jahr
    expect(isPlacementCorrect(tl, 2, 1990)).toBe(true); // zwischen gleichen Jahren
    expect(isPlacementCorrect(tl, 3, 1990)).toBe(true); // nach gleichem Jahr
    expect(isPlacementCorrect([{ year: 1990 }], 0, 1990)).toBe(true);
    expect(isPlacementCorrect([{ year: 1990 }], 1, 1990)).toBe(true);
  });
});

describe('Titelprüfung', () => {
  const song = { title: 'Everybody (Backstreet\'s Back)', aliases: ['Backstreets Back'] };
  it('erkennt richtige Titel unabhängig von Groß-/Kleinschreibung und Satzzeichen', () => {
    expect(isTitleCorrect('  EVERYBODY  ', song)).toBe(true);
    expect(isTitleCorrect("backstreet's back", song)).toBe(true);
    expect(isTitleCorrect('Everybody (Backstreet\'s Back)', song)).toBe(true);
  });
  it('lehnt falsche Titel und Teiltreffer ab', () => {
    expect(isTitleCorrect('Bohemian Rhapsody', song)).toBe(false);
    expect(isTitleCorrect('Back', song)).toBe(false);
    expect(isTitleCorrect('', song)).toBe(false);
    expect(isTitleCorrect('a', { title: 'A', aliases: [] })).toBe(false);
    expect(isTitleCorrect('Bohemian', { title: 'Bohemian Rhapsody' })).toBe(false);
  });
  it('toleriert leichte Rechtschreibfehler (Buchstabe falsch, fehlend, zu viel, vertauscht)', () => {
    const rhapsody = { title: 'Bohemian Rhapsody' };
    expect(isTitleCorrect('Bohemian Rhapsodi', rhapsody)).toBe(true);
    expect(isTitleCorrect('Bohemain Rhapsody', rhapsody)).toBe(true); // Buchstabendreher
    expect(isTitleCorrect('Bohemian Rapsody', rhapsody)).toBe(true); // Buchstabe fehlt
    expect(isTitleCorrect('Bohemian Rhapsodyy', rhapsody)).toBe(true); // Buchstabe zu viel
    expect(isTitleCorrect('Zombi', { title: 'Zombie' })).toBe(true);
    expect(isTitleCorrect('smels like teen spirt', { title: 'Smells Like Teen Spirit' })).toBe(true);
    expect(isTitleCorrect('Dancin Queen', { title: 'Dancing Queen' })).toBe(true);
  });
  it('lehnt falsche, fehlende oder zu stark verschriebene Wörter ab', () => {
    const rhapsody = { title: 'Bohemian Rhapsody' };
    expect(isTitleCorrect('Bohemian Rapture', rhapsody)).toBe(false); // anderes Wort
    expect(isTitleCorrect('Bohemian Rhapsodiee', rhapsody)).toBe(false); // zu viele Fehler im Wort
    expect(isTitleCorrect('Romantic Rhapsody', rhapsody)).toBe(false);
    expect(isTitleCorrect('Love Me', { title: 'Live Me' })).toBe(false); // kurze Wörter müssen stimmen
    expect(isTitleCorrect('Rock', { title: 'Rack' })).toBe(false);
    expect(isTitleCorrect('Smells Like Spirit', { title: 'Smells Like Teen Spirit' })).toBe(false); // Wort fehlt
    expect(isTitleCorrect('Take On', { title: 'Take On Me' })).toBe(false);
  });
  it('erlaubt vergessene oder zusätzliche Leerzeichen bei langen Titeln', () => {
    expect(isTitleCorrect('Heya', { title: 'Hey Ya' })).toBe(false); // zu kurz
    expect(isTitleCorrect('Thunder struck', { title: 'Thunderstruck' })).toBe(true);
  });
  it('versteht deutsche Umlaut-Schreibweisen', () => {
    expect(isTitleCorrect('Chore', { title: 'Chöre' })).toBe(true);
    expect(isTitleCorrect('Choere', { title: 'Chöre' })).toBe(true);
    expect(isTitleCorrect('Maenner', { title: 'Männer' })).toBe(true);
  });
});

describe('Phasen', () => {
  it('erlaubt nur definierte Übergänge', () => {
    expect(canTransition('waiting', 'starting')).toBe(true);
    expect(canTransition('waiting', 'playing')).toBe(false);
    expect(canTransition('playing', 'waiting')).toBe(false);
    expect(canTransition('finished', 'starting')).toBe(true);
    expect(canTransition('finished', 'playing')).toBe(false);
  });
});

describe('Einstellungen', () => {
  it('validiert Werte', () => {
    const base = defaultSettings();
    expect(applySettingsPatch(base, { targetCards: 1 }, 1).ok).toBe(false);
    expect(applySettingsPatch(base, { targetCards: 12 }, 1).ok).toBe(true);
    expect(applySettingsPatch(base, { genres: ['gibt-es-nicht'] }, 1).ok).toBe(false);
    expect(applySettingsPatch(base, { maxPlayers: 2 }, 3).ok).toBe(false);
    expect(applySettingsPatch(base, { yearMin: 2000, yearMax: 1990 }, 1).ok).toBe(false);
  });
  it('wendet Schwierigkeits-Presets an', () => {
    const base = defaultSettings();
    const r = applySettingsPatch(base, { difficulty: 'hard' }, 1);
    expect(r.ok && r.settings.maxReplays).toBe(1);
  });
});

describe('Rangliste', () => {
  it('stellt den Gewinner zuerst und nutzt Tie-Breaks', () => {
    const songs = testSongs(10);
    const created = createRoom({ roomId: 'r', code: 'ABC234', hostId: 'a', hostName: 'A', now: 1, songs });
    if (!created.ok) throw new Error('x');
    const st = created.state;
    const join = (id: string, t: number) =>
      reduce(st, created.secret, { type: 'join', playerId: id, name: id.toUpperCase() }, id, { now: t, rng: seededRng(1), songs });
    const j = join('b', 2);
    if (!j.ok) throw new Error('x');
    const s = structuredClone(j.state);
    s.players[0].placedCorrect = 3;
    s.players[1].placedCorrect = 3;
    s.players[1].bonusPoints = 2;
    expect(ranking({ ...s, winnerId: null }).map((r) => r.playerId)).toEqual(['b', 'a']);
    expect(ranking({ ...s, winnerId: 'a' }).map((r) => r.playerId)).toEqual(['a', 'b']);
    s.players[1].bonusPoints = 0; // gleichstand → früherer Beitritt
    expect(ranking({ ...s, winnerId: null }).map((r) => r.playerId)).toEqual(['a', 'b']);
  });
});
