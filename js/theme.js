/* Theme system.
   A theme carries two things: CSS custom properties for the page chrome, and a
   canvas palette the drawing code reads live, so switching restyles everything
   including what is painted on the overlay.

   Colours are plain strings rather than hue numbers so light themes work.
   `glow` scales every shadow blur, which is what actually separates a modern
   flat look from the old neon one. */

const SANS    = "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";
const DISPLAY = "'Space Grotesk', Inter, ui-sans-serif, system-ui, sans-serif";
const MONO    = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const RETRO   = "Orbitron, ui-monospace, monospace";

export const THEMES = [
  {
    id: 'aurora',
    name: 'Aurora',
    scheme: 'dark',
    swatch: ['#8b7dff', '#3ddad7'],
    css: {
      '--bg':        '#08090d',
      '--surface':   'rgba(21, 23, 32, 0.68)',
      '--surface-2': 'rgba(30, 33, 45, 0.85)',
      '--border':    'rgba(255, 255, 255, 0.09)',
      '--border-st': 'rgba(255, 255, 255, 0.18)',
      '--ink':       '#eef1f7',
      '--dim':       'rgba(238, 241, 247, 0.58)',
      '--faint':     'rgba(238, 241, 247, 0.32)',
      '--accent':    '#8b7dff',
      '--accent-2':  '#3ddad7',
      '--danger':    '#ff5c7a',
      '--scrim':     'rgba(8, 9, 13, 0.35)',
      '--shadow':    '0 8px 32px rgba(0, 0, 0, 0.5)',
      '--ring':      'rgba(139, 125, 255, 0.35)',
      '--radius':    '14px',
      '--font-sans': SANS,
      '--font-disp': DISPLAY,
      '--font-mono': MONO,
      '--video-opacity': '0.44',
      '--video-filter':  'saturate(0.62) contrast(1.06) brightness(0.86)',
    },
    canvas: {
      ink: '#eef1f7', dim: 'rgba(238,241,247,0.58)', faint: 'rgba(238,241,247,0.3)',
      hairline: 'rgba(238,241,247,0.14)',
      accent: '#8b7dff', accent2: '#3ddad7', info: '#5b8dff',
      success: '#4ade80', danger: '#ff5c7a', warn: '#f5b544', gold: '#ffd166',
      panel: 'rgba(14, 16, 23, 0.82)', overlay: 'rgba(6, 7, 10, 0.72)',
      ramp: ['#8b7dff', '#6f8bff', '#3ddad7'],
      palette: ['#8b7dff', '#3ddad7', '#5b8dff', '#f472b6', '#f5b544'],
      glow: 0.42, line: 1,
    },
    grain: false,
  },

  {
    id: 'paper',
    name: 'Paper',
    scheme: 'light',
    swatch: ['#e2593f', '#17706b'],
    css: {
      '--bg':        '#f7f5f1',
      '--surface':   'rgba(255, 255, 255, 0.78)',
      '--surface-2': 'rgba(255, 255, 255, 0.94)',
      '--border':    'rgba(23, 21, 15, 0.13)',
      '--border-st': 'rgba(23, 21, 15, 0.28)',
      '--ink':       '#17150f',
      '--dim':       'rgba(23, 21, 15, 0.74)',
      '--faint':     'rgba(23, 21, 15, 0.46)',
      '--accent':    '#e2593f',
      '--accent-2':  '#17706b',
      '--danger':    '#c0392b',
      '--scrim':     'rgba(247, 245, 241, 0.72)',
      '--shadow':    '0 6px 24px rgba(23, 21, 15, 0.12)',
      '--ring':      'rgba(226, 89, 63, 0.28)',
      '--radius':    '12px',
      '--font-sans': SANS,
      '--font-disp': DISPLAY,
      '--font-mono': MONO,
      '--video-opacity': '0.34',
      '--video-filter':  'grayscale(0.6) contrast(1.02) brightness(1.16)',
    },
    canvas: {
      ink: '#17150f', dim: 'rgba(23,21,15,0.74)', faint: 'rgba(23,21,15,0.44)',
      hairline: 'rgba(23,21,15,0.16)',
      accent: '#e2593f', accent2: '#17706b', info: '#2f5fa8',
      success: '#2f7d4f', danger: '#c0392b', warn: '#b7791f', gold: '#b7791f',
      panel: 'rgba(255, 255, 255, 0.9)', overlay: 'rgba(247, 245, 241, 0.82)',
      ramp: ['#1f1d17', '#8a4a3a', '#e2593f'],
      palette: ['#e2593f', '#17706b', '#b7791f', '#7c5cbf', '#2f7d4f'],
      glow: 0.06, line: 1.1,
    },
    grain: false,
  },

  {
    id: 'mono',
    name: 'Mono',
    scheme: 'dark',
    swatch: ['#ccff00', '#fafafa'],
    css: {
      '--bg':        '#0a0a0a',
      '--surface':   'rgba(255, 255, 255, 0.045)',
      '--surface-2': 'rgba(255, 255, 255, 0.09)',
      '--border':    'rgba(255, 255, 255, 0.14)',
      '--border-st': 'rgba(255, 255, 255, 0.3)',
      '--ink':       '#fafafa',
      '--dim':       'rgba(250, 250, 250, 0.55)',
      '--faint':     'rgba(250, 250, 250, 0.28)',
      '--accent':    '#ccff00',
      '--accent-2':  '#fafafa',
      '--danger':    '#ff4d4d',
      '--scrim':     'rgba(10, 10, 10, 0.42)',
      '--shadow':    '0 4px 20px rgba(0, 0, 0, 0.6)',
      '--ring':      'rgba(204, 255, 0, 0.3)',
      '--radius':    '4px',
      '--font-sans': SANS,
      '--font-disp': MONO,
      '--font-mono': MONO,
      '--video-opacity': '0.36',
      '--video-filter':  'grayscale(1) contrast(1.15) brightness(0.82)',
    },
    canvas: {
      ink: '#fafafa', dim: 'rgba(250,250,250,0.55)', faint: 'rgba(250,250,250,0.26)',
      hairline: 'rgba(250,250,250,0.16)',
      accent: '#ccff00', accent2: '#fafafa', info: '#8a8a8a',
      success: '#ccff00', danger: '#ff4d4d', warn: '#ffb020', gold: '#ffb020',
      panel: 'rgba(10, 10, 10, 0.86)', overlay: 'rgba(10, 10, 10, 0.78)',
      ramp: ['#fafafa', '#c8c8c8', '#ccff00'],
      palette: ['#ccff00', '#fafafa', '#8a8a8a', '#ff4d4d', '#ffb020'],
      glow: 0.14, line: 1,
    },
    grain: false,
  },

  {
    id: 'ember',
    name: 'Ember',
    scheme: 'dark',
    swatch: ['#ff8a3d', '#ff4d6d'],
    css: {
      '--bg':        '#100c0a',
      '--surface':   'rgba(38, 27, 22, 0.66)',
      '--surface-2': 'rgba(52, 37, 30, 0.86)',
      '--border':    'rgba(255, 200, 170, 0.14)',
      '--border-st': 'rgba(255, 200, 170, 0.3)',
      '--ink':       '#fdf3ec',
      '--dim':       'rgba(253, 243, 236, 0.6)',
      '--faint':     'rgba(253, 243, 236, 0.32)',
      '--accent':    '#ff8a3d',
      '--accent-2':  '#ff4d6d',
      '--danger':    '#ff4d6d',
      '--scrim':     'rgba(16, 12, 10, 0.38)',
      '--shadow':    '0 8px 30px rgba(0, 0, 0, 0.55)',
      '--ring':      'rgba(255, 138, 61, 0.32)',
      '--radius':    '16px',
      '--font-sans': SANS,
      '--font-disp': DISPLAY,
      '--font-mono': MONO,
      '--video-opacity': '0.42',
      '--video-filter':  'sepia(0.35) saturate(1.1) contrast(1.04) brightness(0.88)',
    },
    canvas: {
      ink: '#fdf3ec', dim: 'rgba(253,243,236,0.6)', faint: 'rgba(253,243,236,0.3)',
      hairline: 'rgba(253,243,236,0.14)',
      accent: '#ff8a3d', accent2: '#ff4d6d', info: '#ffc23d',
      success: '#4dd0a7', danger: '#ff4d6d', warn: '#ffc23d', gold: '#ffc23d',
      panel: 'rgba(20, 14, 11, 0.84)', overlay: 'rgba(16, 12, 10, 0.74)',
      ramp: ['#ffc23d', '#ff8a3d', '#ff4d6d'],
      palette: ['#ff8a3d', '#ff4d6d', '#ffc23d', '#c96bff', '#4dd0a7'],
      glow: 0.46, line: 1,
    },
    grain: false,
  },

  {
    id: 'neon',
    name: 'Neon',
    scheme: 'dark',
    swatch: ['#00ffc8', '#ff00ff'],
    css: {
      '--bg':        '#000000',
      '--surface':   'rgba(0, 255, 200, 0.07)',
      '--surface-2': 'rgba(0, 20, 18, 0.9)',
      '--border':    'rgba(0, 255, 200, 0.25)',
      '--border-st': 'rgba(0, 255, 200, 0.55)',
      '--ink':       '#ffffff',
      '--dim':       'rgba(0, 255, 200, 0.6)',
      '--faint':     'rgba(0, 255, 200, 0.35)',
      '--accent':    '#00ffc8',
      '--accent-2':  '#ff00ff',
      '--danger':    '#ff3c6e',
      '--scrim':     'rgba(0, 0, 0, 0.2)',
      '--shadow':    '0 0 26px rgba(0, 255, 200, 0.25)',
      '--ring':      'rgba(0, 255, 200, 0.4)',
      '--radius':    '6px',
      '--font-sans': SANS,
      '--font-disp': RETRO,
      '--font-mono': RETRO,
      '--video-opacity': '0.82',
      '--video-filter':  'none',
    },
    canvas: {
      ink: '#ffffff', dim: 'rgba(0,255,200,0.65)', faint: 'rgba(0,255,200,0.35)',
      hairline: 'rgba(0,255,200,0.16)',
      accent: '#00ffc8', accent2: '#ff00ff', info: '#00ccff',
      success: '#00ff88', danger: '#ff3c6e', warn: '#ffaa33', gold: '#ffd93d',
      panel: 'rgba(0, 0, 0, 0.6)', overlay: 'rgba(0, 0, 0, 0.62)',
      ramp: ['#00ffc8', '#00ccff', '#ff00ff'],
      palette: ['#00ffc8', '#ff00ff', '#00ccff', '#ffaa33', '#00ff88'],
      glow: 1, line: 1,
    },
    grain: true,
  },
];

