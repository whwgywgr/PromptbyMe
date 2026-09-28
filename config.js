/* =====================================================================
   Supabase connection settings.
   1. Create a project at https://supabase.com (free tier is enough)
   2. Run supabase-setup.sql in Dashboard -> SQL Editor
   3. Dashboard -> Settings -> API: copy Project URL + anon public key
   4. Paste them below (the anon key is safe to expose — RLS protects data)
   Until configured, the app keeps running fully offline/local.
   ===================================================================== */

window.PM_SUPABASE_URL = 'https://jfqffxtziqvcxuejgfrt.supabase.co';       // e.g. 'https://abcd1234.supabase.co'
window.PM_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmcWZmeHR6aXF2Y3h1ZWpnZnJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NjQ1NTcsImV4cCI6MjEwNjE0MDU1N30.rF8-RfFiOCoT2_zT8W70IgNMUGGAgaEYr6b_DgPpVlQ';      // e.g. 'eyJhbGciOi...'
