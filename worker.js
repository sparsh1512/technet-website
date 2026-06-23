const ADMIN_PASS = 'technet2026';
const KV_KEY = 'catalogue';

function withCORS(resp) {
  resp.headers.set('Access-Control-Allow-Origin', '*');
  resp.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Pass');
  return resp;
}

function json(body, status) {
  return withCORS(new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  }));
}

async function handleCatalogue(request, env) {
  if (!env.CATALOGUE_KV) {
    return json({ error: 'Live database not configured yet. See setup instructions.' }, 500);
  }
  if (request.method === 'OPTIONS') {
    return withCORS(new Response(null, { status: 204 }));
  }
  if (request.method === 'GET') {
    try {
      const stored = await env.CATALOGUE_KV.get(KV_KEY);
      return withCORS(new Response(stored || 'null', {
        headers: { 'Content-Type': 'application/json' }
      }));
    } catch (e) {
      return json({ error: 'Could not read the live catalogue.' }, 500);
    }
  }
  if (request.method === 'POST') {
    const pass = request.headers.get('X-Admin-Pass');
    if (pass !== ADMIN_PASS) {
      return json({ error: 'Unauthorized' }, 401);
    }
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    if (!body || !Array.isArray(body.rows)) {
      return json({ error: 'Expected a JSON object shaped like { rows: [...] }' }, 400);
    }
    await env.CATALOGUE_KV.put(KV_KEY, JSON.stringify(body));
    return json({ ok: true, count: body.rows.length });
  }
  if (request.method === 'DELETE') {
    const pass = request.headers.get('X-Admin-Pass');
    if (pass !== ADMIN_PASS) {
      return json({ error: 'Unauthorized' }, 401);
    }
    await env.CATALOGUE_KV.delete(KV_KEY);
    return json({ ok: true });
  }
  return json({ error: 'Method not allowed' }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/catalogue') {
      return handleCatalogue(request, env);
    }
    return new Response('Not found', { status: 404 });
  }
};
