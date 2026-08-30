import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Lazily constructed Supabase client.
 *
 * Two rules this file exists to enforce:
 *
 * 1. DayKare must run with no Supabase configuration at all. Missing env vars
 *    are the local-only mode, not an error state. If Supabase is down or was
 *    never configured, Story Mode still loads and plays.
 * 2. supabase-js must never land in the initial bundle. It is imported
 *    dynamically, so a signed-out player downloading DayKare pays nothing for
 *    a feature they are not using.
 */

export interface CloudConfig {
  url: string;
  anonKey: string;
}

let cached: SupabaseClient | null = null;
let inFlight: Promise<SupabaseClient | null> | null = null;

export function readCloudConfig(env: Record<string, unknown> | undefined): CloudConfig | null {
  if (!env) return null;
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
  const anonKey = typeof env.VITE_SUPABASE_ANON_KEY === 'string' ? env.VITE_SUPABASE_ANON_KEY.trim() : '';
  if (!url && !anonKey) return null;
  if (!url || !anonKey) {
    // Half-configured is a deployment mistake worth shouting about, but not
    // worth breaking the game over.
    console.error('DayKare: Supabase is half-configured - both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required. Continuing in local-only mode.');
    return null;
  }
  return { url, anonKey };
}

export function isCloudConfigured(env: Record<string, unknown> | undefined): boolean {
  return readCloudConfig(env) !== null;
}

export async function getCloudClient(config: CloudConfig | null): Promise<SupabaseClient | null> {
  if (!config) return null;
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      cached = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
      return cached;
    } catch (error) {
      console.error('DayKare: could not start the cloud client; staying local-only.', error);
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Test seam. */
export function resetCloudClientForTests() {
  cached = null;
  inFlight = null;
}
