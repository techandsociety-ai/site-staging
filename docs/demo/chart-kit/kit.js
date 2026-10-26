/* CHIP50 chart kit (demo). One question file (a JSON file next to this
   script, built by tools/build_question.py) feeds every view: the U.S. or a
   state by group, and all states side by side. view() turns the question and
   a choice of view and place into a chart spec; layout() turns a spec and a
   frame size into a flat list of shapes; toSVG() and draw() paint that list,
   so the page, the embed, the downloads, the cards and the clip are all the
   same drawing. */
(function () {
  var SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  /* exports are always light; the page chart follows the site theme */
  var LIGHT = {surface: '#ffffff', ink: '#14140f', ink2: '#4a4a44', muted: '#6e6d65',
    rule: '#e4e3dc', track: '#efeee8', acc: '#2a78d6', soft: '#aac9ef', onacc: '#ffffff', hit: 'transparent',
    mix: function (t) { return lerp([239, 238, 232], [42, 120, 214], t); },
    gap: function (g, within) { return scales('light').gap(g, within); }, hatch: function () { return scales('light').hatch; }};
  var THEMED = {surface: 'var(--surface)', ink: 'var(--ink)', ink2: 'var(--ink2)', muted: 'var(--muted)',
    rule: 'var(--rule)', track: 'var(--rule2)', acc: 'var(--acc)', soft: 'color-mix(in srgb,var(--acc) 40%,var(--surface))',
    onacc: '#ffffff', hit: 'transparent',
    mix: function (t) { return 'color-mix(in srgb,var(--acc) ' + Math.round(t * 100) + '%,var(--rule2))'; },
    gap: function (g, within) { return scales().gap(g, within); }, hatch: function () { return scales().hatch; }};

  /* ---------- the colour scales the explorers share ----------
     share: one blue, 0-100% on every row, light to dark (dark to light in
     dark mode), stops from the site's blue ramp, interpolated in OKLab.
     gap: points from the U.S., orange below and blue above through a grey
     midpoint; both arms end at the same OKLab lightness (0.74 light, 0.53
     dark) so neither side shouts, and full colour comes at SPAN points. A gap
     inside the margin of error is that grey with light diagonal stripes, so
     "can't tell" never reads as "same as the U.S.", which is plain grey.
     Each colour carries the ink (white or near-black) that contrasts more. */
  var SPAN = 15;
  var RAMP = {light: ['#f2f6fb', '#9ec5f4', '#3987e5', '#184f95', '#0d366b'], dark: ['#1c2330', '#184f95', '#3987e5', '#86b6ef', '#cde2fb']};
  var DIVERGE = {light: ['#f18d68', '#f0efec', '#85aee3'], dark: ['#a45132', '#383835', '#3d6da8']};
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function gam(c) { return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); }
  function rgbOf(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function toLab(hex) {
    var c = rgbOf(hex).map(lin), r = c[0], g = c[1], b = c[2];
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
      m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
      q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q];
  }
  function toHex(L) {
    var l = Math.pow(L[0] + 0.3963377774 * L[1] + 0.2158037573 * L[2], 3), m = Math.pow(L[0] - 0.1055613458 * L[1] - 0.0638541728 * L[2], 3),
      q = Math.pow(L[0] - 0.0894841775 * L[1] - 1.2914855480 * L[2], 3);
    return '#' + [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * q]
      .map(function (c) { return ('0' + Math.round(gam(Math.max(0, Math.min(1, c)))).toString(16)).slice(-2); }).join('');
  }
  function toward(a, b, t) { return a.map(function (c, k) { return c + (b[k] - c) * t; }); }
  function lum(hex) { var c = rgbOf(hex).map(lin); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(x, y) { var a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
  function inkOn(fill) { return contrast(fill, '#ffffff') > contrast(fill, '#14140f') ? '#ffffff' : '#14140f'; }
  /* the page's theme, read off its surface colour */
  function themeMode() {
    var s = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() : '';
    return /^#[0-9a-f]{6}$/i.test(s) && lum(s) < 0.2 ? 'dark' : 'light';
  }
  var built = {};
  function scales(mode) {
    mode = mode || themeMode();
    if (built[mode]) return built[mode];
    var stops = RAMP[mode].map(toLab), seg = 100 / (stops.length - 1), share = [], div = [];
    for (var v = 0; v <= 100; v++) {
      var i = Math.min(stops.length - 2, Math.floor(v / seg)), f = toHex(toward(stops[i], stops[i + 1], (v - i * seg) / seg));
      share.push({fill: f, ink: inkOn(f)});
    }
    var d = DIVERGE[mode].map(toLab);
    for (var j = 0; j <= SPAN * 4; j++) {
      var g = j / 2 - SPAN, h = toHex(toward(d[1], g < 0 ? d[0] : d[2], Math.abs(g) / SPAN));
      div.push({fill: h, ink: inkOn(h)});
    }
    var hatch = {mid: div[SPAN * 2].fill, stripe: toHex(toward(d[1], toLab(mode === 'dark' ? '#f4f3ee' : '#14140f'), 0.085))};
    return (built[mode] = {mode: mode, share: share, div: div, hatch: hatch, span: SPAN,
      level: function (v) { return share[Math.max(0, Math.min(100, Math.round(v)))]; },
      gap: function (g, within) {
        if (within) return {fill: hatch.mid, ink: div[SPAN * 2].ink, hatch: true};
        return div[Math.round((Math.max(-SPAN, Math.min(SPAN, g)) + SPAN) * 2)];
      },
      /* CSS for a striped swatch, for the pages' own HTML keys and chips */
      stripes: 'repeating-linear-gradient(45deg,' + hatch.stripe + ' 0 1.5px,' + hatch.mid + ' 1.5px 6px)'});
  }
  /* a share as printed (a decimal under 10%), the points between two shares
     as printed, and which side of the U.S. a state sits on by Table 8's
     margin: 1 above, -1 below, 0 inside the margin */
  function shown(v) { return v < 9.95 ? Math.round(v * 10) / 10 : Math.round(v); }
  function gapOf(v, us) { return Math.round((shown(v) - shown(us)) * 10) / 10; }
  function side(st, us) { var g = gapOf(st.value, us); return Math.abs(g) <= (moe(st.value, st.n) || 0) ? 0 : g > 0 ? 1 : -1; }

  function lerp(a, b, t) {
    return '#' + a.map(function (v, i) { return ('0' + Math.round(v + (b[i] - v) * t).toString(16)).slice(-2); }).join('');
  }
  var mctx = document.createElement('canvas').getContext('2d');
  function font(size, weight) { return (weight || 400) + ' ' + size + 'px ' + SANS; }
  function measure(text, size, weight) { mctx.font = font(size, weight); return mctx.measureText(text).width; }
  function wrap(text, size, weight, maxW) {
    var lines = [], line = '';
    text.split(' ').forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (line && measure(t, size, weight) > maxW) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }
  function ease(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }
  /* shares under 10% keep a decimal, so small platforms still read */
  function pct(v) { return v == null ? '—' : (v < 9.95 ? v.toFixed(1) : Math.round(v)) + '%'; }
  function num(n) { return n.toLocaleString('en-US'); }
  /* for radio copy: the same precision as pct, spelled for the ear */
  function words(v) { return pct(v).replace('%', ' percent'); }
  /* 95% margin of error in points, the way the Work report's Table 8 does it:
     1.96 * sqrt(p(1 - p) / n) on the unweighted n. It leaves out the effect
     of weighting, so the true margin is somewhat wider. At 0% or 100% the
     formula gives zero, which would claim certainty, so it gives nothing. */
  function moe(v, n) { var q = v / 100; return v == null || !n || v <= 0 || v >= 100 ? null : 196 * Math.sqrt(q * (1 - q) / n); }
  function pm(v, n) { var m = moe(v, n); return m == null ? '' : '±' + m.toFixed(1); }
  /* Table 8 stars groups under 100 respondents: interpret with caution */
  var FEW = 100;
  function star(n) { return n < FEW ? '*' : ''; }
  var CAUTION = '* Fewer than ' + FEW + ' respondents: interpret with caution.';
  function fill(t, o) { return t.replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); }

  /* view(q, 'by' | 'states', slug) → a chart spec. 'by' is the U.S. by group,
     or one state by group with U.S. ticks; 'states' is every state, with the
     chosen one highlighted. */
  function view(q, v, slug) {
    var st = slug ? q.states.filter(function (s) { return s.slug === slug; })[0] : null;
    var T = q.text, o = {us: pct(q.us.value), usWords: words(q.us.value), usN: num(q.us.n),
      wave: q.wave, fielded: q.fielded};
    if (st) { o.state = st.label; o.value = pct(st.value); o.words = words(st.value); o.n = num(st.n); }
    var t = v === 'states' ? T.states : T.age[st ? 'state' : 'us'];
    var spec = {question: q.id, view: v, state: st ? st.slug : null, site: q.site, moe: true,
      title: fill(t.title, o), subtitle: fill(t.subtitle, o), source: fill(t.source, o),
      radio: fill(T.radio[st ? 'state' : 'us'], o)};
    if (v === 'states') {
      spec.kind = 'states';
      spec.ref = {value: q.us.value, label: 'U.S. ' + pct(q.us.value)};
      spec.rows = q.states.map(function (s) {
        return {label: s.label, abbr: s.abbr, key: s.slug, value: s.value, n: s.n, hi: !!st && s === st};
      });
      if (st) spec.callout = st.label + ' ' + pct(st.value);
      spec.csv = [['state', 'pct_weighted', 'unweighted_n', 'moe_95']].concat(q.states.map(function (s) { return [s.name, s.value, s.n, r1(moe(s.value, s.n))]; }));
      spec.stem = 'chip50-' + q.id + '-states' + (st ? '-' + st.slug : '');
    } else {
      spec.kind = 'bars';
      spec.showN = true;
      spec.rows = (st ? st.by : q.by).map(function (g, i) {
        return {label: g.label, value: g.value, n: g.n, ref: st ? q.by[i].value : null};
      });
      spec.csv = st
        ? [[q.byName, st.name + ' pct_weighted', 'unweighted_n', 'moe_95', 'us_pct_weighted']].concat(
          st.by.map(function (g, i) { return [g.label, g.value, g.n, r1(moe(g.value, g.n)), q.by[i].value]; }))
        : [[q.byName, 'pct_weighted', 'unweighted_n', 'moe_95']].concat(q.by.map(function (g) { return [g.label, g.value, g.n, r1(moe(g.value, g.n))]; }));
      spec.stem = 'chip50-' + q.id + '-' + q.byName + (st ? '-' + st.slug : '');
    }
    return spec;
  }

  /* across(qs, slug, meta) → a chart spec for one place across every
     question in a set: the place's share on each, with U.S. ticks when the
     place is a state. Rows keep the set's order so they don't jump when the
     place changes. */
  function across(qs, slug, meta) {
    var st = null, T = meta.text || {}, A = T.across || {}, base = T.base || 'adults';
    var rows = qs.map(function (q) {
      var s = slug ? q.states.filter(function (x) { return x.slug === slug; })[0] : null;
      if (s) st = s;
      return {label: q.label, key: q.id, value: s ? s.value : q.us.value, n: s ? s.n : q.us.n, ref: s ? q.us.value : null};
    });
    var q0 = qs[0], where = st ? st.label : 'U.S.', o = {place: where, count: qs.length};
    return {kind: 'bars', question: meta.set, view: 'questions', state: st ? st.slug : null, site: q0.site, rows: rows, moe: true,
      title: st ? fill(A.state_title || '{place} across {count} platforms', o) : (A.us_title || 'Which platforms U.S. adults use'),
      subtitle: fill(A.subtitle || 'Share of {place} adults who say they ever use each, spring 2026', o) +
        (st ? '. Ticks mark the U.S.' : ''),
      source: 'CHIP50 survey, ' + q0.wave + ', ' + q0.fielded + '. ' + num(st ? st.n : q0.us.n) + ' ' + base +
        (st ? ' in ' + st.label + ', weighted within the state' : ', weighted to the adult population') + '.',
      radio: '', csv: [['question', where + ' pct_weighted', 'unweighted_n', 'moe_95'].concat(st ? ['us_pct_weighted'] : [])].concat(
        rows.map(function (r) { return [r.label, r.value, r.n, r1(moe(r.value, r.n))].concat(st ? [r.ref] : []); })),
      stem: 'chip50-' + meta.set + (st ? '-' + st.slug : '')};
  }

  /* layout(spec, W, H, opt) → {w, h, ops}. With H the drawing fills a fixed
     frame (social cards); without it the height fits the content (page,
     embed, print). opt.bare drops title and footer; opt.progress (0–1)
     grows the bars for animation. All-states charts draw as a ranked list
     where there is height for 51 rows and as a tile map where there isn't;
     a wide frame puts the words beside the map. */
  function layout(spec, W, H, opt) {
    opt = opt || {};
    var fixed = !!H, p = opt.progress == null ? 1 : opt.progress;
    var k = fixed ? Math.min(W, H) / 600 : Math.max(0.85, Math.min(1.15, W / 700));
    var tall = fixed && H / W > 1.5;
    var map = spec.kind === 'states' && fixed && !tall, wide = map && W / H > 1.5;
    var pad = fixed ? (opt.bare ? 6 * k : 44 * k) : (opt.bare ? 0 : 20 * k);
    var inner = W - 2 * pad, ops = [], y = pad;
    var colW = wide ? inner * 0.36 : inner;
    var S = {head: 28 * k * (tall ? 1.3 : 1), sub: 16 * k * (tall ? 1.15 : 1),
      lab: 15 * k * (tall ? 1.25 : 1), val: 15 * k * (tall ? 1.25 : 1), foot: 12.5 * k};
    function text(t, x, yy, size, weight, c, anchor, a) {
      ops.push({t: 'text', text: t, x: x, y: yy, size: size, weight: weight, c: c,
        anchor: anchor || 'start', a: a == null ? 1 : a});
    }

    if (!opt.bare) {
      wrap(spec.title, S.head, 700, colW).forEach(function (l) { y += S.head * 1.12; text(l, pad, y, S.head, 700, 'ink'); });
      y += 8 * k;
      wrap(spec.subtitle, S.sub, 400, colW).forEach(function (l) { y += S.sub * 1.35; text(l, pad, y, S.sub, 400, 'ink2'); });
      y += 26 * k;
    }

    /* the footer is measured first so a fixed card can pin it to the bottom */
    var few = spec.moe && spec.rows.some(function (r) { return r.n < FEW; });
    var src = spec.source + (spec.moe ? ' Lines show 95% margins of error.' : '') + (few ? ' ' + CAUTION : '');
    var foot = opt.bare ? [] : wrap('Source: ' + src, S.foot, 400, inner);
    var footH = opt.bare ? 0 : 14 * k + foot.length * S.foot * 1.45 + S.foot * 1.7;
    var g = {ops: ops, text: text, k: k, S: S, p: p, fixed: fixed, x: pad, y: y, w: inner};
    if (wide) { g.x = pad + colW + 32 * k; g.w = inner - colW - 32 * k; g.y = pad; }
    if (fixed) g.region = H - pad - footH - (opt.bare ? 0 : 24 * k) - g.y;
    y = (map ? tiles : spec.kind === 'states' ? ranked : bars)(spec, g);

    if (opt.bare) return {w: W, h: Math.ceil(y + 4 * k), ops: ops};
    var fy = fixed ? H - pad - footH : y + 20 * k;
    ops.push({t: 'line', x1: pad, y1: fy, x2: W - pad, y2: fy, c: 'rule', sw: Math.max(1, k)});
    fy += 14 * k;
    foot.forEach(function (l) { fy += S.foot * 1.45; text(l, pad, fy, S.foot, 400, 'muted'); });
    fy += S.foot * 1.7;
    text('CHIP50', pad, fy, S.foot * 1.1, 700, 'ink');
    text(spec.site, W - pad, fy, S.foot, 400, 'muted', 'end');
    return {w: W, h: Math.ceil(fixed ? H : fy + pad), ops: ops};
  }

  /* one bar per group, 0–100; a state's chart carries a U.S. tick per bar */
  function bars(spec, g) {
    var k = g.k, S = g.S, rows = spec.rows, n = rows.length, rh = 34 * k, y0 = g.y;
    if (g.fixed) { rh = Math.min(g.region / n, 72 * k); y0 = g.y + (g.region - rh * n) / 2; }
    var refs = rows.some(function (r) { return r.ref != null; });
    /* 0–100 on a grey track, unless every share is small: then 0 to the next ten, no track */
    var top = Math.max.apply(null, rows.map(function (r) { return Math.max((r.value || 0) + (spec.moe && moe(r.value, r.n) || 0), r.ref || 0); }));
    var dom = top >= 50 ? 100 : Math.max(10, Math.ceil(top / 10) * 10);
    var labW = Math.max.apply(null, rows.map(function (r) { return measure(r.label, S.lab, 400); })) + 14 * k;
    /* spec.showN adds a column of respondent counts at the right, so small groups show as small */
    var nText = function (r) { return pm(r.value, r.n) + '  n=' + num(r.n) + star(r.n); };
    var nW = spec.showN ? Math.max.apply(null, rows.map(function (r) { return measure(nText(r), S.lab * 0.8, 400); })) + 12 * k : 0;
    var barMax = g.w - labW - measure('100%', S.val, 700) - 10 * k - nW;
    var bh = Math.min(rh * 0.6, 22 * k * (g.fixed ? 1.7 : 1)), x0 = g.x + labW;
    /* each row starts a little after the one above; the stagger shrinks with
       the row count so the last bar still reaches full length at the end */
    var lag = Math.min(0.08, 0.6 / Math.max(1, n - 1));
    rows.forEach(function (r, i) {
      var cy = y0 + rh * i + rh / 2, e = ease(g.p * 1.6 - i * lag);
      var bw = r.value == null ? 0 : barMax * r.value / dom * e;
      g.text(r.label, x0 - 14 * k, cy + S.lab * 0.35, S.lab, 400, 'ink2', 'end');
      if (dom === 100) g.ops.push({t: 'rect', x: x0, y: cy - bh / 2, w: barMax, h: bh, c: 'track'});
      g.ops.push({t: 'rect', x: x0, y: cy - bh / 2, w: bw, h: bh, c: 'acc', title: r.label + ': ' + pct(r.value) + ' ' + pm(r.value, r.n)});
      whisker(g, spec, r, x0, barMax / dom, dom, cy, bh * 0.9, e);
      if (r.ref != null) {
        var tx = x0 + barMax * r.ref / dom;
        g.ops.push({t: 'line', x1: tx, y1: cy - bh / 2 - 5 * k, x2: tx, y2: cy + bh / 2 + 5 * k, c: 'ink', sw: 2.5 * k});
      }
      var a = ease((e - 0.6) / 0.4);
      if (spec.showN) g.text(nText(r), g.x + g.w, cy + S.val * 0.35, S.lab * 0.8, 400, 'muted', 'end');
      if (refs) g.text(pct(r.value), g.x + g.w - nW, cy + S.val * 0.35, S.val, 700, 'ink', 'end', a);
      else g.text(pct(r.value), x0 + bw + 8 * k, cy + S.val * 0.35, S.val, 700, 'ink', 'start', a);
      /* rows with a key (a question, in the across view) are clickable */
      if (r.key) g.ops.push({t: 'rect', x: g.x, y: cy - rh / 2, w: g.w, h: rh, c: 'hit', r: 0, key: r.key, title: r.label + ': ' + pct(r.value)});
    });
    return y0 + rh * n;
  }

  /* a margin-of-error line through the end of a bar, capped at both ends */
  function whisker(g, spec, r, x0, perPt, dom, cy, h, e) {
    var m = spec.moe ? moe(r.value, r.n) : null;
    if (m == null || e < 1) return;
    var a = Math.max(0, r.value - m), b = Math.min(dom, r.value + m), k = g.k;
    [[a, b, cy, cy], [a, a, cy - h / 4, cy + h / 4], [b, b, cy - h / 4, cy + h / 4]].forEach(function (l) {
      g.ops.push({t: 'line', x1: x0 + l[0] * perPt, x2: x0 + l[1] * perPt, y1: l[2], y2: l[3], c: 'ink', sw: 1.25 * k, a: 0.55});
    });
  }

  /* every state, highest first, on a shared zero-based scale, U.S. line;
     values sit in their own column so the line never crosses them */
  function ranked(spec, g) {
    var k = g.k, rows = spec.rows.slice().sort(function (a, b) { return b.value - a.value; });
    var n = rows.length, top = 22 * k, rh = 19 * k;
    if (g.fixed) rh = Math.min((g.region - top) / n, 40 * k);
    var ls = Math.min(g.S.lab, rh * 0.74), y0 = g.y + top;
    var max = Math.min(100, Math.ceil(Math.max.apply(null, rows.map(function (r) { return r.value + (spec.moe && moe(r.value, r.n) || 0); })) / 10) * 10);
    var labW = Math.max.apply(null, rows.map(function (r) { return measure(r.label, ls, 700); })) + 12 * k;
    var barMax = g.w - labW - measure('100%', ls, 700) - 16 * k, x0 = g.x + labW, any = rows.some(function (r) { return r.hi; });
    var hits = [];
    rows.forEach(function (r, i) {
      var cy = y0 + rh * i + rh / 2, e = ease(g.p * 1.6 - i * Math.min(0.012, 0.6 / Math.max(1, n - 1))), bh = rh * 0.62;
      var bw = barMax * r.value / max * e;
      g.text(r.label + star(r.n), x0 - 12 * k, cy + ls * 0.35, ls, r.hi ? 700 : 400, r.hi ? 'ink' : 'ink2', 'end');
      g.ops.push({t: 'rect', x: x0, y: cy - bh / 2, w: bw, h: bh, c: any && !r.hi ? 'soft' : 'acc', r: 2 * k});
      whisker(g, spec, r, x0, barMax / max, max, cy, bh, e);
      g.text(pct(r.value), g.x + g.w, cy + ls * 0.35, ls, r.hi ? 700 : 400, r.hi ? 'ink' : 'ink2', 'end', ease((e - 0.6) / 0.4));
      /* an invisible row on top, so a click anywhere on the row picks the state */
      hits.push({t: 'rect', x: g.x, y: cy - rh / 2, w: g.w, h: rh, c: 'hit', r: 0, key: r.key, title: r.label + ': ' + pct(r.value) + ' ' + pm(r.value, r.n)});
    });
    var rx = x0 + barMax * spec.ref.value / max;
    g.ops.push({t: 'line', x1: rx, y1: y0 - 6 * k, x2: rx, y2: y0 + rh * n, c: 'ink', sw: 1.5 * k});
    g.text(spec.ref.label, rx, y0 - 10 * k, ls, 700, 'ink', 'middle');
    [].push.apply(g.ops, hits);
    return y0 + rh * n;
  }

  /* a tile per state on an 11 × 8 grid, shaded from the lowest state to the highest */
  var GRID = {AK: [0, 0], ME: [0, 10], VT: [1, 9], NH: [1, 10],
    WA: [2, 0], ID: [2, 1], MT: [2, 2], ND: [2, 3], MN: [2, 4], IL: [2, 5], WI: [2, 6], MI: [2, 7], NY: [2, 8], RI: [2, 9], MA: [2, 10],
    OR: [3, 0], NV: [3, 1], WY: [3, 2], SD: [3, 3], IA: [3, 4], IN: [3, 5], OH: [3, 6], PA: [3, 7], NJ: [3, 8], CT: [3, 9],
    CA: [4, 0], UT: [4, 1], CO: [4, 2], NE: [4, 3], MO: [4, 4], KY: [4, 5], WV: [4, 6], VA: [4, 7], MD: [4, 8], DE: [4, 9],
    AZ: [5, 1], NM: [5, 2], KS: [5, 3], AR: [5, 4], TN: [5, 5], NC: [5, 6], SC: [5, 7], DC: [5, 8],
    OK: [6, 3], LA: [6, 4], MS: [6, 5], AL: [6, 6], GA: [6, 7],
    HI: [7, 0], TX: [7, 3], FL: [7, 8]};
  function tiles(spec, g) {
    var k = g.k, gap = 5 * k, ls = 15 * k, sw = 26 * k;
    var vals = spec.rows.map(function (r) { return r.value; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var s = Math.min((g.w - 10 * gap) / 11, (g.region - 7 * gap) / 8);
    var gw = 11 * s + 10 * gap, gh = 8 * s + 7 * gap;
    var x0 = g.x + (g.w - gw) / 2, y0 = g.y + (g.region - gh) / 2, byGap = spec.colour === 'gap';
    /* a text op whose ink comes from the gap scale */
    function inked(o, d, within) { if (byGap) { o.gap = d; o.within = within; } }
    spec.rows.forEach(function (r) {
      var at = GRID[r.abbr], x = x0 + at[1] * (s + gap), y = y0 + at[0] * (s + gap);
      var t = 0.1 + 0.9 * (r.value - lo) / (hi - lo), a = ease(g.p * 1.8 - (at[0] + at[1]) * 0.045);
      var c = t > 0.55 ? 'onacc' : 'ink', d = gapOf(r.value, spec.ref.value), within = side(r, spec.ref.value) === 0;
      var tile = {t: 'rect', x: x, y: y, w: s, h: s, r: s * 0.12, a: a, key: r.key,
        stroke: r.hi ? 'ink' : null, sw: 3.5 * k, title: r.label + ': ' + pct(r.value) + ' ' + pm(r.value, r.n) +
          (byGap ? ', ' + (d > 0 ? '+' : '') + d + ' pts' + (within ? ', within the margin' : '') : '')};
      if (byGap) { tile.gap = d; tile.within = within; } else tile.mix = t;
      g.ops.push(tile);
      g.text(r.abbr, x + s / 2, y + s * 0.45, s * 0.28, 700, c, 'middle', a); inked(g.ops[g.ops.length - 1], d, within);
      g.text(pct(r.value), x + s / 2, y + s * 0.78, s * 0.24, 400, c, 'middle', a); inked(g.ops[g.ops.length - 1], d, within);
    });
    /* the legend sits in the grid's empty top rows, between Alaska and Maine:
       the chosen state (or the U.S.) on the first, the shading key on the second */
    var lx = x0 + s + gap + 6 * k;
    g.text(spec.callout ? spec.callout + '  ·  ' + spec.ref.label : spec.ref.label, lx, y0 + s / 2 + ls * 0.35, ls, 700, 'ink');
    var ky = y0 + s + gap + s / 2;
    if (byGap) {
      /* points key: below to above, then the striped swatch */
      var kx0 = lx + measure('−' + SPAN, ls, 400) + 8 * k;
      g.text('−' + SPAN, lx, ky + ls * 0.35, ls, 400, 'ink2');
      [-SPAN, -SPAN / 2, 0, SPAN / 2, SPAN].forEach(function (d, i) {
        g.ops.push({t: 'rect', x: kx0 + i * sw, y: ky - ls * 0.55, w: sw, h: ls * 1.1, gap: d, r: 0});
      });
      var kx1 = kx0 + 5 * sw + 8 * k;
      g.text('+' + SPAN + ' pts', kx1, ky + ls * 0.35, ls, 400, 'ink2');
      var kx2 = kx1 + measure('+' + SPAN + ' pts', ls, 400) + 16 * k;
      g.ops.push({t: 'rect', x: kx2, y: ky - ls * 0.55, w: sw, h: ls * 1.1, gap: 0, within: true, r: 0});
      g.text('in margin', kx2 + sw + 8 * k, ky + ls * 0.35, ls, 400, 'ink2');
      return g.y + g.region;
    }
    g.text(pct(lo), lx, ky + ls * 0.35, ls, 400, 'ink2');
    var kx = lx + measure(pct(lo), ls, 400) + 8 * k;
    [0.1, 0.325, 0.55, 0.775, 1].forEach(function (t, i) {
      g.ops.push({t: 'rect', x: kx + i * sw, y: ky - ls * 0.55, w: sw, h: ls * 1.1, mix: t, r: 0});
    });
    g.text(pct(hi), kx + 5 * sw + 8 * k, ky + ls * 0.35, ls, 400, 'ink2');
    return g.y + g.region;
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function r1(v) { return Math.round(v * 10) / 10; }
  /* CSS variables only resolve inside style=, not in presentation attributes everywhere */
  function paint(prop, v) { return /^(var|color-mix)\(/.test(v) ? ' style="' + prop + ':' + v + '"' : ' ' + prop + '="' + v + '"'; }
  function colour(o, pal) { return o.gap != null ? pal.gap(o.gap, o.within).fill : o.mix != null ? pal.mix(o.mix) : pal[o.c]; }
  function inkOf(o, pal) { return o.gap != null ? pal.gap(o.gap, o.within).ink : pal[o.c]; }
  var hatchN = 0;
  function radius(o) { return o.r != null ? o.r : Math.min(o.h, o.w) / 2; }

  function toSVG(spec, L, pal, bg) {
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + L.w + ' ' + L.h + '" width="' + L.w +
      '" height="' + L.h + '" role="img" aria-label="' + esc(spec.title) + '" font-family=\'' + SANS + '\'>'];
    if (bg) out.push('<rect width="100%" height="100%"' + paint('fill', pal[bg]) + '/>');
    /* stripes for gaps inside the margin: one pattern per drawing, its own id */
    var hid = null;
    if (L.ops.some(function (o) { return o.within; })) {
      var h = pal.hatch();
      hid = 'chip50-hatch-' + (++hatchN);
      out.push('<defs><pattern id="' + hid + '" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">' +
        '<rect width="6" height="6" fill="' + h.mid + '"/><rect width="1.5" height="6" fill="' + h.stripe + '"/></pattern></defs>');
    }
    L.ops.forEach(function (o) {
      var a = o.a != null && o.a < 1 ? ' opacity="' + r1(o.a) + '"' : '';
      if (o.t === 'rect') {
        if (o.w <= 0) return;
        out.push('<rect x="' + r1(o.x) + '" y="' + r1(o.y) + '" width="' + r1(o.w) + '" height="' + r1(o.h) +
          '" rx="' + r1(radius(o)) + '"' + (o.within ? ' fill="url(#' + hid + ')"' : paint('fill', colour(o, pal))) + a +
          (o.stroke ? paint('stroke', pal[o.stroke]) + ' stroke-width="' + r1(o.sw) + '"' : '') +
          (o.key ? ' data-key="' + esc(o.key) + '"' : '') + '>' +
          (o.title ? '<title>' + esc(o.title) + '</title>' : '') + '</rect>');
      } else if (o.t === 'line') {
        out.push('<line x1="' + r1(o.x1) + '" y1="' + r1(o.y1) + '" x2="' + r1(o.x2) + '" y2="' + r1(o.y2) +
          '" stroke-width="' + r1(o.sw) + '"' + paint('stroke', pal[o.c]) + a + '/>');
      } else {
        out.push('<text x="' + r1(o.x) + '" y="' + r1(o.y) + '" font-size="' + r1(o.size) + '" font-weight="' + o.weight +
          '" text-anchor="' + o.anchor + '" pointer-events="none"' + a + paint('fill', inkOf(o, pal)) + '>' + esc(o.text) + '</text>');
      }
    });
    return out.join('') + '</svg>';
  }

  /* the same stripes as a canvas pattern: an 8px tile with seamless 45° lines */
  function hatchPattern(ctx, h) {
    var c = document.createElement('canvas'); c.width = c.height = 8;
    var x = c.getContext('2d');
    x.fillStyle = h.mid; x.fillRect(0, 0, 8, 8);
    x.strokeStyle = h.stripe; x.lineWidth = 1.5; x.beginPath();
    [[0, 8, 8, 0], [-1, 1, 1, -1], [7, 9, 9, 7]].forEach(function (l) { x.moveTo(l[0], l[1]); x.lineTo(l[2], l[3]); });
    x.stroke();
    return ctx.createPattern(c, 'repeat');
  }
  function draw(ctx, L, pal, bg) {
    if (bg) { ctx.fillStyle = pal[bg]; ctx.fillRect(0, 0, L.w, L.h); }
    var stripes = L.ops.some(function (o) { return o.within; }) ? hatchPattern(ctx, pal.hatch()) : null;
    L.ops.forEach(function (o) {
      ctx.globalAlpha = o.a == null ? 1 : o.a;
      if (o.t === 'rect') {
        if (o.w <= 0 || o.c === 'hit') return;
        var r = radius(o), x = o.x, y = o.y, w = o.w, h = o.h;
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
        ctx.fillStyle = o.within ? stripes : colour(o, pal); ctx.fill();
        if (o.stroke) { ctx.strokeStyle = pal[o.stroke]; ctx.lineWidth = o.sw; ctx.stroke(); }
      } else if (o.t === 'line') {
        ctx.strokeStyle = pal[o.c]; ctx.lineWidth = o.sw;
        ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
      } else {
        ctx.font = font(o.size, o.weight); ctx.fillStyle = inkOf(o, pal);
        ctx.textAlign = o.anchor === 'end' ? 'right' : o.anchor === 'middle' ? 'center' : 'left';
        ctx.fillText(o.text, o.x, o.y);
      }
    });
    ctx.globalAlpha = 1;
  }

  function canvas(spec, W, H, opt, scale) {
    scale = scale || 1;
    var L = layout(spec, W, H, opt), c = document.createElement('canvas');
    c.width = Math.round(L.w * scale); c.height = Math.round(L.h * scale);
    var ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    draw(ctx, L, LIGHT, 'surface');
    return c;
  }

  function save(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function png(spec, W, H, name, scale) {
    canvas(spec, W, H, {}, scale).toBlob(function (b) { save(b, name); }, 'image/png');
  }
  function svg(spec, name) {
    save(new Blob([toSVG(spec, layout(spec, 800), LIGHT, 'surface')], {type: 'image/svg+xml'}), name);
  }
  function csv(spec, name) {
    var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    save(new Blob([spec.csv.map(function (r) { return r.map(q).join(','); }).join('\n') + '\n'], {type: 'text/csv'}), name);
  }

  /* An animated card: bars grow for 2.4 s, then hold. Recorded in the
     browser; the production pipeline renders frame by frame instead. */
  function clip(spec, W, H, name, done) {
    var type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].filter(function (t) {
      return window.MediaRecorder && MediaRecorder.isTypeSupported(t);
    })[0];
    if (!type) { done('This browser can’t record video.'); return; }
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var ctx = c.getContext('2d'), chunks = [];
    var rec = new MediaRecorder(c.captureStream(30), {mimeType: type, videoBitsPerSecond: 8e6});
    rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      save(new Blob(chunks, {type: type.split(';')[0]}), name + (type.indexOf('mp4') >= 0 ? '.mp4' : '.webm'));
      done();
    };
    var t0 = null;
    function frame(ts) {
      if (t0 == null) t0 = ts;
      var t = ts - t0;
      draw(ctx, layout(spec, W, H, {progress: t / 2400}), LIGHT, 'surface');
      if (t < 6000) requestAnimationFrame(frame); else rec.stop();
    }
    draw(ctx, layout(spec, W, H, {progress: 0}), LIGHT, 'surface');
    rec.start();
    requestAnimationFrame(frame);
  }

  /* Draws a chart into el at its width, redraws on resize, and grows the
     bars the first time it scrolls into view and whenever set() swaps the
     spec. opt.themed follows the site theme; opt.animate false draws
     every state at once (the explorer); opt.onRender(height) lets an embed
     report its height. */
  function mount(el, spec, opt) {
    opt = opt || {};
    var pal = opt.themed ? THEMED : LIGHT, p = 0, w = 0, seen = false;
    var still = opt.animate === false || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (opt.animate === false) p = 1;
    function render() {
      var L = layout(spec, el.clientWidth || 700, null, {bare: opt.bare, progress: p});
      el.innerHTML = toSVG(spec, L, pal, opt.bg);
      if (opt.onRender) opt.onRender(L.h);
    }
    function grow() {
      if (still) { p = 1; render(); return; }
      var t0 = null;
      requestAnimationFrame(function step(ts) {
        if (t0 == null) t0 = ts;
        p = Math.min(1, (ts - t0) / 1400); render();
        if (p < 1) requestAnimationFrame(step);
      });
    }
    render();
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); seen = true; grow(); }
      }, {threshold: 0.2});
      io.observe(el);
    } else { seen = true; p = 1; render(); }
    addEventListener('resize', function () { if (el.clientWidth !== w) { w = el.clientWidth; render(); } });
    return {set: function (s) { spec = s; if (seen) { p = 0; grow(); } else render(); }};
  }

  function load(id) {
    if (!/^[a-z0-9-]+$/.test(id)) return Promise.reject(new Error('bad question id'));
    return fetch(id + '.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  /* every question a set's index (set-<name>.json) lists, in its order;
     pages pass ?set=, and the platforms set is the default */
  var DEFAULT_SET = 'platforms-w38';
  function loadSet(name) {
    name = name || DEFAULT_SET;
    if (!/^[a-z0-9-]+$/.test(name)) return Promise.reject(new Error('bad set name'));
    return fetch('set-' + name + '.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (ix) {
      return Promise.all(ix.questions.map(function (q) { return load(q.id); })).then(function (qs) { return {index: ix, questions: qs}; });
    });
  }

  /* a set whose numbers aren't fit to publish carries text.note; every page
     shows it above the charts */
  function flag(before, ix) {
    var t = ix.text && ix.text.note;
    if (!t || !before) return;
    var p = document.createElement('p'), b = document.createElement('b');
    p.setAttribute('role', 'note');
    p.style.cssText = 'display:flex;gap:10px;align-items:baseline;margin:0 0 14px;padding:10px 14px;border-radius:10px;' +
      'background:color-mix(in srgb,#fab219 14%,var(--surface));border:1px solid color-mix(in srgb,#fab219 55%,var(--rule));' +
      'font:400 13px/1.45 var(--sans);color:var(--ink)';
    b.style.whiteSpace = 'nowrap'; b.textContent = '⚠ Test data';
    p.appendChild(b); p.appendChild(document.createTextNode(t));
    before.parentNode.insertBefore(p, before);
  }

  window.CHIP50Kit = {view: view, across: across, loadSet: loadSet, flag: flag, DEFAULT_SET: DEFAULT_SET, moe: moe, pm: pm, star: star, FEW: FEW, CAUTION: CAUTION,
    scales: scales, SPAN: SPAN, shown: shown, gapOf: gapOf, side: side, GRID: GRID, LIGHT: LIGHT, THEMED: THEMED, layout: layout, toSVG: toSVG, draw: draw, canvas: canvas, mount: mount, load: load,
    png: png, svg: svg, csv: csv, clip: clip, save: save, pct: pct, num: num};
})();
