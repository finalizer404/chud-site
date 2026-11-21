# /chud/ live board kit

Turns the thread list on chudworldorder.com into a live anonymous board: anyone can start a thread and reply,
no account. The page keeps its look; this kit adds the posting and the safety behind it.

## What is in this folder
| File | What it is | Who uses it |
|---|---|---|
| `board.js` | The drop-in script for the page | the site owner |
| `supabase/schema.sql` | The database tables (run once) | whoever owns the board's Supabase project |
| `supabase/functions/chud-board/index.ts` | The server function every post goes through | same |

## For the site owner: 3 steps
1. Put `board.js` next to `index.html`.
2. In `index.html`, add this line just before `</body>` (after the page's own script):
   `<script src="board.js"></script>`
3. In `config.js`, set `supabaseUrl` and `supabaseAnonKey` to the board's values (Kameron sends them).
   The old `replies` table in the old project is no longer used.

Nothing else changes. To restyle the board, edit the HTML strings in `board.js` (the "Start a New Thread" form
and `threadHTML`); they use the page's own CSS classes (`thread`, `post`, `reply`, `inp`, `btn`).

## What visitors get
- **Start a New Thread** box above the built-in threads; new threads list newest-active first.
- Replies on every thread, built-in or new.
- A short "[Posting…]" wait (1-3 s): the browser solves a small puzzle, which makes spam bots expensive.

## Limits (server side, cannot be skipped)
- 1 post per 30 s, 3 new threads per hour, 200 posts per day, per IP.
- The same text twice in 10 minutes is refused.
- Text only: 2000 characters, names 40, subjects 100. No images, no links turned into HTML.
- IPs are stored only as a salted hash, never shown.

## Moderating
Open the site with `#mod` at the end of the address (`https://chudworldorder.com/#mod`) and type the moderator key.
Every live post then shows `[del]` (hide the post; on a thread's first post, hide the whole thread) and `[ban]`
(ban that poster and hide all their posts). The key is the `CHUD_ADMIN_KEY` secret of the function.

## Setting up the server side (once)
1. Run `supabase/schema.sql` in the board's Supabase project.
2. Set the secrets: `CHUD_SALT` (long random text), `CHUD_ADMIN_KEY` (the moderator key),
   `CHUD_ORIGINS=https://chudworldorder.com` (only that site may post).
3. Deploy: `supabase functions deploy chud-board --no-verify-jwt`.

## Not in this version
Image uploads, captcha, search, catalog and archive pages. Image uploads on an anonymous board need a review
step first; ask before turning them on.
