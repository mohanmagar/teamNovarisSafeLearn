// SafeLearn — mobile navbar (hamburger). Works on every page that has a .navbar,
// no markup changes needed: it finds the links container and collapses it on phones.
(function () {
  function init() {
    document.querySelectorAll('.navbar').forEach(function (nav) {
      if (nav.querySelector('.nav-toggle')) return;
      var kids = Array.prototype.filter.call(nav.children, function (c) {
        return c.tagName !== 'BUTTON';
      });
      if (kids.length < 2) return;                 // brand only, nothing to collapse
      var panel = kids[kids.length - 1];           // the links / user container
      panel.classList.add('nav-collapse');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-toggle';
      btn.setAttribute('aria-label', 'Toggle menu');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '<span></span>';
      nav.insertBefore(btn, panel);

      function setOpen(open) {
        nav.classList.toggle('nav-open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      btn.addEventListener('click', function () { setOpen(!nav.classList.contains('nav-open')); });
      panel.addEventListener('click', function (e) {
        if (e.target.closest('a')) setOpen(false);
      });
      window.addEventListener('resize', function () {
        if (window.innerWidth >= 768) setOpen(false);
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
