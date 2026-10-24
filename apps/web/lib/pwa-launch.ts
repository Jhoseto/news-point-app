/** Runs synchronously in <head>, before streamed page content can paint. */
export const PWA_LAUNCH_SCRIPT = `(() => {
  if (window.__npLaunch) return;
  const root = document.documentElement;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!(matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) || motion.matches) return;
  const started = performance.now();
  let ended = false, hydrated = false, artwork = false, leaveTimer, endTimer;
  const finish = () => {
    if (ended) return;
    ended = true;
    clearTimeout(leaveTimer);
    clearTimeout(endTimer);
    clearTimeout(safetyTimer);
    delete root.dataset.npLaunch;
    root.style.removeProperty('--np-launch-width');
    root.style.removeProperty('--np-launch-height');
    window.removeEventListener('pagehide', finish);
    document.removeEventListener('visibilitychange', onVisibility);
    motion.removeEventListener('change', onMotion);
  };
  const onVisibility = () => { if (document.hidden) finish(); };
  const onMotion = () => { if (motion.matches) finish(); };
  const reveal = () => {
    if (ended || !hydrated || !artwork || leaveTimer !== undefined) return;
    leaveTimer = setTimeout(() => {
      if (ended) return;
      root.dataset.npLaunch = 'leave';
      endTimer = setTimeout(finish, 400);
    }, Math.max(0, 2600 - (performance.now() - started)));
  };
  window.__npLaunch = { ready: () => { hydrated = true; reveal(); } };
  // Freeze the launch stage while system/browser bars settle; never recenter
  // or rescale the artwork on intermediate viewport resize notifications.
  root.style.setProperty('--np-launch-width', window.innerWidth + 'px');
  root.style.setProperty('--np-launch-height', window.innerHeight + 'px');
  root.dataset.npLaunch = 'play';
  // Independent of React: a failed/delayed bundle must never trap the reader.
  const safetyTimer = setTimeout(finish, 6000);
  window.addEventListener('pagehide', finish);
  document.addEventListener('visibilitychange', onVisibility);
  motion.addEventListener('change', onMotion);
  const logo = new Image();
  logo.onload = () => {
    Promise.resolve(logo.decode ? logo.decode() : undefined).catch(() => {}).then(() => { artwork = true; reveal(); });
  };
  logo.onerror = finish;
  logo.src = '/brand/pwa-launch-logo-1024.webp?v=3';
})();`;
