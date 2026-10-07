import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Auto-recover in production when a new version is deployed and a chunk hash changed
if (!import.meta.env.DEV) {
  window.addEventListener('vite:preloadError', (event: any) => {
    const lastReload = Number(sessionStorage.getItem('ges_last_chunk_reload') || 0);
    if (Date.now() - lastReload > 10000) {
      sessionStorage.setItem('ges_last_chunk_reload', String(Date.now()));
      event.preventDefault();
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

