import { getStore } from '@edgeone/pages-blob';

const STORE_NAME = 'fajia-feedback';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const token = String(body.token || '');

    if (!env?.FEEDBACK_ADMIN_TOKEN || token !== env.FEEDBACK_ADMIN_TOKEN) {
      return json({ error: 'unauthorized' }, 401);
    }

    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    const result = await store.list({ prefix: 'responses/', consistency: 'strong' });
    const records = [];

    for (const item of result.blobs || []) {
      const record = await store.get(item.key, { type: 'json', consistency: 'strong' });
      if (record) records.push(record);
    }

    records.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    return json({ ok: true, count: records.length, records });
  } catch (err) {
    console.error('feedback admin read failed', err);
    return json({ error: 'server_error' }, 500);
  }
}
