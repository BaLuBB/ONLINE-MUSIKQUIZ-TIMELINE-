import { expect, test, type Page } from '@playwright/test';
import { SONGS } from '../supabase/functions/_shared/songs.ts';

const byId = new Map(SONGS.map((s) => [s.id, s]));

/** Test-Zugriff: Im lokalen Modus liegt das Geheimnis im localStorage (nur dort möglich). */
async function currentSongId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith('timeline.local.room.')) return JSON.parse(localStorage.getItem(k)!).secret.current?.songId ?? null;
    }
    return null;
  });
}

async function createRoom(page: Page, name: string, targetCards = 3) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Spiel erstellen' }).click();
  await page.getByLabel('Dein Name').fill(name);
  await page.getByRole('button', { name: 'Lobby erstellen' }).click();
  await page.waitForSelector('.code-display');
  const code = (await page.locator('.code-display').innerText()).replace(/\s/g, '');
  // Zielkarten über die Lobby senken, damit der Test kurz bleibt
  while (targetCards < 10 && (await page.locator('.stepper output').nth(1).innerText()) !== String(targetCards)) {
    await page.getByRole('button', { name: 'Zielkarten verringern' }).click();
  }
  await expect(page.locator('.stepper output').nth(1)).toHaveText(String(targetCards));
  return code;
}

async function join(page: Page, code: string, name: string) {
  await page.goto(`/?code=${code}`);
  await page.getByLabel('Dein Name').fill(name);
  await page.getByRole('button', { name: 'Beitreten', exact: true }).click();
  await page.waitForSelector('.code-display');
}