/* colour helpers */

function hexToRgb(h) {
  const s = h.replace('#', '');
  const n = s.length === 3
    ? s.split('').map(c => c + c).join('')
    : s;
  const v = parseInt(n, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Parse '#rgb', '#rrggbb', 'rgb(...)' or 'rgba(...)' into [r,g,b]. */
function parse(c) {
  if (c[0] === '#') return hexToRgb(c);
  const m = c.match(/[\d.]+/g);
  return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [128, 128, 128];
}

/** Lighten with a positive amount, darken with a negative one. Range -1 to 1. */
export function shade(color, amt) {
  const v = parse(color);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  return 'rgb(' +
    Math.round(v[0] + (t - v[0]) * k) + ',' +
    Math.round(v[1] + (t - v[1]) * k) + ',' +
    Math.round(v[2] + (t - v[2]) * k) + ')';
}

/** Same colour at a given opacity. */
export function alpha(color, a) {
  const v = parse(color);
  return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + a + ')';
}

function mix(a, b, t) {
  const A = parse(a), B = parse(b);
  return 'rgb(' +
    Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
    Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
    Math.round(A[2] + (B[2] - A[2]) * t) + ')';
}

class ThemeManager {
  constructor() {
    this.themes = THEMES;
    this.index = 0;
    this.current = THEMES[0];
    this.c = THEMES[0].canvas;
    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }

  init() {
    const saved = localStorage.getItem('nha.theme');
    const i = this.themes.findIndex(t => t.id === saved);
    this.set(i >= 0 ? i : 0, true);
  }

  set(i, silent) {
    const t = this.themes[(i + this.themes.length) % this.themes.length];
    if (!t) return;
    this.index = this.themes.indexOf(t);
    this.current = t;
    this.c = t.canvas;

    const root = document.documentElement;
    for (const k in t.css) root.style.setProperty(k, t.css[k]);
    root.setAttribute('data-theme', t.id);
    root.setAttribute('data-scheme', t.scheme);
    document.body.classList.toggle('grain', !!t.grain);

    localStorage.setItem('nha.theme', t.id);
    if (!silent) this.listeners.forEach(fn => fn(t));
    return t;
  }

  next() { return this.set(this.index + 1); }

  /** Colour at position t along the theme ramp, t from 0 to 1. */
  rampAt(t) {
    const r = this.c.ramp;
    const x = Math.max(0, Math.min(0.9999, t)) * (r.length - 1);
    const i = Math.floor(x);
    return mix(r[i], r[i + 1], x - i);
  }

  /** Stable colour for a categorical index, used for fingers and balls. */
  paletteAt(i) {
    const p = this.c.palette;
    return p[((i % p.length) + p.length) % p.length];
  }

  get fdisp() { return this.current.css['--font-disp']; }
  get fmono() { return this.current.css['--font-mono']; }
  get fbody() { return this.current.css['--font-sans']; }
}

export const Theme = new ThemeManager();
