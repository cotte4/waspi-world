// authHelper.ts
// Shared helper for building Authorization headers from the current Supabase session.
// Used by singleton game systems (SkillSystem, GuildSystem, MasterySystem, ContractSystem)
// that need to make authenticated API calls without having a direct reference to a scene.

import { supabase, isConfigured } from '../../lib/supabase';

/**
 * Returns { Authorization: 'Bearer <token>' } if a session exists, or {} if not.
 * Always resolves — never throws.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!isConfigured || !supabase) return {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}
