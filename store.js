/* =====================================================================
   Cloud data layer (Supabase). All functions assume a signed-in user
   (auth.currentUserId()). Shapes match app.js:
   prompt  { id, title, model, prompt, notes, tags[], favorite, createdAt,
             updatedAt, results[] }
   result  { id, type image|video|webview, source upload|url|html, name,
             size, mime, url?, html?, storage_path? }
   ===================================================================== */

const MEDIA_BUCKET = 'media';

function sb() { return window.pmSupabase; }

function sbUserId() {
  const id = currentUserId();
  if (!id) throw new Error('Not signed in');
  return id;
}

/* ---------- row <-> shape mapping ---------- */

function rowToResult(r) {
  return {
    id: r.id,
    type: r.type,
    source: r.source,
    name: r.name || '',
    size: Number(r.size) || 0,
    mime: r.mime || '',
    ...(r.url ? { url: r.url } : {}),
    ...(r.html ? { html: r.html } : {}),
    ...(r.storage_path ? { storage_path: r.storage_path } : {}),
    ...(r.thumb_path ? { thumb_path: r.thumb_path } : {}),
  };
}

function rowToPrompt(row, results, ownerUsername) {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    model: row.model || '',
    prompt: row.prompt || '',
    notes: row.notes || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    favorite: !!row.favorite,
    createdAt: Date.parse(row.created_at) || Date.now(),
    updatedAt: Date.parse(row.updated_at) || Date.now(),
    ...(ownerUsername ? { owner: ownerUsername } : {}),
    results,
  };
}

function promptToRow(p) {
  return {
    id: p.id,
    user_id: sbUserId(),
    title: p.title,
    model: p.model || '',
    prompt: p.prompt || '',
    notes: p.notes || '',
    tags: p.tags || [],
    favorite: !!p.favorite,
    created_at: new Date(p.createdAt || Date.now()).toISOString(),
    updated_at: new Date(p.updatedAt || Date.now()).toISOString(),
  };
}

function resultToRow(r, promptId, position) {
  return {
    id: r.id,
    user_id: sbUserId(),
    prompt_id: promptId,
    type: r.type,
    source: r.source,
    name: r.name || '',
    size: Number(r.size) || 0,
    mime: r.mime || '',
    url: r.url || null,
    html: r.html || null,
    storage_path: r.storage_path || null,
    thumb_path: r.thumb_path || null,
    position: position || 0,
    created_at: new Date(r.createdAt || Date.now()).toISOString(),
  };
}

/* ---------- load ---------- */

async function storeLoadAll() {
  const [pr, rr, pf] = await Promise.all([
    sb().from('prompts').select('*').order('updated_at', { ascending: false }),
    sb().from('results').select('*').order('position', { ascending: true }),
    sb().from('profiles').select('id,username'),
  ]);
  if (pr.error) throw pr.error;
  if (rr.error) throw rr.error;
  if (pf.error) throw pf.error;

  const usernameById = new Map((pf.data || []).map((x) => [x.id, x.username]));
  const byPrompt = new Map();
  for (const r of rr.data || []) {
    if (!byPrompt.has(r.prompt_id)) byPrompt.set(r.prompt_id, []);
    byPrompt.get(r.prompt_id).push(rowToResult(r));
  }
  return (pr.data || []).map((row) => rowToPrompt(row, byPrompt.get(row.id) || [], usernameById.get(row.user_id)));
}

/* ---------- prompts ---------- */

async function storeCreatePrompt(p) {
  const { error } = await sb().from('prompts').insert(promptToRow(p));
  if (error) throw error;
  if (p.results && p.results.length) {
    const rows = p.results.map((r, i) => resultToRow(r, p.id, i));
    const ins = await sb().from('results').insert(rows);
    if (ins.error) throw ins.error;
  }
}

async function storeUpdatePrompt(id, fields) {
  const patch = { updated_at: new Date().toISOString() };
  if ('title' in fields) patch.title = fields.title;
  if ('model' in fields) patch.model = fields.model;
  if ('prompt' in fields) patch.prompt = fields.prompt;
  if ('notes' in fields) patch.notes = fields.notes;
  if ('tags' in fields) patch.tags = fields.tags;
  if ('favorite' in fields) patch.favorite = !!fields.favorite;
  const { error } = await sb().from('prompts').update(patch).eq('id', id);
  if (error) throw error;
}

async function storeDeletePrompt(p) {
  // remove media files first (results cascade-deletes in the DB)
  for (const r of p.results || []) {
    const paths = [r.storage_path, r.thumb_path].filter(Boolean);
    if (r.source === 'upload' && paths.length) {
      try { await sb().storage.from(MEDIA_BUCKET).remove(paths); } catch (e) { console.warn(e); }
    }
  }
  const { error } = await sb().from('prompts').delete().eq('id', p.id);
  if (error) throw error;
}

async function storeDeleteAllCloud() {
  const prompts = await storeLoadAll();
  for (const p of prompts) {
    for (const r of p.results) {
      if (r.source === 'upload' && r.storage_path) {
        try { await sb().storage.from(MEDIA_BUCKET).remove([r.storage_path]); } catch (e) { console.warn(e); }
      }
    }
  }
  const uid = sbUserId();
  const { error } = await sb().from('prompts').delete().eq('user_id', uid);
  if (error) throw error;
}

/* ---------- results ---------- */

async function storeInsertResult(promptId, r, position) {
  const { error } = await sb().from('results').insert(resultToRow(r, promptId, position));
  if (error) throw error;
}

async function storeDeleteResult(r) {
  const paths = [r.storage_path, r.thumb_path].filter(Boolean);
  if (paths.length) {
    try { await sb().storage.from(MEDIA_BUCKET).remove(paths); } catch (e) { console.warn(e); }
  }
  const { error } = await sb().from('results').delete().eq('id', r.id);
  if (error) throw error;
}

/* ---------- media storage ---------- */

async function storeUploadMedia(fileOrBlob, resultId) {
  const path = sbUserId() + '/' + resultId;
  const contentType = fileOrBlob.type || 'application/octet-stream';
  const { error } = await sb().storage.from(MEDIA_BUCKET).upload(path, fileOrBlob, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

function storePublicUrl(path) {
  if (!path || !sb()) return null;
  return sb().storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
