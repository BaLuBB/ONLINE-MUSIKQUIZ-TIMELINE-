# TIMELINE – Online-Musikquiz

Ein Multiplayer-Musikquiz nach dem Prinzip von Hitster: Songs erkennen, die verdeckte Karte an der richtigen Stelle des eigenen Zeitstrahls einordnen, Titel erraten, gewinnen. Eigenständiges Design (kein Hitster-Material), React + TypeScript + Vite im Frontend, Supabase (Postgres, Realtime, Edge Functions, anonyme Auth) im Backend.

## Ehrlicher Status

| Bereich | Stand |
| --- | --- |
| Spiellogik (`supabase/functions/_shared/engine.ts`) | ✅ implementiert, durch Unit-/Server-Tests abgedeckt |
| Server-Kern (Beitritt, Aktionen, Rate-Limits, Idempotenz, Host-Übergabe) | ✅ implementiert und getestet (In-Memory-Store **und** echtes Postgres 16) |
| Datenbank, RLS, Postgres-Funktionen | ✅ Migration läuft auf Postgres 16; RLS/Rechte/CAS in `tests/pg.integration.test.ts` geprüft – **mit nachgebildeten Supabase-Rollen**, nicht auf einem echten Supabase-Projekt |
| Frontend (Start, Lobby, Spiel, Podest, responsiv, dunkler Modus) | ✅ im Browser per Playwright (Desktop + Smartphone-Viewport) getestet |
| Direktverbindung (P2P, mehrere Geräte ohne eigenes Backend) | ✅ getestet mit zwei getrennten Browser-Kontexten über echtes WebRTC und lokalen Signalserver; ⚠️ **nicht** über das echte Internet/Mobilfunk-NAT und den öffentlichen PeerJS-Broker ausprobiert |
| Lokaler Testmodus (nur ein Browser, mehrere Tabs) | ✅ funktioniert; kein Mehrgeräte-Spiel |
| Echter Online-Betrieb über Supabase (Edge Function, Realtime, Anonymous Auth) | ⚠️ vollständig implementiert, aber **nicht gegen ein echtes Supabase-Projekt getestet** (in der Entwicklungsumgebung gab es keinen Zugang). Erst nach der Einrichtung unten ist es ein Online-Spiel. |
| Audio über iTunes-Vorschauen | ⚠️ implementiert, **nicht live getestet** (Netzwerk der Entwicklungsumgebung gesperrt). Die Treffer-Zuordnung ist unit-getestet, die echte Trefferquote ist unbekannt. Ohne Treffer fällt das Spiel auf einen klar gekennzeichneten Demo-Ton zurück. |
| Musikbibliothek (290 Songs) | ⚠️ Jahre stammen aus der Startliste bzw. Wissen und sind **nicht extern verifiziert**; unsichere Einträge tragen `review` (siehe „Musikbibliothek“) |

## Spielen auf mehreren Geräten ohne eigenes Backend: Direktverbindung (P2P)

