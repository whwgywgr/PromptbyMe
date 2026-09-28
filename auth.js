/* =====================================================================
   Auth — Supabase magic-link session handling.
   Classic-script globals (no build step): authInit, authConfigured,
   currentUser, currentUserId, signInMagic, authSignOut, authOnChange.
   ===================================================================== */

window.pmSupabase = null;
let pmUser = null;

function authConfigured() {
  return !!window.PM_SUPABASE_URL
    && !!window.PM_SUPABASE_ANON_KEY
    && !String(window.PM_SUPABASE_URL).includes('PASTE_')
    && !String(window.PM_SUPABASE_ANON_KEY).includes('PASTE_')
    && !!window.supabase;
}

function authInit() {
  if (!authConfigured()) return Promise.resolve(null);
  try {
    window.pmSupabase = supabase.createClient(window.PM_SUPABASE_URL, window.PM_SUPABASE_ANON_KEY);
  } catch (err) {
    console.error('Supabase init failed:', err);
    return Promise.resolve(null);
  }
  return pmSupabase.auth.getSession()
    .then(({ data }) => { pmUser = (data && data.session && data.session.user) || null; return pmUser; })
    .catch((err) => { console.error('Supabase session failed:', err); pmUser = null; return null; });
}

function currentUser() { return pmUser; }
function currentUserId() { return pmUser ? pmUser.id : null; }

function signInMagic(email) {
  if (!pmSupabase) return Promise.reject(new Error('Supabase not configured'));
  return pmSupabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
}

function authSignOut() {
  if (!pmSupabase) return Promise.resolve();
  return pmSupabase.auth.signOut();
}

// cb(user) fires on SIGNED_IN / SIGNED_OUT (INITIAL_SESSION is skipped —
// authInit already resolved it).
function authOnChange(cb) {
  if (!pmSupabase) return;
  pmSupabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    pmUser = (session && session.user) || null;
    cb(pmUser);
  });
}
