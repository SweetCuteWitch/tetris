'use strict';
(() => {
  // ---------- Константы ----------
  const COLS = 10, ROWS = 20, CELL = 14, SCALE = 4;
  const BX = 4, BY = 4;                   // начало стакана
  const PX = BX + COLS * CELL + 6;        // начало боковой панели
  const PW = 72;
  const W = PX + PW + 4;                  // 226
  const H = BY + ROWS * CELL + 4;         // 288
  const COL = { bg: '#c5cf9c', off: '#b5c08b', mid: '#6f7c4c', dark: '#26301a' };

  const MODES = [
    { id: 'classic', name: 'КЛАССИКА', desc: ['Обычная игра'] },
    { id: 'shift',   name: 'СДВИГ',    desc: ['После каждой фигуры', 'стакан едет вправо'] },
    { id: 'rise',    name: 'ПОДЪЁМ',   desc: ['Снизу растут', 'новые ряды'] },
  ];

  // мс на одну клетку падения по уровням
  const GRAVITY = [800, 720, 630, 550, 470, 380, 300, 220, 140, 100,
                   85, 85, 85, 70, 70, 70, 55, 55, 55, 40,
                   40, 40, 40, 40, 40, 40, 40, 40, 40, 25];
  const SOFT_MS = 60;      // скорость при зажатой кнопке «вниз» (мс на клетку)
  const SOFT_LOCK_MS = 150; // фиксация на дне при зажатой кнопке «вниз»
  const LOCK_MS = 450;     // задержка перед фиксацией фигуры
  const DAS = 160, ARR = 45;
  const CLEAR_MS = 360;
  const OVER_ROW_MS = 45;
  const LINE_SCORE = [0, 40, 100, 300, 1200];

  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
  };
  // Смещения при повороте, по порядку. Сначала пробуем опустить фигуру
  // (чтобы она «заползала» в дыру), потом сдвинуть вбок, поднять — в последнюю очередь.
  const KICKS = [[0,0],[0,1],[-1,1],[1,1],[-1,0],[1,0],[-2,0],[2,0],[0,-1]];

  // ---------- Хранилище ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* нет доступа */ } },
  };
  const hiKey = m => 'brickfall.hi.' + MODES[m].id;

  // ---------- Холст ----------
  const cv = document.getElementById('screen');
  cv.width = W * SCALE;
  cv.height = H * SCALE;
  const ctx = cv.getContext('2d');
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

  // ---------- Состояние ----------
  let state = 'menu';             // menu | play | clear | pause | over
  let mode = store.get('brickfall.mode', 0);
  let startLevel = store.get('brickfall.level', 0);
  if (!(mode >= 0 && mode < MODES.length)) mode = 0;
  if (!(startLevel >= 0 && startLevel <= 9)) startLevel = 0;

  let board = emptyBoard();
  let cur = null, nextType = null, bag = [];
  let score = 0, lines = 0, level = startLevel, pieces = 0;
  let best = store.get(hiKey(mode), 0), newBest = false;
  let dropAcc = 0, lockAcc = 0, lockResets = 0, soft = false;
  let dirs = [], held = 0, dasAcc = 0;
  let shiftFx = 0;
  let riseAcc = 0, pendingRise = 0;
  let clearRows = [], clearAcc = 0, overAcc = 0;
  let blink = 0;

  function emptyBoard() { return Array.from({ length: ROWS }, () => new Array(COLS).fill(0)); }

  // ---------- Звук ----------
  let actx = null, muted = store.get('brickfall.mute', false);
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { actx = new AC(); } catch (e) { actx = null; } }
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, start, dur, vol = 0.05) {
    const t = actx.currentTime + start;
    const o = actx.createOscillator(), gn = actx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const SFX = {
    move:   [[220, 0, .03]],
    rotate: [[330, 0, .04]],
    lock:   [[110, 0, .06]],
    clear:  [[523, 0, .07], [659, .07, .07], [784, .14, .1]],
    quad:   [[523, 0, .07], [659, .07, .07], [784, .14, .07], [1047, .21, .22]],
    level:  [[392, 0, .08], [523, .08, .08], [659, .16, .08], [784, .24, .18]],
    shift:  [[150, .06, .04]],
    warn:   [[880, 0, .03]],
    rise:   [[90, 0, .12]],
    start:  [[440, 0, .06], [660, .07, .1]],
    pause:  [[660, 0, .05]],
    over:   [[392, 0, .15], [330, .15, .15], [262, .3, .15], [196, .45, .4]],
  };
  function sfx(name) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    for (const [f, s, d] of SFX[name]) tone(f, s, d);
  }

  // ---------- Фигуры ----------
  function takeFromBag() {
    if (!bag.length) {
      bag = Object.keys(SHAPES);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }

  // поворот по часовой стрелке
  function rotateCW(m) {
    const n = m.length;
    return m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
  }

  // поворот против часовой стрелки
  function rotateCCW(m) {
    const n = m.length;
    return m.map((row, y) => row.map((_, x) => m[x][n - 1 - y]));
  }

  function collides(m, px, py) {
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m.length; x++) {
        if (!m[y][x]) continue;
        const nx = px + x, ny = py + y;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function eachCell(p, fn) {
    for (let y = 0; y < p.m.length; y++)
      for (let x = 0; x < p.m.length; x++)
        if (p.m[y][x]) fn(p.x + x, p.y + y);
  }

  function resetLock() {
    if (lockResets < 15) { lockAcc = 0; lockResets++; }
  }

  function tryMove(dx, dy) {
    if (collides(cur.m, cur.x + dx, cur.y + dy)) return false;
    cur.x += dx;
    cur.y += dy;
    resetLock();
    return true;
  }

  // dir: 1 — по часовой, -1 — против часовой
  function rotate(dir) {
    if (cur.type === 'O') { sfx('rotate'); return; }
    const rm = dir > 0 ? rotateCW(cur.m) : rotateCCW(cur.m);
    for (const [kx, ky] of KICKS) {
      if (!collides(rm, cur.x + kx, cur.y + ky)) {
        cur.m = rm;
        cur.x += kx;
        cur.y += ky;
        resetLock();
        sfx('rotate');
        return;
      }
    }
  }

  // ---------- Ход игры ----------
  const isMode = id => MODES[mode].id === id;
  const gravityMs = () => GRAVITY[Math.min(level, GRAVITY.length - 1)];
  const riseInterval = () => Math.max(3500, 13000 - level * 850);

  function newGame() {
    board = emptyBoard();
    bag = [];
    score = 0; lines = 0; level = startLevel; pieces = 0;
    best = store.get(hiKey(mode), 0); newBest = false;
    dropAcc = 0; lockAcc = 0; soft = false;
    shiftFx = 0;
    riseAcc = 0; pendingRise = 0;
    if (isMode('rise')) for (let i = 0; i < 3; i++) addGarbage();
    nextType = takeFromBag();
    state = 'play';
    spawn();
    sfx('start');
  }

  function spawn() {
    const type = nextType;
    nextType = takeFromBag();
    const m = SHAPES[type].map(r => r.slice());
    let top = 0;
    while (m[top].every(v => !v)) top++;
    cur = { type, m, x: Math.floor((COLS - m.length) / 2), y: -top };
    dropAcc = 0; lockAcc = 0; lockResets = 0;
    if (collides(cur.m, cur.x, cur.y)) gameOver();
  }

  function lockPiece() {
    let out = false;
    eachCell(cur, (x, y) => { if (y < 0) out = true; else board[y][x] = 1; });
    soft = false;            // ускорение нужно нажать заново для следующей фигуры
    pieces++;
    if (out) { gameOver(); return; }
    cur = null;
    const full = [];
    for (let y = 0; y < ROWS; y++) if (board[y].every(v => v)) full.push(y);
    if (full.length) {
      clearRows = full;
      clearAcc = 0;
      state = 'clear';
      score += LINE_SCORE[full.length] * (level + 1);
      sfx(full.length === 4 ? 'quad' : 'clear');
    } else {
      sfx('lock');
      afterLock();
    }
  }

  function finishClear() {
    for (const y of clearRows) {
      board.splice(y, 1);
      board.unshift(new Array(COLS).fill(0));
    }
    const prev = level;
    lines += clearRows.length;
    level = Math.max(level, startLevel + Math.floor(lines / 10));
    if (level > prev) setTimeout(() => sfx('level'), 250);
    clearRows = [];
    state = 'play';
    afterLock();
  }

  function afterLock() {
    if (isMode('shift')) shiftBoard();
    if (isMode('rise')) {
      while (pendingRise > 0) {
        pendingRise--;
        if (!addGarbage()) { gameOver(); return; }
        sfx('rise');
      }
    }
    spawn();
  }

  // Весь стакан на клетку вправо; столбец, ушедший за правый край, появляется слева.
  function shiftBoard() {
    for (const row of board) row.unshift(row.pop());
    shiftFx = 400;
    sfx('shift');
  }

  function addGarbage() {
    if (board[0].some(v => v)) return false;
    board.shift();
    const row = new Array(COLS).fill(1);
    const holes = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < holes; i++) row[Math.floor(Math.random() * COLS)] = 0;
    board.push(row);
    return true;
  }

  function gameOver() {
    state = 'over';
    overAcc = 0;
    held = 0; dirs = []; soft = false;
    if (score > best) {
      best = score;
      newBest = true;
      store.set(hiKey(mode), score);
    }
    sfx('over');
  }

  const overDone = () => overAcc > ROWS * OVER_ROW_MS + 400;

  function updatePlay(dt) {
    // автоповтор движения вбок
    if (held) {
      dasAcc += dt;
      while (dasAcc >= DAS) {
        if (!tryMove(held, 0)) { dasAcc = DAS; break; }
        dasAcc -= ARR;
      }
    }

    // падение
    const grav = gravityMs();
    const interval = soft ? Math.min(SOFT_MS, grav) : grav;
    dropAcc += dt;
    while (dropAcc >= interval) {
      dropAcc -= interval;
      if (!collides(cur.m, cur.x, cur.y + 1)) {
        cur.y++;
        lockAcc = 0;
        if (soft) score += 1;
      } else {
        dropAcc = 0;
        break;
      }
    }

    // режим «Подъём»: таймер новых рядов
    if (isMode('rise')) {
      riseAcc += dt;
      const ri = riseInterval();
      if (riseAcc >= ri) { riseAcc -= ri; pendingRise++; sfx('warn'); }
    }

    // фиксация
    if (collides(cur.m, cur.x, cur.y + 1)) {
      lockAcc += dt;
      if (lockAcc >= (soft ? SOFT_LOCK_MS : LOCK_MS)) lockPiece();
    }
  }

  function update(dt) {
    blink += dt;
    if (shiftFx > 0) shiftFx -= dt;
    if (state === 'play') updatePlay(dt);
    else if (state === 'clear') { clearAcc += dt; if (clearAcc >= CLEAR_MS) finishClear(); }
    else if (state === 'over') overAcc += dt;
  }

  // ---------- Управление ----------
  function setHeld() {
    held = dirs.length ? dirs[dirs.length - 1] : 0;
  }

  function press(k) {
    audio();
    if (k === 'sound') {
      muted = !muted;
      store.set('brickfall.mute', muted);
      updateSoundBtn();
      if (!muted) sfx('rotate');
      return;
    }
    switch (state) {
      case 'menu':
        if (k === 'left' || k === 'right') {
          mode = (mode + (k === 'left' ? -1 : 1) + MODES.length) % MODES.length;
          best = store.get(hiKey(mode), 0);
          store.set('brickfall.mode', mode);
          sfx('move');
        } else if (k === 'up' || k === 'down') {
          startLevel = Math.max(0, Math.min(9, startLevel + (k === 'up' ? 1 : -1)));
          level = startLevel;
          store.set('brickfall.level', startLevel);
          sfx('move');
        } else if (k === 'a' || k === 'start') {
          newGame();
        }
        break;

      case 'play':
      case 'clear':
        if (k === 'left' || k === 'right') {
          const d = k === 'left' ? -1 : 1;
          dirs = dirs.filter(v => v !== d);
          dirs.push(d);
          setHeld();
          dasAcc = 0;
          if (state === 'play' && tryMove(d, 0)) sfx('move');
        } else if (state === 'play' && k === 'up') {
          rotate(-1);              // вверх — против часовой
        } else if (state === 'play' && k === 'a') {
          rotate(1);               // большая кнопка — по часовой
        } else if (state === 'play' && k === 'down') {
          soft = true;
          dropAcc = Math.max(dropAcc, SOFT_MS);
        } else if (k === 'start') {
          if (state === 'play') { state = 'pause'; held = 0; dirs = []; soft = false; sfx('pause'); }
        }
        break;

      case 'pause':
        if (k === 'start' || k === 'a') { state = 'play'; sfx('pause'); }
        break;

      case 'over':
        if (overDone() && (k === 'start' || k === 'a')) { state = 'menu'; level = startLevel; sfx('move'); }
        break;
    }
  }

  function release(k) {
    if (k === 'left' || k === 'right') {
      const d = k === 'left' ? -1 : 1;
      dirs = dirs.filter(v => v !== d);
      setHeld();
      dasAcc = 0;
    } else if (k === 'down') {
      soft = false;
    }
  }

  // клавиатура
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', KeyX: 'a', Space: 'a',
    ArrowDown: 'down', KeyS: 'down',
    Enter: 'start', KeyP: 'start', Escape: 'start',
    KeyM: 'sound',
  };
  addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (e.repeat) return;
    press(k);
  });
  addEventListener('keyup', e => {
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    release(k);
  });
  addEventListener('blur', () => { release('left'); release('right'); release('down'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') press('start');
  });

  const buzz = () => { if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* ignore */ } } };

  // кнопки на экране
  document.querySelectorAll('[data-key]').forEach(btn => {
    const k = btn.dataset.key;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
      btn.classList.add('pressed');
      buzz();
      press(k);
    });
    const up = () => {
      if (!btn.classList.contains('pressed')) return;
      btn.classList.remove('pressed');
      release(k);
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, up));
  });

  // крестовина: направление по положению пальца, можно скользить
  const dpad = document.getElementById('dpad');
  let dpadDir = null, dpadPointer = null;
  function dpadZone(e) {
    const r = dpad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.1) return dpadDir;   // мёртвая зона в центре
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  }
  function setDpad(dir) {
    if (dir === dpadDir) return;
    if (dpadDir) release(dpadDir);
    dpadDir = dir;
    if (dir) { dpad.dataset.dir = dir; buzz(); press(dir); }
    else delete dpad.dataset.dir;
  }
  dpad.addEventListener('pointerdown', e => {
    e.preventDefault();
    dpadPointer = e.pointerId;
    if (dpad.setPointerCapture) dpad.setPointerCapture(e.pointerId);
    setDpad(dpadZone(e));
  });
  dpad.addEventListener('pointermove', e => {
    if (e.pointerId !== dpadPointer) return;
    setDpad(dpadZone(e));
  });
  const dpadEnd = e => {
    if (e.pointerId !== dpadPointer) return;
    dpadPointer = null;
    setDpad(null);
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => dpad.addEventListener(ev, dpadEnd));
  document.addEventListener('contextmenu', e => e.preventDefault());

  const soundBtn = document.getElementById('soundBtn');
  function updateSoundBtn() { soundBtn.classList.toggle('off', muted); }
  updateSoundBtn();

  const led = document.getElementById('led');
  let ledOn = null;

  // ---------- Отрисовка ----------
  function drawCell(x, y, color, s = CELL) {
    const k = s / 14;
    ctx.fillStyle = color;
    ctx.fillRect(x + k, y + k, s - 2 * k, s - 2 * k);
    ctx.fillStyle = COL.bg;
    ctx.fillRect(x + 2.5 * k, y + 2.5 * k, s - 5 * k, s - 5 * k);
    ctx.fillStyle = color;
    ctx.fillRect(x + 4 * k, y + 4 * k, s - 8 * k, s - 8 * k);
  }

  function text(s, x, y, size = 7, align = 'left', color = COL.dark) {
    ctx.font = `bold ${size}px "Courier New", "Consolas", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  const pad = (n, len = 6) => String(n).padStart(len, '0');
  const blinkOn = (period = 500) => Math.floor(blink / period) % 2 === 0;

  function drawBoard() {
    const lit = board.map(r => r.map(v => (v ? 1 : 0)));
    if (cur && (state === 'play' || state === 'over')) {
      eachCell(cur, (x, y) => { if (y >= 0 && y < ROWS) lit[y][x] = 1; });
    }
    if (state === 'clear' && Math.floor(clearAcc / 90) % 2 === 1) {
      for (const y of clearRows) lit[y].fill(0);
    }
    if (state === 'over') {
      const n = Math.min(ROWS, Math.floor(overAcc / OVER_ROW_MS));
      for (let y = ROWS - n; y < ROWS; y++) lit[y].fill(1);
    }
    if (state === 'pause') for (const r of lit) r.fill(0);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        drawCell(BX + x * CELL, BY + y * CELL, lit[y][x] ? COL.dark : COL.off);
  }

  function clearBoardArea() {
    ctx.fillStyle = COL.bg;
    ctx.fillRect(BX, BY, COLS * CELL, ROWS * CELL);
  }

  function drawMenu() {
    clearBoardArea();
    const cx = BX + COLS * CELL / 2;
    text('BRICK', cx, 42, 20, 'center');
    text('FALL', cx, 62, 20, 'center');

    // декоративная фигурка
    const deco = [[0,1,0],[1,1,1]];
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 3; x++)
        if (deco[y][x]) drawCell(cx - 15 + x * 10, 72 + y * 10, COL.dark, 10);

    text('РЕЖИМ', cx, 112, 7, 'center', COL.mid);
    text('← ' + MODES[mode].name + ' →', cx, 126, 9, 'center');
    MODES[mode].desc.forEach((l, i) => text(l, cx, 140 + i * 9, 6.5, 'center', COL.mid));

    text('УРОВЕНЬ', cx, 174, 7, 'center', COL.mid);
    text('↓ ' + startLevel + ' ↑', cx, 189, 11, 'center');

    text('РЕКОРД', cx, 212, 7, 'center', COL.mid);
    text(pad(best), cx, 225, 10, 'center');

    if (blinkOn()) text('ЖМИ СТАРТ', cx, 258, 9, 'center');
  }

  function drawPause() {
    const cx = BX + COLS * CELL / 2;
    ctx.fillStyle = COL.bg;
    ctx.fillRect(BX + 14, BY + 115, COLS * CELL - 28, 50);
    ctx.strokeStyle = COL.dark;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(BX + 14, BY + 115, COLS * CELL - 28, 50);
    text('ПАУЗА', cx, BY + 140, 12, 'center');
    if (blinkOn()) text('ЖМИ СТАРТ', cx, BY + 155, 7, 'center', COL.mid);
  }

  function drawOver() {
    if (!overDone()) return;
    clearBoardArea();
    const cx = BX + COLS * CELL / 2;
    text('КОНЕЦ', cx, 60, 14, 'center');
    text('ИГРЫ', cx, 78, 14, 'center');
    text('ОЧКИ', cx, 112, 7, 'center', COL.mid);
    text(pad(score), cx, 127, 12, 'center');
    text('ЛИНИИ', cx, 148, 7, 'center', COL.mid);
    text(String(lines), cx, 162, 10, 'center');
    if (newBest && blinkOn(350)) {
      text('НОВЫЙ', cx, 192, 11, 'center');
      text('РЕКОРД!', cx, 206, 11, 'center');
    }
    if (blinkOn()) text('СТАРТ - МЕНЮ', cx, 258, 8, 'center');
  }

  function drawNext(x, y) {
    ctx.strokeStyle = COL.dark;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, 46, 46);
    if (!nextType || state === 'menu' || state === 'pause') return;
    const m = SHAPES[nextType];
    let r0 = 9, r1 = -1, c0 = 9, c1 = -1;
    m.forEach((row, ry) => row.forEach((v, rx) => {
      if (!v) return;
      r0 = Math.min(r0, ry); r1 = Math.max(r1, ry);
      c0 = Math.min(c0, rx); c1 = Math.max(c1, rx);
    }));
    const s = 10;
    const ox = x + 23.5 - ((c1 - c0 + 1) * s) / 2 - c0 * s;
    const oy = y + 23.5 - ((r1 - r0 + 1) * s) / 2 - r0 * s;
    m.forEach((row, ry) => row.forEach((v, rx) => {
      if (v) drawCell(ox + rx * s, oy + ry * s, COL.dark, s);
    }));
  }

  function drawPanel() {
    const x = PX;
    const shownBest = Math.max(best, score);
    text('ОЧКИ', x, 13, 7, 'left', COL.mid);
    text(pad(score), x, 25, 10);
    text('РЕКОРД', x, 41, 7, 'left', COL.mid);
    text(pad(shownBest), x, 53, 10);
    text('УРОВЕНЬ', x, 69, 7, 'left', COL.mid);
    text(String(level), x, 81, 10);
    text('ЛИНИИ', x, 97, 7, 'left', COL.mid);
    text(String(lines), x, 109, 10);
    text('СЛЕД.', x, 125, 7, 'left', COL.mid);
    drawNext(x, 130);

    // режим
    text(MODES[mode].name, x, 194, 7);
    const inGame = state !== 'menu';
    if (isMode('shift')) {
      text('КАЖДЫЙ ХОД', x, 206, 6, 'left', COL.mid);
      // стрелка мигает в момент сдвига, остальное время видна бледно
      const flash = inGame && shiftFx > 0 && Math.floor(shiftFx / 100) % 2 === 0;
      text('>>>', x, 224, 12, 'left', flash ? COL.dark : COL.off);
    } else if (isMode('rise')) {
      text('НОВЫЙ РЯД', x, 206, 6, 'left', COL.mid);
      const bw = PW - 6;
      ctx.strokeStyle = COL.dark;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, 211.5, bw, 7);
      const p = inGame ? Math.min(1, riseAcc / riseInterval()) : 0;
      ctx.fillStyle = COL.dark;
      ctx.fillRect(x + 2, 213, (bw - 3) * p, 4);
      if (pendingRise > 0 && blinkOn(200)) text('+' + pendingRise + ' РЯД', x, 234, 9);
    }

    text(muted ? '♪ ВЫКЛ' : '♪ ВКЛ', x, 280, 6.5, 'left', COL.mid);
  }

  function draw() {
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = COL.dark;
    ctx.lineWidth = 1;
    ctx.strokeRect(BX - 1.5, BY - 1.5, COLS * CELL + 3, ROWS * CELL + 3);

    if (state === 'menu') drawMenu();
    else {
      drawBoard();
      if (state === 'pause') drawPause();
      if (state === 'over') drawOver();
    }
    drawPanel();

    const on = state === 'play' || state === 'clear';
    if (on !== ledOn) { ledOn = on; led.classList.toggle('on', on); }
  }

  // ---------- Главный цикл ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(100, now - last);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
