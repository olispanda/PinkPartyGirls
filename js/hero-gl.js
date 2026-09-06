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
    "uniform vec2 uRes;",
    "uniform vec2 uVideoRes;",
    "uniform vec4 uLogoRect;",
    "uniform vec4 uHeroRect;",
    "uniform vec2 uBubble;",
    "uniform float uRadius;",
    "uniform float uAlpha;",
    "uniform float uTime;",
    "uniform vec3 uAccent;",
    "uniform float uHasVideo;",
    "uniform float uSquash;",
    "uniform vec2 uSquashDir;",

    /* Bubble shape. Numbers mean the same as their CSS counterparts in
       js/water-cursor.js, so the two stay recognisably the same object. */
    "const float BEND = 0.42;",
    "const float RIM_BITE = 3.2;",
    "const float CHROMA = 0.055;",

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
    "vec4 scene(vec2 frag){",
    " vec2 h=frag-uHeroRect.xy;",
    " if(h.x<0.0||h.y<0.0||h.x>uHeroRect.z||h.y>uHeroRect.w) return vec4(0.0);",
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
    " return vec4(col,1.0);}",

    "void main(){",
    " vec2 frag=vec2(vUv.x,1.0-vUv.y)*uRes;",
    " vec2 rel=frag-uBubble;",
    /* squash along the direction of travel, the way the CSS drop does */
    " vec2 ax=uSquashDir;vec2 ay=vec2(-ax.y,ax.x);",
    " vec2 loc=vec2(dot(rel,ax)/(1.0+uSquash),dot(rel,ay)/(1.0-uSquash*0.68));",
    " vec2 d=loc/uRadius;",
    " float r=length(d);",
    " vec3 col;float a=1.0;",
    " if(r<1.0&&uAlpha>0.004){",
    /* the sphere: analytic normal of a hemisphere, same as the reference */
    "  vec3 n=vec3(d,sqrt(max(0.0,1.0-dot(d,d))));",
    "  float fres=pow(1.0-n.z,2.5);",
    /* Nearly flat through the middle, turning hard at the rim — a bead,
       not a magnifying glass. */
    "  float prof=BEND*(0.12*r+0.88*pow(r,RIM_BITE));",
    "  vec2 bend=normalize(d+vec2(0.0001))*prof*uRadius;",
    "  vec2 sp=frag-bend;",
    /* a little surface unrest so it doesn't read as machined glass */
    "  float w=noise(d*2.3+uTime*0.06)-0.5;",
    "  sp+=normalize(d+vec2(0.0001))*w*uRadius*0.035;",
    /* three samples, split along the bend: the colour fringe */
    "  vec2 ca=normalize(d+vec2(0.0001))*uRadius*CHROMA*r;",
    "  vec4 sR=scene(sp+ca),sG=scene(sp),sB=scene(sp-ca);",
    "  vec4 bent=vec4(sR.r,sG.g,sB.b,max(sG.a,max(sR.a,sB.a)));",
    "  col=bent.rgb;a=bent.a;",
    /* soap film: thin at the rim, so that is where the colour sits */
    "  float film=smoothstep(0.25,0.98,r)*(0.55+0.45*noise(d*1.7-uTime*0.05));",
    "  vec3 tint=mix(uAccent,vec3(0.62,0.86,1.0),0.5+0.5*sin(r*7.0+uTime*0.35));",
    "  col=mix(col,col*0.75+tint*0.55,film*0.34);",
    /* rim shoulder, wide and soft — a hard ring is the giveaway */
    "  float shoulder=fres*smoothstep(0.55,1.0,r);",
    "  col+=vec3(0.14)*shoulder;a=max(a,shoulder*0.5);",
    /* Speculars stay white — they are the light, not the surface. A real
       highlight is a small bright core inside a much wider, much fainter
       halo; one opaque blob is what reads as cartoon glass. */
    "  vec2 sc=vec2(-0.36,-0.42);",
    "  float core=smoothstep(0.09,0.0,distance(d,sc));",
    "  float halo=smoothstep(0.46,0.02,distance(d,sc));",
    "  float second=smoothstep(0.07,0.0,distance(d,vec2(0.42,-0.26)));",
    /* the caustic is a flattened arc against the far wall, not a disc */
    "  float caustic=smoothstep(0.20,0.0,distance(d*vec2(1.0,2.7),vec2(0.05,0.70)*vec2(1.0,2.7)));",
    "  float lit=0.62*core+0.10*halo+0.22*second+0.20*caustic;",
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
      "uVideo", "uLogo", "uRes", "uVideoRes", "uLogoRect", "uHeroRect", "uBubble",
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
    window.addEventListener("resize", resize, { passive: true });

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
        /* One bubble per page. The CSS cursor is the fallback for pages
           without a GL hero; where the scene runs, it draws the bubble and
           the cursor version would only double it. */
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
