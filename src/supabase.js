import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabaseClient = url && publishableKey ? createClient(url, publishableKey) : null;
export const supabaseConfigReady = Boolean(supabaseClient);

const fields = 'id,title,saga,synopsis,completeness,american_issues,original_year,is_read,price,cover,art,sort_order';
const normalizeComic = (row) => ({ ...row, is_read: Boolean(row.is_read), american_issues: Array.isArray(row.american_issues) ? row.american_issues : JSON.parse(row.american_issues || '[]') });
const result = (data, error, status = error ? 400 : 200) => ({ ok: !error, status, json: async () => error ? { error: error.message || String(error) } : data });

async function saveImage(data, prefix) {
  if (!data || !String(data).startsWith('data:')) return data || null;
  const match = String(data).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Formato de imagem inválido.');
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  if (bytes.length > 8 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 8 MB.');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[match[1]];
  const name = `${prefix}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseClient.storage.from('covers').upload(name, new Blob([bytes], { type: match[1] }), { upsert: false, contentType: match[1] });
  if (error) throw error;
  return supabaseClient.storage.from('covers').getPublicUrl(name).data.publicUrl;
}

async function getComics() {
  const { data, error } = await supabaseClient.from('comics').select(fields).order('sort_order').order('id');
  if (error) throw error;
  return data.map(normalizeComic);
}

async function syncIssues(comicId, rawIssues) {
  const titles = [...new Set(rawIssues.map((item) => String(item).trim()).filter(Boolean))];
  if (!titles.length) {
    const { error } = await supabaseClient.from('comic_american').delete().eq('comic_id', comicId);
    if (error) throw error;
    return;
  }
  const { data: current, error: loadError } = await supabaseClient.from('american_issues').select('id,title,sort_order').in('title', titles);
  if (loadError) throw loadError;
  const known = new Set((current || []).map((issue) => issue.title));
  const missing = titles.filter((title) => !known.has(title));
  if (missing.length) {
    const maxOrder = Math.max(0, ...(current || []).map((issue) => Number(issue.sort_order) || 0));
    const { error } = await supabaseClient.from('american_issues').upsert(missing.map((title, index) => ({ title, sort_order: maxOrder + index + 1 })), { onConflict: 'title', ignoreDuplicates: true });
    if (error) throw error;
  }
  const { data: allIssues, error: issueError } = await supabaseClient.from('american_issues').select('id,title').in('title', titles);
  if (issueError) throw issueError;
  const { error: deleteError } = await supabaseClient.from('comic_american').delete().eq('comic_id', comicId);
  if (deleteError) throw deleteError;
  const links = (allIssues || []).map((issue) => ({ comic_id: comicId, issue_id: issue.id }));
  if (links.length) {
    const { error } = await supabaseClient.from('comic_american').upsert(links, { onConflict: 'comic_id,issue_id' });
    if (error) throw error;
  }
}

export async function apiFetch(input, options = {}) {
  if (!supabaseClient) return result(null, new Error('Supabase não configurado.'), 503);
  const url = new URL(input, window.location.origin);
  const path = url.pathname;
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  try {
    if (path.startsWith('/api/comicvine/')) {
      const { data, error } = await supabaseClient.functions.invoke('comicvine', { body: { action: path.endsWith('/search') ? 'search' : 'image', ...body } });
      return result(data, error);
    }
    if (path === '/api/comics' && method === 'GET') {
      let rows = await getComics();
      const { q = '', status = 'all', saga = 'all', year = 'all' } = Object.fromEntries(url.searchParams);
      if (q) { const needle = q.toLocaleLowerCase('pt-BR'); rows = rows.filter((row) => [row.title, row.saga, row.original_year, ...row.american_issues].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(needle)); }
      if (status === 'read') rows = rows.filter((row) => row.is_read);
      if (status === 'unread') rows = rows.filter((row) => !row.is_read);
      if (saga !== 'all') rows = rows.filter((row) => row.saga === saga);
      if (year !== 'all') rows = rows.filter((row) => String(row.original_year || '') === year);
      return result(rows);
    }
    if (path === '/api/stats') { const rows = await getComics(); const read = rows.filter((row) => row.is_read).length; return result({ total: rows.length, read, unread: rows.length - read }); }
    if (path === '/api/sagas' || path === '/api/years') { const rows = await getComics(); const values = [...new Set(rows.map((row) => path.endsWith('sagas') ? row.saga : row.original_year).filter((value) => value?.trim()))]; return result(values.sort()); }
    if (path === '/api/comics' && method === 'POST') {
      if (!body.title?.trim() || !Array.isArray(body.american_issues)) throw new Error('Título e lista de revistas são obrigatórios.');
      const rows = await getComics();
      const cover = await saveImage(body.cover, 'cover');
      const { data, error } = await supabaseClient.from('comics').insert({ title: body.title.trim(), saga: body.saga || '', synopsis: body.synopsis || '', american_issues: body.american_issues, original_year: body.original_year || '', is_read: !!body.is_read, cover, sort_order: Math.max(0, ...rows.map((row) => Number(row.sort_order) || 0)) + 1 }).select(fields).single();
      if (error) throw error;
      await syncIssues(data.id, body.american_issues);
      return result({ ok: true, comic: normalizeComic(data) }, null, 201);
    }
    const comicMatch = path.match(/^\/api\/comics\/(\d+)(?:\/(read))?$/);
    if (comicMatch && method === 'PUT') {
      const id = Number(comicMatch[1]);
      if (!body.title?.trim() || !Array.isArray(body.american_issues)) throw new Error('Título e lista de revistas são obrigatórios.');
      const { data: old, error: oldError } = await supabaseClient.from('comics').select('cover').eq('id', id).single();
      if (oldError) throw oldError;
      const cover = body.cover === undefined ? old.cover : await saveImage(body.cover, 'cover');
      const { data, error } = await supabaseClient.from('comics').update({ title: body.title.trim(), saga: body.saga || '', synopsis: body.synopsis || '', american_issues: body.american_issues, original_year: body.original_year || '', is_read: !!body.is_read, cover }).eq('id', id).select(fields).single();
      if (error) throw error;
      await syncIssues(id, body.american_issues);
      return result({ ok: true, comic: normalizeComic(data) });
    }
    if (comicMatch && comicMatch[2] && method === 'PATCH') { const { error } = await supabaseClient.from('comics').update({ is_read: body.is_read }).eq('id', Number(comicMatch[1])); if (error) throw error; return result({ ok: true }); }
    if (path === '/api/comics/bulk-covers' && method === 'POST') {
      for (const item of body.items || []) { const cover = await saveImage(item.cover, 'cover'); const { error } = await supabaseClient.from('comics').update({ cover }).eq('id', Number(item.id)); if (error) throw error; }
      return result({ ok: true, updated: body.items?.length || 0 });
    }
    if (path === '/api/comics/reorder' && method === 'POST') { for (const [index, id] of (body.ids || []).entries()) { const { error } = await supabaseClient.from('comics').update({ sort_order: index + 1 }).eq('id', Number(id)); if (error) throw error; } return result({ ok: true }); }
    if (path === '/api/american' && method === 'GET') {
      const [{ data: issues, error }, { data: links, error: linkError }] = await Promise.all([supabaseClient.from('american_issues').select('*').order('sort_order').order('title'), supabaseClient.from('comic_american').select('issue_id')]);
      if (error) throw error; if (linkError) throw linkError;
      const counts = new Map(); for (const link of links || []) counts.set(link.issue_id, (counts.get(link.issue_id) || 0) + 1);
      const q = url.searchParams.get('q')?.toLocaleLowerCase('pt-BR') || '';
      return result((issues || []).map((issue) => ({ ...issue, collection_count: counts.get(issue.id) || 0 })).filter((issue) => issue.title.toLocaleLowerCase('pt-BR').includes(q) || String(issue.publication_year || '').includes(q)));
    }
    if (path === '/api/american' && method === 'POST') {
      if (!body.title?.trim()) throw new Error('Informe o título americano.');
      const { data: rows, error: loadError } = await supabaseClient.from('american_issues').select('sort_order'); if (loadError) throw loadError;
      const cover = await saveImage(body.cover, 'american');
      const { error } = await supabaseClient.from('american_issues').insert({ title: body.title.trim(), publication_year: body.publication_year ?? null, cover, sort_order: Math.max(0, ...(rows || []).map((row) => Number(row.sort_order) || 0)) + 1 }); if (error) throw error;
      return result({ ok: true }, null, 201);
    }
    const issueMatch = path.match(/^\/api\/american\/(\d+)$/);
    if (issueMatch && method === 'PUT') {
      const id = Number(issueMatch[1]); const { data: old, error: oldError } = await supabaseClient.from('american_issues').select('*').eq('id', id).single(); if (oldError) throw oldError;
      const title = (body.title || old.title).trim(), cover = body.cover === undefined ? old.cover : await saveImage(body.cover, 'american');
      const { error } = await supabaseClient.from('american_issues').update({ title, publication_year: Object.hasOwn(body, 'publication_year') ? body.publication_year : old.publication_year, cover }).eq('id', id); if (error) throw error;
      if (title !== old.title) { const comics = await getComics(); for (const comic of comics.filter((item) => item.american_issues.includes(old.title))) { const american_issues = comic.american_issues.map((item) => item === old.title ? title : item); const { error: updateError } = await supabaseClient.from('comics').update({ american_issues }).eq('id', comic.id); if (updateError) throw updateError; await syncIssues(comic.id, american_issues); } }
      return result({ ok: true });
    }
    return result(null, new Error(`Rota não suportada: ${method} ${path}`), 404);
  } catch (error) { return result(null, error); }
}
