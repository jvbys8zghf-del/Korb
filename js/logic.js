// Korb – reine Logik ohne DOM und ohne Netzwerk. Wird im Browser und in den Node-Tests genutzt.
import { CATEGORIES, CATALOG_RAW } from './catalog.js';

export const DAY = 864e5;
export const CATS = CATEGORIES;
export const CAT_INDEX = Object.fromEntries(CATS.map((c, i) => [c.key, i]));
export const catName = (key) => (CATS[CAT_INDEX[key]] || CATS[CATS.length - 1]).name;

// ---------- Katalog ----------
export const norm = (s) => String(s).toLowerCase().normalize('NFC').replace(/[„“"'’]/g, '').replace(/\s+/g, ' ').trim();
const byName = new Map();
export const CATALOG = [];
CATALOG_RAW.trim().split('\n').forEach((line) => {
  const [name, emoji, cat, syn = '', flag = ''] = line.split('|');
  const entry = { name, emoji, cat, staple: flag === 's' };
  CATALOG.push(entry);
  byName.set(norm(name), { entry, exact: true });
  syn.split(',').filter(Boolean).forEach((s) => { if (!byName.has(norm(s))) byName.set(norm(s), { entry, exact: false }); });
});

function stems(w) {
  const out = [w];
  for (const suf of ['en', 'n', 'e', 's']) if (w.length > 4 && w.endsWith(suf)) out.push(w.slice(0, -suf.length));
  return out;
}
const deUml = (w) => w.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
function sameWord(a, b) {
  const sa = stems(deUml(a)), sb = new Set(stems(deUml(b)));
  return sa.some((x) => sb.has(x));
}

export function lookup(raw) {
  const n = norm(raw);
  if (byName.has(n)) return byName.get(n);
  for (const s of stems(n)) {
    if (byName.has(s)) return byName.get(s);
    for (const suf of ['n', 'en', 'e', 's']) if (byName.has(s + suf)) return byName.get(s + suf);
  }
  const words = n.split(/[\s-]+/).reverse();
  for (const w of words) for (const s of stems(w)) if (byName.has(s)) return { entry: byName.get(s).entry, exact: false };
  for (const [key, hit] of byName) if (key.length > 3 && n.endsWith(key)) return { entry: hit.entry, exact: false };
  return null;
}

export function search(q, limit = 6) {
  const n = norm(q);
  if (!n) return [];
  const seen = new Set(), res = [];
  for (const [key, hit] of byName) if (key.startsWith(n) && !seen.has(hit.entry.name)) { seen.add(hit.entry.name); res.push(hit.entry); }
  for (const [key, hit] of byName) {
    if (res.length >= limit * 2) break;
    if (key.includes(n) && !seen.has(hit.entry.name)) { seen.add(hit.entry.name); res.push(hit.entry); }
  }
  return res.slice(0, limit);
}

// ---------- Parser ----------
const UNITS = {
  g: 'g', gr: 'g', gramm: 'g', kg: 'kg', kilo: 'kg', ml: 'ml', l: 'l', liter: 'l',
  stk: 'Stk', stück: 'Stk', st: 'Stk', pck: 'Pck', pkg: 'Pck', packung: 'Pck', packungen: 'Pck', päckchen: 'Pck', pack: 'Pck',
  dose: 'Dose', dosen: 'Dose', flasche: 'Fl.', flaschen: 'Fl.', fl: 'Fl.', bund: 'Bund', becher: 'Becher',
  el: 'EL', tl: 'TL', zehe: 'Zehe', zehen: 'Zehe', glas: 'Glas', gläser: 'Glas', scheiben: 'Scheiben', scheibe: 'Scheiben',
  prise: 'Prise', netz: 'Netz', kiste: 'Kiste', kisten: 'Kiste', tüte: 'Tüte', beutel: 'Beutel', kopf: 'Kopf', schale: 'Schale',
};
const UNIT_RE = Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|');
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75 };
const NUM = String.raw`(\d+(?:[.,]\d+)?|\d+\/\d+|[½¼¾])`;
const RE_LEAD = new RegExp(String.raw`^${NUM}\s*(?:x|×)?\s*(?:(${UNIT_RE})\.?(?=\s|$))?\s*(.+)$`, 'i');
const RE_TRAIL = new RegExp(String.raw`^(.+?)\s+${NUM}\s*(?:x|×)?\s*(?:(${UNIT_RE})\.?)?$`, 'i');
const RE_UNIT_ONLY = new RegExp(String.raw`^(${UNIT_RE})\.?\s+(.+)$`, 'i');
export const SPLIT_RE = /\n|;|(?<!\d),|,(?!\d)|\s+und\s+|\s+&\s+/i;

function toNum(s) {
  if (FRAC[s] != null) return FRAC[s];
  if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return b ? a / b : null; }
  return parseFloat(s.replace(',', '.'));
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function parseSegment(seg) {
  const s = String(seg).replace(/^[\s\-–•*·▢☐□]+/, '').replace(/^\d+[.)]\s+/, '').trim();
  if (!s) return null;
  let qty = null, unit = null, name = s, m;
  if ((m = s.match(RE_LEAD)) && m[3]) { qty = toNum(m[1]); unit = m[2] ? UNITS[m[2].toLowerCase()] : null; name = m[3]; }
  else if ((m = s.match(RE_TRAIL))) { name = m[1]; qty = toNum(m[2]); unit = m[3] ? UNITS[m[3].toLowerCase()] : null; }
  else if ((m = s.match(RE_UNIT_ONLY))) { qty = 1; unit = UNITS[m[1].toLowerCase()]; name = m[2]; }
  name = name.replace(/^(von|vom|der|die|das)\s+/i, '').replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 80);
  if (!name) return null;
  if (unit === 'Stk') unit = null;
  const hit = lookup(name);
  const same = hit && (hit.exact || sameWord(norm(name), norm(hit.entry.name)));
  const display = same ? hit.entry.name : cap(name);
  return {
    name: display, key: norm(display), qty: Number.isFinite(qty) ? qty : null, unit,
    emoji: hit ? hit.entry.emoji : '🛒', cat: hit ? hit.entry.cat : 'sonst', staple: hit ? hit.entry.staple : false,
  };
}
export const parseInput = (text) => String(text).split(SPLIT_RE).map(parseSegment).filter(Boolean);

