/* Visitor globe: renders assets/v2/visitors.json (updated daily by
   .github/workflows/visitors.yml from Google Analytics) on a cobe WebGL globe. */
import createGlobe from 'https://cdn.jsdelivr.net/npm/cobe@0.6.5/+esm';

const canvas = document.getElementById('globe');
const box = document.getElementById('globeBox');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('en-US');

const THEMES = {
  dark: {
    dark: 1, diffuse: 1.2, mapBrightness: 5.5, mapBaseBrightness: 0,
    baseColor: [0.32, 0.31, 0.3], markerColor: [0.98, 0.72, 0.26], glowColor: [0.16, 0.14, 0.11],
  },
  light: {
    dark: 0, diffuse: 1.3, mapBrightness: 7, mapBaseBrightness: 0,
    baseColor: [1, 1, 1], markerColor: [0.78, 0.48, 0.05], glowColor: [0.93, 0.9, 0.84],
  },
};

let points = [];
let globe = null;
let phi = 0.6;            // longitude rotation
let theta = 0.28;         // tilt
let dragX = null, dragPhi = 0, velocity = 0;
let width = 0;

const toMarkers = () => {
  if (!points.length) return [];
  const max = Math.log(points[0].users + 1);
  return points.map((p) => ({
    location: [p.lat, p.lng],
    size: 0.025 + 0.075 * (Math.log(p.users + 1) / max),
  }));
};

const build = () => {
  if (globe) globe.destroy();
  width = canvas.offsetWidth;
  const theme = THEMES[root.getAttribute('data-theme')] || THEMES.dark;
  globe = createGlobe(canvas, {
    devicePixelRatio: Math.min(devicePixelRatio || 1, 2),
    width: width * 2,
    height: width * 2,
    phi, theta,
    mapSamples: 18000,
    markers: toMarkers(),
    ...theme,
    onRender: (state) => {
      if (dragX === null) {
        if (!reduced) phi += 0.0028 + velocity;
        velocity *= 0.95;
      }
      state.phi = phi;
      state.theta = theta;
      state.width = width * 2;
      state.height = width * 2;
    },
  });
  requestAnimationFrame(() => canvas.classList.add('is-ready'));
};

/* drag to spin (horizontal only, keeps vertical page scroll on touch) */
canvas.addEventListener('pointerdown', (e) => {
  dragX = e.clientX; dragPhi = phi; velocity = 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (dragX === null) return;
  const next = dragPhi + (e.clientX - dragX) / 180;
  velocity = (next - phi) * 0.15;
  phi = next;
});
const release = () => { dragX = null; };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

/* resize + theme changes */
let rT;
addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { width = canvas.offsetWidth; }, 100); });
new MutationObserver(() => globe && build()).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

/* stats panel */
const fillStats = (d) => {
  $('gVisitors').textContent = d.visitors ? fmt.format(d.visitors) : '—';
  $('gCities').textContent = d.cities ? fmt.format(d.cities) : '—';
  $('gCountries').textContent = d.countries ? fmt.format(d.countries) : '—';
  if (points.length) {
    const top = points.slice(0, 6);
    const max = top[0].users;
    $('gTop').innerHTML = top.map((p) =>
      `<li style="--w:${(p.users / max).toFixed(3)}"><span>${esc(p.city)}<small>${esc(p.country)}</small></span><b>${fmt.format(p.users)}</b><i></i></li>`
    ).join('');
  }
  if (d.updated) $('gUpdated').textContent = `city-level · aggregated from Google Analytics · updated ${d.updated}`;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* only spin up WebGL once the section is near the viewport */
new IntersectionObserver(async ([e], obs) => {
  if (!e.isIntersecting) return;
  obs.disconnect();
  try {
    // Bot commits do not trigger a branch-based GitHub Pages build.
    const latestData = 'https://raw.githubusercontent.com/zyni2001/zyni2001.github.io/master/assets/v2/visitors.json';
    const readData = async (url) => {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Visitor data request failed: ${response.status}`);
      return response.json();
    };
    const data = await readData(latestData).catch(() => readData('assets/v2/visitors.json'));
    points = (data.points || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    fillStats(data);
  } catch (err) {
    console.warn('visitor data unavailable', err);
  }
  build();
}, { rootMargin: '300px' }).observe(box);
