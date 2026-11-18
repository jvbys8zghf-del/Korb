// Korb – Start: Daten laden, Ansicht wählen, Service Worker registrieren.
import * as store from './store.js';
import * as home from './home.js';
import { renderOnboarding } from './onboarding.js';
import { Shop } from './sheets.js';
import { inTransition, toast } from './dom.js';

const app = document.getElementById('app');
let mode = null;

function route() {
  if (!store.state.ready) return;
  if (!store.state.session) {
    if (mode !== 'onboard') { mode = 'onboard'; home.unmount(); renderOnboarding(app); }
    return;
  }
  if (mode !== 'home') { mode = 'home'; home.mount(app); return; }
  if (!inTransition()) { home.render(); Shop.refresh(); }
}
store.subscribe(route);
window.addEventListener('korb:vt-end', () => { if (mode === 'home') { home.render(); Shop.refresh(); } });
setInterval(() => { if (mode === 'home' && !inTransition() && document.visibilityState === 'visible') home.render(); }, 60000);

const mock = /[?&]mock\b/.test(location.search) && ['localhost', '127.0.0.1'].includes(location.hostname);
store.start({ mock }).then(route);

// ---------- Service Worker: offline nutzbar, Updates mit Hinweis ----------
let wantReload = false;
if ('serviceWorker' in navigator && !mock) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const ask = (w) => toast('Neue Version von Korb', 'Neu laden', () => { wantReload = true; w.postMessage('skipWaiting'); }, Infinity);
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch((e) => console.warn('Korb: Service Worker', e.message));
  // Nur nach einem bestätigten Update neu laden, nicht bei der ersten Installation
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (wantReload) { wantReload = false; location.reload(); } });
}
