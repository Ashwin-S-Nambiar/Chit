import { guessSection, parseItem, SECTIONS, sameItem, sectionLabel } from './parse.js';
import { qrPath } from './qr.js';
import { createSheet } from './sheet.js';
import { setSound, sfx, soundOn } from './sound.js';
import {
  forgetChit,
  haptic,
  readCache,
  readChits,
  readWords,
  rememberChit,
  rememberWord,
  restoreChit,
  updateChit,
  writeCache,
} from './store.js';
import { initTips } from './tip.js';

const HOME_TITLE = 'Chit · A shopping list you share';
const ID_RE = /^[a-z0-9]{10,24}$/;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const paper = $('paper');
const printed = $('printed');
const body = $('body');
const listname = $('listname');
const addForm = $('add-form');
const addInput = $('add-input');
const addBtn = addForm.querySelector('button');
const toastEl = $('toast');
const toastText = $('toast-text');
const toastBtn = $('toast-btn');
const here = $('here');
const hereText = $('here-text');
const soundBtn = $('sound-btn');

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let db = null;
const dbReady = import('./db.js').then((m) => {
  db = m;
  return m;
});

let listId = null;
let data = { name: '', created: 0, items: {} };
let closeList = null;
let firstData = true;
let wasAllGot = false;
let people = 1;
let online = null;
let everOnline = false;
let focusAfterRender = null;
const undoStack = [];
const mine = new Map();
const touch = (...keys) => {
  const now = performance.now();
  for (const k of keys) mine.set(k, now);
};
const isMine = (key) => performance.now() - (mine.get(key) ?? -1e9) < 4000;
let stampAnim = null;
let stampTimer = 0;
const lines = new Map();
const sections = new Map();

function newId() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (b) => abc[b % abc.length],
  ).join('');
}

const shareUrl = (id = listId) => `${location.origin}/?l=${id}`;

const sortedItems = () =>
  Object.entries(data.items ?? {})
    .filter(([, it]) => it && typeof it.text === 'string')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const counts = () => {
  const all = sortedItems();
  return { total: all.length, got: all.filter(([, it]) => it.got).length };
};

const hasContent = () => Boolean(data.name) || sortedItems().length > 0;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

function stampDate(ts) {
  const d = new Date(ts || Date.now());
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setTitle() {
  document.title = data.name ? `${data.name} · Chit` : HOME_TITLE;
}

function flip(mutate, animate) {
  if (!animate || reduced()) {
    mutate();
    return;
  }
  const sel = '.sec-label, .line, .printed > :not(.body)';
  const before = new Map();
  for (const el of printed.querySelectorAll(sel)) {
    before.set(el, el.getBoundingClientRect().top);
  }
  mutate();
  for (const el of printed.querySelectorAll(sel)) {
    const top = before.get(el);
    if (top === undefined) continue;
    const dy = top - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
      duration: 280,
      easing: EASE_OUT,
    });
  }
}

const TICK_SVG =
  '<svg class="tick" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.8 7.6c1.3 1 2.3 2.2 3.1 3.6C6.9 7.3 9.3 4.2 12.4 1.8"/></svg>';

function makeLine(key) {
  const li = document.createElement('li');
  li.className = 'line';
  li.dataset.id = key;
  li.innerHTML = `<button class="row" type="button" aria-pressed="false"><span class="n"></span><span class="name"><span class="txt"></span></span><span class="q"></span>${TICK_SVG}</button>`;
  return li;
}

function makeSection(key) {
  const sec = document.createElement('section');
  sec.className = 'sec';
  sec.dataset.sec = key;
  sec.innerHTML = `<h3 class="sec-label"></h3><ol class="lines"></ol>`;
  sec.querySelector('.sec-label').textContent = sectionLabel(key);
  return sec;
}

function fillLine(li, n, item) {
  const row = li.firstElementChild;
  const sig = `${item.got ? 1 : 0}|${item.text}|${item.qty ?? ''}|${item.section ?? ''}`;
  const changed = li.dataset.sig !== undefined && li.dataset.sig !== sig;
  li.dataset.sig = sig;
  const num = String(n).padStart(2, '0');
  row.children[0].textContent = num;
  row.querySelector('.txt').textContent = item.text;
  row.querySelector('.q').textContent = item.qty ?? '';
  row.setAttribute('aria-pressed', item.got ? 'true' : 'false');
  row.setAttribute(
    'aria-label',
    `${item.text}${item.qty ? `, ${item.qty}` : ''}${item.got ? ', got it' : ''}`,
  );
  return changed;
}

