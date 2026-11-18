// Korb – Rezept aus einem Link lesen. Sucht schema.org/Recipe in JSON-LD (Chefkoch, Lecker, Kitchen Stories, die meisten Blogs).
// Aufruf nur mit gültiger Anmeldung (Supabase prüft das JWT automatisch).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

const PRIVATE_HOST = /^(localhost|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[|::1)|\.(local|internal)$/i;

function decode(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

// deno-lint-ignore no-explicit-any
function walk(node: any, depth = 0): any {
  if (!node || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = walk(n, depth + 1); if (r) return r; }
    return null;
  }
  if (typeof node === 'object') {
    const t = node['@type'];
    if ((Array.isArray(t) ? t : [t]).includes('Recipe')) return node;
    for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
      if (node[k]) { const r = walk(node[k], depth + 1); if (r) return r; }
    }
  }
  return null;
}

function findRecipe(html: string) {
  const re = /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const found = walk(JSON.parse(m[1].trim().replace(/^<!--|-->$/g, '')));
      if (found) return found;
    } catch (_) { /* nächsten Block probieren */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405);
  let url: URL;
  try {
    const body = await req.json();
    url = new URL(String(body.url || '').trim());
  } catch (_) {
    return json({ error: 'Das ist kein gültiger Link.' }, 400);
  }
  if (!/^https?:$/.test(url.protocol) || PRIVATE_HOST.test(url.hostname)) return json({ error: 'Dieser Link wird nicht unterstützt.' }, 400);

  let html = '';
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5',
      },
    });
    if (!res.ok) return json({ error: `Die Seite antwortet nicht (Status ${res.status}). Füge die Zutaten als Text ein.` }, 422);
    html = (await res.text()).slice(0, 4_000_000);
  } catch (_) {
    return json({ error: 'Die Seite ließ sich nicht laden. Füge die Zutaten als Text ein.' }, 422);
  }

  const recipe = findRecipe(html);
  const raw = recipe && (recipe.recipeIngredient || recipe.ingredients);
  if (!recipe || !Array.isArray(raw) || !raw.length) {
    return json({ error: 'Auf dieser Seite steht kein lesbares Rezept. Füge die Zutaten als Text ein.' }, 422);
  }
  return json({
    title: decode(String(recipe.name || 'Rezept')).slice(0, 80),
    yield: recipe.recipeYield ?? null,
    ingredients: raw.map((s: unknown) => decode(String(s))).filter(Boolean).slice(0, 60),
    source: url.hostname,
  });
});
