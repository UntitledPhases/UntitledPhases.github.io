// Orbit-and-relieve cycle for the nav band.
// The mark replays a compact square-to-shard-to-orbit loop, while staying
// deterministic, reduced-motion aware, and paused when the tab is hidden.
(function () {
  var INK = '242,242,240';     // warm white (--text)

  var H = 8;                   // square half-size
  var SAMPLES = 96;            // blob outline resolution
  var RBLOB = 3.55;            // blob growth unit: R = RBLOB * sqrt(absorbed)
  var FLAT = 0.42;             // orbit ellipse vertical flattening
  var SQX = 0.64, SQY = 1.18;  // crush target of the struck square

  function easeInOut(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function backOut(t) { var c = 1.7, d = t - 1; return 1 + (c + 1) * d * d * d + c * d * d; }
  // shard flight time-remap: fast burst (slope 2.3), float, end at slope 1.0
  // so arrival speed matches the spiral's tangential speed
  function flyEase(p) { return 1.3 * p * p * p - 2.6 * p * p + 2.3 * p; }
  // damped spring 0 -> 1 with one overshoot bounce (the crush + rebound)
  function spring(p) { return p <= 0 ? 0 : 1 - Math.exp(-5.5 * p) * Math.cos(9 * p); }
  function seed(i, salt) {
    var n = Math.sin((i + 1) * 12.9898 + (salt + 1) * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  // ---- timeline (one loop; t=0: fresh square B rests at assembly, A at anchor) ----
  var WIND0 = 120;                      // B pulls back - anticipation
  var APP0 = 350, APP = 500;            // B accelerates left, stretching with speed
  var IMPACT = APP0 + APP;              // 850 - contact
  var HITSTOP = 90;                     // frozen beat; shake + flash carry the hit
  var CRUSH0 = IMPACT + HITSTOP;        // 940 - A's spring compression begins
  var SQUISH = 360;                     // crush, rebound, settle; glow builds
  var SHATTER = CRUSH0 + SQUISH;        // 1300 - A breaks into 4 jagged pieces
  var POPD = 180;                       // burst apart (ease-out), squish relaxes
  var FLY0 = SHATTER + POPD;            // 1480 - shards arc back rightward
  var DOCK0 = 1520, DOCK = 420;         // B settles into the slot with overshoot
  var SPAWN0 = 2300, SSTAG = 110;       // shard -> comet handoff times (orbit entry)
  var HAND = 140;                       // crossfade window at the handoff
  var MERGE0 = 4450, MSTAG = 130;       // staggered spiral-in merge times
  var MORPH0 = 5000, MORPH = 650;       // blob -> square
  var CYCLE = MORPH0 + MORPH;           // = 5650, wraps seamlessly to t=0

  // ---- jagged quarters of the square (units of H; cracks share polylines) ----
  var PIECE_POLYS = [
    [[-1,-1],[-0.2,-1],[0.15,-0.45],[0.1,-0.1],[-0.45,-0.15],[-1,0.25]],   // top-left
    [[-0.2,-1],[1,-1],[1,-0.05],[0.5,0.18],[0.1,-0.1],[0.15,-0.45]],       // top-right
    [[1,-0.05],[1,1],[0.2,1],[-0.12,0.5],[0.1,-0.1],[0.5,0.18]],           // bottom-right
    [[0.2,1],[-1,1],[-1,0.25],[-0.45,-0.15],[0.1,-0.1],[-0.12,0.5]]        // bottom-left
  ];
  var PIECE_MAP = [2, 3, 0, 1];                // piece k orbits as comet PIECE_MAP[k]
  var PIECE_ROT0 = [-0.14, 0.12, 0.16, -0.11]; // twist at the burst
  var PIECE_SPIN = [-0.55, 0.5, 0.6, -0.45];   // tumble in flight, decaying

  // hairline debris specks at the shatter (secondary action)
  var SPECKS = [
    { a: -2.6, s: 0.050, l: 2.4 }, { a: -1.30, s: 0.085, l: 3.0 },
    { a: -0.7, s: 0.068, l: 2.2 }, { a: -0.15, s: 0.090, l: 3.2 },
    { a: 0.30, s: 0.075, l: 2.6 }, { a: 0.90, s: 0.080, l: 3.0 },
    { a: 1.90, s: 0.058, l: 2.4 }
  ];
  var SPECKLIFE = 340;

  function centroid(poly) {
    var x = 0, y = 0;
    for (var i = 0; i < poly.length; i++) { x += poly[i][0]; y += poly[i][1]; }
    return [x / poly.length, y / poly.length];
  }

  function bez(b, u) {
    var v = 1 - u;
    var x = v*v*v*b[0][0] + 3*v*v*u*b[1][0] + 3*v*u*u*b[2][0] + u*u*u*b[3][0];
    var y = v*v*v*b[0][1] + 3*v*v*u*b[1][1] + 3*v*u*u*b[2][1] + u*u*u*b[3][1];
    return [x, y];
  }

  function setup(canvas) {
    var ctx = canvas.getContext('2d');
    var nav = canvas.closest('nav');
    if (!ctx || !nav) return;

    var brand = nav.querySelector('.brand');
    var links = nav.querySelector('.nav-links');
    if (!brand) return;

    var reduceQuery = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false };
    var reduce = reduceQuery.matches;
    var W, Hpx, dpr, anchor, assembly, comets, pieces, active, raf = null, t0 = 0;
    var resizeTimer = null;

    function layout() {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      var r = canvas.getBoundingClientRect();
      W = r.width; Hpx = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hpx * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var br = brand.getBoundingClientRect();
      anchor = { x: br.right - r.left + 24, y: br.top - r.top + br.height / 2 };
      var maxX = (links ? links.getBoundingClientRect().left - r.left : W) - 14;
      var avail = maxX - anchor.x;
      active = avail > 70;
      var scale = Math.max(0.5, Math.min(1, avail / 130));
      var OFF = Math.max(34, 56 * scale);
      assembly = { x: anchor.x + OFF, y: anchor.y };

      // four comets on one shared spiral system, 90 degrees apart
      comets = [0, 1, 2, 3].map(function (i) {
        var spawn = SPAWN0 + i * SSTAG;
        var merge = MERGE0 + i * MSTAG;
        var R = Math.min((OFF - 12) - (3 - i) * 5, Hpx / 2 - 9, OFF - 12);
        var th0 = i * Math.PI / 2 + 0.35 + seed(i, 0) * 0.2;
        var om = (Math.PI * 2 / 2400) * (0.95 + seed(i, 1) * 0.1);
        var c = {
          spawn: spawn, merge: merge, D: merge - spawn,
          R: Math.max(R, 16), th0: th0, om: om,
          r: 3.1 * (0.9 + seed(i, 2) * 0.2) * Math.max(scale, 0.75)
        };
        c.thM = thAt(c, 1);              // impact angle for the blob ripple
        return c;
      });

      // shards: burst positions + flight beziers into each comet's orbit entry
      var cxs = anchor.x - H + H * SQX;  // crushed square center (LEFT edge pinned)
      pieces = PIECE_POLYS.map(function (poly, k) {
        var cen = centroid(poly);
        var c = comets[PIECE_MAP[k]];
        // orbit-entry point and the spiral's initial (tangential) direction there
        var ex = assembly.x + c.R * Math.cos(c.th0);
        var ey = assembly.y + c.R * FLAT * Math.sin(c.th0);
        var tx = -Math.sin(c.th0), ty = FLAT * Math.cos(c.th0);
        var tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
        var popx = cxs + cen[0] * H * 2.4;
        var popy = anchor.y + cen[1] * H * 2.4;
        return {
          ci: PIECE_MAP[k], cx: cen[0], cy: cen[1],
          sq0x: cxs + cen[0] * H * SQX, sq0y: anchor.y + cen[1] * H * SQY,
          popx: popx, popy: popy,
          b: [[popx, popy],
              [popx + 26, popy + (cen[1] < 0 ? -16 : 16)],   // arc around the docking square
              [ex - tx * 26, ey - ty * 26],                  // arrive along the orbit tangent
              [ex, ey]]
        };
      });
    }

    // spiral angle: constant base rate, gently speeding up as it falls inward
    function thAt(c, p) { return c.th0 + c.om * c.D * (p + 0.45 * p * p); }

    // position of comet at absolute cycle time t - one smooth spiral,
    // so velocity and acceleration stay continuous from handoff to merge
    function posAt(c, t) {
      if (t < c.spawn || t > c.merge) return null;
      var p = (t - c.spawn) / c.D;
      var r = c.R * Math.cos(Math.pow(p, 1.1) * Math.PI / 2);   // hold, then dive
      var th = thAt(c, p);
      return [assembly.x + r * Math.cos(th), assembly.y + r * FLAT * Math.sin(th)];
    }

    // one-piece comet: front half-ellipse head + tapered tail, single gradient fill
    function drawComet(c, t) {
      var p = posAt(c, t);
      if (!p) return;
      var prog = (t - c.spawn) / c.D;
      var shrink = 1 - smooth((prog - 0.88) / 0.12);
      var pa = clamp01((t - c.spawn) / HAND);          // quick fade-in under the shard
      if (shrink <= 0.02 || pa <= 0) return;
      var dt = 9;
      var p0 = posAt(c, Math.max(c.spawn, t - dt)) || p;
      var p1 = posAt(c, Math.min(c.merge, t + dt)) || p;
      var vx = (p1[0] - p0[0]) / (2 * dt), vy = (p1[1] - p0[1]) / (2 * dt);   // px/ms
      var sp = Math.hypot(vx, vy);
      var phi = sp > 0.002 ? Math.atan2(vy, vx) : 0;
      var k = Math.min(sp * 2.0, 0.62);                // squash factor from velocity
      var a = c.r * (1 + k) * shrink;                  // along motion
      var b = c.r / Math.sqrt(1 + k) * shrink;         // across motion
      if (a < 0.2) return;
      var T = (2 + Math.min(sp * 95, 30)) * shrink;    // tail stretches with speed
      var ca = Math.cos(phi), sa = Math.sin(phi);
      var tipX = p[0] - ca * (T + a), tipY = p[1] - sa * (T + a);
      var shx = p[0] - ca * a * 0.25, shy = p[1] - sa * a * 0.25;
      var s1x = shx + sa * b, s1y = shy - ca * b;
      var s2x = shx - sa * b, s2y = shy + ca * b;
      var c1x = lerp(s1x, tipX, 0.45) + sa * b * 0.5, c1y = lerp(s1y, tipY, 0.45) - ca * b * 0.5;
      var c2x = lerp(s2x, tipX, 0.45) - sa * b * 0.5, c2y = lerp(s2y, tipY, 0.45) + ca * b * 0.5;

      var g = ctx.createLinearGradient(p[0] + ca * a, p[1] + sa * a, tipX, tipY);
      g.addColorStop(0, 'rgba(' + INK + ',' + (0.92 * pa) + ')');
      g.addColorStop(0.45, 'rgba(' + INK + ',' + (0.5 * pa) + ')');
      g.addColorStop(1, 'rgba(' + INK + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.quadraticCurveTo(c1x, c1y, s1x, s1y);
      ctx.ellipse(p[0], p[1], a, b, phi, -Math.PI / 2, Math.PI / 2, false);
      ctx.quadraticCurveTo(c2x, c2y, tipX, tipY);
      ctx.closePath();
      ctx.fill();
    }

    function square(cx, cy, alpha) {
      if (alpha <= 0.003) return;
      ctx.strokeStyle = 'rgba(' + INK + ',' + alpha + ')'; ctx.lineWidth = 1;
      ctx.strokeRect(cx - H, cy - H, 2 * H, 2 * H);
    }

    // axis-scaled square (squash & stretch, no rotation)
    function squareS(cx, cy, sx, sy, alpha) {
      if (alpha <= 0.003) return;
      ctx.strokeStyle = 'rgba(' + INK + ',' + alpha + ')'; ctx.lineWidth = 1;
      ctx.strokeRect(cx - H * sx, cy - H * sy, 2 * H * sx, 2 * H * sy);
    }

    // A under the blow: frozen during hitstop (flash only), then a damped
    // spring crush with the LEFT edge pinned - B pushes the right face in
    function drawCrush(tc) {
      var p = clamp01((tc - CRUSH0) / SQUISH);
      var s = spring(p);
      var sx = 1 + (SQX - 1) * s, sy = 1 + (SQY - 1) * s;
      var flash = Math.exp(-(tc - IMPACT) / 70) * 0.55;         // impact flash
      var g = Math.min(1, flash + Math.pow(p, 1.7));            // glow builds to the break
      var x0 = anchor.x - H, w = 2 * H * sx;
      var y0 = anchor.y - H * sy, h = 2 * H * sy;
      ctx.save();
      if (g > 0.04) {
        ctx.shadowColor = 'rgba(' + INK + ',0.75)';
        ctx.shadowBlur = 10 * g;
        ctx.fillStyle = 'rgba(' + INK + ',' + (0.12 * g) + ')';
        ctx.fillRect(x0, y0, w, h);
      }
      ctx.strokeStyle = 'rgba(' + INK + ',' + (0.9 + 0.1 * g) + ')';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, w, h);
      ctx.restore();
    }

    // ---- shards ----------------------------------------------------------
    // state of shard k at time tc, or null when it doesn't exist
    function pieceState(k, tc) {
      var pc = pieces[k], c = comets[pc.ci];
      var arrive = c.spawn;
      if (tc < SHATTER || tc > arrive + HAND) return null;
      var st = { sx: 1, sy: 1, sc: 1, alpha: 0.95, glow: 0 };
      if (tc < FLY0) {                                  // burst: ease-out, squish relaxes
        var q = (tc - SHATTER) / POPD, e = 1 - Math.pow(1 - q, 3);
        st.x = lerp(pc.sq0x, pc.popx, e); st.y = lerp(pc.sq0y, pc.popy, e);
        st.sx = lerp(SQX, 1, e); st.sy = lerp(SQY, 1, e);
        st.rot = PIECE_ROT0[k] * e;
        st.glow = 7 * (1 - q);
      } else if (tc < arrive) {                         // flight: burst, float, catch
        var u = flyEase((tc - FLY0) / (arrive - FLY0));
        var pos = bez(pc.b, u);
        st.x = pos[0]; st.y = pos[1];
        st.rot = PIECE_ROT0[k] + PIECE_SPIN[k] * (1 - Math.pow(1 - u, 1.8));
        st.sc = lerp(1, 0.8, smooth((u - 0.6) / 0.4));
      } else {                                          // ride the spiral, fade under comet
        var hM = (tc - arrive) / HAND;
        var pp = posAt(c, tc) || pc.b[3];
        st.x = pp[0]; st.y = pp[1];
        st.rot = PIECE_ROT0[k] + PIECE_SPIN[k];
        st.sc = 0.8 * (1 - 0.6 * hM);
        st.alpha = 0.95 * (1 - hM);
      }
      return st;
    }

    function drawPieceShape(k, st, mul) {
      var a = st.alpha * mul;
      if (a <= 0.004 || st.sc <= 0.02) return;
      var pc = pieces[k];
      ctx.save();
      ctx.translate(st.x, st.y); ctx.rotate(st.rot); ctx.scale(st.sx * st.sc, st.sy * st.sc);
      if (st.glow > 0.5 && mul === 1) {
        ctx.shadowColor = 'rgba(' + INK + ',0.7)'; ctx.shadowBlur = st.glow;
      }
      ctx.strokeStyle = 'rgba(' + INK + ',' + a + ')';
      ctx.lineWidth = 1 / st.sc;
      ctx.beginPath();
      var poly = PIECE_POLYS[k];
      for (var j = 0; j < poly.length; j++) {
        var px = (poly[j][0] - pc.cx) * H, py = (poly[j][1] - pc.cy) * H;
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }

    function drawPiece(k, tc) {
      var st = pieceState(k, tc);
      if (!st) return;
      // smear ghost: a faint copy trailing 42ms behind while the shard is fast
      if (tc - 42 >= SHATTER && tc < comets[pieces[k].ci].spawn) {
        var gst = pieceState(k, tc - 42);
        if (gst) { gst.glow = 0; drawPieceShape(k, gst, 0.2); }
      }
      drawPieceShape(k, st, 1);
    }

    // hairline debris specks bursting from the crush point (secondary action)
    function drawSpecks(tc) {
      var dt = tc - SHATTER;
      if (dt < 0 || dt > SPECKLIFE) return;
      var q = dt / SPECKLIFE;
      var decel = 1 - (1 - q) * (1 - q);
      var a = 0.65 * (1 - q);
      var cxs = anchor.x - H + H * SQX;
      ctx.strokeStyle = 'rgba(' + INK + ',' + a + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 0; i < SPECKS.length; i++) {
        var s = SPECKS[i];
        var d = s.s * SPECKLIFE * decel;
        var x = cxs + Math.cos(s.a) * d;
        var y = anchor.y + Math.sin(s.a) * d * 0.8 + 14 * q * q;   // a touch of gravity
        var ln = s.l * (1 - 0.5 * q);
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.cos(s.a) * ln, y - Math.sin(s.a) * ln * 0.8);
      }
      ctx.stroke();
    }

    // decaying sprite shake on the whole mark at impact + shatter
    function shakeAt(tc) {
      var ax = 0;
      if (tc >= IMPACT) ax += 1.7 * Math.exp(-(tc - IMPACT) / 60);
      if (tc >= SHATTER) ax += 1.1 * Math.exp(-(tc - SHATTER) / 50);
      if (ax < 0.04) return null;
      return [ax * Math.sin(tc * 0.55), 0.6 * ax * Math.sin(tc * 0.83 + 1.7)];
    }

    // the blob, sampled in polar form; ripples ring at each impact angle,
    // and the whole closed shape lerps to the square's polar function by m
    function drawBlob(tc, m) {
      var absorbed = 0, bumps = [];
      for (var i = 0; i < 4; i++) {
        var c = comets[i];
        var aStart = c.spawn + 0.88 * c.D;
        var s = smooth((tc - aStart) / (c.merge - aStart));
        absorbed += s;
        if (s > 0) {
          var dt = tc - aStart;
          bumps.push({ th: c.thM, amp: 0.42 * Math.exp(-dt / 280) * Math.cos(dt / 70) });
        }
      }
      if (absorbed <= 0.01 && m <= 0) return;
      var R = RBLOB * Math.sqrt(absorbed);
      var breathe = 1 + 0.025 * Math.sin(tc / 290) * (1 - m);

      ctx.beginPath();
      for (var k = 0; k <= SAMPLES; k++) {
        var th = (k % SAMPLES) / SAMPLES * Math.PI * 2;
        var rip = 0;
        for (var j = 0; j < bumps.length; j++) {
          var d = Math.atan2(Math.sin(th - bumps[j].th), Math.cos(th - bumps[j].th));
          rip += bumps[j].amp * Math.exp(-(d * d) / 0.6);
        }
        var rFluid = R * breathe * (1 + rip * (1 - m));
        var rSquare = H / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th)));
        var r = lerp(rFluid, rSquare, m);
        var x = assembly.x + r * Math.cos(th), y = assembly.y + r * Math.sin(th);
        k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      var rectW = smooth((m - 0.8) / 0.2);             // crossfade to the crisp square
      var fill = 0.5 * Math.min(1, absorbed) * (1 - m);
      if (fill > 0.004) { ctx.fillStyle = 'rgba(' + INK + ',' + fill + ')'; ctx.fill(); }
      ctx.strokeStyle = 'rgba(' + INK + ',' + (lerp(0.72, 0.9, m) * (1 - rectW)) + ')';
      ctx.lineJoin = 'round'; ctx.lineWidth = 1; ctx.stroke();
      square(assembly.x, assembly.y, 0.9 * rectW);
    }

    function render(now) {
      if (document.hidden) {
        stop();
        return;
      }

      var tc = (now - t0) % CYCLE;
      ctx.clearRect(0, 0, W, Hpx);
      var sh = shakeAt(tc);
      if (sh) { ctx.save(); ctx.translate(sh[0], sh[1]); }

      // ---- blob + comets (under the squares and shards) ----
      var m = easeInOut(clamp01((tc - MORPH0) / MORPH));
      drawBlob(tc, m);
      for (var i = 0; i < 4; i++) drawComet(comets[i], tc);

      // ---- square A (resident): rests, hitstop, spring crush, shatters ----
      if (tc < IMPACT) {
        square(anchor.x, anchor.y, 0.9);
      } else if (tc < SHATTER) {
        drawCrush(tc);
      }

      // ---- square B (fresh): anticipate -> launch -> hitstop -> follow A's
      //      giving face -> back-ease into the slot ----
      var contact = anchor.x + 2 * H;                  // edges touching, A relaxed
      var followX = anchor.x + 2 * H * SQX;            // pressed into the crushed face
      if (tc < WIND0) {
        square(assembly.x, assembly.y, 0.9);
      } else if (tc < APP0) {                          // anticipation: small pull-back
        square(assembly.x + 3.5 * smooth((tc - WIND0) / (APP0 - WIND0)), anchor.y, 0.9);
      } else if (tc < IMPACT) {                        // launch: ease-in + velocity stretch
        var u = (tc - APP0) / APP;
        var k = 0.12 * u * u;
        squareS(lerp(assembly.x + 3.5, contact, u * u), anchor.y, 1 + k, 1 / (1 + k), 0.9);
      } else if (tc < CRUSH0) {                        // hitstop: impact squash, frozen
        var hp = (tc - IMPACT) / HITSTOP;
        var sxB = 0.9 + 0.1 * hp;
        squareS(contact - H + H * sxB, anchor.y, sxB, 1 / sxB, 0.9);
      } else if (tc < SHATTER) {                       // follow-through on the spring
        var sA = 1 + (SQX - 1) * spring((tc - CRUSH0) / SQUISH);
        square(anchor.x + 2 * H * sA, anchor.y, 0.9);
      } else if (tc < DOCK0) {
        square(followX, anchor.y, 0.9);
      } else if (tc < DOCK0 + DOCK) {                  // dock: overshoot and settle
        var v = backOut(clamp01((tc - DOCK0) / DOCK));
        square(lerp(followX, anchor.x, v), anchor.y, 0.9);
      } else {
        square(anchor.x, anchor.y, 0.9);               // resident until next relief
      }

      // ---- shards + debris (on top) ----
      drawSpecks(tc);
      for (var p = 0; p < 4; p++) drawPiece(p, tc);

      if (sh) ctx.restore();
      raf = requestAnimationFrame(render);
    }

    function stop() {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    }

    function staticDraw() {
      // settled / reduced-motion: just the resting mark beside the wordmark
      ctx.clearRect(0, 0, W, Hpx);
      square(anchor.x, anchor.y, 0.9);
    }

    function start() {
      layout();
      stop();
      if (!active) { staticDraw(); return; }
      if (reduce) { staticDraw(); return; }
      t0 = performance.now();
      raf = requestAnimationFrame(render);
    }

    start();
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(start, 150);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });

    if (reduceQuery.addEventListener) {
      reduceQuery.addEventListener('change', function (event) {
        reduce = event.matches;
        start();
      });
    } else if (reduceQuery.addListener) {
      reduceQuery.addListener(function (event) {
        reduce = event.matches;
        start();
      });
    }
  }

  function init() { document.querySelectorAll('canvas.nav-mark').forEach(setup); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
