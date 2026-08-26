// ============================================================================
// Grunion Sponsor Board — the page (markup, styles, script)
//
// This is a plain module imported by board.mjs, which wraps these three parts
// in the HTML skeleton and serves the result at /board/<BOARD_SLUG>/.
// It is deliberately a template so the page ships inside the function bundle
// rather than as a static file (a static file would put the hidden URL in the
// public repo). Keep it self-contained: no external scripts, fonts, or images.
//
// Every number on the page is ALL non-test campaigns combined — there is no
// per-campaign view on purpose. The script talks only to "./data" (same secret
// path) and renders everything with DOM APIs — text from Instantly (addresses,
// subjects, previews) is inserted via textContent. Note: the script is written
// without template literals on purpose (it lives inside one) — plain string
// concatenation only.
// ============================================================================

export const TITLE = 'Grunion Sponsor Board';

export const CSS = String.raw`
:root {
  color-scheme: light;
  --plane: #f9f9f7;
  --surface: #fcfcfb;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --muted: #898781;
  --grid: #e1e0d9;
  --axis: #c3c2b7;
  --border: rgba(11, 11, 11, 0.10);
  --border-strong: rgba(11, 11, 11, 0.18);
  --series: #2a78d6;
  --series-track: #cde2fb;
  --good: #0ca30c;
  --warn: #fab219;
  --crit: #d03b3b;
  --good-text: #006300;
  --crit-text: #b52f2f;
  --warn-text: #8a5a00;
  --focus: #2a78d6;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --plane: #0d0d0d;
    --surface: #1a1a19;
    --ink: #ffffff;
    --ink-2: #c3c2b7;
    --muted: #898781;
    --grid: #2c2c2a;
    --axis: #383835;
    --border: rgba(255, 255, 255, 0.10);
    --border-strong: rgba(255, 255, 255, 0.20);
    --series: #3987e5;
    --series-track: #184f95;
    --good-text: #0ca30c;
    --crit-text: #e66767;
    --warn-text: #fab219;
    --focus: #3987e5;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --plane: #0d0d0d;
  --surface: #1a1a19;
  --ink: #ffffff;
  --ink-2: #c3c2b7;
  --muted: #898781;
  --grid: #2c2c2a;
  --axis: #383835;
  --border: rgba(255, 255, 255, 0.10);
  --border-strong: rgba(255, 255, 255, 0.20);
  --series: #3987e5;
  --series-track: #184f95;
  --good-text: #0ca30c;
  --crit-text: #e66767;
  --warn-text: #fab219;
  --focus: #3987e5;
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--plane);
  color: var(--ink);
  font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  padding: max(12px, env(safe-area-inset-top)) 0 max(28px, env(safe-area-inset-bottom));
}
.wrap { max-width: 720px; margin: 0 auto; padding: 0 14px; }
button { font: inherit; color: inherit; }
button:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.num { font-variant-numeric: tabular-nums; }

/* ---- header ---------------------------------------------------------- */
.hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 6px 0 4px; }
.eyebrow { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
h1 { margin: 2px 0 0; font-size: 24px; line-height: 1.15; font-weight: 700; letter-spacing: -0.01em; }
.asof { margin: 4px 0 0; font-size: 13px; color: var(--ink-2); }
.asof .cache { color: var(--muted); }
.actions { display: flex; gap: 8px; flex-shrink: 0; padding-top: 4px; }
.btn {
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: 999px;
  padding: 7px 14px; font-size: 14px; font-weight: 600; cursor: pointer; line-height: 1.2;
  display: inline-flex; align-items: center; gap: 6px;
}
.btn:active { transform: translateY(1px); }
.btn[disabled] { opacity: 0.6; cursor: default; }
.btn .spin { width: 12px; height: 12px; border: 2px solid var(--muted); border-right-color: transparent; border-radius: 50%; display: none; }
.btn.busy .spin { display: inline-block; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.icon-btn { width: 36px; height: 36px; padding: 0; justify-content: center; }
.icon-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

/* ---- notices --------------------------------------------------------- */
.notice { margin: 10px 0 0; padding: 10px 12px; border-radius: 10px; font-size: 13.5px; line-height: 1.4; border: 1px solid var(--border); background: var(--surface); display: flex; gap: 8px; align-items: flex-start; }
.notice[hidden] { display: none; }
.notice.warn { border-color: var(--warn); }
.notice.crit { border-color: var(--crit); }
.notice .dot { margin-top: 5px; }
.notice b { font-weight: 650; }

/* ---- sections -------------------------------------------------------- */
.sec { margin-top: 18px; }
.sec[hidden] { display: none; }
.sec-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 8px; }
.sec-h h2 { margin: 0; font-size: 12px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.sec-h .aside { font-size: 12px; color: var(--muted); }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
main.loading .live { opacity: 0.55; transition: opacity 0.2s; }
.live { transition: opacity 0.2s; }

/* ---- scoreboard ------------------------------------------------------ */
.tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
@media (min-width: 560px) { .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px 11px; min-width: 0; }
.tile .l { font-size: 13px; color: var(--ink-2); margin: 0 0 2px; line-height: 1.25; }
.tile .v { font-size: 30px; font-weight: 650; line-height: 1.1; letter-spacing: -0.015em; margin: 0; word-break: break-word; }
.tile .s { font-size: 12px; color: var(--muted); margin: 3px 0 0; line-height: 1.3; }
.tile.wide { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.tile.wide .l { margin: 0; }
.tile.wide .s { margin: 0; margin-left: auto; }
.meter { height: 6px; border-radius: 3px; background: var(--series-track); margin: 8px 0 0; overflow: hidden; }
.meter > i { display: block; height: 100%; width: 0; background: var(--series); border-radius: 3px; transition: width 0.4s; }

/* ---- lists (opt-outs, replies) ------------------------------------------- */
.list { margin: 0; padding: 0; list-style: none; }
.list li { display: flex; gap: 10px; align-items: flex-start; padding: 9px 0; border-top: 1px solid var(--grid); min-width: 0; }
.list li:first-child { border-top: 0; padding-top: 2px; }
.list li:last-child { padding-bottom: 2px; }
.list .who { flex: 1 1 auto; min-width: 0; }
.list .who .e { font-weight: 600; font-size: 14px; overflow-wrap: anywhere; line-height: 1.3; }
.list .who .p { font-size: 12.5px; color: var(--ink-2); line-height: 1.35; margin-top: 2px; overflow-wrap: anywhere; }
.list .when { flex: 0 0 auto; font-size: 12px; color: var(--muted); text-align: right; white-space: nowrap; padding-top: 2px; }
.tag { display: inline-block; font-size: 11px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); border: 1px solid var(--border-strong); border-radius: 999px; padding: 1px 7px; margin-left: 6px; vertical-align: 1px; }
.tag.optout { color: var(--crit-text); border-color: var(--crit); }
.tag.reply { color: var(--good-text); border-color: var(--good); }
.empty { color: var(--muted); font-size: 13.5px; padding: 4px 0; }

/* ---- inboxes --------------------------------------------------------- */
.inboxes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.inbox { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; min-width: 0; }
.inbox .name { display: flex; align-items: center; gap: 7px; font-weight: 650; font-size: 14px; margin: 0 0 6px; min-width: 0; }
.inbox .name span.addr { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inbox .big { font-size: 22px; font-weight: 650; line-height: 1.1; margin: 0; }
.inbox .big small { font-size: 13px; font-weight: 500; color: var(--muted); }
.inbox .row { font-size: 12.5px; color: var(--ink-2); margin: 8px 0 0; display: flex; justify-content: space-between; gap: 8px; }
.inbox .meter { margin: 6px 0 0; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; background: var(--muted); }
.dot.good { background: var(--good); }
.dot.warn { background: var(--warn); }
.dot.crit { background: var(--crit); }
.status { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.status.good { color: var(--good-text); }
.status.warn { color: var(--warn-text); }
.status.crit { color: var(--crit-text); }
.pill { font-size: 12px; color: var(--muted); margin: 6px 0 0; }

/* ---- chart ----------------------------------------------------------- */
.chart-wrap { position: relative; }
.chart { width: 100%; height: auto; display: block; overflow: visible; }
.chart .grid { stroke: var(--grid); stroke-width: 1; }
.chart .axis { stroke: var(--axis); stroke-width: 1; }
.chart .tick { fill: var(--muted); font-size: 11px; }
.chart .bar { fill: var(--series); }
.chart .bar.active { opacity: 0.75; }
.chart .hit { fill: transparent; cursor: pointer; }
.chart .lbl { fill: var(--ink-2); font-size: 11px; font-weight: 600; text-anchor: middle; }
.tip { position: absolute; pointer-events: none; background: var(--ink); color: var(--plane); font-size: 12px; line-height: 1.3; padding: 6px 8px; border-radius: 6px; white-space: nowrap; transform: translate(-50%, calc(-100% - 8px)); display: none; z-index: 2; }
.tip b { font-size: 13px; }
.tip.show { display: block; }
.tbl-toggle { background: none; border: 0; padding: 0; font-size: 12px; color: var(--muted); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.mini { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
.mini th, .mini td { padding: 4px 6px; text-align: right; border-top: 1px solid var(--grid); }
.mini th { color: var(--muted); font-weight: 600; font-size: 12px; border-top: 0; }
.mini th:first-child, .mini td:first-child { text-align: left; }
.mini[hidden] { display: none; }

/* ---- footer ---------------------------------------------------------- */
footer { margin-top: 22px; font-size: 12px; color: var(--muted); line-height: 1.5; text-align: center; }
footer span { white-space: nowrap; }

@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
`;

