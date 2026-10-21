// Serverseitige Auflösung der Audioquelle. Der Client erfährt nie Titel/Interpret/Jahr –
// er bekommt nur eine abspielbare Quelle für den Spieler, der gerade am Zug ist.
//
// Neue Anbieter: `AudioResolver` implementieren und in `createResolver` registrieren.

import { normalizeText } from './normalize.ts';
import { hashString } from './rng.ts';
import type { AudioPlayback, Song } from './types.ts';

export interface AudioResolver {
  id: string;
  resolve(song: Song): Promise<AudioPlayback>;
}

/** Synthetische Testtöne – klar als Demo gekennzeichnet, kein echter Song. */
export class DemoResolver implements AudioResolver {
  id = 'demo';
  async resolve(song: Song): Promise<AudioPlayback> {
    return {
      kind: 'synth',
      provider: 'demo',
      seed: hashString(song.id),
      durationSec: 12,
      attribution: 'Demo-Testton (kein echter Song)',
    };
  }
}

export class NoAudioResolver implements AudioResolver {
  id = 'none';
  async resolve(): Promise<AudioPlayback> {
    return { kind: 'none', provider: 'none', reason: 'Kein Audioanbieter konfiguriert.' };
  }
}

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  trackId?: number;
  kind?: string;
}

const stripFeat = (s: string): string => s.replace(/\s*(feat\.?|ft\.?|featuring)\s.*$/i, '').trim();

/**
 * iTunes Search API (30-Sekunden-Vorschauen). Wird ausschließlich serverseitig abgefragt,
 * damit Netzwerkanfragen im Browser keinen Titel verraten.
 * Hinweis: Nutzung gemäß den Bedingungen der Apple Search API; Quellenangabe wird angezeigt.
 */
export class ItunesResolver implements AudioResolver {
  id = 'itunes';
  private cache = new Map<string, { at: number; pb: AudioPlayback }>();
  constructor(
    private country = 'DE',
    private fetchImpl: typeof fetch = (...args) => fetch(...args), // nicht „fetch“ direkt: im Browser wirft ein losgelöster Aufruf „Illegal invocation“
    private ttlMs = 6 * 3600_000,
    private timeoutMs = 4000,
  ) {}

  async resolve(song: Song): Promise<AudioPlayback> {
    const hit = this.cache.get(song.id);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.pb;
    const pb = await this.lookup(song);
    // Fehlschläge nur kurz cachen
    this.cache.set(song.id, { at: pb.kind === 'none' ? Date.now() - this.ttlMs + 60_000 : Date.now(), pb });
    return pb;
  }

  private async lookup(song: Song): Promise<AudioPlayback> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const term = `${stripFeat(song.artist)} ${song.title}`;
      const url = `https://itunes.apple.com/search?${new URLSearchParams({
        term,
        entity: 'song',
        media: 'music',
        limit: '15',
        country: this.country,
      })}`;
      const res = await this.fetchImpl(url, { signal: ctrl.signal });
      if (!res.ok) return { kind: 'none', provider: 'itunes', reason: `iTunes antwortet mit ${res.status}.` };
      const data = (await res.json()) as { results?: ItunesResult[] };
      const best = pickBestMatch(song, data.results ?? []);
      if (!best?.previewUrl) return { kind: 'none', provider: 'itunes', reason: 'Keine Vorschau gefunden.' };
      return {
        kind: 'url',
        provider: 'itunes',
        url: best.previewUrl,
        durationSec: Math.min(song.duration || 30, 30),
        attribution: 'Vorschau: Apple Music / iTunes',
      };
    } catch {
      return { kind: 'none', provider: 'itunes', reason: 'Audioquelle nicht erreichbar.' };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function pickBestMatch(song: Song, results: ItunesResult[]): ItunesResult | null {
  const wantTitle = normalizeText(stripFeat(song.title).replace(/\s*\([^)]*\)\s*/g, ' '));
  const wantArtist = normalizeText(stripFeat(song.artist).split(/&|,| and /)[0] ?? '');
  let best: { r: ItunesResult; score: number } | null = null;
  for (const r of results) {
    if (!r.previewUrl || !r.trackName) continue;
    const t = normalizeText(r.trackName.replace(/\s*\([^)]*\)\s*/g, ' '));
    const a = normalizeText(r.artistName ?? '');
    let score = 0;
    if (t === wantTitle) score += 4;
    else if (t.startsWith(wantTitle) || wantTitle.startsWith(t)) score += 2;
    else continue;
    if (wantArtist && a.includes(wantArtist)) score += 3;
    else if (wantArtist && wantArtist.includes(a) && a.length > 2) score += 2;
    else continue;
    // Live-/Karaoke-/Cover-Versionen abwerten
    if (/live|karaoke|tribute|cover|remix/i.test(r.trackName)) score -= 2;
    if (!best || score > best.score) best = { r, score };
  }
  return best?.r ?? null;
}

/**
 * Versucht den Hauptanbieter und fällt bei Ausfall auf den Ersatz zurück. Nach `maxFailures`
 * Ausfällen in Folge (z. B. Netzwerk blockiert) wird der Hauptanbieter nicht mehr befragt,
 * damit das Spiel nicht bei jeder Karte auf Zeitüberschreitungen wartet.
 */
export class FallbackResolver implements AudioResolver {
  id: string;
  private failures = 0;
  constructor(
    private primary: AudioResolver,
    private fallback: AudioResolver,
    private maxFailures = 3,
  ) {
    this.id = `${primary.id}+${fallback.id}`;
  }

  async resolve(song: Song): Promise<AudioPlayback> {
    if (this.failures < this.maxFailures) {
      const pb = await this.primary.resolve(song);
      if (pb.kind !== 'none') {
        this.failures = 0;
        return pb;
      }
      // „Keine Vorschau gefunden“ ist ein Songproblem, kein Ausfall; nur Erreichbarkeit zählt.
      if (/nicht erreichbar|antwortet mit/.test(pb.reason)) this.failures++;
      else this.failures = 0;
      if (this.failures < this.maxFailures) return pb;
    }
    return this.fallback.resolve(song);
  }
}

export function createResolver(opts: { provider?: string; country?: string; fetchImpl?: typeof fetch } = {}): AudioResolver {
  switch ((opts.provider ?? 'itunes').toLowerCase()) {
    case 'demo':
      return new DemoResolver();
    case 'none':
      return new NoAudioResolver();
    case 'itunes':
    default:
      return new ItunesResolver(opts.country ?? 'DE', opts.fetchImpl ?? fetch);
  }
}
