// ReportKit charts: a typed table in, a standalone SVG out. No dependencies, no DOM, so it runs
// unchanged in node, the browser and Electron. Colors come from a template palette.
//   const svg = ReportKitCharts.render(table, spec, ReportKitCharts.paletteFromTemplate(tpl)).svg
// Marks follow fixed specs: bars are at most 24px thick with a 4px rounded data end and a 2px gap
// between touching marks; lines are 2px; markers are 8px with a 2px surface ring; grids are hairlines.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReportKitCharts = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const TYPES = [
    { id: 'gantt', label: 'Gantt chart', hint: 'Tasks on a timeline. Pick the task, start and end columns; an optional group sets the color.' },
    { id: 'bar', label: 'Column chart', hint: 'Compare values across categories, side by side.' },
    { id: 'hbar', label: 'Ranked bars', hint: 'Horizontal bars, largest first. Best for long names or many categories.' },
    { id: 'stacked', label: 'Stacked columns', hint: 'Each column split into parts that add up.' },
    { id: 'line', label: 'Line chart', hint: 'Change over time or over an ordered list.' },
    { id: 'area', label: 'Area chart', hint: 'A line with its area washed in.' },
    { id: 'share', label: 'Share of total', hint: 'One whole split into at most six parts.' },
  ];

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY = 864e5;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const r1 = n => Math.round(n * 10) / 10;
  const r2 = n => Math.round(n * 100) / 100;

  // ---- color ----
  const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
  const rgb2hex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v * (1 - t) + B[i] * t)); };
  const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  // Label color inside a colored fill: white or near-black by the fill's luminance.
  const onFill = h => (lum(h) > 0.36 ? '#1b2733' : '#ffffff');

  // The fixed categorical order. Red sits between gold and blue and green sits last, so the two
  // hues that confuse red-green colorblind readers are never neighbors.
  function paletteFromTemplate(tpl) {
    const c = (tpl && tpl.colors) || {};
    const d = { primary: '#1e3a5f', accent: '#e0a526', accentDeep: '#8a6410', ink: '#1c2530', muted: '#5b6774', success: '#2e9e4f', sage: '#7cc9a0', danger: '#d93a46', info: '#1f64c4', grey: '#c4c9cf' };
    const g = k => c[k] || d[k];
    return {
      series: [g('primary'), g('accent'), g('danger'), g('info'), g('success'), g('sage')],
      other: g('grey'),
      ink: g('ink'), muted: g('muted'), accentDeep: g('accentDeep'),
      surface: '#ffffff',
      grid: mix('#ffffff', g('primary'), 0.14),
      axis: mix('#ffffff', g('primary'), 0.34),
      faint: mix('#ffffff', g('primary'), 0.07),
      font: (tpl && tpl.font) || '"Segoe UI",Arial,Helvetica,sans-serif',
    };
  }

  // ---- text ----
  function tw(s, size, bold) {
    let w = 0;
    for (const ch of String(s)) w += /[iljI.,:;'|!\s]/.test(ch) ? 0.3 : /[mwMW@%]/.test(ch) ? 0.86 : /[A-Z0-9]/.test(ch) ? 0.64 : 0.54;
    return w * size * (bold ? 1.06 : 1);
  }
  function fit(s, size, maxW) {
    s = String(s);
    if (tw(s, size) <= maxW) return s;
    while (s.length > 1 && tw(s + '...', size) > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '...';
  }
  const text = (x, y, s, o) => {
    o = o || {};
    return `<text x="${r1(x)}" y="${r1(y)}" font-size="${o.size || 12}" fill="${o.fill || '#000'}"` +
      (o.anchor ? ` text-anchor="${o.anchor}"` : '') + (o.bold ? ' font-weight="700"' : '') + (o.rotate ? ` transform="rotate(${o.rotate} ${r1(x)} ${r1(y)})"` : '') +
      (o.spacing ? ` letter-spacing="${o.spacing}"` : '') + `>${esc(s)}</text>`;
  };

  // ---- numbers and dates ----
  function fmtNum(v, dec) {
    if (v == null || isNaN(v)) return '';
    const a = Math.abs(v);
    const trim = n => String(r2(n));
    if (a >= 1e6) return trim(v / 1e6) + 'M';
    if (a >= 1e4) return trim(v / 1e3) + 'K';
    const s = dec == null ? String(r2(v)) : v.toFixed(dec);
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  const fmtFull = v => (v == null ? '' : String(r2(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  const D = ms => new Date(ms);
  function fmtDate(ms, style) {
    const d = D(ms), m = MONTHS[d.getUTCMonth()], y = d.getUTCFullYear(), day = d.getUTCDate();
    if (style === 'my') return m + ' ' + y;
    if (style === 'y') return String(y);
    if (style === 'md') return m + ' ' + day;
    return m + ' ' + day + ', ' + y;
  }
  function dateStyle(values) {
    const v = values.filter(x => x != null);
    if (v.length && v.every(x => D(x).getUTCMonth() === 0 && D(x).getUTCDate() === 1)) return 'y';
    if (v.length && v.every(x => D(x).getUTCDate() === 1)) return 'my';
    return 'ymd';
  }

  function niceScale(min, max, want) {
    want = want || 5;
    if (!(max > min)) { max = min + 1; }
    const raw = (max - min) / want, pow = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pow;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
    const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
    return { min: lo, max: hi, step, ticks };
  }

  // ---- time axis ----
  const startOfMonth = ms => Date.UTC(D(ms).getUTCFullYear(), D(ms).getUTCMonth(), 1);
  const UNITS = {
    day: { floor: ms => Math.floor(ms / DAY) * DAY, next: ms => ms + DAY },
    week: { floor: ms => { const d = Math.floor(ms / DAY) * DAY; return d - ((D(d).getUTCDay() + 6) % 7) * DAY; }, next: ms => ms + 7 * DAY },
    month: { floor: startOfMonth, next: ms => Date.UTC(D(ms).getUTCFullYear(), D(ms).getUTCMonth() + 1, 1) },
    quarter: { floor: ms => Date.UTC(D(ms).getUTCFullYear(), Math.floor(D(ms).getUTCMonth() / 3) * 3, 1), next: ms => Date.UTC(D(ms).getUTCFullYear(), Math.floor(D(ms).getUTCMonth() / 3) * 3 + 3, 1) },
    year: { floor: ms => Date.UTC(D(ms).getUTCFullYear(), 0, 1), next: ms => Date.UTC(D(ms).getUTCFullYear() + 1, 0, 1) },
  };
  function tickLabel(unit, ms, first) {
    const d = D(ms), m = MONTHS[d.getUTCMonth()], y = d.getUTCFullYear();
    if (unit === 'day') return d.getUTCDate() === 1 || first ? m + ' ' + d.getUTCDate() : String(d.getUTCDate());
    if (unit === 'week') return m + ' ' + d.getUTCDate();
    if (unit === 'month') return d.getUTCMonth() === 0 || first ? m + ' ' + y : m;
    if (unit === 'quarter') return 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1) + ' ' + y;
    return String(y);
  }
  // Picks the finest unit whose ticks fit, then pads the domain out to unit boundaries when asked.
  function timeAxis(min, max, maxTicks, pad) {
    if (!(max > min)) { min -= 3 * DAY; max += 3 * DAY; }
    let unit = 'year';
    for (const u of ['day', 'week', 'month', 'quarter', 'year']) {
      let n = 0;
      for (let t = UNITS[u].floor(min); t <= max && n <= maxTicks + 1; t = UNITS[u].next(t)) n++;
      if (n <= maxTicks) { unit = u; break; }
    }
    const U = UNITS[unit];
    const lo = pad ? U.floor(min) : min;
    let hi = max;
    if (pad) { hi = U.floor(max); if (hi < max) hi = U.next(hi); }
    const ticks = [];
    for (let t = U.floor(lo); t <= hi; t = U.next(t)) if (t >= lo) ticks.push({ t, label: tickLabel(unit, t, !ticks.length) });
    return { min: lo, max: hi, unit, ticks };
  }

  // ---- svg frame ----
  let uid = 0;
  function frame(W, H, o, inner) {
    const sz = o.responsive ? 'style="width:100%;height:auto;display:block"' : `width="${W}" height="${H}"`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${r1(H)}" ${sz} font-family="${esc(o.pal.font.replace(/"/g, "'"))}" role="img" aria-label="${esc(o.title || 'Chart')}">` +
      `<rect width="${W}" height="${r1(H)}" fill="${o.pal.surface}"/>${inner}</svg>`;
  }

  // Title, subtitle and legend. Returns the markup and where the plot may start.
  function header(W, spec, pal, legend) {
    let y = 14, out = '';
    if (spec.title) { y += 20; out += text(24, y, spec.title, { size: 18, fill: pal.ink, bold: true }); y += 8; }
    if (spec.subtitle) { y += 14; out += text(24, y, spec.subtitle, { size: 12, fill: pal.muted }); y += 6; }
    if (legend && legend.length > 1) {
      y += 12;
      let x = 24;
      legend.forEach(it => {
        const w = 10 + 7 + tw(it.name, 12) + 20;
        if (x + w > W - 24 && x > 24) { x = 24; y += 20; }
        out += `<rect x="${x}" y="${y - 9}" width="10" height="10" rx="2" fill="${it.color}"/>` + text(x + 17, y, it.name, { size: 12, fill: pal.ink });
        x += w;
      });
      y += 10;
    }
    return { svg: out, top: y + (spec.title || spec.subtitle || (legend && legend.length > 1) ? 14 : 8) };
  }

  const colPath = (x, top, bottom, w, roundTop, r) => {
    r = Math.max(0, Math.min(r, w / 2, bottom - top));
    return roundTop
      ? `M${r1(x)},${r1(bottom)}L${r1(x)},${r1(top + r)}Q${r1(x)},${r1(top)} ${r1(x + r)},${r1(top)}L${r1(x + w - r)},${r1(top)}Q${r1(x + w)},${r1(top)} ${r1(x + w)},${r1(top + r)}L${r1(x + w)},${r1(bottom)}Z`
      : `M${r1(x)},${r1(top)}L${r1(x + w)},${r1(top)}L${r1(x + w)},${r1(bottom - r)}Q${r1(x + w)},${r1(bottom)} ${r1(x + w - r)},${r1(bottom)}L${r1(x + r)},${r1(bottom)}Q${r1(x)},${r1(bottom)} ${r1(x)},${r1(bottom - r)}Z`;
  };
  const rowPath = (left, right, y, h, roundRight, r) => {
    r = Math.max(0, Math.min(r, h / 2, right - left));
    return roundRight
      ? `M${r1(left)},${r1(y)}L${r1(right - r)},${r1(y)}Q${r1(right)},${r1(y)} ${r1(right)},${r1(y + r)}L${r1(right)},${r1(y + h - r)}Q${r1(right)},${r1(y + h)} ${r1(right - r)},${r1(y + h)}L${r1(left)},${r1(y + h)}Z`
      : `M${r1(right)},${r1(y)}L${r1(left + r)},${r1(y)}Q${r1(left)},${r1(y)} ${r1(left)},${r1(y + r)}L${r1(left)},${r1(y + h - r)}Q${r1(left)},${r1(y + h)} ${r1(left + r)},${r1(y + h)}L${r1(right)},${r1(y + h)}Z`;
  };

  function catLabeler(col) {
    if (!col) return (v, i) => String(i + 1);
    if (col.type === 'date') { const st = dateStyle(col.values); return v => (v == null ? '' : fmtDate(v, st)); }
    if (col.type === 'number') return v => (v == null ? '' : String(v));
    return v => (v == null || v === '' ? '(blank)' : String(v));
  }

  // ---- column, stacked, line and area ----
  function vertical(table, spec, pal, W, warnings) {
    const type = spec.type;
    const xcol = spec.x != null ? table.columns[spec.x] : null;
    let ycols = (spec.y || []).map(i => table.columns[i]).filter(c => c && c.type === 'number');
    if (!ycols.length) throw new Error('Pick at least one number column for the values.');
    if (ycols.length > pal.series.length) { warnings.push('Only the first ' + pal.series.length + ' value columns are drawn; more than that cannot be told apart.'); ycols = ycols.slice(0, pal.series.length); }
    const k = ycols.length;
    let idx = [...Array(table.length).keys()];
    const timeScale = (type === 'line' || type === 'area') && xcol && xcol.type === 'date' && new Set(xcol.values.filter(v => v != null)).size > 1;
    if (timeScale) idx = idx.filter(i => xcol.values[i] != null).sort((a, b) => xcol.values[a] - xcol.values[b]);
    if (idx.length > 60) { warnings.push('Only the first 60 rows are drawn.'); idx = idx.slice(0, 60); }
    const n = idx.length;
    if (!n) throw new Error('There are no rows to draw.');
    const lab = catLabeler(xcol);
    const cats = idx.map((i, j) => lab(xcol ? xcol.values[i] : null, i));
    const val = (s, j) => { const v = ycols[s].values[idx[j]]; return v == null ? null : v; };
    const colors = ycols.map((_, s) => (k === 1 ? pal.series[0] : pal.series[s]));
    const stacked = type === 'stacked';
    if (stacked && ycols.some(c => c.values.some(v => v != null && v < 0))) warnings.push('Stacked columns need values at or above zero; negative values are drawn as zero.');
    const sv = (s, j) => { const v = val(s, j); return stacked && v != null && v < 0 ? 0 : v; };

    // value domain
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < n; j++) {
      if (stacked) { let t = 0; for (let s = 0; s < k; s++) t += sv(s, j) || 0; lo = Math.min(lo, 0); hi = Math.max(hi, t); }
      else for (let s = 0; s < k; s++) { const v = val(s, j); if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const tight = type === 'line' && lo > 0 && lo / hi > 0.6;
    if (!tight) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const sc = niceScale(lo, hi, 5);
    const dec = sc.step < 1 ? Math.min(2, Math.ceil(-Math.log10(sc.step))) : 0;
    const tickText = sc.ticks.map(t => fmtNum(t, dec));

    const hd = header(W, spec, pal, k > 1 ? ycols.map((c, s) => ({ name: c.name, color: pal.series[s] })) : null);
    const plotTop = hd.top + 8;
    const plotH = spec.plotHeight || 320;
    const yAt = v => plotTop + plotH - ((v - sc.min) / (sc.max - sc.min)) * plotH;

    // end labels for lines: only when they cannot collide
    const isLine = type === 'line' || type === 'area';
    const lastIdx = s => { for (let j = n - 1; j >= 0; j--) if (val(s, j) != null) return j; return -1; };
    let direct = false;
    if (isLine && k >= 2 && k <= 4) {
      const ys = ycols.map((_, s) => (lastIdx(s) >= 0 ? yAt(val(s, lastIdx(s))) : -999)).sort((a, b) => a - b);
      direct = ys.every((y, i) => i === 0 || y - ys[i - 1] >= 15);
    }
    const left = 24 + Math.max(...tickText.map(t => tw(t, 11))) + 14;
    const rightRoom = direct ? Math.min(130, Math.max(...ycols.map(c => tw(c.name, 11.5))) + 20) : 0;
    const right = 24 + rightRoom;
    const plotW = W - left - right;

    const slot = plotW / n;
    const maxLab = Math.max(...cats.map(c => tw(c, 11)));
    const rotate = !timeScale && maxLab > slot - 6;
    const labStep = timeScale ? 1 : Math.max(1, Math.ceil((rotate ? 16 : maxLab + 8) / slot));
    const bottomRoom = timeScale ? 28 : rotate ? Math.min(maxLab, 150) * 0.58 + 22 : 28;
    const H = plotTop + plotH + bottomRoom + 10;

    let g = '';
    // grid and y axis
    sc.ticks.forEach((t, i) => {
      const y = yAt(t);
      g += `<line x1="${left}" x2="${r1(left + plotW)}" y1="${r1(y)}" y2="${r1(y)}" stroke="${t === 0 ? pal.axis : pal.grid}" stroke-width="1"/>`;
      g += text(left - 8, y + 4, tickText[i], { size: 11, fill: pal.muted, anchor: 'end' });
    });

    const xAt = j => (timeScale ? left + 12 + ((xcol.values[idx[j]] - tmin) / (tmax - tmin)) * (plotW - 24) : left + (j + 0.5) * slot);
    let tmin, tmax;
    let xaxis = '';
    if (timeScale) {
      const vs = idx.map(i => xcol.values[i]);
      const ax = timeAxis(Math.min(...vs), Math.max(...vs), Math.max(3, Math.floor(plotW / 70)), false);
      tmin = ax.min; tmax = ax.max;
      ax.ticks.forEach(t => {
        const x = left + 12 + ((t.t - tmin) / (tmax - tmin)) * (plotW - 24);
        xaxis += `<line x1="${r1(x)}" x2="${r1(x)}" y1="${r1(plotTop + plotH)}" y2="${r1(plotTop + plotH + 4)}" stroke="${pal.axis}"/>` + text(x, plotTop + plotH + 18, t.label, { size: 11, fill: pal.muted, anchor: 'middle' });
      });
    } else {
      cats.forEach((c, j) => {
        if (j % labStep) return;
        const x = left + (j + 0.5) * slot, y = plotTop + plotH + 18;
        xaxis += rotate ? text(x + 4, y - 2, fit(c, 11, 150), { size: 11, fill: pal.muted, anchor: 'end', rotate: -35 }) : text(x, y, fit(c, 11, Math.max(slot * labStep - 6, 30)), { size: 11, fill: pal.muted, anchor: 'middle' });
      });
    }
    g += xaxis;

    const tip = (s, j, v) => `<title>${esc((k > 1 ? ycols[s].name + ', ' : '') + cats[j] + ': ' + fmtFull(v))}</title>`;
    if (type === 'bar' || stacked) {
      const gap = 2;
      const per = stacked ? 1 : k;
      const bw = Math.max(2, Math.min(24, Math.floor((slot * 0.78 - (per - 1) * gap) / per)));
      const cw = per * bw + (per - 1) * gap;
      const labelOK = n <= 12 && !(!stacked && k > 1);
      for (let j = 0; j < n; j++) {
        const x0 = left + (j + 0.5) * slot - cw / 2;
        if (stacked) {
          let cum = 0, last = -1;
          for (let s = 0; s < k; s++) if ((sv(s, j) || 0) > 0) last = s;
          for (let s = 0; s < k; s++) {
            const v = sv(s, j) || 0;
            if (v <= 0) continue;
            const top = yAt(cum + v) + (s === last ? 0 : 1), bottom = yAt(cum) - (cum === 0 ? 0 : 1);
            cum += v;
            if (bottom - top < 0.5) continue;
            g += `<path d="${colPath(x0, top, bottom, bw, s === last, 4)}" fill="${pal.series[s]}">${tip(s, j, v)}</path>`;
          }
          if (labelOK && cum > 0 && tw(fmtFull(cum), 11) <= slot - 4) g += text(x0 + bw / 2, yAt(cum) - 6, fmtNum(cum), { size: 11, fill: pal.ink, anchor: 'middle', bold: true });
        } else {
          for (let s = 0; s < k; s++) {
            const v = val(s, j);
            if (v == null) continue;
            const x = x0 + s * (bw + gap), y0 = yAt(0), y1 = yAt(v);
            if (Math.abs(y0 - y1) < 0.5) continue;
            g += v >= 0
              ? `<path d="${colPath(x, y1, y0, bw, true, 4)}" fill="${colors[s]}">${tip(s, j, v)}</path>`
              : `<path d="${colPath(x, y0, y1, bw, false, 4)}" fill="${colors[s]}">${tip(s, j, v)}</path>`;
            if (labelOK && tw(fmtFull(v), 11) <= slot - 4) g += text(x + bw / 2, v >= 0 ? y1 - 6 : y1 + 14, fmtNum(v), { size: 11, fill: pal.ink, anchor: 'middle' });
          }
        }
      }
    } else {
      const base = yAt(Math.max(sc.min, Math.min(0, sc.max)));
      for (let s = 0; s < k; s++) {
        const pts = [];
        for (let j = 0; j < n; j++) { const v = val(s, j); pts.push(v == null ? null : [xAt(j), yAt(v), v, j]); }
        // runs of consecutive points; a blank cell breaks the line
        const runs = [];
        let cur = [];
        pts.forEach(p => { if (p) cur.push(p); else if (cur.length) { runs.push(cur); cur = []; } });
        if (cur.length) runs.push(cur);
        const col = colors[s];
        runs.forEach(run => {
          const d = run.map((p, i) => (i ? 'L' : 'M') + r1(p[0]) + ',' + r1(p[1])).join('');
          if (type === 'area' && run.length > 1) g += `<path d="${d}L${r1(run[run.length - 1][0])},${r1(base)}L${r1(run[0][0])},${r1(base)}Z" fill="${col}" fill-opacity="0.1"/>`;
          g += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        });
        const dots = n <= 24 ? pts.filter(Boolean) : [pts[lastIdx(s)]].filter(Boolean);
        dots.forEach(p => { g += `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="4" fill="${col}" stroke="${pal.surface}" stroke-width="2">${tip(s, p[3], p[2])}</circle>`; });
        if (direct && lastIdx(s) >= 0) { const p = pts[lastIdx(s)]; g += text(p[0] + 10, p[1] + 4, ycols[s].name, { size: 11.5, fill: pal.ink }); }
        else if (k === 1 && lastIdx(s) >= 0) { const p = pts[lastIdx(s)]; g += text(p[0], p[1] - 10, fmtNum(p[2]), { size: 11, fill: pal.ink, anchor: 'middle', bold: true }); }
      }
    }
    return { W, H, inner: hd.svg + g };
  }

  // ---- ranked horizontal bars ----
  function horizontal(table, spec, pal, W, warnings) {
    const xcol = spec.x != null ? table.columns[spec.x] : null;
    let ycols = (spec.y || []).map(i => table.columns[i]).filter(c => c && c.type === 'number');
    if (!ycols.length) throw new Error('Pick at least one number column for the values.');
    if (ycols.length > pal.series.length) ycols = ycols.slice(0, pal.series.length);
    const k = ycols.length;
    let idx = [...Array(table.length).keys()];
    if (spec.sort !== 'sheet') idx.sort((a, b) => (ycols[0].values[b] == null ? -Infinity : ycols[0].values[b]) - (ycols[0].values[a] == null ? -Infinity : ycols[0].values[a]));
    if (idx.length > 40) { warnings.push('Only the first 40 rows are drawn.'); idx = idx.slice(0, 40); }
    const n = idx.length;
    if (!n) throw new Error('There are no rows to draw.');
    const lab = catLabeler(xcol);
    const cats = idx.map(i => lab(xcol ? xcol.values[i] : null, i));
    let lo = 0, hi = 0;
    ycols.forEach(c => idx.forEach(i => { const v = c.values[i]; if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
    const sc = niceScale(lo, hi || 1, 5);
    const dec = sc.step < 1 ? Math.min(2, Math.ceil(-Math.log10(sc.step))) : 0;
    const hd = header(W, spec, pal, k > 1 ? ycols.map((c, s) => ({ name: c.name, color: pal.series[s] })) : null);
    const labW = Math.min(230, Math.max(...cats.map(c => tw(c, 12))) + 4);
    const left = 24 + labW + 12, right = 24 + (k === 1 ? 54 : 8);
    const plotW = W - left - right;
    const gap = 2, bh = Math.min(k === 1 ? 20 : 14, 20), rowH = k * bh + (k - 1) * gap + 14;
    const plotTop = hd.top + 4, plotH = n * rowH;
    const H = plotTop + plotH + 34;
    const xAt = v => left + ((v - sc.min) / (sc.max - sc.min)) * plotW;
    let g = '';
    sc.ticks.forEach(t => {
      const x = xAt(t);
      g += `<line x1="${r1(x)}" x2="${r1(x)}" y1="${r1(plotTop)}" y2="${r1(plotTop + plotH)}" stroke="${t === 0 ? pal.axis : pal.grid}"/>` + text(x, plotTop + plotH + 18, fmtNum(t, dec), { size: 11, fill: pal.muted, anchor: 'middle' });
    });
    idx.forEach((i, j) => {
      const yc = plotTop + j * rowH + rowH / 2, y0 = yc - (k * bh + (k - 1) * gap) / 2;
      g += `<text x="${24 + labW}" y="${r1(yc + 4)}" font-size="12" fill="${pal.ink}" text-anchor="end">${esc(fit(cats[j], 12, labW))}<title>${esc(cats[j])}</title></text>`;
      ycols.forEach((c, s) => {
        const v = c.values[i];
        if (v == null) return;
        const a = xAt(0), b = xAt(v), y = y0 + s * (bh + gap);
        if (Math.abs(b - a) < 0.5) return;
        const col = k === 1 ? pal.series[0] : pal.series[s];
        g += `<path d="${v >= 0 ? rowPath(a, b, y, bh, true, 4) : rowPath(b, a, y, bh, false, 4)}" fill="${col}"><title>${esc((k > 1 ? c.name + ', ' : '') + cats[j] + ': ' + fmtFull(v))}</title></path>`;
        if (k === 1) g += text(v >= 0 ? b + 8 : b - 8, y + bh / 2 + 4, fmtNum(v), { size: 11.5, fill: pal.ink, anchor: v >= 0 ? 'start' : 'end', bold: true });
      });
    });
    return { W, H, inner: hd.svg + g };
  }

  // ---- share of total: one tall segmented bar ----
  function share(table, spec, pal, W, warnings) {
    const xcol = spec.x != null ? table.columns[spec.x] : null;
    const ycol = (spec.y || []).map(i => table.columns[i]).find(c => c && c.type === 'number');
    if (!ycol) throw new Error('Pick the number column to split.');
    const lab = catLabeler(xcol);
    let parts = [];
    for (let i = 0; i < table.length; i++) { const v = ycol.values[i]; if (v != null && v > 0) parts.push({ name: lab(xcol ? xcol.values[i] : null, i), v }); }
    if (!parts.length) throw new Error('There are no positive values to split.');
    parts.sort((a, b) => b.v - a.v);
    if (parts.length > 6) {
      const rest = parts.slice(5);
      warnings.push(rest.length + ' smaller parts are folded into "Other".');
      parts = parts.slice(0, 5).concat({ name: 'Other', v: rest.reduce((a, p) => a + p.v, 0), other: true });
    }
    const total = parts.reduce((a, p) => a + p.v, 0);
    parts.forEach((p, i) => { p.color = p.other ? pal.other : pal.series[i]; p.pct = p.v / total * 100; });
    const hd = header(W, spec, pal, null);
    const barTop = hd.top + 6, bw = W - 48, bh = 28;
    let g = '', x = 24;
    parts.forEach((p, i) => {
      const w = Math.max(0, p.v / total * bw - (i < parts.length - 1 ? 2 : 0));
      g += `<rect x="${r1(x)}" y="${barTop}" width="${r1(w)}" height="${bh}" rx="4" fill="${p.color}"><title>${esc(p.name + ': ' + fmtFull(p.v) + ' (' + r1(p.pct) + '%)')}</title></rect>`;
      const t = Math.round(p.pct) + '%';
      if (tw(t, 12, true) + 16 <= w) g += text(x + 8, barTop + 18, t, { size: 12, fill: onFill(p.color), bold: true });
      x += p.v / total * bw;
    });
    // legend of names, in block order
    let ly = barTop + bh + 26, lx = 24;
    parts.forEach(p => {
      const w = 10 + 7 + tw(p.name, 12) + 22;
      if (lx + w > W - 24 && lx > 24) { lx = 24; ly += 20; }
      g += `<rect x="${lx}" y="${ly - 9}" width="10" height="10" rx="2" fill="${p.color}"/>` + text(lx + 17, ly, p.name, { size: 12, fill: pal.ink });
      lx += w;
    });
    return { W, H: ly + 22, inner: hd.svg + g };
  }

  // ---- gantt ----
  function gantt(table, spec, pal, W, warnings) {
    const col = i => (i == null || i < 0 ? null : table.columns[i]);
    const task = col(spec.task), start = col(spec.start), end = col(spec.end), dur = col(spec.duration), grp = col(spec.group), prog = col(spec.progress);
    if (!start || start.type !== 'date') throw new Error('Pick the start date column.');
    if (!task) throw new Error('Pick the task name column.');
    if ((!end || end.type !== 'date') && !(dur && dur.type === 'number')) throw new Error('Pick an end date column, or a duration column.');
    let rows = [], skipped = 0, swapped = 0;
    for (let i = 0; i < table.length; i++) {
      const s = start.values[i];
      if (s == null) { skipped++; continue; }
      let e, milestone = false;
      if (end && end.type === 'date') e = end.values[i];
      else e = dur.values[i] == null ? null : s + Math.max(0, dur.values[i] - 1) * DAY;
      if (end && end.type === 'date' && dur && dur.type === 'number' && e == null) e = dur.values[i] == null ? null : s + Math.max(0, dur.values[i] - 1) * DAY;
      if (e == null || (!end && dur && dur.values[i] === 0)) { e = s; milestone = true; }
      let a = s, b = e;
      if (b < a) { a = e; b = s; swapped++; }
      rows.push({ name: task.values[i] == null ? '(untitled)' : String(task.values[i]), s: a, e: milestone ? a : b + DAY, milestone, group: grp ? (grp.values[i] == null ? '(none)' : String(grp.values[i])) : null, p: prog && prog.values[i] != null ? prog.values[i] : null, i });
    }
    if (skipped) warnings.push(skipped + ' row' + (skipped > 1 ? 's' : '') + ' without a start date ' + (skipped > 1 ? 'were' : 'was') + ' left out.');
    if (swapped) warnings.push(swapped + ' row' + (swapped > 1 ? 's' : '') + ' had the end before the start; the dates were swapped.');
    if (!rows.length) throw new Error('There are no rows with a start date to draw.');
    if (spec.sort === 'start') rows.sort((a, b) => a.s - b.s || a.i - b.i);
    if (rows.length > 80) { warnings.push('Only the first 80 tasks are drawn.'); rows = rows.slice(0, 80); }
    // progress: a column of fractions (all at most 1) reads as percent
    let scaleP = 1;
    const ps = rows.map(r => r.p).filter(v => v != null);
    if (ps.length && Math.max(...ps) <= 1) scaleP = 100;
    rows.forEach(r => { if (r.p != null) r.p = Math.max(0, Math.min(100, r.p * scaleP)); });

    // group colors: fixed order of first appearance; groups past the palette share grey
    const groups = [];
    rows.forEach(r => { if (r.group != null && !groups.includes(r.group)) groups.push(r.group); });
    const cap = pal.series.length;
    const colorOf = g => { if (g == null) return pal.series[0]; const i = groups.indexOf(g); return i < cap - (groups.length > cap ? 1 : 0) ? pal.series[i] : pal.other; };
    if (groups.length > cap) warnings.push('More than ' + cap + ' groups: the extra ones share the grey "Other" color.');
    let legend = null;
    if (groups.length > 1) {
      legend = groups.slice(0, groups.length > cap ? cap - 1 : cap).map(g => ({ name: g, color: colorOf(g) }));
      if (groups.length > cap) legend.push({ name: 'Other', color: pal.other });
    }

    const hd = header(W, spec, pal, legend);
    const labW = Math.min(280, Math.max(110, Math.max(...rows.map(r => tw(r.name, 12))) + 14));
    const left = 24 + labW, right = 24, plotW = W - left - right;
    const ax = timeAxis(Math.min(...rows.map(r => r.s)), Math.max(...rows.map(r => r.e)), Math.max(3, Math.floor(plotW / 62)), true);
    const xAt = t => left + ((t - ax.min) / (ax.max - ax.min)) * plotW;
    const rowH = 30, bh = 16, axisH = 30;
    const top = hd.top, bodyTop = top + axisH, bodyH = rows.length * rowH;
    const H = bodyTop + bodyH + 20;
    let g = '';
    // time axis band and vertical grid
    ax.ticks.forEach(t => {
      const x = xAt(t.t);
      if (x > left + plotW + 0.5) return;
      g += `<line x1="${r1(x)}" x2="${r1(x)}" y1="${top + 6}" y2="${bodyTop + bodyH}" stroke="${pal.grid}"/>` + text(x + 4, top + 21, t.label, { size: 11, fill: pal.muted });
    });
    g += `<line x1="24" x2="${W - 24}" y1="${bodyTop}" y2="${bodyTop}" stroke="${pal.axis}"/>`;
    g += text(24, top + 21, task.name, { size: 11, fill: pal.muted, bold: true });
    rows.forEach((r, j) => {
      const y = bodyTop + j * rowH;
      if (j) g += `<line x1="24" x2="${W - 24}" y1="${y}" y2="${y}" stroke="${pal.faint}"/>`;
      g += `<text x="24" y="${r1(y + rowH / 2 + 4)}" font-size="12" fill="${pal.ink}">${esc(fit(r.name, 12, labW - 14))}<title>${esc(r.name)}</title></text>`;
      const c = colorOf(r.group), x1 = xAt(r.s), x2 = xAt(r.e), by = y + (rowH - bh) / 2;
      const when = r.milestone ? fmtDate(r.s, 'ymd') : fmtDate(r.s, 'ymd') + ' to ' + fmtDate(r.e - DAY, 'ymd');
      const tip = `<title>${esc(r.name + ' | ' + when + (r.group ? ' | ' + r.group : '') + (r.p != null ? ' | ' + Math.round(r.p) + '% done' : ''))}</title>`;
      if (r.milestone) {
        const cx = x1, cy = by + bh / 2, s = 9;
        g += `<path d="M${r1(cx)},${r1(cy - s)}L${r1(cx + s)},${r1(cy)}L${r1(cx)},${r1(cy + s)}L${r1(cx - s)},${r1(cy)}Z" fill="${c}" stroke="${pal.surface}" stroke-width="2">${tip}</path>`;
      } else {
        const w = Math.max(6, x2 - x1);
        if (r.p != null) {
          const id = 'gc' + (++uid);
          g += `<clipPath id="${id}"><rect x="${r1(x1)}" y="${r1(by)}" width="${r1(w)}" height="${bh}" rx="4"/></clipPath>` +
            `<rect x="${r1(x1)}" y="${r1(by)}" width="${r1(w)}" height="${bh}" rx="4" fill="${c}" fill-opacity="0.28">${tip}</rect>` +
            `<rect x="${r1(x1)}" y="${r1(by)}" width="${r1(w * r.p / 100)}" height="${bh}" fill="${c}" clip-path="url(#${id})"/>`;
        } else g += `<rect x="${r1(x1)}" y="${r1(by)}" width="${r1(w)}" height="${bh}" rx="4" fill="${c}">${tip}</rect>`;
      }
      if (spec.dates) {
        const t = r.milestone ? fmtDate(r.s, 'md') : fmtDate(r.s, 'md') + ' - ' + fmtDate(r.e - DAY, 'md');
        const wLab = tw(t, 11);
        const endX = r.milestone ? x1 + 12 : x2;
        g += endX + 8 + wLab < W - 24 ? text(endX + 8, by + bh / 2 + 4, t, { size: 11, fill: pal.muted }) : text((r.milestone ? x1 - 12 : x1) - 8, by + bh / 2 + 4, t, { size: 11, fill: pal.muted, anchor: 'end' });
      }
    });
    // today marker
    const today = spec.todayMs != null ? spec.todayMs : Date.now();
    if (spec.today !== false && today >= ax.min && today <= ax.max) {
      const x = xAt(today);
      g += `<line x1="${r1(x)}" x2="${r1(x)}" y1="${top + 6}" y2="${bodyTop + bodyH}" stroke="${pal.accentDeep}" stroke-width="1.5"/>` +
        `<rect x="${r1(x - 19)}" y="${top - 8}" width="38" height="14" rx="3" fill="${pal.accentDeep}"/>` + text(x, top + 2, 'Today', { size: 9.5, fill: onFill(pal.accentDeep), anchor: 'middle', bold: true });
    }
    return { W, H, inner: hd.svg + g };
  }

  // ---- public ----
  function render(table, spec, pal, opts) {
    opts = opts || {};
    pal = pal || paletteFromTemplate(null);
    const W = spec.width || 960;
    const warnings = [];
    const fn = spec.type === 'gantt' ? gantt : spec.type === 'hbar' ? horizontal : spec.type === 'share' ? share : vertical;
    const r = fn(table, spec, pal, W, warnings);
    return { svg: frame(r.W, r.H, { pal, title: spec.title, responsive: opts.responsive }, r.inner), width: r.W, height: Math.round(r.H), warnings };
  }

  // ---- defaults from the data ----
  const has = (c, re) => re.test(c.name);
  function autoSpec(table, type) {
    const cols = table.columns;
    const by = t => cols.filter(c => c.type === t);
    const texts = by('text'), nums = by('number'), dates = by('date');
    const idish = /^(id|index|row|no\.?|#|number)$/i;
    const pick = (list, re, not) => list.find(c => re.test(c.name) && !(not || []).includes(c));
    if (!type) type = dates.length >= 2 && (texts.length || cols.length > 2) ? 'gantt' : dates.length === 1 && nums.length ? 'line' : 'bar';
    const spec = { type, title: '', subtitle: '' };
    if (type === 'gantt') {
      const task = pick(texts, /task|activity|name|item|milestone|deliverable|work|step/i) || texts[0] || cols.find(c => c.type !== 'date') || cols[0];
      const start = pick(dates, /start|begin|from|kick/i) || dates[0];
      const end = pick(dates, /end|finish|due|complete|to\b|deliver/i, [start]) || dates.find(c => c !== start);
      const dur = !end ? nums.find(c => /duration|days|length|effort|weeks/i.test(c.name)) : null;
      const prog = nums.find(c => /progress|complete|%|done|percent/i.test(c.name));
      const grp = texts.find(c => c !== task && /phase|group|team|owner|category|stage|workstream|type|assignee|resource|status|lane/i.test(c.name))
        || texts.find(c => c !== task && new Set(c.values.filter(v => v != null)).size <= 6 && new Set(c.values.filter(v => v != null)).size < table.length);
      Object.assign(spec, { task: task && task.index, start: start && start.index, end: end ? end.index : null, duration: dur ? dur.index : null, group: grp ? grp.index : null, progress: prog ? prog.index : null, sort: 'sheet', today: true, dates: false });
      return spec;
    }
    const x = dates[0] || texts[0] || cols.find(c => c.type !== 'number');
    const vals = nums.filter(c => c !== x && !idish.test(c.name));
    spec.x = x ? x.index : null;
    spec.y = (type === 'hbar' || type === 'share' ? vals.slice(0, 1) : vals.slice(0, 4)).map(c => c.index);
    if (type === 'hbar') spec.sort = 'value';
    return spec;
  }

  // ---- :::chart block ----
  const csvCell = v => { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function tableToCsv(table, limit) {
    const lines = [table.columns.map(c => csvCell(c.name)).join(',')];
    for (let i = 0; i < Math.min(table.length, limit || 1e9); i++) {
      lines.push(table.columns.map(c => {
        const v = c.values[i];
        if (v == null) return '';
        return c.type === 'date' ? new Date(v).toISOString().slice(0, 10) : csvCell(v);
      }).join(','));
    }
    return lines.join('\n');
  }
  const OPTION_KEYS = ['task', 'start', 'end', 'duration', 'group', 'progress', 'x', 'y', 'sort', 'today', 'dates', 'subtitle', 'height'];
  // Markdown for a :::chart block that carries the data, so the report stays self-contained.
  function toBlock(table, spec) {
    const name = i => (i == null || i < 0 || !table.columns[i] ? null : table.columns[i].name);
    const o = [];
    const add = (k, v) => { if (v != null && v !== '') o.push(k + ': ' + v); };
    if (spec.type === 'gantt') {
      add('task', name(spec.task)); add('start', name(spec.start)); add('end', name(spec.end)); add('duration', name(spec.duration));
      add('group', name(spec.group)); add('progress', name(spec.progress));
      if (spec.sort === 'start') add('sort', 'start');
      if (spec.today === false) add('today', 'no');
      if (spec.dates) add('dates', 'yes');
    } else {
      add('x', name(spec.x)); add('y', (spec.y || []).map(name).filter(Boolean).join(', '));
      if (spec.type === 'hbar' && spec.sort === 'sheet') add('sort', 'sheet');
    }
    add('subtitle', spec.subtitle);
    return ':::chart ' + spec.type + (spec.title ? ' ' + spec.title : '') + '\n' + o.join('\n') + '\n' + tableToCsv(table, 400) + '\n:::';
  }
  // Reads the option lines of a :::chart block (keys by column name or letter) into a spec.
  function fromBlock(table, args, options) {
    const m = String(args).match(/^(\w+)\s*(.*)$/);
    const type = m && TYPES.some(t => t.id === m[1].toLowerCase()) ? m[1].toLowerCase() : null;
    const spec = autoSpec(table, type || 'bar');
    spec.title = type ? m[2].trim() : String(args).trim();
    const find = ref => {
      ref = String(ref).trim();
      let c = table.columns.find(c => c.name.toLowerCase() === ref.toLowerCase());
      if (!c && /^[A-Za-z]$/.test(ref)) c = table.columns[ref.toUpperCase().charCodeAt(0) - 65];
      return c ? c.index : null;
    };
    const problems = [];
    const ref = (key, setter) => {
      if (options[key] == null) return;
      const i = find(options[key]);
      if (i == null) problems.push('Column "' + options[key] + '" was not found for ' + key + '.'); else setter(i);
    };
    ['task', 'start', 'end', 'duration', 'group', 'progress'].forEach(k => ref(k, i => { spec[k] = i; }));
    ref('x', i => { spec.x = i; });
    if (options.y != null) {
      const ys = options.y.split(',').map(s => find(s)).filter(i => i != null);
      if (ys.length) spec.y = ys; else problems.push('No value column matched y: ' + options.y);
    }
    if (options.sort) spec.sort = options.sort.toLowerCase();
    if (options.today) spec.today = !/^(no|false|off)$/i.test(options.today);
    if (options.dates) spec.dates = /^(yes|true|on)$/i.test(options.dates);
    if (options.subtitle) spec.subtitle = options.subtitle;
    if (options.height && +options.height > 120) spec.plotHeight = Math.min(900, +options.height);
    return { spec, problems };
  }

  return { TYPES, OPTION_KEYS, render, autoSpec, paletteFromTemplate, toBlock, fromBlock, tableToCsv, fmtNum };
});
