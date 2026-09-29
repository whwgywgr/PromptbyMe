/* =====================================================================
   Auth — Supabase username + password sessions.
   Classic-script globals (no build step): authInit, authConfigured,
   currentUser, currentUserId, currentDisplayName, signUpUser,
   signInUser, authSignOut, authOnChange.

   Login flow: username -> get_email_by_username() RPC resolves the
   synthetic email stored at signup -> signInWithPassword.
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

let pmMyUsername = null;
async function fetchMyUsername() {
  if (!pmSupabase || !pmUser) return null;
  try {
    const { data, error } = await pmSupabase
      .from('profiles')
      .select('username')
      .eq('id', pmUser.id)
      .single();
    if (!error && data) pmMyUsername = data.username;
  } catch { pmMyUsername = null; }
  return pmMyUsername;
}

function currentDisplayName() {
  if (!pmUser) return 'Account';
  return pmMyUsername
    || pmUser.user_metadata?.username
    || pmUser.user_metadata?.name
    || (pmUser.email ? pmUser.email.split('@')[0] : 'Account');
}

// Google OAuth — redirects to Google, returns to emailRedirectTo with a session
async function signInWithGoogle() {
  if (!pmSupabase) throw new Error('Supabase not configured');
  const { error } = await pmSupabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

// username rules shared by sign-up and availability check
function validateUsername(username) {
  if (!username || username.length < 3) return 'Username must be at least 3 characters';
  if (username.length > 24) return 'Username must be at most 24 characters';
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) return 'Only letters, numbers, _ and - allowed';
  return null;
}

async function usernameTaken(username) {
  const { data, error } = await pmSupabase
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .limit(1);
  if (error) throw error;
  return !!(data && data.length);
}

async function signUpUser(username, password) {
  if (!pmSupabase) throw new Error('Supabase not configured');
  const invalid = validateUsername(username);
  if (invalid) throw new Error(invalid);

  if (await usernameTaken(username)) throw new Error('Username is already taken');

  // Supabase auth needs an email identifier; the account is username-only
  const syntheticEmail = username.toLowerCase() + '@pm.local';
  const { data, error } = await pmSupabase.auth.signUp({
    email: syntheticEmail,
    password,
    options: { data: { username } },
  });
  if (error) throw error;
  if (data.user && !data.session) {
    throw new Error('Account created, but "Confirm email" is ON in your Supabase settings. Disable it (Authentication -> Providers -> Email) so username/password logins work.');
  }
  return data;
}

async function signInUser(username, password) {
  if (!pmSupabase) throw new Error('Supabase not configured');
  const invalid = validateUsername(username);
  if (invalid) throw new Error(invalid);

  const { data: email, error: rpcError } = await pmSupabase
    .rpc('get_email_by_username', { p_username: username });
  if (rpcError) throw rpcError;
  if (!email) throw new Error('Username not found');

  const { data, error } = await pmSupabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message === 'Email not confirmed') {
      throw new Error('Email confirmation is ON in Supabase settings — disable it for username logins.');
    }
    throw error;
  }
  return data;
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
