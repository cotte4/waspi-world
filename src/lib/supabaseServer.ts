import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const isServerSupabaseConfigured = Boolean(url && anonKey);
export const hasServiceRole = Boolean(url && serviceRoleKey);

export function createSupabaseServerClient(authToken?: string): SupabaseClient | null {
  if (!isServerSupabaseConfigured) return null;
  return createClient(url, anonKey, authToken
    ? {
        global: {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      }
    : undefined);
}

export function createSupabaseAdminClient(): SupabaseClient | null {
  if (!hasServiceRole) return null;
  return createClient(url, serviceRoleKey);
}

export async function getAuthenticatedUser(authHeader: string | null): Promise<User | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const client = createSupabaseServerClient(token);
  if (!client) return null;

  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}
