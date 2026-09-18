'use strict';
/* ============================================================================
   Grunion RFC Club Dashboard — shared script for /dashboard/ (Overview) and
   /dashboard/ads/ (Ad Campaigns): helpers, passcode gate, API calls, tiles,
   tables and the SVG line chart. Page-specific code stays inline in each page.
   Every call carries the dashboard passcode; the functions refuse to answer
   without it. All dynamic strings are inserted with textContent — never innerHTML.
============================================================================ */

// ---------- tiny DOM + format helpers --------------------------------------
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

const NBSP = ' ';
const fmtInt = (n) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US');
const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const fmtNum = (n) => {
  if (n == null || isNaN(n)) return '—';
  return Math.abs(n) >= 10000 ? compactFmt.format(n) : Number(n).toLocaleString('en-US');
};
const fmtPct = (v) => (v == null || isNaN(v)) ? '—' : `${(+v).toFixed(1)}%`;
const fmtDur = (sec) => {
  if (sec == null || isNaN(sec)) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}m${NBSP}${String(s).padStart(2, '0')}s`;
};
const deltaPct = (cur, prev) =>
  (cur == null || prev == null || !(prev > 0)) ? null : ((cur - prev) / prev) * 100;

const parseGaDate = (s) => {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const parseCmDate = (s) => (s ? new Date(String(s).replace(' ', 'T')) : null);
const dShort = (d) => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
const relTime = (iso) => {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!isFinite(t)) return '—';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 36 * 60) return `${Math.round(mins / 60)}h ago`;
  return dShort(new Date(t));
};
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------- auth + API ------------------------------------------------------
const KEY_LS = 'grunionDashKey';

// While the gate is up, the page behind it is inert (no Tab stops, no clicks) so the
// passcode dialog is truly modal for keyboard and screen-reader users.
function setGate(open) {
  $('gate').hidden = !open;
  for (const sel of ['header.dhead', 'main#main', 'footer.dfoot', 'hr.rule101']) {
    const n = document.querySelector(sel);
    if (n) { n.inert = open; n.setAttribute('aria-hidden', open ? 'true' : 'false'); }
  }
}
function lock(message) {
  localStorage.removeItem(KEY_LS);
  $('gateErr').textContent = message || '';
  setGate(true);
  $('gateKey').value = '';
  setTimeout(() => $('gateKey').focus(), 50);
}

async function api(name, params) {
  const url = new URL(`/.netlify/functions/${name}`, location.origin);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let r;
  try {
    r = await fetch(url, { headers: { 'x-dashboard-key': localStorage.getItem(KEY_LS) || '' } });
  } catch {
    return { error: 'Network error — are you offline?' };
  }
  if (r.status === 401) { lock('That passcode didn’t match — try again.'); return { error: 'unauthorized' }; }
  if (r.status === 404) {
    return { error: 'Function not found — deploy the site with the netlify/functions folder first.' };
  }
  try { return await r.json(); }
  catch { return { error: `Unexpected response (${r.status})` }; }
}

// ---------- shared render pieces -------------------------------------------
function cardState(container, lines) {
  const box = el('div', 'card-state');
  (Array.isArray(lines) ? lines : [lines]).forEach((t, i) => {
    if (i) box.appendChild(el('br'));
    box.appendChild(el('span', null, t));
  });
  clear(container).appendChild(box);
  return box;
}

function makeDelta(d, title, opts = {}) {
  const span = el('span', 'delta');
  if (d == null || isNaN(d)) { span.classList.add('flat'); span.textContent = ''; return span; }
  const flat = Math.abs(d) < 0.05;
  const up = d > 0;
  span.classList.add(flat ? 'flat' : up ? 'up' : 'down');
  span.textContent = flat ? `·${NBSP}0.0%` : `${up ? '▲' : '▼'}${NBSP}${Math.abs(d).toFixed(1)}%`;
  if (title) span.title = title;
  const sr = el('span', 'sr-only', flat ? ` unchanged ${title || ''}` : ` ${up ? 'up' : 'down'} ${Math.abs(d).toFixed(1)} percent ${title || ''}`);
  span.appendChild(sr);
  return span;
}

function tile({ label, value, small, delta, deltaTitle, sub, subMono, dotColor }) {
  const t = el('div', 'tile');
  t.appendChild(el('div', 't-lab', label));
  const v = el('div', 't-val');
  if (dotColor) { const dot = el('span', 'dot'); dot.style.background = dotColor; v.appendChild(dot); }
  v.appendChild(document.createTextNode(value));
  if (small) v.appendChild(el('small', null, small));
  if (delta !== undefined) v.appendChild(makeDelta(delta, deltaTitle));
  t.appendChild(v);
  if (sub) {
    const s = el('div', 't-sub');
    s.appendChild(document.createTextNode(sub));
    if (subMono) { s.appendChild(document.createTextNode(' ')); s.appendChild(el('span', 'mono', subMono)); }
    s.title = sub + (subMono ? ` ${subMono}` : '');
    t.appendChild(s);
  }
  return t;
}

function barList(container, rows, { fmt = fmtNum, empty = 'No data in this range' } = {}) {
  clear(container);
  if (!rows || !rows.length) { container.appendChild(el('div', 'blist-empty', empty)); return; }
  const max = Math.max(...rows.map((r) => r.count || 0), 1);
  const list = el('div', 'blist');
  for (const r of rows) {
    const row = el('div', 'brow');
    const lab = el('div', 'b-lab');
    if (r.href) {
      const a = el('a', null, r.label);
      a.href = r.href; a.target = '_blank'; a.rel = 'noopener';
      lab.appendChild(a);
    } else lab.textContent = r.label;
    lab.title = r.title || r.label;
    const track = el('div', 'b-track');
    const bar = el('div', 'b-bar');
    bar.style.width = `${Math.max(1.5, (100 * (r.count || 0)) / max)}%`;
    track.appendChild(bar);
    row.appendChild(lab); row.appendChild(track);
    row.appendChild(el('div', 'b-val', fmt(r.count)));
    list.appendChild(row);
  }
  container.appendChild(list);
}

function buildTable(container, caption, headers, rows) {
  clear(container);
  const table = el('table', 'dtable');
  table.appendChild(el('caption', null, caption));
  const thead = el('thead'); const trh = el('tr');
  headers.forEach((h) => trh.appendChild(el('th', null, h)));
  thead.appendChild(trh); table.appendChild(thead);
  const tbody = el('tbody');
  rows.forEach((r) => {
    const tr = el('tr');
    r.forEach((cell) => {
      const td = el('td');
      if (cell && typeof cell === 'object' && cell.href) {
        const a = el('a', null, cell.text); a.href = cell.href; a.target = '_blank'; a.rel = 'noopener';
        td.appendChild(a);
      } else td.textContent = cell == null ? '—' : String(cell);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

// ---------- SVG line chart --------------------------------------------------
// Spec: 2px round-join lines, hairline solid grid, ≥8px end markers with a 2px
// surface ring, selective end labels (dropped when they'd collide), crosshair +
// one tooltip listing every series at the snapped X, keyboard navigable.
const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  return n;
};
const niceCeil = (v) => {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= m * p) return m * p;
  return 10 * p;
};

function lineChart(wrapEl, cfg) {
  // cfg: { xLabels[], xTip[], series:[{name,color,values[]}], yFmt, ariaLabel }
  clear(wrapEl);
  const n = cfg.xLabels.length;
  const series = cfg.series.filter((s) => s.values.some((v) => v != null));
  if (!n || !series.length) { cardState(wrapEl, 'No data to chart yet'); return; }
  const yFmt = cfg.yFmt || fmtNum;

  const W = 920, H = 290, padL = 52, padR = 60, padT = 14, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxV = Math.max(...series.flatMap((s) => s.values.filter((v) => v != null)), 0);
  const yMax = niceCeil(maxV * 1.06 || 1);
  const X = (i) => (n === 1 ? padL + plotW / 2 : padL + (i * plotW) / (n - 1));
  const Y = (v) => padT + plotH - (v / yMax) * plotH;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: '0',
    'aria-label': cfg.ariaLabel || 'Line chart — use left and right arrow keys to read values; a table view is available',
  });

  // grid + y ticks (solid hairlines, one step off surface)
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const v = (yMax / ticks) * t, y = Y(v);
    svg.appendChild(svgEl('line', {
      x1: padL, x2: W - padR, y1: y, y2: y,
      stroke: t === 0 ? css('--baseline') : css('--grid'), 'stroke-width': 1,
    }));
    const lab = svgEl('text', {
      x: padL - 9, y: y + 3.5, 'text-anchor': 'end', fill: css('--ink3'),
      'font-size': '11', 'font-family': 'IBM Plex Mono, monospace',
    });
    lab.textContent = yFmt(v);
    svg.appendChild(lab);
  }
  // x tick labels (~6)
  const step = Math.max(1, Math.ceil(n / 6));
  for (let i = 0; i < n; i += step) {
    const lab = svgEl('text', {
      x: X(i), y: H - 10, 'text-anchor': 'middle', fill: css('--ink3'),
      'font-size': '11', 'font-family': 'IBM Plex Mono, monospace',
    });
    lab.textContent = cfg.xLabels[i];
    svg.appendChild(lab);
  }

  // series paths (gaps at nulls), end markers with surface ring
  const lastPoints = [];
  for (const s of series) {
    let d = '', pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
      pen = true;
    });
    svg.appendChild(svgEl('path', {
      d, fill: 'none', stroke: s.color, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    let li = s.values.length - 1;
    while (li >= 0 && s.values[li] == null) li--;
    if (li >= 0) {
      svg.appendChild(svgEl('circle', {
        cx: X(li), cy: Y(s.values[li]), r: 4.5, fill: s.color,
        stroke: css('--card'), 'stroke-width': 2,
      }));
      lastPoints.push({ y: Y(s.values[li]), v: s.values[li], x: X(li) });
    }
  }
  // selective end labels — only when they don't collide (else legend+tooltip carry it)
  const sorted = lastPoints.slice().sort((a, b) => a.y - b.y);
  const collide = sorted.some((p, i) => i && p.y - sorted[i - 1].y < 14);
  if (!collide) {
    for (const p of lastPoints) {
      const lab = svgEl('text', {
        x: p.x + 10, y: p.y + 4, fill: css('--ink2'),
        'font-size': '12', 'font-weight': '600', 'font-family': 'Libre Franklin, sans-serif',
      });
      lab.textContent = yFmt(p.v);
      svg.appendChild(lab);
    }
  }

  // crosshair + tooltip
  const cross = svgEl('line', {
    x1: 0, x2: 0, y1: padT, y2: padT + plotH,
    stroke: 'rgba(255,255,255,.28)', 'stroke-width': 1, visibility: 'hidden',
  });
  svg.appendChild(cross);
  const hot = svgEl('rect', {
    x: padL - 10, y: padT, width: plotW + 20, height: plotH + padB - 6,
    fill: 'transparent',
  });
  svg.appendChild(hot);
  wrapEl.appendChild(svg);

  const tip = el('div', 'tip');
  wrapEl.appendChild(tip);
  let tipIdx = -1;

  const showIdx = (i) => {
    i = Math.max(0, Math.min(n - 1, i));
    tipIdx = i;
    const cx = X(i);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    clear(tip);
    tip.appendChild(el('div', 'tp-x', (cfg.xTip || cfg.xLabels)[i]));
    for (const s of series) {
      const row = el('div', 'tp-row');
      const key = el('i'); key.style.borderTopColor = s.color;
      row.appendChild(key);
      row.appendChild(el('b', null, s.values[i] == null ? '—' : yFmt(s.values[i])));
      row.appendChild(el('span', null, s.name));
      tip.appendChild(row);
    }
    tip.classList.add('on');
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / W;
    const tw = tip.offsetWidth || 160;
    let left = cx * scale + 14;
    if (left + tw > rect.width - 4) left = cx * scale - tw - 14;
    tip.style.left = `${Math.max(2, left)}px`;
    tip.style.top = `${padT * scale + 2}px`;
  };
  const hide = () => { tip.classList.remove('on'); cross.setAttribute('visibility', 'hidden'); tipIdx = -1; };

  hot.addEventListener('pointermove', (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    showIdx(Math.round(((px - padL) / plotW) * (n - 1)));
  });
  hot.addEventListener('pointerleave', hide);
  svg.addEventListener('keydown', (ev) => {
    const start = tipIdx < 0 ? n - 1 : tipIdx;
    if (ev.key === 'ArrowLeft') { showIdx(start - 1); ev.preventDefault(); }
    else if (ev.key === 'ArrowRight') { showIdx(Math.min(n - 1, start + 1)); ev.preventDefault(); }
    else if (ev.key === 'Home') { showIdx(0); ev.preventDefault(); }
    else if (ev.key === 'End') { showIdx(n - 1); ev.preventDefault(); }
    else if (ev.key === 'Escape') hide();
  });
  svg.addEventListener('focus', () => showIdx(tipIdx < 0 ? n - 1 : tipIdx));
  svg.addEventListener('blur', hide);
}

function legend(container, series) {
  clear(container);
  for (const s of series) {
    const item = el('span', 'lg');
    const key = el('i'); key.style.borderTopColor = s.color;
    item.appendChild(key);
    item.appendChild(el('span', null, s.name));
    container.appendChild(item);
  }
}

function initViewToggle(cardId, chartId, tableId) {
  const card = $(cardId);
  card.querySelectorAll('.tgl [data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      card.querySelectorAll('.tgl [data-view]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b === btn)));
      $(chartId).hidden = view !== 'chart';
      $(tableId).hidden = view !== 'table';
    });
  });
}

// ---------- shell: refresh / lock / passcode gate / boot ---------------------
// Each dashboard page defines its own loadAll(fresh) and calls this once, last.
function initDashboardShell(loadAll) {
  $('refreshBtn').addEventListener('click', () => loadAll(true));
  $('lockBtn').addEventListener('click', () => lock(''));
  $('gateForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = $('gateKey').value.trim();
    if (!v) return;
    localStorage.setItem(KEY_LS, v);
    setGate(false);
    $('gateErr').textContent = '';
    loadAll(false);
  });
  if (localStorage.getItem(KEY_LS)) { setGate(false); loadAll(false); }
  else lock('');
}
