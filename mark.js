// Orbit-and-relieve cycle for the nav band.
// A square beside the wordmark gets replaced by a fresh square formed from
// orbiting comet shapes. The motion loops, replays on hover, respects reduced
// motion, and pauses while the tab is hidden.
(function () {
  var INK = '242,242,240';
  var HALF = 8;
  var SAMPLES = 96;
  var RBLOB = 3.55;
  var FLAT = 0.42;

  var APP0 = 350;
  var APP = 500;
  var IMPACT = APP0 + APP;
  var FALL = 520;
  var DOCK0 = 1100;
  var DOCK = 400;
  var SPAWN0 = 1450;
  var SSTAG = 110;
  var MERGE0 = 3600;
  var MSTAG = 130;
  var MORPH0 = 4150;
  var MORPH = 650;
  var CYCLE = MORPH0 + MORPH;

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  function smooth(x) {
    x = clamp01(x);
    return x * x * (3 - 2 * x);
  }

  function seed(i, salt) {
    var n = Math.sin((i + 1) * 12.9898 + (salt + 1) * 78.233) * 43758.5453;
    return n - Math.floor(n);
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
    var W;
    var Hpx;
    var dpr;
    var anchor;
    var assembly;
    var comets;
    var active;
    var raf = null;
    var t0 = 0;
    var resizeTimer = null;

    function layout() {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      var r = canvas.getBoundingClientRect();
      W = r.width;
      Hpx = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(Hpx * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var br = brand.getBoundingClientRect();
      anchor = {
        x: br.right - r.left + 24,
        y: br.top - r.top + br.height / 2
      };

      var maxX = (links ? links.getBoundingClientRect().left - r.left : W) - 14;
      var avail = maxX - anchor.x;
      active = avail > 70;

      var scale = Math.max(0.5, Math.min(1, avail / 130));
      var offset = Math.max(34, 56 * scale);
      assembly = { x: anchor.x + offset, y: anchor.y };

      comets = [0, 1, 2, 3].map(function (i) {
        var spawn = SPAWN0 + i * SSTAG;
        var merge = MERGE0 + i * MSTAG;
        var radius = Math.min((offset - 12) - (3 - i) * 5, Hpx / 2 - 9, offset - 12);
        var c = {
          spawn: spawn,
          merge: merge,
          duration: merge - spawn,
          radius: Math.max(radius, 16),
          angle0: i * Math.PI / 2 + 0.35 + seed(i, 0) * 0.2,
          omega: (Math.PI * 2 / 2400) * (0.95 + seed(i, 1) * 0.1),
          size: 3.1 * (0.9 + seed(i, 2) * 0.2) * Math.max(scale, 0.75)
        };
        c.impactAngle = thetaAt(c, 1);
        return c;
      });
    }

    function thetaAt(c, p) {
      return c.angle0 + c.omega * c.duration * (p + 0.45 * p * p);
    }

    function posAt(c, t) {
      if (t < c.spawn || t > c.merge) return null;
      var p = (t - c.spawn) / c.duration;
      var radius = c.radius * Math.cos(Math.pow(p, 1.1) * Math.PI / 2);
      var theta = thetaAt(c, p);
      return [
        assembly.x + radius * Math.cos(theta),
        assembly.y + radius * FLAT * Math.sin(theta)
      ];
    }

    function drawComet(c, t) {
      var p = posAt(c, t);
      if (!p) return;

      var progress = (t - c.spawn) / c.duration;
      var shrink = 1 - smooth((progress - 0.88) / 0.12);
      var appear = clamp01((t - c.spawn) / 350);
      if (shrink <= 0.02 || appear <= 0) return;

      var dt = 9;
      var p0 = posAt(c, Math.max(c.spawn, t - dt)) || p;
      var p1 = posAt(c, Math.min(c.merge, t + dt)) || p;
      var vx = (p1[0] - p0[0]) / (2 * dt);
      var vy = (p1[1] - p0[1]) / (2 * dt);
      var speed = Math.hypot(vx, vy);
      var phi = speed > 0.002 ? Math.atan2(vy, vx) : 0;
      var squash = Math.min(speed * 2, 0.62);
      var along = c.size * (1 + squash) * shrink;
      var across = c.size / Math.sqrt(1 + squash) * shrink;
      if (along < 0.2) return;

      var tail = (2 + Math.min(speed * 95, 30)) * shrink;
      var ca = Math.cos(phi);
      var sa = Math.sin(phi);
      var tipX = p[0] - ca * (tail + along);
      var tipY = p[1] - sa * (tail + along);
      var shoulderX = p[0] - ca * along * 0.25;
      var shoulderY = p[1] - sa * along * 0.25;
      var s1x = shoulderX + sa * across;
      var s1y = shoulderY - ca * across;
      var s2x = shoulderX - sa * across;
      var s2y = shoulderY + ca * across;
      var c1x = lerp(s1x, tipX, 0.45) + sa * across * 0.5;
      var c1y = lerp(s1y, tipY, 0.45) - ca * across * 0.5;
      var c2x = lerp(s2x, tipX, 0.45) - sa * across * 0.5;
      var c2y = lerp(s2y, tipY, 0.45) + ca * across * 0.5;

      var gradient = ctx.createLinearGradient(p[0] + ca * along, p[1] + sa * along, tipX, tipY);
      gradient.addColorStop(0, 'rgba(' + INK + ',' + (0.92 * appear) + ')');
      gradient.addColorStop(0.45, 'rgba(' + INK + ',' + (0.5 * appear) + ')');
      gradient.addColorStop(1, 'rgba(' + INK + ',0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.quadraticCurveTo(c1x, c1y, s1x, s1y);
      ctx.ellipse(p[0], p[1], along, across, phi, -Math.PI / 2, Math.PI / 2, false);
      ctx.quadraticCurveTo(c2x, c2y, tipX, tipY);
      ctx.closePath();
      ctx.fill();
    }

    function square(cx, cy, alpha) {
      if (alpha <= 0.003) return;
      ctx.strokeStyle = 'rgba(' + INK + ',' + alpha + ')';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - HALF, cy - HALF, 2 * HALF, 2 * HALF);
    }

    function drawBlob(tc, morph) {
      var absorbed = 0;
      var bumps = [];

      for (var i = 0; i < comets.length; i++) {
        var c = comets[i];
        var absorbStart = c.spawn + 0.88 * c.duration;
        var amount = smooth((tc - absorbStart) / (c.merge - absorbStart));
        absorbed += amount;
        if (amount > 0) {
          var elapsed = tc - absorbStart;
          bumps.push({
            theta: c.impactAngle,
            amp: 0.42 * Math.exp(-elapsed / 280) * Math.cos(elapsed / 70)
          });
        }
      }

      if (absorbed <= 0.01 && morph <= 0) return;

      var baseRadius = RBLOB * Math.sqrt(absorbed);
      var breathe = 1 + 0.025 * Math.sin(tc / 290) * (1 - morph);

      ctx.beginPath();
      for (var k = 0; k <= SAMPLES; k++) {
        var theta = (k % SAMPLES) / SAMPLES * Math.PI * 2;
        var ripple = 0;
        for (var j = 0; j < bumps.length; j++) {
          var delta = Math.atan2(Math.sin(theta - bumps[j].theta), Math.cos(theta - bumps[j].theta));
          ripple += bumps[j].amp * Math.exp(-(delta * delta) / 0.6);
        }

        var fluidRadius = baseRadius * breathe * (1 + ripple * (1 - morph));
        var squareRadius = HALF / Math.max(Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta)));
        var radius = lerp(fluidRadius, squareRadius, morph);
        var x = assembly.x + radius * Math.cos(theta);
        var y = assembly.y + radius * Math.sin(theta);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.closePath();
      var crisp = smooth((morph - 0.8) / 0.2);
      var fillAlpha = 0.5 * Math.min(1, absorbed) * (1 - morph);
      if (fillAlpha > 0.004) {
        ctx.fillStyle = 'rgba(' + INK + ',' + fillAlpha + ')';
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(' + INK + ',' + (lerp(0.72, 0.9, morph) * (1 - crisp)) + ')';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 1;
      ctx.stroke();
      square(assembly.x, assembly.y, 0.9 * crisp);
    }

    function render(now) {
      if (document.hidden) {
        stop();
        return;
      }

      var tc = (now - t0) % CYCLE;
      ctx.clearRect(0, 0, W, Hpx);

      var morph = easeInOut(clamp01((tc - MORPH0) / MORPH));
      drawBlob(tc, morph);
      for (var i = 0; i < comets.length; i++) drawComet(comets[i], tc);

      if (tc < IMPACT) {
        square(anchor.x, anchor.y, 0.9);
      } else if (tc < IMPACT + FALL) {
        var q = (tc - IMPACT) / FALL;
        var ax = anchor.x - 16 * q;
        var ay = anchor.y + 78 * q * q;
        var alpha = 0.9 * (1 - smooth((q - 0.5) / 0.5));
        if (alpha > 0.003) {
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(-0.55 * q);
          ctx.strokeStyle = 'rgba(' + INK + ',' + alpha + ')';
          ctx.lineWidth = 1;
          ctx.strokeRect(-HALF, -HALF, 2 * HALF, 2 * HALF);
          ctx.restore();
        }
      }

      var contact = anchor.x + 2 * HALF;
      if (tc < APP0) {
        square(assembly.x, assembly.y, 0.9);
      } else if (tc < IMPACT) {
        var u = (tc - APP0) / APP;
        square(lerp(assembly.x, contact, u * u), anchor.y, 0.9);
      } else if (tc < DOCK0) {
        square(contact, anchor.y, 0.9);
      } else if (tc < DOCK0 + DOCK) {
        var v = easeInOut((tc - DOCK0) / DOCK);
        square(lerp(contact, anchor.x, v), anchor.y, 0.9);
      } else {
        square(anchor.x, anchor.y, 0.9);
      }

      raf = requestAnimationFrame(render);
    }

    function stop() {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    }

    function staticDraw() {
      ctx.clearRect(0, 0, W, Hpx);
      square(anchor.x, anchor.y, 0.9);
    }

    function start() {
      layout();
      stop();
      if (!active || reduce) {
        staticDraw();
        return;
      }
      t0 = performance.now();
      raf = requestAnimationFrame(render);
    }

    start();
    nav.addEventListener('mouseenter', start);
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

  function init() {
    document.querySelectorAll('canvas.nav-mark').forEach(setup);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
