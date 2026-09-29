# PromptbyMe

A local-first prompt library — save useful prompts together with their results: images, videos, and website design previews (webview). No auth, no server, no account. Just open it in a browser.

![themes](https://img.shields.io/badge/themes-7-8455f6) ![storage](https://img.shields.io/badge/storage-local-10b981)

## Features

- **Prompts** — title, prompt text, model/tool (with suggestions), notes, tags, favorites
- **Results per prompt** — upload images/videos (drag & drop, multi-file, clipboard paste) or paste direct URLs; webview previews via site URL or pasted HTML/CSS/JS (sandboxed iframe)
- **7 switchable themes** — Flat Yellow, Neo Brutal, Soft Light, Clean Blue, 3D Sandy, Warm Caramel, Gradient Neo
- **Search & organize** — live search, tag chips with counts, type filters (images / videos / webview / favorites), sorting
- **Backup** — export/import a single `.json` file (optionally embed uploaded media as base64), merge or replace on import
- **Grid pattern background** auto-tinted to each theme's palette

## Storage

| Data | Where |
|---|---|
| Prompt metadata | `localStorage` (local mode) or Supabase Postgres (cloud mode) |
| Uploaded images & videos | IndexedDB (local mode) or Supabase Storage (cloud mode) |
| Theme preference | `localStorage` |

## Cloud sync (optional MVP)

The app runs fully offline by default. To enable cloud sync (username/password accounts + cross-device library):

1. Create a free project at [supabase.com](https://supabase.com).
2. Run [`supabase-setup.sql`](supabase-setup.sql) in Dashboard → SQL Editor (tables + RLS + storage bucket + profiles/username login).
3. Dashboard → Settings → API: copy the **Project URL** and **anon public key** into `config.js` — copy [`config.example.js`](config.example.js) first and rename it (`config.js` is gitignored and never pushed).
4. Dashboard → **Authentication → Providers → Email**: turn **OFF** "Confirm email" (signups use a synthetic address).
5. Dashboard → Authentication → URL Configuration: add your site URL (e.g. `https://whwgywgr.github.io/prompt-manager/`) and `http://localhost:8931/` to the redirect allowlist.

A **Sign in** button appears in the header → **Sign up** tab creates an account with a username + password (no email needed from users). Each username gets its own private library (row-level security). First sign-in offers to migrate the prompts stored on that device.

### Social share previews (optional)

The Share button links to a small Edge Function that renders Open Graph tags (prompt image + title + excerpt) so shared posts on X/WhatsApp/Telegram show a rich card:

1. Dashboard → Edge Functions → Create a function → name it `og` → paste [`supabase/functions/og/index.ts`](supabase/functions/og/index.ts) → Deploy
2. Optional: Edge Functions → Secrets → add `APP_URL` = your app URL (default: `https://whwgywgr.github.io/PromptbyMe/`)

The app probes the function automatically — once deployed, share links switch to the OG URL; before that they use the in-app hash link.

## Run

**Option 1** — double-click `index.html` (works in Chrome/Edge).

**Option 2** — run a tiny local server (also enables Firefox, which blocks IndexedDB on `file://`):

```bash
# or just double-click start.bat on Windows
python -m http.server 8931
# then open http://localhost:8931
```

## Deploy (GitHub Pages — recommended)

The app can live online without any local server:

1. Repo → **Settings → Secrets and variables → Actions** → add two secrets:
   - `SUPABASE_URL` — your Supabase Project URL
   - `SUPABASE_ANON_KEY` — your anon public key
2. Repo → **Settings → Pages** → Build and deployment → Source: **GitHub Actions**
3. Push to `main` (or re-run the failed "Deploy to GitHub Pages" workflow) — the site goes live at `https://whwgywgr.github.io/PromptbyMe/`
4. Supabase → Authentication → URL Configuration → add `https://whwgywgr.github.io/PromptbyMe/` to Redirect URLs

The workflow injects `config.js` from the secrets at deploy time — the anon key is public-safe by design (RLS protects the data); never put the service_role key in secrets or code.

## Tech

Plain HTML + CSS (Tailwind CDN) + vanilla JavaScript. No build step, no dependencies, no framework. Theme system is pure CSS (`theme2.css` … `theme7.css` override a base theme via `body.themeN`).
