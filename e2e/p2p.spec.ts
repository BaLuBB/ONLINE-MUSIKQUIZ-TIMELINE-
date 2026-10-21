import { expect, test, type Page } from '@playwright/test';
import { SONGS } from '../supabase/functions/_shared/songs.ts';

const byId = new Map(SONGS.map((s) => [s.id, s]));

/** Test-Zugriff auf den Host-Speicher (nur im P2P-Modus liegt das Geheimnis im Host-Browser). */
async function currentSongId(host: Page): Promise<string | null> {
  return host.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith('timeline.local.room.')) return JSON.parse(localStorage.getItem(k)!).secret.current?.songId ?? null;
    }
    return null;
  });
}

test('zwei „Geräte“ (getrennte Kontexte) spielen über Direktverbindung eine ganze Partie', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext(); // eigener Speicher, kein BroadcastChannel/localStorage-Teilen
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const errors: string[] = [];
  for (const p of [host, guest]) p.on('pageerror', (e) => errors.push(e.message));

  await host.goto('/');
  await host.getByRole('button', { name: 'Spiel erstellen' }).click();
  await host.getByLabel('Dein Name').fill('Anna');
  await host.getByRole('button', { name: 'Lobby erstellen' }).click();
  await host.waitForSelector('.code-display');
  const code = (await host.locator('.code-display').innerText()).replace(/\s/g, '');
  await expect(host.getByText('Lass diese Seite geöffnet')).toBeVisible();
  while ((await host.locator('.stepper output').nth(1).innerText()) !== '3') {
    await host.getByRole('button', { name: 'Zielkarten verringern' }).click();
  }

  // Falscher Code → verständliche Meldung
  await guest.goto('/');
  await guest.getByRole('button', { name: 'Spiel beitreten' }).click();
  await guest.getByLabel('Dein Name').fill('Ben');
  await guest.getByLabel('Raumcode').fill('ZZZZZZ');
  await guest.getByRole('button', { name: 'Beitreten', exact: true }).click();
  await expect(guest.getByRole('alert')).toContainText('Diesen Raum gibt es nicht', { timeout: 20_000 });

  // Richtiger Code → beide sehen dieselbe Lobby
  await guest.getByLabel('Raumcode').fill(code.toLowerCase());
  await guest.getByRole('button', { name: 'Beitreten', exact: true }).click();
  await guest.waitForSelector('.code-display', { timeout: 20_000 });
  await expect(host.locator('.player-row')).toHaveCount(2);
  await expect(guest.locator('.player-row')).toHaveCount(2);
  await expect(guest.getByText('Warte darauf, dass der Host das Spiel startet')).toBeVisible();

  // Host ändert ein Genre → Gast sieht es
  await host.getByRole('button', { name: /^Jazz/ }).click();
  await expect(guest.locator('.chip', { hasText: 'Jazz' })).toBeVisible({ timeout: 8000 });

  // Gast lädt neu und bleibt im Raum
  await guest.reload();
  await expect(guest.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });

  await host.getByRole('button', { name: 'Spiel starten' }).click();
  await expect(guest.locator('.stage')).toBeVisible();

  const pages = [host, guest];
  let secrecyChecked = false;
  let finished = false;
  for (let turn = 0; turn < 30 && !finished; turn++) {
    let active: Page | null = null;
    let other: Page | null = null;
    for (let t = 0; t < 100 && !active; t++) {
      for (let i = 0; i < 2; i++) {
        if (await pages[i].getByRole('button', { name: 'Karte ziehen' }).isVisible()) {
          active = pages[i];
          other = pages[1 - i];
        }
      }
      if (!active && (await host.getByText('Wir haben einen Gewinner!').isVisible())) {
        finished = true;
        break;
      }
      if (!active) await host.waitForTimeout(100);
    }
    if (!active || !other) break;

    await active.getByRole('button', { name: 'Karte ziehen' }).click();
    await expect(active.locator('.audio-panel')).toBeVisible({ timeout: 15_000 });
    const song = byId.get((await currentSongId(host))!)!;

    if (!secrecyChecked) {
      // Der Gast-Browser erfährt Titel/Interpret der gezogenen Karte nie vor dem Aufdecken
      await expect(other.locator('.listening')).toBeVisible();
      const hay = JSON.stringify(await other.evaluate(() => [document.body.innerText, JSON.stringify(sessionStorage), JSON.stringify(localStorage)]));
      expect(hay).not.toContain(song.title);
      secrecyChecked = true;
    }

    const years = await active.locator('.timeline-scroll .tl-item .card-year').allInnerTexts();
    let pos = 0;
    while (pos < years.length && Number(years[pos]) < song.releaseYear) pos++;
    await active.locator('.slot').nth(pos).click();
    await active.getByRole('button', { name: 'Karte platzieren' }).click();

    const win = active.getByText('Wir haben einen Gewinner!');
    const next = active.getByRole('button', { name: 'Weiter' });
    await expect(win.or(next)).toBeVisible({ timeout: 15_000 });
    if (await win.isVisible()) {
      finished = true;
      break;
    }
    await next.click();
  }

  await expect(host.getByRole('heading', { name: 'Wir haben einen Gewinner!' })).toBeVisible({ timeout: 15_000 });
  await expect(guest.getByRole('heading', { name: 'Wir haben einen Gewinner!' })).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('Host lädt die Seite mitten im Spiel neu: Raum und Mitspieler bleiben erhalten', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await host.goto('/');
  await host.getByRole('button', { name: 'Spiel erstellen' }).click();
  await host.getByLabel('Dein Name').fill('Anna');
  await host.getByRole('button', { name: 'Lobby erstellen' }).click();
  await host.waitForSelector('.code-display');
  const code = (await host.locator('.code-display').innerText()).replace(/\s/g, '');
  await guest.goto(`/?code=${code}`);
  await guest.getByLabel('Dein Name').fill('Ben');
  await guest.getByRole('button', { name: 'Beitreten', exact: true }).click();
  await guest.waitForSelector('.code-display', { timeout: 20_000 });
  await host.getByRole('button', { name: 'Spiel starten' }).click();
  await expect(guest.locator('.stage')).toBeVisible();

  await host.reload();
  await expect(host.locator('.stage')).toBeVisible({ timeout: 40_000 });
  await expect(host.locator('.pcard')).toHaveCount(2);
  // Der Gast verbindet sich automatisch neu und sieht weiter das Spiel
  await expect(guest.locator('.pcard')).toHaveCount(2, { timeout: 40_000 });
  await expect(guest.locator('.stage')).toBeVisible();
});
