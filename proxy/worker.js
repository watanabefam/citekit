/**
 * CORS passthrough for the scholarly APIs that send no CORS headers
 * (Semantic Scholar Graph API, arXiv API) — so CiteKit, a static page with
 * no backend, can reach them.
 *
 * Built to Cloudflare's own CORS-proxy example plus the safety rules that example
 * leaves to you:
 *
 *  1. Answer the CORS preflight at the edge (204); NEVER proxy OPTIONS upstream. A
 *     proxied preflight reaches an origin that returns 405/no CORS headers, and the
 *     browser then blocks the real request.
 *  2. TARGET allowlist — the strongest control. Even if every other lock is
 *     bypassed, the proxy can only reach hosts listed here, so it is useless as a
 *     general-purpose relay.
 *  3. ORIGIN allowlist. A browser sets Origin and page JS cannot forge it, so this
 *     stops other sites piggybacking on your proxy from their users' browsers.
 *     It does NOT stop a script — a non-browser client can send any Origin. The
 *     target allowlist is what covers that case.
 *  4. Never reflect Origin unconditionally: `ACAO = request.headers.get('Origin')`
 *     with no check makes this an open relay, and with Allow-Credentials: true that
 *     would expose authenticated data to any page.
 *  5. Strip headers that must not be forwarded (cookies, Origin/Referer, the
 *     platform's CF-* headers) and never leak Set-Cookie back out.
 *  6. Cache successful GETs at the edge and set `Vary: Origin` so Cloudflare never
 *     serves one origin's cached response to a different origin.
 *
 * Honest limitation: a proxy called from the browser cannot keep a secret — anything
 * the browser sends is visible in devtools. X-Proxy-Key raises the bar for scripted
 * abuse; the target allowlist is the real boundary.
 */

// Which websites may call this proxy. Add your own origins; ["*"] is wide open.
const ALLOWED_ORIGINS = ['*'];

// Which hosts this proxy may fetch — narrow this to just what the app needs.
const ALLOWED_TARGETS = [
  'api.semanticscholar.org',
  'export.arxiv.org',
  'api.core.ac.uk',        // optional keyless CORE fallback hop (same small quota)
];

const ALLOWED_METHODS = ['GET', 'HEAD'];
const CACHE_SECONDS = 300;