test.describe('Lobby', () => {
  test('Startseite, Erstellen, Beitreten per Link, gemeinsamer Lobby-Zustand', async ({ context }) => {
    const host = await context.newPage();
    await host.goto('/');
    await expect(host.getByRole('heading', { level: 1 })).toContainText('Musik. Erinnerungen.');
    await expect(host.getByRole('button', { name: 'Spiel erstellen' })).toBeVisible();
    await expect(host.getByRole('button', { name: 'Spiel beitreten' })).toBeVisible();

    const code = await createRoom(host, 'Anna');
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const guest = await context.newPage();
    await join(guest, code.toLowerCase(), 'Ben');
    await expect(host.locator('.player-row')).toHaveCount(2);
    await expect(guest.locator('.player-row')).toHaveCount(2);
    await expect(guest.getByText('Warte darauf, dass der Host das Spiel startet')).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Spiel starten' })).toHaveCount(0);

    // Host ändert Genre → Gast sieht die Änderung
    await host.getByRole('button', { name: /^Jazz/ }).click();
    await expect(guest.locator('.chip', { hasText: 'Jazz' })).toBeVisible({ timeout: 5000 });
  });

  test('ungültiger Code zeigt eine verständliche Fehlermeldung', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Spiel beitreten' }).click();
    await page.getByLabel('Dein Name').fill('Ben');
    await page.getByLabel('Raumcode').fill('ZZZZZZ');
    await page.getByRole('button', { name: 'Beitreten', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Diesen Raum gibt es nicht');
  });

  test('Spieler verlässt die Lobby → Liste aktualisiert sich', async ({ context }) => {
    const host = await context.newPage();
    const code = await createRoom(host, 'Anna');
    const guest = await context.newPage();
    await join(guest, code, 'Ben');
    await expect(host.locator('.player-row')).toHaveCount(2);
    await guest.getByRole('button', { name: 'Lobby verlassen' }).click();
    await expect(host.locator('.player-row')).toHaveCount(1);
  });
});

test.describe('Spiel', () => {
  test('vollständige Partie bis zum Siegerpodest; Geheimhaltung der Karte', async ({ context }, info) => {
    const host = await context.newPage();
    const code = await createRoom(host, 'Anna', 3);
    const guest = await context.newPage();
    await join(guest, code, 'Ben');
    await expect(host.locator('.player-row')).toHaveCount(2);
    await host.getByRole('button', { name: 'Spiel starten' }).click();
    await expect(guest.locator('.stage')).toBeVisible();

    const pages = [host, guest];
    let finished = false;
    let checkedSecrecy = false;
    for (let turn = 0; turn < 40 && !finished; turn++) {
      const drawBtn = pages.map((p) => p.getByRole('button', { name: 'Karte ziehen' }));
      let active: Page | null = null;
      let other: Page | null = null;
      for (let t = 0; t < 50 && !active; t++) {
        for (let i = 0; i < 2; i++) {
          if (await drawBtn[i].isVisible()) {
            active = pages[i];
            other = pages[1 - i];
          }
        }
        if (!active) {
          if (await host.getByText('Wir haben einen Gewinner!').isVisible()) {
            finished = true;
            break;
          }
          await host.waitForTimeout(100);
        }
      }
      if (finished || !active || !other) break;

      await active.getByRole('button', { name: 'Karte ziehen' }).click();
      await expect(active.locator('.audio-panel')).toBeVisible();
      const songId = (await currentSongId(active))!;
      const song = byId.get(songId)!;

      // Geheimhaltung: weder aktiver noch anderer Spieler sieht den Titel vor dem Aufdecken
      if (!checkedSecrecy) {
        await expect(other.locator('.listening')).toBeVisible();
        for (const p of pages) {
          const text = await p.locator('body').innerText();
          expect(text).not.toContain(song.title);
        }
        checkedSecrecy = true;
      }

      // Richtige Position anhand der sichtbaren Jahre bestimmen
      const years = await active.locator('.timeline-scroll .tl-item .card-year').allInnerTexts();
      let pos = 0;
      while (pos < years.length && Number(years[pos]) < song.releaseYear) pos++;
      await active.locator('.slot').nth(pos).click();
      await active.getByRole('button', { name: 'Karte platzieren' }).click();

      const win = active.getByText('Wir haben einen Gewinner!');
      const next = active.getByRole('button', { name: 'Weiter' });
      await expect(win.or(next)).toBeVisible();
      if (await win.isVisible()) {
        finished = true;
        break;
      }
      await expect(active.locator('.result-ok')).toBeVisible();
      await next.click();
    }

    await expect(host.getByRole('heading', { name: 'Wir haben einen Gewinner!' })).toBeVisible();
    await expect(guest.getByRole('heading', { name: 'Wir haben einen Gewinner!' })).toBeVisible();
    await expect(host.locator('.podium-slot')).toHaveCount(2);
    await expect(host.locator('.podium-slot.place-1')).toContainText('Anna');
    await expect(host.getByRole('button', { name: 'Noch einmal spielen' })).toBeEnabled();
    await expect(guest.getByRole('button', { name: 'Noch einmal spielen' })).toBeDisabled();
    await host.waitForTimeout(1500);
    await host.screenshot({ path: info.outputPath(`podium-${info.project.name}.png`) });

    // Revanche: gleiche Spieler, frischer Zustand
    await host.getByRole('button', { name: 'Noch einmal spielen' }).click();
    await expect(guest.locator('.stage')).toBeVisible();
    await expect(guest.locator('.pcard').first()).toContainText('0/3');
  });

  test('Falsche Platzierung wird erkannt, Fortschritt bleibt', async ({ context }) => {
    const host = await context.newPage();
    const code = await createRoom(host, 'Anna', 5);
    const guest = await context.newPage();
    await join(guest, code, 'Ben');
    await host.getByRole('button', { name: 'Spiel starten' }).click();
    await expect(host.getByRole('button', { name: 'Karte ziehen' })).toBeVisible();
    await host.getByRole('button', { name: 'Karte ziehen' }).click();
    const song = byId.get((await currentSongId(host))!)!;
    const start = Number(await host.locator('.timeline-scroll .card-year').first().innerText());
    // Bewusst falsch: Karte vor die Startkarte, wenn sie neuer ist – sonst dahinter
    const wrongPos = song.releaseYear > start ? 0 : 1;
    if (song.releaseYear === start) test.skip(true, 'Gleiches Jahr – jede Position ist richtig');
    await host.locator('.slot').nth(wrongPos).click();
    await host.getByRole('button', { name: 'Karte platzieren' }).click();
    await expect(host.locator('.result-bad')).toBeVisible();
    await expect(host.locator('.pcard').first()).toContainText('0/5');
    await expect(host.locator('.tl-item')).toHaveCount(1);
  });
});

test.describe('Responsive', () => {
  test('kein horizontaler Überlauf auf Start, Lobby und Spiel', async ({ context }) => {
    const host = await context.newPage();
    const noOverflow = async (p: Page) => {
      const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(o).toBeLessThanOrEqual(0);
    };
    await host.goto('/');
    await noOverflow(host);
    const code = await createRoom(host, 'Anna');
    await noOverflow(host);
    const guest = await context.newPage();
    await join(guest, code, 'Ben');
    await host.getByRole('button', { name: 'Spiel starten' }).click();
    await expect(host.locator('.stage')).toBeVisible();
    await noOverflow(host);
    await noOverflow(guest);
  });
});
