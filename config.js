/* =====================================================================
   Supabase connection settings.
   1. Create a project at https://supabase.com (free tier is enough)
   2. Run supabase-setup.sql in Dashboard -> SQL Editor
   3. Dashboard -> Settings -> API: copy Project URL + anon public key
   4. Paste them below (the anon key is safe to expose — RLS protects data)
   Until configured, the app keeps running fully offline/local.
   ===================================================================== */

window.PM_SUPABASE_URL = 'PASTE_YOUR_SUPABASE_URL_HERE';       // e.g. 'https://abcd1234.supabase.co'
window.PM_SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_KEY_HERE';      // e.g. 'eyJhbGciOi...'
