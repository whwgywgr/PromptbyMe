'use strict';

/* =====================================================================
   Prompt Manager — local-first prompt library with media results
   - Metadata: localStorage  |  Uploaded media: IndexedDB (blobs)
   ===================================================================== */

const $ = (s) => document.querySelector(s);

const LS_KEY = 'prompt-manager:data-v1';
const THEME_KEY = 'prompt-manager:theme';

const state = {
  prompts: [],
  search: '',
  tag: null,
  type: 'all',     // all | favorites | image | video | webview
  sort: 'newest',  // newest | oldest | title
  detailId: null,
  editingId: null,
  resultType: null,
};

const mediaUrlCache = new Map(); // mediaId -> objectURL (reused across renders)

/* ============================== Icons ============================== */

const I = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.35-4.35a1.5 1.5 0 0 0-2.12 0L6 19"/>',
  video: '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15.3 15.3 0 0 1 0 18 15.3 15.3 0 0 1 0-18z"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  edit: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
  palette: '<path d="M12 22a10 10 0 1 1 10-10c0 1.66-1.34 3-3 3h-2.2a2 2 0 0 0-1.5 3.33c.35.4.55.9.5 1.42A2.4 2.4 0 0 1 13.4 22H12z"/><circle cx="7.5" cy="12.5" r="1"/><circle cx="9.5" cy="7.8" r="1"/><circle cx="14.5" cy="7.2" r="1"/><circle cx="17.8" cy="11" r="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M5 21c0-3.9 3.1-6 7-6s7 2.1 7 6"/>',
};

function icon(name, cls = 'w-4 h-4') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[name] || ''}</svg>`;
}

function starSvg(filled, cls = 'w-4 h-4') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3z"/></svg>`;
}

function typeIcon(type, cls = 'w-3.5 h-3.5') {
  return icon(type === 'image' ? 'image' : type === 'video' ? 'video' : 'globe', cls);
}

/* ============================ IndexedDB ============================ */

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('PromptManagerDB', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('media')) req.result.createObjectStore('media');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function putMedia(id, blob) {
  return openDB().then((db) => new Promise((res, rej) => {
    const t = db.transaction('media', 'readwrite');
    t.objectStore('media').put(blob, id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  }));
}

function getMedia(id) {
  return openDB().then((db) => new Promise((res, rej) => {
    const req = db.transaction('media').objectStore('media').get(id);
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => rej(req.error);
  }));
}

function deleteMedia(id) {
  return openDB().then((db) => new Promise((res, rej) => {
    const t = db.transaction('media', 'readwrite');
    t.objectStore('media').delete(id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  }));
}

function clearMediaCache() {
  for (const url of mediaUrlCache.values()) URL.revokeObjectURL(url);
  mediaUrlCache.clear();
}

async function mediaThumbURL(id) {
  const key = id + '_t';
  if (mediaUrlCache.has(key)) return mediaUrlCache.get(key);
  if (cloudMode()) {
    const r = findResultById(id);
    if (r && r.thumb_path) {
      const url = storePublicUrl(r.thumb_path);
      if (url) mediaUrlCache.set(key, url);
      return url;
    }
    return mediaURL(id); // no thumbnail stored — fall back to the full image
  }
  const blob = await getMedia(key);
  if (blob) {
    const url = URL.createObjectURL(blob);
    mediaUrlCache.set(key, url);
    return url;
  }
  return mediaURL(id);
}

async function mediaURL(id) {
  if (mediaUrlCache.has(id)) return mediaUrlCache.get(id);
  if (cloudMode()) {
    const r = findResultById(id);
    if (r && r.storage_path) {
      const url = storePublicUrl(r.storage_path);
      if (url) mediaUrlCache.set(id, url);
      return url;
    }
    return null;
  }
  const blob = await getMedia(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  mediaUrlCache.set(id, url);
  return url;
}

/* =========================== Persistence =========================== */

function sanitizePrompt(raw) {
  const p = (typeof raw === 'object' && raw) ? raw : {};
  const out = {
    id: (typeof p.id === 'string' && p.id) ? p.id : uid(),
    title: String(p.title ?? '').slice(0, 300) || 'Untitled prompt',
    model: String(p.model ?? ''),
    prompt: String(p.prompt ?? ''),
    notes: String(p.notes ?? ''),
    tags: Array.isArray(p.tags) ? p.tags.map((t) => String(t).slice(0, 60)).filter(Boolean).slice(0, 30) : [],
    favorite: !!p.favorite,
    createdAt: Number(p.createdAt) || Date.now(),
    updatedAt: Number(p.updatedAt) || Number(p.createdAt) || Date.now(),
    results: [],
  };
  if (Array.isArray(p.results)) {
    for (const r of p.results) {
      if (!r || typeof r !== 'object') continue;
      if (!['image', 'video', 'webview'].includes(r.type)) continue;
      out.results.push({
        id: (typeof r.id === 'string' && r.id) ? r.id : uid(),
        type: r.type,
        source: ['upload', 'url', 'html'].includes(r.source) ? r.source : 'url',
        name: String(r.name ?? ''),
        size: Number(r.size) || 0,
        mime: String(r.mime ?? ''),
        ...(r.url ? { url: String(r.url) } : {}),
        ...(typeof r.html === 'string' ? { html: r.html } : {}),
        ...(typeof r.dataUrl === 'string' ? { dataUrl: r.dataUrl } : {}),
        ...(typeof r.storage_path === 'string' ? { storage_path: r.storage_path } : {}),
        ...(typeof r.thumb_path === 'string' ? { thumb_path: r.thumb_path } : {}),
      });
    }
  }
  return out;
}

function loadPrompts(user) {
  if (user) {
    return storeLoadAll()
      .then((data) => { state.prompts = data; })
      .catch((err) => {
        console.error(err);
        toast('Cloud load failed: ' + err.message + ' — showing local cache', 'error');
        loadLocalPrompts();
      });
  }
  return Promise.resolve(loadLocalPrompts());
}

function loadLocalPrompts() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.prompts = Array.isArray(parsed) ? parsed.map(sanitizePrompt) : [];
  } catch {
    state.prompts = [];
  }
  return Promise.resolve();
}

function savePrompts() {
  localStorage.setItem(LS_KEY, JSON.stringify(state.prompts));
}

/* ============================== Utils ============================== */

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function bytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return (n / 1024 ** i).toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
}

