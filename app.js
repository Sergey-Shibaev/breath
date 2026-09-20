(() => {
  'use strict';

  /* ---------- Данные ---------- */

  const STORAGE_KEY = 'dyhanie.v2';

  // Фазы идут по сторонам фигуры по часовой стрелке, начиная с левой.
  const PHASES = [
    { name: 'Вдох', setting: 'Вдох', min: 1 },
    { name: 'Задержка', setting: 'Задержка на вдохе', min: 0 },
    { name: 'Выдох', setting: 'Выдох', min: 1 },
    { name: 'Задержка', setting: 'Задержка на выдохе', min: 0 },
  ];
  const MAX_SECONDS = 60;

  // Стандартные программы: ритмы, которые повторяются в популярных дыхательных приложениях
  // и описаны в исследованиях медленного дыхания. Все без долгих задержек, кроме «Сна» (известное 4-7-8).
  const DEFAULTS = {
    selected: 'focus',
    proportional: true, // длина стороны пропорциональна времени фазы
    background: 'bubbles', // живой фон: id из папки backgrounds или 'none'
    sound: 'tone', // режим звука: id из папки sound или 'off'
    volume: 0.6,
    vibrate: false,
    programs: [
      { id: 'calm', name: 'Спокойствие', d: [4, 0, 6, 0], note: 'Когда тревожно или накопился стресс. Выдох чуть длиннее вдоха, 6 дыханий в минуту.' },
      { id: 'focus', name: 'Фокус', d: [4, 4, 4, 4], note: 'Перед важным делом или в напряжённый момент. Ровный «квадрат» помогает собраться.' },
      { id: 'relax', name: 'Расслабление', d: [4, 0, 8, 0], note: 'Снять напряжение после дня. Медленный выдох вдвое длиннее вдоха.' },
      { id: 'sleep', name: 'Сон', d: [4, 7, 8, 0], note: 'В постели перед сном, дыхание 4-7-8. Начните с 4–8 циклов, без усилия. Если задержка даётся тяжело — возьмите «Расслабление».' },
      { id: 'energy', name: 'Бодрость', d: [6, 0, 2, 0], note: 'Утром или при сонливости, 1–3 минуты. Вдох длинный и спокойный, не до упора; выдох короткий.' },
      { id: 'balance', name: 'Баланс', d: [5, 0, 5, 0], note: 'Ровное дыхание на каждый день: вдох и выдох по 5 секунд, минут пять. Медленно, но не глубоко.' },
    ],
  };

  let state = loadState();

  // Сохранённые данные могли быть повреждены или записаны старой версией — приводим к рабочему виду.
  function sanitizeProgram(p, index) {
    if (!p || typeof p !== 'object') return null;
    const d = PHASES.map((ph, i) => {
      const v = Math.round(Number(Array.isArray(p.d) ? p.d[i] : NaN));
      return Number.isFinite(v) ? Math.max(ph.min, Math.min(MAX_SECONDS, v)) : Math.max(ph.min, 4);
    });
    return {
      id: typeof p.id === 'string' && p.id ? p.id : `p${index}`,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 24) : 'Без названия',
      d,
      ...(typeof p.note === 'string' ? { note: p.note } : {}),
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const programs = saved && Array.isArray(saved.programs) ? saved.programs.map(sanitizeProgram).filter(Boolean) : [];
      if (programs.length) {
        return {
          selected: programs.some((p) => p.id === saved.selected) ? saved.selected : programs[0].id,
          proportional: typeof saved.proportional === 'boolean' ? saved.proportional : true,
          background: typeof saved.background === 'string' ? saved.background : DEFAULTS.background,
          sound: typeof saved.sound === 'string' ? saved.sound : DEFAULTS.sound,
          volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : DEFAULTS.volume,
          vibrate: saved.vibrate === true,
          programs,
        };
      }
    } catch {}
    return structuredClone(DEFAULTS);
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  const currentProgram = () => state.programs.find((p) => p.id === state.selected);
  const patternOf = (p) => p.d.join('–');

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- Элементы ---------- */

  const $ = (id) => document.getElementById(id);
  const main = $('main');
  const settings = $('settings');
  const trackSolid = $('trackSolid');
  const trackDashed = $('trackDashed');
  const activeSeg = $('activeSeg');
  const tail = $('tail');
  const dot = $('dot');
  const air = $('air');
  const lungsPlace = $('lungsPlace');
  const lungsBody = $('lungsBody');
  const labelEls = [...document.querySelectorAll('.side-label')];
  const hint = $('hint');
  const nowEl = $('now');
  const phaseName = $('phaseName');
  const countEl = $('count');
  const elapsedEl = $('elapsed');
  const cyclesEl = $('cycles');
  const toggleBtn = $('toggle');
  const list = $('programList');
  const proportionalSwitch = $('proportional');
  const vibrateSwitch = $('vibrate');
  const volumeInput = $('volume');
  const soundList = $('soundList');
  const backgroundList = $('backgroundList');

  const backdrop = BreathBackgroundHost.mount($('backdrop'));
  const sound = BreathSound.mount();

  /* ---------- Фигура ---------- */

  // Область сцены (viewBox 360×360), в которую вписывается фигура; снаружи остаётся место для подписей.
  const BOX = { x: 42, y: 42, w: 276, h: 276 };

  // Контур лёгких в координатах рисунка — по нему лёгкие вписываются внутрь фигуры.
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
  const LUNG_TOP = 31.9; // верхушки лёгких
  const LUNG_BOTTOM = 200; // нижний край лёгких

  let fig = null; // раскладка фигуры + расписание фаз
  let timingKey = null; // для какой программы и режима фигура разложена

  const fmt = (n) => n.toFixed(2);
  const line = (g) => `M ${fmt(g.x0)} ${fmt(g.y0)} L ${fmt(g.x1)} ${fmt(g.y1)}`;

  function layoutFigure() {
    const p = currentProgram();
    fig = BreathFigure.layout(p.d, { proportional: state.proportional, box: BOX, lungs: LUNGS, labelOffset: 20 });

    // Расписание: только стороны, на которых точка проводит время.
    // gap — длина пунктира перед стороной: его точка пролетает в начале фазы.
    const n = fig.segs.length;
    let t0 = 0;
    fig.timeline = [];
    fig.segs.forEach((g, idx) => {
      if (!g.timed) return;
      let gap = 0;
      for (let j = (idx - 1 + n) % n; j !== idx && !fig.segs[j].timed; j = (j - 1 + n) % n) gap += fig.segs[j].len;
      fig.timeline.push({ seg: g, t0, dur: p.d[g.phase], gap });
      t0 += p.d[g.phase];
    });
    fig.cycle = t0;

    // Линии
    const allTimed = fig.segs.every((g) => g.timed);
    let solid = '';
    let dashed = '';
    fig.segs.forEach((g, idx) => {
      if (!g.timed) {
        dashed += `${line(g)} `;
        return;
      }
      const prev = fig.segs[idx - 1];
      solid += prev && prev.timed ? `L ${fmt(g.x1)} ${fmt(g.y1)} ` : `${line(g)} `;
    });
    trackSolid.setAttribute('d', allTimed ? `${solid}Z` : solid);
    trackDashed.setAttribute('d', dashed);
    tail.setAttribute('d', `M ${fmt(fig.start[0])} ${fmt(fig.start[1])} ${fig.segs.map((g) => `L ${fmt(g.x1)} ${fmt(g.y1)}`).join(' ')} Z`);

    // Подписи сторон
    labelEls.forEach((el) => el.setAttribute('visibility', 'hidden'));
    for (const lb of fig.labels) {
      const el = labelEls[lb.phase];
      el.setAttribute('visibility', 'visible');
      el.setAttribute('x', fmt(lb.x));
      el.setAttribute('y', fmt(lb.y));
      el.setAttribute('transform', `rotate(${fmt(lb.angle)} ${fmt(lb.x)} ${fmt(lb.y)})`);
      el.textContent = `${PHASES[lb.phase].name} ${p.d[lb.phase]} с`;
      el.classList.toggle('skip', p.d[lb.phase] === 0);
    }

    // Лёгкие внутри фигуры
    const L = fig.lungs;
    lungsPlace.setAttribute('transform', `translate(${fmt(L.x)} ${fmt(L.y)}) scale(${L.scale.toFixed(4)})`);
  }

  function pointAt(s) {
    s = ((s % fig.total) + fig.total) % fig.total;
    for (const g of fig.segs) {
      if (s <= g.s0 + g.len) {
        const f = g.len ? (s - g.s0) / g.len : 0;
        return [g.x0 + (g.x1 - g.x0) * f, g.y0 + (g.y1 - g.y0) * f];
      }
    }
    return fig.start;
  }

  /* ---------- Отрисовка состояния ---------- */

  const TAIL = 44; // длина следа за точкой
  // За сколько секунд точка пролетает пунктир: быстро, чтобы лёгкие и точка расходились как можно меньше.
  const glideTime = (dur) => Math.min(0.25, 0.06 * dur);
  const START_DELAY = 120; // мс от нажатия до первого вдоха: звук успевает встать точно в начало
  const easeInOut = (p) => 0.5 - 0.5 * Math.cos(Math.PI * p);
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function place(s, level, tailLen) {
    const L = ((s % fig.total) + fig.total) % fig.total;
    const [x, y] = pointAt(L);
    dot.setAttribute('transform', `translate(${fmt(x)} ${fmt(y)})`);
    if (tailLen > 1) {
      tail.style.display = '';
      tail.style.strokeDasharray = `${fmt(tailLen)} ${fmt(fig.total - tailLen)}`;
      tail.style.strokeDashoffset = fmt(-(L - tailLen));
    } else {
      tail.style.display = 'none';
    }
    air.setAttribute('y', fmt(LUNG_BOTTOM - level * (LUNG_BOTTOM - LUNG_TOP)));
    const scale = reducedMotion.matches ? 1 : 0.97 + 0.05 * level;
    lungsBody.style.transform = `scale(${scale.toFixed(4)})`;
    backdrop.breath.level = level; // фон слегка «дышит» вместе с лёгкими
  }

  function setActive(entry) {
    activeSeg.setAttribute('d', entry ? line(entry.seg) : '');
    labelEls.forEach((el, i) => el.classList.toggle('active', !!entry && entry.seg.phase === i));
  }

  function applyProgram() {
    const p = currentProgram();
    $('programName').textContent = p.name;
    $('programPattern').textContent = patternOf(p);
    proportionalSwitch.setAttribute('aria-checked', String(state.proportional));
    // Фигуру и цикл трогаем, только если изменилось то, что на них влияет (а не, скажем, название).
    const key = `${p.id}|${p.d.join()}|${state.proportional}`;
    const changed = key !== timingKey;
    timingKey = key;
    if (changed) layoutFigure();
    if (!running) {
      place(0, level, 0);
    } else if (changed) {
      // новые длительности — цикл с начала
      startedAt = performance.now() + START_DELAY;
      shown = { entry: null, count: -1, sec: -1, cycles: -1 };
      sound.start(soundSession());
    }
  }

  // Расписание фаз для звука: те же моменты, что и у точки.
  function soundSession() {
    return {
      startedAt,
      timeline: fig.timeline.map((e) => ({ phase: e.seg.phase, t0: e.t0, dur: e.dur })),
      cycle: fig.cycle,
    };
  }

  // Рисунок вибрации для каждой фазы: вдох — короткий, задержка — два коротких, выдох — длинный, пауза — три коротких.
  const VIBRATION = [[60], [40, 80, 40], [200], [40, 80, 40, 80, 40]];

  /* ---------- Цикл дыхания ---------- */

  let running = false;
  let startedAt = 0;
  let rafId = 0;
  let level = 0; // наполненность лёгких, 0..1
  let shown = { entry: null, count: -1, sec: -1, cycles: -1 };
  let wakeLock = null;

  function frame(now) {
    if (!running) return;
    const t = Math.max(0, (now - startedAt) / 1000);
    const cycle = Math.floor(t / fig.cycle);
    const tc = t - cycle * fig.cycle;

    const tl = fig.timeline;
    let k = 0;
    while (k < tl.length - 1 && tc >= tl[k].t0 + tl[k].dur) k++;
    const entry = tl[k];
    const into = tc - entry.t0;
    const p = Math.min(1, into / entry.dur);

    // Точка идёт по стороне равномерно; пунктир перед стороной пролетает в самом начале фазы.
    let s = entry.seg.s0 + p * entry.seg.len;
    if (entry.gap && !(cycle === 0 && k === 0)) {
      s -= entry.gap * (1 - easeOut(Math.min(1, into / glideTime(entry.dur))));
    }

    // Лёгкие меняются равномерно на всём протяжении стороны — вместе с точкой.
    const phase = entry.seg.phase;
    level = phase === 0 ? p : phase === 1 ? 1 : phase === 2 ? 1 - p : 0;
    place(s, level, cycle === 0 ? Math.min(TAIL, Math.max(0, s)) : TAIL);

    const count = Math.max(1, Math.ceil(entry.dur - into));
    const sec = Math.floor(t);
    if (shown.entry !== entry) {
      shown.entry = entry;
      phaseName.textContent = PHASES[phase].name;
      setActive(entry);
      backdrop.breath.phase = phase;
      if (state.vibrate && navigator.vibrate) navigator.vibrate(VIBRATION[phase]);
    }
    if (shown.count !== count) {
      shown.count = count;
      countEl.textContent = count;
    }
    if (shown.sec !== sec) {
      shown.sec = sec;
      elapsedEl.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    }
    if (shown.cycles !== cycle) {
      shown.cycles = cycle;
      cyclesEl.textContent = `${cycle} ${plural(cycle, 'цикл', 'цикла', 'циклов')}`;
    }

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    startedAt = performance.now() + START_DELAY;
    shown = { entry: null, count: -1, sec: -1, cycles: -1 };
    main.classList.add('running');
    toggleBtn.textContent = 'Остановить';
    hint.hidden = true;
    nowEl.hidden = false;
    backdrop.breath.running = true;
    sound.start(soundSession()); // вызывается из нажатия — так браузер разрешает звук
    keepAwake(true);
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    sound.stop();
    if (navigator.vibrate) navigator.vibrate(0);
    backdrop.breath.running = false;
    backdrop.breath.phase = -1;
    main.classList.remove('running');
    toggleBtn.textContent = 'Начать';
    hint.hidden = false;
    nowEl.hidden = true;
    setActive(null);
    keepAwake(false);
    settle();
  }

  // После остановки: точка возвращается в левый нижний угол, лёгкие плавно опустошаются.
  function settle() {
    const from = level;
    const t0 = performance.now();
    dot.classList.remove('hop');
    void dot.getBoundingClientRect();
    dot.classList.add('hop');
    const step = (now) => {
      if (running) return;
      const p = Math.min(1, (now - t0) / 700);
      level = from * (1 - easeInOut(p));
      place(0, level, 0);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Не даём экрану погаснуть, пока идёт сессия.
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator) {
        const lock = await navigator.wakeLock.request('screen');
        if (!running) {
          lock.release(); // пока ждали разрешения, сессию уже остановили
          return;
        }
        const old = wakeLock;
        wakeLock = lock;
        if (old) old.release();
      } else if (!on && wakeLock) {
        const lock = wakeLock;
        wakeLock = null;
        await lock.release();
      }
    } catch {}
  }
  document.addEventListener('visibilitychange', () => {
    if (running && document.visibilityState === 'visible') {
      keepAwake(true);
      sound.wake();
    }
  });

  toggleBtn.addEventListener('click', () => (running ? stop() : start()));

  /* ---------- Настройки ---------- */

  function renderSettings() {
    const onlyOne = state.programs.length === 1;
    list.innerHTML = state.programs
      .map((p) => {
        if (p.id !== state.selected) {
          return `
          <div class="prog" data-id="${esc(p.id)}">
            <button class="prog-head" type="button" role="radio" aria-checked="false">
              <span class="glyph"></span>
              <span class="prog-name">${esc(p.name)}</span>
              <span class="prog-pattern">${patternOf(p)}</span>
            </button>
          </div>`;
        }
        const total = p.d.reduce((a, b) => a + b, 0);
        return `
          <div class="prog selected" data-id="${esc(p.id)}">
            <div class="prog-head">
              <button type="button" class="glyph" role="radio" aria-checked="true" aria-label="${esc(p.name)}"></button>
              <input class="name-input" value="${esc(p.name)}" maxlength="24" aria-label="Название программы" autocomplete="off">
              <span class="prog-pattern">${patternOf(p)}</span>
            </div>
            ${p.note ? `<p class="prog-note">${esc(p.note)}</p>` : ''}
            ${PHASES.map(
              (ph, i) => `
            <div class="row" data-i="${i}">
              <span class="side-icon s${i}"></span>
              <span class="row-label">${ph.setting}</span>
              <div class="stepper">
                <button type="button" data-step="-1" aria-label="${ph.setting}: меньше" ${p.d[i] <= ph.min ? 'disabled' : ''}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 12h12"/></svg>
                </button>
                <output>${p.d[i]}<small>с</small></output>
                <button type="button" data-step="1" aria-label="${ph.setting}: больше" ${p.d[i] >= MAX_SECONDS ? 'disabled' : ''}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>
                </button>
              </div>
            </div>`
            ).join('')}
            <div class="editor-foot">
              <span class="cycle">Один цикл — ${total} с</span>
              <button class="delete" type="button" ${onlyOne ? 'disabled' : ''}>Удалить программу</button>
            </div>
          </div>`;
      })
      .join('');
  }

  list.addEventListener('click', (e) => {
    const prog = e.target.closest('.prog');
    if (!prog) return;
    const program = state.programs.find((p) => p.id === prog.dataset.id);

    const stepBtn = e.target.closest('[data-step]');
    if (stepBtn) {
      const row = stepBtn.closest('.row');
      const i = Number(row.dataset.i);
      const next = Math.max(PHASES[i].min, Math.min(MAX_SECONDS, program.d[i] + Number(stepBtn.dataset.step)));
      if (next === program.d[i]) return;
      program.d[i] = next;
      // обновляем на месте, чтобы не терять фокус на кнопке
      row.querySelector('output').firstChild.nodeValue = next;
      row.querySelector('[data-step="-1"]').disabled = next <= PHASES[i].min;
      row.querySelector('[data-step="1"]').disabled = next >= MAX_SECONDS;
      if (stepBtn.disabled) row.querySelector('[data-step]:not(:disabled)').focus(); // кнопка упёрлась в предел — фокус на соседнюю
      prog.querySelector('.prog-pattern').textContent = patternOf(program);
      prog.querySelector('.cycle').textContent = `Один цикл — ${program.d.reduce((a, b) => a + b, 0)} с`;
      saveState();
      applyProgram();
      return;
    }

    if (e.target.closest('.delete')) {
      if (!confirm(`Удалить программу «${program.name}»?`)) return;
      state.programs = state.programs.filter((p) => p !== program);
      state.selected = state.programs[0].id;
      saveState();
      renderSettings();
      applyProgram();
      focusSelected();
      return;
    }

    if (e.target.closest('button.prog-head')) {
      state.selected = program.id;
      saveState();
      renderSettings();
      applyProgram();
      focusSelected();
    }
  });

  // После перерисовки списка возвращаем фокус на выбранную программу (важно для клавиатуры и TalkBack).
  function focusSelected() {
    const radio = list.querySelector('.prog.selected [role="radio"]');
    if (radio) radio.focus();
  }

  list.addEventListener('input', (e) => {
    if (!e.target.classList.contains('name-input')) return;
    const program = currentProgram();
    program.name = e.target.value.trim() || 'Без названия';
    e.target.closest('.prog').querySelector('[role="radio"]').setAttribute('aria-label', program.name);
    saveState();
    applyProgram();
  });

  $('addProgram').addEventListener('click', () => {
    const id = `p${Date.now().toString(36)}`;
    state.programs.push({ id, name: 'Моя программа', d: [4, 4, 4, 4] });
    state.selected = id;
    saveState();
    renderSettings();
    applyProgram();
    const input = list.querySelector('.name-input');
    input.scrollIntoView({ block: 'center' });
    input.select();
  });

  $('resetPrograms').addEventListener('click', () => {
    if (!confirm('Вернуть стандартные программы? Ваши программы и изменения будут удалены.')) return;
    const fresh = structuredClone(DEFAULTS);
    state.programs = fresh.programs;
    state.selected = fresh.selected;
    saveState();
    renderSettings();
    applyProgram();
  });

  proportionalSwitch.addEventListener('click', () => {
    state.proportional = !state.proportional;
    saveState();
    applyProgram();
  });

  /* ---------- Звук, вибрация, фон ---------- */

  function chipsHtml(items, selected) {
    return items
      .map((it) => `<button class="chip" type="button" role="radio" data-id="${esc(it.id)}" aria-checked="${it.id === selected}">${esc(it.name)}</button>`)
      .join('');
  }

  // Применяет выбранные фон, звук и громкость; вызывается при запуске и после каждого изменения.
  function applyOptions() {
    if (state.background !== 'none' && !BreathBackgrounds.get(state.background)) state.background = 'none';
    if (state.sound !== 'off' && !BreathSound.list().some((m) => m.id === state.sound)) state.sound = 'off';

    if (backdrop.id !== state.background) backdrop.set(state.background);
    document.body.classList.toggle('has-backdrop', state.background !== 'none');
    sound.setVolume(state.volume);
    sound.setMode(state.sound);

    soundList.innerHTML = chipsHtml([{ id: 'off', name: 'Без звука' }, ...BreathSound.list()], state.sound);
    backgroundList.innerHTML = chipsHtml([{ id: 'none', name: 'Без фона' }, ...BreathBackgrounds.list()], state.background);
    settings.classList.toggle('sound-off', state.sound === 'off');
    volumeInput.value = Math.round(state.volume * 100);
    vibrateSwitch.setAttribute('aria-checked', String(state.vibrate));
    vibrateSwitch.disabled = !navigator.vibrate;
  }

  function pickChip(e, key) {
    const chip = e.target.closest('.chip');
    if (!chip || chip.dataset.id === state[key]) return false;
    state[key] = chip.dataset.id;
    saveState();
    applyOptions();
    e.currentTarget.querySelector('[aria-checked="true"]').focus();
    return true;
  }

  soundList.addEventListener('click', (e) => {
    // сразу даём послушать выбранный звук (если сессия не идёт на этом экране)
    if (pickChip(e, 'sound') && state.sound !== 'off' && !running) sound.demo();
  });
  backgroundList.addEventListener('click', (e) => pickChip(e, 'background'));

  $('soundDemo').addEventListener('click', () => sound.demo());

  volumeInput.addEventListener('input', () => {
    state.volume = Number(volumeInput.value) / 100;
    sound.setVolume(state.volume);
    saveState();
  });

  vibrateSwitch.addEventListener('click', () => {
    state.vibrate = !state.vibrate;
    saveState();
    applyOptions();
    if (state.vibrate && navigator.vibrate) navigator.vibrate(VIBRATION[1]);
  });

  // Изменения из другого окна (например, второй экран на странице макета)
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const before = JSON.stringify([currentProgram(), state.proportional]);
    state = loadState();
    renderSettings();
    // цикл начинаем заново, только если изменилась сама программа, а не фон или звук
    if (JSON.stringify([currentProgram(), state.proportional]) !== before) applyProgram();
    applyOptions();
  });

  /* ---------- Переход между экранами ---------- */

  let openedInApp = false;
  let routeOpen = null;
  const embedded = window.self !== window.top; // страница макета: два экрана в одном окне делят общую историю

  function syncRoute() {
    const open = location.hash === '#settings';
    settings.classList.toggle('open', open);
    settings.inert = !open;
    main.inert = open;
    if (open && running) stop();
    if (!running) sound.stop(); // проба звука из настроек не продолжает играть на другом экране
    // при переходе ставим фокус на понятное место (кроме самого первого показа)
    if (routeOpen !== null && routeOpen !== open) (open ? $('back') : $('openSettings')).focus();
    routeOpen = open;
  }

  $('openSettings').addEventListener('click', (e) => {
    e.preventDefault();
    if (embedded) {
      location.replace('#settings'); // без записи в общую историю
      return;
    }
    openedInApp = true;
    location.hash = 'settings';
  });

  $('back').addEventListener('click', () => {
    if (openedInApp) {
      history.back();
    } else {
      history.replaceState(null, '', location.pathname + location.search);
      syncRoute();
    }
  });

  window.addEventListener('hashchange', syncRoute);

  /* ---------- Запуск ---------- */

  applyProgram();
  renderSettings();
  applyOptions();
  syncRoute();
  requestAnimationFrame(() => document.body.classList.remove('no-anim'));

  // Работа без интернета. На компьютере при разработке не включаем (иначе мешает кэш); проверить можно с ?sw=1.
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && (!local || location.search.includes('sw=1'))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
