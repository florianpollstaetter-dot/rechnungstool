// KIN-6527 — UID-Prüf-Formular (VIES) auf der Ratgeberseite /at/uid-nummer-pruefen.
//
// Läuft ohne Login (öffentliche Seite). Die Server-Route /api/at/uid-pruefen wird
// mit page.route gemockt, damit der Test nie den echten (oft ausgefallenen) VIES-
// Dienst trifft. Drei Zustände + Formatfehler + Handy-Viewport.
//
// Die Seite ist bis zur Freigabe durch den Editor (KIN-6528) ein Entwurf. Lokal:
//   AT_RATGEBER_ENTWUERFE=1 npx playwright test tests/e2e/specs/21-kin6527-*
// Ist die Seite nicht sichtbar (404), wird der Test übersprungen, nicht rot.
//
// Screenshots: tests/e2e/.artifacts/kin6527-uid-{gueltig,ungueltig,ausfall,handy}.png

import { expect, test, type Page } from "@playwright/test";

const SEITE = "/at/uid-nummer-pruefen";

function mockApi(page: Page, body: Record<string, unknown>, status = 200) {
  return page.route("**/api/at/uid-pruefen", async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function oeffne(page: Page) {
  const res = await page.goto(SEITE);
  test.skip(res?.status() === 404, "Ratgeberseite noch nicht veröffentlicht (AT_RATGEBER_ENTWUERFE=1 für Entwürfe)");
  await expect(page.getByTestId("uid-pruef-formular")).toBeVisible();
}

test("gültige AT-UID: grüner Kasten mit Name und Anschrift", async ({ page }) => {
  await oeffne(page);
  await mockApi(page, {
    status: "gueltig",
    uid: "ATU37675002",
    land: "AT",
    name: "Technische Universität Wien",
    adresse: "Karlsplatz 13\nAT-1040 Wien",
    geprueftAm: "2026-10-22T10:00:00.000Z",
  });
  await page.getByRole("textbox", { name: "UID-Nummer" }).fill("ATU37675002");
  await page.getByRole("button", { name: "UID prüfen" }).click();
  const kasten = page.getByTestId("uid-ergebnis-gueltig");
  await expect(kasten).toBeVisible();
  await expect(kasten).toContainText("Gültig: ATU37675002");
  await expect(kasten).toContainText("Technische Universität Wien");
  await expect(kasten).toContainText("Karlsplatz 13");
  await page.screenshot({ path: "tests/e2e/.artifacts/kin6527-uid-gueltig.png" });
});

test("ungültige UID: roter Kasten", async ({ page }) => {
  await oeffne(page);
  await mockApi(page, { status: "ungueltig", uid: "ATU99999999", land: "AT", geprueftAm: "2026-10-22T10:00:00.000Z" });
  await page.getByRole("combobox", { name: "Land" }).selectOption("AT");
  await page.getByRole("textbox", { name: "UID-Nummer" }).fill("U99999999");
  await page.getByRole("button", { name: "UID prüfen" }).click();
  await expect(page.getByTestId("uid-ergebnis-ungueltig")).toContainText("Ungültig: ATU99999999");
  await page.screenshot({ path: "tests/e2e/.artifacts/kin6527-uid-ungueltig.png" });
});

test("VIES-Ausfall: gelber Hinweis, kein Absturz, Formular bleibt bedienbar", async ({ page }) => {
  await oeffne(page);
  await mockApi(page, { status: "nicht_erreichbar", uid: "ATU12345678", land: "AT", geprueftAm: "2026-10-22T10:00:00.000Z" });
  await page.getByRole("textbox", { name: "UID-Nummer" }).fill("ATU12345678");
  await page.getByRole("button", { name: "UID prüfen" }).click();
  await expect(page.getByTestId("uid-ergebnis-nicht-erreichbar")).toContainText("nicht erreichbar");
  await expect(page.getByRole("button", { name: "UID prüfen" })).toBeEnabled();
  await page.screenshot({ path: "tests/e2e/.artifacts/kin6527-uid-ausfall.png" });
});

test("Formatfehler wird vor dem Absenden gemeldet und ist dem Feld zugeordnet", async ({ page }) => {
  await oeffne(page);
  let aufrufe = 0;
  await page.route("**/api/at/uid-pruefen", async (route) => { aufrufe++; await route.abort(); });
  const feld = page.getByRole("textbox", { name: "UID-Nummer" });
  await feld.fill("12345678");
  await page.getByRole("button", { name: "UID prüfen" }).click();
  const fehler = page.getByTestId("uid-pruef-formular").getByRole("alert");
  await expect(fehler).toContainText("Österreich");
  await expect(feld).toHaveAttribute("aria-invalid", "true");
  const beschriebenVon = await feld.getAttribute("aria-describedby");
  expect(beschriebenVon).toBeTruthy();
  expect(await fehler.getAttribute("id")).toBe(beschriebenVon);
  expect(aufrufe).toBe(0);
});

test("Land wird aus der Eingabe erkannt (DE…) und 429 freundlich gemeldet", async ({ page }) => {
  await oeffne(page);
  await mockApi(page, { fehler: "Zu viele Abfragen von deiner Verbindung. Bitte in ein paar Minuten noch einmal versuchen.", wartenSekunden: 120 }, 429);
  await page.getByRole("textbox", { name: "UID-Nummer" }).fill("DE123456789");
  await expect(page.getByRole("combobox", { name: "Land" })).toHaveValue("DE");
  await page.getByRole("button", { name: "UID prüfen" }).click();
  await expect(page.getByTestId("uid-pruef-formular").getByRole("alert")).toContainText("Zu viele Abfragen");
});

test("Handy: Formular passt in 375px Breite ohne horizontales Scrollen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await oeffne(page);
  const breite = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(breite).toBeLessThanOrEqual(375);
  const knopf = page.getByRole("button", { name: "UID prüfen" });
  const box = await knopf.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.getByTestId("uid-pruef-formular").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "tests/e2e/.artifacts/kin6527-uid-handy.png" });
});
