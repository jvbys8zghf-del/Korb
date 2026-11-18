// Ausführen: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInput, parseSegment, addQty, fmtQty, suggestions, sortForStore, learnPositions,
  parseRecipeText, parseIngredient, scaleIngredient, parseYield, DAY,
} from '../js/logic.js';

const show = (t) => parseInput(t).map((p) => `${p.name}|${fmtQty(p)}`);

test('Mehrfacheingabe mit Mengen', () => {
  assert.deepEqual(show('2 l Milch, Brot, 500 g Hack'), ['Milch|2 l', 'Brot|', 'Hack|500 g']);
});
test('Dezimalkomma wird nicht getrennt', () => {
  assert.deepEqual(show('1,5 kg Kartoffeln, Quinoa'), ['Kartoffeln|1,5 kg', 'Quinoa|']);
});
test('„x“ und „und“', () => {
  assert.deepEqual(show('2x Bio-Milch und 3 Zwiebeln'), ['Bio-Milch|2×', 'Zwiebeln|3×']);
});
test('nachgestellte Menge', () => assert.deepEqual(show('Eier 10'), ['Eier|10×']));
test('Einheit ohne Zahl', () => assert.deepEqual(show('Packung Nudeln'), ['Nudeln|1 Pck']));
test('Plural der Einheit', () => assert.deepEqual(show('2 Zehen Knoblauch'), ['Knoblauch|2 Zehen']));
test('Singular, Plural, Umlaut → kanonisch', () => {
  assert.deepEqual(show('1 Zwiebel, Apfel, Tomate'), ['Zwiebeln|1×', 'Äpfel|', 'Tomaten|']);
});
test('Synonym behält Wortlaut, bekommt Kategorie', () => {
  const p = parseSegment('Gouda');
  assert.equal(p.name, 'Gouda'); assert.equal(p.cat, 'kuehl'); assert.equal(p.emoji, '🧀');
});
test('Unbekanntes landet in Sonstiges', () => {
  const p = parseSegment('Glühbirne E27');
  assert.equal(p.cat, 'sonst'); assert.equal(p.emoji, '🛒');
});
test('Zeilen aus WhatsApp mit Aufzählungszeichen', () => {
  assert.deepEqual(show('- Milch\n• 2 Brot\n3. Butter'), ['Milch|', 'Brot|2×', 'Butter|']);
});

test('Mengen zusammenführen', () => {
  assert.deepEqual(addQty({ qty: 500, unit: 'g' }, { qty: 200, unit: 'g' }), { qty: 700, unit: 'g' });
  assert.deepEqual(addQty({ qty: 500, unit: 'g' }, { qty: 600, unit: 'g' }), { qty: 1.1, unit: 'kg' });
  assert.deepEqual(addQty({ qty: 1, unit: 'kg' }, { qty: 250, unit: 'g' }), { qty: 1.25, unit: 'kg' });
  assert.deepEqual(addQty({ qty: 2, unit: null }, { qty: 1, unit: null }), { qty: 3, unit: null });
  assert.equal(addQty({ qty: 1, unit: 'Netz' }, { qty: 2, unit: null }), null);
  assert.equal(addQty({ qty: null, unit: null }, { qty: 2, unit: null }), null);
});

test('Vorschläge: fällig, bald, zu selten, schon offen', () => {
  const now = Date.UTC(2026, 10, 18);
  const at = (d) => now - d * DAY;
  const purchases = [
    ...[6, 11, 16, 21].map((d) => ({ key: 'milch', at: at(d) })),   // alle 5 Tage, seit 6 → fällig
    ...[4, 9, 14].map((d) => ({ key: 'eier', at: at(d) })),          // alle 5 Tage, seit 4 → bald (0,8)
    ...[1, 6, 11].map((d) => ({ key: 'brot', at: at(d) })),          // seit 1 → nein
    ...[10, 20].map((d) => ({ key: 'kaffee', at: at(d) })),          // nur 2 Käufe → nein
    ...[7, 12, 17].map((d) => ({ key: 'butter', at: at(d) })),       // fällig, aber offen
  ];
  const res = suggestions(purchases, new Set(['butter']), (k) => ({ name: k }), now);
  assert.deepEqual(res.map((r) => [r.key, r.interval, r.ratio >= 1 ? 'fällig' : 'bald']), [['milch', 5, 'fällig'], ['eier', 5, 'bald']]);
});

