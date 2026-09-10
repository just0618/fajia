const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const token = String(body.token || '');
    if (!env?.FEEDBACK_ADMIN_TOKEN || token !== env.FEEDBACK_ADMIN_TOKEN) {
      return json({ error: 'unauthorized' }, 401);
    }
    const result = await FEEDBACK_KV.list({ prefix: 'feedback_', limit: 50 });
    const records = [];
    for (const item of result.keys || []) {
      const record = await FEEDBACK_KV.get(item.key, { type: 'json' });
      if (record) records.push(record);
    }
    records.sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
    return json({ ok:true, count:records.length, records });
  } catch (err) {
    return json({ error:'server_error' },500);
  }
}
