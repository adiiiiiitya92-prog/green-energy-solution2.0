import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Auto-recover if an outdated client requests a chunk that was updated in a new deployment
window.addEventListener('vite:preloadError', () => {
  console.warn('Vite preload error detected (new deployment). Reloading page...');
  window.location.reload();
});

window.addEventListener('error', (e) => {
  const msg = e?.message || '';
  if (
    msg.includes('dynamically imported module') ||
    msg.includes('Failed to load module script') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('MIME type of "text/html"')
  ) {
    const reloadKey = 'ges_mod_reload_' + window.location.pathname;
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1');
      console.warn('Module script MIME or chunk mismatch detected. Auto-reloading page...');
      window.location.reload();
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