function flash(li) {
  const row = li.firstElementChild;
  row.classList.remove('pulse');
  void row.offsetWidth;
  row.classList.add('pulse');
}

function render({ animate = false } = {}) {
  const items = sortedItems();
  const groups = new Map(SECTIONS.map((s) => [s.key, []]));
  for (const [key, item] of items) {
    const k = groups.has(item.section) ? item.section : 'other';
    groups.get(k).push([key, item]);
  }
  const fresh = [];
  const freshSections = [];
  const changedByOthers = [];

  flip(() => {
    const keep = new Set(items.map(([k]) => k));
    for (const [key, li] of lines) {
      if (!keep.has(key)) {
        li.remove();
        lines.delete(key);
      }
    }
    let n = 0;
    let prev = null;
    for (const { key: secKey } of SECTIONS) {
      const group = groups.get(secKey);
      let sec = sections.get(secKey);
      if (!group.length) {
        if (sec) {
          sec.remove();
          sections.delete(secKey);
        }
        continue;
      }
      if (!sec) {
        sec = makeSection(secKey);
        sections.set(secKey, sec);
        freshSections.push(sec);
      }
      if (prev ? prev.nextElementSibling !== sec : body.firstElementChild !== sec) {
        if (prev) prev.after(sec);
        else body.prepend(sec);
      }
      prev = sec;
      const ol = sec.lastElementChild;
      let prevLi = null;
      for (const [key, item] of group) {
        n += 1;
        let li = lines.get(key);
        if (!li) {
          li = makeLine(key);
          lines.set(key, li);
          fresh.push(li);
        }
        if (fillLine(li, n, item) && !isMine(key)) changedByOthers.push(li);
        const want = prevLi ? prevLi.nextElementSibling : ol.firstElementChild;
        if (want !== li) {
          if (prevLi) prevLi.after(li);
          else ol.prepend(li);
        }
        prevLi = li;
      }
    }
    renderTally(items, animate);
  }, animate);

  if (animate) {
    const theirs = fresh.filter((li) => !isMine(li.dataset.id));
    for (const li of [...changedByOthers, ...theirs]) flash(li);
    if (theirs.length) sfx.print(true);
  }

  if (animate && !reduced()) {
    for (const li of fresh) {
      li.firstElementChild.animate(
        [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
        { duration: 220, easing: 'steps(11, end)' },
      );
    }
    for (const sec of freshSections) {
      sec.firstElementChild.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 200,
        easing: EASE_OUT,
      });
    }
  }

  if (focusAfterRender && lines.has(focusAfterRender)) {
    const li = document.activeElement === addInput ? addForm : lines.get(focusAfterRender);
    focusAfterRender = null;
    li.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  }
}