test('Markt-Sortierung lernt aus der Abhak-Reihenfolge', () => {
  const items = [
    { key: 'brot', cat: 'brot', name: 'Brot' },
    { key: 'milch', cat: 'kuehl', name: 'Milch' },
    { key: 'tomaten', cat: 'obst', name: 'Tomaten' },
  ];
  // Standard: Obst, Brot, Kühl
  assert.deepEqual(sortForStore({}, items).map((i) => i.key), ['tomaten', 'brot', 'milch']);
  // Einkauf: Tomaten → Milch → Brot (Bäcker am Ausgang)
  const seq = [items[2], items[1], items[0]];
  let pos = {};
  for (let i = 0; i < 2; i++) pos = { ...pos, ...learnPositions(pos, seq) };
  assert.deepEqual(sortForStore(pos, items).map((i) => i.key), ['tomaten', 'milch', 'brot']);
  // Neuer Artikel derselben Kategorie folgt der gelernten Kategorie
  const butter = { key: 'butter', cat: 'kuehl', name: 'Butter' };
  assert.deepEqual(sortForStore(pos, [...items, butter]).map((i) => i.key), ['tomaten', 'butter', 'milch', 'brot']);
  assert.deepEqual(learnPositions(pos, [items[0]]), {});
});

test('Rezepttext: Titel, Portionen, nur Zutaten', () => {
  const r = parseRecipeText('Spaghetti Bolognese\nFür 4 Portionen\n\nZutaten\n400 g Spaghetti\n1 Zwiebel\nSalz\n\nZubereitung\nZwiebel würfeln.');
  assert.equal(r.title, 'Spaghetti Bolognese');
  assert.equal(r.servings, 4);
  assert.deepEqual(r.ingredients, ['400 g Spaghetti', '1 Zwiebel', 'Salz']);
});
test('Portionen umrechnen', () => {
  const s = (t, f) => fmtQty(scaleIngredient(parseSegment(t), f));
  assert.equal(s('400 g Spaghetti', 0.5), '200 g');
  assert.equal(s('500 g Hackfleisch', 1.5), '750 g');
  assert.equal(s('1 Zwiebel', 1.5), '2×');
  assert.equal(s('2 EL Tomatenmark', 0.5), '1 EL');
  assert.equal(s('30 g Butter', 0.5), '15 g');
  assert.equal(s('500 ml Milch', 2), '1 l');
  assert.equal(s('750 g Mehl', 2), '1,5 kg');
});
test('Zutatenzeilen im Chefkoch-Format', () => {
  const show2 = (l) => parseIngredient(l).map((p) => `${p.name}|${fmtQty(p)}${p.note ? '|' + p.note : ''}`);
  assert.deepEqual(show2('500 g Hackfleisch, gemischt'), ['Hackfleisch|500 g|gemischt']);
  assert.deepEqual(show2('1 Zwiebel(n)'), ['Zwiebeln|1×']);
  assert.deepEqual(show2('2 Zehe/n Knoblauch'), ['Knoblauch|2 Zehen']);
  assert.deepEqual(show2('800 g Tomate(n), passierte'), ['Tomaten|800 g|passierte']);
  assert.deepEqual(show2('Salz und Pfeffer'), ['Salz|', 'Pfeffer|']);
  assert.deepEqual(show2('1-2 Zwiebeln'), ['Zwiebeln|2×']);
  assert.deepEqual(show2('etwas Petersilie, gehackt'), ['Petersilie||gehackt']);
  assert.deepEqual(show2('1,5 kg Kartoffeln, festkochend'), ['Kartoffeln|1,5 kg|festkochend']);
  assert.equal(parseIngredient('Salz').at(0).staple, true);
});
test('recipeYield deuten', () => {
  assert.equal(parseYield('4 Portionen'), 4);
  assert.equal(parseYield(['2', '2 Personen']), 2);
  assert.equal(parseYield(undefined), 4);
});
