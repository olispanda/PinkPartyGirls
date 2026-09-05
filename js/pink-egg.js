/* ==========================================================================
   Easter egg: every occurrence of the word "pink" (in any text on the page,
   including content injected later by js/cms.js) gets wrapped in a marker-
   highlight chip. Click / tap / Enter on one opens a small hue slider that
   recolors --accent — the whole site's pink (text, buttons, borders,
   background washes, and the chips themselves), not just the chip boxes.
   The choice is saved (localStorage) and reapplied everywhere, on every
   page, from then on.
   ========================================================================== */
(function () {
  "use strict";

  var STORAGE_KEY = "ppg-pink-hue";
  var DEFAULT_HUE = 340; // matches --accent: #db2763
  var MIN_HUE = 300; // magenta
  var MAX_HUE = 355; // pink-red — stays "pink", never drifts into another color
  var SAT = 71;
  var LIGHT = 51;

  function hslFor(hue) {
    return "hsl(" + hue + ", " + SAT + "%, " + LIGHT + "%)";
  }

  function getHue() {
    try {
      var v = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      if (!isNaN(v)) return Math.max(MIN_HUE, Math.min(MAX_HUE, v));
    } catch (e) {
      /* localStorage unavailable (private mode etc.) — fall through */
    }
    return DEFAULT_HUE;
  }

  function setHue(hue) {
    hue = Math.max(MIN_HUE, Math.min(MAX_HUE, parseInt(hue, 10) || DEFAULT_HUE));
    // --accent drives the whole site's pink (see :root and the color-mix()
    // rules in style.css) — not a chip-only variable — so this recolors
    // everything, not just the highlight boxes.
    document.documentElement.style.setProperty("--accent", hslFor(hue));
    // The hero logo is a flat-color SVG <img> — CSS vars can't reach inside
    // it, so shift it with a matching hue-rotate filter instead (see
    // .slide-home__logo in style.css).
    document.documentElement.style.setProperty("--logo-hue-rotate", (hue - DEFAULT_HUE) + "deg");
    // Anything that rasterises the accent colour rather than reading the
    // variable live has to redraw — the water cursor's film texture does.
    try {
      document.dispatchEvent(new CustomEvent("ppg:accent-change", { detail: { hue: hue } }));
    } catch (e) {
      /* CustomEvent unavailable — the colour still applies everywhere else */
    }
    try {
      localStorage.setItem(STORAGE_KEY, hue);
    } catch (e) {
      /* ignore — the color still applies for this page view */
    }
    return hue;
  }

  // Apply the saved hue immediately (before DOMContentLoaded) so there's no
  // flash of the default pink on repeat visits.
  setHue(getHue());

  /* ---- wrap every whole-word "pink" in text nodes ---------------------- */

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, TITLE: 1 };
  var WORD_RE = /\bpink\b/gi;

  function shouldSkip(el) {
    while (el) {
      if (SKIP_TAGS[el.tagName]) return true;
      if (el.classList && (el.classList.contains("pink-word") || el.classList.contains("pink-picker"))) return true;
      el = el.parentElement;
    }
    return false;
  }

  function wrapTextNode(textNode) {
    var text = textNode.nodeValue;
    WORD_RE.lastIndex = 0;
    var match = WORD_RE.exec(text);
    if (!match) return;

    var frag = document.createDocumentFragment();
    var last = 0;
    do {
      if (match.index > last) frag.appendChild(document.createTextNode(text.slice(last, match.index)));
      var chip = document.createElement("span");
      chip.className = "pink-word";
      chip.textContent = match[0];
      chip.tabIndex = 0;
      chip.setAttribute("role", "button");
      chip.setAttribute("aria-label", "Eigenen Pinkton wählen");
      frag.appendChild(chip);
      last = WORD_RE.lastIndex;
    } while ((match = WORD_RE.exec(text)));

    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function scan(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !/pink/i.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        if (!node.parentElement || shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var targets = [];
    var n;
    while ((n = walker.nextNode())) targets.push(n);
    targets.forEach(wrapTextNode);
  }

  // Re-scan whenever the DOM changes (js/cms.js fills in content async, per
  // page, at different times) — but only when something actually changed,
  // so this settles instead of looping.
  var scanScheduled = false;
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(function () {
      scanScheduled = false;
      scan(document.body);
    });
  }

  function boot() {
    scan(document.body);
    var observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    document.addEventListener("click", function (e) {
      var chip = e.target.closest && e.target.closest(".pink-word");
      if (chip) openPicker(chip);
    });
    document.addEventListener("keydown", function (e) {
      var active = document.activeElement;
      if ((e.key === "Enter" || e.key === " ") && active && active.classList.contains("pink-word")) {
        e.preventDefault();
        openPicker(active);
      }
    });
    // The popover is positioned in document coordinates at open time; rather
    // than track the anchor while scrolling/resizing, just close it.
    window.addEventListener("scroll", closePicker, { passive: true, capture: true });
    window.addEventListener("resize", closePicker, { passive: true });

    // Live-sync across every open tab/window of the site: the "storage"
    // event fires in *other* tabs (never the one that made the change) the
    // instant localStorage is written, so picking a color on the Home tab
    // recolors an already-open About/Music/... tab immediately, no reload.
    window.addEventListener("storage", function (e) {
      if (e.key !== STORAGE_KEY || e.newValue == null) return;
      var hue = setHue(e.newValue);
      syncOpenPicker(hue);
    });
  }

  // If this tab happens to have its own picker open when another tab
  // changes the color, keep its slider/swatch in sync too.
  function syncOpenPicker(hue) {
    if (!picker) return;
    var input = picker.querySelector("input");
    var swatch = picker.querySelector(".pink-picker__swatch");
    if (input) input.value = hue;
    if (swatch) swatch.style.background = hslFor(hue);
  }

  /* ---- hue-picker popover ------------------------------------------- */

  var picker = null;
  var pickerAnchor = null;

  function closePicker() {
    if (!picker) return;
    picker.remove();
    picker = null;
    pickerAnchor = null;
    document.removeEventListener("keydown", onEscape);
    document.removeEventListener("pointerdown", onOutside, true);
  }

  function onEscape(e) {
    if (e.key === "Escape") closePicker();
  }

  function onOutside(e) {
    if (picker && !picker.contains(e.target) && !(e.target.closest && e.target.closest(".pink-word"))) {
      closePicker();
    }
  }

  function positionPicker(el, anchor) {
    // Viewport-relative (the popover is position: fixed, see style.css) so
    // this is correct for chips in normal flow *and* chips inside a
    // position: fixed ancestor (e.g. the "Pink" in the footer) — for a fixed
    // ancestor, adding scrollY used to push the popover below the fold since
    // rect.bottom there is already a viewport coordinate, not a document one.
    var r = anchor.getBoundingClientRect();
    var vh = document.documentElement.clientHeight;
    var vw = document.documentElement.clientWidth;
    var h = el.offsetHeight; // el is already appended to the DOM at this point

    // Flip above the chip when there isn't room below (e.g. a chip near the
    // bottom edge, like the one in the fixed footer) instead of letting the
    // popover run off the bottom of the screen.
    var top = r.bottom + 8;
    if (top + h > vh) top = r.top - h - 8;
    top = Math.max(8, top);

    var left = r.left;
    var maxLeft = vw - 232 - 12;
    if (left > maxLeft) left = Math.max(8, maxLeft);

    el.style.top = top + "px";
    el.style.left = left + "px";
  }

  function openPicker(anchor) {
    var reopening = pickerAnchor === anchor;
    closePicker();
    if (reopening) return; // clicking the same chip again just closes it

    var hue = getHue();
    picker = document.createElement("div");
    picker.className = "pink-picker";
    pickerAnchor = anchor;
    picker.innerHTML =
      '<div class="pink-picker__label">Dein Pinkton</div>' +
      '<div class="pink-picker__row">' +
      '<span class="pink-picker__swatch"></span>' +
      '<input type="range" min="' + MIN_HUE + '" max="' + MAX_HUE + '" step="1" value="' + hue + '" aria-label="Pinkton" />' +
      "</div>";
    document.body.appendChild(picker);
    positionPicker(picker, anchor);

    var input = picker.querySelector("input");
    var swatch = picker.querySelector(".pink-picker__swatch");
    var apply = function (h) {
      h = setHue(h);
      swatch.style.background = hslFor(h);
    };
    apply(hue);
    input.addEventListener("input", function () {
      apply(input.value);
    });
    input.focus();

    // Defer so the click that opened this picker doesn't immediately close it.
    setTimeout(function () {
      document.addEventListener("keydown", onEscape);
      document.addEventListener("pointerdown", onOutside, true);
    }, 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
