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

    /* Bubble shape. Numbers mean the same as their CSS counterparts in
       the CSS version this replaced, so the shape stayed recognisable. */
    "const float IOR = 0.66;",    // air → water-ish; lower bends harder
    "const float THICK = 1.15;",  // past ~1.5 the content gets pushed out of
                                 // the middle and the bubble reads as empty  // how far the bent ray travels, in radii
    "const float DISP = 0.055;",  // spread between the three colour rays

    "float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,4.1414)))*43758.5453);}",
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);",
    " return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}",

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

    "void main(){",
    " vec2 frag=vec2(vUv.x,1.0-vUv.y)*uRes;",
    " vec2 rel=frag-uBubble;",
    /* squash along the direction of travel, the way the CSS drop does */
    /* Two frames of reference, and mixing them up is what made the bubble
       look like it was spinning. The squash runs along the direction of
       travel, so its axes rotate — but only the shape may use them. The
       highlights and the film belong to the world: a lamp does not swing
       round the glass because the glass moved sideways. */
    " vec2 ax=uSquashDir;vec2 ay=vec2(-ax.y,ax.x);",
    " vec2 loc=vec2(dot(rel,ax)/(1.0+uSquash),dot(rel,ay)/(1.0-uSquash*0.68));",
    " vec2 d=loc/uRadius;",
    " vec2 dw=rel/uRadius;",
    " float r=length(d);",
    " vec3 col;float a=1.0;",
    " if(r<1.0&&uAlpha>0.004){",
    /* the sphere: analytic normal of a hemisphere, same as the reference */
    "  vec3 n=vec3(d,sqrt(max(0.0,1.0-dot(d,d))));",
    "  float fres=pow(1.0-n.z,2.5);",
    /* Real refraction rather than a hand-shaped falloff. The eye ray meets
       the sphere, Snell bends it, and the bent ray is followed to where it
       leaves — which magnifies evenly through the middle and swings hard at
       the rim, the way glass actually behaves. The previous profile was
       deliberately flat in the centre and barely enlarged anything, which is
       what made it look weak next to the reference.

       Dispersion is done properly too: three rays at slightly different
       indices, since that is where a real fringe comes from. */
    "  vec3 eye=vec3(0.0,0.0,-1.0);",
    "  float w=noise(dw*2.3+uTime*0.06)-0.5;",
    "  float th=THICK*uRadius*(1.0+w*0.05);",
    /* The normal lives in the squashed frame, whose axes rotate with the
       direction of travel, so the bent ray comes out in that frame too. It
       has to be rotated back before it can be added to a world-space
       position — otherwise the whole displacement swings round as you move,
       which is the spinning that was left after fixing the highlights. */
    "  vec2 bR=refract(eye,n,IOR*(1.0-DISP)).xy;",
    "  vec2 bG=refract(eye,n,IOR).xy;",
    "  vec2 bB=refract(eye,n,IOR*(1.0+DISP)).xy;",
    "  vec2 sp=frag+(ax*bG.x+ay*bG.y)*th;",
    "  vec2 spR=frag+(ax*bR.x+ay*bR.y)*th;",
    "  vec2 spB=frag+(ax*bB.x+ay*bB.y)*th;",
    "  vec4 sR=scene(spR),sG=scene(sp),sB=scene(spB);",
    "  vec4 bent=vec4(sR.r,sG.g,sB.b,max(sG.a,max(sR.a,sB.a)));",
    "  col=bent.rgb;a=bent.a;",
    /* soap film: thin at the rim, so that is where the colour sits */
    "  float film=smoothstep(0.45,1.0,r)*(0.55+0.45*noise(dw*1.7-uTime*0.05));",
    "  vec3 tint=mix(uAccent,vec3(0.62,0.86,1.0),0.5+0.5*sin(r*7.0+uTime*0.35));",
    "  col=mix(col,col*0.82+tint*0.45,film*0.20);",
    /* rim shoulder, wide and soft — a hard ring is the giveaway */
    /* The rim reads dark on the reference — glass seen edge-on reflects
       away rather than lighting up — with only a thin bright line right at
       the outline. */
    "  float shoulder=fres*smoothstep(0.62,1.0,r);",
    "  col*=1.0-0.35*shoulder;",
    "  float outline=smoothstep(0.90,1.0,r)*(1.0-smoothstep(0.985,1.0,r));",
    "  col+=vec3(0.30)*outline;a=max(a,max(shoulder*0.45,outline));",
    /* Speculars stay white — they are the light, not the surface. A real
       highlight is a small bright core inside a much wider, much fainter
       halo; one opaque blob is what reads as cartoon glass. */
    "  vec2 sc=vec2(-0.36,-0.42);",
    "  float core=smoothstep(0.09,0.0,distance(dw,sc));",
    "  float halo=smoothstep(0.46,0.02,distance(dw,sc));",
    "  float second=smoothstep(0.07,0.0,distance(dw,vec2(0.42,-0.26)));",
    /* the caustic is a flattened arc against the far wall, not a disc */
    "  float caustic=smoothstep(0.20,0.0,distance(dw*vec2(1.0,2.7),vec2(0.05,0.70)*vec2(1.0,2.7)));",
    "  float lit=0.55*core+0.035*halo+0.16*second+0.13*caustic;",
    "  col+=vec3(lit);a=max(a,lit);",
    /* smoothstep needs its edges in ascending order — reversed, the result
       is undefined by the spec, and the engines duly disagree: Chromium and
       WebKit gave the bubble, Firefox dropped it entirely. */
    "  float edge=1.0-smoothstep(0.985,1.0,r);",
    "  vec4 plain=scene(frag);",
    "  float k=uAlpha*edge;",
    "  col=mix(plain.rgb,col,k);a=mix(plain.a,a,k);",
    " }else{vec4 p=scene(frag);col=p.rgb;a=p.a;}",
    /* premultiplied: the canvas composites over the page below */
    " gl_FragColor=vec4(col*a,a);}"
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
        var b = k.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        var rad = parseFloat(ks.borderRadius) || 0;
        cx.fillStyle = bg;
        if (rad > 0 && cx.roundRect) {
          cx.beginPath();
          cx.roundRect(b.left, b.top + sy, b.width, b.height, rad);
          cx.fill();
        } else {
          cx.fillRect(b.left, b.top + sy, b.width, b.height);
        }
      }
      // Outlines separately: the buttons here are borders with no fill, and
      // without this they arrive as labels floating in mid-air.
      for (i = 0; i < kids.length; i++) {
        var e2 = kids[i];
        var s2 = getComputedStyle(e2);
        var bw = parseFloat(s2.borderTopWidth) || 0;
        if (!bw || s2.borderTopStyle === "none") continue;
        var bb = e2.getBoundingClientRect();
        if (!bb.width || !bb.height) continue;
        var br = parseFloat(s2.borderRadius) || 0;
        cx.strokeStyle = s2.borderTopColor;
        cx.lineWidth = bw;
        if (br > 0 && cx.roundRect) {
          cx.beginPath();
          cx.roundRect(bb.left + bw / 2, bb.top + sy + bw / 2, bb.width - bw, bb.height - bw, br);
          cx.stroke();
        } else {
          cx.strokeRect(bb.left + bw / 2, bb.top + sy + bw / 2, bb.width - bw, bb.height - bw);
        }
      }
    }

    function buildTextLayer() {
      var els = document.querySelectorAll(TEXT_SEL);
      if (!els.length) return;
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

    var finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
    var SIZE = finePointer ? 136 : 172;
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
      gl.uniform1f(U.uRadius, (SIZE / 2) * DPR);
      gl.uniform1f(U.uAlpha, alpha);
      gl.uniform1f(U.uTime, (now - t0) / 1000);
      gl.uniform3f(U.uAccent, accent[0], accent[1], accent[2]);
      gl.uniform1f(U.uHasVideo, hasVideo);
      gl.uniform1f(U.uSquash, Math.min(speed * 0.011, 0.3));
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
