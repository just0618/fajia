import { getStore } from '@edgeone/pages-blob';

const STORE_NAME = 'fajia-member-index';
const INDEX_KEY = 'member-index/latest.json';
const ALLOWED_GROUPS = new Set(['763220', '761299', '761356']);
const DEFAULT_NAMES = {
  '763220': '贺嘉述专组',
  '761299': '旧组',
  '761356': '豆瓣小组 761356'
};
const MAX_MEMBERS = 10000;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

function cleanText(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function cleanMember(raw) {
  const profileKey = cleanText(raw?.profile_key, 160);
  if (!profileKey) return null;

  const groups = Array.isArray(raw?.groups)
    ? [...new Set(raw.groups.map(String).filter((id) => ALLOWED_GROUPS.has(id)))]
    : [];

  return {
    profile_key: profileKey,
    display_name: cleanText(raw?.display_name || raw?.name, 160),
    username: cleanText(raw?.username, 160),
    profile_url: cleanText(raw?.profile_url, 500),
    groups
  };
}

export async function onRequestPost({ request, env }) {
  try {
    const text = await request.text();
    if (text.length > 6_000_000) return json({ error: 'payload_too_large' }, 413);

    const body = JSON.parse(text || '{}');
    const token = String(body.token || '');

    if (!env?.MEMBER_INDEX_UPLOAD_TOKEN || token !== env.MEMBER_INDEX_UPLOAD_TOKEN) {
      return json({ error: 'unauthorized' }, 401);
    }

    const incoming = body.index;
    if (!incoming || !Array.isArray(incoming.members)) {
      return json({ error: 'invalid_index' }, 400);
    }
    if (incoming.members.length > MAX_MEMBERS) {
      return json({ error: 'too_many_members' }, 400);
    }

    const merged = new Map();

    for (const raw of incoming.members) {
      const member = cleanMember(raw);
      if (!member) continue;

      const key = member.profile_key.toLowerCase();
      const previous = merged.get(key);

      if (!previous) {
        merged.set(key, member);
      } else {
        previous.groups = [...new Set([...previous.groups, ...member.groups])];
        if (!previous.display_name && member.display_name) previous.display_name = member.display_name;
        if (!previous.username && member.username) previous.username = member.username;
        if (!previous.profile_url && member.profile_url) previous.profile_url = member.profile_url;
      }
    }

    const generatedAt = cleanText(incoming.generated_at, 80) || new Date().toISOString();
    const groups = {};

    for (const id of ALLOWED_GROUPS) {
      groups[id] = {
        name: cleanText(incoming?.groups?.[id]?.name, 100) || DEFAULT_NAMES[id] || id,
        member_count: Number(incoming?.groups?.[id]?.member_count || 0)
      };
    }

    const index = {
      schema_version: Number(incoming.schema_version || 1),
      generated_at: generatedAt,
      groups,
      members: [...merged.values()]
    };

    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    await store.setJSON(INDEX_KEY, index);

    return json({
      ok: true,
      generated_at: index.generated_at,
      unique_members: index.members.length,
      group_counts: Object.fromEntries(
        Object.entries(index.groups).map(([id, meta]) => [id, meta.member_count])
      )
    });
  } catch (err) {
    console.error('member index upload failed', err);
    return json({ error: 'server_error' }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: true, service: 'fajia-member-index-upload' });
}
