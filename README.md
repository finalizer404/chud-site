# /chud/ site

Static site, no build step. Files:

- `index.html` — the board
- `config.js` — Supabase keys + media file names (the only file you normally edit)
- `media/` — your images, videos, audio
- `supabase.sql` — one-time database setup for shared replies

## 1. Add your media
Drop your files into `media/`. `config.js` is pre-filled with the file names you uploaded to the claude.ai version, so if you copy those same files in, they just work. To change one, put the new file in `media/` and update its name in `config.js`. Missing files show the placeholder.

## 2. Turn on shared replies (Supabase, free tier)
1. Create a project at supabase.com.
2. SQL Editor → paste `supabase.sql` → Run.
3. Project Settings → API → copy the **Project URL** and **anon public** key into `config.js`.

The anon key is meant to be public; the table rules only allow reading and posting (40-char names, 2000-char posts, 30s cooldown in the page). Delete spam rows from the Table Editor.

## 3. Deploy
- **Vercel / Netlify:** drag this folder onto their "deploy" page (or connect a GitHub repo). Then add your domain in the project's Domains settings and point your DNS where they tell you.
- **GitHub Pages:** push the folder to a repo → Settings → Pages → deploy from branch.