function roll(el, value, animate) {
  const prev = Number(el.textContent);
  el.textContent = value;
  if (!animate || reduced() || prev === value || Number.isNaN(prev)) return;
  const from = value > prev ? '0.6em' : '-0.6em';
  el.animate(
    [
      { transform: `translateY(${from})`, opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 220, easing: EASE_OUT },
  );
}

function renderTally(items, animate = false) {
  const total = items.length;
  const got = items.filter(([, it]) => it.got).length;
  paper.classList.toggle('is-empty', total === 0);
  roll($('t-items'), total, animate);
  roll($('t-got'), got, animate);
  roll($('t-left'), total - got, animate);
  $('next-n').textContent = String(total + 1).padStart(2, '0');
  const clear = $('clear-got');
  clear.hidden = got === 0;
  clear.textContent = `Clear ticked (${got})`;
  const allGot = total > 0 && got === total;
  paper.classList.toggle('all-got', allGot);
  if (!allGot) {
    stampAnim?.cancel();
    stampAnim = null;
    clearTimeout(stampTimer);
  }
  if (allGot && !wasAllGot && !firstData && animate && !reduced()) slam();
  wasAllGot = allGot;
}

function slam() {
  const delay = 420;
  const dur = 240;
  stampAnim = $('stamp').animate(
    [
      { transform: 'rotate(-7deg) scale(1.9)', opacity: 0 },
      { transform: 'rotate(-7deg) scale(0.95)', opacity: 0.95, offset: 0.72 },
      { transform: 'rotate(-7deg) scale(1)', opacity: 0.88 },
    ],
    { duration: dur, delay, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'backwards' },
  );
  clearTimeout(stampTimer);
  stampTimer = setTimeout(() => {
    sfx.stamp();
    haptic(20);
    paper.animate(
      [{ transform: 'none' }, { transform: 'translateY(2px)' }, { transform: 'none' }],
      { duration: 180, easing: EASE_OUT },
    );
  }, delay + dur * 0.72);
}

const suggest = $('suggest');
let suggestKey = '';

function suggestions(query) {
  const q = query.trim().toLowerCase();
  const onList = sortedItems()
    .filter(([, it]) => !it.got)
    .map(([, it]) => it.text);
  const words = Object.entries(readWords())
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
  const picks = [];
  for (const w of words) {
    if (picks.length >= 12) break;
    const lw = w.toLowerCase();
    if (q && !lw.split(/\s+/).some((part) => part.startsWith(q)) && !lw.startsWith(q)) continue;
    if (q && lw === q) continue;
    if (onList.some((t) => sameItem(t, w)) || picks.some((t) => sameItem(t, w))) continue;
    picks.push(w);
  }
  return picks;
}

const suggestWrap = $('suggest-wrap');

function renderSuggestions() {
  const focused = document.activeElement === addInput;
  const picks = focused ? suggestions(addInput.value) : [];
  const open = picks.length > 0;
  const key = picks.join('|');
  if (open && key !== suggestKey) {
    suggestKey = key;
    suggest.replaceChildren(
      ...picks.map((w, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sug';
        b.dataset.sfx = 'none';
        b.dataset.word = w;
        b.style.setProperty('--i', String(Math.min(i, 8)));
        b.setAttribute('aria-label', `Add ${w}`);
        b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg><span></span>';
        b.lastElementChild.textContent = w;
        return b;
      }),
    );
    suggest.scrollLeft = 0;
  }
  suggestWrap.classList.toggle('open', open);
  suggestWrap.setAttribute('aria-hidden', String(!open));
  for (const b of suggest.children) b.tabIndex = open ? 0 : -1;
}

suggest.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.sug')) e.preventDefault();
});

suggest.addEventListener('click', (e) => {
  const chip = e.target.closest('.sug');
  if (!chip) return;
  addInput.value = '';
  syncAddBtn();
  addItem(chip.dataset.word);
  addInput.focus();
  renderSuggestions();
});

addInput.addEventListener('focus', () => {
  renderSuggestions();
  syncFab();
});
addInput.addEventListener('input', renderSuggestions);
addInput.addEventListener('blur', () =>
  setTimeout(() => {
    renderSuggestions();
    syncFab();
  }, 0),
);

const namefield = $('namefield');
const nameMirror = $('name-mirror');

function sizeName() {
  if (/\n/.test(listname.value)) listname.value = listname.value.replace(/\s*\n\s*/g, ' ');
  nameMirror.textContent = listname.value || listname.placeholder;
  const room = namefield.parentElement.clientWidth - 48;
  const want = Math.ceil(nameMirror.getBoundingClientRect().width) + 2;
  listname.style.width = `${Math.max(40, Math.min(want, room))}px`;
  listname.style.height = 'auto';
  listname.style.height = `${listname.scrollHeight}px`;
  namefield.classList.toggle('is-empty', !listname.value);
}

addEventListener('resize', () => sizeName());

function renderHead() {
  $('stamp-date').textContent = stampDate(data.created);
  if (document.activeElement !== listname) listname.value = data.name ?? '';
  sizeName();
  setTitle();
}

