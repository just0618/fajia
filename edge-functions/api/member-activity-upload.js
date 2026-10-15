import { getStore } from '@edgeone/pages-blob';

const STORE_NAME = 'fajia-member-index';
const ACTIVITY_KEY = 'member-activity/latest.json';
const ALLOWED_GROUP = '761299';
const MAX_MEMBERS = 5000;
const MAX_RECENT = 20;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

const clean = (v, max = 500) => String(v || '').trim().slice(0, max);

function cleanItem(x) {
  const id = clean(x?.item_id, 180);
  if (!id) return null;
  return {
    item_id: id,
    group_id: ALLOWED_GROUP,
    source_key: clean(x?.source_key, 120),
    source_label: clean(x?.source_label, 120),
    source_type: clean(x?.source_type, 40),
    published_at: clean(x?.published_at, 80),
    text: clean(x?.text, 520),
    source_url: clean(x?.source_url, 600),
    reply_to_item_id: clean(x?.reply_to_item_id, 180)
  };
}

export async function onRequestPost({ request, env }) {
  try {
    const text = await request.text();
    if (text.length > 8_000_000) return json({ error: 'payload_too_large' }, 413);

    const body = JSON.parse(text || '{}');
    const token = String(body.token || '');
    if (!env?.MEMBER_INDEX_UPLOAD_TOKEN || token !== env.MEMBER_INDEX_UPLOAD_TOKEN) {
      return json({ error: 'unauthorized' }, 401);
    }

    const incoming = body.index;
    if (!incoming || !incoming.members || typeof incoming.members !== 'object' || Array.isArray(incoming.members)) {
      return json({ error: 'invalid_index' }, 400);
    }

    const entries = Object.entries(incoming.members);
    if (entries.length > MAX_MEMBERS) return json({ error: 'too_many_members' }, 400);

    const members = {};
    let storedItems = 0;

    for (const [rawKey, raw] of entries) {
      const key = clean(rawKey, 160);
      if (!key || !raw || typeof raw !== 'object') continue;

      const seen = new Set();
      const recent = [];
      for (const x of Array.isArray(raw.recent) ? raw.recent : []) {
        if (recent.length >= MAX_RECENT) break;
        const item = cleanItem(x);
        if (!item || seen.has(item.item_id)) continue;
        seen.add(item.item_id);
        recent.push(item);
      }

      members[key] = {
        profile_key: key,
        total_count: Math.max(0, Number(raw.total_count || 0) || 0),
        latest_at: clean(raw.latest_at, 80) || null,
        recent
      };
      storedItems += recent.length;
    }

    const index = {
      schema_version: 1,
      generated_at: clean(incoming.generated_at, 80) || new Date().toISOString(),
      group: { id: ALLOWED_GROUP, name: '法述进修学院（旧组）' },
      policy: { recent_items_per_member: MAX_RECENT, ip_location_uploaded: false },
      stats: {
        profiles_with_activity: Object.keys(members).length,
        stored_recent_items: storedItems
      },
      members
    };

    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    await store.setJSON(ACTIVITY_KEY, index);

    return json({
      ok: true,
      generated_at: index.generated_at,
      profiles_with_activity: Object.keys(members).length,
      stored_recent_items: storedItems
    });
  } catch (err) {
    console.error('member activity upload failed', err);
    return json({ error: 'server_error' }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: true, service: 'fajia-member-activity-upload', schema_version: 1 });
}
