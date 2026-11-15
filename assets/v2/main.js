/* Zhiyu Ni — site interactions. No dependencies. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = (v) => getComputedStyle(root).getPropertyValue(v).trim();

  /* ---------- theme ---------- */
  $('#themeToggle').addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('zn-theme', next);
    neuro && neuro.recolor();
  });

  /* ---------- year ---------- */
  $('#year').textContent = new Date().getFullYear();

  /* ---------- nav state + progress + active section ---------- */
  const nav = $('#nav');
  const bar = $('.progress span');
  const links = $$('.nav__links a');
  const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  let ticking = false;
  const onScroll = () => {
    const y = scrollY;
    nav.classList.toggle('is-scrolled', y > 30);
    const h = document.body.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? y / h : 0})`;
    let cur = null;
    for (const s of sections) if (s.getBoundingClientRect().top < innerHeight * 0.35) cur = s;
    links.forEach((a) => a.classList.toggle('is-active', cur && a.getAttribute('href') === '#' + cur.id));
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } }, { passive: true });
  onScroll();

  /* ---------- reveal on scroll (with sibling stagger) ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const sibs = $$('.reveal:not(.is-in)', el.parentElement);
      el.style.setProperty('--d', `${Math.min(sibs.indexOf(el), 6) * 0.07}s`);
      el.classList.add('is-in');
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('.reveal').forEach((el) => io.observe(el));

  /* ---------- cursor-follow glow on cards ---------- */
  $$('[data-glow]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  /* ---------- magnetic buttons ---------- */
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    $$('.btn, .socials a').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.25;
        const y = (e.clientY - r.top - r.height / 2) * 0.35;
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- typed FOL formulas ---------- */
  const formulas = [
    '∀x (Curious(x) ∧ Researcher(x) → Collaborate(x, you))',
    '∃p (Paper(p) ∧ Formalized(p) ∧ Verified(p, Z3))',
    'Draft(φ₁..φₙ) ∧ Prune(¬Consistent) ⊢ Reliable(φ)',
    '∀d (Defense(d) ∧ Robust(d) → ¬Shortcut(d))',
  ];
  const typed = $('#typed');
  const paint = (s) => s
    .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    .replace(/([∀∃¬∧∨→⊢])/g, '<span class="q">$1</span>')
    .replace(/\b(Z3|you)\b/g, '<span class="p">$1</span>');
  if (reduced) {
    typed.innerHTML = paint(formulas[0]);
  } else {
    let fi = 0, ci = 0, del = false;
    const step = () => {
      const f = formulas[fi];
      ci += del ? -1 : 1;
      typed.innerHTML = paint(f.slice(0, ci));
      let wait = del ? 18 : 38 + Math.random() * 40;
      if (!del && ci === f.length) { del = true; wait = 2400; }
      else if (del && ci === 0) { del = false; fi = (fi + 1) % formulas.length; wait = 400; }
      setTimeout(step, wait);
    };
    setTimeout(step, 900);
  }

  /* ---------- publications: filter + expand ---------- */
  const chips = $$('.chip');
  const pubs = $$('.pub');
  chips.forEach((c) => c.addEventListener('click', () => {
    chips.forEach((x) => { x.classList.toggle('is-active', x === c); x.setAttribute('aria-selected', x === c); });
    const f = c.dataset.filter;
    pubs.forEach((p) => {
      const show = f === 'all' || p.dataset.cat === f;
      p.classList.toggle('is-hidden', !show);
      if (show) { p.classList.add('is-in'); p.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.7,.1,1)' }); }
    });
  }));
  pubs.forEach((p) => {
    const btn = $('.pub__row', p);
    btn.addEventListener('click', () => {
      const open = p.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open);
    });
  });

  /* ---------- news expand ---------- */
  const newsBtn = $('#newsMore');
  newsBtn.addEventListener('click', () => {
    const on = $('#newsList').classList.toggle('is-expanded');
    newsBtn.textContent = on ? 'Show less' : 'Show earlier';
    newsBtn.setAttribute('aria-expanded', on);
  });

  /* ---------- copy email + toast ---------- */
  const toast = $('#toast');
  let toastT;
  const say = (msg) => {
    toast.textContent = msg; toast.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('is-on'), 1800);
  };
  const copyEmail = async () => {
    const email = 'zhiyuni@berkeley.edu';
    try { await navigator.clipboard.writeText(email); say('Email copied ✓'); }
    catch { location.href = 'mailto:' + email; }
  };
  $('#copyEmail').addEventListener('click', copyEmail);

  /* ---------- command palette ---------- */
  const pal = $('#palette'), input = $('#paletteInput'), list = $('#paletteList');
  const go = (id) => () => $(id).scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  const open = (u) => () => window.open(u, '_blank', 'noopener');
  const cmds = [
    { t: 'About', k: 'section', run: go('#about') },
    { t: 'Research interests', k: 'section', run: go('#research') },
    { t: 'Publications', k: 'section', run: go('#publications') },
    { t: 'Experience', k: 'section', run: go('#experience') },
    { t: 'News', k: 'section', run: go('#news') },
    { t: 'Honors & service', k: 'section', run: go('#honors') },
    { t: 'Copy email address', k: 'action', run: copyEmail },
    { t: 'Toggle light / dark', k: 'action', run: () => $('#themeToggle').click() },
    { t: 'Open CV (PDF)', k: 'link', run: open('cv.pdf') },
    { t: 'Google Scholar', k: 'link', run: open('https://scholar.google.com/citations?user=nR6j_PQAAAAJ&hl=en') },
    { t: 'GitHub', k: 'link', run: open('https://github.com/zyni2001') },
    { t: 'Draft-and-Prune (arXiv)', k: 'paper', run: open('https://arxiv.org/abs/2603.17233') },
    { t: 'Agentified Assessment (arXiv)', k: 'paper', run: open('https://arxiv.org/abs/2603.02788') },
    { t: 'GrokTransfer (ICLR 2025)', k: 'paper', run: open('https://openreview.net/forum?id=4rEI2JdHH6') },
    { t: 'ARGS (TMLR 2024)', k: 'paper', run: open('https://openreview.net/forum?id=PX06pUVs1P') },
  ];
  let view = cmds, sel = 0;
  const render = () => {
    list.innerHTML = view.map((c, i) => `<li role="option" data-i="${i}" class="${i === sel ? 'is-sel' : ''}">${c.t}<small>${c.k}</small></li>`).join('')
      || '<li>No results — try “paper” or “email”</li>';
    const s = list.children[sel]; s && s.scrollIntoView({ block: 'nearest' });
  };
  const show = () => { pal.hidden = false; input.value = ''; view = cmds; sel = 0; render(); setTimeout(() => input.focus(), 10); };
  const hide = () => { pal.hidden = true; };
  const exec = (c) => { if (!c) return; hide(); c.run(); };
  $('#openPalette').addEventListener('click', show);
  pal.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close')) return hide();
    const li = e.target.closest('li[data-i]'); if (li) exec(view[+li.dataset.i]);
  });
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    view = cmds.filter((c) => (c.t + ' ' + c.k).toLowerCase().includes(q));
    sel = 0; render();
  });
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? show() : hide(); return; }
    if (e.key === '/' && pal.hidden && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); show(); return; }
    if (pal.hidden) return;
    if (e.key === 'Escape') hide();
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(view.length, 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + view.length) % Math.max(view.length, 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); exec(view[sel]); }
  });

  /* =========================================================
     Hero canvas: a neural graph where some neurons are logic
     symbols. Edges light up near the cursor; symbols pulse.
     ========================================================= */
  const neuro = (() => {
    const cv = $('#neuro');
    if (!cv) return null;
    const ctx = cv.getContext('2d');
    const SYMS = ['∀', '∃', '¬', '∧', '∨', '→', '⊢', '⊨', '≡', 'φ', 'λ'];
    let W, H, dpr, nodes = [], col = {}, raf, visible = true;
    const mouse = { x: -9999, y: -9999 };

    const hexToRgb = (h) => {
      h = h.replace('#', '');
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const recolor = () => {
      col.text = hexToRgb(css('--text') || '#ece9e2');
      col.acc = hexToRgb(css('--accent') || '#f3b33d');
      col.acc2 = hexToRgb(css('--accent-2') || '#7aa7ff');
      col.light = root.getAttribute('data-theme') === 'light';
    };
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(120, Math.max(40, (W * H) / 13000)));
      nodes = Array.from({ length: count }, (_, i) => {
        const sym = Math.random() < 0.16 ? SYMS[i % SYMS.length] : null;
        return {
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
          r: sym ? 0 : 1 + Math.random() * 1.6,
          sym, size: 14 + Math.random() * 14, ph: Math.random() * Math.PI * 2,
        };
      });
    };

    // signals that travel along edges
    const pulses = [];
    const LINK = () => Math.min(170, Math.max(110, W / 10));

    const frame = (t) => {
      ctx.clearRect(0, 0, W, H);
      const link = LINK(), link2 = link * link;
      // move
      for (const n of nodes) {
        const dx = n.x - mouse.x, dy = n.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 22000) { const f = 0.012; n.vx += (dx / Math.sqrt(d2 + 1)) * f; n.vy += (dy / Math.sqrt(d2 + 1)) * f; }
        n.vx *= 0.992; n.vy *= 0.992;
        const sp = Math.hypot(n.vx, n.vy); if (sp < 0.08) { n.vx += (Math.random() - 0.5) * 0.02; n.vy += (Math.random() - 0.5) * 0.02; }
        n.x += n.vx; n.y += n.vy;
        if (n.x < -20) n.x = W + 20; else if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20; else if (n.y > H + 20) n.y = -20;
      }
      // edges
      const baseA = col.light ? 0.13 : 0.09;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 > link2) continue;
          const k = 1 - d2 / link2;
          const mx = (a.x + b.x) / 2 - mouse.x, my = (a.y + b.y) / 2 - mouse.y;
          const near = Math.max(0, 1 - Math.hypot(mx, my) / 220);
          ctx.strokeStyle = near > 0.02 ? rgba(col.acc, k * (baseA + near * 0.55)) : rgba(col.text, k * baseA);
          ctx.lineWidth = near > 0.02 ? 0.6 + near : 0.6;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          if ((a.sym || b.sym) && Math.random() < 0.0009 && pulses.length < 18) pulses.push({ a: a.sym ? a : b, b: a.sym ? b : a, t: 0 });
        }
      }
      // pulses
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]; p.t += 0.018;
        if (p.t >= 1) { pulses.splice(i, 1); continue; }
        const x = p.a.x + (p.b.x - p.a.x) * p.t, y = p.a.y + (p.b.y - p.a.y) * p.t;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
        g.addColorStop(0, rgba(col.acc, 0.9)); g.addColorStop(1, rgba(col.acc, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      }
      // nodes
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const n of nodes) {
        const near = Math.max(0, 1 - Math.hypot(n.x - mouse.x, n.y - mouse.y) / 200);
        if (n.sym) {
          const pulse = 0.5 + 0.5 * Math.sin(t / 1400 + n.ph);
          ctx.font = `italic ${n.size}px "Instrument Serif", serif`;
          ctx.fillStyle = rgba(near > 0.05 ? col.acc : col.acc2, 0.28 + pulse * 0.25 + near * 0.5);
          ctx.fillText(n.sym, n.x, n.y);
        } else {
          ctx.fillStyle = near > 0.05 ? rgba(col.acc, 0.5 + near * 0.5) : rgba(col.text, col.light ? 0.35 : 0.28);
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + near * 1.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      raf = visible ? requestAnimationFrame(frame) : null;
    };

    const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
    recolor(); resize();
    addEventListener('resize', () => { resize(); if (reduced) frame(0); });
    cv.parentElement.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    cv.parentElement.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !reduced) start(); }).observe(cv);
    document.fonts && document.fonts.ready.then(() => reduced && frame(0));
    if (reduced) frame(0); else start();
    return { recolor: () => { recolor(); if (reduced) frame(0); } };
  })();
})();
