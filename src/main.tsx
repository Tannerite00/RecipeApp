import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installSyncManager } from './lib/syncManager';

installSyncManager();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

const CLEAN_VERSION = 'v2';

const current = localStorage.getItem('cache-version');

if (current !== CLEAN_VERSION) {
  localStorage.removeItem('detail-meal-plans');
  localStorage.removeItem('meal-plans');
  localStorage.setItem('cache-version', CLEAN_VERSION);
}
