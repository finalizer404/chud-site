# /chud/ live board: what to do (3 steps)

1. Put `board.js` next to `index.html`.
2. In `index.html`, add this line just before `</body>` (after the page's own script):

       <script src="board.js"></script>

3. In `config.js`, replace the two Supabase lines with these (both values are public, safe to commit):

       supabaseUrl: "https://mkfjrkvezwidqjvnvomi.supabase.co",
       supabaseAnonKey: "sb_publishable_ecCuvUFIeEgQFMhtbqXoew_FtSyddX4",

Deploy the site. Then:
- A "Start a New Thread" box shows above the built-in threads, and replies work on every thread.
- To moderate, open https://chudworldorder.com/#mod and type the moderator key (Kameron has it).
- Posting only works from chudworldorder.com (and www.). For a preview or test address, ask Kameron to add it.
- To restyle, edit the HTML strings in `board.js`; they use the page's own CSS classes.

Details and limits: README.md.

## The fast way
The folder `ready/` has your current `index.html` and `config.js` (copied from the live site on 2026-11-21) with the
3 steps already done, plus `board.js`. If you have not changed those two files since then, upload the three files
over the old ones and deploy. If you have changed them, do the 3 steps by hand instead.