// ---------- Mengen ----------
const BASE = { g: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], l: ['ml', 1000] };
export function addQty(a, b) {
  if (a.qty == null || b.qty == null) return null;
  const toBig = (q, u) => ((u === 'g' || u === 'ml') && q >= 1000 ? { qty: q / 1000, unit: u === 'g' ? 'kg' : 'l' } : { qty: q, unit: u });
  if ((a.unit || null) === (b.unit || null)) return toBig(Number(a.qty) + Number(b.qty), a.unit || null);
  const ba = BASE[a.unit], bb = BASE[b.unit];
  if (ba && bb && ba[0] === bb[0]) return toBig(a.qty * ba[1] + b.qty * bb[1], ba[0]);
  return null;
}
export const fmtNum = (n) => (Math.round(n * 100) / 100).toLocaleString('de-DE');
const PLURAL = { Zehe: 'Zehen', Dose: 'Dosen', Kiste: 'Kisten', Glas: 'Gläser', Tüte: 'Tüten', Schale: 'Schalen', Prise: 'Prisen', Kopf: 'Köpfe', Netz: 'Netze' };
export function fmtQty(it) {
  if (it.qty == null) return '';
  const q = Number(it.qty);
  if (!it.unit) return `${fmtNum(q)}×`;
  return `${fmtNum(q)} ${q > 1 && PLURAL[it.unit] ? PLURAL[it.unit] : it.unit}`;
}
export const QTY_STEP = (u, q) => ({ g: q >= 250 ? 100 : 50, ml: q >= 250 ? 100 : 50, kg: 0.5, l: 0.5 }[u] || 1);
export const QTY_DEFAULT = (u) => ({ g: 250, ml: 250, kg: 1, l: 1 }[u] || 1);

// ---------- Vorschläge ----------
// purchases: [{key, at(ms)}], openKeys: Set, describe(key) → {name, emoji, cat}
export function suggestions(purchases, openKeys, describe, now = Date.now(), limit = 6) {
  const byKey = new Map();
  for (const p of purchases) (byKey.get(p.key) || byKey.set(p.key, []).get(p.key)).push(p.at);
  const out = [];
  for (const [key, ts] of byKey) {
    if (openKeys.has(key) || ts.length < 3) continue;
    const sorted = [...ts].sort((a, b) => b - a);
    const gaps = sorted.slice(0, -1).map((t, i) => (t - sorted[i + 1]) / DAY).sort((a, b) => a - b);
    const interval = gaps[Math.floor(gaps.length / 2)];
    if (!(interval > 0.5)) continue;
    const ratio = (now - sorted[0]) / DAY / interval;
    if (ratio < 0.8) continue;
    out.push({ key, ...describe(key), interval: Math.round(interval), ratio });
  }
  return out.sort((a, b) => b.ratio - a.ratio).slice(0, limit);
}

