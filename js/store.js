export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function drop(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

const CHITS_KEY = 'chit:lists';
const CHITS_MAX = 30;
const cacheKey = (id) => `chit:cache:${id}`;

export function readChits() {
  const list = load(CHITS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function rememberChit(entry) {
  const list = readChits().filter((c) => c.id !== entry.id);
  list.unshift({ ...entry, seen: Date.now() });
  for (const gone of list.slice(CHITS_MAX)) drop(cacheKey(gone.id));
  save(CHITS_KEY, list.slice(0, CHITS_MAX));
}

export function updateChit(id, patch) {
  const list = readChits();
  const i = list.findIndex((c) => c.id === id);
  if (i === -1) return false;
  list[i] = { ...list[i], ...patch };
  save(CHITS_KEY, list);
  return true;
}

export function forgetChit(id) {
  save(
    CHITS_KEY,
    readChits().filter((c) => c.id !== id),
  );
  drop(cacheKey(id));
}

export function restoreChit(entry, index, cache) {
  const list = readChits().filter((c) => c.id !== entry.id);
  list.splice(index, 0, entry);
  save(CHITS_KEY, list);
  if (cache) save(cacheKey(entry.id), cache);
}

export const readCache = (id) => load(cacheKey(id), null);
export const writeCache = (id, data) => save(cacheKey(id), data);

export function haptic(ms = 8) {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate?.(ms);
  } catch {}
}
