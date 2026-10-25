/* CHIP50 chart kit (demo). One chart spec (a JSON file next to this script)
   feeds the page chart, the embed, the PNG/SVG/CSV downloads, the social
   cards and the animated clip. layout() turns a spec and a frame size into a
   flat list of shapes; toSVG() and draw() paint that list, so every output
   is the same drawing. */
(function () {
  var SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  /* exports are always light; the page chart follows the site theme */
  var LIGHT = {surface: '#ffffff', ink: '#14140f', ink2: '#4a4a44', muted: '#6e6d65',
    rule: '#e4e3dc', track: '#efeee8', acc: '#2a78d6'};
  var THEMED = {surface: 'var(--surface)', ink: 'var(--ink)', ink2: 'var(--ink2)', muted: 'var(--muted)',
    rule: 'var(--rule)', track: 'var(--rule2)', acc: 'var(--acc)'};

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
  function pct(v) { return Math.round(v) + '%'; }

  /* layout(spec, W, H, opt) → {w, h, ops}. With H the drawing fills a fixed
     frame (social cards); without it the height fits the content (page,
     embed, print). opt.bare drops title and footer; opt.progress (0–1)
     grows the bars for animation. */
  function layout(spec, W, H, opt) {
    opt = opt || {};
    var fixed = !!H, p = opt.progress == null ? 1 : opt.progress;
    var k = fixed ? Math.min(W, H) / 600 : Math.max(0.85, Math.min(1.15, W / 700));
    var tall = fixed && H / W > 1.5;
    var pad = fixed ? 44 * k : (opt.bare ? 0 : 20 * k);
    var inner = W - 2 * pad, ops = [], y = pad;
    var S = {head: 28 * k * (tall ? 1.3 : 1), sub: 16 * k * (tall ? 1.15 : 1),
      lab: 15 * k * (tall ? 1.25 : 1), val: 15 * k * (tall ? 1.25 : 1), foot: 12.5 * k};
    function text(t, x, yy, size, weight, c, anchor, a) {
      ops.push({t: 'text', text: t, x: x, y: yy, size: size, weight: weight, c: c,
        anchor: anchor || 'start', a: a == null ? 1 : a});
    }

    if (!opt.bare) {
      wrap(spec.title, S.head, 700, inner).forEach(function (l) { y += S.head * 1.12; text(l, pad, y, S.head, 700, 'ink'); });
      y += 8 * k;
      wrap(spec.subtitle, S.sub, 400, inner).forEach(function (l) { y += S.sub * 1.35; text(l, pad, y, S.sub, 400, 'ink2'); });
      y += 26 * k;
    }

    /* the footer is measured first so a fixed card can pin it to the bottom */
    var foot = opt.bare ? [] : wrap('Source: ' + spec.source, S.foot, 400, inner);
    var footH = opt.bare ? 0 : 14 * k + foot.length * S.foot * 1.45 + S.foot * 1.7;

    var n = spec.rows.length, rh = 34 * k, y0 = y;
    if (fixed) {
      var region = H - pad - footH - 24 * k - y;
      rh = Math.min(region / n, 72 * k);
      y0 = y + (region - rh * n) / 2;
    }
    var labW = Math.max.apply(null, spec.rows.map(function (r) { return measure(r.label, S.lab, 400); })) + 14 * k;
    var barMax = inner - labW - measure('100%', S.val, 700) - 10 * k;
    var bh = Math.min(rh * 0.6, 22 * k * (fixed ? 1.7 : 1));
    spec.rows.forEach(function (r, i) {
      var cy = y0 + rh * i + rh / 2, e = ease(p * 1.6 - i * 0.08);
      var bw = barMax * r.value / 100 * e, x0 = pad + labW;
      text(r.label, x0 - 14 * k, cy + S.lab * 0.35, S.lab, 400, 'ink2', 'end');
      ops.push({t: 'rect', x: x0, y: cy - bh / 2, w: barMax, h: bh, c: 'track'});
      ops.push({t: 'rect', x: x0, y: cy - bh / 2, w: bw, h: bh, c: 'acc', title: r.label + ': ' + pct(r.value)});
      text(pct(r.value), x0 + bw + 8 * k, cy + S.val * 0.35, S.val, 700, 'ink', 'start', ease((e - 0.6) / 0.4));
    });
    y = y0 + rh * n;

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

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function r1(v) { return Math.round(v * 10) / 10; }
  /* CSS variables only resolve inside style=, not in presentation attributes everywhere */
  function paint(prop, v) { return v.indexOf('var(') === 0 ? ' style="' + prop + ':' + v + '"' : ' ' + prop + '="' + v + '"'; }

  function toSVG(spec, L, pal, bg) {
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + L.w + ' ' + L.h + '" width="' + L.w +
      '" height="' + L.h + '" role="img" aria-label="' + esc(spec.title) + '" font-family=\'' + SANS + '\'>'];
    if (bg) out.push('<rect width="100%" height="100%"' + paint('fill', pal[bg]) + '/>');
    L.ops.forEach(function (o) {
      if (o.t === 'rect') {
        if (o.w <= 0) return;
        out.push('<rect x="' + r1(o.x) + '" y="' + r1(o.y) + '" width="' + r1(o.w) + '" height="' + r1(o.h) +
          '" rx="' + r1(Math.min(o.h, o.w) / 2) + '"' + paint('fill', pal[o.c]) + '>' +
          (o.title ? '<title>' + esc(o.title) + '</title>' : '') + '</rect>');
      } else if (o.t === 'line') {
        out.push('<line x1="' + r1(o.x1) + '" y1="' + r1(o.y1) + '" x2="' + r1(o.x2) + '" y2="' + r1(o.y2) +
          '" stroke-width="' + r1(o.sw) + '"' + paint('stroke', pal[o.c]) + '/>');
      } else {
        out.push('<text x="' + r1(o.x) + '" y="' + r1(o.y) + '" font-size="' + r1(o.size) + '" font-weight="' + o.weight +
          '" text-anchor="' + o.anchor + '"' + (o.a < 1 ? ' opacity="' + r1(o.a) + '"' : '') + paint('fill', pal[o.c]) +
          '>' + esc(o.text) + '</text>');
      }
    });
    return out.join('') + '</svg>';
  }

  function draw(ctx, L, pal, bg) {
    if (bg) { ctx.fillStyle = pal[bg]; ctx.fillRect(0, 0, L.w, L.h); }
    L.ops.forEach(function (o) {
      ctx.globalAlpha = o.a == null ? 1 : o.a;
      if (o.t === 'rect') {
        if (o.w <= 0) return;
        var r = Math.min(o.h, o.w) / 2, x = o.x, y = o.y, w = o.w, h = o.h;
        ctx.fillStyle = pal[o.c];
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
        ctx.fill();
      } else if (o.t === 'line') {
        ctx.strokeStyle = pal[o.c]; ctx.lineWidth = o.sw;
        ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
      } else {
        ctx.font = font(o.size, o.weight); ctx.fillStyle = pal[o.c];
        ctx.textAlign = o.anchor === 'end' ? 'right' : 'left';
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
    var q = function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [[spec.labelName, spec.valueName, 'unweighted_n'].join(',')].concat(
      spec.rows.map(function (r) { return [q(r.label), r.value, r.n].join(','); }));
    save(new Blob([lines.join('\n') + '\n'], {type: 'text/csv'}), name);
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

  /* Draws the chart into el at its width, redraws on resize, and grows the
     bars the first time it scrolls into view. opt.themed follows the site
     theme; opt.onRender(height) lets an embed report its height. */
  function mount(el, spec, opt) {
    opt = opt || {};
    var pal = opt.themed ? THEMED : LIGHT, p = 0, w = 0;
    var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
        if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); grow(); }
      }, {threshold: 0.3});
      io.observe(el);
    } else { p = 1; render(); }
    addEventListener('resize', function () { if (el.clientWidth !== w) { w = el.clientWidth; render(); } });
  }

  function load(id) {
    if (!/^[a-z0-9-]+$/.test(id)) return Promise.reject(new Error('bad chart id'));
    return fetch(id + '.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  window.CHIP50Kit = {layout: layout, toSVG: toSVG, draw: draw, canvas: canvas, mount: mount, load: load,
    png: png, svg: svg, csv: csv, clip: clip, save: save};
})();
