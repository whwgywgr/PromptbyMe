/* =====================================================================
   TEMPLATE configuration — salin fail ini sebagai `config.js`
   (config.js digitignore dan tidak dimuat naik ke GitHub)

   1. Cipta project di https://supabase.com (free tier cukup)
   2. Jalankan supabase-setup.sql di Dashboard -> SQL Editor
   3. Dashboard -> Settings -> API: salin Project URL + anon public key
   4. Isi dua nilai di bawah. Anon key selamat didedahkan — RLS
      melindungi data. JANGAN sesekali letak service_role key di sini.
   Tanpa config ini, app berjalan sepenuhnya offline/local.
   ===================================================================== */

window.PM_SUPABASE_URL = 'PASTE_YOUR_SUPABASE_URL_HERE';       // e.g. 'https://abcd1234.supabase.co'
window.PM_SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_KEY_HERE';      // e.g. 'eyJhbGciOi...'

// Share-preview Edge Function (supabase/functions/og/index.ts).
// Auto-derived from the project URL. Once the function is deployed,
// shared links use it so social posts show the prompt image + title.
window.PM_OG_SHARE_URL = window.PM_SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/og';

// Superadmin (boleh delete prompt semua user) — senarai username
window.PM_ADMIN_USERNAMES = ['username_anda'];
