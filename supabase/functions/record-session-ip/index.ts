import { withSupabase } from 'npm:@supabase/server@1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clientIp(request: Request): string | null {
  // Trust only Cloudflare's platform-maintained client address header. Do not
  // fall back to caller-controllable forwarding headers or request content.
  const candidate = request.headers.get('cf-connecting-ip')?.trim()
  if (!candidate || candidate.length > 64 || !/^[0-9a-fA-F:.]+$/.test(candidate)) return null
  return candidate
}

async function fingerprint(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') return response(405, { error: 'Method not allowed' })
    const ip = clientIp(request)
    const matchSecret = Deno.env.get('IP_MATCH_SECRET')
    if (!context.userClaims?.id) return response(401, { error: 'Sign in required' })
    if (!ip) return response(200, { recorded: false, reason: 'client-ip-unavailable' })
    if (!matchSecret || matchSecret.length < 32) return response(503, { error: 'IP logging is not configured' })

    // Remove legacy school matches even when their raw IP has already expired.
    for (const schoolIp of ['168.9.11.17', '::ffff:168.9.11.17', '168.9.116.17', '::ffff:168.9.116.17']) {
      const excluded = await context.supabaseAdmin.rpc('exclude_school_fingerprint', {school_ip:schoolIp, fingerprint:await fingerprint(schoolIp,matchSecret)})
      if (excluded.error) return response(503,{error:'Moderation exclusion migration required'})
    }
    if (['168.9.11.17','::ffff:168.9.11.17','168.9.116.17','::ffff:168.9.116.17'].includes(ip.toLowerCase())) return response(200,{recorded:false,reason:'shared-school-network'})
    const digest = await fingerprint(ip, matchSecret)
    const { data: recorded, error } = await context.supabaseAdmin.rpc('record_moderation_ip_event', {
      target_user: context.userClaims.id,
      target_ip: ip,
      target_fingerprint: digest,
    })
    if (error) return response(503, { error: 'IP logging is unavailable' })
    return response(200, { recorded: Boolean(recorded) })
  }),
}
