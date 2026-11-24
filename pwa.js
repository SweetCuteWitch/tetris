'use strict';
// Установка игры как приложения (PWA) и офлайн-кеш.
(() => {
  const wrap = document.getElementById('installWrap');
  const btn = document.getElementById('installBtn');
  const help = document.getElementById('installHelp');
  const helpText = document.getElementById('installHelpText');

  const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isMacSafari = !isIOS && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua);
  const standalone = () =>
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    navigator.standalone === true;

  let deferred = null;
  const show = on => wrap.classList.toggle('hidden', !on);

  if (isHttp && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* офлайн-кеш не критичен */ });
  }

  // С file:// установка невозможна, а в уже установленном приложении кнопка не нужна.
  if (!isHttp || standalone()) { show(false); return; }

  // Браузеры без системного окна установки: показываем кнопку с инструкцией.
  show(isIOS || isAndroid || isMacSafari);

  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    show(true);
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    show(false);
  });

  function instructions() {
    if (isIOS) return 'Нажмите «Поделиться» (квадрат со стрелкой вверх) внизу экрана Safari, затем «На экран „Домой“».';
    if (isMacSafari) return 'В меню Safari выберите «Файл» → «Добавить в Dock».';
    return 'Откройте меню браузера (⋮) и выберите «Установить приложение» или «Добавить на главный экран».';
  }

  btn.addEventListener('click', async () => {
    btn.blur();
    if (deferred) {
      const ev = deferred;
      deferred = null;
      ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome === 'accepted') show(false);
      return;
    }
    helpText.textContent = instructions();
    help.hidden = false;
  });

  help.addEventListener('click', e => {
    if (e.target === help || e.target.closest('[data-close]')) help.hidden = true;
  });
})();
