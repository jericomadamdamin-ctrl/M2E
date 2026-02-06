import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export function getUserClient(authHeader: string | null) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });
}

export async function requireUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }
  const token = authHeader.replace('Bearer', '').trim();
  if (!token) {
    throw new Error('Invalid session token');
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('app_sessions')
    .select('user_id, expires_at')
    .eq('token', token)
    .single();

  if (error || !data?.user_id) {
    throw new Error('Invalid session token');
  }

  const expiresAt = new Date(data.expires_at).getTime();
  if (Number.isFinite(expiresAt) && Date.now() > expiresAt) {
    throw new Error('Session expired');
  }

  return data.user_id;
}

export async function requireAdmin(userId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();
  if (error || !data?.is_admin) {
    throw new Error('Admin privileges required');
  }
}

export async function createSession(userId: string, ttlHours = 24 * 30) {
  const admin = getAdminClient();
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  const { error } = await admin
    .from('app_sessions')
    .insert({ token, user_id: userId, expires_at: expiresAt });

  if (error) {
    throw new Error('Failed to create session');
  }

  return { token, expires_at: expiresAt };
}

export async function requireHuman(userId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('is_human_verified')
    .eq('id', userId)
    .single();
  if (error || !data?.is_human_verified) {
    throw new Error('Human verification required');
  }
}
