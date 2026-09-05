/* ==========================================================================
   Water cursor — a refracting droplet that takes the place of the pointer.

   The look comes from real refraction rather than a blur: a procedurally
   generated displacement map (a lens profile baked into the red/green
   channels of a canvas) is fed to an SVG <feDisplacementMap> which runs as
   the droplet's backdrop-filter. Whatever sits behind the droplet — text,
   the hero video, the pink washes — gets bent outward at the rim exactly
   like it would through a bead of water. Three displacement passes at
   slightly different strengths, recombined per channel, give the soapy
   rainbow fringe at the edge.

   Motion is a spring: the drop trails the pointer, squashes along its
   direction of travel, breathes when it is idle, and drags one smaller
   satellite bead behind it that melts back in when you stop moving.

   Bails out entirely on coarse pointers and under prefers-reduced-motion.
   Falls back to a plain blurred bubble where backdrop-filter can't take an
   SVG filter reference (Safari, Firefox), and steps itself down if the
   frame rate can't keep up.
   ========================================================================== */
(function () {
  "use strict";

  /* ---- tunables ---------------------------------------------------------
     Sizes are in CSS pixels. The droplet element itself never changes size
     (hover/idle states are transforms) so the filter's pixel units stay
     valid and the map is only ever built once.                            */
  var SIZE = 136; // droplet diameter
  var SAT_SIZE = 46; // trailing satellite bead
  var MAP_RES = 288; // displacement map resolution (square)
  /* REFRACT is the budget for how far a pixel can be pulled inward, and it
     has a ceiling worth understanding: the drop can only show the part of
     the page that its outermost sample still reaches. Push it too far and
     everything past that radius is crushed into a thin unreadable ring while
     the middle magnifies a tiny patch — which reads as an empty milky ball,
     not as water. Around a third of the radius keeps the whole area behind
     the drop visible, bent and enlarged. */
  var REFRACT = 70; // px of bend at the rim, main drop
  var SAT_REFRACT = 24; // …and for the satellite
  var ABERRATION = 0.14; // per-channel spread of the refraction (rainbow rim)
  /* The shape of a real bead: nearly flat through the middle, so whatever is
     behind it stays sharp and only drifts, then a hard turn in the last
     fifth of the radius that sweeps the surroundings into a compressed band
     around the edge. Spreading the bend evenly instead (a big linear term)
     is what made it read as a magnifying glass rather than a droplet. */
  var LENS_ZOOM = 0.12; // the gentle, even part
  var LENS_POWER = 3.6; // mid-field falloff
  var RIM_BITE = 0.45; // share that piles up right at the rim
  /* In the last few percent of the radius the bend flips and points outward,
     so those pixels sample from beyond the drop's own outline. That is what
     puts a compressed band of the surroundings around the edge — the thing
     that makes a bead look like it is sitting on the page rather than
     punched into it. It only works because the filter region below is wider
     than the element; sampling past the region returns nothing. */
  var RIM_OUT = 1.65;
  var EDGE_FADE = 0.975; // where the bend feathers back to zero (0..1 of radius)

  /* A perfectly symmetrical lens reads as CGI glass. Real water has a surface
     that isn't quite even, so the map gets a little standing-wave structure:
     two angular terms and one radial ripple, all small enough to keep the
     magnification intact. This is most of what makes it look wet. */
  var FILM_RES = 200; // interference texture resolution
  var FILM_ALPHA = 0.34; // ceiling on how strongly the film shows
  var FILM_HUE_SWING = 58; // degrees either side of --accent the colour roams

  var WAVE_ANG_1 = 0.075;
  var WAVE_ANG_2 = 0.045;
  var WAVE_RAD = 0.05;
  /* Few and broad on purpose. Tight rings make the offset swing hard over a
     handful of pixels, and anything fine behind the drop — hairlines, small
     type — gets sampled away instead of bent. */
  var WAVE_RINGS = 4.5;

  var STIFF = 0.17; // main spring
  var DAMP = 0.74;
  var SAT_STIFF = 0.075; // satellite lags noticeably further behind
  var SAT_DAMP = 0.8;
  var STRETCH = 0.011; // velocity → squash-and-stretch
  var STRETCH_MAX = 0.32;

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

  if (reduceMotion || !finePointer) return;

  /* ---- capability check -------------------------------------------------
     Safari parses url() inside backdrop-filter but never renders it, and
     Firefox doesn't take filter references there at all, so CSS.supports()
     alone isn't enough to go on.                                          */
  var ua = navigator.userAgent;
  var isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  var isFirefox = /firefox|fxios/i.test(ua);
  var hasBackdrop =
    !!window.CSS &&
    !!CSS.supports &&
    (CSS.supports("backdrop-filter", "blur(2px)") ||
      CSS.supports("-webkit-backdrop-filter", "blur(2px)"));
  var canRefract =
    hasBackdrop && !isSafari && !isFirefox && CSS.supports("backdrop-filter", "url(#a)");

  if (!hasBackdrop) return; // no glass of any kind — leave the native cursor alone

  var SVG_NS = "http://www.w3.org/2000/svg";

  /* ---- interference texture ---------------------------------------------
     Soap film is not a set of concentric rings. It is a marbled, chaotic
     field — the wall drifts and varies in thickness, and colour follows
     thickness — so drawing it with tidy radial gradients is what made the
     drop look illustrated. This paints value noise instead, a few octaves
     of it, and maps the result through a palette centred on the site's
     accent hue.

     The radial falloff lives in the texture's own alpha channel rather than
     a CSS mask: a mask in this subtree would cut the neighbouring lens off
     from the page and kill the refraction outright.                       */
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Value noise: a random lattice with smoothstep interpolation between the
  // corners. Cheap, and smooth enough to read as fluid rather than grain.
  function latticeNoise(cells, rnd) {
    var g = [];
    for (var i = 0; i <= cells; i++) {
      g[i] = [];
      for (var j = 0; j <= cells; j++) g[i][j] = rnd();
    }
    return function (x, y) {
      var fx = x * cells;
      var fy = y * cells;
      var x0 = Math.min(cells - 1, Math.floor(fx));
      var y0 = Math.min(cells - 1, Math.floor(fy));
      var tx = fx - x0;
      var ty = fy - y0;
      var sx = tx * tx * (3 - 2 * tx);
      var sy = ty * ty * (3 - 2 * ty);
      var a = g[x0][y0];
      var b = g[x0 + 1][y0];
      var c = g[x0][y0 + 1];
      var d = g[x0 + 1][y0 + 1];
      return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
    };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    function ch(t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [ch(h + 1 / 3) * 255, ch(h) * 255, ch(h - 1 / 3) * 255];
  }

  // Reads whatever --accent currently is (hex, hsl(), anything) by letting
  // the canvas parse it, then converts to a hue we can swing around.
  function accentHue() {
    var probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    var pc = probe.getContext("2d");
    var value = "";
    try {
      value = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim();
    } catch (e) {
      /* fall through to the default below */
    }
    if (!pc || !value) return 340;
    pc.fillStyle = "#db2763";
    pc.fillStyle = value;
    pc.fillRect(0, 0, 1, 1);
    var d = pc.getImageData(0, 0, 1, 1).data;
    var r = d[0] / 255;
    var g = d[1] / 255;
    var b = d[2] / 255;
    var mx = Math.max(r, g, b);
    var mn = Math.min(r, g, b);
    if (mx === mn) return 340;
    var dd = mx - mn;
    var h;
    if (mx === r) h = ((g - b) / dd) % 6;
    else if (mx === g) h = (b - r) / dd + 2;
    else h = (r - g) / dd + 4;
    return ((h * 60) % 360 + 360) % 360;
  }

  function buildFilmTexture(seed, hue) {
    var N = FILM_RES;
    var c = document.createElement("canvas");
    c.width = c.height = N;
    var cx = c.getContext("2d");
    if (!cx) return null;

    var rnd = mulberry32(seed);
    var n1 = latticeNoise(3, rnd); // long, flowing swirls
    var n2 = latticeNoise(7, rnd); // secondary marbling
    var n3 = latticeNoise(13, rnd); // the last bit of detail
    var nA = latticeNoise(5, rnd); // separate field for density

    var img = cx.createImageData(N, N);
    var d = img.data;
    var half = N / 2;

    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var i = (y * N + x) * 4;
        var u = x / N;
        var v = y / N;
        var nx = (x + 0.5 - half) / half;
        var ny = (y + 0.5 - half) / half;
        var r = Math.sqrt(nx * nx + ny * ny);

        if (r >= 1) {
          d[i + 3] = 0;
          continue;
        }

        // Weighted toward the coarsest octave: the reference's swirls are
        // long and flowing, and letting the fine octaves carry much weight is
        // what turned this into mottled speckle.
        var n = 0.62 * n1(u, v) + 0.27 * n2(u, v) + 0.11 * n3(u, v);

        // Thickness → colour. Cycling the hue through a sine is what puts the
        // colour in bands the way interference does; holding the swing near
        // the accent keeps the drop pink rather than rainbow.
        var h = hue + Math.sin(n * Math.PI * 2.7 + 0.6) * FILM_HUE_SWING;
        // Pale and washed out. A soap wall reflects most of what hits it, so
        // the film sits above its background as pearl rather than below it as
        // dirt — saturated mid-tones were reading as grime on the pink slides.
        var sat = 0.34 + 0.24 * Math.sin(n * Math.PI * 3.3);
        var lig = 0.74 + 0.13 * Math.sin(n * Math.PI * 2.1 + 1.2);
        var rgb = hslToRgb(h, Math.max(0.06, Math.min(0.62, sat)), Math.max(0.58, Math.min(0.9, lig)));

        // Present across the whole face, a little stronger toward the rim
        // where the line of sight passes through more of the wall, and faded
        // out over a wide margin at the edge so there is no ring.
        var inner = 0.22 + 0.78 * (r <= 0 ? 0 : r >= 0.92 ? 1 : (r / 0.92) * (r / 0.92) * (3 - 2 * (r / 0.92)));
        var outer = (1 - r) / 0.16;
        outer = outer <= 0 ? 0 : outer >= 1 ? 1 : outer * outer * (3 - 2 * outer);
        // Gentle banding in the opacity as well as the colour, but nowhere
        // near enough to break the field into separate blobs.
        var density = (0.55 + 0.45 * nA(u, v)) * (0.68 + 0.32 * Math.abs(Math.sin(n * Math.PI * 2.4)));

        d[i] = rgb[0];
        d[i + 1] = rgb[1];
        d[i + 2] = rgb[2];
        d[i + 3] = 255 * inner * outer * density * FILM_ALPHA;
      }
    }

    cx.putImageData(img, 0, 0);
    try {
      return c.toDataURL("image/png");
    } catch (e) {
      return null;
    }
  }

  /* Two textures at this resolution is a few dozen milliseconds of pixel
     work, which has no business on the critical path — the drop is invisible
     until the pointer first moves anyway. Idle time, or a short delay where
     that isn't available. */
  function paintFilm() {
    var run = function () {
      var hue = accentHue();
      var a = buildFilmTexture(0x5eed, hue);
      var b = buildFilmTexture(0x1d0c, hue + 12);
      if (a) root.style.setProperty("--wc-film-a", 'url("' + a + '")');
      if (b) root.style.setProperty("--wc-film-b", 'url("' + b + '")');
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 120);
  }

  /* ---- displacement map -------------------------------------------------
     Red channel drives the horizontal sample offset, green the vertical;
     128 is "don't move". Offsets point inward (negative radially), so each
     pixel samples from nearer the centre — which reads as magnification in
     the middle and a hard smear at the rim, the signature of a water bead.
     Everything outside the circle stays neutral so the clipped edge can't
     produce fringing.                                                     */
  function buildMap() {
    var c = document.createElement("canvas");
    c.width = c.height = MAP_RES;
    var cx = c.getContext("2d");
    if (!cx) return null;

    var img = cx.createImageData(MAP_RES, MAP_RES);
    var d = img.data;
    var half = MAP_RES / 2;

    for (var y = 0; y < MAP_RES; y++) {
      for (var x = 0; x < MAP_RES; x++) {
        var i = (y * MAP_RES + x) * 4;
        var nx = (x + 0.5 - half) / half;
        var ny = (y + 0.5 - half) / half;
        var r = Math.sqrt(nx * nx + ny * ny);
        var dx = 0;
        var dy = 0;

        if (r < 1 && r > 0.0001) {
          // Feather the bend to nothing over the last slice of the radius,
          // otherwise the outline turns into a razor-sharp ring.
          var t = (1 - r) / (1 - EDGE_FADE);
          var feather = t >= 1 ? 1 : t <= 0 ? 0 : t * t * (3 - 2 * t);

          // Three parts. A linear term is a plain magnifying glass. A curved
          // term takes over through the middle distance. A very steep term on
          // top of it piles up in the last stretch before the rim, which is
          // what smears the surroundings into a compressed ring there.
          var curve =
            (1 - RIM_BITE) * Math.pow(r, LENS_POWER) + RIM_BITE * Math.pow(r, 8);
          var bend = LENS_ZOOM * r + (1 - LENS_ZOOM) * curve;
          // Steep enough to stay out of the way until the very edge, where it
          // overtakes the inward bend and reverses it.
          var mag = (bend - RIM_OUT * Math.pow(r, 14)) * feather;

          // Surface that isn't quite flat.
          var th = Math.atan2(ny, nx);
          mag *=
            1 +
            WAVE_ANG_1 * Math.sin(3 * th + 0.7) +
            WAVE_ANG_2 * Math.sin(7 * th - 1.9) +
            WAVE_RAD * Math.sin(r * WAVE_RINGS) * r;

          dx = -(nx / r) * mag;
          dy = -(ny / r) * mag;
        }

        d[i] = 128 + dx * 127;
        d[i + 1] = 128 + dy * 127;
        d[i + 2] = 128;
        d[i + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    try {
      return c.toDataURL("image/png");
    } catch (e) {
      return null;
    }
  }

  /* ---- SVG filters ------------------------------------------------------
     One filter per droplet size. primitiveUnits stay in user space and the
     filter region is pinned to the border box, so the feImage can be placed
     with plain pixel numbers that line up with the element exactly.
     `aberration` off collapses the three passes into one — that's the first
     thing dropped if the frame budget gets tight.                         */
  var defs = null;
  var mapCache = null; // declared up here: mount() runs before the lines below

  function channelMatrix(ch) {
    if (ch === "r") return "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0";
    if (ch === "g") return "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0";
    return "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0";
  }

  function el(name, attrs) {
    var n = document.createElementNS(SVG_NS, name);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    }
    return n;
  }

  function buildFilter(id, px, scale, mapURL, aberration) {
    /* The region reaches well past the element so the rim can sample page
       content from outside the drop's own outline. Output is still clipped
       to the border box and its radius, so the overhang costs nothing
       visible — without it the outward bend at the rim reads as a hole. */
    var f = el("filter", {
      id: id,
      filterUnits: "objectBoundingBox",
      primitiveUnits: "userSpaceOnUse",
      x: "-15%",
      y: "-15%",
      width: "130%",
      height: "130%",
      "color-interpolation-filters": "sRGB"
    });

    var map = el("feImage", {
      result: "map",
      x: "0",
      y: "0",
      width: px,
      height: px,
      preserveAspectRatio: "none"
    });
    map.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", mapURL);
    map.setAttribute("href", mapURL);
    f.appendChild(map);

    function pass(result, s) {
      f.appendChild(
        el("feDisplacementMap", {
          in: "SourceGraphic",
          in2: "map",
          scale: s,
          xChannelSelector: "R",
          yChannelSelector: "G",
          result: result
        })
      );
    }

    if (!aberration) {
      pass("bent", scale);
      return f;
    }

    // Red bends hardest, blue least — same reason a prism splits light.
    var spread = scale * ABERRATION;
    pass("dR", scale + spread);
    pass("dG", scale);
    pass("dB", scale - spread);

    f.appendChild(el("feColorMatrix", { in: "dR", type: "matrix", values: channelMatrix("r"), result: "cR" }));
    f.appendChild(el("feColorMatrix", { in: "dG", type: "matrix", values: channelMatrix("g"), result: "cG" }));
    f.appendChild(el("feColorMatrix", { in: "dB", type: "matrix", values: channelMatrix("b"), result: "cB" }));
    f.appendChild(
      el("feComposite", { in: "cR", in2: "cG", operator: "arithmetic", k2: "1", k3: "1", result: "rg" })
    );
    f.appendChild(
      el("feComposite", { in: "rg", in2: "cB", operator: "arithmetic", k2: "1", k3: "1", result: "bent" })
    );
    return f;
  }

  function installFilters(mapURL, aberration) {
    if (!defs) {
      var svg = el("svg", { "aria-hidden": "true", focusable: "false" });
      svg.id = "water-cursor-defs";
      defs = el("defs", {});
      svg.appendChild(defs);
      document.body.appendChild(svg);
    }
    while (defs.firstChild) defs.removeChild(defs.firstChild);
    defs.appendChild(buildFilter("wc-refract", SIZE, REFRACT, mapURL, aberration));
    defs.appendChild(buildFilter("wc-refract-sat", SAT_SIZE, SAT_REFRACT, mapURL, aberration));
  }

  /* ---- DOM --------------------------------------------------------------
     Each droplet is a wrapper (position + squash) holding a lens layer
     (the backdrop-filter) and a gloss layer (highlights, rim, iridescence),
     kept apart so the highlights don't get refracted along with the page. */
  function makeDrop(cls) {
    var wrap = document.createElement("div");
    wrap.className = "wc-drop " + cls;
    var lens = document.createElement("div");
    lens.className = "wc-drop__lens";
    // Soap-film interference, drifting on its own between the refraction and
    // the highlights.
    var film = document.createElement("div");
    film.className = "wc-drop__film";
    var gloss = document.createElement("div");
    gloss.className = "wc-drop__gloss";
    wrap.appendChild(lens);
    wrap.appendChild(film);
    wrap.appendChild(gloss);
    return wrap;
  }

  var root = document.createElement("div");
  root.id = "water-cursor";
  root.setAttribute("aria-hidden", "true");

  var main = makeDrop("wc-drop--main");
  var sat = makeDrop("wc-drop--sat");
  var splash = document.createElement("div");
  splash.className = "wc-splash";
  var splashRing = document.createElement("div");
  splashRing.className = "wc-splash__ring";
  splash.appendChild(splashRing);
  splashRing.addEventListener("animationend", function () {
    splash.classList.remove("is-on");
  });

  root.appendChild(sat);
  root.appendChild(main);
  root.appendChild(splash);

  function mount() {
    // Sizes live in JS (the filter needs them in pixels), so hand them to CSS
    // rather than repeating the numbers in the stylesheet.
    root.style.setProperty("--wc-size", SIZE + "px");
    root.style.setProperty("--wc-sat-size", SAT_SIZE + "px");
    document.body.appendChild(root);
    paintFilm();
    // The hue picker (js/pink-egg.js) recolours --accent; the texture is
    // already rasterised by then, so it has to be repainted.
    document.addEventListener("ppg:accent-change", paintFilm);
    var mapURL = canRefract ? buildMap() : null;
    if (mapURL) {
      mapCache = mapURL; // kept so a later step-down doesn't rebuild it
      installFilters(mapURL, true);
    } else {
      root.classList.add("is-flat");
    }
    document.documentElement.classList.add("has-water-cursor");
    start();
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  /* ---- state ------------------------------------------------------------ */
  var target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  var seen = false; // has the pointer moved at least once
  var visible = false;
  var hoverScale = 1;
  var hoverTarget = 1;
  var fade = 0; // eased 0..1 opacity gate
  var fadeTarget = 0;

  var drops = [
    { node: main, x: target.x, y: target.y, vx: 0, vy: 0, k: STIFF, d: DAMP, size: SIZE },
    { node: sat, x: target.x, y: target.y, vx: 0, vy: 0, k: SAT_STIFF, d: SAT_DAMP, size: SAT_SIZE }
  ];

  window.addEventListener(
    "pointermove",
    function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      target.x = e.clientX;
      target.y = e.clientY;
      if (!seen) {
        // Snap on the first sighting so the drop doesn't sail in from the
        // middle of the screen.
        seen = true;
        for (var i = 0; i < drops.length; i++) {
          drops[i].x = target.x;
          drops[i].y = target.y;
        }
      }
      fadeTarget = 1;
      visible = true;
    },
    { passive: true }
  );

  function hide() {
    fadeTarget = 0;
    visible = false;
  }
  document.addEventListener("pointerleave", hide);
  document.addEventListener("mouseleave", hide);
  window.addEventListener("blur", hide);

  /* Hover states. `label` and `summary` are in here because they behave like
     buttons even though they aren't one. */
  var LINK_SEL =
    'a, button, [role="button"], summary, label, .btn, input[type="range"], [data-cursor="link"]';
  var TEXT_SEL =
    'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]';

  function updateHover(node) {
    var isText = node && node.closest && node.closest(TEXT_SEL);
    var isLink = !isText && node && node.closest && node.closest(LINK_SEL);
    hoverTarget = isText ? 0.42 : isLink ? 1.3 : 1;
    root.classList.toggle("is-over-text", !!isText);
    root.classList.toggle("is-over-link", !!isLink);
  }

  document.addEventListener(
    "pointerover",
    function (e) {
      updateHover(e.target);
    },
    { passive: true }
  );
  document.addEventListener(
    "pointerout",
    function (e) {
      if (!e.relatedTarget) updateHover(null);
    },
    { passive: true }
  );

  /* Click sends a ripple out from where you pressed. */
  document.addEventListener(
    "pointerdown",
    function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      splash.style.transform =
        "translate3d(" + (e.clientX - 70) + "px," + (e.clientY - 70) + "px,0)";
      splash.classList.remove("is-on");
      // Force a reflow so the animation restarts on rapid clicks.
      void splash.offsetWidth;
      splash.classList.add("is-on");
    },
    { passive: true }
  );

  /* ---- adaptive quality -------------------------------------------------
     Three displacement passes over a live backdrop is the expensive part.
     If we can't hold a reasonable frame rate while the pointer is actually
     moving, drop the rainbow fringe first and the satellite second rather
     than letting the whole page stutter.                                  */
  var quality = 2; // 2 = full, 1 = no aberration, 0 = no satellite either
  var slowFrames = 0;
  var lastT = 0;

  function degrade() {
    if (quality === 2) {
      quality = 1;
      if (canRefract) {
        if (!mapCache) mapCache = buildMap();
        if (mapCache) installFilters(mapCache, false);
      }
    } else if (quality === 1) {
      quality = 0;
      root.classList.add("no-satellite");
    }
    slowFrames = 0;
  }

  /* ---- loop ------------------------------------------------------------- */
  var t0 = performance.now();

  function frame(now) {
    var dt = lastT ? now - lastT : 16.7;
    lastT = now;

    fade += (fadeTarget - fade) * 0.16;
    hoverScale += (hoverTarget - hoverScale) * 0.16;

    var moving = false;

    for (var i = 0; i < drops.length; i++) {
      var p = drops[i];
      // The satellite chases the main drop, not the pointer — that's what
      // makes it read as one body of water splitting rather than two cursors.
      var tx = i === 0 ? target.x : drops[0].x;
      var ty = i === 0 ? target.y : drops[0].y;

      p.vx = (p.vx + (tx - p.x) * p.k) * p.d;
      p.vy = (p.vy + (ty - p.y) * p.k) * p.d;
      p.x += p.vx;
      p.y += p.vy;

      var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > 0.6) moving = true;

      var s = Math.min(speed * STRETCH, STRETCH_MAX);
      var angle = speed > 0.4 ? Math.atan2(p.vy, p.vx) : p.angle || 0;
      p.angle = angle;

      // Idle breathing, slightly out of phase per axis so it never looks
      // like a pulsing circle.
      var t = (now - t0) / 1000;
      var breathX = 1 + Math.sin(t * 1.7 + i * 2.1) * 0.022;
      var breathY = 1 + Math.sin(t * 1.31 + 1.1 + i * 2.1) * 0.026;

      var scale = i === 0 ? hoverScale : 1;
      // The satellite fades in with distance and shrinks back into the main
      // drop when the pointer settles.
      var alpha = fade;
      if (i === 1) {
        var dx = drops[0].x - p.x;
        var dy = drops[0].y - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        // Held back until it has actually cleared the main drop's silhouette,
        // otherwise it reads as a bubble inside a bubble rather than a bead
        // that got left behind.
        alpha = fade * Math.max(0, Math.min(1, (dist - 52) / 55)) * 0.9;
        scale = 0.55 + Math.min(1, dist / 120) * 0.6;
      }

      // Opacity goes on a custom property the children read, never on the
      // wrapper itself: an ancestor below full opacity forms a backdrop root
      // and the lens would have nothing left to refract.
      p.node.style.setProperty("--wc-alpha", alpha.toFixed(3));
      p.node.style.transform =
        "translate3d(" +
        (p.x - p.size / 2).toFixed(2) +
        "px," +
        (p.y - p.size / 2).toFixed(2) +
        "px,0) rotate(" +
        angle.toFixed(3) +
        "rad) scale(" +
        (scale * (1 + s) * breathX).toFixed(4) +
        "," +
        (scale * (1 - s * 0.68) * breathY).toFixed(4) +
        ") rotate(" +
        (-angle).toFixed(3) +
        "rad)";
    }

    if (moving && quality > 0) {
      if (dt > 26) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 45) degrade();
    }

    requestAnimationFrame(frame);
  }

  function start() {
    requestAnimationFrame(frame);
  }
})();
