# Prompt Manager

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

The app runs fully offline by default. To enable cloud sync (sign-in + cross-device library):

1. Create a free project at [supabase.com](https://supabase.com).
2. Run [`supabase-setup.sql`](supabase-setup.sql) in Dashboard → SQL Editor (tables + RLS + storage bucket).
3. Dashboard → Settings → API: copy the **Project URL** and **anon public key** into [`config.js`](config.js).
4. Authentication → URL Configuration: add your site URL (e.g. `https://whwgywgr.github.io/prompt-manager/`) and `http://localhost:8931/` to the redirect allowlist.

A **Sign in** button appears in the header. First sign-in offers to migrate the prompts stored on that device; after that everything syncs to your private cloud library (magic-link email sign-in, row-level security scoped to your user).

## Run

**Option 1** — double-click `index.html` (works in Chrome/Edge).

**Option 2** — run a tiny local server (also enables Firefox, which blocks IndexedDB on `file://`):

```bash
# or just double-click start.bat on Windows
python -m http.server 8931
# then open http://localhost:8931
```

## Tech

Plain HTML + CSS (Tailwind CDN) + vanilla JavaScript. No build step, no dependencies, no framework. Theme system is pure CSS (`theme2.css` … `theme7.css` override a base theme via `body.themeN`).
