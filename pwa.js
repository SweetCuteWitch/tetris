'use strict';
// PWA: установка приложения, офлайн-кеш и обновление.
// Кнопка внизу слева работает в одном из режимов:
//   «УСТАНОВИТЬ» — игру можно установить как приложение;
//   «ОБНОВИТЬ»   — приложение уже работает из кеша, можно подтянуть последнюю версию;
//   «ОБНОВИТЬ!»  — найдена новая версия (кнопка мигает).
(() => {
  const wrap = document.getElementById('installWrap');
  const btn = document.getElementById('installBtn');
  const label = document.getElementById('installLabel');
  const help = document.getElementById('installHelp');
  const helpText = document.getElementById('installHelpText');

  const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
  const hasSW = isHttp && 'serviceWorker' in navigator;
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isMacSafari = !isIOS && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua);
  const standalone = () =>
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    navigator.standalone === true;

  let deferred = null;     // событие установки (Chrome/Edge/Android)
  let reg = null;          // регистрация service worker
  let waiting = null;      // скачанная новая версия, ждущая применения
  let busy = false;        // идёт операция, на кнопке временный текст
  let mode = 'none';

  // ---------- Кнопка ----------
  function canInstall() {
    return isHttp && !standalone() && (deferred || isIOS || isAndroid || isMacSafari);
  }

  function render() {
    if (waiting) mode = 'update';
    else if (canInstall()) mode = 'install';
    else if (hasSW && navigator.serviceWorker.controller) mode = 'update';
    else mode = 'none';

    wrap.classList.toggle('hidden', mode === 'none');
    btn.classList.toggle('pill-install', mode === 'install');
    btn.classList.toggle('pill-update', mode === 'update');
    btn.classList.toggle('ready', mode === 'update' && !!waiting);
    btn.setAttribute('aria-label', mode === 'install' ? 'Установить приложение' : 'Обновить приложение');
    if (!busy) label.textContent = mode === 'install' ? 'УСТАНОВИТЬ' : (waiting ? 'ОБНОВИТЬ!' : 'ОБНОВИТЬ');
  }

  function status(text, ms = 2000) {
    busy = true;
    label.textContent = text;
    if (ms) setTimeout(() => { busy = false; render(); }, ms);
  }

  btn.addEventListener('click', () => {
    btn.blur();
    if (busy) return;
    if (mode === 'install') install();
    else if (mode === 'update') update();
  });

  // ---------- Установка ----------
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    render();
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    render();
  });

  function instructions() {
    if (isIOS) return 'Нажмите «Поделиться» (квадрат со стрелкой вверх) внизу экрана Safari, затем «На экран „Домой“».';
    if (isMacSafari) return 'В меню Safari выберите «Файл» → «Добавить в Dock».';
    return 'Откройте меню браузера (⋮) и выберите «Установить приложение» или «Добавить на главный экран».';
  }

  async function install() {
    if (deferred) {
      const ev = deferred;
      deferred = null;
      ev.prompt();
      await ev.userChoice;
      render();
      return;
    }
    helpText.textContent = instructions();
    help.hidden = false;
  }

  help.addEventListener('click', e => {
    if (e.target === help || e.target.closest('[data-close]')) help.hidden = true;
  });

  // ---------- Офлайн и обновления ----------
  function setWaiting(w) {
    waiting = w;
    render();
  }

  function watchInstalling(w) {
    w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) setWaiting(w);
    });
  }

  function waitForInstall(w) {
    return new Promise(resolve => {
      if (w.state !== 'installing') return resolve();
      w.addEventListener('statechange', () => { if (w.state !== 'installing') resolve(); });
    });
  }

  function checkForUpdate() {
    if (reg && navigator.onLine) reg.update().catch(() => { /* нет сети — проверим позже */ });
  }

  function askWorker(msg) {
    return new Promise(resolve => {
      const ctl = navigator.serviceWorker.controller;
      if (!ctl) return resolve(false);
      const ch = new MessageChannel();
      ch.port1.onmessage = e => resolve(!!(e.data && e.data.ok));
      ctl.postMessage(msg, [ch.port2]);
      setTimeout(() => resolve(false), 20000);
    });
  }

  async function update() {
    if (waiting) {
      status('ОБНОВЛЯЮ…', 0);
      waiting.postMessage({ type: 'SKIP_WAITING' });   // после смены версии страница перезагрузится
      return;
    }
    if (!navigator.onLine) { status('НЕТ СЕТИ'); return; }
    status('ПРОВЕРКА…', 0);
    try {
      await reg.update();
      if (reg.installing) await waitForInstall(reg.installing);
      if (reg.waiting) {
        waiting = reg.waiting;
        status('ОБНОВЛЯЮ…', 0);
        waiting.postMessage({ type: 'SKIP_WAITING' });
        return;
      }
      // Новой версии нет — всё равно перекачиваем файлы, чтобы точно была последняя.
      if (await askWorker({ type: 'REFRESH' })) location.reload();
      else { busy = false; status('НЕТ СЕТИ'); }
    } catch (e) {
      busy = false;
      status('НЕТ СЕТИ');
    }
  }

  if (hasSW) {
    let hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Первая установка кеша — перезагружать не нужно, просто показываем кнопку.
      if (!hadController) { hadController = true; render(); return; }
      if (reloading) return;
      reloading = true;
      location.reload();
    });

    navigator.serviceWorker.register('sw.js').then(r => {
      reg = r;
      if (r.waiting && navigator.serviceWorker.controller) setWaiting(r.waiting);
      if (r.installing) watchInstalling(r.installing);
      r.addEventListener('updatefound', () => watchInstalling(r.installing));
      checkForUpdate();
    }).catch(() => { /* офлайн-кеш недоступен — игра всё равно работает */ });

    // Проверяем обновления, когда приложение снова открывают.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
    addEventListener('online', checkForUpdate);
  }

  render();
})();
