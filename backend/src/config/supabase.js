const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required environment variables');
}

/**
 * Admin client — uses service_role key, bypasses RLS.
 * Use only on the server. NEVER expose this key to the client.
 */
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Public client — uses anon key, respects RLS.
 * Safe for auth operations only.
 */
const supabase = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey);

module.exports = { supabase, supabaseAdmin };