export const BODY = String.raw`
<div class="wrap">
<header class="hdr">
  <div>
    <p class="eyebrow">Jersey tiles · Fall 2026</p>
    <h1>Sponsor Board</h1>
    <p class="asof" id="asof">Loading…</p>
  </div>
  <div class="actions">
    <button class="btn icon-btn" id="theme" type="button" aria-label="Switch light / dark theme" title="Light / dark">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16A8 8 0 0 0 12 4z" fill="currentColor" stroke="none"/></svg>
    </button>
    <button class="btn" id="refresh" type="button"><span class="spin" aria-hidden="true"></span><span>Refresh</span></button>
  </div>
</header>

<div class="notice" id="notice" hidden><span class="dot" id="notice-dot"></span><span id="notice-text"></span></div>

<main id="main" class="loading">

<section class="sec live" aria-labelledby="h-score">
  <div class="sec-h"><h2 id="h-score">Scoreboard</h2><span class="aside">all campaigns combined</span></div>
  <div class="tiles">
    <div class="tile"><p class="l">Businesses contacted</p><p class="v" id="t-contacted">—</p><p class="s" id="t-contacted-s"></p><div class="meter" aria-hidden="true"><i id="t-contacted-m"></i></div></div>
    <div class="tile"><p class="l">Replies</p><p class="v" id="t-replies">—</p><p class="s" id="t-replies-s"></p></div>
    <div class="tile"><p class="l">Unsubscribes</p><p class="v" id="t-unsub">—</p><p class="s" id="t-unsub-s"></p></div>
    <div class="tile"><p class="l">Bounces</p><p class="v" id="t-bounced">—</p><p class="s" id="t-bounced-s"></p></div>
    <div class="tile"><p class="l">Emails sent</p><p class="v" id="t-sent">—</p><p class="s" id="t-sent-s"></p></div>
    <div class="tile"><p class="l">Days left</p><p class="v" id="t-days">—</p><p class="s" id="t-days-s"></p></div>
  </div>
</section>

<section class="sec live" id="sec-optouts" aria-labelledby="h-optouts" hidden>
  <div class="sec-h"><h2 id="h-optouts">Unsubscribed</h2><span class="aside" id="optouts-aside"></span></div>
  <div class="card"><ul class="list" id="optouts"></ul></div>
</section>

<section class="sec live" id="sec-replies" aria-labelledby="h-replies">
  <div class="sec-h"><h2 id="h-replies">Replies</h2><span class="aside" id="replies-aside"></span></div>
  <div class="card"><ul class="list" id="replies"></ul><p class="empty" id="replies-empty" hidden>No replies yet.</p></div>
</section>

<section class="sec live" aria-labelledby="h-inbox">
  <div class="sec-h"><h2 id="h-inbox">Sending inboxes</h2><span class="aside">today · Pacific</span></div>
  <div class="inboxes" id="inboxes"></div>
</section>

<section class="sec live" aria-labelledby="h-daily">
  <div class="sec-h"><h2 id="h-daily">Emails per day · last 14 days</h2><button class="tbl-toggle" id="daily-toggle" type="button" aria-expanded="false">Show table</button></div>
  <div class="card">
    <div class="chart-wrap" id="chart-wrap">
      <svg class="chart" id="chart" viewBox="0 0 320 150" role="img" aria-label="Emails sent per day, last 14 days"></svg>
      <div class="tip" id="tip" role="status" aria-live="polite"></div>
    </div>
    <table class="mini" id="daily-table" hidden><thead><tr><th>Day (UTC)</th><th>Sent</th><th>Replies</th></tr></thead><tbody></tbody></table>
  </div>
</section>

</main>

<footer id="foot">All campaigns combined · <span>test campaigns excluded</span> · <span>Source: Instantly (read-only)</span></footer>
</div>
`;

