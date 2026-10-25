/* CHIP50 chart embed. Paste where the chart should go:
     <div data-chip50-chart="tiktok-w38" data-view="states" data-state="ohio"></div>
     <script async src="https://techandsociety.ai/demo/chart-kit/embed.js"></script>
   data-view is "by" (the default) or "states"; data-state is optional.
   Each div becomes an iframe that sizes itself to its chart. */
(function () {
  var src = (document.currentScript && document.currentScript.src) || '';
  var base = src.replace(/[^/]*$/, ''), origin = new URL(base, location.href).origin;
  [].forEach.call(document.querySelectorAll('[data-chip50-chart]:not([data-chip50-done])'), function (el) {
    var f = document.createElement('iframe');
    var q = new URLSearchParams({q: el.getAttribute('data-chip50-chart')});
    if (el.getAttribute('data-view')) q.set('view', el.getAttribute('data-view'));
    if (el.getAttribute('data-state')) q.set('state', el.getAttribute('data-state'));
    f.src = base + 'embed.html?' + q;
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
