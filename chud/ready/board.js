/* /chud/ live board: a drop-in for chudworldorder.com (load it AFTER the page's own script).
   What it adds, with no edits to the page's script:
     1. "Start a New Thread": anyone can open a thread; new threads show above the page's built-in ones.
     2. Safe posting: every reply and thread goes through the board's server function (rate limit, bot check, bans)
        instead of straight into the database.
     3. Moderation: open the page with #mod in the address, type the moderator key, and each live post gets [del] [ban].
   Setup: config.js holds the board's Supabase URL and public key (window.SITE.supabaseUrl / supabaseAnonKey).
   Optional: window.SITE.boardFn = full URL of the chud-board function (default: <supabaseUrl>/functions/v1/chud-board).
   It uses the page's own globals: THREADS, postHTML, replyPost, addReply, applyMedia, flash, esc, myPosts, seen, ls. */
(function () {
  'use strict'
  var S = window.SITE || {}
  if (!S.supabaseUrl || !S.supabaseAnonKey) { console.warn('[board] no Supabase keys in config.js: the live board is off'); return }
  if (typeof THREADS === 'undefined' || typeof postHTML !== 'function' || typeof replyPost !== 'function') { console.warn('[board] the page script was not found: load board.js after it'); return }
  var URL_ = S.supabaseUrl.replace(/\/$/, ''), KEY = S.supabaseAnonKey
  var FN = S.boardFn || URL_ + '/functions/v1/chud-board'
  var H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }
  var NO_BASE = 48600000                      // the page shows live posts as No. 48600000 + id
  var say = function (m, ms) { if (typeof flash === 'function') flash(m, ms || 3500) }
  var e = function (s) { return typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  var media = function () { if (typeof applyMedia === 'function') applyMedia() }

  // ── reads ──
  function rest(path) { return fetch(URL_ + '/rest/v1/' + path, { headers: H }).then(function (r) { if (!r.ok) throw new Error('read failed'); return r.json() }) }

  // ── the bot check: find a nonce so sha256(ts:body:nonce) starts with 16 zero bits (about 1-3 s of work) ──
  function hex(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s }
  async function solve(ts, body) {
    var enc = new TextEncoder()
    for (var n = 0; ; n++) {
      var d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(ts + ':' + body + ':' + n)))
      if (d[0] === 0 && d[1] === 0) return String(n)
    }
  }
  async function send(payload) {
    var ts = Date.now(), body = String(payload.body || '').trim().slice(0, 2000)
    var nonce = await solve(ts, body)
    var r = await fetch(FN, { method: 'POST', headers: H, body: JSON.stringify(Object.assign({ action: 'post', ts: ts, nonce: nonce }, payload, { body: body })) })
    var j = await r.json().catch(function () { return {} })
    if (!r.ok || !j.post) throw new Error(j.error || 'post failed. try again.')
    return j.post
  }
  function mine(id) { try { myPosts.add(String(id)); ls.set('chud_mine', Array.from(myPosts).slice(-200).join(',')) } catch (x) {} }

  // ── user threads ──
  var host = document.getElementById('threads'); if (!host) return
  var box = document.createElement('div'); box.id = 'chud-live'
  box.innerHTML =
    '<div class="thread" id="chud-new"><div class="reply" style="margin-left:0"><div class="rt">[ Start a New Thread ]</div><table>' +
    '<tr><td>Name</td><td><input class="inp" data-f="name" placeholder="Anonymous" value="Anonymous" maxlength="40"></td></tr>' +
    '<tr><td>Subject</td><td><input class="inp" data-f="subject" placeholder="Subject" maxlength="100"></td></tr>' +
    '<tr><td>Comment</td><td><textarea class="inp" data-f="body" rows="4" placeholder="Comment..." maxlength="2000"></textarea></td></tr>' +
    '<tr style="position:absolute;left:-9999px" aria-hidden="true"><td>Website</td><td><input data-f="hp" tabindex="-1" autocomplete="off"></td></tr>' +
    '<tr><td></td><td><button class="btn" data-new-thread>[New Thread]</button></td></tr></table></div><hr class="sep"></div>' +
    '<div id="chud-user-threads"></div>'
  host.parentNode.insertBefore(box, host)
  var list = box.querySelector('#chud-user-threads')

  function opPost(t) { var p = replyPost({ id: t.id, name: t.name, body: t.body, created_at: t.created_at }); p.op = true; return p }
  function threadHTML(th, i) {
    return '<div class="thread" id="' + th.id + '" data-title="' + e(th.title.toLowerCase()) + '">' +
      '<div class="ttl">' + e(th.title) + '</div><div class="posts">' + th.posts.map(postHTML).join('') + '</div>' +
      '<div class="reply"><div class="rt">[ Reply to this thread ]</div><table>' +
      '<tr><td>Name</td><td><input class="inp" placeholder="Anonymous" value="Anonymous"></td></tr>' +
      '<tr><td>Comment</td><td><textarea class="inp" rows="4" placeholder="Comment..."></textarea></td></tr>' +
      '<tr><td></td><td><button class="btn" data-reply="' + i + '">[Post Reply]</button></td></tr></table></div><hr class="sep"></div>'
  }
  var known = new Set()
  function addThread(t, top) {
    var id = 'u' + t.id; if (known.has(id)) return false
    known.add(id)
    var th = { id: id, title: t.subject || 'Anonymous thread', posts: [opPost(t)], live: true }
    THREADS.push(th)
    list.insertAdjacentHTML(top ? 'afterbegin' : 'beforeend', threadHTML(th, THREADS.length - 1))
    return true
  }
  async function loadThreads(first) {
    try {
      var rows = await rest('threads?select=id,subject,name,body,created_at,bumped_at&order=bumped_at.desc&limit=40')
      var fresh = []
      ;(first ? rows : rows.slice().reverse()).forEach(function (t) { if (addThread(t, !first)) fresh.push('u' + t.id) })
      if (fresh.length) {
        // the page's own loader may have seen these threads' replies before the threads existed: fetch them again
        var rs = await rest('replies?select=id,thread,name,body,created_at&thread=in.(' + fresh.join(',') + ')&order=id.asc&limit=1000')
        rs.forEach(function (r) { try { seen.delete(String(r.id)) } catch (x) {} addReply(r) })
        media(); modMarks()
      }
    } catch (x) { console.warn('[board] threads', x) }
  }
  loadThreads(true); setInterval(function () { loadThreads(false) }, 30000)

  // ── posting: capture the click before the page's own handler, and send through the function ──
  var busy = false
  document.addEventListener('click', async function (ev) {
    var nt = ev.target.closest && ev.target.closest('[data-new-thread]')
    var rb = !nt && ev.target.closest && ev.target.closest('[data-reply]')
    if (!nt && !rb) return
    ev.preventDefault(); ev.stopImmediatePropagation()
    if (busy) return
    var btn = nt || rb, label = btn.textContent
    try {
      if (nt) {
        var q = function (f) { return box.querySelector('[data-f="' + f + '"]') }
        var subject = q('subject').value.trim(), body = q('body').value.trim()
        if (subject.length < 3) return say('give the thread a subject, anon.')
        if (!body) return say('write something, anon.')
        busy = true; btn.disabled = true; btn.textContent = '[Posting…]'
        var t = await send({ subject: subject, name: q('name').value.trim() || 'Anonymous', body: body, hp: q('hp').value })
        mine(t.id); addThread(t, true); q('subject').value = ''; q('body').value = ''; media(); modMarks()
        var el = document.getElementById('u' + t.id); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
      } else {
        var th = THREADS[+rb.dataset.reply], rbox = rb.closest('.reply'), ta = rbox.querySelector('textarea')
        var text = ta.value.trim(); if (!th || !text) return
        busy = true; btn.disabled = true; btn.textContent = '[Posting…]'
        var r = await send({ thread: th.id, name: rbox.querySelector('input').value.trim() || 'Anonymous', body: text })
        mine(r.id); addReply(r); ta.value = ''; media(); modMarks()
        var pe = document.getElementById('p' + (NO_BASE + Number(r.id))); if (pe) pe.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    } catch (x) { say(x.message || 'post failed. try again.', 5000) }
    finally { busy = false; btn.disabled = false; btn.textContent = label }
  }, true)

  // ── moderation: open the page with #mod ──
  var modKey = null
  function modMarks() {
    if (!modKey) return
    document.querySelectorAll('.post[id^="p"]').forEach(function (p) {
      var id = Number(p.id.slice(1)) - NO_BASE
      if (!(id > 0) || p.querySelector('.chud-mod')) return
      var s = document.createElement('span'); s.className = 'chud-mod'; s.style.cssText = 'margin-left:8px;font-size:11px'
      s.innerHTML = '<a href="#" data-mod="delete" data-id="' + id + '">[del]</a> <a href="#" data-mod="ban" data-id="' + id + '">[ban]</a>'
      var pn = p.querySelector('.pn'); (pn ? pn.parentNode : p).insertBefore(s, pn ? pn.nextSibling : null)
    })
  }
  document.addEventListener('click', async function (ev) {
    var a = ev.target.closest && ev.target.closest('[data-mod]'); if (!a) return
    ev.preventDefault()
    var act = a.dataset.mod, id = Number(a.dataset.id)
    if (!confirm(act === 'ban' ? 'Ban this poster and hide all their posts?' : 'Delete this post?')) return
    var r = await fetch(FN, { method: 'POST', headers: H, body: JSON.stringify({ action: act, admin: modKey, id: id }) })
    var j = await r.json().catch(function () { return {} })
    if (!r.ok) return say(j.error || 'failed', 5000)
    say(act === 'ban' ? 'banned. ' + (j.hidden || 0) + ' posts hidden. reload to see.' : 'deleted.')
    var p = document.getElementById('p' + (NO_BASE + id)); if (p) { var th = p.classList.contains('op') ? p.closest('.thread') : null; (th || p).remove() }
  })
  if (location.hash === '#mod') {
    try { modKey = sessionStorage.getItem('chud_mod') } catch (x) {}
    if (!modKey) { modKey = prompt('moderator key'); try { if (modKey) sessionStorage.setItem('chud_mod', modKey) } catch (x) {} }
    if (modKey) { modMarks(); setInterval(modMarks, 4000) }
  }
})()
