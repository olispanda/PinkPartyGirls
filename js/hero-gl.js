/* ==========================================================================
   Hero — WebGL scene with the bubble inside it.

   The CSS route hit a wall: a refracting bubble built out of backdrop-filter
   and an SVG displacement map looks different in every engine. Chromium runs
   it, WebKit refuses the painted map and needs a cloned copy of the page,
   Firefox runs neither. Three code paths, three results, and the one thing
   asked for — the same bubble everywhere — out of reach.

   So the hero stops being HTML that something filters, and becomes a scene
   that draws itself: the video, the wash and the wordmark are textures, and
   the bubble is maths in a fragment shader. WebGL behaves the same in every
   browser, which is the whole point.

   This is only possible because the hero holds no text. The wordmark is a
   flat SVG, so nothing here costs us real copy, selectable text or anything
   a search engine reads — those all live in the sections below, untouched.

   The DOM stays exactly as it was and is merely made invisible: it is the
   fallback when WebGL is missing, it still provides the alt text, and its
   geometry is what tells the shader where to put the wordmark.
   ========================================================================== */
(function () {
  "use strict";

  var VERT =
    "attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*0.5+0.5;gl_Position=vec4(aPos,0.0,1.0);}";

  var FRAG = [
    "precision highp float;",
    "varying vec2 vUv;",
    "uniform sampler2D uVideo;",
    "uniform sampler2D uLogo;",
    "uniform sampler2D uPage;",
    "uniform vec2 uRes;",
    "uniform vec2 uVideoRes;",
    "uniform vec4 uLogoRect;",
    "uniform vec4 uHeroRect;",
    "uniform vec2 uPageSize;",
    "uniform float uScroll;",
    "uniform float uHasPage;",
    "uniform vec2 uBubble;",
    "uniform float uRadius;",
    "uniform float uAlpha;",
    "uniform float uTime;",
    "uniform vec3 uAccent;",
    "uniform float uHasVideo;",
    "uniform float uSquash;",
    "uniform vec2 uSquashDir;",

    /* A solid glass ball, the way a transmission material renders one (this
       is what the reference does). The previous version was a soap bubble
       with a painted film and drawn highlights, and that is exactly what
       made it look like a cartoon: real glass has no colour of its own and
       no outline, only what it bends and what it mirrors. */
    "const float IOR = 1.45;",   // glass
    "const float THICK = 0.55;", // how far the bent ray travels, in radii.
                                 // Kept low: the middle stays close to true
                                 // size and the effect gathers at the rim,
                                 // where the content folds round the edge.
    "const float CA = 0.05;",    // spread of the index across the spectrum;
                                 // much more and every letter gets 3D-glasses
                                 // ghosts, not just the ones at the rim
    "const int SAMPLES = 5;",    // per colour band; fewer and the fringe steps

    /* object-fit: cover, in shader form */
    "vec2 coverUV(vec2 frag,vec2 res,vec2 tex){",
    " float rs=res.x/res.y,rt=tex.x/tex.y;vec2 s=vec2(1.0);",
    " if(rs>rt){s.y=rt/rs;}else{s.x=rs/rt;}",
    " return (frag/res-0.5)*s+0.5;}",

    /* The hero as it looks without the bubble: greyscale video, the pink
       wash from the top right, then the wordmark.

       The canvas now covers the whole page rather than just the hero, so
       the bubble can travel down through the other sections. Outside the
       hero rectangle this returns nothing at all — alpha zero — and the
       page below shows through untouched. */
    /* Text drawn from the page, in document space — the bubble bends this
       the same way it bends the hero. */
    "vec4 pageText(vec2 frag){",
    " if(uHasPage<0.5) return vec4(0.0);",
    " vec2 uv=vec2(frag.x/uPageSize.x,(frag.y+uScroll)/uPageSize.y);",
    " if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) return vec4(0.0);",
    " return texture2D(uPage,uv);}",

    "vec4 scene(vec2 frag){",
    " vec4 txt=pageText(frag);",
    " vec2 h=frag-uHeroRect.xy;",
    " if(h.x<0.0||h.y<0.0||h.x>uHeroRect.z||h.y>uHeroRect.w) return txt;",
    " vec3 col=vec3(0.035,0.031,0.035);",
    " if(uHasVideo>0.5){",
    "  vec2 vuv=coverUV(h,uHeroRect.zw,uVideoRes);",
    "  vec3 v=texture2D(uVideo,vuv).rgb;",
    "  float g=dot(v,vec3(0.299,0.587,0.114));",
    "  g=clamp((g-0.5)*1.05+0.5,0.0,1.0);",
    "  col=vec3(g);}",
    " col=mix(col,vec3(0.035,0.031,0.035),0.45);",
    " float d=distance(h,vec2(uHeroRect.z,0.0))/(uHeroRect.z*1.05);",
    " col=mix(col,uAccent,0.55*(1.0-smoothstep(0.0,1.0,d)));",
    " vec2 luv=(frag-uLogoRect.xy)/uLogoRect.zw;",
    " if(luv.x>=0.0&&luv.x<=1.0&&luv.y>=0.0&&luv.y<=1.0){",
    "  float a=texture2D(uLogo,luv).a;",
    "  col=mix(col,uAccent,a);}",
    " col=mix(col,txt.rgb,txt.a);",
    " return vec4(col,1.0);}",

    /* One refracted look-up. The eye ray meets the sphere, Snell bends it,
       and the bent ray is followed THICK radii in. t moves the index across
       the spectrum, -1 at the red end to +1 at the blue. */
    "vec4 bend(vec2 frag,vec3 n,float t){",
    " vec2 o=refract(vec3(0.0,0.0,-1.0),n,1.0/(IOR*(1.0+CA*t))).xy;",
    " return scene(frag+o*THICK*uRadius);}",

    /* What the glass mirrors: a softly lit room, a little brighter where
       light comes up off the floor. No light sources you could pick out — a
       distinct window lands on the ball as a round spot, and a spot is
       exactly what reads as drawn. Neutral, too: any tint here looks like a
       coloured coating. Screen y points down. */
    "vec3 env(vec3 d){",
    " return vec3(0.10+0.16*smoothstep(0.0,1.0,d.y)+0.06*smoothstep(0.0,1.0,-d.y));}",

    "void main(){",
    " vec2 frag=vec2(vUv.x,1.0-vUv.y)*uRes;",
    " vec2 rel=frag-uBubble;",
    /* Squash along the direction of travel. Its axes rotate with the motion,
       so only the shape may use them — see the normal below. */
    " vec2 ax=uSquashDir;vec2 ay=vec2(-ax.y,ax.x);",
    " vec2 loc=vec2(dot(rel,ax)/(1.0+uSquash),dot(rel,ay)/(1.0-uSquash*0.68));",
    " vec2 d=loc/uRadius;",
    " float r=length(d);",
    " if(r>=1.0||uAlpha<=0.004){vec4 p=scene(frag);gl_FragColor=vec4(p.rgb*p.a,p.a);return;}",
    /* the sphere: analytic normal of a hemisphere */
    " vec3 n=vec3(d,sqrt(max(0.0,1.0-dot(d,d))));",
    /* The normal is found in the squashed frame, whose axes rotate with the
       direction of travel, but everything it drives — the bent rays, the
       reflection — belongs to the world. Rotated back here, once; mixing
       the two frames is what used to make the bubble look like it spun. */
    " vec3 nw=vec3(ax*n.x+ay*n.y,n.z);",
    /* Dispersion as a spectrum rather than three copies. Each colour band
       is swept by several rays at neighbouring indices, so the fringe comes
       out as a smooth rainbow edge instead of three offset ghosts.

       Summed premultiplied: over the sections the scene is transparent
       except for the text, and averaging straight colour there would drag
       every anti-aliased edge towards black. */
    " vec3 acc=vec3(0.0),cov=vec3(0.0);",
    " for(int i=0;i<SAMPLES;i++){",
    "  float s=(float(i)+0.5)/float(SAMPLES)*0.6667;",
    "  vec4 cr=bend(frag,nw,-1.0+s);",
    "  vec4 cg=bend(frag,nw,-0.3333+s);",
    "  vec4 cb=bend(frag,nw,0.3333+s);",
    "  acc+=vec3(cr.r*cr.a,cg.g*cg.a,cb.b*cb.a);",
    "  cov+=vec3(cr.a,cg.a,cb.a);}",
    " vec3 prem=acc/float(SAMPLES);",
    " float a=dot(cov,vec3(1.0/(3.0*float(SAMPLES))));",
    /* Fresnel (Schlick, glass): four percent mirror head-on, nearly all
       mirror at grazing. That is the only edge the ball gets — a thin
       lighter line where the room shows in the glass.

       Added as light rather than laid over the transmission. Replacing the
       bent image with a dim room at the rim is what drew a dark outline
       round the ball; adding it lifts the edge instead, and — premultiplied,
       with the alpha left alone — it lightens the page over the sections the
       same way it lightens the hero. */
    " float F=0.04+0.96*pow(1.0-n.z,5.0);",
    " prem+=env(reflect(vec3(0.0,0.0,-1.0),nw))*F;",
    /* a pixel and a half of feathering at the silhouette, whatever the size */
    " float edge=1.0-smoothstep(1.0-1.5/uRadius,1.0,r);",
    " vec4 plain=scene(frag);",
    " float k=uAlpha*edge;",
    /* premultiplied: the canvas composites over the page below */
    " gl_FragColor=mix(vec4(plain.rgb*plain.a,plain.a),vec4(prem,a),k);}"
  ].join("\n");

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      if (window.console) console.warn("hero-gl:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function init() {
    var hero = document.querySelector(".slide-home");
    if (!hero) return;
    var video = hero.querySelector(".slide-home__video");
    var logoImg = hero.querySelector(".slide-home__logo");
    if (!logoImg) return;

    var reduceMotion =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    var canvas = document.createElement("canvas");
    canvas.className = "hero-gl";
    canvas.setAttribute("aria-hidden", "true");
    /* Transparent, because it spans the whole viewport: the hero is drawn
       into it, everything below shows through it, and the bubble travels
       across both. */
    var gl =
      canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true }) ||
      canvas.getContext("experimental-webgl", { alpha: true, antialias: false });
    if (!gl) return; // no WebGL — the DOM hero stays exactly as it is

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (window.console) console.warn("hero-gl:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var U = {};
    [
      "uVideo", "uLogo", "uRes", "uVideoRes", "uLogoRect", "uHeroRect", "uPage", "uPageSize", "uScroll", "uHasPage", "uBubble",
      "uRadius", "uAlpha", "uTime", "uAccent", "uHasVideo", "uSquash", "uSquashDir"
    ].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });

    function makeTex(unit) {
      var t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 0]));
      return t;
    }
    var videoTex = makeTex(0);
    var logoTex = makeTex(1);
    gl.uniform1i(U.uVideo, 0);
    gl.uniform1i(U.uLogo, 1);

    /* The wordmark is drawn into a canvas at its on-screen size rather than
       handed over as an SVG: only its alpha is used, the colour comes from
       --accent in the shader, so the hue picker keeps working. */
    var logoReady = false;
    function loadLogo() {
      var img = new Image();
      img.onload = function () {
        var r = logoImg.getBoundingClientRect();
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = Math.max(2, Math.round((r.width || 320) * dpr));
        var h = Math.max(2, Math.round((r.height || 320) * dpr));
        var c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        var cx = c.getContext("2d");
        cx.drawImage(img, 0, 0, w, h);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, logoTex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        logoReady = true;
      };
      img.src = logoImg.currentSrc || logoImg.src;
    }
    loadLogo();

    document.body.appendChild(canvas);
    /* The DOM hero is not hidden yet. It is the fallback, and hiding it before
       anything has been drawn is how a failure here turns into a black hole
       where the hero used to be — which is exactly what happened the first
       time. The class goes on after the first successful frame, and if none
       arrives the canvas removes itself. */
    var painted = false;
    setTimeout(function () {
      if (!painted && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }, 4000);

    /* ---- page text as a texture ------------------------------------------
       The shader can only bend what it has as pixels. The hero was easy —
       video and a flat SVG are already images — but the sections below are
       HTML, and that is the whole reason the bubble stopped refracting once
       it left the hero.

       The reference site sidesteps this by not having HTML text at all: its
       copy lives in a JSON blob, complete with its own line-break markers,
       and is drawn into a canvas with fillText. Same idea here, with one
       improvement: rather than re-implementing line breaking, the browser's
       own line boxes are read back per character, so the drawn text lands
       exactly where the HTML would have, with the same breaks.

       The elements stay in the DOM and only lose visibility. They remain the
       accessible copy, they remain what a crawler reads, and they are what
       these measurements come from. */
    var TEXT_SEL = [
      ".slide-statement__heading",
      ".slide-events__heading",
      ".slide-events__list",
      ".btn-dark-outline"
    ].join(",");
    var pageTex = makeTex(2);
    gl.uniform1i(U.uPage, 2);
    var pageH = 1, pageReady = false;

    // Split an element into rendered lines: walk its characters, and start a
    // new line whenever the browser puts one on a different row.
    function linesOf(el) {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      var range = document.createRange();
      var lines = [];
      var node, cur = null, curOwner = null;
      while ((node = walker.nextNode())) {
        var text = node.nodeValue;
        // Colour and case follow the text's own parent, not the block: the
        // "pink" chip sits inside the heading with its own styling.
        var owner = node.parentElement || el;
        if (owner !== curOwner) {
          curOwner = owner;
          cur = null; // never merge two elements' text into one run
        }
        for (var i = 0; i < text.length; i++) {
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          var r = range.getBoundingClientRect();
          if (!r.width && !r.height) {
            if (cur) cur.text += text[i]; // spaces at a wrap have no box
            continue;
          }
          if (!cur || Math.abs(r.top - cur.top) > 2) {
            cur = { top: r.top, bottom: r.bottom, left: r.left, text: text[i], owner: owner };
            lines.push(cur);
          } else {
            cur.text += text[i];
            if (r.bottom > cur.bottom) cur.bottom = r.bottom;
          }
        }
      }
      return lines;
    }

    // Anything inside the block that paints its own box — the chip's marker
    // highlight, for one — has to come along, or the text arrives naked.
    function paintBoxes(cx, el, sy) {
      // Include the element itself: an outlined button *is* the element, and
      // looking only at its children loses the outline.
      var kids = [el].concat(Array.prototype.slice.call(el.querySelectorAll("*")));
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        var ks = getComputedStyle(k);
        var bg = ks.backgroundColor;
        if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") continue;
        var rad = parseFloat(ks.borderRadius) || 0;
        cx.fillStyle = bg;
        /* Per line fragment, not one enclosing rectangle. An inline element
           that wraps has a box per line, and the union of them is a slab
           that covers the gap between — which is what drew the oversized
           panel and the stray block after it. */
        var rects = k.getClientRects();
        for (var q = 0; q < rects.length; q++) {
          var b = rects[q];
          if (!b.width || !b.height) continue;
          if (rad > 0 && cx.roundRect) {
            cx.beginPath();
            cx.roundRect(b.left, b.top + sy, b.width, b.height, Math.min(rad, b.height / 2));
            cx.fill();
          } else {
            cx.fillRect(b.left, b.top + sy, b.width, b.height);
          }
        }
      }
      // Outlines separately: the buttons here are borders with no fill, and
      // without this they arrive as labels floating in mid-air.
      for (i = 0; i < kids.length; i++) {
        var e2 = kids[i];
        var s2 = getComputedStyle(e2);
        var bw = parseFloat(s2.borderTopWidth) || 0;
        if (!bw || s2.borderTopStyle === "none") continue;
        var br = parseFloat(s2.borderRadius) || 0;
        cx.strokeStyle = s2.borderTopColor;
        cx.lineWidth = bw;
        var brects = e2.getClientRects();
        for (var z = 0; z < brects.length; z++) {
          var bb = brects[z];
          if (!bb.width || !bb.height) continue;
          if (br > 0 && cx.roundRect) {
            cx.beginPath();
            cx.roundRect(bb.left + bw / 2, bb.top + sy + bw / 2, bb.width - bw, bb.height - bw,
              Math.min(br, (bb.height - bw) / 2));
            cx.stroke();
          } else {
            cx.strokeRect(bb.left + bw / 2, bb.top + sy + bw / 2, bb.width - bw, bb.height - bw);
          }
        }
      }
    }

    var textRetry = 0;

    function buildTextLayer() {
      var els = document.querySelectorAll(TEXT_SEL);
      if (!els.length) return;
      /* Never measure mid-animation. These blocks fade and slide in on
         scroll, and a box measured halfway through lands at a position the
         element has already left — which is how a chip ends up drawn as an
         oversized panel sitting beside its own text. Wait it out and retry. */
      if (document.getAnimations) {
        for (var q = 0; q < els.length; q++) {
          var running = els[q].getAnimations
            ? els[q].getAnimations({ subtree: true })
            : [];
          if (running.length) {
            clearTimeout(textRetry);
            textRetry = setTimeout(buildTextLayer, 240);
            return;
          }
        }
      }
      /* Un-mark first: the class makes these transparent, and on a rebuild we
         would otherwise measure that transparency and draw nothing. Restored
         at the end of the same task, so nothing is ever painted uncovered. */
      for (var u = 0; u < els.length; u++) {
        els[u].classList.add("is-gl-measuring");
        els[u].classList.remove("is-gl-text");
      }
      var docH = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      // Cap the texture: tall pages would otherwise blow past the limit, and
      // this only has to cover what the bubble can reach.
      var scale = Math.min(DPR, 1.5);
      var texW = Math.min(4096, Math.round(W * scale));
      var texH = Math.min(8192, Math.round(docH * scale));
      var c = document.createElement("canvas");
      c.width = texW;
      c.height = texH;
      var cx = c.getContext("2d");
      if (!cx) return;
      cx.scale(texW / W, texH / docH);
      cx.textBaseline = "alphabetic";

      var sy = window.scrollY || window.pageYOffset || 0;
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var cs = getComputedStyle(el);
        // Measured while visible; hidden elements still have boxes, so this
        // keeps working on every rebuild.
        var lines = linesOf(el);
        paintBoxes(cx, el.parentNode === document.body ? el : el, sy);
        for (var j = 0; j < lines.length; j++) {
          var ln = lines[j];
          var os = getComputedStyle(ln.owner);
          cx.fillStyle = os.color;
          cx.font = os.fontStyle + " " + os.fontWeight + " " + os.fontSize + " " + os.fontFamily;
          var tt = os.textTransform;
          var t = ln.text;
          if (tt === "uppercase") t = t.toUpperCase();
          else if (tt === "lowercase") t = t.toLowerCase();
          // Baseline from the line box: its bottom minus the descender, which
          // is close enough that the drawn line sits on the HTML one.
          var fsize = parseFloat(os.fontSize) || 16;
          var base = ln.bottom - (ln.bottom - ln.top - fsize) / 2 - fsize * 0.21;
          cx.fillText(t, ln.left, base + sy);
        }
        el.classList.add("is-gl-text");
      }
      for (var v = 0; v < els.length; v++) els[v].classList.remove("is-gl-measuring");

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, pageTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      pageH = docH;
      pageReady = true;
    }

    /* ---- state ---- */
    var W = 0, H = 0, DPR = 1;
    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(window.innerWidth));
      H = Math.max(1, Math.round(window.innerHeight));
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      gl.viewport(0, 0, canvas.width, canvas.height);
      loadLogo(); // redraw at the new size, so it stays sharp
    }
    resize();
    window.addEventListener("resize", function () {
      resize();
      buildTextLayer();
    }, { passive: true });
    // Fonts change the line boxes, so wait for them before measuring.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { buildTextLayer(); });
    } else {
      setTimeout(buildTextLayer, 400);
    }
    // The CMS fills content in late; remeasure once it settles.
    setTimeout(buildTextLayer, 1500);
    // Blocks reveal as they scroll into view, each with its own animation —
    // remeasure whenever one lands.
    document.addEventListener(
      "animationend",
      function (e) {
        if (e.target && e.target.closest && e.target.closest(TEXT_SEL)) {
          clearTimeout(textRetry);
          textRetry = setTimeout(buildTextLayer, 60);
        }
      },
      true
    );

    var finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
    /* Sized to the viewport, not fixed: a glass ball only reads as one when
       it is big enough to bend a few letters at once. Smaller than that and
       the rim — where all the effect lives — is a handful of pixels. */
    function bubbleSize() {
      var m = Math.min(W, H);
      return finePointer
        ? Math.max(200, Math.min(360, m * 0.36))
        : Math.max(170, Math.min(260, m * 0.5));
    }
    var target = { x: W / 2, y: H / 2 };
    var pos = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    var alpha = finePointer ? 0 : 1;
    var alphaTarget = finePointer ? 0 : 1;
    var angle = 0;

    if (finePointer) {
      window.addEventListener("pointermove", function (e) {
        if (e.pointerType && e.pointerType !== "mouse") return;
        target.x = e.clientX;
        target.y = e.clientY;
        alphaTarget = 1;
      }, { passive: true });
      document.addEventListener("pointerleave", function () { alphaTarget = 0; });
      window.addEventListener("blur", function () { alphaTarget = 0; });
    }

    function accentRGB() {
      var probe = document.createElement("canvas");
      probe.width = probe.height = 1;
      var pc = probe.getContext("2d");
      var v = "";
      try {
        v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      } catch (e) { /* default below */ }
      if (!pc || !v) return [0.86, 0.15, 0.39];
      pc.fillStyle = "#db2763";
      pc.fillStyle = v;
      pc.fillRect(0, 0, 1, 1);
      var d = pc.getImageData(0, 0, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255];
    }
    var accent = accentRGB();
    document.addEventListener("ppg:accent-change", function () { accent = accentRGB(); });

    var t0 = performance.now();
    var hasVideo = 0;

    function frame(now) {
      requestAnimationFrame(frame);
      if (!logoReady) return;

      // spring, same feel as the CSS drop
      if (!finePointer) {
        var at = (now - t0) / 1000;
        target.x = W / 2 + Math.sin(at * 0.29) * 13;
        target.y = H / 2 + Math.sin(at * 0.21 + 1.3) * 9.75;
      }
      pos.vx = (pos.vx + (target.x - pos.x) * 0.17) * 0.74;
      pos.vy = (pos.vy + (target.y - pos.y) * 0.17) * 0.74;
      pos.x += pos.vx;
      pos.y += pos.vy;
      var speed = Math.sqrt(pos.vx * pos.vx + pos.vy * pos.vy);
      if (speed > 0.4) angle = Math.atan2(pos.vy, pos.vx);
      alpha += (alphaTarget - alpha) * 0.16;

      if (video && video.readyState >= 2 && video.videoWidth) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, videoTex);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          gl.uniform2f(U.uVideoRes, video.videoWidth, video.videoHeight);
          hasVideo = 1;
        } catch (e) {
          hasVideo = 0; // cross-origin or not decodable — the wash carries it
        }
      }

      // Viewport coordinates now: the hero scrolls, the canvas does not.
      var lr = logoImg.getBoundingClientRect();
      var hr = hero.getBoundingClientRect();
      gl.uniform2f(U.uRes, W * DPR, H * DPR);
      gl.uniform4f(U.uHeroRect, hr.left * DPR, hr.top * DPR, hr.width * DPR, hr.height * DPR);
      gl.uniform4f(U.uLogoRect, lr.left * DPR, lr.top * DPR, lr.width * DPR, lr.height * DPR);
      gl.uniform2f(U.uPageSize, W * DPR, pageH * DPR);
      gl.uniform1f(U.uScroll, (window.scrollY || window.pageYOffset || 0) * DPR);
      gl.uniform1f(U.uHasPage, pageReady ? 1 : 0);
      gl.uniform2f(U.uBubble, pos.x * DPR, pos.y * DPR);
      gl.uniform1f(U.uRadius, (bubbleSize() / 2) * DPR);
      gl.uniform1f(U.uAlpha, alpha);
      gl.uniform1f(U.uTime, (now - t0) / 1000);
      gl.uniform3f(U.uAccent, accent[0], accent[1], accent[2]);
      gl.uniform1f(U.uHasVideo, hasVideo);
      // Glass barely gives: a hint of stretch in motion, not a jelly drop.
      gl.uniform1f(U.uSquash, Math.min(speed * 0.005, 0.1));
      gl.uniform2f(U.uSquashDir, Math.cos(angle), Math.sin(angle));

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!painted) {
        painted = true;
        hero.classList.add("is-gl");
        document.documentElement.classList.add("has-hero-gl");
      }
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