function renderLink() {
  const url = shareUrl();
  const { d, size } = qrPath(url);
  const qr = $('qr');
  qr.setAttribute('viewBox', `0 0 ${size} ${size}`);
  qr.innerHTML = `<path d="${d}"/>`;
  $('link-text').textContent = url.replace(/^https?:\/\//, '');
}

function renderPeople() {
  let state = people > 1 ? 'many' : 'solo';
  let text = people > 1 ? `${people} here` : 'Just you';
  const down = (online === false && everOnline && !resuming) || !navigator.onLine;
  if (down) {
    state = 'offline';
    text = 'Offline';
  }
  here.dataset.state = state;
  hereText.textContent = text;

}

function stubHTML(c) {
  const meta = c.total
    ? c.got === c.total
      ? `${c.total} item${c.total === 1 ? '' : 's'} · bagged`
      : `${c.total} item${c.total === 1 ? '' : 's'} · ${c.got} got`
    : 'Empty';
  return `<button class="stub" type="button" data-open="${c.id}" aria-current="${c.id === listId}"><span class="stub-name"></span><span class="stub-meta">${meta}</span></button><button class="stub-x" type="button" data-forget="${c.id}" aria-label="Remove from this device" data-tip="Remove from this device"><svg class="ic"><use href="#i-x"/></svg></button>`;
}

function renderChits() {
  const chits = readChits();
  for (const ul of [$('stubs-side'), $('stubs-sheet')]) {
    ul.textContent = '';
    if (!chits.length) {
      const li = document.createElement('li');
      li.className = 'stubs-empty';
      li.textContent = 'Chits you open or make show up here.';
      ul.append(li);
      continue;
    }
    for (const c of chits) {
      const li = document.createElement('li');
      li.innerHTML = stubHTML(c);
      li.querySelector('.stub-name').textContent = c.name || 'Untitled chit';
      ul.append(li);
    }
  }
}

function syncRegistry() {
  if (!hasContent()) return;
  const { total, got } = counts();
  const entry = { id: listId, name: data.name ?? '', total, got, created: data.created };
  if (!updateChit(listId, entry)) rememberChit(entry);
  renderChits();
}

function applyData(next, { animate }) {
  data = {
    name: next.name ?? '',
    created: next.created ?? 0,
    items: next.items ?? {},
  };
  renderHead();
  render({ animate });
  renderSuggestions();
  for (const b of document.querySelectorAll('[data-delete]')) b.hidden = !hasContent();
  if (hasContent()) writeCache(listId, data);
  syncRegistry();
}

const slowTimer = setTimeout(() => root.classList.add('slow'), 300);

const fontsReady = Promise.race([
  document.fonts?.ready ?? Promise.resolve(),
  new Promise((r) => setTimeout(r, 1200)),
]);

function markReady() {
  if (root.classList.contains('ready')) return;
  fontsReady.then(() => {
    requestAnimationFrame(() => {
      clearTimeout(slowTimer);
      const wasShown = root.classList.contains('slow');
      const from = paper.getBoundingClientRect().height;
      root.classList.add('ready');
      sizeName();
      const to = paper.getBoundingClientRect().height;
      syncFab();
      if (reduced() || !wasShown) return;
      printed.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: EASE_OUT });
      if (Math.abs(to - from) > 2) {
        paper.animate([{ height: `${from}px` }, { height: `${to}px` }], {
          duration: Math.min(520, 240 + Math.abs(to - from) * 0.35),
          easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
        });
      }
    });
  });
}

const fab = $('fab');
let fieldInView = true;

function syncFab() {
  const show = root.classList.contains('ready') && !fieldInView && document.activeElement !== addInput;
  fab.classList.toggle('show', show);
  fab.tabIndex = show ? 0 : -1;
}

new IntersectionObserver(
  ([entry]) => {
    fieldInView = entry.isIntersecting;
    syncFab();
  },
  { rootMargin: '0px 0px -24px 0px' },
).observe(addForm);

fab.addEventListener('click', () => {
  addInput.focus({ preventScroll: true });
  addForm.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  syncFab();
});

async function openChit(id, { push = false, fresh = false } = {}) {
  closeList?.();
  closeList = null;
  listId = id;
  firstData = true;
  wasAllGot = false;
  people = 1;
  undoStack.length = 0;
  for (const li of lines.values()) li.remove();
  lines.clear();
  for (const sec of sections.values()) sec.remove();
  sections.clear();
  const url = `/?l=${id}`;
  if (push) history.pushState({ l: id }, '', url);
  else history.replaceState({ l: id }, '', url);

  const cached = readCache(id);
  applyData(cached ?? {}, { animate: false });
  if (cached) {
    rememberChit({ ...readChits().find((c) => c.id === id), id, name: cached.name ?? '' });
    const { total, got } = counts();
    updateChit(id, { total, got });
  }
  renderChits();
  renderLink();
  renderPeople();
  wasAllGot = paper.classList.contains('all-got');
  if (cached || fresh) markReady();
  const fallback = setTimeout(markReady, 2500);

  const m = await dbReady;
  if (listId !== id) return;
  closeList = m.openList(id, {
    onData(next) {
      if (listId !== id) return;
      clearTimeout(fallback);
      applyData(next, { animate: !firstData || root.classList.contains('ready') });
      firstData = false;
      markReady();
    },
    onPeople(n) {
      people = n;
      renderPeople();
    },
    onError() {
      clearTimeout(fallback);
      markReady();
      toast('This chit could not be opened.');
    },
  });
}

