// Kleiner Schlüssel-Wert-Speicher auf IndexedDB. Fällt auf Arbeitsspeicher zurück, falls IndexedDB fehlt.
let DB = 'korb';
const STORE = 'kv';
// Nur für den Test-Modus: jedes Tab bekommt einen eigenen Speicher (simuliert getrennte Geräte)
export function setNamespace(ns) { DB = 'korb-' + ns; dbp = null; }
const memory = new Map();
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}
function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}
export async function get(key) {
  try { return await run('readonly', (s) => s.get(key)); } catch (e) { return memory.get(key); }
}
export async function set(key, value) {
  memory.set(key, value);
  try { await run('readwrite', (s) => s.put(value, key)); } catch (e) { /* nur im Speicher */ }
}
export async function del(key) {
  memory.delete(key);
  try { await run('readwrite', (s) => s.delete(key)); } catch (e) {}
}