Der Host erstellt das Spiel und bekommt einen Raumcode; die anderen treten auf ihren Geräten mit dem Code (oder Einladungslink) bei. Der **Browser des Hosts ist der Server** (Spiellogik, Geheimnisse, Raum); die Mitspieler verbinden sich per WebRTC ([PeerJS](https://peerjs.com)) direkt mit ihm. Der öffentliche PeerJS-Cloud-Broker vermittelt nur den Verbindungsaufbau. So läuft die GitHub-Pages-Seite.

Grenzen, die man kennen muss:
* Der Host muss die Seite **geöffnet und aktiv** lassen (Smartphone-Display aus oder App-Wechsel kann die Verbindung kappen). Lädt der Host neu, stellt er den Raum wieder her und die Mitspieler verbinden sich automatisch erneut. Verlässt der Host den Raum, endet das Spiel für alle (kein Host-Wechsel).
* Der Host-Browser kennt alle Geheimnisse; wer technisch versiert ist, kann als Host schummeln. Für Spiele unter Freunden gedacht; für manipulationssichere Spiele ist das Supabase-Backend da.
* Manche Netze (Firmen-/Uni-WLAN, strenge Mobilfunk-NAT) blockieren WebRTC. Es werden freie STUN-/TURN-Server von PeerJS genutzt; eigene lassen sich über `VITE_ICE_SERVERS` eintragen, ein eigener Signalserver über `VITE_PEER_HOST` (`npm run peer-server` startet einen lokalen).
* Der öffentliche PeerJS-Broker ist ein kostenloser Gemeinschaftsdienst ohne Verfügbarkeitszusage.

Test: `npm run test:e2e:p2p` (startet einen lokalen Signalserver; zwei getrennte Browser-Kontexte spielen eine ganze Partie).

## Schnellstart (lokaler Testmodus, ohne Backend)

```bash
npm install
npm run dev          # http://localhost:5173
```

Ohne Supabase-Konfiguration startet der **lokale Testmodus** (gelbes Badge „Lokaler Testmodus“). Räume liegen im `localStorage`; jeder Browser-Tab ist ein eigener Spieler. Öffne zwei Tabs, erstelle im ersten ein Spiel und tritt im zweiten über den Einladungslink bei. Die Töne sind echte 30-s-Vorschauen über die iTunes Search API (direkt im Browser abgefragt), mit automatischem Rückfall auf synthetische Demo-Töne, falls kein Treffer oder kein Netzwerk; `VITE_LOCAL_AUDIO=demo` erzwingt nur Demo-Töne. Der Modus ist nicht manipulationssicher (das Geheimnis liegt im selben Browser) und kein Online-Spiel.

Produktions-Builds (`npm run build`) enthalten den lokalen Modus und die Songbibliothek **nicht**; ohne Supabase-Konfiguration zeigen sie einen Hinweis „Backend nicht konfiguriert“. (`VITE_ENABLE_LOCAL_MODE=true` baut ihn bewusst ein.)

## Tests

```bash
npm test                 # Vitest: Engine, Server-Kern, Bibliothek (66 Tests)
npm run typecheck
npm run test:e2e         # Playwright gegen den lokalen Testmodus (Desktop + Mobil)
npm run test:e2e:p2p     # Playwright: zwei „Geräte“ über Direktverbindung (lokaler Signalserver)
npm run check:songs      # Konsistenz der Bibliothek; mit  -- --musicbrainz  Jahre gegen MusicBrainz prüfen
```

* Playwright nutzt ein installiertes Chromium. Mit `npx playwright install chromium` herunterladen oder `PW_CHROMIUM_PATH=/pfad/zu/chrome` setzen.
* **Postgres-Integrationstest** (optional): `TEST_DATABASE_URL=postgres://… npx vitest run tests/pg.integration.test.ts` gegen eine leere Test-Datenbank. Dort müssen vorab die Rollen `anon`, `authenticated`, `service_role`, das Schema `auth` mit `auth.uid()` (liest `request.jwt.claim.sub`) und eine Publikation `supabase_realtime` existieren (auf `supabase start` ist das gegeben), dann die Migration und `seed.sql` einspielen.

Abgedeckt u. a.: Raum erstellen, Code-Format, Beitritt mit zweitem Client, ungültiger Code, Mehrfach-Genres (Vereinigungsmenge ohne Duplikate), Ziehen, Geheimhaltung bis zum Aufdecken, richtige/falsche Platzierung, gleiche Jahre, Titelprüfung, Bonus nur einmal, doppelte/gleichzeitige Aktionen, Fortschritt, Sieg bei der zehnten Karte, konkurrierende Aktionen, Wiederverbinden, Neustart, Host-Übergabe, Rate-Limit.

## Supabase einrichten (für das echte Online-Spiel)

1. **Projekt anlegen** auf [supabase.com](https://supabase.com) (oder lokal `supabase start`).
2. **Anonyme Anmeldung aktivieren**: Authentication → Sign In / Providers → *Allow anonymous sign-ins*. (Lokal: steht in `supabase/config.toml`.)
3. **Datenbank**: Inhalt von `supabase/migrations/0001_init.sql` im SQL-Editor ausführen (oder `supabase db push`). Optional für `SONGS_SOURCE=db`: `npm run gen:seed` und `supabase/seed.sql` ausführen.
4. **Edge Function deployen**:
   ```bash
   supabase link --project-ref <REF>
   supabase functions deploy game
   supabase secrets set AUDIO_PROVIDER=itunes ITUNES_COUNTRY=DE ALLOWED_ORIGIN=https://deine-domain.tld
   ```
   `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase der Function automatisch bereit – der Service-Key kommt nie in den Browser.
5. **Aufräumen** (empfohlen): verlassene Räume stündlich löschen, z. B. mit pg_cron:
   ```sql
   select cron.schedule('timeline-cleanup', '0 * * * *', $$select public.cleanup_expired_rooms('6 hours')$$);
   ```
   Zusätzlich verwirft der Server abgelaufene Räume beim Zugriff.
6. **Frontend konfigurieren**: `.env` nach `.env.example` anlegen: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` (Project Settings → API; der *anon/publishable* Key, **nie** der service_role-Key).
7. **Prüfen**: `npm run dev`, zwei Geräte/Browser, Spiel erstellen, mit dem Code beitreten. Das Badge „Lokaler Testmodus“ darf nicht mehr erscheinen.

### Ohne Kommandozeile: per GitHub-Workflow einrichten

1. Auf [supabase.com](https://supabase.com) ein kostenloses Projekt anlegen (Datenbank-Passwort notieren) und unter *Authentication → Sign In / Providers* **Allow anonymous sign-ins** einschalten.
2. Im GitHub-Repo unter *Settings → Secrets and variables → Actions* eintragen: Secrets `SUPABASE_ACCESS_TOKEN` (supabase.com → Account → Access Tokens) und `SUPABASE_DB_PASSWORD`; Variables `SUPABASE_PROJECT_REF`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Unter *Actions* den Workflow **Supabase einrichten** starten (spielt Schema und Edge Function ein), danach **Pages** neu starten – die Seite nutzt dann das echte Online-Backend statt der Direktverbindung.

(Der Workflow ist **nicht** gegen ein echtes Supabase-Projekt getestet.)

### Frontend veröffentlichen

**GitHub Pages (Workflow `.github/workflows/pages.yml`):** Nach dem Merge nach `main` und einmal Settings → Pages → *Source: GitHub Actions* erscheint die Seite unter `https://<user>.github.io/<repo>/`. Ohne Repository-Variablen wird die Demo im lokalen Testmodus veröffentlicht; setzt du unter Settings → Secrets and variables → Actions → *Variables* `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`, baut der Workflow den echten Online-Build. Die Supabase-Domain-Einstellungen (Site URL, `ALLOWED_ORIGIN`) entsprechend auf `https://<user>.github.io` setzen.

**Andere Hosts:**

`npm run build` erzeugt `dist/` (statisch). Auf Vercel, Netlify, Cloudflare Pages oder GitHub Pages hosten; die zwei `VITE_*`-Variablen im Build setzen. In Supabase unter Authentication → URL Configuration die Domain als *Site URL* eintragen und `ALLOWED_ORIGIN` der Function auf dieselbe Domain setzen. Einladungslinks haben die Form `https://deine-domain.tld/?code=ABC123`.

## Architektur

```
Browser (React)                     Supabase
 ├─ GameProvider  ──invoke('game')──▶ Edge Function game  (service_role)
 │   · Aktionen, Retry, Idempotenz       └─ Server-Kern → Engine (reine Regeln)
 │                                           └─ RPC commit_room (CAS auf `version`)
 ├─ Realtime (postgres_changes) ◀──── rooms.state  (öffentlicher Zustand, RLS: nur Mitglieder)
 ├─ Presence (Verbindungsstatus)
 └─ Audio-Controller (nur aktiver Spieler)      room_secrets (Deck, aktuelle Karte – für Clients gesperrt)
```

* **Eine Quelle der Wahrheit für Regeln:** `supabase/functions/_shared/` (reines TypeScript) wird von der Edge Function, dem lokalen Modus, den Tests und – nur für Typen/Hilfsfunktionen – vom Frontend genutzt (Alias `@engine`).
* **Autoritativer Zustand:** Phasen `waiting → starting → playing ⇄ resolving_turn → finished` mit festgelegten Übergängen (`ALLOWED_TRANSITIONS`). Jede Aktion läuft durch `reduce()`; Schreiben per Compare-and-Swap auf `rooms.version`. Konflikte werden wiederholt, gleichzeitige Gegenaktionen scheitern deterministisch.
* **Öffentlich vs. privat:** `rooms.state` enthält nur Aufgedecktes (Zeitstrahlen, Ergebnis des letzten Zugs) und eine opake Karten-ID. Deck, aktuelle Karte und Tipp liegen in `room_secrets`. Songtitel, Interpret und Jahr einer gezogenen Karte verlassen den Server erst nach der Platzierung.
* **Identität:** anonyme Supabase-Sitzung (JWT). Die Zuordnung Sitzung ↔ Spieler-ID liegt serverseitig; eine Spieler-ID allein berechtigt zu nichts. Raumcodes (6 Zeichen, ~1 Mrd. Kombinationen, `crypto`-Zufall) sind nur Beitrittsschlüssel – Lesen/Schreiben prüft immer die Mitgliedschaft (RLS + Server).
* **Missbrauchsschutz:** Token-Bucket-Rate-Limits pro Sitzung (best effort pro Function-Instanz), Raumlimit pro Stunde (DB-gestützt), Beitrittsversuche gedrosselt, Aktions-Whitelist, Größenlimit.
* **Reconnect:** Sitzung wird lokal gemerkt und beim Laden per `sync` wiederhergestellt; Heartbeat alle 10 s, Polling-Fallback alle 5 s; Aktionen werden mit derselben Aktions-ID wiederholt (idempotent). Der Server übergibt die Host-Rolle an den am längsten anwesenden verbundenen Spieler, wenn der Host 2 Minuten keinen Heartbeat sendet (großzügig, weil Mobilbrowser im Hintergrund pausieren), und überspringt Züge getrennter Spieler.

## Spielregeln und Abweichungen

Recherchiert anhand öffentlich zugänglicher Händler-/Herstellerbeschreibungen (die vollständige Originalanleitung lag nicht vor – bitte mit der Anleitung deiner Edition abgleichen):

**Übernommen (Grundregeln):** jeder Spieler hat einen eigenen Zeitstrahl und startet mit einer aufgedeckten Karte; der Spieler am Zug zieht eine verdeckte Karte, hört den Song und ordnet ihn ein; richtig → bleibt, falsch → wird abgelegt; wer zuerst 10 Karten erreicht, gewinnt.

**Nicht übernommen:** die Hitster-Plättchen (Song überspringen, Karten der anderen „klauen“, Karten kaufen) und der Kooperativmodus. Das ist als spätere Hausregel vorgesehen, aber nicht implementiert.

**Digitale Zusätze / Hausregeln (klar getrennt von den Grundregeln):**
* **Titel-Bonus** (an/aus): +1 Punkt für den richtig erratenen Titel, einmal pro Karte, einen Versuch. Der Bonus zählt **nicht** als Karte und nicht für den Sieg. Er wird auch bei falscher Platzierung vergeben. Ob der Tipp stimmt, sieht man erst beim Aufdecken.
* **Wiederholen** (an/aus, begrenzbar). **Schwierigkeit** setzt Presets (Einfach: unbegrenzt, Normal: 3, Schwer: 1 Wiederholung). **Zeitraum**-Filter.
* **Zählweise des Ziels:** Standard ist „X korrekt platzierte Karten“ *zusätzlich* zur Startkarte (so lautete die Vorgabe). Die Option „Startkarte zählt zum Ziel“ stellt die offizielle Zählung (10 Karten im Zeitstrahl inkl. Startkarte) ein.

**Weitere Festlegungen**
* **Gleiche Jahre** sind austauschbar: Eine Karte ist korrekt, wenn `Jahr(links) ≤ Jahr(Karte) ≤ Jahr(rechts)`.
* **Titelprüfung:** Groß/Klein, Akzente, Satzzeichen und Leerraum werden normalisiert; Klammerzusätze („(Da Ba Dee)“) und hinterlegte `aliases` sind erlaubt; deutsche Umlaut-Schreibweisen (`ä`/`ae`/`a`) werden verstanden; ein einzelner Tippfehler ist erst ab 9 Zeichen erlaubt. Teiltreffer zählen nicht.
* **Sieg:** Der Gewinner wird serverseitig im Moment der Siegbedingung festgelegt; das Spiel endet sofort. Die serielle Reihenfolge ergibt sich aus der Versionsprüfung (der Zug gehört immer genau einem Spieler).
* **Rangliste/Podest:** Gewinner zuerst, dann Fortschritt, Gesamtpunkte (Karten + Bonus), früherer Beitritt. Das Podest zeigt nur tatsächlich vorhandene Spieler. Ist das Deck leer, gewinnt der Führende; verlassen so viele Spieler das Spiel, dass weniger als zwei übrig sind, endet es „abgebrochen“ ohne Gewinner.
* **Songwiederholung:** Ein Song wird erst wieder gezogen, wenn Deck und Ablage erschöpft sind (abgelegte Karten werden dann neu gemischt). Vor dem Start warnt die Lobby bei zu kleiner Auswahl.
* **Beitritt:** nur vor dem Start. Wiedereintritt derselben Sitzung (Reload) ist jederzeit möglich.
* **Revanche:** „Noch einmal spielen“ startet mit denselben Spielern und Einstellungen eine neue Partie (neue Spiel-ID, Zähler null); frühere Ergebnisse stehen getrennt in `history`/`games`.

## Cover, Spielerfarben und Zugverlauf

Aufgedeckte Karten zeigen Titel, Interpret, Jahr und das **Cover** (iTunes Search API, vom Browser nach dem Aufdecken geholt, zwischengespeichert; ohne Treffer ein Platzhalter). Jeder Spieler hat eine **feste Farbe** (Spielerübersicht, Kartenrand im Zeitstrahl, Ergebnis). Der **Zugverlauf** unter dem Zeitstrahl zeigt allen Spielern die letzten Züge: wer es war, Cover/Titel, richtig oder falsch eingeordnet und den **Titel-Tipp** des Spielers samt Ergebnis. Die Cover-Abfrage ist wie die Audio-Auflösung nicht gegen die echte API getestet (Netzwerk gesperrt).

## Audio

Clients erhalten Audio nur als abspielbare Quelle für den **aktiven Spieler**; die Auflösung (Titel → Vorschau-URL) geschieht in der Edge Function, damit keine Netzwerkanfrage den Titel verrät. Die Wiedergabe läuft auf dem Gerät des aktiven Spielers; die anderen sehen „… hört zu“ (eine framegenaue Synchronisation aller Geräte ist bewusst kein Ziel).

* `AUDIO_PROVIDER=itunes` (Standard): 30-Sekunden-Vorschauen der Apple **iTunes Search API** (rechtlich vorgesehen für Vorschauen; Quelle wird im Player genannt, bitte die aktuellen Nutzungsbedingungen prüfen). Der Treffer wird per Titel/Interpret zugeordnet; ist keiner abspielbar, wird bis zu 3× eine andere Karte gezogen, danach ein gekennzeichneter Demo-Ton verwendet. Die Vorschau stoppt automatisch an der Zielposition.
* `AUDIO_PROVIDER=demo`: synthetische Testtöne (klar als „Demo-Ton“ markiert).
* **Spotify** ist bewusst nicht eingebunden: Es gibt keinen frei nutzbaren Volltrack-Player für beliebige Webseiten (Embeds sind je Track/Region/Gerät eingeschränkt, die Web-API liefert keine Streams). Keine Scraper, keine Downloads, keine ungeprüften MP3-URLs.
* **Weitere Anbieter:** serverseitig `AudioResolver` (`_shared/audio.ts`) implementieren und in `createResolver` registrieren; clientseitig bei Bedarf einen `PlaybackAdapter` (`src/audio/`) ergänzen. Fehler (Laden, Autoplay blockiert, Abbruch) landen immer in einem klaren Zustand mit „Erneut versuchen“.
* Autoplay: Direkt nach „Karte ziehen“ startet der Ton; blockiert der Browser das, erscheint „Jetzt abspielen“.

## Musikbibliothek

`supabase/functions/_shared/songs.ts` – kompaktes Zeilenformat `[Interpret, Titel, Jahr, 'genres', { aliases?, review? }]`. Jahrzehnt-Genres werden automatisch aus dem Jahr abgeleitet. Enthalten sind die 120 Songs der Startliste (das Duplikat Nr. 46 „Journey – Don’t Stop Believin’“ ist entfernt) plus Ergänzungen, damit **jedes** der 51 Genres mindestens 3 Songs hat (Test `deckt jedes Genre …`).

* `review` markiert Einträge, bei denen Album-/Single-Jahr abweichen oder die Angabe unsicher ist (derzeit 22). `npm run check:songs` listet sie; `-- --musicbrainz` gleicht alle Jahre mit MusicBrainz ab (benötigt Netzwerk, ca. 1 s pro Song, **in der Entwicklungsumgebung nicht ausgeführt**).
* Bei Neuauflagen gilt das ursprüngliche Jahr; Cover-Versionen (z. B. Whitney Houston – I Will Always Love You) sind als solche markiert.
* Erweitern: Zeile ergänzen, `npm run check:songs`, ggf. `npm run gen:seed` für die Tabelle `songs` (`SONGS_SOURCE=db`).
* Die Bibliothek wird **nicht** ins Frontend ausgeliefert.

## Datenschutz und Grenzen

* Gespeichert werden: anonyme Auth-ID (zufällig, kein Konto), Anzeigename (≤ 20 Zeichen, vom Nutzer gewählt), Spielstand/Ereignisse. Keine E-Mail-Adressen, keine Klarnamen, keine Tracker. Supabase selbst kann technische Logs (z. B. IP-Adressen) führen – siehe deren Datenschutzdokumentation und die Auftragsverarbeitung.
* Räume werden nach 6 Stunden Inaktivität gelöscht (inkl. Spieler, Geheimnisse, Partien, Ereignisse – Kaskade).
* Der Browser speichert lokal: Supabase-Sitzung, letzte Raum-ID (Wiedereintritt), Name, Lautstärke, Theme.
* Der Spielleiter-Name und alle Namen sind für alle Mitspieler sichtbar. Eingaben werden bereinigt; React gibt sie escaped aus.
* Grenzen: Rate-Limits der Function sind pro Instanz (best effort); gegen verteilte Angriffe schützt nur Infrastruktur (z. B. Supabase-/Cloudflare-Limits). Anonyme Sitzungen lassen sich beliebig neu erzeugen – das Raumlimit pro Sitzung ist daher eine Komfort-, keine harte Sperre (CAPTCHA für Anonymous Sign-ins in Supabase aktivierbar).

## Erweiterbarkeit

Eigene Playlists/Import (Songs aus Tabelle `songs`, `SONGS_SOURCE=db`), Benutzerprofile (anonyme Identität per Account verknüpfbar), Statistiken (`games`, `game_cards`, `events` werden bereits befüllt), weitere Schwierigkeitsgrade/Hausregeln (`Settings` + `engine.ts`), weitere Audioanbieter (siehe oben), private/öffentliche Räume und Mehrrunden-Modi (Zustand liegt versioniert in `rooms.state`).

## Projektstruktur

```
src/                    React-App (screens/, components/, backend/ Adapter, audio/, lib/, styles/)
supabase/functions/_shared/   Regeln, Server-Kern, Audio-Auflösung, Songs (geteilt)
supabase/functions/game/      Edge Function (HTTP, Auth)
supabase/migrations/          Schema, RLS, Postgres-Funktionen
tests/  e2e/  scripts/        Vitest, Playwright, Hilfsskripte
```