let toastTimer = 0;
let toastAction = null;

function toast(text, { undo } = {}) {
  clearTimeout(toastTimer);
  toastText.textContent = text;
  toastBtn.hidden = !undo;
  toastAction = undo ?? null;
  const wasHidden = toastEl.hidden;
  toastEl.hidden = false;
  if (wasHidden && !reduced()) {
    toastEl.animate(
      [
        { transform: 'translate(-50%, 8px)', opacity: 0 },
        { transform: 'translate(-50%, 0)', opacity: 1 },
      ],
      { duration: 200, easing: EASE_OUT },
    );
  }
  toastTimer = setTimeout(hideToast, undo ? 5000 : 3000);
}

async function hideToast() {
  clearTimeout(toastTimer);
  if (toastEl.hidden) return;
  if (!reduced()) {
    await toastEl
      .animate(
        [
          { transform: 'translate(-50%, 0)', opacity: 1 },
          { transform: 'translate(-50%, 6px)', opacity: 0 },
        ],
        { duration: 150, easing: EASE_OUT },
      )
      .finished.catch(() => {});
  }
  toastEl.hidden = true;
  toastAction = null;
}

toastBtn.addEventListener('click', () => {
  const fn = toastAction;
  hideToast();
  fn?.();
});

const failed = () => {
  sfx.error();
  toast('Not saved. That change was refused.');
};

async function withDb(fn) {
  const m = db ?? (await dbReady);
  try {
    await fn(m);
  } catch {
    failed();
  }
}

function mirror(id, { items = {}, name, create = false } = {}) {
  if (id !== listId) return;
  const next = { name: data.name, created: data.created, items: { ...data.items } };
  for (const [k, v] of Object.entries(items)) {
    if (v === null) delete next.items[k];
    else next.items[k] = { ...(next.items[k] ?? {}), ...v };
  }
  if (name !== undefined) next.name = name;
  if (create && !next.created) next.created = Date.now();
  applyData(next, { animate: true });
}

const act = {
  writeItem(id, key, item, opts = {}) {
    mirror(id, { items: { [key]: { ...item, at: item.at ?? Date.now() } }, create: opts.create });
    return withDb((m) => m.writeItem(id, key, item, opts));
  },
  patchItem(id, key, patch) {
    mirror(id, { items: { [key]: patch } });
    return withDb((m) => m.patchItem(id, key, patch));
  },
  writeItems(id, items) {
    mirror(id, { items });
    return withDb((m) => m.writeItems(id, items));
  },
  removeItems(id, keys) {
    mirror(id, { items: Object.fromEntries(keys.map((k) => [k, null])) });
    return withDb((m) => m.removeItems(id, keys));
  },
  writeName(id, name, opts = {}) {
    mirror(id, { name, create: opts.create });
    return withDb((m) => m.writeName(id, name, opts));
  },
};

function pushUndo(entry) {
  undoStack.push(entry);
  if (undoStack.length > 50) undoStack.shift();
}

function undo() {
  const entry = undoStack.pop();
  if (!entry || entry.list !== listId) return;
  entry.run();
  hideToast();
  sfx.tap();
}

function addItem(raw) {
  const parsed = parseItem(raw);
  if (!parsed) return;
  const id = listId;
  const dupe = sortedItems().find(([, it]) => sameItem(it.text, parsed.text));
  if (dupe) {
    bumpExisting(id, dupe, parsed);
    return;
  }
  const create = !data.created;
  rememberWord(parsed.text);
  withDb(async (m) => {
    const key = m.newItemKey(id);
    touch(key);
    focusAfterRender = key;
    sfx.print();
    const item = { ...parsed, section: guessSection(parsed.text), got: false };
    pushUndo({
      list: id,
      run: () => {
        touch(key);
        return act.removeItems(id, [key]);
      },
    });
    await act.writeItem(id, key, item, { create });
  });
}

function bumpExisting(id, [key, item], parsed) {
  const patch = {};
  if (item.got) patch.got = false;
  if (parsed.qty && parsed.qty !== (item.qty ?? '')) patch.qty = parsed.qty;
  const li = lines.get(key);
  if (li) {
    li.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    flash(li);
  }
  if (!Object.keys(patch).length) {
    sfx.tap();
    toast(`${item.text} is already on it`);
    return;
  }
  const prev = { got: Boolean(item.got), qty: item.qty ?? '' };
  touch(key);
  pushUndo({
    list: id,
    run: () => {
      touch(key);
      return act.patchItem(id, key, prev);
    },
  });
  act.patchItem(id, key, patch);
  sfx.tick(false);
  const qty = patch.qty ? `, now ${patch.qty}` : '';
  toast(item.got ? `${item.text} is back on the list${qty}` : `${item.text}${qty}`, {
    undo: () => undo(),
  });
}

