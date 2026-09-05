/* ==========================================================================
   Parallax — scroll-linked vertical drift on a curated set of elements.
   Uses the independent `translate` property (composes with `transform`, so
   hover/reveal animations are unaffected). rAF-batched, off-screen elements
   skipped, disabled entirely under prefers-reduced-motion.
   ========================================================================== */
(function () {
  "use strict";

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  // [selector, speed, maxPx] — speed > 0 lags behind the scroll (depth),
  // speed < 0 leads it slightly.
  var CONFIG = [
    [".slide-home__video", 0.12, 90],
    [".slide-home__overlay", 0.07, 60],
    [".slide-home__logo", -0.05, 55],
    [".page-header .section-title", 0.07, 46],
    [".page-header .section-lede", 0.13, 46],
    ["blockquote", 0.08, 50],
    [".member__photo", 0.06, 38],
    [".teaser__art", 0.1, 60]
  ];

  var items = [];

  function collect() {
    items = [];
    CONFIG.forEach(function (cfg) {
      document.querySelectorAll(cfg[0]).forEach(function (el) {
        el.setAttribute("data-parallax", "");
        items.push({ el: el, speed: cfg[1], max: cfg[2] });
      });
    });
  }

  var vh = window.innerHeight;
  var ticking = false;

  function update() {
    ticking = false;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var r = it.el.getBoundingClientRect();
      if (r.bottom < -300 || r.top > vh + 300) continue;
      var dist = r.top + r.height / 2 - vh / 2;
      var y = dist * -it.speed;
      if (y > it.max) y = it.max;
      else if (y < -it.max) y = -it.max;
      it.el.style.setProperty("--py", y.toFixed(1) + "px");
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  }

  collect();
  update();

  window.addEventListener("scroll", onScroll, { passive: true });
  // The scroll-snap homepage scrolls a different element in some engines.
  document.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("resize", function () {
    vh = window.innerHeight;
    collect();
    update();
  });

  // js/cms.js swaps content in after fetch — re-collect targets.
  var main = document.querySelector("main");
  if (main && "MutationObserver" in window) {
    new MutationObserver(function () {
      collect();
      update();
    }).observe(main, { childList: true, subtree: true });
  }
})();
