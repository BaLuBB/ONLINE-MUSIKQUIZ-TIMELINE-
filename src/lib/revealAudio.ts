// Wiedergabequelle für AUFGEDECKTE Karten. Titel und Interpret sind dann öffentlich,
// deshalb darf jeder Browser die Vorschau selbst über die iTunes Search API auflösen
// (wie die Cover) und den Song bei allen Spielern abspielen.

import { DemoResolver, ItunesResolver } from '@engine/audio.ts';
import type { AudioPlayback, RevealedCard, Song } from '@engine/types.ts';

const itunes = new ItunesResolver();
const demo = new DemoResolver();

const demoOnly = (): boolean => import.meta.env.VITE_LOCAL_AUDIO === 'demo';

export function resolveReveal(card: RevealedCard): Promise<AudioPlayback> {
  const song: Song = {
    id: card.songId,
    title: card.title,
    artist: card.artist,
    releaseYear: card.year,
    genres: [],
    audioProvider: 'itunes',
    audioId: null,
    duration: 30,
    available: true,
  };
  return (demoOnly() ? demo : itunes).resolve(song);
}