function toggle(key) {
  const item = data.items[key];
  if (!item) return;
  const id = listId;
  const got = !item.got;
  sfx.tick(got);
  haptic(got ? 10 : 6);
  touch(key);
  pushUndo({
    list: id,
    run: () => {
      touch(key);
      return act.patchItem(id, key, { got: !got });
    },
  });
  act.patchItem(id, key, { got });
}

function removeKeys(keys, label) {
  const id = listId;
  const saved = {};
  for (const k of keys) if (data.items[k]) saved[k] = data.items[k];
  const savedKeys = Object.keys(saved);
  if (!savedKeys.length) return;
  const restore = () => {
    touch(...savedKeys);
    return act.writeItems(id, saved);
  };
  pushUndo({ list: id, run: restore });
  touch(...savedKeys);
  const go = () => act.removeItems(id, savedKeys);
  const leaving = [...body.querySelectorAll('.line')].filter((li) => saved[li.dataset.id]);
  const step = leaving.length > 1 ? Math.min(40, 320 / leaving.length) : 0;
  if (leaving.length > 1) sfx.tear(Math.min(0.5, 0.18 + leaving.length * 0.03));
  else sfx.remove();
  if (leaving.length && !reduced()) {
    leaving.forEach((li, i) => {
      li.style.transitionDelay = `${Math.round(i * step)}ms`;
      li.classList.add('leaving');
    });
    for (const sec of sections.values()) {
      const own = [...sec.querySelectorAll('.line')];
      if (own.every((li) => li.classList.contains('leaving'))) {
        const label = sec.firstElementChild;
        label.style.transitionDelay = own.at(-1).style.transitionDelay;
        label.classList.add('leaving');
      }
    }
    setTimeout(go, 150 + (leaving.length - 1) * step);
  } else go();
  toast(label, {
    undo: () => {
      undoStack.pop();
      restore();
    },
  });
}

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = addInput.value;
  if (!value.trim()) {
    addInput.focus();
    return;
  }
  addInput.value = '';
  syncAddBtn();
  addItem(value);
});

function syncAddBtn() {
  addBtn.disabled = !addInput.value.trim();
}
addInput.addEventListener('input', syncAddBtn);


if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
  for (const k of document.querySelectorAll('[data-key="mod"]')) k.textContent = 'Ctrl';
  for (const k of document.querySelectorAll('[data-key="del"]')) k.textContent = 'Del';
}
syncAddBtn();

body.addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  toggle(row.parentElement.dataset.id);
});

let pressTimer = 0;
let holdTimer = 0;
let pressStart = null;
let pressRow = null;
let suppressClick = false;

function endPress() {
  clearTimeout(pressTimer);
  clearTimeout(holdTimer);
  pressRow?.classList.remove('holding');
  pressRow = null;
  pressStart = null;
}

body.addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.row');
  if (!row || e.button !== 0) return;
  endPress();
  suppressClick = false;
  pressStart = { x: e.clientX, y: e.clientY };
  pressRow = row;
  holdTimer = setTimeout(() => row.classList.add('holding'), 120);
  pressTimer = setTimeout(() => {
    endPress();
    suppressClick = true;
    haptic(14);
    sfx.tap();
    openEdit(row.parentElement.dataset.id);
  }, 480);
});

body.addEventListener('pointermove', (e) => {
  if (!pressStart) return;
  if (Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 8) endPress();
});

for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  body.addEventListener(type, endPress);
}

body.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  e.preventDefault();
  endPress();
  if (!editSheet.isOpen) openEdit(row.parentElement.dataset.id);
});

$('clear-got').addEventListener('click', () => {
  const keys = sortedItems()
    .filter(([, it]) => it.got)
    .map(([k]) => k);
  removeKeys(keys, `Cleared ${keys.length} ticked`);
});

listname.addEventListener('input', sizeName);
document.fonts?.ready.then(sizeName);

listname.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    listname.blur();
  }
  if (e.key === 'Escape') {
    listname.value = data.name ?? '';
    sizeName();
    listname.blur();
  }
});

