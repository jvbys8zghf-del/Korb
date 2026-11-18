// Korb – kleine DOM-Helfer, Icons, Toast, Übergänge.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ICON = {
  chevron: '<path d="m6 9 6 6 6-6"/>',
  chevronR: '<path d="m9 6 6 6-6 6"/>',
  cart: '<path d="M3 4h2.2l2.1 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L20.5 8H6.1"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  share: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  basket: '<path d="M3.5 10h17l-1.7 8.3a2 2 0 0 1-2 1.7H7.2a2 2 0 0 1-2-1.7z"/><path d="M8 10l3-6M16 10l-3-6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
export const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
export const avatar = (m, cls = '') => `<span class="av ${cls}" style="--h:${Number(m.hue) || 150}" title="${esc(m.name)}">${esc((m.name || '?')[0].toUpperCase())}</span>`;

// Während eines Übergangs rendert nur dessen Callback; danach einmal nachziehen (Ereignis korb:vt-end).
let vtActive = 0;
export const inTransition = () => vtActive > 0;
export function transition(fn) {
  if (document.startViewTransition && !reduced() && document.visibilityState === 'visible') {
    vtActive++;
    try {
      const vt = document.startViewTransition(fn);
      vt.finished.catch(() => {}).finally(() => { vtActive--; window.dispatchEvent(new Event('korb:vt-end')); });
      return;
    } catch (e) { vtActive--; }
  }
  fn();
}

let toastTimer = null;
export function toast(msg, action, fn, duration) {
  const t = $('#toast');
  clearTimeout(toastTimer);
  t.innerHTML = `<span>${esc(msg)}</span>${action ? '<button type="button" id="toastAct"></button>' : ''}`;
  if (action) { const b = $('#toastAct'); b.textContent = action; b.onclick = () => { t.hidden = true; fn(); }; }
  t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  const ms = duration ?? (action ? 4500 : 2600);
  if (Number.isFinite(ms)) toastTimer = setTimeout(() => (t.hidden = true), ms);
}

export const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
