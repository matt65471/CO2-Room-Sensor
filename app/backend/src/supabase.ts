import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy app/backend/.env.example to app/backend/.env and fill it in.`);
    process.exit(1);
  }
  return value;
}

// Server-side client using the secret key, so it can read readings despite Row Level Security.
export const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
