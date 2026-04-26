import { supabase } from './lib/supabase';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installRatingSync } from './lib/ratingSync';
import { installMealPlanSync } from './lib/mealPlanSync';

async function hydrateSession() {
  try {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      const raw = localStorage.getItem('offline-session');

      if (raw) {
        const cached = JSON.parse(raw);
        await supabase.auth.setSession(cached);
      }
    }
  } catch {
    // Never block app sta
  }
}

async function bootstrap() {
  await hydrateSession();

  installRatingSync();
  installMealPlanSync();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // ignore
      });
    });
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap();