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

  // time: true — рекорд по времени (меньше — лучше), отдельно для каждого стартового уровня
  const MODES = [
    { id: 'classic', name: 'КЛАССИКА',   desc: ['Обычная игра'] },
    { id: 'shift',   name: 'СДВИГ',      desc: ['После каждой фигуры', 'стакан едет вправо'] },
    { id: 'rise',    name: 'ПОДЪЁМ',     desc: ['Снизу растут', 'новые ряды'] },
    { id: 'mirror',  name: 'ЗЕРКАЛО',    desc: ['Стакан отражается,', 'кнопки ← → меняются'] },
    { id: 'narrow',  name: 'УЗКИЙ',      desc: ['Каждые 10 линий', 'стакан сужается'] },
    { id: 'gravity', name: 'ГРАВИТАЦИЯ', desc: ['После линии блоки', 'осыпаются вниз'] },
    { id: 'weird',   name: 'КРИВЫЕ',     desc: ['Фигуры от 1', 'до 5 клеток'] },
    { id: 'sprint',  name: 'СПРИНТ 40',  desc: ['Убери 40 линий', 'как можно быстрее'], time: true },
    { id: 'dig',     name: 'РАСКОПКИ',   desc: ['Расчисти завал.', 'Уровень = высота'], time: true },
  ];
  const SPRINT_LINES = 40;
  const MIN_WIDTH = 6;          // «Узкий»: самый узкий стакан
  const FLIP_MS = 500;          // «Зеркало»: анимация отражения
  const SETTLE_MS = 35;         // «Гравитация»: шаг осыпания блоков

  // мс на одну клетку падения по уровням
  const GRAVITY = [800, 720, 630, 550, 470, 380, 300, 220, 140, 100,
                   85, 85, 85, 70, 70, 70, 55, 55, 55, 40,
                   40, 40, 40, 40, 40, 40, 40, 40, 40, 25];
  const SOFT_MS = 60;      // скорость при зажатой кнопке «вниз» (мс на клетку)
  const SOFT_LOCK_MS = 150; // фиксация на дне при зажатой кнопке «вниз»
  const DOUBLE_TAP_MS = 300; // два нажатия «вниз» быстрее этого — мгновенный сброс
  const LOCK_MS = 450;     // задержка перед фиксацией фигуры
  const DAS = 160, ARR = 45;
  const CLEAR_MS = 360;
  const OVER_ROW_MS = 45;
  const LINE_SCORE = [0, 40, 100, 300, 1200, 2000];   // 5 линий — только палкой из 5 клеток или каскадом

  const BASE = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
  };
  // Режим «Кривые»: маленькие фигуры и фигуры из 5 клеток
  const EXTRA = {
    o1: [[1]],
    d2: [[1,1],[0,0]],
    i3: [[0,0,0],[1,1,1],[0,0,0]],
    v3: [[1,0],[1,1]],
    P5: [[1,1,0],[1,1,0],[1,0,0]],
    U5: [[1,0,1],[1,1,1],[0,0,0]],
    T5: [[1,1,1],[0,1,0],[0,1,0]],
    V5: [[1,0,0],[1,0,0],[1,1,1]],
    W5: [[1,0,0],[1,1,0],[0,1,1]],
    X5: [[0,1,0],[1,1,1],[0,1,0]],
    L5: [[1,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    N5: [[1,1,0,0],[0,1,1,1],[0,0,0,0],[0,0,0,0]],
    I5: [[0,0,0,0,0],[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0],[0,0,0,0,0]],
  };
  const EXTRA_PER_BAG = 4;
  const SHAPES = { ...BASE, ...EXTRA };
  // Смещения при повороте, по порядку. Сначала пробуем опустить фигуру
  // (чтобы она «заползала» в дыру), потом сдвинуть вбок, поднять — в последнюю очередь.
  const KICKS = [[0,0],[0,1],[-1,1],[1,1],[-1,0],[1,0],[-2,0],[2,0],[0,-1]];

  // ---------- Хранилище ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* нет доступа */ } },
  };
  const isTimeMode = m => !!MODES[m].time;
  const hiKey = (m, lvl) => 'brickfall.hi.' + MODES[m].id + (isTimeMode(m) ? '.' + lvl : '');
  const loadBest = () => store.get(hiKey(mode, startLevel), 0);

  // ---------- Холст ----------
  const cv = document.getElementById('screen');
  cv.width = W * SCALE;
  cv.height = H * SCALE;
  const ctx = cv.getContext('2d');
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

  // ---------- Состояние ----------
  let state = 'menu';             // menu | play | clear | settle | flip | pause | over
  let mode = store.get('brickfall.mode', 0);
  let startLevel = store.get('brickfall.level', 0);
  if (!(mode >= 0 && mode < MODES.length)) mode = 0;
  if (!(startLevel >= 0 && startLevel <= 9)) startLevel = 0;

  let board = emptyBoard();
  let cur = null, nextType = null, bag = [];
  let score = 0, lines = 0, level = startLevel, pieces = 0;
  let best = loadBest(), newBest = false, won = false;
  let elapsed = 0;                              // время партии (для режимов на время)
  let chain = 0, chainShow = 0, chainFx = 0;    // каскады линий («Гравитация», «Узкий»)
  let settleAcc = 0;
  let mirrored = false, mirrorLeft = 0, flipAcc = 0;   // «Зеркало»
  let narrow = 0, narrowFx = 0;                 // «Узкий»: сколько столбцов закрыто стенками
  let dropAcc = 0, lockAcc = 0, lockResets = 0, soft = false;
  let lastDownAt = 0, lastDownPiece = null;   // для распознавания двойного нажатия «вниз»
  let wallHit = false;                          // фигура уже упёрлась вбок (чтобы не вибрировать каждый кадр)

  // ---------- Плавное движение ----------
  // Логика игры остаётся по клеткам; на экране фигура рисуется в позиции view,
  // которая плавно догоняет настоящую. Вниз фигура падает непрерывно.
  const SMOOTH_X_MS = 30;   // как быстро фигура доезжает до клетки по горизонтали
  const SMOOTH_Y_MS = 15;   // то же по вертикали (меньше — чтобы не отставала на высоких скоростях)
  let view = null;          // { x, y } — экранная позиция текущей фигуры в клетках (дробная)

  function updateView(dt) {
    if (!cur || !view) return;
    let ty = cur.y;
    // пока под фигурой свободно, рисуем её между клетками пропорционально времени до следующего шага
    if (state === 'play' && !collides(cur.m, cur.x, cur.y + 1)) {
      ty += Math.min(dropAcc / dropInterval(), 0.999);
    }
    const kx = 1 - Math.exp(-dt / SMOOTH_X_MS);
    const ky = 1 - Math.exp(-dt / SMOOTH_Y_MS);
    view.x += (cur.x - view.x) * kx;
    view.y += (ty - view.y) * ky;
    if (Math.abs(cur.x - view.x) < 0.01) view.x = cur.x;
    if (Math.abs(ty - view.y) < 0.01) view.y = ty;
  }

  // ---------- Вибрация ----------
  // Браузер не даёт менять силу вибрации, только длительность: чем дольше, тем ощутимее.
  // Работает на Android; iPhone вибрацию для сайтов не поддерживает.
  const VIBE = { button: 10, wall: 30, lock: 40, drop: 60 };   // мс
  function vibrate(ms) {
    if (!navigator.vibrate) return;
    try { navigator.vibrate(ms); } catch (e) { /* не поддерживается */ }
  }
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
    drop:   [[160, 0, .03], [70, .03, .1]],
    clear:  [[523, 0, .07], [659, .07, .07], [784, .14, .1]],
    quad:   [[523, 0, .07], [659, .07, .07], [784, .14, .07], [1047, .21, .22]],
    level:  [[392, 0, .08], [523, .08, .08], [659, .16, .08], [784, .24, .18]],
    shift:  [[150, .06, .04]],
    warn:   [[880, 0, .03]],
    rise:   [[90, 0, .12]],
    start:  [[440, 0, .06], [660, .07, .1]],
    pause:  [[660, 0, .05]],
    over:   [[392, 0, .15], [330, .15, .15], [262, .3, .15], [196, .45, .4]],
    win:    [[523, 0, .1], [659, .1, .1], [784, .2, .1], [1047, .3, .1], [784, .4, .08], [1047, .48, .35]],
  };
  function sfx(name) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    for (const [f, s, d] of SFX[name]) tone(f, s, d);
  }

  // ---------- Фигуры ----------
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Мешок: все 7 обычных фигур в случайном порядке; в «Кривых» к ним добавляются 4 необычные.
  function takeFromBag() {
    if (!bag.length) {
      bag = Object.keys(BASE);
      if (isMode('weird')) bag.push(...shuffle(Object.keys(EXTRA)).slice(0, EXTRA_PER_BAG));
      shuffle(bag);
    }
    return bag.pop();
  }

  // стенки режима «Узкий»: закрытые столбцы слева и справа
  const wallL = () => Math.ceil(narrow / 2);
  const wallR = () => Math.floor(narrow / 2);
  const isWall = x => x < wallL() || x >= COLS - wallR();

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
        if (nx < wallL() || nx >= COLS - wallR() || ny >= ROWS) return true;
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
  const dropInterval = () => (soft ? Math.min(SOFT_MS, gravityMs()) : gravityMs());
  const riseInterval = () => Math.max(3500, 13000 - level * 850);

  // «Зеркало»: через сколько фигур отражение (чем выше уровень, тем чаще)
  const mirrorEvery = () => Math.max(5, 10 - Math.floor(level / 2));
  // в «Спринте» и «Раскопках» скорость не растёт: уровень — это сложность всей партии
  const fixedLevel = () => isMode('sprint') || isMode('dig');

  function newGame() {
    board = emptyBoard();
    bag = [];
    score = 0; lines = 0; level = startLevel; pieces = 0;
    best = loadBest(); newBest = false; won = false;
    dropAcc = 0; lockAcc = 0; soft = false;
    shiftFx = 0;
    riseAcc = 0; pendingRise = 0;
    elapsed = 0; chain = 0; chainShow = 0; chainFx = 0;
    mirrored = false; mirrorLeft = mirrorEvery();
    narrow = 0; narrowFx = 0;
    if (isMode('rise')) for (let i = 0; i < 3; i++) addGarbage();
    if (isMode('dig')) fillDig(4 + startLevel);
    nextType = takeFromBag();
    state = 'play';
    spawn();
    sfx('start');
  }

  // «Раскопки»: снизу h рядов завала, в каждом одна дырка (не над дыркой соседнего ряда)
  function fillDig(h) {
    let prev = -1;
    for (let y = ROWS - h; y < ROWS; y++) {
      let hole;
      do hole = Math.floor(Math.random() * COLS); while (hole === prev);
      prev = hole;
      board[y] = new Array(COLS).fill(2);
      board[y][hole] = 0;
    }
  }
  const digLeft = () => board.filter(r => r.includes(2)).length;

  function spawn() {
    const type = nextType;
    nextType = takeFromBag();
    const m = SHAPES[type].map(r => r.slice());
    let top = 0;
    while (m[top].every(v => !v)) top++;
    const inner = COLS - wallL() - wallR();
    cur = { type, m, x: wallL() + Math.floor((inner - m.length) / 2), y: -top };
    dropAcc = 0; lockAcc = 0; lockResets = 0; wallHit = false;
    view = { x: cur.x, y: cur.y };   // новая фигура появляется сразу на месте, без подлёта
    if (collides(cur.m, cur.x, cur.y)) gameOver();
  }

  // Мгновенный сброс: фигура падает до упора и сразу ставится (2 очка за клетку).
  function hardDrop() {
    let n = 0;
    while (!collides(cur.m, cur.x, cur.y + 1)) { cur.y++; n++; }
    score += 2 * n;
    sfx('drop');
    lockPiece(true);
  }

  // hard = true — фигуру поставили мгновенным сбросом
  function lockPiece(hard = false) {
    let out = false;
    eachCell(cur, (x, y) => { if (y < 0) out = true; else board[y][x] = 1; });
    vibrate(hard ? VIBE.drop : VIBE.lock);
    soft = false;            // ускорение нужно нажать заново для следующей фигуры
    pieces++;
    if (out) { gameOver(); return; }
    cur = null;
    chain = 0;
    if (!fullRows().length && !hard) sfx('lock');
    resolve();
  }

  // заполненные ряды (в «Узком» считаются только открытые столбцы)
  function fullRows() {
    const full = [];
    for (let y = 0; y < ROWS; y++) {
      let ok = true;
      for (let x = wallL(); x < COLS - wallR(); x++) if (!board[y][x]) { ok = false; break; }
      if (ok) full.push(y);
    }
    return full;
  }

  // Убирает заполненные ряды; каскад (новые линии после осыпания или сужения) даёт множитель.
  function resolve() {
    const full = fullRows();
    if (full.length) {
      chain++;
      clearRows = full;
      clearAcc = 0;
      state = 'clear';
      score += LINE_SCORE[Math.min(full.length, 5)] * (level + 1) * chain;
      if (chain > 1) { chainShow = chain; chainFx = 1500; }
      sfx(full.length >= 4 || chain > 1 ? 'quad' : 'clear');
      return;
    }
    state = 'play';
    afterLock();
  }

  function finishClear() {
    for (const y of clearRows) {
      board.splice(y, 1);
      board.unshift(new Array(COLS).fill(0));
    }
    const prev = level;
    lines += clearRows.length;
    if (!fixedLevel()) level = Math.max(level, startLevel + Math.floor(lines / 10));
    if (level > prev) setTimeout(() => sfx('level'), 250);
    clearRows = [];
    if (isMode('narrow')) applyNarrow();
    if (isMode('gravity')) { state = 'settle'; settleAcc = 0; return; }
    resolve();
  }

  // «Узкий»: каждые 10 линий стакан теряет столбец (по очереди слева и справа)
  function applyNarrow() {
    const n = Math.min(COLS - MIN_WIDTH, Math.floor(lines / 10));
    if (n <= narrow) return;
    narrow = n;
    for (const row of board) for (let x = 0; x < COLS; x++) if (isWall(x)) row[x] = 0;
    narrowFx = 1500;
    sfx('shift');
  }

  // «Гравитация»: каждая висящая клетка опускается на одну клетку. false — всё уже лежит.
  function settleStep() {
    let moved = false;
    for (let y = ROWS - 2; y >= 0; y--)
      for (let x = 0; x < COLS; x++)
        if (board[y][x] && !board[y + 1][x]) {
          board[y + 1][x] = board[y][x];
          board[y][x] = 0;
          moved = true;
        }
    return moved;
  }

  function afterLock() {
    if (isMode('sprint') && lines >= SPRINT_LINES) { win(); return; }
    if (isMode('dig') && digLeft() === 0) { win(); return; }
    if (isMode('mirror') && --mirrorLeft <= 0) {
      // отражаем стакан; новая фигура появится после анимации
      for (const row of board) row.reverse();
      mirrored = !mirrored;
      mirrorLeft = mirrorEvery();
      held = 0; dirs = [];
      state = 'flip'; flipAcc = 0;
      sfx('shift');
      return;
    }
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
    won = false;
    held = 0; dirs = []; soft = false;
    // в режимах на время проигрыш рекорд не ставит
    if (!isTimeMode(mode) && score > best) {
      best = score;
      newBest = true;
      store.set(hiKey(mode, startLevel), score);
    }
    sfx('over');
  }

  // «Спринт» и «Раскопки»: цель достигнута
  function win() {
    state = 'over';
    won = true;
    overAcc = ROWS * OVER_ROW_MS;   // без анимации заполнения, только короткая пауза
    cur = null;
    held = 0; dirs = []; soft = false;
    if (!best || elapsed < best) {
      best = elapsed;
      newBest = true;
      store.set(hiKey(mode, startLevel), Math.round(elapsed));
    }
    sfx('win');
  }

  const overDone = () => overAcc > ROWS * OVER_ROW_MS + 400;

  // Выход в меню без перезагрузки. Очки прерванной партии тоже идут в рекорд (кроме режимов на время).
  function quitToMenu() {
    if (!isTimeMode(mode) && score > best) { best = score; store.set(hiKey(mode, startLevel), score); }
    state = 'menu';
    cur = null; view = null;
    held = 0; dirs = []; soft = false;
    clearRows = []; pendingRise = 0;
    narrow = 0; mirrored = false;
    level = startLevel;
    best = loadBest();
    sfx('move');
  }

  function updatePlay(dt) {
    // автоповтор движения вбок
    if (held) {
      dasAcc += dt;
      while (dasAcc >= DAS) {
        if (!tryMove(held, 0)) {
          // упёрлись при удержании — толчок один раз, а не каждый кадр
          if (!wallHit) { wallHit = true; vibrate(VIBE.wall); }
          dasAcc = DAS;
          break;
        }
        wallHit = false;
        dasAcc -= ARR;
      }
    }

    // падение
    const interval = dropInterval();
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

  // партия идёт (не меню, не пауза, не конец)
  const running = () => state === 'play' || state === 'clear' || state === 'settle' || state === 'flip';

  function update(dt) {
    blink += dt;
    if (shiftFx > 0) shiftFx -= dt;
    if (chainFx > 0) chainFx -= dt;
    if (narrowFx > 0) narrowFx -= dt;
    if (running()) elapsed += dt;
    if (state === 'play') updatePlay(dt);
    else if (state === 'clear') { clearAcc += dt; if (clearAcc >= CLEAR_MS) finishClear(); }
    else if (state === 'settle') {
      settleAcc += dt;
      while (state === 'settle' && settleAcc >= SETTLE_MS) {
        settleAcc -= SETTLE_MS;
        if (!settleStep()) resolve();   // всё осело — проверяем новые линии
      }
    }
    else if (state === 'flip') { flipAcc += dt; if (flipAcc >= FLIP_MS) { state = 'play'; spawn(); } }
    else if (state === 'over') overAcc += dt;
    updateView(dt);
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
          best = loadBest();
          store.set('brickfall.mode', mode);
          sfx('move');
        } else if (k === 'up' || k === 'down') {
          startLevel = Math.max(0, Math.min(9, startLevel + (k === 'up' ? 1 : -1)));
          level = startLevel;
          best = loadBest();
          store.set('brickfall.level', startLevel);
          sfx('move');
        } else if (k === 'a' || k === 'start') {
          newGame();
        }
        break;

      case 'play':
      case 'clear':
      case 'settle':
      case 'flip':
        if (k === 'left' || k === 'right') {
          const d = (k === 'left' ? -1 : 1) * (mirrored ? -1 : 1);   // «Зеркало»: кнопки меняются местами
          dirs = dirs.filter(v => v !== d);
          dirs.push(d);
          setHeld();
          dasAcc = 0;
          if (state === 'play') {
            if (tryMove(d, 0)) { sfx('move'); wallHit = false; }
            else { wallHit = true; vibrate(VIBE.wall); }   // врезались в стенку или блоки
          }
        } else if (state === 'play' && k === 'up') {
          rotate(-1);              // вверх — против часовой
        } else if (state === 'play' && k === 'a') {
          rotate(1);               // большая кнопка — по часовой
        } else if (state === 'play' && k === 'down') {
          const now = performance.now();
          if (lastDownPiece === cur && now - lastDownAt <= DOUBLE_TAP_MS) {
            lastDownPiece = null;
            hardDrop();              // двойное нажатие — фигура падает сразу
          } else {
            lastDownAt = now;
            lastDownPiece = cur;
            soft = true;             // одно нажатие — ускорение, пока кнопка зажата
            dropAcc = Math.max(dropAcc, SOFT_MS);
          }
        } else if (k === 'start' || k === 'menu') {
          // «МЕНЮ» во время игры сначала ставит паузу, чтобы не выйти случайно
          if (state === 'play') { state = 'pause'; held = 0; dirs = []; soft = false; sfx('pause'); }
        }
        break;

      case 'pause':
        if (k === 'start' || k === 'a') { state = 'play'; sfx('pause'); }
        else if (k === 'menu') quitToMenu();
        break;

      case 'over':
        if (k === 'menu' || (overDone() && (k === 'start' || k === 'a'))) quitToMenu();
        break;
    }
  }

  function release(k) {
    if (k === 'left' || k === 'right') {
      const d = (k === 'left' ? -1 : 1) * (mirrored ? -1 : 1);
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
    Enter: 'start', KeyP: 'start', Escape: 'menu',
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

  const buzz = () => vibrate(VIBE.button);

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
  // время в виде 1:23.45
  function fmtTime(ms) {
    const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, cs = Math.floor(ms / 10) % 100;
    return m + ':' + pad(s, 2) + '.' + pad(cs, 2);
  }
  const bestText = () => (isTimeMode(mode) ? (best ? fmtTime(best) : '-:--.--') : pad(best));
  const blinkOn = (period = 500) => Math.floor(blink / period) % 2 === 0;

  // клетка завала в «Раскопках»: сплошная, чтобы было видно, что осталось расчистить
  function drawRubble(x, y) {
    ctx.fillStyle = COL.dark;
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = COL.mid;
    ctx.fillRect(x + 4, y + 4, 2, 2);
    ctx.fillRect(x + 8, y + 8, 2, 2);
  }

  // стенка «Узкого» стакана — штриховка
  function drawWall(x) {
    const px = BX + x * CELL;
    ctx.fillStyle = COL.mid;
    ctx.fillRect(px, BY, CELL, ROWS * CELL);
    ctx.fillStyle = COL.off;
    for (let y = 0; y < ROWS * CELL; y += 6) ctx.fillRect(px, BY + y, CELL, 2);
  }

  function drawBoard() {
    let lit = board.map(r => r.slice());
    if (state === 'clear' && Math.floor(clearAcc / 90) % 2 === 1) {
      for (const y of clearRows) lit[y].fill(0);
    }
    if (state === 'over' && !won) {
      const n = Math.min(ROWS, Math.floor(overAcc / OVER_ROW_MS));
      for (let y = ROWS - n; y < ROWS; y++) lit[y].fill(1);
    }
    if (state === 'pause') for (const r of lit) r.fill(0);

    // «Зеркало»: стакан «переворачивается» — сжимается по ширине и раскрывается отражённым
    ctx.save();
    if (state === 'flip') {
      const t = Math.min(1, flipAcc / FLIP_MS);
      if (t < 0.5) lit = lit.map(r => r.slice().reverse());   // первая половина — ещё старый вид
      const sx = Math.max(0.04, Math.abs(1 - 2 * t));
      clearBoardArea();
      const cx = BX + COLS * CELL / 2;
      ctx.translate(cx, 0);
      ctx.scale(sx, 1);
      ctx.translate(-cx, 0);
    }
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (isWall(x)) continue;
        const px = BX + x * CELL, py = BY + y * CELL;
        if (lit[y][x] === 2) drawRubble(px, py);
        else drawCell(px, py, lit[y][x] ? COL.dark : COL.off);
      }
    ctx.restore();
    for (let x = 0; x < COLS; x++) if (isWall(x)) drawWall(x);
    if (cur && view && (state === 'play' || state === 'over')) drawPiece();
  }

  // Текущая фигура в плавной (дробной) позиции; то, что выше стакана, обрезается.
  function drawPiece() {
    ctx.save();
    ctx.beginPath();
    ctx.rect(BX, BY, COLS * CELL, ROWS * CELL);
    ctx.clip();
    for (let y = 0; y < cur.m.length; y++)
      for (let x = 0; x < cur.m.length; x++)
        if (cur.m[y][x]) drawCell(BX + (view.x + x) * CELL, BY + (view.y + y) * CELL, COL.dark);
    ctx.restore();
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

    text('РЕЖИМ ' + (mode + 1) + '/' + MODES.length, cx, 112, 7, 'center', COL.mid);
    text('← ' + MODES[mode].name + ' →', cx, 126, 9, 'center');
    MODES[mode].desc.forEach((l, i) => text(l, cx, 140 + i * 9, 6.5, 'center', COL.mid));

    text('УРОВЕНЬ', cx, 174, 7, 'center', COL.mid);
    text('↓ ' + startLevel + ' ↑', cx, 189, 11, 'center');

    text(isTimeMode(mode) ? 'РЕКОРД (УР. ' + startLevel + ')' : 'РЕКОРД', cx, 212, 7, 'center', COL.mid);
    text(bestText(), cx, 225, 10, 'center');

    if (blinkOn()) text('ЖМИ СТАРТ', cx, 258, 9, 'center');
  }

  function drawPause() {
    const cx = BX + COLS * CELL / 2;
    ctx.fillStyle = COL.bg;
    ctx.fillRect(BX + 10, BY + 105, COLS * CELL - 20, 70);
    ctx.strokeStyle = COL.dark;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(BX + 10, BY + 105, COLS * CELL - 20, 70);
    text('ПАУЗА', cx, BY + 128, 12, 'center');
    text('СТАРТ - ИГРАТЬ', cx, BY + 147, 7, 'center', blinkOn() ? COL.dark : COL.mid);
    text('МЕНЮ - ВЫЙТИ', cx, BY + 162, 7, 'center', COL.mid);
  }

  function drawOver() {
    if (!overDone()) return;
    clearBoardArea();
    const cx = BX + COLS * CELL / 2;
    if (won) text('ФИНИШ!', cx, 70, 16, 'center');
    else { text('КОНЕЦ', cx, 60, 14, 'center'); text('ИГРЫ', cx, 78, 14, 'center'); }
    if (isTimeMode(mode)) {
      text('ВРЕМЯ', cx, 112, 7, 'center', COL.mid);
      text(fmtTime(elapsed), cx, 127, 12, 'center');
    } else {
      text('ОЧКИ', cx, 112, 7, 'center', COL.mid);
      text(pad(score), cx, 127, 12, 'center');
    }
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
    const s = Math.max(c1 - c0, r1 - r0) >= 4 ? 8 : 10;   // фигуры из 5 клеток мельче, чтобы влезли
    const ox = x + 23.5 - ((c1 - c0 + 1) * s) / 2 - c0 * s;
    const oy = y + 23.5 - ((r1 - r0 + 1) * s) / 2 - r0 * s;
    m.forEach((row, ry) => row.forEach((v, rx) => {
      if (v) drawCell(ox + rx * s, oy + ry * s, COL.dark, s);
    }));
  }

  function drawPanel() {
    const x = PX;
    if (isTimeMode(mode)) {
      text('ВРЕМЯ', x, 13, 7, 'left', COL.mid);
      text(fmtTime(state === 'menu' ? 0 : elapsed), x, 25, 10);
      text('РЕКОРД', x, 41, 7, 'left', COL.mid);
      text(bestText(), x, 53, 10);
    } else {
      text('ОЧКИ', x, 13, 7, 'left', COL.mid);
      text(pad(score), x, 25, 10);
      text('РЕКОРД', x, 41, 7, 'left', COL.mid);
      text(pad(Math.max(best, score)), x, 53, 10);
    }
    text('УРОВЕНЬ', x, 69, 7, 'left', COL.mid);
    text(String(level), x, 81, 10);
    text('ЛИНИИ', x, 97, 7, 'left', COL.mid);
    text(isMode('sprint') ? lines + '/' + SPRINT_LINES : String(lines), x, 109, 10);
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
    } else if (isMode('mirror')) {
      text('ОТРАЖЕНИЕ', x, 206, 6, 'left', COL.mid);
      const flash = state === 'flip' && blinkOn(100);
      text(inGame ? 'ЧЕРЕЗ ' + mirrorLeft : 'ЧЕРЕЗ ' + mirrorEvery(), x, 220, 9, 'left', flash ? COL.off : COL.dark);
      text('КНОПКИ', x, 234, 6, 'left', COL.mid);
      text(mirrored ? '→ ←' : '← →', x + 30, 234, 8, 'left', mirrored && blinkOn(400) ? COL.mid : COL.dark);
    } else if (isMode('narrow')) {
      const wdt = COLS - narrow;
      text('ШИРИНА', x, 206, 6, 'left', COL.mid);
      text(String(wdt), x, 222, 12, 'left', narrowFx > 0 && blinkOn(100) ? COL.off : COL.dark);
      if (wdt > MIN_WIDTH) text('УЖЕ ЧЕРЕЗ ' + ((narrow + 1) * 10 - lines), x, 234, 6, 'left', COL.mid);
    } else if (isMode('gravity')) {
      text('БЛОКИ ПАДАЮТ', x, 206, 6, 'left', COL.mid);
      if (chainFx > 0 && blinkOn(150)) text('ЦЕПЬ x' + chainShow, x, 222, 10);
    } else if (isMode('weird')) {
      text('ФИГУРЫ', x, 206, 6, 'left', COL.mid);
      text('1-5 КЛЕТОК', x, 218, 7);
    } else if (isMode('sprint')) {
      text('ОСТАЛОСЬ ЛИНИЙ', x, 206, 6, 'left', COL.mid);
      text(String(Math.max(0, SPRINT_LINES - lines)), x, 224, 12);
    } else if (isMode('dig')) {
      text('РЯДОВ ЗАВАЛА', x, 206, 6, 'left', COL.mid);
      text(String(inGame ? digLeft() : 4 + startLevel), x, 224, 12);
    }
    if (isMode('narrow') && chainFx > 0 && blinkOn(150)) text('ЦЕПЬ x' + chainShow, x, 248, 8);

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

    const on = running();
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
