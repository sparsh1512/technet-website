// ============================================================================
// Cloudflare Pages Function: /api/catalogue
//
// This is the small "database" that makes an owner-uploaded stock sheet
// visible to EVERY visitor of the website, not just the browser that
// published it. It stores one JSON blob (the current product catalogue) in
// a Cloudflare KV namespace.
//
//   GET    /api/catalogue   -> public. Returns the currently published
//                              catalogue, or the JSON value `null` if the
//                              owner hasn't published a custom sheet (the
//                              site then falls back to its built-in products).
//   POST   /api/catalogue   -> protected by the admin passcode. Replaces the
//                              published catalogue with the body sent.
//   DELETE /api/catalogue   -> protected by the admin passcode. Clears the
//                              published catalogue (site reverts to default).
//
// SETUP REQUIRED (one-time, in the Cloudflare dashboard):
//   1. Create a KV namespace (e.g. named "technet-catalogue").
//   2. Open this Pages/Workers project -> Settings -> Bindings (or
//      Functions -> KV namespace bindings on older dashboards).
//   3. Add a binding with variable name exactly:  CATALOGUE_KV
//      pointing at the namespace you created in step 1.
//   4. Re-deploy (upload this "functions" folder alongside index.html).
//
// Until that binding exists, GET will return a friendly 500 error and the
// website will simply keep using its local/default data — nothing breaks.
// ============================================================================

// IMPORTANT: keep this identical to ADMIN_PASS in index.html. It's the same
// passcode used to unlock the Admin panel on the site. Note this is a simple
// shared-secret check, not full authentication — anyone who reads the page's
// source can see this value, same as today. It's meant to stop accidental or
// casual writes to the public catalogue, not a determined attacker.
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

export async function onRequestOptions() {
  return withCORS(new Response(null, { status: 204 }));
}

export async function onRequestGet({ env }) {
  if (!env.CATALOGUE_KV) {
    return json({ error: 'Live database not configured yet. See setup instructions.' }, 500);
  }
  try {
    const stored = await env.CATALOGUE_KV.get(KV_KEY);
    return withCORS(new Response(stored || 'null', {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (e) {
    return json({ error: 'Could not read the live catalogue.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.CATALOGUE_KV) {
    return json({ error: 'Live database not configured yet. See setup instructions.' }, 500);
  }
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

export async function onRequestDelete({ request, env }) {
  if (!env.CATALOGUE_KV) {
    return json({ error: 'Live database not configured yet. See setup instructions.' }, 500);
  }
  const pass = request.headers.get('X-Admin-Pass');
  if (pass !== ADMIN_PASS) {
    return json({ error: 'Unauthorized' }, 401);
  }
  await env.CATALOGUE_KV.delete(KV_KEY);
  return json({ ok: true });
}
