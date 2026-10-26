/* Demo only: a switcher pinned to the bottom of the window that moves between
   the two explorer concepts on the same item and place. Each page
   keeps ?q= and ?state= in its URL, so the switch reads them at click time. */
(function () {
  var pages = [['explorer-rails.html', 'Rails'], ['explorer-matrix.html', 'Matrix']];
  var here = location.pathname.split('/').pop();
  var nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Explorer concepts');
  nav.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:200;display:flex;align-items:center;gap:2px;padding:4px;' +
    'background:var(--surface);border:1px solid var(--rule);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.12);' +
    'font:500 12px/1 var(--sans)';
  var lab = document.createElement('span');
  lab.textContent = 'Concept';
  lab.style.cssText = 'color:var(--muted);padding:0 8px 0 6px';
  nav.appendChild(lab);
  pages.forEach(function (p) {
    var a = document.createElement('a');
    a.href = p[0]; a.textContent = p[1];
    var on = p[0] === here;
    a.style.cssText = 'padding:7px 10px;border-radius:7px;text-decoration:none;' +
      (on ? 'background:var(--soft);color:var(--acct);font-weight:650' : 'color:var(--ink2)');
    if (on) a.setAttribute('aria-current', 'page');
    a.addEventListener('click', function (e) {
      var u = new URLSearchParams(location.search), keep = new URLSearchParams();
      ['set', 'q', 'state', 'theme'].forEach(function (k) { if (u.get(k)) keep.set(k, u.get(k)); });
      a.href = p[0] + (String(keep) ? '?' + keep : '');
    });
    nav.appendChild(a);
  });
  document.body.appendChild(nav);
})();