listname.addEventListener('change', () => {
  const name = listname.value.trim().replace(/\s+/g, ' ').slice(0, 60);
  listname.value = name;
  if (name === (data.name ?? '')) return;
  const id = listId;
  const prev = data.name ?? '';
  const create = !data.created;
  pushUndo({ list: id, run: () => act.writeName(id, prev) });
  act.writeName(id, name, { create });
});

const editDialog = $('edit-sheet');
const editForm = $('edit-form');
let editing = null;

$('edit-sections').innerHTML = SECTIONS.map(
  (s) =>
    `<label class="sec-opt"><input type="radio" name="section" value="${s.key}" /><span>${s.label}</span></label>`,
).join('');

const editSheet = createSheet(editDialog, {
  onClose() {
    editing = null;
  },
});

function openEdit(key) {
  const item = data.items[key];
  if (!item) return;
  editing = key;
  const li = lines.get(key);
  $('edit-title').textContent = `Line ${li?.querySelector('.n').textContent ?? ''}`;
  editForm.elements.text.value = item.text;
  editForm.elements.qty.value = item.qty ?? '';
  const sec = SECTIONS.some((s) => s.key === item.section) ? item.section : 'other';
  editForm.querySelector(`input[value="${sec}"]`).checked = true;
  editSheet.open();
}

editForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const key = editing;
  const item = data.items[key];
  if (!item) {
    editSheet.close();
    return;
  }
  const text = editForm.elements.text.value.trim().replace(/\s+/g, ' ');
  if (!text) {
    editForm.elements.text.focus();
    return;
  }
  const patch = {
    text: text.charAt(0).toUpperCase() + text.slice(1),
    qty: editForm.elements.qty.value.trim().replace(/\s+/g, ' '),
    section: editForm.elements.section.value || 'other',
  };
  const prev = { text: item.text, qty: item.qty ?? '', section: item.section ?? 'other' };
  const id = listId;
  editSheet.close();
  if (patch.text === prev.text && patch.qty === prev.qty && patch.section === prev.section) return;
  touch(key);
  pushUndo({
    list: id,
    run: () => {
      touch(key);
      return act.patchItem(id, key, prev);
    },
  });
  act.patchItem(id, key, patch);
});

$('edit-remove').addEventListener('click', () => {
  const key = editing;
  const item = data.items[key];
  editSheet.close();
  if (item) removeKeys([key], `Removed ${item.text}`);
});

const chitsSheet = createSheet($('chits-sheet'), { onOpen: renderChits });
$('chits-btn').addEventListener('click', () => chitsSheet.open());

document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) {
    const id = open.dataset.open;
    if (chitsSheet.isOpen) chitsSheet.close();
    if (id !== listId) openChit(id, { push: true });
    return;
  }
  const forget = e.target.closest('[data-forget]');
  if (forget) {
    const id = forget.dataset.forget;
    const chits = readChits();
    const index = chits.findIndex((c) => c.id === id);
    const entry = chits[index];
    if (!entry) return;
    const cache = readCache(id);
    forgetChit(id);
    renderChits();
    if (id === listId) {
      const next = readChits()[0];
      if (next) openChit(next.id);
      else openChit(newId(), { fresh: true });
    }
    toast(`Removed ${entry.name || 'Untitled chit'} from this device`, {
      undo: () => {
        restoreChit(entry, index, cache);
        renderChits();
      },
    });
    return;
  }
  if (e.target.closest('[data-delete]')) {
    if (chitsSheet.isOpen) chitsSheet.close();
    deleteChit();
    return;
  }
  if (e.target.closest('[data-new]')) {
    if (chitsSheet.isOpen) chitsSheet.close();
    if (!hasContent() && !readChits().some((c) => c.id === listId)) {
      addInput.focus();
      return;
    }
    openChit(newId(), { push: true, fresh: true });
    addInput.focus();
  }
});

function deleteChit() {
  const id = listId;
  if (!hasContent()) return;
  const snapshot = {
    ...(data.name ? { name: data.name } : {}),
    created: data.created || Date.now(),
    items: structuredClone(data.items ?? {}),
  };
  const chits = readChits();
  const index = Math.max(0, chits.findIndex((c) => c.id === id));
  const entry = chits.find((c) => c.id === id) ?? { id, name: data.name ?? '' };
  const label = data.name || 'Untitled chit';
  sfx.tear(0.4);
  haptic(16);
  withDb((m) => m.deleteList(id));
  forgetChit(id);
  const next = readChits()[0];
  if (next) openChit(next.id, { push: true });
  else openChit(newId(), { push: true, fresh: true });
  toast(`Deleted ${label} for everyone`, {
    undo: () => {
      restoreChit(entry, index, snapshot);
      withDb((m) => m.writeList(id, snapshot));
      openChit(id, { push: true });
    },
  });
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl());
    sfx.copy();
    toast('Link copied. Anyone with it can edit this chit.');
  } catch {
    sfx.error();
    toast('Not copied. Your browser blocked it.');
  }
}

