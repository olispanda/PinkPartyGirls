/* ==========================================================================
   Selective colour for uploaded photos (band members on About, cover art on
   Music): only the already-pink pixels keep their colour, everything else
   fades to the same greyscale look as the hero video — same idea as the
   pinkAmount() function in js/hero-gl.js, just run once per photo on a 2D
   canvas instead of every frame in a shader (there is no video texture here
   to re-sample, so there is nothing to gain from doing this live).

   CSS still applies a plain filter: grayscale(1) to these photos as the
   default (see .card__art img, .member__photo img in style.css) — the safe
   fallback if this script doesn't run at all, or a photo's canvas throws
   (cross-origin uploads, for instance). Once a photo is processed, its own
   pixels already carry the effect, so the class below switches that filter
   off rather than stacking on top of it.
   ========================================================================== */
(function () {
  "use strict";

  var SEL = ".member__photo img, .card__art img";

  function smoothstep(edge0, edge1, x) {
    var t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
  }

  // Mirrors pinkAmount() in js/hero-gl.js — same hue band, same threshold —
  // so a photo and the hero video read as the same treatment.
  function pinkAmount(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 0.0005 || mx < 0.02) return 0;
    var h;
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    var hd = Math.abs(h - 340);
    hd = Math.min(hd, 360 - hd);
    var hueM = 1 - smoothstep(22, 55, hd);
    var satM = smoothstep(0.22, 0.42, d / mx);
    return hueM * satM;
  }

  function process(img) {
    if (img.dataset.pinkDone) return;
    img.dataset.pinkDone = "1"; // set up front — never retry a failed photo in a loop

    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    // Photos run a few hundred px on screen at most — cap the one-time pixel
    // loop (and the resulting data URL) well above that instead of at full
    // upload resolution.
    var scale = Math.min(1, 1600 / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));

    var canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    var cx = canvas.getContext("2d");
    if (!cx) return;
    cx.drawImage(img, 0, 0, cw, ch);

    var data;
    try {
      data = cx.getImageData(0, 0, cw, ch);
    } catch (e) {
      return; // tainted canvas (cross-origin upload) — leave the CSS grayscale() fallback in place
    }

    var px = data.data;
    for (var i = 0; i < px.length; i += 4) {
      var r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
      var lum = r * 0.299 + g * 0.587 + b * 0.114;
      lum = Math.min(1, Math.max(0, (lum - 0.5) * 1.05 + 0.5)); // same contrast bump as the hero video
      var m = pinkAmount(r, g, b);
      px[i] = Math.round((lum + (r - lum) * m) * 255);
      px[i + 1] = Math.round((lum + (g - lum) * m) * 255);
      px[i + 2] = Math.round((lum + (b - lum) * m) * 255);
    }
    cx.putImageData(data, 0, 0);

    img.src = canvas.toDataURL("image/jpeg", 0.85);
    img.classList.add("is-pink-baked"); // switch off the CSS grayscale() — the pixels carry it now
  }

  function scan() {
    var imgs = document.querySelectorAll(SEL);
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.dataset.pinkDone) continue;
      if (img.complete && img.naturalWidth) process(img);
      else img.addEventListener("load", function () { process(this); }, { once: true });
    }
  }

  // js/cms.js fills the member grid / release grid in asynchronously, on
  // every page load — watch for it rather than assuming a fixed delay.
  var mo = new MutationObserver(scan);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
})();
