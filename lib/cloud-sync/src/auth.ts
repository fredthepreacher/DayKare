import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Anonymous-first identity.
 *
 * DayKare's players are children, so the default account asks for nothing: no
 * email, no birth date, no name, no social login. Anonymous sign-in still
 * produces a real, persistent auth user, which is what cloud saves hang off.
 *
 * A guardian-controlled identity can be attached LATER to the same auth user
 * via updateUser. That is an upgrade, not a migration - the user id never
 * changes, so no save is moved, replaced or duplicated in the process. This is
 * why linking is safe by construction rather than by careful bookkeeping.
 */

export interface AuthResult {
  user: User | null;
  isAnonymous: boolean;
  error: string | null;
}

export async function ensureSession(client: SupabaseClient | null): Promise<AuthResult> {
  if (!client) return { user: null, isAnonymous: false, error: null };

  try {
    const { data: existing } = await client.auth.getSession();
    if (existing.session?.user) {
      return {
        user: existing.session.user,
        isAnonymous: existing.session.user.is_anonymous === true,
        error: null,
      };
    }

    const { data, error } = await client.auth.signInAnonymously();
    if (error) return { user: null, isAnonymous: false, error: error.message };
    return { user: data.user, isAnonymous: true, error: null };
  } catch (error) {
    // Never throw into the game. No session means local-only, which is a
    // perfectly good way to play DayKare.
    return { user: null, isAnonymous: false, error: String(error) };
  }
}

/**
 * Attaches a guardian-controlled email to the existing anonymous account.
 *
 * Not wired to any UI in Phase 3 - it exists so the account model is provably
 * upgradeable before we depend on that. Parental consent, age gating and
 * moderation are designed before Online launches, not here.
 */
export async function linkGuardianEmail(
  client: SupabaseClient | null,
  email: string,
): Promise<{ ok: boolean; error: string | null }> {
  if (!client) return { ok: false, error: 'cloud not configured' };
  try {
    const { error } = await client.auth.updateUser({ email });
    return error ? { ok: false, error: error.message } : { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function signOut(client: SupabaseClient | null): Promise<void> {
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch {
    // Ignored: a failed sign-out must not break the game.
  }
}
