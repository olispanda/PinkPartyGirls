/* ==========================================================================
   Micro-animations — scroll-reveal + a load flag for the CSS intro.
   Progressive enhancement: the .reveal styles are gated behind html.js-anim,
   so with JS disabled nothing is ever hidden. Honours prefers-reduced-motion
   (the CSS neutralises the reveal; this file still runs so late content still
   gets its .is-in class and stays visible).
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js-anim");

  function markLoaded() {
    if (document.body) document.body.classList.add("is-loaded");
  }
  if (document.readyState === "complete") markLoaded();
  else window.addEventListener("load", markLoaded);

  if (!("IntersectionObserver" in window)) {
    // No IO support: reveal everything immediately.
    root.classList.remove("js-anim");
    return;
  }

  // Elements that fade/slide in as they enter the viewport.
  var REVEAL = [
    ".page-header .section-title",
    ".page-header .section-lede",
    "section .container > .eyebrow",
    "section .container > .section-title",
    ".card",
    ".show",
    ".member",
    "blockquote",
    ".form-field",
    ".contact-info .info-block",
    "#about-bio > p",
    ".slide-statement__heading",
    ".btn-dark-outline",
    ".slide-events__heading",
    ".slide-events__all"
  ].join(",");

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
  );

  // Per-parent counter so siblings stagger in sequence.
  var staggerByParent = new WeakMap();

  function prep(node) {
    if (node.__ppgReveal) return;
    node.__ppgReveal = true;

    var parent = node.parentElement || document.body;
    var i = staggerByParent.get(parent) || 0;
    node.style.setProperty("--stagger", Math.min(i, 8));
    staggerByParent.set(parent, i + 1);

    node.classList.add("reveal");
    io.observe(node);
  }

  function scan(context) {
    var scope = context && context.querySelectorAll ? context : document;
    scope.querySelectorAll(REVEAL).forEach(prep);
  }

  scan(document);

  // Safety net: whatever happens with the observer, never leave content
  // hidden. After a few seconds force everything visible.
  window.setTimeout(function () {
    root.classList.add("anim-safe");
  }, 2500);

  // js/cms.js replaces innerHTML after its fetch resolves — re-scan new nodes.
  var main = document.querySelector("main");
  if (main && "MutationObserver" in window) {
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType === 1) scan(n.parentElement || n);
        });
      });
    });
    mo.observe(main, { childList: true, subtree: true });
  }
})();
