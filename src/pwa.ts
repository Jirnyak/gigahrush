export function registerPwaServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env?.DEV) {
    window.addEventListener('load', () => {
      const cacheStorage = 'caches' in window ? window.caches : undefined;
      void navigator.serviceWorker.getRegistrations()
        .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
        .then(() => cacheStorage?.keys() ?? [])
        .then(keys => Promise.all(keys.filter(key => key.startsWith('gigahrush-')).map(key => cacheStorage?.delete(key) ?? false)))
        .catch(() => {});
    }, { once: true });
    return;
  }
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  window.addEventListener('load', () => {
    try {
      void navigator.serviceWorker.register('./sw.js').then((registration) => {
        if (!registration) return;
        if (typeof registration.update === 'function') {
          void registration.update().catch(() => undefined);
        }
        if (typeof registration.addEventListener === 'function') {
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing || typeof installing.addEventListener !== 'function') return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'activated') {
                console.log('ServiceWorker updated and activated.');
              }
            });
          });
        }
      }, (err) => {
        console.error('ServiceWorker registration failed: ', err);
      });
    } catch (err) {
      console.error('ServiceWorker registration failed: ', err);
    }
  }, { once: true });
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return window.matchMedia?.('(display-mode: fullscreen)').matches === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
