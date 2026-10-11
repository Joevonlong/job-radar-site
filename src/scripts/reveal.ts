// Logo reveal on the hero lockup: a port of the brand kit's reference timeline. frame(svg, t) is a pure function of time; the last frame equals the static logo.
// Runs once on load; with reduced motion the static logo is shown as is.

const R = { popEnd: 0.24, hubAt: 0.24, sweepStart: 0.36, turn: 1.2, decay: 0.1, shadowAt: 1.56, shadowDur: 0.14, typeAt: 1.7, typeStep: 0.055, blink: 0.1, end: 2.6 };
const SEQ = [1, 0.72, 0.46, 0.275]; // lit cell size by age step, as a share of a full lit cell
const REST: Record<string, number> = { '0': 1, '1': 0.72, '2': 0.46 }; // resting size of trail cells
const clamp = (x: number) => Math.min(Math.max(x, 0), 1);
const spring = (x: number) => {
  x = clamp(x);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const sweepEnd = R.sweepStart + R.turn;
const hitTime = (back: number) => (back === 0 ? sweepEnd : R.sweepStart + (1 - back / 360) * R.turn);

function frame(svg: SVGSVGElement, t: number) {
  const q = <T extends Element = SVGElement>(s: string) => svg.querySelector<T>(s) as unknown as (SVGElement & T) | null;
  const pop = spring(t / R.popEnd);
  for (const id of ['#jr-face', '#jr-rim']) {
    const el = q(id);
    if (!el) continue;
    el.style.transformBox = 'view-box';
    el.style.transformOrigin = '30px 30px';
    el.style.transform = `scale(${0.6 + 0.4 * pop})`;
    el.style.opacity = String(clamp(t / 0.08));
  }
  const hub = q('#jr-hub rect');
  if (hub) {
    hub.style.opacity = t < R.hubAt ? '0' : '1';
    hub.style.transform = `scale(${t < R.hubAt + 0.06 ? 0.5 : 1})`;
  }
  const tc = Math.min(t, sweepEnd);
  svg.querySelectorAll<SVGElement>('#jr-grid rect, [id^="jr-trail-"] rect').forEach((el) => {
    const back = Number(el.dataset.back);
    const tHit = hitTime(back);
    if (tc < tHit) {
      el.style.opacity = '0';
      return;
    }
    const s = SEQ[Math.min(Math.floor((tc - tHit) / R.decay + 1e-6), 3)];
    const rest = (el.dataset.step ?? '') in REST ? REST[el.dataset.step!] : 0.275;
    el.style.opacity = '1';
    el.style.transform = `scale(${Math.max(s, rest) / rest})`;
  });
  const blip = q('#jr-blip');
  if (blip) {
    const k = (t - hitTime((45 - Number(blip.dataset.a) + 360) % 360)) / 0.36;
    blip.style.opacity = k < 0 ? '0' : '1';
    blip.style.transform = `scale(${k < 0 ? 0 : spring(k)})`;
  }
  const sh = q('#jr-shadow');
  if (sh) {
    const k = clamp((t - R.shadowAt) / R.shadowDur);
    const e = 1 - Math.pow(1 - k, 3);
    sh.style.opacity = t < R.shadowAt ? '0' : '1';
    sh.style.transform = `translate(${-4 * (1 - e)}px,${-4 * (1 - e)}px)`;
  }
  const glyphs = Array.from(svg.querySelectorAll<SVGPathElement>('#jr-word path'));
  glyphs.forEach((g, i) => {
    g.style.opacity = t >= R.typeAt + i * R.typeStep ? '1' : '0';
  });
  const cur = q<SVGRectElement>('#jr-cursor');
  if (cur && glyphs.length) {
    const shown = glyphs.filter((g) => g.style.opacity === '1');
    const last = shown[shown.length - 1];
    const x = last ? last.getBBox().x + last.getBBox().width + 3 : glyphs[0].getBBox().x;
    const typed = R.typeAt + glyphs.length * R.typeStep + 0.1;
    const on = t >= R.typeAt && (t < typed || (t >= typed + R.blink && t < typed + 2 * R.blink));
    cur.setAttribute('x', String(x));
    cur.style.opacity = on ? '1' : '0';
  }
}

export function reveal(svg: SVGSVGElement) {
  const root = document.documentElement;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.remove('reveal-pending');
    return;
  }
  if (svg.querySelector('#jr-word') && !svg.querySelector('#jr-cursor')) {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.id = 'jr-cursor';
    r.setAttribute('y', '17');
    r.setAttribute('width', '11');
    r.setAttribute('height', '26');
    r.style.opacity = '0';
    svg.appendChild(r);
  }
  frame(svg, 0);
  root.classList.remove('reveal-pending');
  const t0 = performance.now();
  const loop = (now: number) => {
    const t = Math.min((now - t0) / 1000, R.end);
    frame(svg, t);
    if (t < R.end) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
