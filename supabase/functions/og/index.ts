// =====================================================================
// Edge Function: og  —  Open Graph share page for a single prompt
// Shared link format:  {SUPABASE_URL}/functions/v1/og?id={prompt_id}
// Crawlers (X, WhatsApp, Telegram, Facebook) read the OG tags;
// humans are redirected to the app via meta refresh + fallback link.
//
// Deploy: Supabase Dashboard -> Edge Functions -> Create -> name "og"
//         (or: supabase functions deploy og)
// Optional secret: APP_URL  (where visitors are redirected; defaults to
//         https://whwgywgr.github.io/PromptbyMe/)
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_URL = (Deno.env.get('APP_URL') ?? 'https://whwgywgr.github.io/PromptbyMe/').replace(/\/$/, '');

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

Deno.serve(async (req: Request) => {
  const id = new URL(req.url).searchParams.get('id') ?? '';

  let title = 'PromptbyMe';
  let desc = 'Browse and share AI prompts with their results — images, videos and website previews.';
  let image = APP_URL + 'assets/logo.png';
  let found = false;

  if (id) {
    try {
      const sb = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );
      const { data: p } = await sb
        .from('prompts')
        .select('title, prompt')
        .eq('id', id)
        .single();
      if (p) {
        found = true;
        title = p.title || title;
        const body = (p.prompt || '').slice(0, 220);
        desc = body + ((p.prompt || '').length > 220 ? '…' : '');
        const { data: results } = await sb
          .from('results')
          .select('type, thumb_path, storage_path')
          .eq('prompt_id', id)
          .order('position', { ascending: true });
        const imgResult = (results ?? []).find((x) => x.type === 'image' && (x.thumb_path || x.storage_path))
          ?? (results ?? []).find((x) => x.thumb_path)
          ?? null;
        const imgPath = imgResult ? (imgResult.thumb_path || imgResult.storage_path) : null;
        if (imgPath) {
          image = sb.storage.from('media').getPublicUrl(imgPath).data.publicUrl;
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  const appLink = APP_URL + '#/p/' + id;
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — PromptbyMe</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="PromptbyMe">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(appLink)}">
</head>
<body style="margin:0;padding:40px 16px;background:#0f1215;font-family:Arial,sans-serif;text-align:center;">
  <a href="${esc(appLink)}" style="color:#5f72ff;font-size:15px;">Open this prompt in PromptbyMe &rarr;</a>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=60',
    },
  });
});
