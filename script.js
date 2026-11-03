(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

  const card = $('#card');
  const tilt = $('.tilt');
  const hint = $('#hint');
  const polaroids = document.querySelectorAll('.polaroid');
  // photo viewer (built here so the HTML doesn't need to contain it)
  let lightbox = $('#lightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.id = 'lightbox';
    lightbox.hidden = true;
    lightbox.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure>';
    document.body.append(lightbox);
  }
  const lbImg = $('img', lightbox);
  const lbCap = $('figcaption', lightbox);
  const message = $('#message');
  const soundBtn = $('#sound');
  const sky = $('#sky');

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vertical = matchMedia('(max-width: 700px) and (orientation: portrait)');
  const PARTY = ['#f47fa4', '#f2c14e', '#4fc3c7', '#ff8a65', '#b39ddb', '#7bd389', '#ffffff'];

  let isOpen = false;
  let celebrateTimer = 0;
  let closingTimer = 0;

  /* ---------------------------------------------------------
     Decorations
     --------------------------------------------------------- */
  function makeSparkles() {
    const box = $('.cover-front .sparkles');
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('i');
      s.className = 'sparkle';
      s.style.cssText =
        `--x:${rand(2, 94)}%;--y:${rand(2, 95)}%;--s:${rand(1.6, 3.6).toFixed(1)};` +
        `--t:${rand(2.2, 4.5).toFixed(2)}s;--d:${(-rand(4)).toFixed(2)}s`;
      box.append(s);
    }
  }

  function makeBokeh() {
    const box = $('.bokeh');
    const tints = ['255,200,120', '255,140,180', '120,220,230', '200,170,255', '255,230,170'];
    for (let i = 0; i < 18; i++) {
      const b = document.createElement('i');
      b.style.cssText =
        `--x:${rand(100)}%;--y:${rand(100)}%;--s:${rand(60, 240) | 0}px;` +
        `--c:rgba(${tints[i % tints.length]},.6);--o:${rand(.2, .6).toFixed(2)};` +
        `--t:${rand(8, 18).toFixed(1)}s;--d:${(-rand(10)).toFixed(1)}s;` +
        `--dx:${rand(-70, 70) | 0}px;--dy:${rand(-70, 70) | 0}px`;
      box.append(b);
    }
  }

  /* ---------------------------------------------------------
     Sound (synthesised, no files needed)
     --------------------------------------------------------- */
  let ac = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('card-muted') === '1'; } catch (_) { /* ignore */ }

  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 1;
      const comp = ac.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function noise() {
    if (!noiseBuf) {
      const len = ac.sampleRate * 1.5;
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  function paperRustle() {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const src = noise();
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1600, t);
    bp.frequency.linearRampToValueAtTime(3400, t + 0.6);
    bp.Q.value = 0.7;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 16; i++) {
      g.gain.linearRampToValueAtTime((0.08 + rand(0.22)) * (1 - i / 18), t + i * 0.04 + rand(0.02));
    }
    g.gain.linearRampToValueAtTime(0, t + 0.8);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.85);
  }

  function popSound() {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const src = noise();
    const hp = a.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g = a.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(hp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.15);

    const o = a.createOscillator();
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.1);
    const og = a.createGain();
    og.gain.setValueAtTime(0.45, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(og).connect(master);
    o.start(t);
    o.stop(t + 0.15);
  }

  function setMuted(m) {
    muted = m;
    soundBtn.textContent = m ? '🔇' : '🔊';
    soundBtn.setAttribute('aria-label', m ? 'Unmute sounds' : 'Mute sounds');
    if (master) master.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.05);
    try { localStorage.setItem('card-muted', m ? '1' : '0'); } catch (_) { /* ignore */ }
  }

  /* ---------------------------------------------------------
     Confetti
     --------------------------------------------------------- */
  const canvas = $('#confetti');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  let parts = [];
  let running = false;
  let rainUntil = 0;
  let last = 0;

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function particle(x, y, vx, vy, colors = PARTY) {
    const r = Math.random();
    return {
      x, y, vx, vy,
      w: rand(6, 11), h: rand(4, 8),
      c: colors[(Math.random() * colors.length) | 0],
      rot: rand(Math.PI * 2), vr: rand(-.25, .25),
      ph: rand(Math.PI * 2), vp: rand(.06, .16),
      term: rand(1.8, 3.6),
      shape: r < .25 ? 'circle' : r < .4 ? 'ribbon' : 'rect',
    };
  }

  function burst(x, y, { count = 100, speed = 12, angle = -Math.PI / 2, spread = Math.PI * 2, colors } = {}) {
    if (reduceMotion) count = Math.round(count / 4);
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - .5) * spread;
      const v = speed * rand(.35, 1);
      parts.push(particle(x, y, Math.cos(a) * v, Math.sin(a) * v, colors));
    }
    start();
  }

  function rain(ms) {
    if (reduceMotion) return;
    rainUntil = performance.now() + ms;
    start();
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }

  function tick(now) {
    const dt = Math.min((now - last) / 16.67, 3);
    last = now;
    ctx.clearRect(0, 0, W, H);

    if (now < rainUntil) {
      for (let k = 0; k < 3; k++) parts.push(particle(rand(W), -20, rand(-1, 1), rand(1, 3)));
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy = Math.min(p.vy + .2 * dt, p.term);
      p.vx *= Math.pow(.975, dt);
      p.ph += p.vp * dt;
      p.x += (p.vx + Math.sin(p.ph) * .7) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > H + 40 || p.x < -60 || p.x > W + 60) { parts.splice(i, 1); continue; }

      const flip = Math.cos(p.ph * 1.4);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, flip);
      ctx.fillStyle = p.c;
      ctx.globalAlpha = .75 + .25 * Math.abs(flip);
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.h / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'ribbon') {
        ctx.fillRect(-p.w * .2, -p.h * 1.3, p.w * .4, p.h * 2.6);
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }

    if (parts.length || now < rainUntil) {
      requestAnimationFrame(tick);
    } else {
      running = false;
      ctx.clearRect(0, 0, W, H);
    }
  }

  /* ---------------------------------------------------------
     Floating balloons (tap to pop!)
     --------------------------------------------------------- */
  const BALLOONS = ['#f47fa4', '#f2c14e', '#4fc3c7', '#ff8a65', '#b39ddb', '#7bd389', '#e85d75'];

  function releaseBalloons(n) {
    if (reduceMotion) return;
    for (let i = 0; i < n; i++) {
      const c = BALLOONS[i % BALLOONS.length];
      const wrap = document.createElement('div');
      wrap.className = 'rise';
      wrap.style.cssText =
        `--x:${rand(2, 90)}%;--bw:${rand(46, 86) | 0}px;--c:${c};` +
        `--t:${rand(7, 12).toFixed(1)}s;--d:${rand(2.2).toFixed(2)}s;--sw:${rand(2.2, 4).toFixed(1)}s`;
      wrap.innerHTML = '<div class="balloon"><b></b><i></i></div>';
      const body = wrap.querySelector('b');
      body.addEventListener('pointerdown', () => popBalloon(wrap, body, c), { once: true });
      wrap.addEventListener('animationend', (e) => { if (e.target === wrap) wrap.remove(); });
      sky.append(wrap);
    }
  }

  function popBalloon(wrap, body, color) {
    const r = body.getBoundingClientRect();
    wrap.classList.add('popped');
    popSound();
    burst(r.left + r.width / 2, r.top + r.height / 2, { count: 28, speed: 7, colors: [color, '#ffffff', '#f2c14e'] });
    setTimeout(() => wrap.remove(), 750);
  }

  /* ---------------------------------------------------------
     Card
     --------------------------------------------------------- */
  function updateHint() {
    hint.textContent = isOpen
      ? 'Tap a photo to enlarge it\n' + (vertical.matches ? 'Tap the top page to close' : 'Tap the left page to close')
      : 'Tap the card to open';
  }

  function celebrate() {
    burst(0, H, { count: 110, speed: 24, angle: -Math.PI / 3, spread: .7 });
    burst(W, H, { count: 110, speed: 24, angle: -Math.PI * 2 / 3, spread: .7 });
    rain(2600);
    releaseBalloons(W < 600 ? 9 : 14);
  }

  function openCard({ quiet = false } = {}) {
    if (isOpen) return;
    isOpen = true;
    clearTimeout(closingTimer);
    card.classList.remove('closing');
    card.classList.add('open');
    card.setAttribute('aria-pressed', 'true');
    card.setAttribute('aria-label', 'Birthday card for Ania, open. Press to close.');
    polaroids.forEach((p) => { p.tabIndex = 0; });
    updateHint();
    if (quiet) return;
    paperRustle();
    clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(celebrate, 700);
  }

  function closeCard() {
    if (!isOpen) return;
    isOpen = false;
    clearTimeout(celebrateTimer);
    card.classList.remove('open');
    card.classList.add('closing');
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('aria-label', 'Birthday card for Ania. Press to open.');
    polaroids.forEach((p) => { p.tabIndex = -1; });
    updateHint();
    paperRustle();
    closingTimer = setTimeout(() => card.classList.remove('closing'), 1450);
  }

  /* ---------------------------------------------------------
     Photo viewer
     --------------------------------------------------------- */
  let lightboxTimer = 0;

  function showPhoto(fig) {
    const img = $('img', fig);
    clearTimeout(lightboxTimer);
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = $('figcaption', fig).textContent.trim();
    lightbox.hidden = false;
    void lightbox.offsetWidth; // apply the hidden state first so the fade-in runs
    lightbox.classList.add('show');
  }

  function hidePhoto() {
    if (lightbox.hidden) return;
    lightbox.classList.remove('show');
    clearTimeout(lightboxTimer);
    lightboxTimer = setTimeout(() => { lightbox.hidden = true; }, 260);
  }

  polaroids.forEach((p) => {
    p.tabIndex = -1;
    p.setAttribute('role', 'button');
    p.setAttribute('aria-label', 'View photo: ' + $('img', p).alt);
    p.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showPhoto(p);
      }
    });
  });

  lightbox.addEventListener('click', hidePhoto);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePhoto(); });

  card.addEventListener('click', (e) => {
    const photo = e.target.closest('.polaroid');
    if (!isOpen) openCard();
    else if (photo) showPhoto(photo);
    else if (e.target.closest('.cover-back')) closeCard();
  });

  card.addEventListener('keydown', (e) => {
    if (e.target !== card) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      isOpen ? closeCard() : openCard();
    }
  });

  soundBtn.addEventListener('click', () => setMuted(!muted));

  /* ---------------------------------------------------------
     Gentle 3D tilt following the mouse
     --------------------------------------------------------- */
  if (!reduceMotion && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    addEventListener('pointermove', (e) => {
      const nx = e.clientX / innerWidth - .5;
      const ny = e.clientY / innerHeight - .5;
      const k = isOpen ? 6 : 14;
      tilt.style.setProperty('--ry', (nx * k).toFixed(2) + 'deg');
      tilt.style.setProperty('--rx', (-ny * k).toFixed(2) + 'deg');
    });
    document.documentElement.addEventListener('pointerleave', () => {
      tilt.style.setProperty('--ry', '0deg');
      tilt.style.setProperty('--rx', '0deg');
    });
  }

  /* ---------------------------------------------------------
     Shrink long messages so they always fit on the page
     --------------------------------------------------------- */
  function fitMessage() {
    message.style.fontSize = '';
    let size = parseFloat(getComputedStyle(message).fontSize);
    let guard = 0;
    while (message.scrollHeight > message.clientHeight + 1 && size > 11 && guard++ < 60) {
      size *= .95;
      message.style.fontSize = size + 'px';
    }
  }

  let resizeTimer = 0;
  addEventListener('resize', () => {
    sizeCanvas();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { fitMessage(); updateHint(); }, 120);
  });

  /* ---------------------------------------------------------
     Init
     --------------------------------------------------------- */
  makeSparkles();
  makeBokeh();
  sizeCanvas();
  setMuted(muted);
  fitMessage();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitMessage);

  // Share a link ending in #open to show the card already open (no sound).
  if (location.hash === '#open') openCard({ quiet: true });
})();
