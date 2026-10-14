import { getStore } from '@edgeone/pages-blob';

const STORE_NAME = 'fajia-member-index';
const INDEX_KEY = 'member-index/latest.json';
const MAX_RESULTS = 20;
const ALLOWED_GROUPS = new Set(['763220', '761299', '761356']);

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  }
});

const norm = (value) => String(value || '').trim().toLowerCase();

function extractProfileKey(query) {
  const text = String(query || '').trim();
  const match = text.match(/douban\.com\/people\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function trackedGroups(groupMeta = {}) {
  return Object.entries(groupMeta)
    .filter(([id]) => ALLOWED_GROUPS.has(String(id)))
    .map(([id, meta]) => ({
      id: String(id),
      name: String(meta?.name || id),
      member_count: Number(meta?.member_count || 0)
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function compactMember(member, groupMeta = {}) {
  const groupIds = Array.isArray(member.groups)
    ? member.groups.map(String).filter((id) => ALLOWED_GROUPS.has(id))
    : [];

  return {
    profile_key: String(member.profile_key || ''),
    display_name: String(member.display_name || member.name || ''),
    username: String(member.username || ''),
    profile_url: String(member.profile_url || ''),
    groups: groupIds.map((id) => ({
      id,
      name: groupMeta?.[id]?.name || id,
      is_member: true
    }))
  };
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const token = String(body.token || '');
    const query = String(body.query || '').trim();

    if (!env?.MEMBER_CHECK_TOKEN || token !== env.MEMBER_CHECK_TOKEN) {
      return json({ error: 'unauthorized' }, 401);
    }

    if (!query || query.length > 200) {
      return json({ error: 'invalid_query' }, 400);
    }

    const profileKey = extractProfileKey(query);
    if (!profileKey && query.length < 2) {
      return json({ error: 'query_too_short' }, 400);
    }

    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    const index = await store.get(INDEX_KEY, { type: 'json', consistency: 'strong' });

    if (!index || !Array.isArray(index.members)) {
      return json({ error: 'index_not_ready' }, 503);
    }

    const q = norm(profileKey || query);
    const scored = [];

    for (const member of index.members) {
      const key = norm(member.profile_key);
      const name = norm(member.display_name || member.name);
      const username = norm(member.username);
      const url = norm(member.profile_url);

      let score = 0;
      if (profileKey && key === q) score = 100;
      else if (key === q || username === q) score = 95;
      else if (name === q) score = 90;
      else if (name.startsWith(q) || username.startsWith(q) || key.startsWith(q)) score = 70;
      else if (name.includes(q) || username.includes(q) || key.includes(q) || url.includes(q)) score = 50;

      if (score) scored.push({ score, member });
    }

    scored.sort((a, b) =>
      b.score - a.score ||
      String(a.member.display_name || '').localeCompare(String(b.member.display_name || ''), 'zh-CN')
    );

    const matches = scored
      .slice(0, MAX_RESULTS)
      .map(({ member }) => compactMember(member, index.groups || {}));

    return json({
      ok: true,
      query,
      generated_at: index.generated_at || null,
      tracked_groups: trackedGroups(index.groups || {}),
      total_matches: scored.length,
      truncated: scored.length > MAX_RESULTS,
      matches
    });
  } catch (err) {
    console.error('member check failed', err);
    return json({ error: 'server_error' }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: true, service: 'fajia-member-check' });
}