export const JS = String.raw`
(function () {
  'use strict';
  var DATA_URL = location.pathname.replace(/\/+$/, '') + '/data';
  var STORE = 'grc-board:last';
  var THEME = 'grc-board:theme';
  var STALE_AFTER = 2 * 60 * 1000;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US'); };
  var pct = function (a, b) { return (!b || a == null) ? null : (100 * a / b); };
  var pctText = function (a, b) { var p = pct(a, b); return p == null ? '' : (p === 0 ? '0' : p < 10 ? p.toFixed(1) : Math.round(p)) + '%'; };
  var plural = function (n, one, many) { return n === 1 ? one : (many || one + 's'); };
  var lastPayload = null;
  var lastLoadedAt = 0;

  /* ---------- theme ---------- */
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function readTheme() { try { return localStorage.getItem(THEME); } catch (e) { return null; } }
  applyTheme(readTheme());
  $('theme').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme');
    var osDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var effective = cur || (osDark ? 'dark' : 'light');
    var next = effective === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME, next); } catch (e) {}
  });

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function ptTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    var now = new Date();
    var sameDay = d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) === now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
    var t = d.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
    if (sameDay) return t + ' PT';
    return d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' }) + ', ' + t + ' PT';
  }
  function ptShort(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var now = new Date();
    var sameDay = d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) === now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
    if (sameDay) return d.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' });
  }
  function statusClass(level) { return level === 'good' ? 'good' : level === 'warn' ? 'warn' : level === 'crit' ? 'crit' : ''; }
  function statusNode(level, label) {
    var s = el('span', 'status ' + statusClass(level));
    s.appendChild(el('span', 'dot ' + statusClass(level)));
    s.appendChild(el('span', null, label));
    return s;
  }
  function setNotice(level, parts) {
    var n = $('notice');
    if (!parts) { n.hidden = true; return; }
    n.className = 'notice ' + (level || '');
    $('notice-dot').className = 'dot ' + statusClass(level);
    clear($('notice-text'));
    parts.forEach(function (part) {
      if (typeof part === 'string') $('notice-text').appendChild(document.createTextNode(part));
      else $('notice-text').appendChild(part);
    });
    n.hidden = false;
  }

  /* ---------- render ---------- */
  function render(p, meta) {
    var t = p.totals || {};

    $('t-contacted').textContent = fmt(t.contacted);
    $('t-contacted-s').textContent = t.leads ? 'of ' + fmt(t.leads) + ' on the list · ' + pctText(t.contacted, t.leads) : '';
    $('t-contacted-m').style.width = (t.leads ? Math.min(100, 100 * (t.contacted || 0) / t.leads) : 0).toFixed(1) + '%';

    $('t-replies').textContent = fmt(t.replies);
    var rs = [];
    if (t.contacted) rs.push(pctText(t.replies, t.contacted) + ' of contacted');
    if (t.replies_auto) rs.push('+' + fmt(t.replies_auto) + ' auto-' + plural(t.replies_auto, 'reply', 'replies'));
    $('t-replies-s').textContent = rs.join(' · ');

    $('t-unsub').textContent = fmt(t.unsubscribed);
    var us = [];
    if (t.unsub_button) us.push(fmt(t.unsub_button) + ' via unsubscribe button');
    if (t.unsub_reply) us.push(fmt(t.unsub_reply) + ' asked by reply');
    $('t-unsub-s').textContent = us.length ? us.join(' · ') : (t.contacted ? 'none so far' : '');

    $('t-bounced').textContent = fmt(t.bounced);
    $('t-bounced-s').textContent = t.contacted ? pctText(t.bounced, t.contacted) + ' of contacted' : '';

    $('t-sent').textContent = fmt(t.sent);
    $('t-sent-s').textContent = t.sent_today != null ? fmt(t.sent_today) + ' today' : '';

    var dl = p.days_left;
    if (dl == null) { $('t-days').textContent = '—'; }
    else if (dl > 0) { $('t-days').textContent = fmt(dl); }
    else if (dl === 0) { $('t-days').textContent = 'Last day'; }
    else { $('t-days').textContent = 'Done'; }
    $('t-days-s').textContent = p.end_label ? 'sending ends ' + p.end_label : '';

    /* unsubscribed list */
    var oo = p.optouts || [];
    var so = $('sec-optouts');
    so.hidden = !oo.length;
    if (oo.length) {
      $('optouts-aside').textContent = fmt(oo.length) + ' ' + plural(oo.length, 'business', 'businesses');
      var ol = $('optouts'); clear(ol);
      oo.forEach(function (o) {
        var li = el('li');
        var who = el('div', 'who');
        who.appendChild(el('div', 'e', o.email || '—'));
        who.appendChild(el('div', 'p', o.source === 'reply' ? 'asked by reply' : o.source === 'list' ? 'on the Instantly block list' : 'used the unsubscribe button'));
        li.appendChild(who);
        li.appendChild(el('div', 'when', o.when ? ptShort(o.when) : ''));
        ol.appendChild(li);
      });
    }

    /* replies list */
    var rl = $('replies'); clear(rl);
    var reps = p.replies || [];
    var real = reps.filter(function (r) { return r.kind !== 'auto'; }).length;
    $('replies-aside').textContent = p.replies_available === false ? 'list unavailable' : (reps.length ? (fmt(real) + ' ' + plural(real, 'reply', 'replies') + (reps.length - real ? ' · ' + fmt(reps.length - real) + ' auto' : '')) : '');
    $('replies-empty').hidden = !!reps.length;
    reps.forEach(function (r) {
      var li = el('li');
      var who = el('div', 'who');
      var e = el('div', 'e', r.email || '—');
      if (r.kind === 'optout') e.appendChild(el('span', 'tag optout', 'opt-out'));
      else if (r.kind === 'auto') e.appendChild(el('span', 'tag', 'auto-reply'));
      else e.appendChild(el('span', 'tag reply', 'reply'));
      who.appendChild(e);
      var text = r.preview || r.subject || '';
      if (text) who.appendChild(el('div', 'p', text));
      li.appendChild(who);
      var w = el('div', 'when', r.when ? ptShort(r.when) : '');
      if (r.inbox) { w.appendChild(el('br')); w.appendChild(document.createTextNode('to ' + r.inbox)); }
      li.appendChild(w);
      rl.appendChild(li);
    });

    /* inboxes */
    var ib = $('inboxes'); clear(ib);
    (p.inboxes || []).forEach(function (x) {
      var c = el('div', 'inbox');
      var nm = el('p', 'name');
      nm.appendChild(el('span', 'dot ' + statusClass(x.level)));
      var addr = el('span', 'addr', x.short || x.email);
      addr.title = x.email || '';
      nm.appendChild(addr);
      c.appendChild(nm);
      if (x.found === false) { c.appendChild(el('p', 'pill', 'Not found in Instantly')); ib.appendChild(c); return; }
      var big = el('p', 'big num');
      big.appendChild(document.createTextNode(fmt(x.sends_today)));
      big.appendChild(el('small', null, ' sent today' + (x.daily_limit ? ' · cap ' + fmt(x.daily_limit) : '')));
      c.appendChild(big);
      var m = el('div', 'meter'); var fill = el('i');
      fill.style.width = (x.daily_limit ? Math.min(100, 100 * (x.sends_today || 0) / x.daily_limit) : 0).toFixed(1) + '%';
      m.appendChild(fill); c.appendChild(m);
      var r2 = el('div', 'row');
      r2.appendChild(el('span', null, 'Warmup ' + (x.warmup_score == null ? '—' : fmt(x.warmup_score))));
      r2.appendChild(statusNode(x.level, x.status_label || '—'));
      c.appendChild(r2);
      if (x.note) c.appendChild(el('p', 'pill', x.note));
      ib.appendChild(c);
    });

    /* chart */
    drawChart(p.daily || []);

    /* header */
    var asof = $('asof'); clear(asof);
    asof.appendChild(document.createTextNode('as of ' + ptTime(p.as_of)));
    if (meta && meta.source === 'local') asof.appendChild(el('span', 'cache', ' · saved on this device'));
  }

  /* ---------- chart ---------- */
  var chartData = [];
  function niceMax(v) {
    var steps = [4, 8, 12, 16, 20, 40, 60, 80, 100, 120, 160, 200, 400, 600, 800, 1000, 2000, 4000];
    for (var i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i];
    return Math.ceil(v / 4000) * 4000;
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function dayLabel(iso, withMonth) {
    var d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d)) return iso;
    return withMonth ? d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : String(d.getUTCDate());
  }
  function drawChart(daily) {
    chartData = daily;
    var svg = $('chart'); clear(svg);
    var W = 320, H = 150, padL = 30, padR = 10, padT = 16, padB = 22;
    var n = daily.length || 14;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var maxV = 0; daily.forEach(function (d) { maxV = Math.max(maxV, d.sent || 0); });
    var top = niceMax(maxV);
    var ticks = 4;
    for (var i = 0; i <= ticks; i++) {
      var v = top * i / ticks;
      var y = padT + plotH - plotH * i / ticks;
      svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: y, y2: y, 'class': i === 0 ? 'axis' : 'grid' }));
      var t = svgEl('text', { x: padL - 6, y: y + 3.5, 'class': 'tick', 'text-anchor': 'end' });
      t.textContent = fmt(v); svg.appendChild(t);
    }
    var slot = plotW / n, bw = Math.min(24, slot * 0.6);
    var maxIdx = -1; daily.forEach(function (d, i) { if ((d.sent || 0) > 0 && (maxIdx < 0 || (d.sent || 0) > (daily[maxIdx].sent || 0))) maxIdx = i; });
    daily.forEach(function (d, i) {
      var x = padL + slot * i + (slot - bw) / 2;
      var h = top ? plotH * (d.sent || 0) / top : 0;
      var y = padT + plotH - h;
      if (h > 0) {
        var r = Math.min(4, h);
        var path = 'M' + x + ' ' + (padT + plotH) + ' V' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' H' + (x + bw - r) + ' Q' + (x + bw) + ' ' + y + ' ' + (x + bw) + ' ' + (y + r) + ' V' + (padT + plotH) + ' Z';
        svg.appendChild(svgEl('path', { d: path, 'class': 'bar', 'data-i': i }));
      }
      if (i === maxIdx || (i === daily.length - 1 && (d.sent || 0) > 0 && i !== maxIdx)) {
        var l = svgEl('text', { x: x + bw / 2, y: y - 4, 'class': 'lbl' });
        l.textContent = fmt(d.sent); svg.appendChild(l);
      }
      var showX = (n <= 7) || ((n - 1 - i) % 4 === 0);
      if (showX) {
        var tx = svgEl('text', { x: x + bw / 2, y: H - 6, 'class': 'tick', 'text-anchor': 'middle' });
        tx.textContent = dayLabel(d.date, i === n - 1 || (n - 1 - i) === 12); svg.appendChild(tx);
      }
      var hit = svgEl('rect', { x: padL + slot * i, y: padT, width: slot, height: plotH + padB, 'class': 'hit', 'data-i': i, tabindex: 0, role: 'img', 'aria-label': dayLabel(d.date, true) + ': ' + fmt(d.sent) + ' sent, ' + fmt(d.replies) + ' replies' });
      svg.appendChild(hit);
    });
    var tbody = $('daily-table').getElementsByTagName('tbody')[0]; clear(tbody);
    daily.forEach(function (d) {
      var tr = el('tr');
      tr.appendChild(el('td', null, dayLabel(d.date, true)));
      tr.appendChild(el('td', 'num', fmt(d.sent)));
      tr.appendChild(el('td', 'num', fmt(d.replies)));
      tbody.appendChild(tr);
    });
  }
  function showTip(i) {
    var d = chartData[i]; if (!d) return;
    var tip = $('tip'); clear(tip);
    tip.appendChild(el('b', null, fmt(d.sent) + ' sent'));
    tip.appendChild(document.createTextNode(' · ' + fmt(d.replies) + ' ' + plural(d.replies, 'reply', 'replies')));
    tip.appendChild(el('br'));
    tip.appendChild(document.createTextNode(dayLabel(d.date, true) + ' (UTC)'));
    var svg = $('chart'), wrap = $('chart-wrap');
    var rect = svg.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    var slot = (320 - 40) / (chartData.length || 14);
    var cx = (30 + slot * i + slot / 2) / 320 * rect.width;
    tip.style.left = (rect.left - wr.left + cx) + 'px';
    tip.style.top = (rect.top - wr.top + 16 / 150 * rect.height) + 'px';
    tip.className = 'tip show';
    var bars = svg.querySelectorAll('.bar');
    for (var k = 0; k < bars.length; k++) bars[k].classList.toggle('active', bars[k].getAttribute('data-i') === String(i));
  }
  function hideTip() {
    $('tip').className = 'tip';
    var bars = $('chart').querySelectorAll('.bar');
    for (var k = 0; k < bars.length; k++) bars[k].classList.remove('active');
  }
  (function () {
    var svg = $('chart');
    var onMove = function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('hit')) showTip(Number(t.getAttribute('data-i')));
    };
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerdown', onMove);
    svg.addEventListener('pointerleave', hideTip);
    svg.addEventListener('focusin', function (e) { if (e.target.classList.contains('hit')) showTip(Number(e.target.getAttribute('data-i'))); });
    svg.addEventListener('focusout', hideTip);
    document.addEventListener('pointerdown', function (e) { if (!svg.contains(e.target)) hideTip(); });
    $('daily-toggle').addEventListener('click', function () {
      var tbl = $('daily-table'); tbl.hidden = !tbl.hidden;
      this.textContent = tbl.hidden ? 'Show table' : 'Hide table';
      this.setAttribute('aria-expanded', tbl.hidden ? 'false' : 'true');
    });
  })();

  /* ---------- data ---------- */
  function readLocal() { try { var s = localStorage.getItem(STORE); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function writeLocal(p) { try { localStorage.setItem(STORE, JSON.stringify(p)); } catch (e) {} }

  function noticeFor(p, err) {
    if (p && p.stale_since) {
      setNotice('warn', [el('b', null, 'Instantly is not answering. '), 'Showing the last good numbers, stale since ' + ptTime(p.stale_since) + '.' + (p.error ? ' (' + p.error + ')' : '')]);
    } else if (err) {
      setNotice('crit', [el('b', null, 'Could not load fresh numbers. '), err]);
    } else if (p && p.warnings && p.warnings.length) {
      setNotice('warn', [p.warnings.join(' · ')]);
    } else {
      setNotice(null, null);
    }
  }

  var busy = false;
  function load(force) {
    if (busy) return;
    busy = true;
    var btn = $('refresh'); btn.classList.add('busy'); btn.disabled = true;
    $('main').classList.add('loading');
    var url = DATA_URL + (force ? '?refresh=1' : '');
    fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        var p = res.body;
        if (p && p.ok) {
          lastPayload = p; lastLoadedAt = Date.now();
          if (!p.stale_since) writeLocal(p);
          render(p, { source: 'server' });
          noticeFor(p, null);
        } else {
          var msg = (p && p.error) ? String(p.error) : ('HTTP ' + res.status);
          var local = lastPayload || readLocal();
          if (local) { render(local, { source: lastPayload ? 'server' : 'local' }); local.stale_since = local.as_of; local.error = msg; noticeFor(local, null); }
          else { $('asof').textContent = 'No data yet'; noticeFor(null, msg); }
        }
      })
      .catch(function (e) {
        var local = lastPayload || readLocal();
        if (local) { render(local, { source: lastPayload ? 'server' : 'local' }); setNotice('warn', [el('b', null, 'You appear to be offline. '), 'Showing numbers saved ' + ptTime(local.as_of) + '.']); }
        else { $('asof').textContent = 'No data yet'; noticeFor(null, 'Network error: ' + (e && e.message ? e.message : e)); }
      })
      .then(function () {
        busy = false; btn.classList.remove('busy'); btn.disabled = false;
        $('main').classList.remove('loading');
      });
  }

  $('refresh').addEventListener('click', function () { load(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && Date.now() - lastLoadedAt > STALE_AFTER) load(false);
  });
  setInterval(function () { if (document.visibilityState === 'visible' && Date.now() - lastLoadedAt > 5 * 60 * 1000) load(false); }, 60 * 1000);

  var cached = readLocal();
  if (cached && cached.totals && cached.totals.unsub_button != null) { render(cached, { source: 'local' }); }
  load(false);
})();
`;
