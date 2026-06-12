import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, X } from 'lucide-react';

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_, reg) {
      if (reg) {
        // Poll for updates every 60 minutes while the tab is open
        setInterval(() => void reg.update(), 60 * 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm
        bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3.5
        flex items-center gap-3
        animate-slide-up"
      role="alert"
      aria-live="polite"
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-teal-500 flex items-center justify-center">
        <Download className="w-4 h-4 text-white" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Update available</p>
        <p className="text-xs text-gray-400 leading-tight mt-0.5">A new version of Plantiful is ready.</p>
      </div>

      <button
        onClick={() => void updateServiceWorker(true)}
        className="flex-shrink-0 bg-teal-500 hover:bg-teal-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
      >
        Update
      </button>

      <button
        onClick={() => setNeedRefresh(false)}
        className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition-colors p-1 -mr-1"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
