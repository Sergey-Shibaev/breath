// Геометрия фигуры дыхания: по какой линии идёт точка и где внутри неё помещаются лёгкие.
// Чистые функции без DOM — работают и в браузере (window.BreathFigure), и в Node (для тестов).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BreathFigure = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-9;

  /**
   * Ломаная в условных единицах, ось y направлена вниз, старт в (0, 0) — левый нижний угол.
   * d = [вдох, задержка на вдохе, выдох, задержка на выдохе] в секундах.
   *
   * Обычный режим: квадрат, каждая сторона — одна фаза.
   * Режим «по времени»: 1 единица = 1 секунда. Вдох идёт вверх, задержка вправо, выдох вниз,
   * задержка влево. Сплошная часть стороны пропорциональна секундам фазы, остаток стороны — пунктир.
   * Фаза в 0 секунд времени не занимает: её сторона целиком пунктирная.
   *
   * phase: 0..3 — сторона этой фазы, -1 — пунктирный остаток стороны.
   * timed: true — точка идёт по отрезку всё время фазы; false — пунктир, точка его пролетает.
   */
  function unitSegments(d, proportional) {
    const [a, b, c, e] = d;
    const segs = [];
    let x = 0;
    let y = 0;
    const push = (phase, timed, nx, ny) => {
      segs.push({ phase, timed, x0: x, y0: y, x1: nx, y1: ny });
      x = nx;
      y = ny;
    };

    if (!proportional) {
      push(0, true, 0, -1);
      push(1, b > 0, 1, -1);
      push(2, true, 1, 0);
      push(3, e > 0, 0, 0);
      return segs;
    }

    // Всегда замкнутый прямоугольник W × H. Каждая сторона — сплошная часть длиной в секунды фазы
    // плюс пунктирный остаток. Вдох начинается в левом нижнем углу, выдох — в правом верхнем,
    // а сплошная часть каждой задержки ЗАКАНЧИВАЕТСЯ в углу: пунктир точка пролетает в начале задержки,
    // когда лёгкие не меняются, и вдох/выдох стартуют ровно из угла.
    let H = Math.max(a, c);
    let W = Math.max(b, e) || H;
    // Фигура не уже и не ниже, чем нужно лёгким: добавляется только пунктир, сплошные длины не меняются.
    W = Math.max(W, 0.82 * H);
    H = Math.max(H, 0.85 * W);

    push(0, true, 0, -a);
    if (H - a > EPS) push(-1, false, 0, -H);
    if (b > 0) {
      if (W - b > EPS) push(-1, false, W - b, -H);
      push(1, true, W, -H);
    } else {
      push(1, false, W, -H);
    }
    push(2, true, W, c - H);
    if (H - c > EPS) push(-1, false, W, 0);
    if (e > 0) {
      if (W - e > EPS) push(-1, false, e, 0);
      push(3, true, 0, 0);
    } else {
      push(3, false, 0, 0);
    }
    return segs;
  }

  function pointInPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0];
      const yi = poly[i][1];
      const xj = poly[j][0];
      const yj = poly[j][1];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const side = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const d1 = side(cx, cy, dx, dy, ax, ay);
    const d2 = side(cx, cy, dx, dy, bx, by);
    const d3 = side(ax, ay, bx, by, cx, cy);
    const d4 = side(ax, ay, bx, by, dx, dy);
    return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
  }

  /**
   * Самое крупное положение лёгких внутри фигуры.
   * L = { hull: [[x, y], ...] — контур лёгких в их собственных координатах, cx, cy — его центр,
   *       maxScale, minScale, margin — зазор до линии в пикселях }.
   */
  function fitLungs(segs, L) {
    const poly = segs.map((s) => [s.x0, s.y0]);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of poly) {
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const fits = (cx, cy, s) => {
      const pts = L.hull.map(([hx, hy]) => {
        const vx = hx - L.cx;
        const vy = hy - L.cy;
        const k = s + L.margin / (Math.hypot(vx, vy) || 1);
        return [cx + vx * k, cy + vy * k];
      });
      for (const [px, py] of pts) if (!pointInPolygon(px, py, poly)) return false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        for (const g of segs) {
          if (segmentsCross(p[0], p[1], q[0], q[1], g.x0, g.y0, g.x1, g.y1)) return false;
        }
      }
      return true;
    };

    const bestScaleAt = (cx, cy) => {
      if (!pointInPolygon(cx, cy, poly)) return 0;
      if (fits(cx, cy, L.maxScale)) return L.maxScale;
      let lo = 0;
      let hi = L.maxScale;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (fits(cx, cy, mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    };

    // Перебор центров по сетке, затем уточнение вокруг лучшего. При равном размере — ближе к середине.
    const candidates = [];
    const consider = (cx, cy) => {
      const s = bestScaleAt(cx, cy);
      if (s > 0) candidates.push({ s, cx, cy, dist: Math.hypot(cx - midX, cy - midY) });
    };
    const pick = () => {
      let top = 0;
      for (const c of candidates) top = Math.max(top, c.s);
      let chosen = { s: 0, cx: midX, cy: midY, dist: 0 };
      for (const c of candidates) {
        if (c.s >= top - 0.02 && (chosen.s === 0 || c.dist < chosen.dist)) chosen = c;
      }
      return chosen;
    };
    const N = 25; // нечётное число, чтобы в сетку попала точная середина
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        consider(minX + ((maxX - minX) * i) / (N - 1), minY + ((maxY - minY) * j) / (N - 1));
      }
    }
    let best = pick();
    if (best.s > 0 && best.s < L.maxScale) {
      const stepX = (maxX - minX) / (N - 1) / 4;
      const stepY = (maxY - minY) / (N - 1) / 4;
      const { cx, cy } = best;
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (i || j) consider(cx + i * stepX, cy + j * stepY);
      best = pick();
    }

    const scale = Math.max(L.minScale, best.s);
    return { x: best.cx - L.cx * scale, y: best.cy - L.cy * scale, scale, fits: best.s >= L.minScale };
  }

  /**
   * Раскладка фигуры в пикселях.
   * opts = { proportional, box: {x, y, w, h}, lungs: L (см. fitLungs), labelOffset }
   */
  function layout(d, opts) {
    const units = unitSegments(d, opts.proportional);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of units) {
      minX = Math.min(minX, s.x0, s.x1);
      maxX = Math.max(maxX, s.x0, s.x1);
      minY = Math.min(minY, s.y0, s.y1);
      maxY = Math.max(maxY, s.y0, s.y1);
    }
    const w = Math.max(maxX - minX, EPS);
    const h = Math.max(maxY - minY, EPS);
    const unit = Math.min(opts.box.w / w, opts.box.h / h);
    const ox = opts.box.x + (opts.box.w - w * unit) / 2 - minX * unit;
    const oy = opts.box.y + (opts.box.h - h * unit) / 2 - minY * unit;

    let s0 = 0;
    const segs = units.map((u) => {
      const g = {
        phase: u.phase,
        timed: u.timed,
        x0: ox + u.x0 * unit,
        y0: oy + u.y0 * unit,
        x1: ox + u.x1 * unit,
        y1: oy + u.y1 * unit,
      };
      g.len = Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
      g.s0 = s0;
      s0 += g.len;
      return g;
    });

    // Подписи: у середины стороны, снаружи фигуры, вдоль стороны.
    const offset = opts.labelOffset || 20;
    const labels = [];
    for (const g of segs) {
      if (g.phase < 0 || g.len < EPS) continue;
      const dx = (g.x1 - g.x0) / g.len;
      const dy = (g.y1 - g.y0) / g.len;
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (g.phase === 1 || g.phase === 3) {
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
      }
      labels.push({
        phase: g.phase,
        x: (g.x0 + g.x1) / 2 + dy * offset,
        y: (g.y0 + g.y1) / 2 - dx * offset,
        angle,
      });
    }

    return {
      segs,
      total: s0,
      start: [segs[0].x0, segs[0].y0],
      labels,
      lungs: fitLungs(segs, opts.lungs),
      unit,
    };
  }

  return { unitSegments, layout, fitLungs, pointInPolygon };
});
