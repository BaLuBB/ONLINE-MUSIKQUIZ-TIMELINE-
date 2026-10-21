// Startbestand der Musikbibliothek.
//
// WICHTIG ZUR DATENQUALITÄT: Die Jahre stammen aus der vorgegebenen Startliste bzw. aus
// allgemeinem Wissen und konnten in der Entwicklungsumgebung NICHT gegen eine externe
// Quelle (z. B. MusicBrainz) geprüft werden. Einträge mit `review` sind unsicher
// (Album- vs. Single-Jahr o. Ä.) und sollten vor dem Produktiveinsatz geprüft werden.
// `npm run check:songs` prüft Struktur, Duplikate und Genres; ein Abgleich mit MusicBrainz
// ist in der README beschrieben.
//
// Format je Zeile: [Interpret, Titel, Jahr, 'genre genre …', { aliases?, review? }]
// Jahrzehnt-Genres (70er, 80er, …) werden automatisch aus dem Jahr ergänzt.

import { decadeGenre, GENRE_IDS } from './genres.ts';
import { EIGHTIES_NINETIES_ROWS } from './songs.eighties-nineties.ts';
import { OLDIES_ROWS } from './songs.oldies.ts';
import { RECENT_ROWS } from './songs.recent.ts';
import type { Song } from './types.ts';

export type Extra = { aliases?: string[]; review?: string };
export type Row = [artist: string, title: string, year: number, genres: string, extra?: Extra];

