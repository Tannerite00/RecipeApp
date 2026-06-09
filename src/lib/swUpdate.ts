type UpdateCallback = () => void;

// Holds the waiting SW so we can message it when the user approves.
let _waitingWorker: ServiceWorker | null = null;
let _onUpdateAvailable: UpdateCallback | null = null;

/**
 * Register a callback that fires when a new SW version is waiting.
 * If a waiting worker already exists by the time this is called, the callback
 * fires immediately.
 */
export function onUpdateAvailable(cb: UpdateCallback) {
  _onUpdateAvailable = cb;
  if (_waitingWorker) cb();
}

/**
 * Tell the waiting SW to skip waiting, which triggers a controllerchange
 * event that reloads the page to pick up the new Vercel deployment.
 */
export function applyUpdate() {
  _waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
}

function trackWaiting(sw: ServiceWorker) {
  _waitingWorker = sw;
  _onUpdateAvailable?.();
}

/** Call once at app startup (from main.tsx). */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');

      // Reload the page once the new SW takes control so we get fresh assets.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });

      // A waiting worker might already exist if the page was reloaded without
      // the user accepting the last update prompt.
      if (reg.waiting && navigator.serviceWorker.controller) {
        trackWaiting(reg.waiting);
        return;
      }

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (
            installing.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            trackWaiting(installing);
          }
        });
      });

      // Poll for updates every 60 minutes while the tab is open.
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch {
      // SW registration failure is non-fatal.
    }
  });
}