function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function splitTags(s) {
  const out = [];
  const seen = new Set();
  for (const t of String(s || '').split(',')) {
    const v = t.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

function toast(msg, type = 'info') {
  const colors = {
    success: 'border-yellow-400 bg-yellow-400 text-black',
    error: 'border-red-600 bg-red-600 text-white',
    info: 'border-zinc-700 bg-zinc-800 text-zinc-100',
  };
  const ic = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info';
  const el = document.createElement('div');
  el.className = `toast toast-${type} flex items-center gap-2 text-sm px-3.5 py-2.5 rounded-lg border ${colors[type] || colors.info}`;
  el.innerHTML = `${icon(ic, 'w-4 h-4 shrink-0')}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

/* ============================== Modals ============================= */

function openModal(modal) {
  modal.classList.remove('hidden');
  syncScrollLock();
}

function closeModal(modal) {
  modal.classList.add('hidden');
  if (modal.id === 'modal-confirm' && confirmResolve) {
    const r = confirmResolve;
    confirmResolve = null;
    r(false);
  }
  syncScrollLock();
}

function syncScrollLock() {
  const anyOpen = [...document.querySelectorAll('.modal')].some((m) => !m.classList.contains('hidden'));
  document.body.classList.toggle('overflow-hidden', anyOpen);
}

let confirmResolve = null;
function confirmDialog(title, msg, okText = 'Delete') {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    $('#cm-title').textContent = title;
    $('#cm-msg').textContent = msg;
    $('#cm-ok').textContent = okText;
    openModal($('#modal-confirm'));
  });
}

function settleConfirm(v) {
  if (!confirmResolve) return;
  const r = confirmResolve;
  confirmResolve = null;
  closeModal($('#modal-confirm'));
  r(v);
}

/* =========================== Grid render =========================== */

function visiblePrompts() {
  let list = [...state.prompts];
  const q = state.search.trim().toLowerCase();
  if (q) {
    list = list.filter((p) =>
      p.title.toLowerCase().includes(q) ||
      p.prompt.toLowerCase().includes(q) ||
      p.notes.toLowerCase().includes(q) ||
      p.model.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  if (state.tag) {
    const tg = state.tag.toLowerCase();
    list = list.filter((p) => p.tags.some((t) => t.toLowerCase() === tg));
  }
  if (state.type === 'favorites') list = list.filter((p) => p.favorite);
  else if (state.type !== 'all') list = list.filter((p) => p.results.some((r) => r.type === state.type));

  if (state.sort === 'oldest') list.sort((a, b) => a.createdAt - b.createdAt);
  else if (state.sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
  else list.sort((a, b) => b.updatedAt - a.updatedAt);
  return list;
}

function pickPreview(p) {
  const img = p.results.find((r) => r.type === 'image');
  if (img) return { kind: 'image', r: img };
  const vid = p.results.find((r) => r.type === 'video');
  if (vid) return { kind: 'video', r: vid };
  const web = p.results.find((r) => r.type === 'webview');
  if (web) return { kind: 'webview', r: web };
  return null;
}

function cardHTML(p, idx) {
  const preview = pickPreview(p);
  let previewHTML = '';
  if (!preview) {
    previewHTML = `<div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-zinc-600">${icon('image', 'w-8 h-8')}<span class="text-xs">No results yet</span></div>`;
  } else if (preview.kind === 'image') {
    previewHTML = preview.r.source === 'url'
      ? `<img src="${esc(preview.r.url)}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" alt="">`
      : `<img data-media-thumb="${preview.r.id}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" alt="">`;
  } else if (preview.kind === 'video') {
    previewHTML = preview.r.thumb_path
      ? `<img data-media-thumb="${preview.r.id}" class="absolute inset-0 w-full h-full object-cover" loading="lazy" alt="">
         <span class="absolute inset-0 flex items-center justify-center pointer-events-none">
           <span class="w-10 h-10 rounded-full bg-black/60 border-2 border-white/90 flex items-center justify-center">${icon('play', 'w-4 h-4 text-white')}</span>
         </span>`
      : preview.r.source === 'url'
        ? `<video src="${esc(preview.r.url)}" muted preload="metadata" class="absolute inset-0 w-full h-full object-cover"></video>`
        : `<video data-media="${preview.r.id}" muted preload="metadata" class="absolute inset-0 w-full h-full object-cover"></video>`;
  } else {
    previewHTML = `<div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-zinc-500 bg-zinc-900">${icon('globe', 'w-8 h-8')}<span class="text-xs">${preview.r.source === 'url' ? esc(hostOf(preview.r.url)) : 'HTML preview'}</span></div>`;
  }

  const types = [...new Set(p.results.map((r) => r.type))];
  const badges = types.map((t) => `<span class="w-6 h-6 rounded-md bg-black flex items-center justify-center text-yellow-400" title="${t}">${typeIcon(t, 'w-3.5 h-3.5')}</span>`).join('');

  const tagsHTML = p.tags.length
    ? `<div class="flex flex-wrap gap-1">${p.tags.slice(0, 4).map((t) => `<span class="tag-chip !text-[10px] !py-0.5">${esc(t)}</span>`).join('')}${p.tags.length > 4 ? `<span class="text-[10px] text-zinc-500 self-center">+${p.tags.length - 4}</span>` : ''}</div>`
    : '';

  return `
  <article class="prompt-card group relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden cursor-pointer hover:border-yellow-400 transition-all flex flex-col"
    style="animation-delay:${Math.min(idx * 35, 350)}ms" data-id="${p.id}">
    <div class="relative h-40 bg-black/70 overflow-hidden img-checker" data-action="open">
      ${previewHTML}
      <div class="absolute top-2 left-2 flex gap-1">${badges}</div>
      <button class="absolute top-2 right-2 w-7 h-7 rounded-md bg-black/70 flex items-center justify-center transition ${p.favorite ? 'text-yellow-400' : 'text-zinc-500 opacity-0 group-hover:opacity-100'} hover:text-yellow-300"
        data-action="fav" title="Favorite">${starSvg(p.favorite, 'w-4 h-4')}</button>
      ${p.results.length ? `<span class="absolute bottom-2 right-2 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-yellow-400 text-black">${p.results.length} result${p.results.length === 1 ? '' : 's'}</span>` : ''}
    </div>
    <div class="p-4 flex-1 flex flex-col gap-2" data-action="open">
      <h3 class="font-semibold text-sm text-zinc-100 truncate">${esc(p.title)}</h3>
      <p class="text-[13px] text-zinc-400 line-clamp-3 leading-relaxed">${esc(p.prompt)}</p>
      ${tagsHTML}
      <div class="mt-auto pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
        <span class="truncate">${fmtDate(p.createdAt)}${p.model ? ' · ' + esc(p.model) : ''}</span>
        <div class="flex items-center gap-0.5 shrink-0">
          <button class="icon-btn !w-7 !h-7" data-action="copy" title="Copy prompt">${icon('copy', 'w-3.5 h-3.5')}</button>
          <button class="icon-btn !w-7 !h-7" data-action="edit" title="Edit">${icon('edit', 'w-3.5 h-3.5')}</button>
          <button class="icon-btn !w-7 !h-7 hover:!text-red-400" data-action="del" title="Delete">${icon('trash', 'w-3.5 h-3.5')}</button>
        </div>
      </div>
    </div>
  </article>`;
}

function renderTagBar() {
  const counts = new Map();
  for (const p of state.prompts) for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + 1);
  const bar = $('#tag-bar');
  if (!counts.size) { bar.innerHTML = ''; return; }
  bar.innerHTML = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `<button class="tag-chip ${state.tag && state.tag.toLowerCase() === t.toLowerCase() ? 'active' : ''}" data-tag="${esc(t)}">${esc(t)} <span class="opacity-60">${c}</span></button>`)
    .join('');
}

