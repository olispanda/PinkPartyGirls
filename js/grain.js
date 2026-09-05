/* ==========================================================================
   Film grain — a full-viewport animated noise overlay that drifts on its
   own and parallax-shifts a little toward the pointer. Purely decorative:
   pointer-events are off and the canvas is hidden from assistive tech.
   Honours prefers-reduced-motion by falling back to a single static frame.
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var canvas = document.createElement("canvas");
  canvas.id = "grain-overlay";
  canvas.setAttribute("aria-hidden", "true");

  function mount() {
    (document.body || document.documentElement).appendChild(canvas);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  // Low-res noise tiles, scaled up by CSS/drawImage for a chunky 35mm look.
  var TILE = 160;
  var TILES = 8; // pre-rendered frames we cycle through
  var frames = [];

  function buildTiles() {
    frames.length = 0;
    for (var t = 0; t < TILES; t++) {
      var off = document.createElement("canvas");
      off.width = off.height = TILE;
      var octx = off.getContext("2d");
      var img = octx.createImageData(TILE, TILE);
      var d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        var v = (Math.random() * 255) | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = (Math.random() * 255) | 0;
      }
      octx.putImageData(img, 0, 0);
      frames.push(off);
    }
  }
  buildTiles();

  var vw = 0,
    vh = 0,
    scale = 2; // how much each noise pixel is blown up

  function resize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.ceil(vw / scale);
    canvas.height = Math.ceil(vh / scale);
  }
  resize();
  window.addEventListener("resize", resize);

  // Pointer state (eased toward the real cursor).
  var pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false };

  window.addEventListener(
    "pointermove",
    function (e) {
      pointer.tx = e.clientX;
      pointer.ty = e.clientY;
      // Snap on the first real move so the field doesn't lurch in from the
      // off-screen sentinel position.
      if (!isFinite(pointer.x) || pointer.x < -9000) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
      }
      pointer.active = true;
    },
    { passive: true }
  );
  window.addEventListener("pointerleave", function () {
    pointer.active = false;
  });
  window.addEventListener("blur", function () {
    pointer.active = false;
  });

  var frameIndex = 0,
    tick = 0;

  function drawField(alpha, jitter) {
    var f = frames[frameIndex % TILES];
    var step = TILE; // tile is drawn at native size then CSS-upscaled
    var ox = ((Math.random() * jitter) | 0) - step - jitter / 2;
    var oy = ((Math.random() * jitter) | 0) - step - jitter / 2;
    ctx.globalAlpha = alpha;
    for (var y = oy; y < canvas.height; y += step) {
      for (var x = ox; x < canvas.width; x += step) {
        ctx.drawImage(f, x, y);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ease the pointer.
    pointer.x += (pointer.tx - pointer.x) * 0.08;
    pointer.y += (pointer.ty - pointer.y) * 0.08;

    // Whole-field parallax nudge toward the cursor.
    var px = 0,
      py = 0;
    if (pointer.active && isFinite(pointer.x)) {
      px = ((pointer.x / vw - 0.5) * 6) | 0;
      py = ((pointer.y / vh - 0.5) * 6) | 0;
    }

    ctx.save();
    ctx.translate(px, py);

    ctx.globalCompositeOperation = "source-over";
    drawField(0.55, 24);

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  if (reduceMotion) {
    var once = function () {
      if (!vw) return requestAnimationFrame(once);
      drawField(0.55, 24);
    };
    once();
    return;
  }

  function loop() {
    tick++;
    if (tick % 4 === 0) frameIndex++; // ~15fps grain churn at 60fps rAF
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
