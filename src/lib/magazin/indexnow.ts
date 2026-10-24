// KIN-6649 — IndexNow-Meldung neuer Magazin-URLs (Bing, Yandex, Seznam, Naver …).
//
// Der Schlüssel ist laut Protokoll öffentlich: er liegt als Datei unter
// public/<schlüssel>.txt und beweist damit, dass die Meldung von der Domain kommt.
// Google nimmt an IndexNow nicht teil; der frühere Sitemap-Ping
// (google.com/ping?sitemap=…) ist seit Ende 2023 abgeschaltet — Google liest die
// Sitemap über die Search Console (robots.txt verweist darauf).

export const INDEXNOW_KEY = "597d4aa96782fa047e989bbfb058dab0";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export type IndexNowErgebnis = { gemeldet: string[]; status: number | null; fehler?: string };

export function indexNowPayload(siteUrl: string, urls: string[]) {
  const host = new URL(siteUrl).host;
  return { host, key: INDEXNOW_KEY, keyLocation: `${siteUrl}/${INDEXNOW_KEY}.txt`, urlList: urls };
}

export async function meldeIndexNow(
  siteUrl: string,
  urls: string[],
  fetchFn: typeof fetch = fetch,
): Promise<IndexNowErgebnis> {
  if (urls.length === 0) return { gemeldet: [], status: null };
  try {
    const res = await fetchFn(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(indexNowPayload(siteUrl, urls)),
    });
    // 200 = angenommen, 202 = angenommen, Schlüssel wird noch geprüft.
    return res.ok ? { gemeldet: urls, status: res.status } : { gemeldet: [], status: res.status, fehler: await res.text() };
  } catch (e) {
    return { gemeldet: [], status: null, fehler: e instanceof Error ? e.message : String(e) };
  }
}
