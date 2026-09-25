/* =========================================================
   Camila & Carlos — Una sorpresa
   JavaScript puro · sin dependencias
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Utilidades ---------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motionQuery.matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  const vibrate = (pattern) => {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) { /* iOS no vibra */ }
  };

  const show = (el) => el && el.classList.add('is-in');
  const hide = (el) => el && el.classList.remove('is-in');

  // Cada "sesión" es una reproducción completa. Al reiniciar, las esperas
  // pendientes de la sesión anterior se cancelan solas.
  const CANCELLED = Symbol('cancelled');
  let session = 0;

  const wait = (ms) => {
    const id = session;
    return new Promise((resolve, reject) => {
      setTimeout(() => (id === session ? resolve() : reject(CANCELLED)), ms);
    });
  };

  const run = (fn) =>
    Promise.resolve()
      .then(fn)
      .catch((err) => { if (err !== CANCELLED) console.error(err); });

  const themeMeta = $('meta[name="theme-color"]');
  const setTheme = (color) => { if (themeMeta) themeMeta.setAttribute('content', color); };
  const THEME_NEUTRAL = '#f6efe4';
  const THEME_BOY = '#d9ecf9';

  const state = { bet: null, audioUnlocked: false, muted: false };

  /* ---------- Imagen: respaldo si falta el archivo ---------- */

  const PLACEHOLDER =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
      '<defs><radialGradient id="g" cx="50%" cy="45%" r="65%">' +
      '<stop offset="0" stop-color="#8d6c46"/><stop offset="1" stop-color="#1d140b"/>' +
      '</radialGradient></defs>' +
      '<rect width="800" height="600" fill="url(#g)"/>' +
      '<text x="400" y="310" text-anchor="middle" font-family="Georgia,serif" font-size="28" ' +
      'fill="#ead7b6" opacity=".7">assets/eco-dante.png</text></svg>'
    );

  const useFallback = (img) => {
    if (img.dataset.fallback) return;
    img.dataset.fallback = '1';
    img.src = PLACEHOLDER;
  };

  $$('img[data-eco]').forEach((img) => {
    img.addEventListener('error', () => useFallback(img));
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) useFallback(img);
  });

  const imgReady = (img) =>
    img.complete && img.naturalWidth
      ? Promise.resolve()
      : new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          setTimeout(resolve, 5000); // nunca bloquear la experiencia
        });

  /* ---------- Efectos de sonido 8-bit (Web Audio, sin archivos) ---------- */

  const sfx = (() => {
    let ctx = null;
    let master = null;

    const unlock = () => {
      // iOS 17+: que el audio web suene aunque el iPhone esté en modo silencio
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) { /* no soportado */ }
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.5;
          master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
      } catch (_) { /* sin Web Audio */ }
    };

    // iOS "interrumpe" el audio web al arrancar la música y solo deja
    // reanudarlo dentro de un gesto real (al levantar el dedo o en un click)
    const resume = () => {
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
    };
    document.addEventListener('touchend', resume, { passive: true });
    document.addEventListener('click', resume);

    const play = (fn) => {
      if (!ctx || state.muted) return;
      if (ctx.state === 'suspended') ctx.resume();
      try { fn(ctx.currentTime); } catch (_) { /* nunca romper la experiencia por un sonido */ }
    };

    const tone = (t, freq, dur, { type = 'square', vol = 0.1, to = null } = {}) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.02);
    };

    // Decodifica un archivo de audio para reproducirlo por Web Audio
    const load = (url) => {
      if (!ctx || !window.fetch) return Promise.reject(new Error('sin Web Audio'));
      return fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        // Forma con callbacks: Safari antiguo no devuelve una promesa
        .then((data) => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)));
    };

    // Reproduce un buffer en loop; devuelve controles para velocidad y parada
    const loopBuffer = (buffer) => {
      if (!ctx || state.muted) return null;
      if (ctx.state === 'suspended') ctx.resume();
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = buffer;
      src.loop = true;
      g.gain.value = 1;
      src.connect(g);
      g.connect(ctx.destination);
      src.start(0);
      return {
        rate(v) { src.playbackRate.setTargetAtTime(v, ctx.currentTime, 0.05); },
        stop() {
          const t = ctx.currentTime;
          g.gain.setTargetAtTime(0, t, 0.05);
          src.stop(t + 0.25);
        },
      };
    };

    return {
      unlock,
      resume,
      state: () => (ctx ? ctx.state : 'sin contexto'),
      load,
      loopBuffer,
      success: () => play((t) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.08, f, 0.12, { vol: 0.08 }))),
      win: () => play((t) => [784, 988, 1175, 1568].forEach((f, i) => tone(t + i * 0.1, f, i === 3 ? 0.4 : 0.12, { vol: 0.08 }))),
      fail: () => play((t) => tone(t, 220, 0.28, { type: 'sawtooth', vol: 0.06, to: 110 })),
      pop: () => play((t) => tone(t, 700, 0.12, { type: 'sine', vol: 0.14, to: 180 })),
      coin: () => play((t) => { tone(t, 988, 0.08, { vol: 0.07 }); tone(t + 0.08, 1319, 0.3, { vol: 0.07 }); }),
      tick: () => play((t) => tone(t, 880, 0.09, { type: 'sine', vol: 0.12 })),
      meow: () => play((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(520, t);
        o.frequency.linearRampToValueAtTime(880, t + 0.12);
        o.frequency.exponentialRampToValueAtTime(460, t + 0.45);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + 0.5);
      }),
    };
  })();

  /* ---------- Música y latidos ---------- */

  const music = (() => {
    const audio = $('#music');
    const beat = $('#heartbeat');
    const btn = $('#soundToggle');
    let available = true;
    let started = false;
    let fadeRaf = 0;
    let base = 0.7;

    audio.addEventListener('error', () => {
      available = false;
      btn.hidden = true;
    });

    const fadeTo = (target, ms) => {
      cancelAnimationFrame(fadeRaf);
      const from = audio.volume;
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        try { audio.volume = from + (target - from) * k; } catch (_) { /* iOS: volumen de solo lectura */ }
        if (k < 1) fadeRaf = requestAnimationFrame(step);
      };
      fadeRaf = requestAnimationFrame(step);
    };

    // Debe llamarse dentro del gesto del usuario (Safari / Chrome)
    const start = () => {
      if (state.audioUnlocked) return;
      state.audioUnlocked = true;
      sfx.unlock();

      // iOS solo deja sonar más tarde un <audio> cuyo play() se llamó CON volumen
      // dentro de un toque (hacerlo silenciado no cuenta). Se pausa al instante,
      // antes de que llegue a sonar.
      try {
        beat.muted = false;
        const unlocking = beat.play();
        beat.pause();
        if (unlocking && unlocking.catch) unlocking.catch(() => {});
      } catch (_) { /* navegador sin soporte */ }

      // Respaldo por Web Audio, por si el <audio> fuera rechazado
      sfx.load(beat.getAttribute('src'))
        .then((buffer) => { beatBuffer = buffer; })
        .catch((err) => { beatBuffer = null; debugInfo.loadError = String(err); });

      if (!available) return;
      try { audio.volume = 0; } catch (_) { /* iOS */ }
      const playing = audio.play();
      if (playing && typeof playing.then === 'function') {
        playing
          .then(() => { started = true; btn.hidden = false; fadeTo(base, 3000); })
          .catch(() => { btn.hidden = true; });
      } else {
        started = true;
        btn.hidden = false;
      }
    };

    // Baja la música mientras suenan los latidos
    const duck = (on) => { if (started) fadeTo(on ? 0.15 : base, 600); };

    let beatBuffer = null;
    let beatVoice = null;
    let holding = false;
    const debugInfo = { playError: '', loadError: '', mode: '' };

    const heartbeat = {
      // Primero el <audio> (suena aunque el iPhone esté en silencio);
      // si el navegador lo rechaza, el mismo archivo por Web Audio.
      play() {
        heartbeat.stop();
        holding = true;
        try { beat.currentTime = 0; } catch (_) { /* aún sin metadatos */ }
        beat.playbackRate = 1;
        beat.muted = state.muted;
        debugInfo.mode = 'audio';
        const playing = beat.play();
        if (playing && playing.catch) {
          playing.catch((err) => {
            debugInfo.playError = err && err.name ? err.name : String(err);
            if (!holding || !beatBuffer) return;
            debugInfo.mode = 'webaudio';
            beatVoice = sfx.loopBuffer(beatBuffer);
          });
        }
        duck(true);
      },
      rate(progress) {
        // Los latidos se aceleran a medida que se llena el círculo
        const v = 1 + progress * 0.45;
        if (beatVoice) beatVoice.rate(v);
        else try { beat.playbackRate = v; } catch (_) { /* navegador sin soporte */ }
      },
      stop() {
        holding = false;
        if (beatVoice) { beatVoice.stop(); beatVoice = null; }
        beat.pause();
        duck(false);
      },
    };

    // Diagnóstico en pantalla: abrir el link con ?debug
    if (/[?&]debug\b/.test(location.search)) {
      const panel = document.createElement('pre');
      panel.style.cssText =
        'position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:8px 10px;max-width:calc(100% - 16px);' +
        'font:11px/1.4 monospace;white-space:pre-wrap;background:rgba(0,0,0,.75);color:#fff;border-radius:8px;pointer-events:none';
      document.body.appendChild(panel);
      setInterval(() => {
        panel.textContent = [
          `webaudio: ${sfx.state()} · buffer: ${beatBuffer ? 'ok' : 'no'}`,
          `latido: ${beat.paused ? 'pausado' : 'sonando'} · t=${beat.currentTime.toFixed(2)} · ready=${beat.readyState}`,
          `latido muted=${beat.muted} · err=${beat.error ? beat.error.code : '-'} · modo=${debugInfo.mode || '-'}`,
          `play error: ${debugInfo.playError || '-'} · load error: ${debugInfo.loadError || '-'}`,
          `música: ${audio.paused ? 'pausada' : 'sonando'} · silenciado=${state.muted}`,
        ].join('\n');
      }, 400);
    }

    const toggle = () => {
      state.muted = !state.muted;
      audio.muted = state.muted;
      beat.muted = state.muted;
      if (state.muted && beatVoice) { beatVoice.stop(); beatVoice = null; }
      btn.classList.toggle('is-muted', state.muted);
      btn.setAttribute('aria-pressed', String(state.muted));
      if (!state.muted && audio.paused && started) audio.play().catch(() => {});
    };

    btn.addEventListener('click', toggle);

    // Pausar si WhatsApp / el navegador pasa a segundo plano
    document.addEventListener('visibilitychange', () => {
      if (!started) return;
      if (document.hidden) { audio.pause(); heartbeat.stop(); }
      else if (!state.muted) audio.play().catch(() => {});
    });

    return { start, heartbeat };
  })();

  /* ---------- Partículas ambientales ---------- */

  (() => {
    const motes = $('#motes');
    const count = window.innerWidth < 500 ? 12 : 18;
    for (let i = 0; i < count; i++) {
      const m = document.createElement('span');
      m.style.setProperty('--x', `${Math.random() * 100}%`);
      m.style.setProperty('--s', `${2 + Math.random() * 3}px`);
      m.style.setProperty('--d', `${14 + Math.random() * 14}s`);
      m.style.setProperty('--delay', `${-Math.random() * 24}s`);
      m.style.setProperty('--o', `${0.25 + Math.random() * 0.45}`);
      motes.appendChild(m);
    }
  })();

  /* ---------- Confeti ---------- */

  const confetti = (() => {
    const canvas = $('#confetti');
    const ctx = canvas.getContext('2d');
    const COLORS = ['#8cc4ea', '#b8dcf5', '#5fa5d9', '#ffffff', '#dbeefb', '#3d86c6', '#a9d3f0'];
    const MAX = 420;
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];

    let parts = [];
    let raf = 0;
    let last = 0;
    let w = 0;
    let h = 0;
    let rainUntil = 0;
    let rainRate = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const make = (x, y, angle, speed, kind) => ({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      kind,
      size: kind === 'spark' ? rand(1.2, 3) : kind === 'dot' ? rand(2.5, 4.5) : rand(6, 11),
      color: kind === 'spark' ? '#ffffff' : pick(COLORS),
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.2, 0.2),
      tilt: rand(0, Math.PI * 2),
      vt: rand(0.05, 0.16),
      life: 0,
      ttl: kind === 'spark' ? rand(70, 150) : Infinity,
    });

    const add = (p) => { if (parts.length < MAX) parts.push(p); };

    const cannon = (x, y, direction, count) => {
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + direction * rand(0.15, 0.6);
        add(make(x, y, angle, rand(10, 18), Math.random() < 0.75 ? 'ribbon' : 'dot'));
      }
    };

    const burst = (x, y, count) => {
      for (let i = 0; i < count; i++) {
        add(make(x, y, rand(0, Math.PI * 2), rand(2, 9), pick(['ribbon', 'dot'])));
      }
    };

    const sparkles = (count, area) => {
      for (let i = 0; i < count; i++) {
        const x = area ? rand(area.x0, area.x1) : rand(0, w);
        const y = area ? rand(area.y0, area.y1) : rand(0, h);
        add(make(x, y, rand(0, Math.PI * 2), rand(0.1, 0.8), 'spark'));
      }
    };

    const update = (p, k) => {
      const drag = Math.pow(0.985, k);
      p.vx *= drag;
      if (p.kind === 'spark') {
        p.vy = p.vy * drag - 0.004 * k;
      } else {
        p.vy = Math.min(p.vy * drag + 0.2 * k, p.kind === 'dot' ? 3.8 : 3.2);
      }
      p.tilt += p.vt * k;
      p.rot += p.vr * k;
      p.x += (p.vx + (p.kind === 'spark' ? 0 : Math.sin(p.tilt) * 0.7)) * k;
      p.y += p.vy * k;
      p.life += k;
    };

    const draw = (p) => {
      if (p.kind === 'spark') {
        const a = Math.sin((p.life / p.ttl) * Math.PI) * (0.6 + 0.4 * Math.sin(p.life * 0.4));
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = p.color;
        ctx.shadowColor = 'rgba(166, 209, 240, .9)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        return;
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.color;
      if (p.kind === 'dot') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.tilt)); // efecto de papel que gira
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    };

    const loop = (t) => {
      const k = Math.min(3, (t - last) / 16.667 || 1);
      last = t;

      if (t < rainUntil) {
        const n = rainRate * k;
        for (let i = 0; i < n; i++) {
          if (Math.random() < n - i) {
            const p = make(rand(0, w), -12, Math.PI / 2, rand(1, 2.5), Math.random() < 0.8 ? 'ribbon' : 'dot');
            p.vx = rand(-0.6, 0.6);
            add(p);
          }
        }
      }

      ctx.clearRect(0, 0, w, h);
      parts = parts.filter((p) => {
        update(p, k);
        if (p.y > h + 30 || p.x < -40 || p.x > w + 40 || p.life > p.ttl) return false;
        draw(p);
        return true;
      });
      ctx.globalAlpha = 1;

      if (parts.length || t < rainUntil) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
        ctx.clearRect(0, 0, w, h);
      }
    };

    const kick = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    const rain = (ms, perFrame) => {
      rainUntil = performance.now() + ms;
      rainRate = perFrame;
      kick();
    };

    const celebrate = () => {
      if (reduced()) {
        burst(w / 2, h * 0.4, 36);
        kick();
        return;
      }
      const small = w < 500;
      cannon(0, h, 1, small ? 55 : 80);
      cannon(w, h, -1, small ? 55 : 80);
      burst(w / 2, h * 0.38, small ? 50 : 80);
      sparkles(small ? 35 : 60);
      rain(5000, small ? 1.2 : 2);
      kick();
    };

    const nameSparkle = () => {
      if (reduced()) return;
      sparkles(40, { x0: w * 0.15, x1: w * 0.85, y0: h * 0.3, y1: h * 0.6 });
      kick();
    };

    const drizzle = (ms) => { if (!reduced()) rain(ms, 0.35); };

    const stop = () => {
      parts = [];
      rainUntil = 0;
      cancelAnimationFrame(raf);
      raf = 0;
      ctx.clearRect(0, 0, w, h);
    };

    return { celebrate, nameSparkle, drizzle, stop };
  })();

  /* =========================================================
     Misiones (mini juegos)
     Cada juego expone: start(onWin), stop(), isDone()
     onWin(estrellas, mensaje)
     ========================================================= */

  const starsByTime = (ms, three, two) => (ms < three ? 3 : ms < two ? 2 : 1);

  /* ---------- Nivel 1 · Enfermería: pinchar la vena ---------- */

  const veinGame = (() => {
    const root = $('#veinGame');
    const syringe = $('#syringe');
    const vein = $('#veinPath');
    const ring = $('#veinRing');
    const status = $('#veinStatus');
    const MISSES = [
      '¡Auch! Esa no era 😅',
      'Casi… respira y otra vez',
      'La vena se escondió, intenta de nuevo',
      'Con calma, a la próxima entra',
    ];

    let raf = 0;
    let t0 = 0;
    let x = 150;
    let veinX = 150;
    let tolerance = 16;
    let misses = 0;
    let busy = false;
    let done = true;
    let onWin = null;

    const placeVein = () => {
      veinX = rand(85, 225);
      vein.setAttribute('d', `M${veinX - 5} 97 C${veinX + 9} 118 ${veinX - 9} 146 ${veinX + 5} 171`);
    };

    const loop = (t) => {
      x = 50 + 220 * (0.5 + 0.5 * Math.sin((t - t0) * 0.0024));
      syringe.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
      raf = requestAnimationFrame(loop);
    };

    const resume = () => {
      cancelAnimationFrame(raf);
      t0 = performance.now() - rand(0, 2600);
      raf = requestAnimationFrame(loop);
    };

    const stab = () => run(async () => {
      if (busy || done) return;
      busy = true;
      cancelAnimationFrame(raf);
      root.classList.add('is-stab');
      const hit = Math.abs(x - veinX) <= tolerance;
      await wait(220);

      if (hit) {
        done = true;
        ring.setAttribute('cx', x.toFixed(1));
        root.classList.add('is-hit');
        sfx.success();
        vibrate([20, 40, 20]);
        status.textContent = misses === 0 ? '¡Canalizada al primer intento!' : '¡Canalizada!';
        const stars = misses === 0 ? 3 : misses <= 2 ? 2 : 1;
        if (onWin) onWin(stars, stars === 3 ? 'Mano de enfermera' : 'La práctica hace al maestro');
        return;
      }

      misses++;
      tolerance = Math.min(40, tolerance + 7); // más fácil con cada intento
      status.textContent = MISSES[(misses - 1) % MISSES.length];
      root.classList.add('is-miss');
      sfx.fail();
      vibrate(60);
      await wait(650);
      root.classList.remove('is-stab', 'is-miss');
      busy = false;
      resume();
    });

    root.addEventListener('pointerdown', (e) => { e.preventDefault(); stab(); });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stab(); }
    });

    return {
      start(cb) {
        onWin = cb;
        done = false;
        busy = false;
        misses = 0;
        tolerance = 16;
        root.classList.remove('is-stab', 'is-miss', 'is-hit');
        status.textContent = ' ';
        placeVein();
        resume();
      },
      stop() { cancelAnimationFrame(raf); },
      isDone: () => done,
    };
  })();

  /* ---------- Nivel 2 · Bomberos: apagar el incendio y rescatar al gatito ---------- */

  const fireGame = (() => {
    const root = $('#fireGame');
    const field = $('#fireField');
    const kitten = $('#kitten');
    const status = $('#fireStatus');
    const SPOTS = [[22, 70], [50, 56], [78, 70], [36, 88], [64, 88]];

    let flames = [];
    let pointer = null;
    let pressing = false;
    let rect = null;
    let raf = 0;
    let last = 0;
    let t0 = 0;
    let lastDrop = 0;
    let phase = 'idle';
    let done = true;
    let onWin = null;

    const build = () => {
      $$('.flame, .drop, .smoke', field).forEach((n) => n.remove());
      flames = SPOTS.map(([sx, sy]) => {
        const el = document.createElement('span');
        const size = rand(48, 66);
        const fx = sx + rand(-4, 4);
        const fy = sy + rand(-3, 3);
        el.className = 'flame';
        el.style.left = `${fx}%`;
        el.style.top = `${fy}%`;
        el.style.setProperty('--size', `${size}px`);
        el.innerHTML = '<span class="flame__outer"></span><span class="flame__inner"></span>';
        field.appendChild(el);
        return { el, x: fx, y: fy, size, hp: 1 };
      });
    };

    const local = (e) => {
      rect = field.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const spawn = (cls, p) => {
      const el = document.createElement('span');
      el.className = cls;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.setProperty('--dx', `${rand(-15, 15)}px`);
      field.appendChild(el);
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };

    const spray = (p) => {
      const now = performance.now();
      if (now - lastDrop < 45) return;
      lastDrop = now;
      spawn('drop', p);
    };

    const toKitten = () => run(async () => {
      phase = 'kitten';
      pointer = null;
      field.classList.add('is-safe');
      status.textContent = '¡Fuego controlado! …¿escuchas un miau?';
      await wait(900);
      kitten.classList.add('is-in');
      sfx.meow();
    });

    const loop = (t) => {
      const dt = Math.min(64, t - last);
      last = t;
      if (phase === 'fire' && pointer && rect) {
        for (const f of flames) {
          if (f.hp <= 0) continue;
          const fx = (f.x / 100) * rect.width;
          const fy = (f.y / 100) * rect.height - f.size * 0.35;
          if (Math.hypot(pointer.x - fx, pointer.y - fy) < f.size * 0.5 + 26) {
            f.hp -= dt / 650;
            if (f.hp <= 0) {
              f.hp = 0;
              f.el.classList.add('is-out');
              spawn('smoke', { x: fx, y: fy + f.size * 0.3 });
              sfx.pop();
              vibrate(15);
            } else {
              f.el.style.setProperty('--hp', Math.max(0.2, f.hp).toFixed(3));
            }
          }
        }
        if (flames.every((f) => f.hp <= 0)) toKitten();
      }
      raf = requestAnimationFrame(loop);
    };

    field.addEventListener('pointerdown', (e) => {
      if (phase !== 'fire') return;
      e.preventDefault();
      pressing = true;
      // Solo capturamos durante el fuego; si no, el toque al gatito no llegaría al botón
      try { field.setPointerCapture(e.pointerId); } catch (_) { /* opcional */ }
      pointer = local(e);
      spray(pointer);
    });

    field.addEventListener('pointermove', (e) => {
      if (phase !== 'fire') return;
      if (!pressing && e.pointerType !== 'mouse') return;
      pointer = local(e);
      spray(pointer);
    });

    const release = (e) => {
      pressing = false;
      if (!e || e.pointerType !== 'mouse') pointer = null;
    };
    field.addEventListener('pointerup', release);
    field.addEventListener('pointercancel', release);
    field.addEventListener('pointerleave', () => { pressing = false; pointer = null; });

    kitten.addEventListener('click', () => {
      if (phase !== 'kitten') return;
      phase = 'done';
      done = true;
      kitten.classList.add('is-saved');
      sfx.coin();
      vibrate([20, 30, 20]);
      status.textContent = '¡Gatito rescatado! 🐾';
      if (onWin) onWin(starsByTime(performance.now() - t0, 12000, 20000), '¡Héroe del día! 🚒');
    });

    return {
      start(cb) {
        onWin = cb;
        done = false;
        phase = 'fire';
        pointer = null;
        pressing = false;
        field.classList.remove('is-safe');
        kitten.classList.remove('is-in', 'is-saved');
        status.textContent = ' ';
        build();
        rect = field.getBoundingClientRect();
        cancelAnimationFrame(raf);
        t0 = performance.now();
        last = t0;
        raf = requestAnimationFrame(loop);
      },
      stop() { cancelAnimationFrame(raf); pointer = null; },
      isDone: () => done,
    };
  })();

  /* ---------- Nivel 3 · Forense: encontrar la huella con luz UV ---------- */

  const printGame = (() => {
    const root = $('#printGame');
    const uv = $('#uvLayer');
    const print = $('#babyPrint');
    const status = $('#printStatus');
    const FINGERPRINT =
      '<svg viewBox="0 0 40 50" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="18 3">' +
      '<ellipse cx="20" cy="25" rx="3" ry="5"/><ellipse cx="20" cy="25" rx="6.5" ry="9.5"/>' +
      '<ellipse cx="20" cy="25" rx="10" ry="14"/><ellipse cx="20" cy="25" rx="13.5" ry="18.5"/>' +
      '<ellipse cx="20" cy="25" rx="17" ry="23"/></g></svg>';

    let raf = 0;
    let last = 0;
    let t0 = 0;
    let hover = 0;
    let pos = null;
    let target = { x: 0, y: 0 };
    let pressing = false;
    let done = true;
    let onWin = null;

    const place = () => {
      $$('.fingerprint', uv).forEach((n) => n.remove());
      const px = rand(18, 82);
      const py = rand(22, 78);
      print.style.left = `${px}%`;
      print.style.top = `${py}%`;
      print.style.setProperty('--rot', `${rand(-25, 25)}deg`);
      print.style.setProperty('--glow', '0');
      target = { px, py };

      // Huellas "de adulto" para despistar
      for (let i = 0; i < 4; i++) {
        let dx;
        let dy;
        do {
          dx = rand(10, 90);
          dy = rand(12, 88);
        } while (Math.hypot(dx - px, dy - py) < 24);
        const fp = document.createElement('span');
        fp.className = 'fingerprint';
        fp.innerHTML = FINGERPRINT;
        fp.style.left = `${dx}%`;
        fp.style.top = `${dy}%`;
        fp.style.setProperty('--rot', `${rand(0, 360)}deg`);
        uv.appendChild(fp);
      }
    };

    const move = (e) => {
      const r = root.getBoundingClientRect();
      // Con el dedo, la luz va un poco más arriba para que no la tape
      const lift = e.pointerType === 'mouse' ? 0 : 56;
      pos = {
        x: Math.max(0, Math.min(r.width, e.clientX - r.left)),
        y: Math.max(0, Math.min(r.height, e.clientY - r.top - lift)),
        w: r.width,
        h: r.height,
      };
      root.style.setProperty('--x', `${pos.x}px`);
      root.style.setProperty('--y', `${pos.y}px`);
    };

    const found = () => {
      done = true;
      root.classList.add('is-found');
      sfx.success();
      vibrate([20, 40, 20]);
      status.textContent = '¡Evidencia encontrada! Una huella muy pequeñita 👣';
      if (onWin) onWin(starsByTime(performance.now() - t0, 8000, 16000), 'Caso resuelto');
    };

    const loop = (t) => {
      const dt = Math.min(64, t - last);
      last = t;
      if (pos && !done) {
        const tx = (target.px / 100) * pos.w;
        const ty = (target.py / 100) * pos.h;
        if (Math.hypot(pos.x - tx, pos.y - ty) < 36) hover += dt;
        else hover = Math.max(0, hover - dt * 0.6);
        print.style.setProperty('--glow', Math.min(1, hover / 700).toFixed(2));
        if (hover >= 700) { found(); return; }
      }
      raf = requestAnimationFrame(loop);
    };

    root.addEventListener('pointerdown', (e) => {
      if (done) return;
      e.preventDefault();
      pressing = true;
      try { root.setPointerCapture(e.pointerId); } catch (_) { /* opcional */ }
      move(e);
    });
    root.addEventListener('pointermove', (e) => {
      if (done) return;
      if (pressing || e.pointerType === 'mouse') move(e);
    });
    const release = () => { pressing = false; };
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);

    return {
      start(cb) {
        onWin = cb;
        done = false;
        hover = 0;
        pos = null;
        pressing = false;
        root.classList.remove('is-found');
        root.style.removeProperty('--x');
        root.style.removeProperty('--y');
        status.textContent = ' ';
        place();
        cancelAnimationFrame(raf);
        t0 = performance.now();
        last = t0;
        raf = requestAnimationFrame(loop);
      },
      stop() { cancelAnimationFrame(raf); },
      isDone: () => done,
    };
  })();

  const LEVELS = {
    level1: { game: veinGame, next: 'level2' },
    level2: { game: fireGame, next: 'level3' },
    level3: { game: printGame, next: 'scratch' },
  };

  const enterLevel = (name) => async () => {
    const scene = scenes.get(name);
    const { game } = LEVELS[name];
    const win = $('.win', scene);
    hide(win);

    await wait(300);
    show($('.hud', scene));
    await wait(250);
    show($('.title', scene));
    await wait(250);
    show($('.game-hint', scene));
    await wait(300);
    show($('.game', scene));

    game.start((stars, message) => run(async () => {
      hide($('.skip', scene));
      await wait(900);
      $$('.win__stars span', win).forEach((s, i) => s.classList.toggle('is-on', i < stars));
      $('.win__msg', win).textContent = message;
      show(win);
      sfx.win();
    }));

    // Para quien se traba (o los abuelos): aparece "Saltar misión"
    await wait(12000);
    if (current === name && !game.isDone()) show($('.skip', scene));
  };

  /* ---------- Revelado tipo "scratch" ---------- */

  const scratchPad = (() => {
    const canvas = $('#scratchCanvas');
    const img = $('#scratchImg');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const THRESHOLD = 0.5;

    let dpr = 1;
    let brush = 40;
    let drawing = false;
    let last = null;
    let done = false;
    let lastCheck = 0;
    let onDone = null;

    const paintCover = (cw, ch) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      const g = ctx.createLinearGradient(0, 0, cw, ch);
      g.addColorStop(0, '#f8f0e3');
      g.addColorStop(0.55, '#ebdac0');
      g.addColorStop(1, '#dcc6a1');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);

      // Polvo dorado
      const dots = Math.round((cw * ch) / 240);
      for (let i = 0; i < dots; i++) {
        ctx.globalAlpha = Math.random() * 0.35;
        ctx.fillStyle = Math.random() > 0.5 ? '#c3a066' : '#fffaf0';
        ctx.beginPath();
        ctx.arc(Math.random() * cw, Math.random() * ch, 0.3 + Math.random() * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Marco interior
      ctx.strokeStyle = 'rgba(154, 118, 65, .35)';
      ctx.lineWidth = 1;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(10.5, 10.5, cw - 21, ch - 21, 12);
        ctx.stroke();
      } else {
        ctx.strokeRect(10.5, 10.5, cw - 21, ch - 21);
      }

      // Texto
      const fs = Math.max(20, Math.min(cw, ch) * 0.12);
      ctx.fillStyle = '#9a7641';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `italic 400 ${fs}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillText('Desliza aquí', cw / 2, ch / 2 - fs * 0.25);
      ctx.font = `300 ${fs * 0.6}px Georgia, serif`;
      ctx.fillText('♡', cw / 2, ch / 2 + fs * 0.75);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    const init = async (callback) => {
      onDone = callback;
      done = false;
      drawing = false;
      last = null;
      canvas.classList.remove('is-cleared');

      await imgReady(img);
      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (_) { /* sin fuentes web */ }
      }

      const rect = canvas.getBoundingClientRect();
      const cw = Math.max(1, rect.width);
      const ch = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      brush = Math.max(26, Math.min(cw, ch) * 0.13) * dpr;
      paintCover(cw, ch);
    };

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) * canvas.width) / r.width,
        y: ((e.clientY - r.top) * canvas.height) / r.height,
      };
    };

    const erase = (a, b) => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Borde suave: una pasada ancha y tenue + una pasada firme
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = brush * 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x + 0.01, b.y);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.lineWidth = brush;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x + 0.01, b.y);
      ctx.stroke();
    };

    const coverage = () => {
      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;
      const step = Math.max(4, Math.floor(width / 70));
      let clear = 0;
      let total = 0;
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          total++;
          if (data[(y * width + x) * 4 + 3] < 128) clear++;
        }
      }
      return total ? clear / total : 0;
    };

    const finish = () => {
      if (done) return;
      done = true;
      drawing = false;
      canvas.classList.add('is-cleared');
      vibrate(25);
      sfx.success();
      if (onDone) onDone();
    };

    const check = (force) => {
      const now = performance.now();
      if (!force && now - lastCheck < 180) return;
      lastCheck = now;
      if (coverage() >= THRESHOLD) finish();
    };

    const moveTo = (e) => {
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const list = events.length ? events : [e];
      for (const ev of list) {
        const p = pos(ev);
        erase(last || p, p);
        last = p;
      }
      check(false);
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (done) return;
      e.preventDefault();
      drawing = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* opcional */ }
      last = pos(e);
      erase(last, last);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (done) return;
      // Con mouse basta con pasar por encima; con el dedo, al arrastrar
      if (drawing || e.pointerType === 'mouse') moveTo(e);
    });

    const end = () => {
      if (!drawing) return;
      drawing = false;
      last = null;
      if (!done) check(true);
    };

    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') {
        last = null;
        if (!done) check(true);
      }
    });

    // Accesibilidad: teclado
    canvas.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        finish();
      }
    });

    const reset = () => {
      done = false;
      drawing = false;
      last = null;
      onDone = null;
      canvas.classList.remove('is-cleared');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    return { init, reset };
  })();

  /* ---------- Mantener presionado (con latidos) ---------- */

  const holdHeart = (() => {
    const btn = $('#holdBtn');
    const bar = $('#holdBar');
    const DURATION = 3000;
    const REWIND = 450;
    const C = 2 * Math.PI * 54;

    let progress = 0;
    let holding = false;
    let done = false;
    let raf = 0;
    let last = 0;
    let onDone = null;

    bar.style.strokeDasharray = `${C}`;

    const set = (v) => {
      progress = v;
      bar.style.strokeDashoffset = `${C * (1 - v)}`;
      btn.style.setProperty('--p', v.toFixed(3));
    };
    set(0);

    const loop = (t) => {
      const dt = t - last;
      last = t;
      if (holding) {
        set(Math.min(1, progress + dt / DURATION));
        music.heartbeat.rate(progress);
        if (progress >= 1) { complete(); return; }
      } else {
        // Soltó antes de tiempo: el progreso vuelve a cero
        set(Math.max(0, progress - dt / REWIND));
        if (progress <= 0) { raf = 0; return; }
      }
      raf = requestAnimationFrame(loop);
    };

    const kick = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (done || holding) return;
      holding = true;
      btn.classList.add('is-holding');
      music.heartbeat.play();
      vibrate(12);
      kick();
    };

    const stop = () => {
      if (!holding) return;
      holding = false;
      btn.classList.remove('is-holding');
      music.heartbeat.stop();
      kick();
    };

    function complete() {
      raf = 0;
      holding = false;
      done = true;
      btn.classList.remove('is-holding');
      btn.classList.add('is-complete');
      music.heartbeat.stop();
      vibrate([30, 50, 80]);
      if (onDone) onDone();
    }

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (_) { /* opcional */ }
      start();
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('lostpointercapture', stop);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        start();
      }
    });
    btn.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') stop();
    });
    btn.addEventListener('blur', stop);

    const reset = (callback) => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (holding) music.heartbeat.stop();
      holding = false;
      done = false;
      onDone = callback || null;
      btn.classList.remove('is-holding', 'is-complete');
      set(0);
    };

    return { reset };
  })();

  /* ---------- Nombre letra por letra ---------- */

  (() => {
    const el = $('#nameMain');
    const word = el.textContent.trim();
    el.textContent = '';
    el.setAttribute('aria-label', word);
    [...word].forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'ch';
      span.textContent = ch;
      span.style.setProperty('--i', i);
      span.setAttribute('aria-hidden', 'true');
      el.appendChild(span);
    });
  })();

  /* ---------- Video final (con respaldo a la imagen) ---------- */

  const finalVideo = $('#finalVideo');
  const finalImg = $('#finalImg');
  const useImageInstead = () => { finalVideo.hidden = true; finalImg.hidden = false; };
  $('source', finalVideo).addEventListener('error', useImageInstead);
  finalVideo.addEventListener('error', useImageInstead);

  /* ---------- Escenas ---------- */

  const scenes = new Map($$('.scene').map((el) => [el.dataset.scene, el]));
  let current = 'intro';

  const enters = {
    async intro() {
      await wait(300);
      show($('#introOrnament'));
      await wait(500);
      show($('#introLead'));
      await wait(1500);
      show($('#introTitle'));
      await wait(1200);
      show($('#introBtn'));
    },

    async eco() {
      await wait(400);
      show($('#ecoFrame'));
      await wait(2200);
      show($('#ecoLine1'));
      await wait(3400);
      show($('#ecoLine2'));
      await wait(2000);
      show($('#ecoBtn'));
    },

    async bet() {
      await wait(400);
      show($('#betEyebrow'));
      await wait(400);
      show($('#betTitle'));
      await wait(900);
      show($('#betChoices'));
    },

    async missions() {
      await wait(400);
      show($('#missionsEyebrow'));
      await wait(400);
      show($('#missionsTitle'));
      await wait(700);
      show($('#missionsList'));
      await wait(900);
      show($('#missionsBtn'));
    },

    level1: enterLevel('level1'),
    level2: enterLevel('level2'),
    level3: enterLevel('level3'),

    async scratch() {
      await wait(400);
      show($('#scratchEyebrow'));
      show($('#scratchHint'));
      await wait(300);
      show($('#scratchFrame'));
      await scratchPad.init(() => run(async () => {
        await wait(500);
        show($('#scratchAlmost'));
        await wait(1500);
        show($('#scratchBtn'));
      }));
    },

    async hold() {
      holdHeart.reset(() => run(async () => {
        await wait(700);
        goTo('countdown');
      }));
      await wait(400);
      show($('#holdText'));
      await wait(500);
      show($('#holdBtn'));
      await wait(600);
      show($('#holdHint'));
    },

    async countdown() {
      const count = $('#count');
      const ring = $('#countRing');
      await wait(700);
      for (const n of [3, 2, 1]) {
        count.textContent = String(n);
        count.classList.remove('is-pop');
        ring.classList.remove('is-pop');
        void count.offsetWidth; // reinicia la animación
        count.classList.add('is-pop');
        ring.classList.add('is-pop');
        sfx.tick();
        vibrate(20);
        await wait(1000);
      }
      count.classList.remove('is-pop');
      ring.classList.remove('is-pop');
      count.textContent = '';
      goTo('reveal');
    },

    async reveal() {
      document.body.classList.add('is-boy');
      setTheme(THEME_BOY);
      await wait(reduced() ? 300 : 1000);
      confetti.celebrate();
      sfx.win();
      show($('#headline'));
      await wait(1600);

      const result = $('#betResult');
      if (state.bet) {
        result.textContent = state.bet === 'boy' ? '¡Acertaste! 💙' : '¡Casi! Esta vez no acertaste 💙';
        show(result);
      }
      await wait(1300);
      show($('#hello'));
      await wait(3000);

      $('#phaseA').classList.add('is-out');
      await wait(1000);
      show($('#nameMain'));
      confetti.nameSparkle();
      await wait(2300);
      show($('#nameRule'));
      show($('#nameFull'));
      await wait(1400);
      show($('#nameSurname'));
      await wait(2400);
      show($('#toFinal'));
    },

    async final() {
      finalVideo.muted = true;
      if (!finalVideo.hidden) {
        try { finalVideo.currentTime = 0; } catch (_) { /* aún sin metadatos */ }
        finalVideo.play().catch(() => { /* queda el póster */ });
      }
      const steps = [
        ['#finalEco', 300],
        ['#finalHello', 1100],
        ['#finalName', 1000],
        ['#finalText', 1100],
        ['#finalSoon', 1300],
        ['#finalSign', 1200],
        ['#restartBtn', 1000],
      ];
      confetti.drizzle(4000);
      for (const [sel, delay] of steps) {
        await wait(delay);
        show($(sel));
      }
    },
  };

  function goTo(name) {
    if (name === current) return;
    const prev = scenes.get(current);
    const next = scenes.get(name);
    if (!next) return;

    if (LEVELS[current]) LEVELS[current].game.stop();

    if (prev) {
      prev.classList.remove('is-active');
      prev.setAttribute('aria-hidden', 'true');
      prev.inert = true;
    }

    $$('.fx, .anim, .win', next).forEach(hide);
    next.scrollTop = 0;
    next.classList.add('is-active');
    next.removeAttribute('aria-hidden');
    next.inert = false;
    current = name;

    if (enters[name]) run(enters[name]);
  }

  function restart() {
    session++; // cancela todas las secuencias pendientes
    confetti.stop();
    Object.values(LEVELS).forEach(({ game }) => game.stop());
    finalVideo.pause();
    document.body.classList.remove('is-boy');
    setTheme(THEME_NEUTRAL);

    state.bet = null;
    $$('.choice').forEach((b) => {
      b.disabled = false;
      b.classList.remove('is-picked', 'is-dimmed');
      b.setAttribute('aria-pressed', 'false');
    });
    $('#phaseA').classList.remove('is-out');
    $('#betResult').textContent = '';
    scratchPad.reset();
    holdHeart.reset();
    $$('.fx, .anim, .win').forEach(hide);

    goTo('intro');
  }

  /* ---------- Eventos ---------- */

  const actions = {
    start() {
      music.start(); // dentro del gesto: requisito de Safari y Chrome
      goTo('eco');
    },
    go(trigger) { goTo(trigger.dataset.to); },
    skip() {
      const level = LEVELS[current];
      if (!level) return;
      level.game.stop();
      goTo(level.next);
    },
    'to-bet': () => goTo('bet'),
    'to-hold': () => goTo('hold'),
    'to-final': () => goTo('final'),
    restart,
  };

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-action]');
    if (!trigger) return;
    const action = actions[trigger.dataset.action];
    if (action) action(trigger);
  });

  $$('.choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.bet) return;
      state.bet = btn.dataset.bet;
      btn.setAttribute('aria-pressed', 'true');
      $$('.choice').forEach((other) => {
        other.disabled = true;
        other.classList.add(other === btn ? 'is-picked' : 'is-dimmed');
      });
      sfx.pop();
      vibrate(15);
      run(async () => {
        await wait(500);
        show($('#betMsg'));
        await wait(2800);
        goTo('missions');
      });
    });
  });

  // Inicio
  run(enters.intro);
})();
