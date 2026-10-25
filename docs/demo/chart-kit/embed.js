/* CHIP50 chart embed. Paste where the chart should go:
     <div data-chip50-chart="tiktok-age-w38"></div>
     <script async src="https://techandsociety.ai/demo/chart-kit/embed.js"></script>
   Each div becomes an iframe that sizes itself to its chart. */
(function () {
  var src = (document.currentScript && document.currentScript.src) || '';
  var base = src.replace(/[^/]*$/, ''), origin = new URL(base, location.href).origin;
  [].forEach.call(document.querySelectorAll('[data-chip50-chart]:not([data-chip50-done])'), function (el) {
    var f = document.createElement('iframe');
    f.src = base + 'embed.html?chart=' + encodeURIComponent(el.getAttribute('data-chip50-chart'));
    f.title = 'CHIP50 chart';
    f.loading = 'lazy';
    f.setAttribute('scrolling', 'no');
    f.style.cssText = 'display:block;width:100%;height:480px;border:0';
    el.setAttribute('data-chip50-done', '');
    el.appendChild(f);
  });
  if (window.__chip50Embeds) return;
  window.__chip50Embeds = true;
  addEventListener('message', function (e) {
    var d = e.data;
    if (e.origin !== origin || !d || d.chip50 !== 'height') return;
    [].forEach.call(document.querySelectorAll('[data-chip50-chart] iframe'), function (f) {
      if (f.contentWindow === e.source) f.style.height = Math.ceil(d.height) + 'px';
    });
  });
})();