// ---------- Lernende Markt-Sortierung ----------
// positions: { 'i:milch': {p, n}, 'c:kuehl': {p, n} }
export function storeScore(positions, item) {
  const ip = positions['i:' + item.key], cp = positions['c:' + item.cat];
  if (ip && ip.n >= 2) return ip.p;
  if (cp) return cp.p + (ip ? (ip.p - cp.p) * 0.3 : 0);
  return (CAT_INDEX[item.cat] ?? CATS.length) / CATS.length;
}
export const sortForStore = (positions, items) =>
  [...items].sort((a, b) => storeScore(positions, a) - storeScore(positions, b) || a.name.localeCompare(b.name, 'de'));

// Liefert nur die geänderten Positionen zurück
export function learnPositions(positions, sequence) {
  const n = sequence.length, changed = {};
  if (n < 2) return changed;
  const upd = (k, p) => { const o = changed[k] || positions[k]; changed[k] = o ? { p: o.p * 0.6 + p * 0.4, n: o.n + 1 } : { p, n: 1 }; };
  const catSeen = {};
  sequence.forEach((it, idx) => {
    const p = idx / (n - 1);
    upd('i:' + it.key, p);
    (catSeen[it.cat] = catSeen[it.cat] || []).push(p);
  });
  Object.entries(catSeen).forEach(([cat, ps]) => upd('c:' + cat, ps.reduce((a, b) => a + b, 0) / ps.length));
  return changed;
}

// ---------- Rezepte ----------
export function parseRecipeText(text) {
  let lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const m = String(text).match(/(?:für|für ca\.)\s*(\d+)\s*(?:portionen|personen|pers\.)/i);
  const servings = m ? parseInt(m[1], 10) : 4;
  const first = lines[0] || '';
  const title = first && !parseSegment(first)?.qty && !/zutaten/i.test(first) && first.length < 60 ? first : 'Rezept';
  const zi = lines.findIndex((l) => /^zutaten\b/i.test(l));
  if (zi >= 0) lines = lines.slice(zi + 1);
  const end = lines.findIndex((l) => /^(zubereitung|anleitung|so geht|schritt)/i.test(l));
  if (end >= 0) lines = lines.slice(0, end);
  const ingredients = lines.filter((l) => l !== title && l.length <= 60 && !/(portionen|personen)/i.test(l) && !/[.!?]$/.test(l));
  return { title, servings, ingredients };
}
// Eine Zutatenzeile aus einem Rezept (Chefkoch-Schreibweise usw.) → ein oder mehrere Artikel
export function parseIngredient(line) {
  let s = String(line)
    .replace(/(\p{L})(\((?:n|e|s|en)\)|\/(?:n|e|s|en)\b)/gu, '$1')   // Tomate(n), Zehe/n → Tomate, Zehe
    .replace(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)/, '$2')    // 1-2 Zwiebeln → 2 Zwiebeln
    .replace(/^(etwas|evtl\.?|ggf\.?|n\.\s?b\.?|nach belieben|optional|frisch(?:e|er)?)\s+/i, '')
    .replace(/\s+/g, ' ').trim();
  if (!s) return [];
  let note = '';
  const comma = s.search(/,(?!\d)/);
  if (comma > 0) { note = s.slice(comma + 1).trim(); s = s.slice(0, comma).trim(); }
  // „Salz und Pfeffer“: zwei Katalogartikel ohne Menge → zwei Einträge
  const both = s.match(/^(\D+?)\s+(?:und|&)\s+(\D+)$/i);
  if (both && lookup(both[1]) && lookup(both[2])) return [parseSegment(both[1]), parseSegment(both[2])].filter(Boolean);
  const p = parseSegment(s);
  if (!p) return [];
  if (note) p.note = note.slice(0, 120);
  return [p];
}

export function scaleIngredient(p, f) {
  if (p.qty == null || f === 1) return p;
  let q = p.qty * f;
  if (p.unit === 'g' || p.unit === 'ml') {
    q = q >= 100 ? Math.round(q / 10) * 10 : Math.round(q / 5) * 5 || 5;
    if (q >= 1000) return { ...p, qty: q / 1000, unit: p.unit === 'g' ? 'kg' : 'l' };
  } else if (!p.unit) q = Math.max(1, Math.ceil(q - 1e-9));
  else q = Math.max(0.5, Math.round(q * 2) / 2);
  return { ...p, qty: q };
}
export function parseYield(y) {
  const s = Array.isArray(y) ? y.join(' ') : String(y ?? '');
  const m = s.match(/\d+/);
  return m ? Math.min(48, Math.max(1, parseInt(m[0], 10))) : 4;
}

// ---------- Hilfen ----------
export function ago(ts, now = Date.now()) {
  const m = Math.round((now - ts) / 6e4);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}
export const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
