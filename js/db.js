import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getDatabase,
  goOffline,
  goOnline,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';

const app = initializeApp({
  databaseURL:
    'https://playground-9c7b7-default-rtdb.asia-southeast1.firebasedatabase.app/',
});
const db = getDatabase(app);

const clientId = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) =>
  (b % 36).toString(36),
).join('');

const listRef = (id, path = '') => ref(db, `lists/${id}${path ? `/${path}` : ''}`);

export function watchConnection(cb) {
  return onValue(ref(db, '.info/connected'), (snap) => cb(snap.val() === true));
}

export function openList(id, { onData, onPeople, onError }) {
  const offData = onValue(
    listRef(id),
    (snap) => onData(snap.val() ?? {}),
    (err) => onError?.(err),
  );
  const mine = ref(db, `presence/${id}/${clientId}`);
  const offConnected = onValue(ref(db, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(mine)
      .remove()
      .then(() => set(mine, serverTimestamp()))
      .catch(() => {});
  });
  const offPeople = onValue(
    ref(db, `presence/${id}`),
    (snap) => onPeople(Math.max(1, snap.size)),
    () => onPeople(1),
  );
  return () => {
    offData();
    offConnected();
    offPeople();
    onDisconnect(mine).cancel().catch(() => {});
    remove(mine).catch(() => {});
  };
}

export const newItemKey = (id) => push(listRef(id, 'items')).key;

export function writeItem(id, key, item, { create = false } = {}) {
  const patch = { [`items/${key}`]: { ...item, at: item.at ?? serverTimestamp() } };
  if (create) patch.created = serverTimestamp();
  return update(listRef(id), patch);
}

export function patchItem(id, key, patch) {
  return update(listRef(id, `items/${key}`), patch);
}

export function writeItems(id, items) {
  const patch = {};
  for (const [key, item] of Object.entries(items)) patch[`items/${key}`] = item;
  return update(listRef(id), patch);
}

export function removeItems(id, keys) {
  const patch = {};
  for (const key of keys) patch[`items/${key}`] = null;
  return update(listRef(id), patch);
}

export function writeName(id, name, { create = false } = {}) {
  const patch = { name: name || null };
  if (create) patch.created = serverTimestamp();
  return update(listRef(id), patch);
}

export const setOnline = (on) => (on ? goOnline(db) : goOffline(db));

export const deleteList = (id) => remove(listRef(id));

export const writeList = (id, value) => set(listRef(id), value);
