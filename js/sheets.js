// Korb – Sheets (Artikel, Listen, Haushalt, Rezept, Laden) und Einkaufsmodus.
import * as store from './store.js';
import * as L from './logic.js';
import { $, esc, icon, avatar, transition, toast, isStandalone } from './dom.js';
import { render as renderHome, addFromText } from './home.js';
import * as push from './push.js';

let current = null;

// ---------- Generisches Sheet ----------
export function openSheet({ title, left = 'Schließen', right = '', body, mount, onRight, onClose }) {
  closeSheet(true);
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  const sh = document.createElement('section');
  sh.className = 'sheet';
  sh.setAttribute('role', 'dialog');
  sh.setAttribute('aria-modal', 'true');
  sh.setAttribute('aria-label', title);
  sh.innerHTML = `<div class="grab" aria-hidden="true"></div><div class="wrap">
    <div class="sheet-head"><button type="button" class="side" data-sh="left"></button><h2></h2><button type="button" class="side" data-sh="right"></button></div>${body}</div>`;
  sh.querySelector('[data-sh="left"]').textContent = left;
  sh.querySelector('[data-sh="right"]').textContent = right;
  sh.querySelector('h2').textContent = title;
  document.body.append(bd, sh);
  current = { bd, sh, onClose };
  bd.onclick = () => closeSheet();
  sh.querySelector('[data-sh="left"]').onclick = () => closeSheet();
  sh.querySelector('[data-sh="right"]').onclick = () => (onRight ? onRight() : closeSheet());
  let y0 = null;
  sh.addEventListener('touchstart', (e) => { y0 = sh.scrollTop <= 0 && !e.target.closest('input,textarea,select') ? e.touches[0].clientY : null; }, { passive: true });
  sh.addEventListener('touchmove', (e) => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sh.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0; y0 = null;
    if (dy > 110) closeSheet(); else sh.style.transform = '';
  });
  if (mount) mount(sh);
  return sh;
}
export function closeSheet(instant) {
  if (!current) return;
  const { bd, sh, onClose } = current;
  current = null;
  if (onClose) onClose();
  if (instant) { bd.remove(); sh.remove(); return; }
  sh.style.transform = '';
  sh.classList.add('closing');
  bd.style.transition = 'opacity .25s'; bd.style.opacity = '0';
  setTimeout(() => { bd.remove(); sh.remove(); }, 280);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
const busy = (btn, on) => { btn.disabled = on; if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="spinner"></span>'; } else if (btn.dataset.label) btn.innerHTML = btn.dataset.label; };

// ---------- Artikel ----------
const UNITS = [[null, 'Stück'], ['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'l'], ['Pck', 'Packung'], ['Dose', 'Dose'], ['Fl.', 'Flasche'], ['Bund', 'Bund'], ['Kiste', 'Kiste']];

export function itemSheet(id) {
  const it0 = store.item(id);
  if (!it0) return;
  const by = store.member(it0.added_by);
  const cats = L.CATS.map((c) => `<option value="${c.key}" ${c.key === it0.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  openSheet({
    title: 'Artikel', right: 'Fertig',
    body: `
      <div class="item-hero"><span class="e" aria-hidden="true">${esc(it0.emoji)}</span><label class="sr" for="itName">Name</label><input id="itName" value="${esc(it0.name)}" autocomplete="off" maxlength="80"></div>
      <div class="group">
        <div class="row"><span class="grow">Menge</span>
          <div class="stepper"><button type="button" id="qMinus" aria-label="Weniger">${icon('minus')}</button><output id="qOut"></output><button type="button" id="qPlus" aria-label="Mehr">${icon('plus')}</button></div></div>
        <div class="seg" role="group" aria-label="Einheit">${UNITS.map(([u, l]) => `<button type="button" data-u="${u ?? ''}">${l}</button>`).join('')}</div>
      </div>
      <div class="group"><div class="row"><label class="sr" for="itNote">Notiz</label><textarea id="itNote" rows="2" maxlength="200" placeholder="Notiz, z. B. Marke oder Sorte">${esc(it0.note)}</textarea></div></div>
      <div class="group">
        <label class="row" for="itCat"><span class="grow">Gang</span><select id="itCat" style="border:0;background:transparent;font:inherit;color:var(--accent);text-align:right;max-width:60%">${cats}</select></label>
        <div class="row"><span class="grow">${it0.added_by === store.me() ? 'Von dir hinzugefügt' : `Hinzugefügt von ${esc(by.name)}`}<small>${L.ago(store.ms(it0.added_at))}</small></span>${avatar(by)}</div>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="itDone">${icon('check')} Erledigt</button>
      <button type="button" class="btn btn-danger btn-block" id="itDel">${icon('trash')} Löschen</button>`,
    onClose: () => transition(renderHome),
    mount: (sh) => {
      const it = () => store.item(id);
      const out = sh.querySelector('#qOut');
      const paint = () => {
        out.textContent = it().qty == null ? '–' : L.fmtNum(Number(it().qty));
        sh.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.u || null) === (it().unit || null))));
      };
      paint();
      sh.querySelector('#qPlus').onclick = () => { const c = it(); store.updateItem(id, { qty: c.qty == null ? L.QTY_DEFAULT(c.unit) : Number(c.qty) + L.QTY_STEP(c.unit, Number(c.qty)) }); paint(); };
      sh.querySelector('#qMinus').onclick = () => {
        const c = it(); if (c.qty == null) return;
        const n = Number(c.qty) - L.QTY_STEP(c.unit, Number(c.qty) - 1);
        store.updateItem(id, { qty: n > 0 ? n : null }); paint();
      };
      sh.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => {
        const c = it(), u = b.dataset.u || null;
        store.updateItem(id, { unit: u, qty: u === c.unit ? c.qty : (u ? L.QTY_DEFAULT(u) : (c.qty && !c.unit ? c.qty : 1)) }); paint();
      }));
      sh.querySelector('#itName').onchange = (e) => {
        const name = e.target.value.trim(); if (!name) return;
        const p = L.parseSegment(name);
        store.updateItem(id, { name, key: L.norm(name), emoji: p.emoji, cat: p.cat === 'sonst' ? it().cat : p.cat });
        sh.querySelector('.item-hero .e').textContent = it().emoji;
        sh.querySelector('#itCat').value = it().cat;
      };
      let noteT = null;
      sh.querySelector('#itNote').oninput = (e) => { clearTimeout(noteT); noteT = setTimeout(() => store.updateItem(id, { note: e.target.value.trim() }), 400); };
      sh.querySelector('#itCat').onchange = (e) => store.updateItem(id, { cat: e.target.value });
      sh.querySelector('#itDone').onclick = () => {
        store.setDone([id], true); closeSheet();
        toast(`${it().name} erledigt`, 'Rückgängig', () => { store.setDone([id], false); transition(renderHome); });
      };
      sh.querySelector('#itDel').onclick = () => {
        store.removeItem(id); closeSheet();
        toast(`${it().name} gelöscht`, 'Rückgängig', () => { store.restoreItem(id); transition(renderHome); });
      };
    },
  });
}

// ---------- Listen ----------
const COLORS = ['basil', 'ocean', 'plum', 'amber', 'coral', 'slate'];
export function listsSheet() {
  let color = COLORS[store.lists().length % COLORS.length];
  const cur = store.currentList();
  openSheet({
    title: 'Listen', right: 'Fertig',
    body: `
      <div class="group">${store.lists().map((l) => {
        const n = store.items(l.id, false).length;
        return `<button type="button" class="row" data-list="${l.id}"><span class="dot" style="--c:var(--${esc(l.color)})"></span>
          <span class="grow"><b>${esc(l.name)}</b><small>${n ? `${n} offen` : 'Alles erledigt'}</small></span>
          ${l.id === cur?.id ? `<span class="check">${icon('check')}</span>` : ''}</button>`;
      }).join('')}</div>
      <div class="group-label">Neue Liste</div>
      <div class="group">
        <div class="row"><label class="sr" for="newList">Name</label><input type="text" id="newList" placeholder="z. B. Drogerie, Grillabend" autocomplete="off" maxlength="40"></div>
        <div class="swatches" role="group" aria-label="Farbe">${COLORS.map((c) => `<button type="button" class="swatch" data-c="${c}" style="--c:var(--${c})" aria-label="Farbe ${c}"></button>`).join('')}</div>
      </div>
      <button type="button" class="btn btn-tinted btn-block" id="mkList" disabled>${icon('plus')} Liste anlegen</button>
      ${cur ? `<div class="group-label">„${esc(cur.name)}“</div>
      <div class="group">
        <div class="row"><label class="sr" for="renList">Umbenennen</label><input type="text" id="renList" value="${esc(cur.name)}" maxlength="40"></div>
        ${store.lists().length > 1 ? `<button type="button" class="row danger" id="delList">${icon('trash')} Liste löschen</button>` : ''}
      </div>` : ''}`,
    onClose: () => transition(renderHome),
    mount: (sh) => {
      const paint = () => sh.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.c === color)));
      paint();
      sh.querySelectorAll('.swatch').forEach((s) => (s.onclick = () => { color = s.dataset.c; paint(); }));
      const inp = sh.querySelector('#newList'), btn = sh.querySelector('#mkList');
      inp.oninput = () => (btn.disabled = !inp.value.trim());
      btn.onclick = () => { store.addList(inp.value.trim(), color); closeSheet(); };
      sh.querySelectorAll('[data-list]').forEach((b) => (b.onclick = () => { store.setCurrentList(b.dataset.list); closeSheet(); }));
      const ren = sh.querySelector('#renList');
      if (ren) ren.onchange = () => { const v = ren.value.trim(); if (v) store.updateList(cur.id, { name: v }); };
      const del = sh.querySelector('#delList');
      if (del) del.onclick = () => {
        if (!del.dataset.armed) { del.dataset.armed = '1'; del.innerHTML = `${icon('trash')} Wirklich löschen? Nochmal tippen`; return; }
        store.deleteList(cur.id); closeSheet(); toast(`Liste „${cur.name}“ gelöscht`, 'Rückgängig', () => store.updateList(cur.id, { deleted: false }));
      };
    },
  });
}

// ---------- Haushalt & Einstellungen ----------
export function householdSheet() {
  const sess = store.state.session;
  const meRow = store.member(store.me());
  const shopping = new Map(store.state.presence.map((p) => [p.member_id, p]));
  openSheet({
    title: 'Haushalt', right: 'Fertig',
    body: `
      <h3 class="sheet-title">${esc(sess.household_name)}</h3>
      <div class="group">${store.members().map((m) => {
        const p = shopping.get(m.id);
        return `<div class="row">${avatar(m, p ? 'live' : '')}<span class="grow">${esc(m.id === store.me() ? `${m.name} (du)` : m.name)}
          <small>${p ? `kauft gerade${p.store_name ? ` bei ${esc(p.store_name)}` : ''} ein` : m.id === store.me() ? 'Dieses iPhone' : 'Mitglied'}</small></span></div>`;
      }).join('')}</div>
      <div class="group-label">Jemanden einladen</div>
      <div class="group"><div class="row"><span class="grow"><span class="code" id="code">${esc(sess.invite_code)}</span>
        <small>Auf dem anderen iPhone Korb öffnen, „Mit Code beitreten“ wählen und den Code eingeben.</small></span>
        <button type="button" class="round" id="shareCode" aria-label="Einladung teilen">${icon(navigator.share ? 'share' : 'copy')}</button></div></div>
      <div class="group-label">Ich</div>
      <div class="group">
        <div class="row"><label class="grow" for="myName">Name</label><input type="text" id="myName" value="${esc(meRow.name)}" maxlength="40" style="text-align:right;width:55%"></div>
        ${push.supported() ? `<div class="row"><span class="grow">Mitteilungen<small id="pushHint">Wenn jemand einkaufen geht</small></span><button type="button" class="switch" id="pushSw" role="switch" aria-checked="false" aria-label="Mitteilungen"></button></div>` : ''}
      </div>
      ${!isStandalone() ? `<div class="note-box">Tipp: Über Teilen → „Zum Home-Bildschirm“ wird Korb zur App mit eigenem Symbol. Erst dann gehen Mitteilungen.</div>` : ''}
      <div class="group">
        <button type="button" class="row danger" id="signout">Dieses iPhone abmelden</button>
      </div>
      <p class="group-foot">Abmelden löscht nur die Daten auf diesem iPhone. Mit dem Code und deinem Namen kommst du jederzeit zurück.</p>`,
    onClose: () => transition(renderHome),
    mount: (sh) => {
      sh.querySelector('#shareCode').onclick = async () => {
        const text = `Komm in unseren Haushalt bei Korb. Code: ${sess.invite_code}\n${location.origin}${location.pathname}`;
        if (navigator.share) { try { await navigator.share({ title: 'Korb', text }); } catch (e) {} return; }
        try { await navigator.clipboard.writeText(sess.invite_code); toast('Code kopiert'); }
        catch (e) { const r = document.createRange(); r.selectNodeContents(sh.querySelector('#code')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      };
      sh.querySelector('#myName').onchange = (e) => { const v = e.target.value.trim(); if (v) store.updateMe({ name: v }); };
      const sw = sh.querySelector('#pushSw');
      if (sw) {
        push.isEnabled().then((on) => sw.setAttribute('aria-checked', String(on)));
        sw.onclick = async () => {
          const on = sw.getAttribute('aria-checked') === 'true';
          sw.disabled = true;
          try {
            if (on) await push.disable(); else await push.enable();
            sw.setAttribute('aria-checked', String(!on));
          } catch (e) { sh.querySelector('#pushHint').textContent = e.message; }
          sw.disabled = false;
        };
      }
      const so = sh.querySelector('#signout');
      so.onclick = async () => {
        if (!so.dataset.armed) { so.dataset.armed = '1'; so.textContent = `Wirklich abmelden? Code notiert: ${sess.invite_code}`; return; }
        await push.disable().catch(() => {});
        await store.signOutDevice();
        location.reload();
      };
    },
  });
}

// ---------- Rezept ----------
export function recipeSheet() {
  let rec = null, portions = 4, on = new Set();
  openSheet({ title: 'Rezept', body: '<div id="recBody"></div>', mount: (sh) => paintInput(sh) });

  function paintInput(sh) {
    sh.querySelector('#recBody').innerHTML = `
      <div style="display:grid;gap:14px">
        <h3 class="sheet-title">Zutaten aus einem Rezept</h3>
        <p class="sub">Füge einen Rezept-Link oder die Zutatenliste ein. Korb erkennt Mengen, rechnet Portionen um und lässt weg, was du meistens da hast.</p>
        <label class="sr" for="recText">Link oder Rezepttext</label>
        <textarea class="paste" id="recText" placeholder="https://… oder&#10;400 g Spaghetti&#10;500 g Hackfleisch&#10;1 Zwiebel …"></textarea>
        <p class="err" id="recErr"></p>
        <button type="button" class="btn btn-primary btn-block" id="recGo" disabled>Zutaten erkennen</button>
      </div>`;
    const ta = sh.querySelector('#recText'), go = sh.querySelector('#recGo'), err = sh.querySelector('#recErr');
    ta.oninput = () => { go.disabled = !ta.value.trim(); err.textContent = ''; };
    go.onclick = async () => {
      const v = ta.value.trim();
      err.textContent = '';
      if (/^https?:\/\/\S+$/i.test(v)) {
        if (!navigator.onLine) { err.textContent = 'Für Links braucht Korb Internet. Text einfügen geht auch offline.'; return; }
        busy(go, true);
        try {
          const r = await store.invoke('recipe-import', { url: v });
          rec = { title: r.title || 'Rezept', servings: L.parseYield(r.yield), ings: (r.ingredients || []).flatMap(L.parseIngredient) };
        } catch (e) { busy(go, false); err.textContent = e.message || 'Rezept konnte nicht gelesen werden.'; return; }
        busy(go, false);
      } else {
        const t = L.parseRecipeText(v);
        rec = { title: t.title, servings: t.servings, ings: t.ingredients.flatMap(L.parseIngredient) };
      }
      if (!rec.ings.length) { err.textContent = 'Keine Zutaten gefunden. Füge die Zutatenliste als Text ein.'; return; }
      portions = rec.servings;
      on = new Set(rec.ings.map((p, i) => (p.staple ? -1 : i)).filter((i) => i >= 0));
      paintList(sh);
    };
  }
  function paintList(sh) {
    const list = store.currentList();
    const f = portions / rec.servings;
    const scaled = rec.ings.map((p) => L.scaleIngredient(p, f));
    const openNow = store.items(list.id, false);
    sh.querySelector('#recBody').innerHTML = `
      <div style="display:grid;gap:14px">
        <h3 class="sheet-title">${esc(rec.title)}</h3>
        <div class="group"><div class="row"><span class="grow">Portionen<small>Rezept ist für ${rec.servings}</small></span>
          <div class="stepper"><button type="button" id="pMinus" aria-label="Weniger Portionen">${icon('minus')}</button><output>${portions}</output><button type="button" id="pPlus" aria-label="Mehr Portionen">${icon('plus')}</button></div></div></div>
        <div class="group">${scaled.map((p, i) => {
          const ex = openNow.find((o) => o.key === p.key), sum = ex && L.addQty(ex, p);
          const note = p.staple ? 'meist vorrätig' : ex ? (sum ? `steht drauf, wird zu ${L.fmtQty(sum)}` : 'steht schon drauf') : '';
          return `<button type="button" class="row ing" role="checkbox" aria-checked="${on.has(i)}" data-i="${i}">
            <span class="box">${icon('check')}</span><span class="e" aria-hidden="true">${esc(p.emoji)}</span>
            <span class="grow">${esc(p.name)}${note ? `<small>${esc(note)}</small>` : ''}</span><span class="end">${esc(L.fmtQty(p))}</span></button>`;
        }).join('')}</div>
        <button type="button" class="btn btn-primary btn-block" id="recAdd" ${on.size ? '' : 'disabled'}>${on.size} ${on.size === 1 ? 'Zutat' : 'Zutaten'} auf „${esc(list.name)}“</button>
        <button type="button" class="btn btn-plain btn-block" id="recBack">Anderes Rezept</button>
      </div>`;
    sh.querySelector('#pMinus').onclick = () => { if (portions > 1) { portions--; paintList(sh); } };
    sh.querySelector('#pPlus').onclick = () => { if (portions < 48) { portions++; paintList(sh); } };
    sh.querySelectorAll('.ing').forEach((b) => (b.onclick = () => { const i = +b.dataset.i; on.has(i) ? on.delete(i) : on.add(i); paintList(sh); }));
    sh.querySelector('#recBack').onclick = () => paintInput(sh);
    sh.querySelector('#recAdd').onclick = () => {
      const res = store.addParsed(list.id, scaled.filter((_, i) => on.has(i)));
      closeSheet();
      const merged = res.filter((r) => r.type !== 'added' && r.type !== 'reopened').length;
      toast(`${res.length} Zutaten für ${rec.title}${merged ? ` · ${merged} zusammengeführt` : ''}`);
    };
  }
}

// ---------- Laden wählen ----------
export function storeSheet() {
  openSheet({
    title: 'Einkaufen',
    body: `
      <h3 class="sheet-title">Wo kaufst du ein?</h3>
      <p class="sub">Korb merkt sich, in welcher Reihenfolge du in jedem Laden abhakst, und sortiert die Liste beim nächsten Mal genauso.</p>
      ${store.stores().length ? `<div class="group">${store.stores().map((s) => `<button type="button" class="row" data-store="${s.id}">
        <span class="round" style="background:var(--accent-soft);color:var(--accent)">${icon('pin')}</span>
        <span class="grow"><b>${esc(s.name)}</b><small>${s.trips ? `${s.trips} ${s.trips === 1 ? 'Einkauf' : 'Einkäufe'} gelernt · ${L.ago(store.ms(s.last_at))}` : 'Noch nichts gelernt'}</small></span>${icon('chevronR')}</button>`).join('')}</div>` : ''}
      <div class="group"><div class="row"><label class="sr" for="newStore">Laden</label><input type="text" id="newStore" placeholder="${store.stores().length ? 'Anderer Laden' : 'Laden, z. B. Rewe Hauptstraße'}" autocomplete="off" maxlength="40">
        <button type="button" class="round go" id="addStore" aria-label="Laden hinzufügen und starten" disabled>${icon('up')}</button></div></div>`,
    mount: (sh) => {
      sh.querySelectorAll('[data-store]').forEach((b) => (b.onclick = () => { closeSheet(true); Shop.start(b.dataset.store); }));
      const inp = sh.querySelector('#newStore'), btn = sh.querySelector('#addStore');
      inp.oninput = () => (btn.disabled = !inp.value.trim());
      const go = () => { if (!inp.value.trim()) return; const s = store.addStore(inp.value.trim()); closeSheet(true); Shop.start(s.id); };
      btn.onclick = go;
      inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    },
  });
}

// ---------- Einkaufsmodus ----------
export const Shop = {
  s: null, el: null, lock: null,
  start(storeId) {
    const list = store.currentList(), st = store.store(storeId);
    this.s = { storeId, list: list.id, startedAt: Date.now(), seq: [], pending: new Set(), timer: null, known: new Set(store.items(list.id, false).map((i) => i.id)) };
    store.setShopping({ list_id: list.id, list_name: list.name, store_id: storeId, store_name: st.name });
    push.notifyShopping({ store_name: st.name, list_name: list.name });
    this.el = document.createElement('div');
    this.el.className = 'shop';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Einkaufsmodus');
    document.body.append(this.el);
    document.body.style.overflow = 'hidden';
    document.body.classList.add('shopping');
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.paint();
    this.wake();
    this.onVis = () => { if (document.visibilityState === 'visible' && this.el) this.wake(); };
    document.addEventListener('visibilitychange', this.onVis);
  },
  wake() { try { navigator.wakeLock?.request('screen').then((l) => (this.lock = l)).catch(() => {}); } catch (e) {} },
  refresh() { if (this.el && this.s && !this.s.finished) this.paint(); },
  paint() {
    const s = this.s, st = store.store(s.storeId);
    const open = L.sortForStore(store.positions(s.storeId), store.items(s.list, false));
    const cart = s.seq.map((id) => store.item(id)).filter((i) => i && i.done && !i.deleted).reverse();
    const total = open.length + cart.length;
    let lastCat = null;
    const row = (it, inCart) => {
      const isNew = !s.known.has(it.id) && it.added_by !== store.me();
      let zone = '';
      if (!inCart && it.cat !== lastCat) { lastCat = it.cat; zone = `<div class="zone">${esc(L.catName(it.cat))}</div>`; }
      const sub = isNew ? `Neu von ${store.member(it.added_by).name}` : it.note;
      return `${zone}<button type="button" class="srow ${inCart || s.pending.has(it.id) ? 'checked' : ''} ${inCart ? 'incart' : ''}" data-sid="${it.id}" style="view-transition-name:s${it.id.replace(/-/g, '')}">
        <span class="e" aria-hidden="true">${esc(it.emoji)}</span><span class="grow"><span class="nm">${esc(it.name)}</span>${sub ? `<small style="${isNew ? 'color:var(--accent);font-weight:600' : ''}">${esc(sub)}</small>` : ''}</span>
        <span class="qt">${esc(L.fmtQty(it))}</span><span class="box">${icon('check')}</span></button>`;
    };
    const learned = st.trips
      ? `Sortiert nach ${st.trips} ${st.trips === 1 ? 'Einkauf' : 'Einkäufen'} bei ${esc(st.name)}.`
      : `Erster Einkauf bei ${esc(st.name)}: Korb sortiert nach typischen Gängen und lernt deine Reihenfolge mit.`;
    const scroll = this.el.scrollTop;
    this.el.innerHTML = `
      <header class="shop-head"><div class="wrap">
        <div class="shop-top"><button type="button" class="btn btn-plain" data-shop="pause" style="height:36px;padding:0 14px">Pause</button>
          <span class="store-pill">${icon('pin')} ${esc(st.name)}</span>
          <button type="button" class="btn btn-primary" data-shop="finish" style="height:36px;padding:0 16px">Fertig</button></div>
        <div class="progress"><div class="track"><div class="fill" style="width:${total ? (cart.length / total) * 100 : 0}%"></div></div><span class="num">${cart.length} / ${total}</span></div>
      </div></header>
      <main class="wrap">
        <div class="learned">${icon('route')}<span>${learned}</span></div>
        ${open.length ? open.map((it) => row(it, false)).join('') : `<div class="empty"><div class="e">🎉</div><h2>Alles im Wagen</h2><p>Tippe auf „Fertig“, um den Einkauf abzuschließen.</p></div>`}
        ${cart.length ? `<div class="zone">Im Wagen</div>${cart.map((it) => row(it, true)).join('')}` : ''}
      </main>`;
    this.el.scrollTop = scroll;
  },
  onClick(e) {
    const b = e.target.closest('[data-sid],[data-shop]');
    if (!b) return;
    const s = this.s;
    if (b.dataset.shop === 'pause') return this.exit();
    if (b.dataset.shop === 'finish') return this.finish();
    if (b.dataset.shop === 'done') return this.exit();
    const id = b.dataset.sid, it = store.item(id);
    if (!it) return;
    if (it.done) { store.setDone([id], false); s.seq = s.seq.filter((x) => x !== id); return transition(() => this.paint()); }
    if (s.pending.has(id)) { s.pending.delete(id); s.seq = s.seq.filter((x) => x !== id); }
    else { s.pending.add(id); if (!s.seq.includes(id)) s.seq.push(id); }
    b.classList.toggle('checked', s.pending.has(id));
    clearTimeout(s.timer);
    s.timer = setTimeout(() => this.commit(), 1100);
  },
  commit() {
    const s = this.s; if (!s) return;
    const ids = [...s.pending]; s.pending.clear();
    if (ids.length) { store.setDone(ids, true); transition(() => this.paint()); }
  },
  finish() {
    const s = this.s, st = store.store(s.storeId);
    clearTimeout(s.timer);
    this.commit();
    const seqItems = s.seq.map((id) => store.item(id)).filter((i) => i && i.done);
    const trips = st.trips || 0;
    store.finishTrip(s.storeId, seqItems);
    store.setShopping(null);
    s.finished = true;
    const left = store.items(s.list, false).length;
    const mins = Math.max(1, Math.round((Date.now() - s.startedAt) / 6e4));
    this.el.innerHTML = `<main class="wrap" style="padding-top:calc(24px + env(safe-area-inset-top,0px));display:grid;gap:16px">
      <div class="done-hero"><div class="ring">${icon('check')}</div><h3 class="sheet-title">Einkauf erledigt</h3>
        <p class="sub" style="margin:4px 0 0">${left ? `${left} ${left === 1 ? 'Artikel bleibt' : 'Artikel bleiben'} auf der Liste.` : 'Die Liste ist leer.'}</p></div>
      <div class="stats"><div class="stat"><b>${seqItems.length}</b><span>Artikel</span></div><div class="stat"><b>${mins}</b><span>${mins === 1 ? 'Minute' : 'Minuten'}</span></div><div class="stat"><b>${trips + 1}</b><span>× bei ${esc(st.name)}</span></div></div>
      <div class="learned">${icon('spark')}<span>${seqItems.length >= 2 ? `Reihenfolge für ${esc(st.name)} gelernt. Beim nächsten Mal steht die Liste so sortiert, wie du durch den Laden gehst.` : `Hake beim nächsten Mal mindestens zwei Artikel ab, dann lernt Korb die Reihenfolge für ${esc(st.name)}.`}</span></div>
      <button type="button" class="btn btn-primary btn-block" data-shop="done">Zur Liste</button></main>`;
  },
  exit() {
    if (this.s && !this.s.finished) { clearTimeout(this.s.timer); this.commit(); store.setShopping(null); }
    try { this.lock?.release(); } catch (e) {}
    document.removeEventListener('visibilitychange', this.onVis);
    this.lock = null;
    this.el.remove(); this.el = null; this.s = null;
    document.body.style.overflow = '';
    document.body.classList.remove('shopping');
    transition(renderHome);
  },
};

export { addFromText };
