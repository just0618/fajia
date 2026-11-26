const backend = 'https://data.fajia.online';

function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  if (url.pathname === '/cards') {
    return new Response(null, {
      status: 308,
      headers: { Location: '/cards/' + url.search, 'Cache-Control': 'no-store' },
    });
  }
  if (!/^\/cards\/[a-zA-Z0-9/._-]*$/.test(url.pathname)) {
    return errorResponse(404, '页面不存在');
  }
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD, POST', 'Cache-Control': 'no-store' } });
  }

  const headers = new Headers();
  for (const name of ['Content-Type', 'Origin']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookie = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)(kache=[a-f0-9]{48})(?=;|$)/);
  if (cookie) headers.set('Cookie', cookie[1]);

  try {
    const upstream = await fetch(backend + url.pathname + url.search, {
      method: request.method === 'HEAD' ? 'GET' : request.method,
      headers,
      body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
    });
    const outgoing = new Headers({ 'Cache-Control': 'private, no-store' });
    for (const name of ['Content-Type', 'X-Content-Type-Options', 'Referrer-Policy']) {
      const value = upstream.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    const session = upstream.headers.get('Set-Cookie');
    if (session && session.startsWith('kache=')) outgoing.set('Set-Cookie', session);
    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers: outgoing,
    });
  } catch {
    return errorResponse(502, '小卡车站暂时无法连接，请稍后重试');
  }
}