function originAllowed(origin) {
  if (ALLOWED_ORIGINS.includes('*')) return true;
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

function targetAllowed(targetUrl) {
  let host;
  try { host = new URL(targetUrl).hostname.toLowerCase(); } catch { return false; }
  return ALLOWED_TARGETS.some(d => host === d || host.endsWith('.' + d));
}

function corsHeaders(origin) {
  const open = ALLOWED_ORIGINS.includes('*');
  const h = {
    'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', '),
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Accept, X-Proxy-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  // Echo only a validated origin. A wildcard is acceptable here because these APIs
  // are unauthenticated and no credentials are forwarded either way.
  if (open) h['Access-Control-Allow-Origin'] = '*';
  else if (origin && ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  });

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    // 1. Preflight: answered here and nowhere else.
    if (request.method === 'OPTIONS') {
      if (origin && request.headers.get('Access-Control-Request-Method'))
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      return new Response(null, { status: 204, headers: { Allow: ALLOWED_METHODS.join(', ') } });
    }

    // 3. Origin lock — reject before doing any work.
    if (!originAllowed(origin)) return json({ error: 'Origin not allowed' }, 403, origin);

    // Optional shared secret for scripted callers (wrangler secret put PROXY_KEY).
    if (env && env.PROXY_KEY && request.headers.get('X-Proxy-Key') !== env.PROXY_KEY)
      return json({ error: 'Missing or invalid X-Proxy-Key' }, 401, origin);

    if (!ALLOWED_METHODS.includes(request.method))
      return json({ error: 'Method not allowed', allowed: ALLOWED_METHODS }, 405, origin);

    // Accept the target in either form the app can emit:
    //   ?url=/?uri=<encoded>            (an S.proxy setting containing a {url} placeholder)
    //   /<encoded-target>               (a bare base URL pasted into Settings)
    // Supporting only the query form 400s the most obvious configuration there is.
    let target = url.searchParams.get('url') || url.searchParams.get('uri');
    if (!target) {
      const raw = url.pathname.replace(/^\/+/, '');
      if (raw) { try { target = decodeURIComponent(raw); } catch { target = null; } }
    }
    if (!target)
      return json({
        name: 'citekit scholarly proxy',
        usage: [`${url.origin}/?url=<encoded-target-url>`, `${url.origin}/<encoded-target-url>`],
        allowedTargets: ALLOWED_TARGETS,
      }, 400, origin);

    // Re-attach any caller params (other than the target selector) to the target, so a client
    // that appends query params after proxying is not silently served a different request.
    {
      const extra = [...url.searchParams.entries()].filter(([k]) => k !== 'url' && k !== 'uri');
      if (extra.length) {
        const tu = new URL(target);
        for (const [k, v] of extra) tu.searchParams.set(k, v);
        target = tu.toString();
      }
    }

    // 2. Target lock — the real boundary.
    if (!targetAllowed(target))
      return json({ error: 'Target host not allowed', allowedTargets: ALLOWED_TARGETS }, 403, origin);

    // 6. Edge cache (GET only).
    const cache = caches.default;
    const cacheKey = new Request('https://proxy.cache.invalid/' + encodeURIComponent(target), { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) {
      const out = new Response(hit.body, hit);
      for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
      out.headers.set('X-Proxy-Cache', 'HIT');
      return out;
    }

    // 5. Forward only what is safe; keys stay server-side.
    const upstreamHeaders = new Headers();
    const accept = request.headers.get('Accept');
    if (accept) upstreamHeaders.set('Accept', accept);
    if (target.includes('semanticscholar.org') && env && env.S2_KEY) upstreamHeaders.set('x-api-key', env.S2_KEY);
    if (target.includes('core.ac.uk') && env && env.CORE_KEY) upstreamHeaders.set('Authorization', 'Bearer ' + env.CORE_KEY);
    upstreamHeaders.set('User-Agent', 'citekit/1.0 (scholarly search proxy)');

    let upstream;
    try {
      upstream = await fetch(target, { method: 'GET', headers: upstreamHeaders, redirect: 'follow' });
    } catch (err) {
      return json({ error: 'Upstream fetch failed', message: String((err && err.message) || err) }, 502, origin);
    }

    const respHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin))) respHeaders.set(k, v);
    respHeaders.set('Access-Control-Expose-Headers', '*');
    respHeaders.delete('set-cookie');            // never leak cookies through a proxy
    respHeaders.delete('content-security-policy');
    respHeaders.delete('x-frame-options');
    // Strip upstream cache-metadata. The killer is `Age`: a CDN-fronted API can return
    // Age older than our max-age, and the Cache API then refuses to store a response it
    // considers already stale — so every request stays a MISS. This proxy re-serves the
    // body fresh under its own Cache-Control, so upstream age/via/CDN headers are lies here.
    for (const h of ['age', 'via', 'x-cache', 'x-cache-hits', 'x-served-by', 'x-timer', 'strict-transport-security'])
      respHeaders.delete(h);
    if (upstream.ok) respHeaders.set('Cache-Control', `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`);
    respHeaders.set('X-Proxy-Cache', 'MISS');

    const response = new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: respHeaders });
    // Clone BEFORE returning: cloning inside waitUntil races the client reading the body,
    // and a clone of an already-consumed stream throws — which silently loses the cache
    // write and turns every request into a MISS (this bug was caught by the cache test).
    if (upstream.ok && ctx && ctx.waitUntil) {
      const forCache = response.clone();
      ctx.waitUntil(cache.put(cacheKey, forCache).catch(e => console.log('CACHE PUT FAILED ' + cacheKey.url + ' :: ' + (e && e.message))));
    }
    return response;
  },
};
