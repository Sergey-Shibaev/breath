// Проверка геометрии фигуры на множестве программ. Запуск: node tests/figure.test.js
const assert = require('assert');
const F = require('../figure.js');

const BOX = { x: 42, y: 42, w: 276, h: 276 };
const LUNGS = {
  hull: [
    [92, 0], [108, 0], [150, 34], [178, 96], [187, 150], [184, 186],
    [166, 202], [34, 202], [16, 186], [13, 150], [22, 96], [50, 34],
  ],
  cx: 100,
  cy: 101,
  maxScale: 1.16,
  minScale: 0.5,
  margin: 12,
};

const breaths = [1, 2, 4, 5, 8, 10, 60];
const holds = [0, 1, 2, 4, 7, 16, 60];
let checked = 0;
let noFit = 0;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

for (const proportional of [true, false]) {
  for (const a of breaths) for (const b of holds) for (const c of breaths) for (const e of holds) {
    const d = [a, b, c, e];
    const tag = `${d.join('-')} ${proportional ? 'по времени' : 'квадрат'}`;
    const fig = F.layout(d, { proportional, box: BOX, lungs: LUNGS, labelOffset: 20 });

    // замкнутая непрерывная ломаная
    fig.segs.forEach((g, i) => {
      const next = fig.segs[(i + 1) % fig.segs.length];
      assert(near(g.x1, next.x0) && near(g.y1, next.y0), `${tag}: разрыв после отрезка ${i}`);
      for (const v of [g.x0, g.y0, g.x1, g.y1, g.len, g.s0]) assert(Number.isFinite(v), `${tag}: не число`);
      assert(g.x0 >= BOX.x - 1e-6 && g.x0 <= BOX.x + BOX.w + 1e-6, `${tag}: вышли за область по x`);
      assert(g.y0 >= BOX.y - 1e-6 && g.y0 <= BOX.y + BOX.h + 1e-6, `${tag}: вышли за область по y`);
    });

    // сторона с временем есть ровно у тех фаз, где секунд больше нуля
    for (let ph = 0; ph < 4; ph++) {
      const timed = fig.segs.filter((g) => g.timed && g.phase === ph);
      assert.strictEqual(timed.length, d[ph] > 0 ? 1 : 0, `${tag}: фаза ${ph}`);
      assert.strictEqual(fig.labels.filter((l) => l.phase === ph).length, 1, `${tag}: подпись фазы ${ph}`);
    }

    // по времени: длина каждой стороны = секунды × одна и та же скорость
    if (proportional) {
      for (const g of fig.segs) if (g.timed) assert(near(g.len / d[g.phase], fig.unit, 1e-6), `${tag}: пропорции`);
    }

    // направления: вдох вверх, задержка вправо, выдох вниз, задержка влево
    const dir = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] };
    for (const g of fig.segs) {
      if (!g.timed) continue;
      assert(near((g.x1 - g.x0) / g.len, dir[g.phase][0]) && near((g.y1 - g.y0) / g.len, dir[g.phase][1]), `${tag}: направление`);
    }

    // фигура — прямоугольник, обход строго по часовой стрелке: ни один отрезок не идёт назад
    const turn = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] };
    let side = 0;
    for (const g of fig.segs) {
      if (g.len < 1e-6) continue;
      const ux = (g.x1 - g.x0) / g.len;
      const uy = (g.y1 - g.y0) / g.len;
      while (side < 4 && !(near(ux, turn[side][0]) && near(uy, turn[side][1]))) side++;
      assert(side < 4, `${tag}: отрезок идёт не по ходу обхода`);
    }

    // лёгкие: размер в допустимых пределах; если поместились — контур целиком внутри фигуры
    const L = fig.lungs;
    assert(L.fits, `${tag}: лёгкие не поместились в фигуру`);
    assert(L.scale >= 1, `${tag}: лёгкие слишком мелкие (${L.scale.toFixed(2)})`);
    assert(L.scale >= LUNGS.minScale - 1e-9 && L.scale <= LUNGS.maxScale + 1e-9, `${tag}: масштаб лёгких`);
    if (L.fits) {
      const poly = fig.segs.map((g) => [g.x0, g.y0]);
      for (const [hx, hy] of LUNGS.hull) {
        assert(F.pointInPolygon(L.x + hx * L.scale, L.y + hy * L.scale, poly), `${tag}: лёгкие вне фигуры`);
      }
    } else {
      noFit++;
    }
    checked++;
  }
}

console.log(`Проверено раскладок: ${checked}. Лёгкие не поместились целиком (взят минимальный размер): ${noFit}.`);

for (const d of [[4, 4, 4, 4], [4, 7, 8, 0], [4, 0, 6, 0], [5, 0, 5, 0], [4, 2, 4, 2], [4, 16, 8, 0]]) {
  const fig = F.layout(d, { proportional: true, box: BOX, lungs: LUNGS, labelOffset: 20 });
  console.log(d.join('-').padEnd(10), `масштаб лёгких ${fig.lungs.scale.toFixed(2)}`, fig.lungs.fits ? '' : '(не поместились)');
}
