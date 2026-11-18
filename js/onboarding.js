// Korb – Erster Start: Haushalt anlegen, mit Code beitreten oder als bestehendes Mitglied zurückkehren.
import * as store from './store.js';
import { $, esc, icon, avatar, isStandalone, isIOS } from './dom.js';

const HUES = [152, 330, 212, 28, 268, 190, 0, 88];
const SHARE_GLYPH = `<svg class="share-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Teilen-Symbol"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;

let root = null, browserOk = false;

export function renderOnboarding(el) {
  root = el;
  document.body.dataset.color = 'basil';
  if (store.state.unconfigured) return screen(`
    <div class="brand"><div class="logo">${icon('basket')}</div><h1>Korb</h1>
    <p class="lead">Korb ist noch nicht mit der Datenbank verbunden.</p></div>
    <div class="note-box">Trage in <b>js/config.js</b> die Supabase-Adresse und den öffentlichen Schlüssel ein. Die Anleitung steht in der README.</div>`);
  if (store.state.lostSession) return recover(store.state.lostSession.invite_code, true);
  welcome();
}

function screen(html, bind) {
  root.innerHTML = `<main class="wrap onboard">${html}</main>`;
  if (bind) bind(root);
  window.scrollTo(0, 0);
}

function welcome() {
  const needsInstall = isIOS() && !isStandalone() && !browserOk;
  screen(`
    <div class="brand"><div class="logo">${icon('basket')}</div><h1>Korb</h1>
      <p class="lead">Die Einkaufsliste für euren Haushalt. Live geteilt, ohne Konto, ohne Werbung.</p></div>
    ${needsInstall ? `<div class="install">${icon('share')}<div><b>Erst auf den Home-Bildschirm</b>
      Tippe unten in Safari auf ${SHARE_GLYPH} und dann auf „Zum Home-Bildschirm“. Öffne Korb danach über das neue Symbol.</div></div>` : ''}
    <div class="actions">
      <button type="button" class="btn btn-primary btn-block" id="obCreate">Neuen Haushalt anlegen</button>
      <button type="button" class="btn btn-plain btn-block" id="obJoin">Mit Code beitreten</button>
      ${needsInstall ? '<button type="button" class="btn btn-block" id="obBrowser" style="color:var(--fg-2)">Trotzdem im Browser weiter</button>' : ''}
    </div>`, (r) => {
    $('#obCreate', r).onclick = create;
    $('#obJoin', r).onclick = () => join();
    const b = $('#obBrowser', r);
    if (b) b.onclick = () => { browserOk = true; welcome(); };
  });
}

function hueField(sel) {
  return `<div class="field"><span>Deine Farbe</span><div class="hues" role="radiogroup" aria-label="Farbe">${HUES.map((h) =>
    `<button type="button" data-h="${h}" style="--h:${h}" role="radio" aria-checked="${h === sel}" aria-pressed="${h === sel}" aria-label="Farbe ${h}"></button>`).join('')}</div></div>`;
}
function bindHues(r, get, set) {
  r.querySelectorAll('.hues button').forEach((b) => (b.onclick = () => {
    set(+b.dataset.h);
    r.querySelectorAll('.hues button').forEach((x) => { const on = +x.dataset.h === get(); x.setAttribute('aria-pressed', on); x.setAttribute('aria-checked', on); });
  }));
}
const backBtn = `<button type="button" class="back" id="obBack">${icon('chevronR')} Zurück</button>`;
async function run(btn, errEl, fn) {
  errEl.textContent = '';
  if (!navigator.onLine) { errEl.textContent = 'Für den ersten Start braucht Korb Internet.'; return; }
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try { await fn(); } catch (e) { errEl.textContent = e.message || 'Das hat nicht geklappt. Bitte nochmal versuchen.'; btn.disabled = false; btn.innerHTML = label; }
}

function create() {
  let hue = HUES[0];
  screen(`${backBtn}
    <div class="brand"><h1>Neuer Haushalt</h1><p class="lead">Danach bekommst du einen Code, mit dem die anderen beitreten.</p></div>
    <label class="field"><span>Haushalt</span><input id="obHh" placeholder="z. B. Familie Meier" maxlength="60" autocomplete="off"></label>
    <label class="field"><span>Dein Name</span><input id="obName" placeholder="z. B. Anna" maxlength="40" autocomplete="given-name"></label>
    ${hueField(hue)}
    <p class="err" id="obErr" role="alert"></p>
    <button type="button" class="btn btn-primary btn-block" id="obGo" disabled>Haushalt anlegen</button>`, (r) => {
    $('#obBack', r).onclick = welcome;
    bindHues(r, () => hue, (h) => (hue = h));
    const hh = $('#obHh', r), nm = $('#obName', r), go = $('#obGo', r);
    const check = () => (go.disabled = !(hh.value.trim() && nm.value.trim()));
    hh.oninput = check; nm.oninput = check;
    go.onclick = () => run(go, $('#obErr', r), () => store.createHousehold(hh.value.trim(), nm.value.trim(), hue));
  });
}

function join(prefill = '') {
  let hue = HUES[2];
  screen(`${backBtn}
    <div class="brand"><h1>Beitreten</h1><p class="lead">Den Code findet jemand aus deinem Haushalt in Korb, oben rechts bei den Profilbildern.</p></div>
    <label class="field"><span>Code</span><input id="obCode" class="code-input" placeholder="KORB-XXXXXX" maxlength="14" autocomplete="off" autocapitalize="characters" value="${esc(prefill)}"></label>
    <label class="field"><span>Dein Name</span><input id="obName" placeholder="z. B. Ben" maxlength="40" autocomplete="given-name"></label>
    ${hueField(hue)}
    <p class="err" id="obErr" role="alert"></p>
    <button type="button" class="btn btn-primary btn-block" id="obGo" disabled>Beitreten</button>
    <button type="button" class="btn btn-block" id="obRecover" style="color:var(--accent)">Ich war schon dabei</button>`, (r) => {
    $('#obBack', r).onclick = welcome;
    bindHues(r, () => hue, (h) => (hue = h));
    const code = $('#obCode', r), nm = $('#obName', r), go = $('#obGo', r);
    const check = () => (go.disabled = !(code.value.replace(/[^a-z0-9]/gi, '').length >= 8 && nm.value.trim()));
    code.oninput = check; nm.oninput = check; check();
    go.onclick = () => run(go, $('#obErr', r), () => store.joinHousehold(code.value, nm.value.trim(), hue));
    $('#obRecover', r).onclick = () => recover(code.value);
  });
}

function recover(prefill = '', welcomeBack = false) {
  screen(`${welcomeBack ? '' : backBtn}
    <div class="brand"><h1>${welcomeBack ? 'Willkommen zurück' : 'Wer bist du?'}</h1>
      <p class="lead">${welcomeBack ? 'Dieses iPhone wurde abgemeldet. Wähle deinen Namen, dann ist alles wieder da.' : 'Gib den Code ein und wähle deinen Namen. Deine Listen und Einstellungen bleiben erhalten.'}</p></div>
    <label class="field"><span>Code</span><input id="obCode" class="code-input" placeholder="KORB-XXXXXX" maxlength="14" autocomplete="off" autocapitalize="characters" value="${esc(prefill)}"></label>
    <p class="err" id="obErr" role="alert"></p>
    <div class="pick" id="obPick"></div>
    <button type="button" class="btn btn-primary btn-block" id="obGo">Namen anzeigen</button>
    ${welcomeBack ? '<button type="button" class="btn btn-block" id="obOther" style="color:var(--fg-2)">Anderen Haushalt nutzen</button>' : ''}`, (r) => {
    const back = $('#obBack', r); if (back) back.onclick = () => join(prefill);
    const other = $('#obOther', r); if (other) other.onclick = () => { store.state.lostSession = null; welcome(); };
    const code = $('#obCode', r), go = $('#obGo', r), err = $('#obErr', r), pick = $('#obPick', r);
    const load = () => run(go, err, async () => {
      const list = await store.membersByCode(code.value);
      go.disabled = false; go.innerHTML = 'Namen anzeigen';
      if (!list.length) { err.textContent = 'Zu diesem Code gibt es keinen Haushalt.'; pick.innerHTML = ''; return; }
      pick.innerHTML = list.map((m) => `<button type="button" data-m="${m.id}">${avatar(m)}${esc(m.name)}</button>`).join('');
      pick.querySelectorAll('button').forEach((b) => (b.onclick = () => run(b, err, () => store.recover(code.value, b.dataset.m))));
    });
    go.onclick = load;
    if (welcomeBack && prefill) load();
  });
}
