const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

function validSubmissionId(id) {
  return /^fb_[a-f0-9]{24}$/.test(id || '');
}

export async function onRequestPost({ request }) {
  try {
    const text = await request.text();
    if (text.length > 50000) return json({ error: 'payload_too_large' }, 413);
    const body = JSON.parse(text || '{}');

    // Lightweight bot trap. The normal page always submits an empty honeypot.
    if (body.honeypot) return json({ ok: true });
    if (!validSubmissionId(body.submission_id)) return json({ error: 'invalid_submission_id' }, 400);
    if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
      return json({ error: 'invalid_answers' }, 400);
    }

    const key = `feedback_${body.submission_id.replace('fb_', '')}`;
    const previous = await FEEDBACK_KV.get(key, { type: 'json' });
    const now = new Date().toISOString();
    const record = {
      submission_id: body.submission_id,
      created_at: previous?.created_at || now,
      updated_at: now,
      client_version: String(body.client_version || '').slice(0, 80),
      answers: body.answers
    };

    await FEEDBACK_KV.put(key, JSON.stringify(record));
    return json({ ok: true, updated_at: now });
  } catch (err) {
    return json({ error: 'server_error' }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: true, service: 'fajia-feedback' });
}
