// Cover-Suche für AUFGEDECKTE Karten. Titel und Interpret sind zu diesem Zeitpunkt öffentlich,
// daher darf der Browser die Cover-Grafik selbst über die iTunes Search API holen.
// Die Treffer werden zwischengespeichert; ohne Treffer/Netzwerk zeigt die Karte ein Platzhalter-Motiv.

import { pickBestMatch, type ItunesResult } from '@engine/audio.ts';
import { useEffect, useState } from 'react';

const STORE_KEY = 'timeline.covers.v1';
const memory = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
let loaded = false;
let queue: Promise<unknown> = Promise.resolve();

function persisted(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  for (const [k, v] of Object.entries(persisted())) memory.set(k, v);
}

function remember(key: string, url: string): void {
  try {
    const all = persisted();
    all[key] = url;
    const keys = Object.keys(all);
    if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete all[k];
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    /* ignorieren */
  }
}

const coversEnabled = (): boolean => import.meta.env.VITE_LOCAL_AUDIO !== 'demo';

const keyOf = (c: { artist: string; title: string }) => `${c.artist}|${c.title}`;

/** Gibt die Cover-URL zurück (oder null). Anfragen laufen nacheinander, um die API zu schonen. */
export function lookupCover(card: { artist: string; title: string }): Promise<string | null> {
  load();
  const key = keyOf(card);
  if (memory.has(key)) return Promise.resolve(memory.get(key) ?? null);
  if (!coversEnabled()) return Promise.resolve(null);
  const running = inflight.get(key);
  if (running) return running;
  const p = (queue = queue.then(async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const term = `${card.artist.replace(/\s*(feat\.?|ft\.?|featuring)\s.*$/i, '')} ${card.title}`;
      const res = await fetch(
        `https://itunes.apple.com/search?${new URLSearchParams({ term, entity: 'song', media: 'music', limit: '15', country: 'DE' })}`,
        { signal: ctrl.signal },
      );
      clearTimeout(timer);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { results?: ItunesResult[] };
      const best = pickBestMatch(card, data.results ?? [], false);
      const url = best?.artworkUrl100?.replace('100x100bb', '300x300bb') ?? null;
      memory.set(key, url);
      if (url) remember(key, url);
      return url;
    } catch {
      return null; // nicht dauerhaft merken – später erneut versuchen
    } finally {
      inflight.delete(key);
    }
  })) as Promise<string | null>;
  inflight.set(key, p);
  return p;
}

/** Hook: liefert die Cover-URL, sobald sie vorliegt. */
export function useCover(card: { artist: string; title: string } | null): string | null {
  const key = card ? keyOf(card) : '';
  const [url, setUrl] = useState<string | null>(() => {
    if (!card) return null;
    load();
    return memory.get(key) ?? null;
  });
  useEffect(() => {
    if (!card) return;
    let alive = true;
    void lookupCover(card).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}
