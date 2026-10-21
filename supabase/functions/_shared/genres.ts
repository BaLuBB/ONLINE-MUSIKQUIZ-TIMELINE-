import type { GenreId } from './types.ts';

export interface Genre {
  id: GenreId;
  label: string;
  group: 'Epochen' | 'Stile' | 'Deutsch' | 'Anlässe' | 'Medien';
}

export const GENRES: Genre[] = [
  { id: 'oldies', label: 'Oldies (bis 1969)', group: 'Epochen' },
  { id: '70er', label: '70er', group: 'Epochen' },
  { id: '80er', label: '80er', group: 'Epochen' },
  { id: '90er', label: '90er', group: 'Epochen' },
  { id: '2000er', label: '2000er', group: 'Epochen' },
  { id: '2010er', label: '2010er', group: 'Epochen' },
  { id: '2020er', label: '2020er', group: 'Epochen' },
  { id: 'klassiker', label: 'Klassiker', group: 'Epochen' },

  { id: 'pop', label: 'Pop', group: 'Stile' },
  { id: 'rock', label: 'Rock', group: 'Stile' },
  { id: 'hip-hop', label: 'Hip-Hop', group: 'Stile' },
  { id: 'rap', label: 'Rap', group: 'Stile' },
  { id: 'charts', label: 'Charts', group: 'Stile' },
  { id: 'dance', label: 'Dance', group: 'Stile' },
  { id: 'edm', label: 'EDM', group: 'Stile' },
  { id: 'house', label: 'House', group: 'Stile' },
  { id: 'techno', label: 'Techno', group: 'Stile' },
  { id: 'disco', label: 'Disco', group: 'Stile' },
  { id: 'funk', label: 'Funk', group: 'Stile' },
  { id: 'soul', label: 'Soul', group: 'Stile' },
  { id: 'rnb', label: 'R&B', group: 'Stile' },
  { id: 'jazz', label: 'Jazz', group: 'Stile' },
  { id: 'blues', label: 'Blues', group: 'Stile' },
  { id: 'reggae', label: 'Reggae', group: 'Stile' },
  { id: 'punk', label: 'Punk', group: 'Stile' },
  { id: 'metal', label: 'Metal', group: 'Stile' },
  { id: 'indie', label: 'Indie', group: 'Stile' },
  { id: 'alternative', label: 'Alternative', group: 'Stile' },
  { id: 'grunge', label: 'Grunge', group: 'Stile' },
  { id: 'britpop', label: 'Britpop', group: 'Stile' },
  { id: 'k-pop', label: 'K-Pop', group: 'Stile' },
  { id: 'latin', label: 'Latin', group: 'Stile' },
  { id: 'reggaeton', label: 'Reggaeton', group: 'Stile' },
  { id: 'country', label: 'Country', group: 'Stile' },
  { id: 'folk', label: 'Folk', group: 'Stile' },
  { id: 'singer-songwriter', label: 'Singer-Songwriter', group: 'Stile' },

  { id: 'deutschrap', label: 'Deutschrap', group: 'Deutsch' },
  { id: 'schlager', label: 'Schlager', group: 'Deutsch' },
  { id: 'deutschpop', label: 'Deutschpop', group: 'Deutsch' },
  { id: 'ndw', label: 'Neue Deutsche Welle', group: 'Deutsch' },

  { id: 'one-hit-wonder', label: 'One-Hit-Wonder', group: 'Anlässe' },
  { id: 'partyhits', label: 'Partyhits', group: 'Anlässe' },
  { id: 'sommerhits', label: 'Sommerhits', group: 'Anlässe' },
  { id: 'liebeslieder', label: 'Liebeslieder', group: 'Anlässe' },
  { id: 'balladen', label: 'Balladen', group: 'Anlässe' },
  { id: 'weihnachtslieder', label: 'Weihnachtslieder', group: 'Anlässe' },
  { id: 'viral', label: 'Viral Hits', group: 'Anlässe' },

  { id: 'soundtracks', label: 'Soundtracks', group: 'Medien' },
  { id: 'filmhits', label: 'Filmhits', group: 'Medien' },
  { id: 'gaming', label: 'Gaming-Soundtracks', group: 'Medien' },
  { id: 'anime', label: 'Anime-Openings', group: 'Medien' },
];

export const GENRE_IDS = new Set(GENRES.map((g) => g.id));

export function genreLabel(id: GenreId): string {
  return GENRES.find((g) => g.id === id)?.label ?? id;
}

/** Jahrzehnt-Genre, das automatisch aus dem Erscheinungsjahr abgeleitet wird. */
export function decadeGenre(year: number): GenreId | null {
  if (year < 1970) return 'oldies';
  if (year < 1980) return '70er';
  if (year < 1990) return '80er';
  if (year < 2000) return '90er';
  if (year < 2010) return '2000er';
  if (year < 2020) return '2010er';
  return '2020er';
}