function renderGrid() {
  const list = visiblePrompts();
  const grid = $('#grid');
  grid.innerHTML = list.map((p, i) => cardHTML(p, i)).join('');
  hydrateMedia(grid);

  const empty = $('#empty-state');
  if (list.length === 0) {
    empty.classList.remove('hidden');
    empty.classList.add('flex');
    const noData = state.prompts.length === 0;
    $('#empty-title').textContent = noData ? 'No prompts yet' : 'No prompts match your filters';
    $('#empty-msg').textContent = noData
      ? 'Save your first prompt together with its results — images, videos or website previews.'
      : 'Try a different search, tag or filter below.';
    $('#btn-empty-new').classList.toggle('hidden', !noData);
    $('#btn-clear-filters').classList.toggle('hidden', noData);
  } else {
    empty.classList.add('hidden');
    empty.classList.remove('flex');
  }

  $('#count-label').textContent = `${list.length} of ${state.prompts.length} prompt${state.prompts.length === 1 ? '' : 's'}`;
  renderTagBar();
  document.querySelectorAll('.filter-pill').forEach((b) => b.classList.toggle('active', b.dataset.type === state.type));
}

/* ========================== Detail modal =========================== */

function resultCardHTML(r) {
  let media = '';
  if (r.type === 'image') {
    media = r.source === 'url'
      ? `<div class="img-checker"><img src="${esc(r.url)}" loading="lazy" class="w-full max-h-80 object-contain cursor-zoom-in result-image" alt="${esc(r.name || 'image')}"></div>`
      : `<div class="img-checker"><img data-media="${r.id}" class="w-full max-h-80 object-contain cursor-zoom-in result-image" alt="${esc(r.name || 'image')}"></div>`;
  } else if (r.type === 'video') {
    media = r.source === 'url'
      ? `<video src="${esc(r.url)}" controls preload="metadata" class="w-full max-h-80 bg-black"></video>`
      : `<video data-media="${r.id}" controls preload="metadata" class="w-full max-h-80 bg-black"></video>`;
  } else {
    media = r.source === 'url'
      ? `<iframe src="${esc(r.url)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="no-referrer" class="w-full h-72 border-0"></iframe>
         <p class="text-[11px] text-zinc-500 mt-1.5 px-1">Blank preview? The site may block embedding — use the "Open" button below.</p>`
      : `<iframe data-srcdoc="${r.id}" sandbox="allow-scripts allow-modals allow-popups" class="w-full h-72 border-0"></iframe>`;
  }

  const label = r.source === 'url'
    ? (r.type === 'webview' ? hostOf(r.url) : (r.name || 'Linked ' + r.type))
    : (r.name || r.type);
  const sub = r.source === 'upload'
    ? `${r.size ? bytes(r.size) + ' · ' : ''}uploaded file`
    : r.source === 'url' ? 'external link' : 'pasted HTML';

  return `
  <div class="bg-black/60 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
    ${media}
    <div class="px-3.5 py-2.5 border-t border-zinc-800 flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5 text-xs font-medium text-zinc-300">${typeIcon(r.type)}<span class="truncate">${esc(truncate(label, 42))}</span></div>
        <div class="text-[11px] text-zinc-500 mt-0.5">${sub}</div>
      </div>
      <div class="flex items-center gap-0.5 shrink-0">
        ${r.source === 'url' ? `<a class="icon-btn" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" title="Open in new tab">${icon('external')}</a>` : ''}
        ${r.source === 'upload' ? `<button class="icon-btn" data-action="dl-result" data-rid="${r.id}" title="Download">${icon('download')}</button>` : ''}
        <button class="icon-btn hover:!text-red-400" data-action="del-result" data-rid="${r.id}" title="Remove">${icon('trash')}</button>
      </div>
    </div>
  </div>`;
}

function renderDetail() {
  const p = state.prompts.find((x) => x.id === state.detailId);
  if (!p) { closeModal($('#modal-detail')); return; }

  const tagsHTML = p.tags.length
    ? `<div class="flex flex-wrap gap-1.5">${p.tags.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join('')}</div>`
    : '';

  $('#dm-content').innerHTML = `
    <div class="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-start justify-between gap-4 z-10">
      <div class="min-w-0">
        <h2 class="text-lg font-bold text-white truncate">${esc(p.title)}</h2>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-zinc-500">
          ${p.model ? `<span class="px-1.5 py-0.5 rounded bg-yellow-400 text-black border border-yellow-400 font-semibold">${esc(p.model)}</span>` : ''}
          <span>Created ${fmtDate(p.createdAt)}</span>
          <span>Updated ${fmtDate(p.updatedAt)}</span>
          <span class="flex items-center gap-1">${icon('layers', 'w-3.5 h-3.5')}${p.results.length} result${p.results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button class="icon-btn ${p.favorite ? '!text-yellow-400' : ''}" data-action="dm-fav" title="Favorite">${starSvg(p.favorite, 'w-5 h-5')}</button>
        <button class="icon-btn" data-action="dm-edit" title="Edit prompt">${icon('edit', 'w-5 h-5')}</button>
        <button class="icon-btn hover:!text-red-400" data-action="dm-del" title="Delete prompt">${icon('trash', 'w-5 h-5')}</button>
        <button class="icon-btn" data-close title="Close"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
    </div>

    <div class="px-6 py-5 space-y-5">
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Prompt</span>
          <button class="btn-secondary !py-1.5 !px-2.5 !text-xs" data-action="dm-copy">${icon('copy', 'w-3.5 h-3.5')} Copy</button>
        </div>
        <pre class="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed bg-black border border-zinc-800 rounded-xl p-4 text-zinc-300 max-h-72 overflow-y-auto">${esc(p.prompt) || '<span class="text-zinc-600">(empty)</span>'}</pre>
      </div>

      ${p.notes ? `
      <div>
        <span class="text-xs font-semibold uppercase tracking-wider text-zinc-500 block mb-2">Notes</span>
        <p class="whitespace-pre-wrap text-sm text-zinc-400 bg-black/60 border border-zinc-800 rounded-xl p-4">${esc(p.notes)}</p>
      </div>` : ''}

      ${tagsHTML}

      <div>
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Results (${p.results.length})</span>
          <div class="flex gap-2">
            <button class="btn-secondary !py-1.5 !px-2.5 !text-xs" data-action="add-result" data-type="image">${icon('image', 'w-3.5 h-3.5')} Image</button>
            <button class="btn-secondary !py-1.5 !px-2.5 !text-xs" data-action="add-result" data-type="video">${icon('video', 'w-3.5 h-3.5')} Video</button>
            <button class="btn-secondary !py-1.5 !px-2.5 !text-xs" data-action="add-result" data-type="webview">${icon('globe', 'w-3.5 h-3.5')} Webview</button>
          </div>
        </div>
        ${p.results.length === 0
          ? `<div class="border border-dashed border-zinc-800 rounded-xl py-10 text-center text-sm text-zinc-500">No results yet — add an image, video or webview above.</div>`
          : `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${p.results.map(resultCardHTML).join('')}</div>`}
      </div>
    </div>`;

  hydrateMedia($('#dm-content'));
}

/* ========================= Media hydration ========================= */

function hydrateMedia(root) {
  root.querySelectorAll('iframe[data-srcdoc]').forEach((f) => {
    const p = state.prompts.find((x) => x.id === state.detailId);
    const r = p && p.results.find((x) => x.id === f.dataset.srcdoc);
    if (r) f.srcdoc = r.html;
  });
  root.querySelectorAll('[data-media]').forEach(async (el) => {
    const url = await mediaURL(el.dataset.media);
    if (url) el.src = url;
    else el.style.display = 'none'; // blob missing (e.g. imported without media)
  });
  root.querySelectorAll('[data-media-thumb]').forEach(async (el) => {
    const url = await mediaThumbURL(el.dataset.mediaThumb);
    if (url) el.src = url;
    else el.style.display = 'none';
  });
}

/* ========================= Prompt CRUD ============================= */

function openPromptModal(id = null) {
  state.editingId = id;
  const p = id ? state.prompts.find((x) => x.id === id) : null;
  $('#pf-heading').textContent = p ? 'Edit Prompt' : 'New Prompt';
  $('#pf-title').value = p ? p.title : '';
  $('#pf-model').value = p ? p.model : '';
  $('#pf-prompt').value = p ? p.prompt : '';
  $('#pf-notes').value = p ? p.notes : '';
  $('#pf-tags').value = p ? p.tags.join(', ') : '';
  openModal($('#modal-prompt'));
  $('#pf-title').focus();
}

function savePromptForm() {
  const title = $('#pf-title').value.trim();
  const prompt = $('#pf-prompt').value.trim();
  if (!title && !prompt) { toast('Add a title or some prompt text first', 'error'); return; }

  const data = {
    title: title || 'Untitled prompt',
    model: $('#pf-model').value.trim(),
    prompt,
    notes: $('#pf-notes').value.trim(),
    tags: splitTags($('#pf-tags').value),
    updatedAt: Date.now(),
  };

  if (state.editingId) {
    const p = state.prompts.find((x) => x.id === state.editingId);
    if (p) {
      Object.assign(p, data);
      if (cloudMode()) storeSync(storeUpdatePrompt(p.id, data));
    }
    closeModal($('#modal-prompt'));
    if (state.detailId && $('#modal-detail') && !$('#modal-detail').classList.contains('hidden')) renderDetail();
    toast('Prompt updated', 'success');
  } else {
    const p = { id: uid(), ...data, results: [], favorite: false, createdAt: Date.now() };
    state.prompts.unshift(p);
    if (cloudMode()) storeSync(storeCreatePrompt(p));
    closeModal($('#modal-prompt'));
    savePrompts();
    renderGrid();
    state.detailId = p.id;
    renderDetail();
    openModal($('#modal-detail'));
    toast('Prompt saved — now add some results', 'success');
    return;
  }
  savePrompts();
  renderGrid();
}

async function deletePromptFlow(id) {
  const p = state.prompts.find((x) => x.id === id);
  if (!p) return;
  const ok = await confirmDialog('Delete prompt?', `"${p.title}" and its ${p.results.length} result${p.results.length === 1 ? '' : 's'} will be removed permanently.`, 'Delete');
  if (!ok) return;
  for (const r of p.results) {
    if (!cloudMode() && r.source === 'upload') {
      await deleteMedia(r.id);
      const u = mediaUrlCache.get(r.id);
      if (u) { URL.revokeObjectURL(u); mediaUrlCache.delete(r.id); }
    }
  }
  state.prompts = state.prompts.filter((x) => x.id !== id);
  if (cloudMode()) storeSync(storeDeletePrompt(p));
  savePrompts();
  if (state.detailId === id) { state.detailId = null; closeModal($('#modal-detail')); }
  renderGrid();
  toast('Prompt deleted', 'success');
}

/* ========================== Result CRUD ============================ */

function openResultModal(type) {
  state.resultType = type;
  $('#rm-title').textContent = type === 'image' ? 'Add Image Result' : type === 'video' ? 'Add Video Result' : 'Add Webview (Website Design)';
  const body = $('#rm-body');

  if (type === 'image' || type === 'video') {
    body.innerHTML = `
      <label id="rm-dropzone" class="dropzone flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-700 rounded-xl py-8 px-4 text-center cursor-pointer hover:border-yellow-400 hover:bg-yellow-400/10 transition">
        <input id="rm-file" type="file" accept="${type === 'image' ? 'image/*' : 'video/*'}" multiple class="hidden" />
        ${icon(type, 'w-7 h-7 text-zinc-500')}
        <span class="text-sm text-zinc-400">Choose ${type} file${type === 'image' ? 's' : ''} or drag &amp; drop</span>
        <span class="text-xs text-zinc-500">Tip: you can also paste from clipboard (Ctrl+V)</span>
      </label>
      <div class="flex items-center gap-3 my-5"><div class="h-px flex-1 bg-zinc-800"></div><span class="text-xs text-zinc-500">or</span><div class="h-px flex-1 bg-zinc-800"></div></div>
      <label class="field-label">Direct URL</label>
      <div class="flex gap-2">
        <input id="rm-url" type="url" class="field-input" placeholder="https://example.com/${type === 'image' ? 'image.png' : 'clip.mp4'}" />
        <button id="rm-url-add" class="btn-primary shrink-0">Add</button>
      </div>`;

    $('#rm-file').addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length) addUploadResults([...e.target.files]);
      e.target.value = '';
    });
    const dz = $('#rm-dropzone');
    ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
    dz.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files.length) addUploadResults([...e.dataTransfer.files]);
    });
    $('#rm-url-add').onclick = () => addUrlResult($('#rm-url').value.trim());
    $('#rm-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addUrlResult($('#rm-url').value.trim()); }
    });
  } else {
    body.innerHTML = `
      <div class="flex gap-5 mb-4">
        <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="rv" value="url" checked class="accent-yellow-400 w-4 h-4"> Website URL</label>
        <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="rv" value="html" class="accent-yellow-400 w-4 h-4"> Paste HTML code</label>
      </div>
      <div id="rv-url">
        <label class="field-label">Website URL</label>
        <div class="flex gap-2">
          <input id="rm-url" type="url" class="field-input" placeholder="https://yoursite.com/design" />
          <button id="rm-url-add" class="btn-primary shrink-0">Add</button>
        </div>
        <p class="text-xs text-zinc-500 mt-2.5">Note: some sites send headers that block iframe embedding — if the preview stays blank, save it as HTML paste instead.</p>
      </div>
      <div id="rv-html" class="hidden space-y-3">
        <div>
          <label class="field-label">Name <span class="text-zinc-600 font-normal">(optional)</span></label>
          <input id="rm-name" type="text" class="field-input" placeholder="e.g. Landing page v2" />
        </div>
        <div>
          <label class="field-label">HTML / CSS / JS code</label>
          <textarea id="rm-html" rows="9" class="field-input font-mono text-xs" placeholder="&lt;h1&gt;Hello world&lt;/h1&gt; ..."></textarea>
        </div>
        <button id="rm-html-add" class="btn-primary w-full justify-center">Add Preview</button>
      </div>`;

    const toggleMode = () => {
      const mode = body.querySelector('input[name="rv"]:checked').value;
      $('#rv-url').classList.toggle('hidden', mode !== 'url');
      $('#rv-html').classList.toggle('hidden', mode !== 'html');
    };
    body.querySelectorAll('input[name="rv"]').forEach((r) => r.addEventListener('change', toggleMode));
    $('#rm-url-add').onclick = () => addUrlResult($('#rm-url').value.trim());
    $('#rm-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addUrlResult($('#rm-url').value.trim()); }
    });
    $('#rm-html-add').onclick = () => addHtmlResult($('#rm-name').value, $('#rm-html').value);
  }

  openModal($('#modal-result'));
  const first = $('#rm-file') || $('#rm-url');
  if (first) first.focus();
}

async function addUploadResults(files) {
  const p = state.prompts.find((x) => x.id === state.detailId);
  if (!p) return;
  let added = 0, skipped = 0;
  for (const f of files) {
    const type = f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : null;
    if (!type || type !== state.resultType) { skipped++; continue; }
    const rid = uid();
    let storage_path = null, thumb_path = null, fullBlob = f, displayName = f.name;
    try {
      if (type === 'image') {
        const res = await compressImageUpload(f);
        fullBlob = res.full;
        if (res.wasReencoded) displayName = f.name.replace(/\.[^.]+$/, '') + pmExtForMime(fullBlob.type || f.type);
        if (res.thumb) {
          if (cloudMode()) thumb_path = await storeUploadMedia(res.thumb, rid + '_t');
          else await putMedia(rid + '_t', res.thumb);
        }
      } else {
        fullBlob = f;
        const poster = await makeVideoPoster(f);
        if (poster) {
          if (cloudMode()) thumb_path = await storeUploadMedia(poster, rid + '_t');
          else await putMedia(rid + '_t', poster);
        }
      }
      if (cloudMode()) storage_path = await storeUploadMedia(fullBlob, rid);
      else await putMedia(rid, fullBlob);
    } catch (err) {
      console.error(err);
      toast(`Could not store "${f.name}": ${err.message}`, 'error');
      continue;
    }
    const r = { id: rid, type, source: 'upload', name: displayName, size: fullBlob.size, mime: fullBlob.type || f.type, ...(storage_path ? { storage_path } : {}), ...(thumb_path ? { thumb_path } : {}) };
    p.results.push(r);
    if (cloudMode()) {
      try { await storeInsertResult(p.id, r, p.results.length - 1); }
      catch (err) { console.error(err); toast('Cloud sync failed: ' + err.message, 'error'); }
    }
    added++;
  }
  if (added) {
    savePrompts(); renderGrid(); renderDetail();
    closeModal($('#modal-result'));
    toast(`${added} ${state.resultType}${added === 1 ? '' : 's'} added${skipped ? ` · ${skipped} skipped (wrong type)` : ''}`, 'success');
  } else {
    toast(`No valid ${state.resultType} files found`, 'error');
  }
}

function addUrlResult(url) {
  const p = state.prompts.find((x) => x.id === state.detailId);
  if (!p) return;
  if (!url) { toast('Paste a URL first', 'error'); return; }
  let u;
  try { u = new URL(url); } catch { toast('That does not look like a valid URL', 'error'); return; }
  if (!/^https?:$/.test(u.protocol)) { toast('Only http(s) URLs are supported', 'error'); return; }
  const type = state.resultType;
  const r = { id: uid(), type, source: 'url', url: u.href, name: type === 'webview' ? hostOf(u.href) : '', size: 0, mime: '' };
  p.results.push(r);
  if (cloudMode()) storeSync(storeInsertResult(p.id, r, p.results.length - 1));
  p.updatedAt = Date.now();
  savePrompts(); renderGrid(); renderDetail();
  closeModal($('#modal-result'));
  toast('Result added', 'success');
}

function addHtmlResult(name, html) {
  const p = state.prompts.find((x) => x.id === state.detailId);
  if (!p) return;
  if (!html || !html.trim()) { toast('Paste some HTML code first', 'error'); return; }
  p.results.push({ id: uid(), type: 'webview', source: 'html', html, name: (name || '').trim() || 'HTML preview', size: 0, mime: '' });
  if (cloudMode()) storeSync(storeInsertResult(p.id, p.results[p.results.length - 1], p.results.length - 1));
  p.updatedAt = Date.now();
  savePrompts(); renderGrid(); renderDetail();
  closeModal($('#modal-result'));
  toast('Webview preview added', 'success');
}

async function deleteResultFlow(p, rid) {
  const r = p.results.find((x) => x.id === rid);
  if (!r) return;
  const ok = await confirmDialog('Remove result?', `"${truncate(r.name || r.type, 40)}" will be removed from this prompt.`, 'Remove');
  if (!ok) return;
  if (r.source === 'upload') {
    const u = mediaUrlCache.get(r.id);
    if (u) { URL.revokeObjectURL(u); mediaUrlCache.delete(r.id); }
  }
  if (cloudMode()) {
    storeSync(storeDeleteResult(r));
  } else if (r.source === 'upload') {
    await deleteMedia(r.id);
  }
  p.results = p.results.filter((x) => x.id !== rid);
  p.updatedAt = Date.now();
  savePrompts(); renderGrid(); renderDetail();
  toast('Result removed', 'success');
}

async function downloadResult(rid) {
  const p = state.prompts.find((x) => x.id === state.detailId);
  if (!p) return;
  const r = p.results.find((x) => x.id === rid);
  if (!r) return;
  const url = await mediaURL(rid);
  if (!url) { toast('Media file not found in storage', 'error'); return; }
  const a = document.createElement('a');
  if (cloudMode()) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = r.name || 'media';
      a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
      return;
    } catch { /* fall through to direct link */ }
  }
  a.href = url;
  a.download = r.name || 'media';
  a.click();
}

/* ========================= Export / Import ========================= */

function openExportModal() {
  let mediaCount = 0, mediaSize = 0;
  for (const p of state.prompts) for (const r of p.results) {
    if (r.source === 'upload') { mediaCount++; mediaSize += r.size || 0; }
  }
  $('#ex-summary').innerHTML =
    `<span class="text-zinc-100 font-semibold">${state.prompts.length}</span> prompt${state.prompts.length === 1 ? '' : 's'} with ${mediaCount} uploaded media file${mediaCount === 1 ? '' : 's'}${mediaSize ? ` (~${bytes(mediaSize)})` : ''} will be exported.`;
  openModal($('#modal-export'));
}

async function doExport() {
  const includeMedia = $('#ex-media').checked;
  const btn = $('#ex-go');
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'Preparing…';
  try {
    const data = { app: 'prompt-manager', version: 1, exportedAt: new Date().toISOString(), prompts: [] };
    for (const p of state.prompts) {
      const copy = JSON.parse(JSON.stringify(p));
      for (const r of copy.results) {
        if (r.source === 'upload' && includeMedia) {
          let blob = null;
          if (cloudMode() && r.storage_path) {
            try { blob = await (await fetch(storePublicUrl(r.storage_path))).blob(); } catch (e) { console.warn(e); }
          } else {
            blob = await getMedia(r.id);
          }
          if (blob) r.dataUrl = await blobToDataURL(blob);
        }
      }
      data.prompts.push(copy);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prompt-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    closeModal($('#modal-export'));
    toast('Backup downloaded', 'success');
  } catch (err) {
    console.error(err);
    toast('Export failed: ' + err.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = old;
}

let importPayload = null;

function openImportModal() {
  importPayload = null;
  $('#im-file').value = '';
  $('#im-summary').classList.add('hidden');
  $('#im-mode-wrap').classList.add('hidden');
  $('#im-go').disabled = true;
  openModal($('#modal-import'));
}

async function readImportFile(file) {
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    if (!json || !Array.isArray(json.prompts)) throw new Error('Not a Prompt Manager backup file');
    importPayload = json;
    const mediaN = json.prompts.reduce((n, p) => n + (Array.isArray(p.results) ? p.results.filter((r) => r && r.dataUrl).length : 0), 0);
    $('#im-summary').innerHTML =
      `<span class="text-yellow-300 font-semibold">${json.prompts.length}</span> prompt${json.prompts.length === 1 ? '' : 's'} found${mediaN ? ` · ${mediaN} embedded media file${mediaN === 1 ? '' : 's'}` : ''}` +
      (json.exportedAt ? ` <span class="text-zinc-500">· exported ${esc(new Date(json.exportedAt).toLocaleString())}</span>` : '');
    $('#im-summary').classList.remove('hidden');
    $('#im-mode-wrap').classList.remove('hidden');
    $('#im-go').disabled = false;
  } catch (err) {
    importPayload = null;
    $('#im-go').disabled = true;
    toast('Import failed: ' + err.message, 'error');
  }
}

async function doImport() {
  if (!importPayload) return;
  const mode = document.querySelector('input[name="im-mode"]:checked').value;
  if (mode === 'replace' && state.prompts.length) {
    const ok = await confirmDialog('Replace everything?', 'All current prompts and their uploaded media will be deleted before importing.', 'Replace');
    if (!ok) return;
  }
  const btn = $('#im-go');
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'Importing…';
  try {
    if (mode === 'replace') {
      if (cloudMode()) {
        await storeDeleteAllCloud();
      } else {
        for (const p of state.prompts) {
          for (const r of p.results) {
            if (r.source === 'upload') await deleteMedia(r.id);
          }
        }
      }
      state.prompts = [];
      clearMediaCache();
    }
    if (cloudMode()) {
      for (const raw of importPayload.prompts) {
        await importIntoCloud([raw]);
        n++;
      }
      renderGrid();
      closeModal($('#modal-import'));
      toast(`Imported ${n} prompt${n === 1 ? '' : 's'} to your cloud library`, 'success');
      return;
    }
    const existing = new Set(state.prompts.map((p) => p.id));
    let n = 0;
    for (const raw of importPayload.prompts) {
      const p = sanitizePrompt(raw);
      if (existing.has(p.id)) p.id = uid();
      existing.add(p.id);
      for (const r of p.results) {
        if (r.dataUrl) {
          try {
            const blob = await (await fetch(r.dataUrl)).blob();
            if (r.type === 'image') {
              const res = await compressImageUpload(blob);
              await putMedia(r.id, res.full);
              if (res.thumb) await putMedia(r.id + '_t', res.thumb);
            } else {
              await putMedia(r.id, blob);
              if (r.type === 'video') {
                const poster = await makeVideoPoster(blob);
                if (poster) await putMedia(r.id + '_t', poster);
              }
            }
          } catch (err) { console.warn('media restore failed', err); }
          delete r.dataUrl;
        }
      }
      state.prompts.push(p);
      n++;
    }
    savePrompts();
    renderGrid();
    closeModal($('#modal-import'));
    toast(`Imported ${n} prompt${n === 1 ? '' : 's'}`, 'success');
  } catch (err) {
    console.error(err);
    toast('Import failed: ' + err.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = old;
}

/* ============================ Lightbox ============================= */

function showLightbox(img) {
  const lb = $('#lightbox');
  $('#lb-img').src = img.currentSrc || img.src;
  lb.classList.remove('hidden');
  lb.classList.add('flex');
}

function hideLightbox() {
  const lb = $('#lightbox');
  lb.classList.add('hidden');
  lb.classList.remove('flex');
  $('#lb-img').src = '';
}

/* ============================== Wiring ============================= */

function wireEvents() {
  // Header
  $('#btn-new').onclick = () => openPromptModal();
  $('#btn-export').onclick = openExportModal;
  $('#btn-import').onclick = openImportModal;
  $('#ex-go').onclick = doExport;
  $('#im-go').onclick = doImport;
  $('#btn-account').onclick = onAccountClick;
  $('#auth-go').onclick = onAuthSubmit;
  $('#auth-tab-in').onclick = () => setAuthMode('in');
  $('#auth-tab-up').onclick = () => setAuthMode('up');
  const authEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); onAuthSubmit(); } };
  $('#auth-username').addEventListener('keydown', authEnter);
  $('#auth-password').addEventListener('keydown', authEnter);

  // Search (debounced)
  let searchTimer;
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = e.target.value; renderGrid(); }, 150);
  });

  // Filter pills + sort
  $('#filter-bar').addEventListener('click', (e) => {
    const b = e.target.closest('.filter-pill');
    if (!b) return;
    state.type = b.dataset.type;
    renderGrid();
  });
  $('#sort-select').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });

  // Tag chips
  $('#tag-bar').addEventListener('click', (e) => {
    const b = e.target.closest('.tag-chip');
    if (!b) return;
    const t = b.dataset.tag;
    state.tag = state.tag && state.tag.toLowerCase() === t.toLowerCase() ? null : t;
    renderGrid();
  });

  // Empty state
  $('#btn-empty-new').onclick = () => openPromptModal();
  $('#btn-clear-filters').onclick = () => {
    state.search = '';
    $('#search-input').value = '';
    state.tag = null;
    state.type = 'all';
    renderGrid();
  };

  // Grid card actions (event delegation)
  $('#grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    const card = e.target.closest('[data-id]');
    if (!btn || !card) return;
    const p = state.prompts.find((x) => x.id === card.dataset.id);
    if (!p) return;
    const action = btn.dataset.action;
    if (action === 'open') {
      state.detailId = p.id;
      renderDetail();
      openModal($('#modal-detail'));
    } else if (action === 'fav') {
      p.favorite = !p.favorite;
      if (cloudMode()) storeSync(storeUpdatePrompt(p.id, { favorite: p.favorite }));
      savePrompts(); renderGrid();
    } else if (action === 'copy') {
      copyText(p.prompt).then((ok) => toast(ok ? 'Prompt copied to clipboard' : 'Copy failed', ok ? 'success' : 'error'));
    } else if (action === 'edit') {
      openPromptModal(p.id);
    } else if (action === 'del') {
      deletePromptFlow(p.id);
    }
  });

  // Prompt form
  $('#pf-save').onclick = savePromptForm;
  $('#pf-prompt').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') savePromptForm();
  });

  // Detail modal actions
  $('#modal-detail').addEventListener('click', (e) => {
    const imgEl = e.target.closest('.result-image');
    if (imgEl) { showLightbox(imgEl); return; }
    const t = e.target.closest('[data-action],[data-close]');
    if (!t) return;
    if (t.hasAttribute('data-close')) { closeModal($('#modal-detail')); return; }
    const p = state.prompts.find((x) => x.id === state.detailId);
    if (!p) return;
    switch (t.dataset.action) {
      case 'dm-fav':
        p.favorite = !p.favorite;
        if (cloudMode()) storeSync(storeUpdatePrompt(p.id, { favorite: p.favorite }));
        savePrompts(); renderGrid(); renderDetail();
        break;
      case 'dm-edit': openPromptModal(p.id); break;
      case 'dm-del': deletePromptFlow(p.id); break;
      case 'dm-copy':
        copyText(p.prompt).then((ok) => toast(ok ? 'Prompt copied to clipboard' : 'Copy failed', ok ? 'success' : 'error'));
        break;
      case 'add-result': openResultModal(t.dataset.type); break;
      case 'del-result': deleteResultFlow(p, t.dataset.rid); break;
      case 'dl-result': downloadResult(t.dataset.rid); break;
    }
  });

  // Confirm dialog
  $('#cm-ok').onclick = () => settleConfirm(true);
  $('#cm-cancel').onclick = () => settleConfirm(false);

  // Generic close (backdrops, X buttons, Cancel buttons marked data-close)
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (!closer) return;
    const modal = closer.closest('.modal');
    if (modal) {
      if (modal.id === 'modal-confirm') settleConfirm(false);
      else closeModal(modal);
    }
  });

  // Import file picking + drag & drop
  $('#im-file').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) readImportFile(e.target.files[0]);
    e.target.value = '';
  });
  const imdz = $('#im-dropzone');
  ['dragover', 'dragenter'].forEach((ev) => imdz.addEventListener(ev, (e) => { e.preventDefault(); imdz.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => imdz.addEventListener(ev, (e) => { e.preventDefault(); imdz.classList.remove('dragover'); }));
  imdz.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) readImportFile(f);
  });

  // Paste image/video straight into the "add result" modal
  document.addEventListener('paste', (e) => {
    if ($('#modal-result').classList.contains('hidden') || !state.resultType) return;
    if (state.resultType !== 'image' && state.resultType !== 'video') return;
    const files = [...((e.clipboardData && e.clipboardData.files) || [])]
      .filter((f) => f.type.startsWith(state.resultType + '/'));
    if (files.length) {
      e.preventDefault();
      addUploadResults(files);
    }
  });

  // Lightbox
  $('#lightbox').addEventListener('click', hideLightbox);

  // Escape closes the topmost layer
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#lightbox').classList.contains('hidden')) { hideLightbox(); return; }
    for (const id of ['modal-result', 'modal-confirm', 'modal-prompt', 'modal-export', 'modal-import', 'modal-detail']) {
      const m = document.getElementById(id);
      if (!m.classList.contains('hidden')) { closeModal(m); return; }
    }
  });
}

/* ============================== Theme ============================== */

const THEMES = ['theme1', 'theme2', 'theme3', 'theme4', 'theme5', 'theme6', 'theme7'];

function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'theme1';
  document.body.classList.remove('theme2', 'theme3', 'theme4', 'theme5', 'theme6', 'theme7');
  if (t !== 'theme1') document.body.classList.add(t);
  try { localStorage.setItem(THEME_KEY, t); } catch {}
  const sel = $('#theme-select');
  if (sel) sel.value = t;
}

/* ============================== Cloud ============================== */

function cloudMode() { return !!currentUserId(); }

// optimistic sync: state is already updated; report async failures as toasts
function storeSync(promise) {
  if (promise && promise.catch) {
    promise.catch((err) => {
      console.error(err);
      toast('Cloud sync failed: ' + (err.message || err), 'error');
    });
  }
}

function findResultById(id) {
  for (const p of state.prompts) {
    const r = (p.results || []).find((x) => x.id === id);
    if (r) return r;
  }
  return null;
}

function updateAccountUI() {
  const btn = $('#btn-account');
  if (!btn) return;
  if (!authConfigured()) { btn.classList.add('hidden'); btn.classList.remove('inline-flex'); return; }
  btn.classList.remove('hidden');
  btn.classList.add('inline-flex');
  const user = currentUser();
  const label = $('#account-label');
  if (user) {
    label.textContent = '@' + currentDisplayName();
    btn.title = 'Signed in — click to sign out';
  } else {
    label.textContent = 'Sign in';
    btn.title = 'Sign in with username and password';
  }
}

function openAuthModal(mode = 'in') {
  setAuthMode(mode);
  $('#auth-username').value = '';
  $('#auth-password').value = '';
  openModal($('#modal-auth'));
  $('#auth-username').focus();
}

function onAccountClick() {
  const user = currentUser();
  if (!user) { openAuthModal('in'); return; }
  confirmDialog('Sign out?', `Signed in as @${currentDisplayName()}. Your prompts stay saved in the cloud.`, 'Sign out')
    .then((ok) => { if (ok) authSignOut(); });
}

let authMode = 'in';

function setAuthMode(mode) {
  authMode = mode;
  $('#auth-tab-in').classList.toggle('active', mode === 'in');
  $('#auth-tab-up').classList.toggle('active', mode === 'up');
  $('#auth-go').textContent = mode === 'in' ? 'Sign in' : 'Create account';
  $('#auth-password').autocomplete = mode === 'in' ? 'current-password' : 'new-password';
}

async function onAuthSubmit() {
  const username = $('#auth-username').value.trim();
  const password = $('#auth-password').value;
  if (!username || username.length < 3) { toast('Username must be at least 3 characters', 'error'); return; }
  if (!password || password.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }

  const btn = $('#auth-go');
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = authMode === 'in' ? 'Signing in…' : 'Creating account…';
  try {
    if (authMode === 'in') await signInUser(username, password);
    else await signUpUser(username, password);
    // onAuthStateChange drives the rest: modal closes, cloud loads
  } catch (err) {
    toast(err.message || 'Authentication failed', 'error');
  }
  btn.disabled = false;
  btn.textContent = old;
}

async function onUserChanged(user) {
  updateAccountUI();
  if (user) {
    if (!$('#modal-auth').classList.contains('hidden')) closeModal($('#modal-auth'));
    await loadPrompts(user);
    renderGrid();
    maybeOfferMigration(user);
    toast('Signed in — your library is in sync', 'success');
  } else {
    await loadPrompts(null);
    renderGrid();
    toast('Signed out — using the local library on this device', 'info');
  }
}

async function maybeOfferMigration(user) {
  if (localStorage.getItem('pm:migrated-v1') || localStorage.getItem('pm:migration-declined')) return;
  let local = [];
  try { local = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return; }
  if (!Array.isArray(local) || !local.length) { localStorage.setItem('pm:migrated-v1', '1'); return; }
  const ok = await confirmDialog(
    'Import local prompts?',
    `${local.length} prompt(s) found on this device. Upload them to your cloud library so they sync everywhere?`,
    'Import'
  );
  if (!ok) { localStorage.setItem('pm:migration-declined', '1'); return; }
  try {
    toast('Uploading local data to cloud…', 'info');
    await importIntoCloud(local);
    localStorage.setItem('pm:migrated-v1', '1');
    state.prompts = await storeLoadAll();
    renderGrid();
    toast('Local data migrated to your cloud library', 'success');
  } catch (err) {
    console.error(err);
    toast('Migration failed: ' + err.message, 'error');
  }
}

// used by migration and by import (cloud mode): sanitize, fresh uuids,
// upload embedded media to Storage, then persist prompt + results
async function importIntoCloud(list) {
  for (const raw of list) {
    const p = sanitizePrompt(raw);
    const out = { ...p, id: uid(), results: [] };
    for (const r of p.results) {
      const nr = { ...r, id: uid() };
      if (nr.source === 'upload' && nr.dataUrl) {
        const blob = await (await fetch(nr.dataUrl)).blob();
        if (nr.type === 'image') {
          const res = await compressImageUpload(blob);
          nr.storage_path = await storeUploadMedia(res.full, nr.id);
          if (res.thumb) nr.thumb_path = await storeUploadMedia(res.thumb, nr.id + '_t');
        } else {
          nr.storage_path = await storeUploadMedia(blob, nr.id);
          if (nr.type === 'video') {
            const poster = await makeVideoPoster(blob);
            if (poster) nr.thumb_path = await storeUploadMedia(poster, nr.id + '_t');
          }
        }
        delete nr.dataUrl;
      }
      delete nr.dataUrl;
      out.results.push(nr);
    }
    out.updatedAt = Date.now();
    await storeCreatePrompt(out);
    state.prompts.unshift(sanitizePrompt(out));
  }
}

/* =============================== Init ============================== */

async function init() {
  $('#icon-plus').innerHTML = icon('plus');
  $('#icon-plus-2').innerHTML = icon('plus');
  $('#icon-import').innerHTML = icon('upload');
  $('#icon-export').innerHTML = icon('download');
  $('#icon-export-2').innerHTML = icon('download', 'w-5 h-5 text-yellow-400');
  $('#icon-import-2').innerHTML = icon('upload', 'w-5 h-5 text-yellow-400');
  $('#icon-account').innerHTML = icon('user');
  $('#search-icon').innerHTML = icon('search');

  applyTheme((() => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } })() || 'theme1');
  $('#theme-select').addEventListener('change', (e) => applyTheme(e.target.value));

  const user = await authInit();
  await loadPrompts(user);
  wireEvents();
  renderGrid();
  authOnChange(onUserChanged);
  updateAccountUI();
  if (user) maybeOfferMigration(user);
}

init();
