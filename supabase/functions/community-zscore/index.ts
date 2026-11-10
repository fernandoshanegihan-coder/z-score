const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Expose-Headers': 'Retry-After'
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getDatabaseKey() {
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  return keys.default || Object.values(keys)[0] || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

async function callDatabaseFunction(name: string, payload?: unknown) {
  const projectUrl = Deno.env.get('SUPABASE_URL');
  const secretKey = getDatabaseKey();
  if (!projectUrl || !secretKey) throw new Error('Community storage is not configured.');

  const result = await fetch(`${projectUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });
  if (!result.ok) throw new Error('Community storage could not complete the request.');
  return result.json();
}

async function makeRateLimitKey(request: Request, secretKey: string) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientAddress = forwardedFor?.split(',')[0]?.trim();
  if (!clientAddress) throw new Error('Client address is unavailable.');

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(clientAddress));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method === 'GET') {
    try {
      await callDatabaseFunction('cleanup_community_review_data');
      const stats = await callDatabaseFunction('get_community_stats');
      return response({ stats });
    } catch {
      return response({ error: 'Community estimates are temporarily unavailable.' }, 503);
    }
  }
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 2048) return response({ error: 'Submission is too large.' }, 413);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response({ error: 'Invalid submission.' }, 400);
  }

  if (body.website) return response({ error: 'Invalid submission.' }, 400);
  if (body.consent !== true) return response({ error: 'Consent is required.' }, 400);
  if (typeof body.submissionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.submissionId)) {
    return response({ error: 'Invalid submission.' }, 400);
  }
  if (!Array.isArray(body.marks) || body.marks.length !== 3) {
    return response({ error: 'Choose three subjects before contributing.' }, 400);
  }

  try {
    const secretKey = getDatabaseKey();
    if (!secretKey) throw new Error('Community storage is not configured.');
    const rateKey = await makeRateLimitKey(request, secretKey);
    const allowed = await callDatabaseFunction('check_community_rate_limit', { p_rate_key: rateKey });
    if (!allowed) {
      return response({ error: 'Too many contributions from this network. Please try again later.' }, 429);
    }

    const status = await callDatabaseFunction('add_community_marks', {
      p_submission_id: body.submissionId,
      p_marks: body.marks
    });
    return response({ status });
  } catch {
    return response({ error: 'Your marks could not be added. Your calculator result is still available.' }, 503);
  }
});
