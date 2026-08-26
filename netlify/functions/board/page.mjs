// ============================================================================
// Grunion Sponsor Board — the page (markup, styles, script)
//
// This is a plain module imported by board.mjs, which wraps these three parts
// in the HTML skeleton and serves the result at /board/<BOARD_SLUG>/.
// It is deliberately a template so the page ships inside the function bundle
// rather than as a static file (a static file would put the hidden URL in the
// public repo). Keep it self-contained: no external scripts, fonts, or images.
//
// The script talks only to "./data" (same secret path) and renders everything
// with DOM APIs — campaign names from Instantly are inserted via textContent.
// Note: the script is written without template literals on purpose (it lives
// inside one) — plain string concatenation only.
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
.tile .v { font-size: 28px; font-weight: 650; line-height: 1.1; letter-spacing: -0.015em; margin: 0; word-break: break-word; }
.tile .s { font-size: 12px; color: var(--muted); margin: 3px 0 0; line-height: 1.3; }
.tile .s .em { color: var(--ink-2); font-weight: 600; }
.tile.wide { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.tile.wide .v { font-size: 28px; }
.tile.wide .l { margin: 0; }
.tile.wide .s { margin: 0; margin-left: auto; }

/* ---- inboxes --------------------------------------------------------- */
.inboxes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.inbox { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; min-width: 0; }
.inbox .name { display: flex; align-items: center; gap: 7px; font-weight: 650; font-size: 14px; margin: 0 0 8px; min-width: 0; }
.inbox .name span.addr { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inbox .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; color: var(--ink-2); margin: 6px 0 0; }
.inbox .row .val { color: var(--ink); font-weight: 600; }
.meter { height: 6px; border-radius: 3px; background: var(--series-track); margin: 6px 0 2px; overflow: hidden; }
.meter > i { display: block; height: 100%; width: 0; background: var(--series); border-radius: 3px; transition: width 0.4s; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; background: var(--muted); }
.dot.good { background: var(--good); }
.dot.warn { background: var(--warn); }
.dot.crit { background: var(--crit); }
.status { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.status.good { color: var(--good-text); }
.status.warn { color: var(--warn-text); }
.status.crit { color: var(--crit-text); }

/* ---- funnel ---------------------------------------------------------- */
.bars { display: grid; grid-template-columns: max-content max-content minmax(0, 1fr); column-gap: 10px; row-gap: 7px; align-items: center; }
.bars .k { font-size: 13.5px; color: var(--ink-2); white-space: nowrap; }
.bars .n { font-size: 14px; font-weight: 600; text-align: right; }
.bars .b { height: 10px; border-radius: 0 4px 4px 0; background: var(--series); min-width: 0; transition: width 0.4s; }
.bars .b.zero { width: 2px !important; background: var(--axis); }
.bars .b.muted { background: var(--axis); }
.subrule { border: 0; border-top: 1px solid var(--grid); margin: 12px 0 10px; }
.steps { display: grid; grid-template-columns: max-content minmax(0, 1fr) max-content; column-gap: 10px; row-gap: 7px; align-items: center; }
.steps .k { font-size: 13.5px; color: var(--ink-2); white-space: nowrap; }
.steps .n { font-size: 13px; color: var(--ink-2); white-space: nowrap; text-align: right; }
.steps .n b { color: var(--ink); font-weight: 600; }
.steps .b { height: 10px; border-radius: 0 4px 4px 0; background: var(--series); transition: width 0.4s; }
.steps .b.zero { width: 2px !important; background: var(--axis); }
.pill { font-size: 12px; color: var(--muted); }

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

/* ---- campaign table -------------------------------------------------- */
.tblwrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -16px; padding: 0 16px; }
table.camps { width: 100%; border-collapse: collapse; font-size: 13px; }
.camps th { text-align: right; font-size: 11px; font-weight: 650; letter-spacing: 0.02em; text-transform: uppercase; color: var(--muted); padding: 0 4px 8px; white-space: nowrap; }
.camps th:first-child { text-align: left; padding-left: 0; }
.camps th:last-child { padding-right: 0; }
.camps td { padding: 8px 4px; border-top: 1px solid var(--grid); text-align: right; vertical-align: top; white-space: nowrap; }
.camps td:first-child { text-align: left; padding-left: 0; padding-right: 8px; white-space: normal; min-width: 150px; }
.camps th:not(:first-child), .camps td:not(:first-child) { width: 1%; }
.camps td:last-child { padding-right: 0; }
.camps .nm { font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; display: flex; align-items: baseline; gap: 7px; }
.camps .nm .dot { position: relative; top: -1px; }
.camps .who { font-size: 12px; color: var(--muted); line-height: 1.25; padding-left: 16px; }
.camps tr.prod td { border-top: 0; }
.camps tr.prod .nm { font-weight: 700; }
.camps .status { font-size: 12.5px; }
.camps .zero { color: var(--muted); }
.empty { color: var(--muted); font-size: 13.5px; padding: 6px 0; }

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
  <div class="sec-h"><h2 id="h-score">Scoreboard</h2><span class="aside" id="score-aside"></span></div>
  <div class="tiles">
    <div class="tile"><p class="l">Businesses contacted</p><p class="v" id="t-contacted">—</p><p class="s" id="t-contacted-s"></p></div>
    <div class="tile"><p class="l">Emails sent</p><p class="v" id="t-sent">—</p><p class="s" id="t-sent-s"></p></div>
    <div class="tile"><p class="l">Real replies</p><p class="v" id="t-replies">—</p><p class="s" id="t-replies-s"></p></div>
    <div class="tile"><p class="l">Bounces</p><p class="v" id="t-bounced">—</p><p class="s" id="t-bounced-s"></p></div>
    <div class="tile"><p class="l">Opt-outs</p><p class="v" id="t-unsub">—</p><p class="s" id="t-unsub-s"></p></div>
    <div class="tile"><p class="l">Sequences completed</p><p class="v" id="t-completed">—</p><p class="s" id="t-completed-s"></p></div>
    <div class="tile wide"><p class="v" id="t-days">—</p><p class="l" id="t-days-l">days left</p><p class="s" id="t-days-s"></p></div>
  </div>
</section>

<section class="sec live" aria-labelledby="h-inbox">
  <div class="sec-h"><h2 id="h-inbox">Inbox health</h2><span class="aside">sends today · Pacific</span></div>
  <div class="inboxes" id="inboxes"></div>
</section>

<section class="sec live" aria-labelledby="h-prod">
  <div class="sec-h"><h2 id="h-prod">PROD funnel</h2><span class="aside" id="prod-aside"></span></div>
  <div class="card">
    <div class="bars" id="funnel"></div>
    <hr class="subrule">
    <div class="steps" id="steps"></div>
  </div>
</section>

<section class="sec live" aria-labelledby="h-daily">
  <div class="sec-h"><h2 id="h-daily">Daily sends · last 14 days</h2><button class="tbl-toggle" id="daily-toggle" type="button" aria-expanded="false">Show table</button></div>
  <div class="card">
    <div class="chart-wrap" id="chart-wrap">
      <svg class="chart" id="chart" viewBox="0 0 320 150" role="img" aria-label="Daily emails sent, last 14 days"></svg>
      <div class="tip" id="tip" role="status" aria-live="polite"></div>
    </div>
    <table class="mini" id="daily-table" hidden><thead><tr><th>Day (UTC)</th><th>Sent</th><th>Replies</th></tr></thead><tbody></tbody></table>
  </div>
</section>

<section class="sec live" aria-labelledby="h-camps">
  <div class="sec-h"><h2 id="h-camps">Campaigns</h2><span class="aside" id="camps-aside"></span></div>
  <div class="card">
    <div class="tblwrap">
      <table class="camps" id="camps">
        <thead><tr><th>Campaign</th><th>Sent</th><th>Replies</th><th>Bounces</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
</section>

</main>

<footer id="foot">Test campaigns excluded · <span>Source: Instantly (read-only)</span> · <span>Open tracking is off, so no opens are shown</span></footer>
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
  function statusClass(level) { return level === 'good' ? 'good' : level === 'warn' ? 'warn' : level === 'crit' ? 'crit' : ''; }
  function statusNode(level, label) {
    var s = el('span', 'status ' + statusClass(level));
    s.appendChild(el('span', 'dot ' + statusClass(level)));
    s.appendChild(el('span', null, label));
    return s;
  }
  function setNotice(level, html) {
    var n = $('notice');
    if (!html) { n.hidden = true; return; }
    n.className = 'notice ' + (level || '');
    $('notice-dot').className = 'dot ' + statusClass(level);
    clear($('notice-text'));
    html.forEach(function (part) {
      if (typeof part === 'string') $('notice-text').appendChild(document.createTextNode(part));
      else $('notice-text').appendChild(part);
    });
    n.hidden = false;
  }

  /* ---------- render ---------- */
  function render(p, meta) {
    var t = p.totals || {};
    var replies = t.replies;
    var replyRate = pctText(replies, t.contacted);

    $('t-contacted').textContent = fmt(t.contacted);
    $('t-contacted-s').textContent = t.leads ? 'of ' + fmt(t.leads) + ' leads' : '';
    $('t-sent').textContent = fmt(t.sent);
    $('t-sent-s').textContent = t.sent_today != null ? fmt(t.sent_today) + ' today' : '';
    $('t-replies').textContent = fmt(replies);
    var rs = [];
    if (replyRate) rs.push(replyRate + ' of contacted');
    if (t.reply_emails != null && t.reply_emails !== replies) rs.push(fmt(t.reply_emails) + ' ' + plural(t.reply_emails, 'email'));
    if (t.replies_auto) rs.push('+' + fmt(t.replies_auto) + ' auto');
    $('t-replies-s').textContent = rs.join(' · ');
    $('t-bounced').textContent = fmt(t.bounced);
    $('t-bounced-s').textContent = t.contacted ? pctText(t.bounced, t.contacted) + ' of contacted' : '';
    $('t-unsub').textContent = fmt(t.unsubscribed);
    $('t-unsub-s').textContent = t.contacted ? pctText(t.unsubscribed, t.contacted) + ' of contacted' : '';
    $('t-completed').textContent = fmt(t.completed);
    $('t-completed-s').textContent = t.contacted ? pctText(t.completed, t.contacted) + ' of contacted' : '';

    var dl = p.days_left;
    if (dl == null) { $('t-days').textContent = '—'; $('t-days-l').textContent = 'days left'; }
    else if (dl > 0) { $('t-days').textContent = fmt(dl); $('t-days-l').textContent = plural(dl, 'day', 'days') + ' left'; }
    else if (dl === 0) { $('t-days').textContent = 'Last'; $('t-days-l').textContent = 'day of sending'; }
    else { $('t-days').textContent = 'Done'; $('t-days-l').textContent = 'sending has ended'; }
    $('t-days-s').textContent = p.end_label ? 'sending ends ' + p.end_label : '';
    $('score-aside').textContent = (p.campaign_count != null) ? fmt(p.campaign_count) + ' ' + plural(p.campaign_count, 'campaign') : '';

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
      if (x.found === false) {
        c.appendChild(el('p', 'row', 'Not found in Instantly'));
        ib.appendChild(c); return;
      }
      var r1 = el('div', 'row');
      r1.appendChild(el('span', null, 'Sent today'));
      var v1 = el('span', 'val num', fmt(x.sends_today) + (x.daily_limit ? ' / ' + fmt(x.daily_limit) : ''));
      r1.appendChild(v1);
      c.appendChild(r1);
      var m = el('div', 'meter'); var fill = el('i');
      var frac = x.daily_limit ? Math.min(1, (x.sends_today || 0) / x.daily_limit) : 0;
      fill.style.width = (frac * 100).toFixed(1) + '%';
      m.appendChild(fill); c.appendChild(m);
      if (x.other_sends_today) {
        c.appendChild(el('p', 'pill', '+' + fmt(x.other_sends_today) + ' test ' + plural(x.other_sends_today, 'send') + ' today, not counted'));
      }
      var r2 = el('div', 'row');
      r2.appendChild(el('span', null, 'Warmup score'));
      r2.appendChild(el('span', 'val num', x.warmup_score == null ? '—' : fmt(x.warmup_score)));
      c.appendChild(r2);
      var r3 = el('div', 'row');
      r3.appendChild(el('span', null, 'Status'));
      r3.appendChild(statusNode(x.level, x.status_label || '—'));
      c.appendChild(r3);
      if (x.note) c.appendChild(el('p', 'pill', x.note));
      ib.appendChild(c);
    });

    /* funnel */
    var f = $('funnel'); clear(f);
    var pr = p.prod;
    if (!pr) {
      f.appendChild(el('div', 'empty', 'PROD campaign not found in Instantly.'));
      $('prod-aside').textContent = '';
    } else {
      $('prod-aside').textContent = pr.status_label ? pr.status_label + ' · ' + fmt(pr.leads) + ' leads' : fmt(pr.leads) + ' leads';
      var rows = [
        ['Not yet contacted', pr.not_contacted, false],
        ['Contacted', pr.contacted, false],
        ['Finished sequence', pr.completed, false],
        ['Bounced', pr.bounced, true],
        ['Unsubscribed', pr.unsubscribed, true]
      ];
      var base = pr.leads || Math.max(pr.contacted || 0, 1);
      rows.forEach(function (r) {
        f.appendChild(el('div', 'k', r[0]));
        f.appendChild(el('div', 'n num', fmt(r[1])));
        var b = el('div', 'b' + (r[1] ? '' : ' zero') + (r[2] ? ' muted' : ''));
        var w = base ? Math.max(0, Math.min(100, 100 * (r[1] || 0) / base)) : 0;
        b.style.width = (r[1] ? Math.max(w, 1) : 0) + '%';
        b.title = pctText(r[1], base) ? pctText(r[1], base) + ' of leads' : '';
        f.appendChild(b);
      });
    }
    var st = $('steps'); clear(st);
    var steps = (pr && pr.steps) || [];
    if (!steps.length) {
      st.appendChild(el('div', 'empty', 'No per-step data yet.'));
    } else {
      var mx = 0; steps.forEach(function (s) { mx = Math.max(mx, s.sent || 0); });
      steps.forEach(function (s) {
        st.appendChild(el('div', 'k', 'Email ' + s.step));
        var b = el('div', 'b' + (s.sent ? '' : ' zero'));
        b.style.width = (mx ? Math.max(1, 100 * (s.sent || 0) / mx) : 0) + '%';
        st.appendChild(b);
        var n = el('div', 'n num');
        var bb = el('b', null, fmt(s.sent)); n.appendChild(bb);
        n.appendChild(document.createTextNode(' sent' + (s.replies ? ' · ' + fmt(s.replies) + ' ' + plural(s.replies, 'reply', 'replies') : '')));
        st.appendChild(n);
      });
    }

    /* chart */
    drawChart(p.daily || []);

    /* campaigns */
    var tb = $('camps').getElementsByTagName('tbody')[0]; clear(tb);
    var camps = p.campaigns || [];
    $('camps-aside').textContent = p.excluded_tests ? fmt(p.excluded_tests) + ' test ' + plural(p.excluded_tests, 'campaign') + ' excluded' : '';
    if (!camps.length) {
      var tr0 = el('tr'); var td0 = el('td', 'empty', 'No campaigns yet.'); td0.colSpan = 4; tr0.appendChild(td0); tb.appendChild(tr0);
    }
    camps.forEach(function (c) {
      var tr = el('tr', c.kind === 'prod' ? 'prod' : '');
      var td = el('td');
      var nm = el('div', 'nm');
      nm.appendChild(el('span', 'dot ' + statusClass(c.level)));
      nm.appendChild(document.createTextNode(c.kind === 'prod' ? 'PROD · Fall 2026' : (c.label || c.name || '—')));
      td.appendChild(nm);
      var who = c.kind === 'prod' ? (fmt(c.leads) + ' leads · ' + fmt(c.contacted) + ' contacted') : (c.sub || '');
      td.appendChild(el('div', 'who', (who ? who + ' · ' : '') + (c.status_label || '—')));
      tr.appendChild(td);
      [c.sent, c.replies, c.bounced].forEach(function (v) { tr.appendChild(el('td', 'num' + (v ? '' : ' zero'), fmt(v))); });
      tb.appendChild(tr);
    });

    /* header */
    var asof = $('asof'); clear(asof);
    asof.appendChild(document.createTextNode('as of ' + ptTime(p.as_of)));
    if (meta && meta.source === 'local') asof.appendChild(el('span', 'cache', ' · saved on this device'));
  }

  /* ---------- chart ---------- */
  var chartData = [];
  function niceMax(v) {
    /* tops that split into 4 whole-number ticks */
    var tops = [4, 8, 12, 16, 20, 40, 60, 80, 100, 120, 160, 200, 400, 600, 800, 1000, 2000, 4000];
    for (var i = 0; i < tops.length; i++) if (v <= tops[i]) return tops[i];
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
      svg.appendChild(svgEl(i === 0 ? 'line' : 'line', { x1: padL, x2: W - padR, y1: y, y2: y, 'class': i === 0 ? 'axis' : 'grid' }));
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
      var every = n <= 7 ? 1 : 4;
      var showX = ((n - 1 - i) % every) === 0;
      if (showX) {
        var firstShown = (n - 1) % every;
        var tx = svgEl('text', { x: x + bw / 2, y: H - 6, 'class': 'tick', 'text-anchor': 'middle' });
        tx.textContent = dayLabel(d.date, i === firstShown || i === n - 1); svg.appendChild(tx);
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
  function showTip(i, evt) {
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
      if (t && t.classList && t.classList.contains('hit')) showTip(Number(t.getAttribute('data-i')), e);
    };
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerdown', onMove);
    svg.addEventListener('pointerleave', hideTip);
    svg.addEventListener('focusin', function (e) { if (e.target.classList.contains('hit')) showTip(Number(e.target.getAttribute('data-i')), e); });
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
          if (local) { render(local, { source: lastPayload ? 'server' : 'local' }); local.stale_since = local.stale_since || local.as_of; local.error = msg; noticeFor(local, null); }
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
  if (cached) { render(cached, { source: 'local' }); }
  load(false);
})();
`;