$('copy-link').addEventListener('click', copyLink);

$('share-btn').addEventListener('click', async () => {
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.share) {
    try {
      await navigator.share({
        title: data.name || 'Chit',
        text: data.name ? `${data.name}, on Chit` : 'Our shopping list, on Chit',
        url: shareUrl(),
      });
    } catch {}
    return;
  }
  copyLink();
});

function syncSoundBtn() {
  const on = soundOn();
  soundBtn.setAttribute('aria-pressed', String(on));
  const label = on ? 'Mute sounds' : 'Turn sounds on';
  soundBtn.setAttribute('aria-label', label);
  soundBtn.dataset.tip = label;
  tips.refresh(soundBtn);
}

const tips = initTips($('tip'));
syncSoundBtn();
soundBtn.addEventListener('click', () => {
  setSound(!soundOn());
  syncSoundBtn();
  sfx.tap();
});

document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('button, .sec-opt');
  if (!b || b.closest('[data-sfx="none"]') || b.classList.contains('row')) return;
  if (b === soundBtn) return;
  sfx.tap();
});

const typing = (el) =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.isContentEditable;

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  const active = document.activeElement;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey && !typing(active)) {
    e.preventDefault();
    undo();
    return;
  }
  if (typing(active) || mod || e.altKey) return;
  if (e.key === '/') {
    e.preventDefault();
    addInput.focus();
    return;
  }
  const row = active?.classList?.contains('row') ? active : null;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const rows = [...body.querySelectorAll('.row')];
    if (!rows.length) return;
    e.preventDefault();
    const i = row ? rows.indexOf(row) : -1;
    const next =
      e.key === 'ArrowDown'
        ? rows[Math.min(rows.length - 1, i + 1)]
        : rows[Math.max(0, i === -1 ? rows.length - 1 : i - 1)];
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (!row) return;
  const key = row.parentElement.dataset.id;
  if (e.key === 'e' || e.key === 'E') {
    e.preventDefault();
    openEdit(key);
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    const rows = [...body.querySelectorAll('.row')];
    const i = rows.indexOf(row);
    const item = data.items[key];
    removeKeys([key], `Removed ${item?.text ?? 'item'}`);
    const next = rows[i + 1] ?? rows[i - 1];
    next?.focus();
  }
});

addInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') addInput.blur();
  if (e.key === 'ArrowUp' && !addInput.value) {
    const rows = body.querySelectorAll('.row');
    if (rows.length) {
      e.preventDefault();
      rows[rows.length - 1].focus();
    }
  }
});

if (window.visualViewport) {
  const vv = window.visualViewport;
  const syncKb = () => {
    const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
    root.style.setProperty('--kb', `${kb > 80 ? kb : 0}px`);
  };
  vv.addEventListener('resize', syncKb);
  vv.addEventListener('scroll', syncKb);
}

addEventListener('popstate', () => {
  const id = new URLSearchParams(location.search).get('l');
  if (id && ID_RE.test(id) && id !== listId) openChit(id);
});

dbReady.then((m) => {
  m.watchConnection((connected) => {
    if (connected) {
      everOnline = true;
      resuming = false;
    }
    online = connected;
    renderPeople();
  });
});

let resuming = false;
let sleepTimer = 0;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    sleepTimer = setTimeout(() => {
      db?.setOnline(false);
      resuming = true;
    }, 180000);
    return;
  }
  clearTimeout(sleepTimer);
  if (!resuming) return;
  db?.setOnline(true);
  setTimeout(() => {
    resuming = false;
    renderPeople();
  }, 4000);
});

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

addEventListener('online', renderPeople);

addEventListener('offline', () => {
  online = false;
  everOnline = true;
  renderPeople();
});

const fromUrl = new URLSearchParams(location.search).get('l');
if (fromUrl && ID_RE.test(fromUrl)) openChit(fromUrl);
else if (readChits()[0]) openChit(readChits()[0].id);
else openChit(newId(), { fresh: true });