const ROWS: Row[] = [
  // ───── Startliste (Nr. 1–120, Duplikat Nr. 46 entfernt) ─────
  ['Queen', 'Bohemian Rhapsody', 1975, 'rock klassiker balladen'],
  ['ABBA', 'Dancing Queen', 1976, 'pop disco klassiker partyhits'],
  ['Earth, Wind & Fire', 'September', 1978, 'funk soul disco klassiker partyhits'],
  ['Gloria Gaynor', 'I Will Survive', 1978, 'disco klassiker partyhits'],
  ['Michael Jackson', 'Billie Jean', 1982, 'pop funk rnb klassiker charts', { review: 'Album 1982, Single Jan. 1983' }],
  ['a-ha', 'Take On Me', 1984, 'pop charts klassiker', { review: 'Erstveröffentlichung 1984, Hit-Version 1985' }],
  ['Madonna', 'Like a Virgin', 1984, 'pop charts klassiker'],
  ["Bon Jovi", "Livin' on a Prayer", 1986, 'rock klassiker charts partyhits'],
  ['Europe', 'The Final Countdown', 1986, 'rock metal klassiker charts partyhits'],
  ['Whitney Houston', 'I Wanna Dance with Somebody', 1987, 'pop dance charts klassiker partyhits', { aliases: ['I Wanna Dance with Somebody (Who Loves Me)'] }],
  ['Rick Astley', 'Never Gonna Give You Up', 1987, 'pop charts viral klassiker'],
  ["Guns N' Roses", "Sweet Child o' Mine", 1987, 'rock klassiker', { review: 'Album 1987, Single 1988' }],
  ['Michael Jackson', 'Smooth Criminal', 1987, 'pop funk rnb klassiker', { review: 'Album 1987, Single Okt. 1987/1988' }],
  ['Journey', "Don't Stop Believin'", 1981, 'rock klassiker balladen partyhits'],
  ['Toto', 'Africa', 1982, 'rock pop klassiker'],
  ['Nena', '99 Luftballons', 1983, 'ndw pop deutschpop klassiker', { aliases: ['Neunundneunzig Luftballons', '99 Red Balloons'] }],
  ['Falco', 'Rock Me Amadeus', 1985, 'pop ndw klassiker charts'],
  ['Cyndi Lauper', 'Girls Just Want to Have Fun', 1983, 'pop charts klassiker partyhits'],
  ['Prince', 'Purple Rain', 1984, 'rock pop soundtracks balladen klassiker'],
  ['Bryan Adams', "Summer of '69", 1984, 'rock sommerhits klassiker', { aliases: ['Summer of 69'], review: 'Album 1984, Single 1985' }],
  ['Nirvana', 'Smells Like Teen Spirit', 1991, 'rock grunge alternative klassiker'],
  ['Oasis', 'Wonderwall', 1995, 'rock britpop alternative klassiker'],
  ['The Cranberries', 'Zombie', 1994, 'rock alternative klassiker'],
  ['Backstreet Boys', "Everybody (Backstreet's Back)", 1997, 'pop charts partyhits', { aliases: ['Everybody', "Backstreet's Back"] }],
  ['Spice Girls', 'Wannabe', 1996, 'pop charts partyhits klassiker'],
  ['Britney Spears', '...Baby One More Time', 1998, 'pop charts klassiker', { aliases: ['Baby One More Time'], review: 'Single Okt. 1998, Album 1999' }],
  ['Cher', 'Believe', 1998, 'pop dance charts partyhits'],
  ['Ricky Martin', "Livin' la Vida Loca", 1999, 'latin pop charts partyhits sommerhits'],
  ['Eiffel 65', 'Blue (Da Ba Dee)', 1998, 'dance one-hit-wonder partyhits', { aliases: ['Blue', 'Da Ba Dee'], review: 'Italien 1998, international 1999' }],
  ['Lou Bega', 'Mambo No. 5', 1999, 'latin one-hit-wonder partyhits sommerhits', { aliases: ['Mambo No 5', 'Mambo Number 5', 'Mambo Nr. 5'] }],
  ['Red Hot Chili Peppers', 'Californication', 1999, 'rock alternative', { review: 'Album 1999, Single 2000' }],
  ['The White Stripes', 'Seven Nation Army', 2003, 'rock indie alternative', { aliases: ['7 Nation Army'] }],
  ['Linkin Park', 'In the End', 2000, 'rock alternative metal', { review: 'Album 2000, Single 2001' }],
  ['Eminem', 'Lose Yourself', 2002, 'hip-hop rap filmhits soundtracks'],
  ['Beyoncé feat. Jay-Z', 'Crazy in Love', 2003, 'rnb pop hip-hop charts'],
  ['OutKast', 'Hey Ya!', 2003, 'hip-hop pop funk partyhits'],
  ['The Killers', 'Mr. Brightside', 2003, 'rock indie alternative', { aliases: ['Mr Brightside'], review: 'Single 2003/2004, Album 2004' }],
  ['Usher feat. Lil Jon & Ludacris', 'Yeah!', 2004, 'rnb hip-hop charts partyhits'],
  ['Rihanna feat. Jay-Z', 'Umbrella', 2007, 'rnb pop charts sommerhits'],
  ['Amy Winehouse', 'Rehab', 2006, 'soul pop jazz'],
  ['Lady Gaga', 'Poker Face', 2008, 'pop dance charts partyhits'],
  ['Katy Perry', 'I Kissed a Girl', 2008, 'pop charts sommerhits'],
  ['Kings of Leon', 'Sex on Fire', 2008, 'rock indie alternative'],
  ['Flo Rida feat. T-Pain', 'Low', 2007, 'hip-hop rap partyhits', { aliases: ['Low (Shawty Get Loose)'] }],
  ['The Black Eyed Peas', 'I Gotta Feeling', 2009, 'pop dance charts partyhits'],
  ['Avicii', 'Levels', 2011, 'edm house dance partyhits'],
  ['Gotye feat. Kimbra', 'Somebody That I Used to Know', 2011, 'pop indie one-hit-wonder', { aliases: ['Somebody I Used to Know'] }],
  ['Carly Rae Jepsen', 'Call Me Maybe', 2011, 'pop charts one-hit-wonder sommerhits viral'],
  ['PSY', 'Gangnam Style', 2012, 'k-pop dance viral partyhits one-hit-wonder'],
  ['Daft Punk feat. Pharrell Williams', 'Get Lucky', 2013, 'house dance funk charts'],
  ['Pharrell Williams', 'Happy', 2013, 'pop soul charts filmhits sommerhits'],
  ['Mark Ronson feat. Bruno Mars', 'Uptown Funk', 2014, 'funk pop charts partyhits', { aliases: ['Uptown Funk!'] }],
  ['Taylor Swift', 'Shake It Off', 2014, 'pop charts partyhits'],
  ['The Weeknd', "Can't Feel My Face", 2015, 'pop rnb charts'],
  ['Adele', 'Hello', 2015, 'pop soul balladen singer-songwriter charts'],
  ['Justin Bieber', 'Sorry', 2015, 'pop dance charts'],
  ['Sia', 'Chandelier', 2014, 'pop charts balladen'],
  ['Luis Fonsi feat. Daddy Yankee', 'Despacito', 2017, 'latin reggaeton pop charts sommerhits viral'],
  ['Ed Sheeran', 'Shape of You', 2017, 'pop charts singer-songwriter'],
  ['Kendrick Lamar', 'HUMBLE.', 2017, 'hip-hop rap', { aliases: ['Humble'] }],
  ['Dua Lipa', 'New Rules', 2017, 'pop dance charts'],
  ['Drake', "God's Plan", 2018, 'hip-hop rap charts'],
  ['Post Malone', 'Circles', 2019, 'pop hip-hop charts'],
  ['Billie Eilish', 'bad guy', 2019, 'pop charts alternative'],
  ['Lil Nas X', 'Old Town Road', 2019, 'hip-hop country viral charts', { aliases: ['Old Town Road (Remix)'] }],
  ['The Weeknd', 'Blinding Lights', 2019, 'pop dance charts viral'],
  ['Dua Lipa', "Don't Start Now", 2019, 'pop dance charts'],
  ['Harry Styles', 'Watermelon Sugar', 2019, 'pop charts sommerhits', { review: 'Album Dez. 2019, Single 2020' }],
  ['Miley Cyrus', 'Flowers', 2023, 'pop charts viral'],
  ['Harry Styles', 'As It Was', 2022, 'pop charts'],
  ['Taylor Swift', 'Anti-Hero', 2022, 'pop charts', { aliases: ['Anti Hero'] }],
  ['Olivia Rodrigo', 'drivers license', 2021, 'pop balladen charts viral', { aliases: ["driver's license"] }],
  ['Olivia Rodrigo', 'good 4 u', 2021, 'pop punk charts', { aliases: ['good for you'] }],
  ['Glass Animals', 'Heat Waves', 2020, 'indie alternative charts viral'],
  ['The Kid LAROI & Justin Bieber', 'STAY', 2021, 'pop hip-hop charts'],
  ['Dua Lipa', 'Levitating', 2020, 'pop dance disco charts partyhits'],
  ['Doja Cat', 'Say So', 2019, 'pop rnb disco charts viral', { review: 'Album Nov. 2019, Single 2020' }],
  ['Sabrina Carpenter', 'Espresso', 2024, 'pop charts sommerhits viral'],
  ['Chappell Roan', 'Good Luck, Babe!', 2024, 'pop charts viral', { aliases: ['Good Luck Babe'] }],
  ['Apache 207', 'Roller', 2019, 'deutschrap hip-hop rap charts'],
  ['Apache 207', 'Bläulich', 2020, 'deutschrap hip-hop rap', { aliases: ['Blaulich'] }],
  ['Peter Fox', 'Haus am See', 2008, 'deutschrap hip-hop sommerhits'],
  ['Seeed', 'Ding', 2005, 'reggae deutschrap hip-hop'],
  ['Die Ärzte', 'Westerland', 1988, 'punk rock deutschpop', { aliases: ['Westerland (Sylt)'] }],
  ['Die Toten Hosen', 'Tage wie diese', 2012, 'punk rock deutschpop'],
  ['Herbert Grönemeyer', 'Männer', 1984, 'deutschpop pop klassiker'],
  ["Matthias Reim", "Verdammt, ich lieb' dich", 1990, 'schlager deutschpop', { aliases: ['Verdammt ich lieb dich', 'Verdammt, ich lieb dich'] }],
  ['Helene Fischer', 'Atemlos durch die Nacht', 2013, 'schlager partyhits charts'],
  ['Mark Forster', 'Chöre', 2016, 'deutschpop pop charts', { aliases: ['Choere'] }],
  ['CRO', 'Easy', 2011, 'deutschrap hip-hop rap pop'],
  ['Sido', 'Mein Block', 2004, 'deutschrap hip-hop rap'],
  ['Peter Schilling', 'Major Tom (völlig losgelöst)', 1982, 'ndw pop klassiker', { aliases: ['Major Tom', 'Völlig losgelöst', 'Major Tom (Völlig losgelöst)'] }],
  ['Kraftwerk', 'Das Model', 1978, 'techno dance klassiker', { review: 'Album 1978, Single 1981' }],
  ['Die Fantastischen Vier', 'Die da!?', 1992, 'deutschrap hip-hop rap', { aliases: ['Die Da', 'Die da'] }],
  ['Fettes Brot', 'Jein', 1996, 'deutschrap hip-hop rap'],
  ['Rammstein', 'Du hast', 1997, 'metal rock'],
  ['Tokio Hotel', 'Durch den Monsun', 2005, 'deutschpop rock pop'],
  ['Culcha Candela', 'Hamma!', 2007, 'reggae deutschrap partyhits sommerhits', { aliases: ['Hamma'] }],
  ['Mark Forster feat. Sido', 'Au revoir', 2014, 'deutschpop deutschrap pop charts', { aliases: ['Au Revoir'] }],
  ['Adele', 'Rolling in the Deep', 2010, 'pop soul charts singer-songwriter'],
  ['Bruno Mars', 'Just the Way You Are', 2010, 'pop rnb charts liebeslieder', { aliases: ['Just the Way You Are (Amazing)'] }],
  ['Coldplay', 'Viva la Vida', 2008, 'rock pop alternative charts'],
  ['Coldplay', 'Yellow', 2000, 'rock alternative liebeslieder'],
  ['The Police', 'Every Breath You Take', 1983, 'rock pop liebeslieder klassiker'],
  ['Bryan Adams', '(Everything I Do) I Do It for You', 1991, 'rock balladen liebeslieder filmhits soundtracks', { aliases: ['Everything I Do I Do It for You', 'I Do It for You'] }],
  ['2Pac feat. Dr. Dre', 'California Love', 1995, 'hip-hop rap klassiker partyhits'],
  ['The Notorious B.I.G.', 'Juicy', 1994, 'hip-hop rap klassiker'],
  ['Jay-Z feat. Alicia Keys', 'Empire State of Mind', 2009, 'hip-hop rap rnb charts'],
  ['Macklemore & Ryan Lewis feat. Wanz', 'Thrift Shop', 2012, 'hip-hop rap viral partyhits'],
  ['Avicii', 'Wake Me Up', 2013, 'edm dance folk charts sommerhits'],
  ['Martin Garrix', 'Animals', 2013, 'edm house dance'],
  ['Robin Schulz feat. Francesco Yates', 'Sugar', 2015, 'edm house dance sommerhits charts'],
  ['O-Zone', 'Dragostea Din Tei', 2003, 'dance one-hit-wonder viral sommerhits partyhits', { aliases: ['Dragostea din tei', 'Numa Numa'] }],
  ['Las Ketchup', 'The Ketchup Song (Aserejé)', 2002, 'latin one-hit-wonder partyhits sommerhits', { aliases: ['The Ketchup Song', 'Aserejé', 'Asereje', 'Ketchup Song'] }],
  ['Shakira feat. Wyclef Jean', "Hips Don't Lie", 2006, 'latin pop sommerhits charts partyhits'],
  ['Jennifer Lopez', 'On the Floor', 2011, 'pop dance latin charts partyhits'],
  ['Major Lazer & DJ Snake feat. MØ', 'Lean On', 2015, 'edm dance sommerhits charts'],
  ['Imagine Dragons', 'Radioactive', 2012, 'rock alternative indie'],
  ['Imagine Dragons', 'Believer', 2017, 'rock alternative pop charts'],

  // ───── Ergänzungen: Jazz / Blues / Soul / Funk / Disco / Reggae ─────
  ['Louis Armstrong', 'What a Wonderful World', 1967, 'jazz balladen klassiker'],
  ['Nina Simone', 'Feeling Good', 1965, 'jazz soul klassiker'],
  ['Norah Jones', "Don't Know Why", 2002, 'jazz singer-songwriter pop'],
  ['The Dave Brubeck Quartet', 'Take Five', 1959, 'jazz klassiker'],
  ['B.B. King', 'The Thrill Is Gone', 1969, 'blues klassiker'],
  ['Muddy Waters', 'Hoochie Coochie Man', 1954, 'blues klassiker', { aliases: ['I\'m Your Hoochie Coochie Man'] }],
  ['Etta James', 'At Last', 1960, 'blues soul jazz liebeslieder klassiker'],
  ['Bob Marley & The Wailers', 'Is This Love', 1978, 'reggae liebeslieder klassiker'],
  ['Bob Marley & The Wailers', 'Could You Be Loved', 1980, 'reggae klassiker'],
  ['UB40', 'Red Red Wine', 1983, 'reggae pop sommerhits klassiker'],
  ['Shaggy', 'It Wasn\'t Me', 2000, 'reggae pop charts partyhits', { aliases: ['It Wasnt Me'] }],
  ['Aretha Franklin', 'Respect', 1967, 'soul klassiker'],
  ['Otis Redding', '(Sittin\' on) The Dock of the Bay', 1968, 'soul klassiker', { aliases: ['Dock of the Bay', 'Sitting on the Dock of the Bay', 'The Dock of the Bay'] }],
  ['Marvin Gaye', "Let's Get It On", 1973, 'soul rnb liebeslieder klassiker'],
  ['Stevie Wonder', 'Superstition', 1972, 'soul funk klassiker'],
  ['Ben E. King', 'Stand by Me', 1961, 'soul balladen liebeslieder klassiker'],
  ['Al Green', "Let's Stay Together", 1971, 'soul liebeslieder klassiker'],
  ['James Brown', 'Get Up (I Feel Like Being a) Sex Machine', 1970, 'funk soul klassiker', { aliases: ['Sex Machine', 'Get Up', 'Get Up I Feel Like Being a Sex Machine'] }],
  ['Kool & the Gang', 'Celebration', 1980, 'funk disco partyhits klassiker'],
  ['Chic', 'Le Freak', 1978, 'disco funk klassiker partyhits'],
  ['Parliament', 'Flash Light', 1977, 'funk klassiker', { aliases: ['Flashlight'] }],
  ['Bee Gees', "Stayin' Alive", 1977, 'disco pop klassiker partyhits', { aliases: ['Stayin Alive', 'Staying Alive'] }],
  ['Donna Summer', 'I Feel Love', 1977, 'disco dance house klassiker'],
  ['Boney M.', 'Daddy Cool', 1976, 'disco klassiker partyhits'],
  ['Village People', 'Y.M.C.A.', 1978, 'disco partyhits klassiker', { aliases: ['YMCA'] }],
  ['Sister Sledge', 'We Are Family', 1979, 'disco funk klassiker partyhits'],
  ['Destiny\'s Child', 'Say My Name', 1999, 'rnb pop charts'],
  ['Alicia Keys', "Fallin'", 2001, 'rnb soul singer-songwriter', { aliases: ['Fallin', 'Falling'] }],
  ['TLC', 'No Scrubs', 1999, 'rnb hip-hop charts'],
  ['Run-D.M.C.', 'Walk This Way', 1986, 'hip-hop rap rock klassiker'],
  ['Dr. Dre feat. Snoop Dogg', 'Still D.R.E.', 1999, 'hip-hop rap', { aliases: ['Still DRE'] }],
  ['The Sugarhill Gang', "Rapper's Delight", 1979, 'hip-hop rap klassiker', { aliases: ['Rappers Delight'] }],

  // ───── Ergänzungen: Rock / Punk / Metal / Grunge / Britpop / Indie / Alternative ─────
  ['Led Zeppelin', 'Stairway to Heaven', 1971, 'rock klassiker'],
  ['The Rolling Stones', "(I Can't Get No) Satisfaction", 1965, 'rock klassiker', { aliases: ['Satisfaction', 'I Cant Get No Satisfaction'] }],
  ['Deep Purple', 'Smoke on the Water', 1972, 'rock metal klassiker'],
  ['Pink Floyd', 'Another Brick in the Wall (Part 2)', 1979, 'rock klassiker', { aliases: ['Another Brick in the Wall', 'Another Brick in the Wall Part 2', 'Another Brick in the Wall Part II'] }],
  ['Fleetwood Mac', 'Dreams', 1977, 'rock pop klassiker'],
  ['Jimi Hendrix', 'Purple Haze', 1967, 'rock blues klassiker'],
  ['The Doors', 'Light My Fire', 1967, 'rock klassiker'],
  ['Elvis Presley', 'Hound Dog', 1956, 'rock klassiker'],
  ['Chuck Berry', 'Johnny B. Goode', 1958, 'rock blues klassiker', { aliases: ['Johnny B Goode'] }],
  ['Scorpions', 'Wind of Change', 1990, 'rock balladen klassiker'],
  ['Scorpions', 'Rock You Like a Hurricane', 1984, 'rock metal klassiker'],
  ['AC/DC', 'Highway to Hell', 1979, 'rock metal klassiker'],
  ['AC/DC', 'Back in Black', 1980, 'rock metal klassiker'],
  ['Metallica', 'Enter Sandman', 1991, 'metal rock klassiker'],
  ['Iron Maiden', 'The Trooper', 1983, 'metal klassiker'],
  ['Black Sabbath', 'Paranoid', 1970, 'metal rock klassiker'],
  ['Motörhead', 'Ace of Spades', 1980, 'metal punk klassiker', { aliases: ['Ace of Spades'] }],
  ['Ramones', 'Blitzkrieg Bop', 1976, 'punk rock klassiker'],
  ['Sex Pistols', 'Anarchy in the U.K.', 1976, 'punk klassiker', { aliases: ['Anarchy in the UK'] }],
  ['The Clash', 'London Calling', 1979, 'punk rock klassiker'],
  ['Green Day', 'Basket Case', 1994, 'punk alternative rock'],
  ['Green Day', 'American Idiot', 2004, 'punk alternative rock'],
  ['Pearl Jam', 'Alive', 1991, 'grunge rock alternative'],
  ['Soundgarden', 'Black Hole Sun', 1994, 'grunge rock alternative'],
  ['Alice in Chains', 'Man in the Box', 1990, 'grunge metal alternative'],
  ['Blur', 'Song 2', 1997, 'britpop indie rock alternative'],
  ['Blur', 'Parklife', 1994, 'britpop indie'],
  ['Pulp', 'Common People', 1995, 'britpop indie'],
  ['Oasis', "Don't Look Back in Anger", 1995, 'britpop rock balladen'],
  ['Arctic Monkeys', 'I Bet You Look Good on the Dancefloor', 2005, 'indie rock alternative'],
  ['The Strokes', 'Last Nite', 2001, 'indie rock alternative'],
  ['Foster the People', 'Pumped Up Kicks', 2010, 'indie alternative pop sommerhits', { review: 'Single 2010, Album 2011' }],
  ['Radiohead', 'Creep', 1992, 'alternative rock grunge', { review: 'Single 1992, Album 1993' }],
  ['Foo Fighters', 'Everlong', 1997, 'alternative rock'],

  // ───── Ergänzungen: Country / Folk / Singer-Songwriter ─────
  ['Johnny Cash', 'Ring of Fire', 1963, 'country klassiker'],
  ['Dolly Parton', 'Jolene', 1973, 'country klassiker'],
  ['Shania Twain', 'Man! I Feel Like a Woman!', 1999, 'country pop partyhits', { aliases: ['Man I Feel Like a Woman'] }],
  ['John Denver', 'Take Me Home, Country Roads', 1971, 'country folk klassiker', { aliases: ['Country Roads', 'Take Me Home Country Roads'] }],
  ['Kenny Rogers', 'The Gambler', 1978, 'country klassiker'],
  ['Bob Dylan', "Blowin' in the Wind", 1963, 'folk singer-songwriter klassiker', { aliases: ['Blowin in the Wind', 'Blowing in the Wind'] }],
  ['Simon & Garfunkel', 'Mrs. Robinson', 1968, 'folk rock soundtracks filmhits klassiker', { aliases: ['Mrs Robinson'] }],
  ['Mumford & Sons', 'Little Lion Man', 2009, 'folk indie'],
  ['The Lumineers', 'Ho Hey', 2012, 'folk indie'],
  ['Tracy Chapman', 'Fast Car', 1988, 'singer-songwriter folk klassiker'],
  ['James Blunt', "You're Beautiful", 2005, 'singer-songwriter pop balladen liebeslieder', { aliases: ['Youre Beautiful', 'You Are Beautiful'] }],
  ['Passenger', 'Let Her Go', 2012, 'singer-songwriter folk balladen'],

  // ───── Ergänzungen: Deutsch ─────
  ['Udo Jürgens', 'Aber bitte mit Sahne', 1976, 'schlager klassiker'],
  ['Roland Kaiser', 'Santa Maria', 1980, 'schlager'],
  ['Wolfgang Petry', 'Wahnsinn', 1992, 'schlager partyhits', { review: 'Jahr (1992) prüfen' }],
  ['Nino de Angelo', 'Jenseits von Eden', 1983, 'schlager pop balladen'],
  ['Peter Maffay', 'Über sieben Brücken musst du gehn', 1980, 'schlager deutschpop balladen', { aliases: ['Ueber sieben Bruecken musst du gehn', 'Über sieben Brücken musst du geh\'n', 'Über sieben Brücken'] }],
  ['Ideal', 'Blaue Augen', 1980, 'ndw deutschpop'],
  ['Spider Murphy Gang', 'Skandal im Sperrbezirk', 1981, 'ndw rock deutschpop'],
  ['Markus', 'Ich will Spaß', 1982, 'ndw partyhits', { aliases: ['Ich will Spass'] }],
  ['Trio', 'Da Da Da', 1982, 'ndw pop one-hit-wonder', { review: 'Album 1981, Single 1982 – Jahr prüfen', aliases: ['Da Da Da (ich lieb dich nicht du liebst mich nicht)', 'Da Da Da ich lieb dich nicht du liebst mich nicht'] }],
  ['Nena', 'Nur geträumt', 1982, 'ndw deutschpop', { aliases: ['Nur getraeumt'] }],
  ['Joachim Witt', 'Der Goldene Reiter', 1981, 'ndw', { aliases: ['Goldener Reiter', 'Der goldene Reiter'] }],
  ['Extrabreit', 'Hurra Hurra die Schule brennt', 1981, 'ndw punk rock', { aliases: ['Hurra, hurra, die Schule brennt'] }],
  ['Silbermond', 'Symphonie', 2004, 'deutschpop pop balladen'],
  ['Juli', 'Perfekte Welle', 2004, 'deutschpop pop sommerhits'],
  ['Wir sind Helden', 'Nur ein Wort', 2003, 'deutschpop pop indie'],
  ['Lena', 'Satellite', 2010, 'deutschpop pop charts'],
  ['Tim Bendzko', 'Nur noch kurz die Welt retten', 2011, 'deutschpop pop'],

  // ───── Ergänzungen: Latin / K-Pop ─────
  ['Daddy Yankee', 'Gasolina', 2004, 'reggaeton latin partyhits'],
  ['Enrique Iglesias feat. Descemer Bueno & Gente de Zona', 'Bailando', 2014, 'latin pop sommerhits charts'],
  ['Santana feat. Rob Thomas', 'Smooth', 1999, 'latin rock charts'],
  ['Bad Bunny', 'Tití Me Preguntó', 2022, 'reggaeton latin charts', { aliases: ['Titi Me Pregunto'] }],
  ['BTS', 'Dynamite', 2020, 'k-pop pop charts viral'],
  ['BTS', 'Butter', 2021, 'k-pop pop charts'],
  ['BLACKPINK', 'DDU-DU DDU-DU', 2018, 'k-pop pop', { aliases: ['Ddu Du Ddu Du'] }],

  // ───── Ergänzungen: Soundtracks / Filmhits / Gaming / Anime ─────
  ['Céline Dion', 'My Heart Will Go On', 1997, 'filmhits soundtracks balladen liebeslieder'],
  ['Whitney Houston', 'I Will Always Love You', 1992, 'filmhits soundtracks balladen liebeslieder', { review: 'Cover; Whitney-Version 1992 (Dolly Parton 1973)' }],
  ['Survivor', 'Eye of the Tiger', 1982, 'rock filmhits soundtracks klassiker'],
  ['Kenny Loggins', 'Danger Zone', 1986, 'rock filmhits soundtracks'],
  ['Phil Collins', "You'll Be in My Heart", 1999, 'filmhits soundtracks balladen', { aliases: ['Youll Be in My Heart'] }],
  ['Idina Menzel', 'Let It Go', 2013, 'filmhits soundtracks balladen'],
  ['Bill Medley & Jennifer Warnes', "(I've Had) The Time of My Life", 1987, 'filmhits soundtracks liebeslieder', { aliases: ['The Time of My Life', 'Time of My Life'] }],
  ['Adele', 'Skyfall', 2012, 'filmhits soundtracks balladen'],
  ['Lady Gaga & Bradley Cooper', 'Shallow', 2018, 'filmhits soundtracks balladen liebeslieder'],
  ['Wiz Khalifa feat. Charlie Puth', 'See You Again', 2015, 'filmhits soundtracks hip-hop balladen'],
  ['Elton John', 'Can You Feel the Love Tonight', 1994, 'filmhits soundtracks balladen liebeslieder'],
  ['Koji Kondo', 'Super Mario Bros. Theme', 1985, 'gaming soundtracks', { aliases: ['Super Mario Bros Theme', 'Super Mario Theme', 'Ground Theme'] }],
  ['Koji Kondo', 'The Legend of Zelda Main Theme', 1986, 'gaming soundtracks', { aliases: ['Zelda Main Theme', 'Legend of Zelda Theme', 'The Legend of Zelda Theme'] }],
  ['Hirokazu Tanaka', 'Tetris Theme (Type A)', 1989, 'gaming soundtracks', { aliases: ['Tetris Theme', 'Korobeiniki', 'Tetris'] }],
  ['C418', 'Sweden', 2011, 'gaming soundtracks', { review: 'Minecraft Volume Alpha 2011 – Jahr prüfen' }],
  ["Martin O'Donnell & Michael Salvatori", 'Halo Theme', 2001, 'gaming soundtracks', { aliases: ['Halo'] }],
  ['Jeremy Soule', 'Dragonborn', 2011, 'gaming soundtracks', { aliases: ['Skyrim Main Theme', 'Skyrim Theme'] }],
  ['Nobuo Uematsu', 'One-Winged Angel', 1997, 'gaming soundtracks metal', { aliases: ['One Winged Angel'] }],
  ['Yoko Takahashi', "A Cruel Angel's Thesis", 1995, 'anime soundtracks', { aliases: ["Cruel Angel's Thesis", 'Zankoku na Tenshi no Te-ze', 'Cruel Angels Thesis'] }],
  ['The Seatbelts', 'Tank!', 1998, 'anime jazz soundtracks', { aliases: ['Tank'] }],
  ['Linked Horizon', 'Guren no Yumiya', 2013, 'anime soundtracks', { aliases: ['Crimson Bow and Arrow', 'Gurenno Yumiya'] }],
  ['LiSA', 'Gurenge', 2019, 'anime soundtracks pop'],
  ['Hiroshi Kitadani', 'We Are!', 1999, 'anime soundtracks', { aliases: ['We Are'] }],
  ['Hironobu Kageyama', 'Cha-La Head-Cha-La', 1989, 'anime soundtracks', { aliases: ['Cha La Head Cha La', 'Chala Head Chala'] }],

  // ───── Ergänzungen: Weihnachten / Liebe / Balladen / Klassiker ─────
  ['Wham!', 'Last Christmas', 1984, 'weihnachtslieder pop klassiker'],
  ['Mariah Carey', 'All I Want for Christmas Is You', 1994, 'weihnachtslieder pop rnb'],
  ['Band Aid', "Do They Know It's Christmas?", 1984, 'weihnachtslieder pop klassiker', { aliases: ['Do They Know Its Christmas'] }],
  ['Slade', 'Merry Xmas Everybody', 1973, 'weihnachtslieder rock klassiker'],
  ['John Lennon', 'Happy Xmas (War Is Over)', 1971, 'weihnachtslieder rock klassiker', { aliases: ['Happy Xmas', 'Happy Christmas (War Is Over)', 'Happy Christmas'] }],
  ['Bing Crosby', 'White Christmas', 1942, 'weihnachtslieder jazz klassiker'],
  ['Brenda Lee', 'Rockin\' Around the Christmas Tree', 1958, 'weihnachtslieder klassiker', { aliases: ['Rocking Around the Christmas Tree'] }],
  ['Shakin\' Stevens', 'Merry Christmas Everyone', 1985, 'weihnachtslieder rock klassiker'],
  ['Elvis Presley', "Can't Help Falling in Love", 1961, 'liebeslieder balladen klassiker', { aliases: ['Cant Help Falling in Love'] }],
  ['The Beatles', 'Let It Be', 1970, 'rock balladen klassiker'],
  ['The Beatles', 'Hey Jude', 1968, 'rock balladen klassiker'],
  ['The Beatles', 'Yesterday', 1965, 'rock pop balladen klassiker'],
  ['Ed Sheeran', 'Perfect', 2017, 'pop balladen liebeslieder singer-songwriter charts'],
  ['John Legend', 'All of Me', 2013, 'balladen liebeslieder soul charts'],
  ['Lionel Richie', 'Hello', 1984, 'balladen liebeslieder soul klassiker'],
  ['Aerosmith', "I Don't Want to Miss a Thing", 1998, 'rock balladen liebeslieder filmhits soundtracks'],

  // ───── Ergänzungen: Dance / House / Techno / Party / Viral / One-Hit-Wonder ─────
  ['David Guetta feat. Sia', 'Titanium', 2011, 'edm dance charts'],
  ['Swedish House Mafia', "Don't You Worry Child", 2012, 'edm house dance charts'],
  ['Zedd feat. Foxes', 'Clarity', 2012, 'edm dance'],
  ['Calvin Harris feat. Rihanna', 'This Is What You Came For', 2016, 'edm dance charts'],
  ['Darude', 'Sandstorm', 1999, 'techno edm dance one-hit-wonder viral', { review: 'Finnland 1999, international 2000 – Jahr prüfen' }],
  ['Moby', 'Go', 1991, 'techno dance'],
  ['Scooter', 'How Much Is the Fish?', 1998, 'techno dance partyhits', { aliases: ['How Much Is the Fish'] }],
  ['Scooter', 'Hyper Hyper', 1994, 'techno dance partyhits'],
  ['Paul Kalkbrenner', 'Sky and Sand', 2008, 'techno dance filmhits soundtracks', { aliases: ['Sky & Sand'] }],
  ['Underworld', 'Born Slippy .NUXX', 1996, 'techno dance soundtracks', { aliases: ['Born Slippy', 'Born Slippy NUXX'], review: 'B-Seite 1995, Single 1996' }],
  ['Robin S.', 'Show Me Love', 1993, 'house dance', { aliases: ['Show Me Love'] }],
  ['Black Box', 'Ride on Time', 1989, 'house dance partyhits'],
  ['Daft Punk', 'One More Time', 2000, 'house dance', { review: 'Single Nov. 2000, Album 2001' }],
  ['Stardust', 'Music Sounds Better with You', 1998, 'house dance one-hit-wonder'],
  ['Eric Prydz', 'Call on Me', 2004, 'house dance sommerhits'],
  ['Whigfield', 'Saturday Night', 1994, 'dance one-hit-wonder sommerhits partyhits'],
  ['Mungo Jerry', 'In the Summertime', 1970, 'rock sommerhits klassiker'],
  ['DJ Ötzi', 'Hey Baby', 2000, 'schlager partyhits sommerhits', { aliases: ['Hey Baby (Uhh, Ahh)'] }],
  ['Rednex', 'Cotton Eye Joe', 1994, 'dance country partyhits one-hit-wonder'],
  ['Baauer', 'Harlem Shake', 2012, 'edm hip-hop viral one-hit-wonder'],
  ['Tony Igy', 'Astronomia', 2010, 'edm dance viral one-hit-wonder', { review: 'Jahr (2010) prüfen' }],
  ['Vanilla Ice', 'Ice Ice Baby', 1990, 'hip-hop rap one-hit-wonder partyhits klassiker'],
  ['Baha Men', 'Who Let the Dogs Out', 2000, 'dance one-hit-wonder partyhits'],
  ['Right Said Fred', "I'm Too Sexy", 1991, 'pop dance one-hit-wonder', { aliases: ['Im Too Sexy'] }],
  ['Chumbawamba', 'Tubthumping', 1997, 'rock punk one-hit-wonder partyhits', { aliases: ["I Get Knocked Down", 'Tubthumper'] }],
  ['Aqua', 'Barbie Girl', 1997, 'pop dance partyhits'],
  ['Haddaway', 'What Is Love', 1993, 'dance partyhits one-hit-wonder', { aliases: ['What Is Love?'] }],
  ['Snap!', 'Rhythm Is a Dancer', 1992, 'dance house partyhits'],
  ['Alanis Morissette', 'You Oughta Know', 1995, 'rock alternative'],
];

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function toSong([artist, title, year, genres, extra]: Row): Song {
  const decade = decadeGenre(year);
  const list = new Set(genres.split(/\s+/).filter(Boolean));
  if (decade) list.add(decade);
  return {
    id: `${slug(artist)}__${slug(title)}`,
    title,
    artist,
    releaseYear: year,
    genres: [...list],
    audioProvider: 'itunes',
    audioId: null,
    duration: 30,
    available: true,
    aliases: extra?.aliases,
    review: extra?.review,
  };
}

/** Eingebaute Bibliothek (dedupliziert nach ID). */
export const SONGS: Song[] = (() => {
  const seen = new Set<string>();
  const out: Song[] = [];
  for (const row of [...ROWS, ...OLDIES_ROWS, ...EIGHTIES_NINETIES_ROWS, ...RECENT_ROWS]) {
    const song = toSong(row);
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    out.push(song);
  }
  return out;
})();

/** Gibt Songs mit unbekannten Genre-IDs zurück (für Tests/Skripte). */
export function findInvalidGenres(songs: Song[]): { id: string; genre: string }[] {
  const bad: { id: string; genre: string }[] = [];
  for (const s of songs) for (const g of s.genres) if (!GENRE_IDS.has(g)) bad.push({ id: s.id, genre: g });
  return bad;
}
